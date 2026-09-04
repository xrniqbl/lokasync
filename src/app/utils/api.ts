import { projectId } from "/utils/supabase/info";

const BASE = `https://${projectId}.supabase.co/functions/v1/server`;

// When a user is signed in, every request carries their JWT so the server can
// enforce plan entitlements. AuthContext keeps this in sync with the session.
let userAccessToken: string | null = null;
export const setApiAccessToken = (token: string | null) => {
  userAccessToken = token;
};

// Endpoints that do not require a Bearer token (server whitelists these too).
const PUBLIC_PATHS = ["/plans", "/status"];

// Called once on 401 so the whole app can react (sign out + redirect) instead
// of every component handling expired tokens independently. Wired up in
// main.tsx; defaults to a no-op so this module stays side-effect free.
let onUnauthorized: (() => void) | null = null;
export const registerUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

/** Error thrown for non-2xx responses; `code` carries the server error code. */
export class ApiError extends Error {
  status: number;
  code: string | null;
  /** Optional invitation token carried by `pending_invite` responses. */
  token?: string;
  constructor(message: string, status: number, code: string | null, token?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.token = token;
  }
}

// ── Request deduplication + short-lived cache ────────────────────────────────
// GET requests are deduplicated: if the same path is in-flight, the caller
// shares the pending promise instead of firing a second request. Results are
// cached for a short TTL to avoid redundant round-trips during realtime
// refetch bursts. Mutations (POST/PUT/DELETE/PATCH) always bypass the cache
// and invalidate cached entries for the same path.

const CACHE_TTL_MS = 2000; // 2s — enough to coalesce realtime refetch bursts
const inflight = new Map<string, Promise<unknown>>();
const cache = new Map<string, { data: unknown; expiry: number }>();

function cacheKey(path: string, method: string): string {
  return `${method}:${path}`;
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  // Skip the Authorization header for genuinely public routes; otherwise the
  // server requires a valid Bearer token. We no longer fall back to the anon
  // key as a fake credential — a logged-out caller must hit 401, not silently
  // masquerade as authenticated against routes that happen to skip the check.
  // The invitation preview (GET /invitations/:token) is public, but accepting
  // (POST .../accept) still needs auth — match the preview shape precisely.
  const method = (opts.method ?? "GET").toUpperCase();
  const key = cacheKey(path, method);

  // For GET requests: return cached result if fresh, or share in-flight promise
  if (method === "GET") {
    const cached = cache.get(key);
    if (cached && cached.expiry > Date.now()) return cached.data as T;
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
  }

  // For mutations: invalidate any cached GET for this path
  if (method !== "GET") {
    cache.delete(cacheKey(path, "GET"));
  }

  const promise = doRequest<T>(path, opts, method);

  if (method === "GET") {
    inflight.set(key, promise);
    promise.then(
      (data) => {
        cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
        inflight.delete(key);
      },
      () => { inflight.delete(key); },
    );
  }

  return promise;
}

async function doRequest<T>(path: string, opts: RequestInit, method: string): Promise<T> {
  const isInvitePreview = method === "GET" && /^\/invitations\/[^/]+$/.test(path);
  const isPublic =
    isInvitePreview || PUBLIC_PATHS.some((p) => path === p || path.startsWith(p));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (!isPublic) {
    // Honour an explicitly-provided Bearer token (e.g. passed by AuthContext
    // before the global token has been set) while still falling back to the
    // module-level token. This eliminates startup race-condition 401s.
    const authHeader =
      (opts.headers as Record<string, string> | undefined)?.Authorization ??
      (opts.headers as Record<string, string> | undefined)?.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : userAccessToken;
    if (!token) {
      throw new ApiError(
        "Not authenticated — please sign in again.",
        401,
        "unauthorized",
      );
    }
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(BASE + path, { ...opts, headers });
  if (res.status === 401) {
    // Token expired / invalid — let the registered handler sign out and
    // bounce to login. Components still receive the ApiError to clean up.
    try {
      onUnauthorized?.();
    } catch {
      /* never let the handler throw break the rejection */
    }
  }
  if (!res.ok) {
    const text = await res.text();
    let code: string | null = null;
    let token: string | undefined;
    let message = `API ${opts.method ?? "GET"} ${path} failed (${res.status}): ${text}`;
    try {
      const body = JSON.parse(text);
      if (body?.code) code = body.code;
      if (body?.error) message = body.error;
      if (body?.token) token = body.token;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code, token);
  }
  return res.json();
}

/** Invalidate all cached GET responses (e.g. after a realtime event). */
export function invalidateCache() {
  cache.clear();
  inflight.clear();
}

// ── Profile (authenticated — requires the user's access token) ───────────────

export interface Profile {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  job_title?: string;
  company?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProfileInput {
  full_name: string;
  phone: string;
  job_title?: string;
  company?: string;
}

export const getProfile = (accessToken: string) =>
  request<{ profile: Profile | null }>("/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then((r) => r.profile);

export const saveProfile = (accessToken: string, input: ProfileInput) =>
  request<{ profile: Profile }>("/profile", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  }).then((r) => r.profile);

// ── Plans (defined server-side; prices are never computed on the client) ─────

export interface Plan {
  id: string;
  name: string;
  description: string;
  currency: string;
  monthly: number;
  yearly: number;
  features: string[];
  highlighted: boolean;
}

export const getPlans = () => request<Plan[]>("/plans");

// ── Vouchers (authenticated; discount/total are computed server-side) ────────

export type BillingInterval = "monthly" | "yearly";

export interface VoucherValidation {
  valid: boolean;
  reason?: string;
  code?: string;
  type?: "percent" | "fixed";
  value?: number;
  base?: number;
  discount?: number;
  total?: number;
}

export const validateVoucher = (
  accessToken: string,
  input: { code: string; plan_id: string; interval: BillingInterval },
) =>
  request<VoucherValidation>("/vouchers/validate", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });

// ── Payments (Midtrans Snap; amounts always computed server-side) ────────────

export interface CheckoutSession {
  order_id: string;
  token: string;
  client_key: string;
  is_production: boolean;
}

export type PaymentStatus = "pending" | "paid" | "failed";

export interface Subscription {
  user_id: string;
  plan_id: string;
  interval: BillingInterval;
  status: string;
  order_id: string;
  started_at: string;
  current_period_end: string;
}

export interface PaymentStatusResult {
  order_id: string;
  status: PaymentStatus;
  plan_id: string;
  plan_name: string;
  interval: BillingInterval;
  gross_amount: number;
  payment_type: string | null;
  subscription: Subscription | null;
  /** Only present for pending orders — allows re-opening the Snap popup. */
  snap_token?: string | null;
  client_key?: string;
  is_production?: boolean;
}

export const createCheckout = (
  accessToken: string,
  input: { plan_id: string; interval: BillingInterval; voucher_code?: string },
) =>
  request<CheckoutSession>("/payments/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });

export const getPaymentStatus = (accessToken: string, orderId: string) =>
  request<PaymentStatusResult>(`/payments/status/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

// ── Subscription & billing (authenticated) ───────────────────────────────────

export interface TransactionSummary {
  order_id: string;
  plan_id: string;
  plan_name: string;
  interval: BillingInterval;
  gross_amount: number;
  discount: number;
  voucher_code: string | null;
  status: PaymentStatus;
  payment_type: string | null;
  created_at: string;
}

export interface SubscriptionInfo {
  subscription: Subscription | null;
  /** Plan the user effectively has right now (falls back to the free plan). */
  effective_plan: Plan;
  transactions: TransactionSummary[];
  /** True when the signed-in user's email is on the founder allowlist. */
  is_admin?: boolean;
}

export const getSubscription = (accessToken: string) =>
  request<SubscriptionInfo>("/subscription", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

// ── Service status & user notifications ──────────────────────────────────────

export interface MaintenanceStatus {
  enabled: boolean;
  message: string;
}

export const getServiceStatus = () =>
  request<{ maintenance: MaintenanceStatus }>("/status");

export interface UserNotification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
}

export const getNotifications = () =>
  request<UserNotification[]>("/notifications");
export const markNotificationsRead = (ids: string[]) =>
  request<{ ok: boolean }>("/notifications/read", {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });

// ── Founder panel (admin-only endpoints) ──────────────────────────────────────

export interface Voucher {
  code: string;
  type: "percent" | "fixed";
  value: number;
  active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  applies_to: string[] | null;
  created_at?: string | null;
  updated_at?: string;
}

export interface VoucherInput {
  code: string;
  type: "percent" | "fixed";
  value: number;
  active?: boolean;
  expires_at?: string | null;
  max_uses?: number | null;
  applies_to?: string[] | null;
}

export interface AdminOverview {
  total_users: number;
  active_subscriptions: Record<string, number>;
  expired_subscriptions: number;
  revenue_total: number;
  paid_transactions: number;
  pending_transactions: number;
  voucher_count: number;
  maintenance: MaintenanceStatus;
}

export interface SubscriberRow {
  user_id: string;
  email: string;
  full_name: string;
  company: string;
  plan_id: string;
  interval: BillingInterval;
  status: string;
  started_at: string;
  current_period_end: string;
}

export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  audience: "all" | "free" | "pro" | "business";
  created_at: string;
  created_by: string;
}

export const adminGetOverview = () => request<AdminOverview>("/admin/overview");
export const adminGetVouchers = () => request<Voucher[]>("/admin/vouchers");
export const adminCreateVoucher = (input: VoucherInput) =>
  request<Voucher>("/admin/vouchers", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const adminUpdateVoucher = (code: string, patch: Partial<VoucherInput>) =>
  request<Voucher>(`/admin/vouchers/${encodeURIComponent(code)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
export const adminDeleteVoucher = (code: string) =>
  request<{ ok: boolean }>(`/admin/vouchers/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
export const adminGetSubscribers = () =>
  request<SubscriberRow[]>("/admin/subscribers");
export const adminSetMaintenance = (input: { enabled: boolean; message: string }) =>
  request<{ maintenance: MaintenanceStatus }>("/admin/maintenance", {
    method: "PUT",
    body: JSON.stringify(input),
  });
export const adminGetNotifications = () =>
  request<AdminNotification[]>("/admin/notifications");
export const adminCreateNotification = (input: {
  title: string;
  message: string;
  audience: AdminNotification["audience"];
}) =>
  request<AdminNotification>("/admin/notifications", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const adminDeleteNotification = (id: string) =>
  request<{ ok: boolean }>(`/admin/notifications/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export interface MigrateKvReport {
  plans: number;
  profiles: number;
  subscriptions: number;
  transactions: number;
  errors: string[];
}

export const adminMigrateKv = () =>
  request<MigrateKvReport>("/admin/migrate-kv", { method: "POST" });

// ── Tasks ─────────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  project: string;
  due: string;
  completed: boolean;
  created_by?: string;
}

export const getTasks = () => request<Task[]>("/tasks");
export const createTask = (task: Omit<Task, "id" | "created_by">) =>
  request<Task>("/tasks", { method: "POST", body: JSON.stringify(task) });
export const updateTask = (id: string, patch: Partial<Task>) =>
  request<Task>(`/tasks/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) });
export const deleteTask = (id: string) =>
  request<{ ok: boolean }>(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });

// ── Projects ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  priority?: string;
  progress: number;
  tasks: { total: number; done: number };
  team: string[];
  due: string;
  tags: string[];
}

export const getProjects = () => request<Project[]>("/projects");
export const createProject = (project: Omit<Project, "id">) =>
  request<Project>("/projects", { method: "POST", body: JSON.stringify(project) });
export const updateProject = (id: string, patch: Partial<Project>) =>
  request<Project>(`/projects/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) });
export const deleteProject = (id: string) =>
  request<{ ok: boolean }>(`/projects/${encodeURIComponent(id)}`, { method: "DELETE" });

// ── Teams ─────────────────────────────────────────────────────────────────────

export interface Member {
  initials: string;
  name: string;
  role: string;
  status: string;
  tasks: number;
}

export interface Team {
  name: string;
  description: string;
  members: Member[];
}

export const getTeams = () => request<Team[]>("/teams");
export const inviteMember = (teamName: string, member: Member) =>
  request<Team>("/teams/invite", { method: "POST", body: JSON.stringify({ teamName, member }) });
export const updateMember = (teamName: string, initials: string, patch: Partial<Member>) =>
  request<Member>("/teams/member", { method: "PUT", body: JSON.stringify({ teamName, initials, patch }) });
export const removeMember = (teamName: string, initials: string) =>
  request<{ ok: boolean }>("/teams/member", { method: "DELETE", body: JSON.stringify({ teamName, initials }) });

// ── Calendar ──────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  title: string;
  tag: string;
  color: string;
}

export const getCalendarEvents = () => request<Record<string, CalendarEvent[]>>("/calendar");
export const createCalendarEvent = (dateKey: string, event: CalendarEvent) =>
  request<CalendarEvent[]>("/calendar/events", { method: "POST", body: JSON.stringify({ dateKey, event }) });
export const deleteCalendarEvent = (dateKey: string, index: number) =>
  request<{ ok: boolean }>("/calendar/events", { method: "DELETE", body: JSON.stringify({ dateKey, index }) });

// ── Files ─────────────────────────────────────────────────────────────────────

export interface FileItem {
  name: string;
  type: string;
  size: string;
  modified: string;
  owner: string;
  shared: boolean;
  archived: boolean;
  created_by?: string | null;
}

export interface Folder {
  name: string;
  files: number;
  modified: string;
}

export const getFiles = () => request<{ files: FileItem[]; folders: Folder[] }>("/files");
export const createFile = (file: FileItem) =>
  request<FileItem>("/files", { method: "POST", body: JSON.stringify(file) });
export const renameFile = (oldName: string, newName: string) =>
  request<FileItem>("/files", { method: "PUT", body: JSON.stringify({ oldName, newName }) });
export const deleteFile = (name: string) =>
  request<{ ok: boolean }>(`/files/${encodeURIComponent(name)}`, { method: "DELETE" });
export const createFolder = (folder: Folder) =>
  request<Folder>("/files/folders", { method: "POST", body: JSON.stringify(folder) });
export const renameFolder = (oldName: string, newName: string) =>
  request<Folder>("/files/folders", { method: "PUT", body: JSON.stringify({ oldName, newName }) });
export const deleteFolder = (name: string) =>
  request<{ ok: boolean }>(`/files/folders/${encodeURIComponent(name)}`, { method: "DELETE" });
// ── Settings ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- settings schema varies by section
export const getSettings = <T = any>(section: string) => request<T>(`/settings/${section}`);
export const saveSettings = (section: string, data: unknown) =>
  request<{ ok: boolean }>(`/settings/${section}`, { method: "PUT", body: JSON.stringify(data) });

// ── Workspace provisioning ────────────────────────────────────────────────────
// POST /workspace is idempotent: returns the existing workspace if the user
// already has one, otherwise provisions one (+ membership + seed data). Called
// from onboarding (named after the user's company) and again from AppLayout on
// mount as a safety net — so every signed-in user lands on a workspace-scoped
// page with a workspace already in place, instead of a blank sidebar/logo.

export interface Workspace {
  id?: string;
  name: string;
  url?: string;
  industry?: string | null;
  team_size?: string | null;
  region?: string | null;
  owner_id?: string;
}

export const getWorkspace = () =>
  request<{ workspace: Workspace | null; role?: string }>("/workspace");

export const ensureWorkspace = (input?: { name?: string }) =>
  request<{ workspace: Workspace; role?: string }>("/workspace", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });

// ── Workspace members & invitations ───────────────────────────────────────────

export interface WorkspaceMember {
  user_id: string | null;
  name: string;
  email: string;
  role: string;
  status: string;
  initials: string;
  joined: string;
}

export const getWorkspaceMembers = () =>
  request<{ members: WorkspaceMember[]; my_role: string }>("/workspace/members");

export const updateWorkspaceMemberRole = (userId: string, role: string) =>
  request<{ ok: boolean }>(`/workspace/members/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });

export const removeWorkspaceMember = (userId: string) =>
  request<{ ok: boolean }>(`/workspace/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });

export interface Invitation {
  id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export interface InvitationPreview {
  email: string;
  role: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  workspace_name: string;
  inviter_name: string;
}

export const createInvitation = (input: { email: string; role: string; team?: string }) =>
  request<{ invitation: Invitation }>("/workspace/invitations", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((r) => r.invitation);

export const getInvitations = () =>
  request<{ invitations: Invitation[] }>("/workspace/invitations").then((r) => r.invitations);

export const revokeInvitation = (id: string) =>
  request<{ ok: boolean }>(`/workspace/invitations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

// Public preview — pass the token explicitly; this route allows no-auth GET.
export const getInvitationByToken = (token: string) =>
  request<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`);

export const acceptInvitation = (token: string) =>
  request<{ ok: boolean; workspace_id: string; workspace_name: string; role: string }>(
    `/invitations/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
  );

// ── Workspace admin ───────────────────────────────────────────────────────────

export const resetWorkspaceData = () =>
  request<{ ok: boolean }>("/workspace-data", { method: "DELETE" });

// ── Financial data ────────────────────────────────────────────────────────────

export interface FinancialData {
  revenue: { month: string; revenue: number; target: number }[];
  budget: { category: string; budget: number; actual: number }[];
  cashflow: { month: string; inflow: number; outflow: number }[];
  quarterly: { quarter: string; revenue: number; expenses: number; profit: number }[];
  expenses: { name: string; value: number; color: string }[];
  kpis: { name: string; value: number; target: number; color: string }[];
  strategicGoals: { goal: string; progress: number; status: string; due: string }[];
  headcount: number;
  q2Revenue: string;
  grossMargin: string;
}

export const getFinancial = () => request<FinancialData>("/financial");
export const saveFinancial = (data: Partial<FinancialData>) =>
  request<FinancialData>("/financial", { method: "PUT", body: JSON.stringify(data) });

// ── Integrations ──────────────────────────────────────────────────────────────

export interface Integration {
  name: string;
  description: string;
  connected: boolean;
  lastSync: string | null;
  scopes: string;
}

export const getIntegrations = () => request<Integration[]>("/integrations");
export const updateIntegration = (name: string, patch: Partial<Integration>) =>
  request<Integration>(`/integrations/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });

// ── Sessions ──────────────────────────────────────────────────────────────────

export interface SessionData {
  active: { device: string; location: string; ip: string; lastActive: string; current: boolean }[];
  loginHistory: { date: string; ip: string; device: string; status: string }[];
}

export const setup2FA = () => request<{ secret: string; otpauthUrl: string; backupCodes: string[] }>("/2fa/setup");
export const verify2FA = (code: string) => request<{ ok: boolean }>("/2fa/verify", { method: "POST", body: JSON.stringify({ code }) });
export const disable2FA = (code?: string, backupCode?: string, emailOTPCode?: string) =>
  request<{ ok: boolean }>("/2fa", { method: "DELETE", body: JSON.stringify({ code, backupCode, emailOTPCode }) });
export const transferOwnership = (targetEmail: string) =>
  request<{ ok: boolean }>("/workspace/transfer-ownership", { method: "POST", body: JSON.stringify({ targetEmail }) });
export const deleteAccount = (password: string) =>
  request<{ ok: boolean }>("/account", { method: "DELETE", body: JSON.stringify({ password }) });
export const verify2FALogin = (code: string, backupCode?: string) =>
  request<{ ok: boolean }>("/2fa/verify-login", { method: "POST", body: JSON.stringify({ code, backupCode }) });

// ── Email OTP (Brevo) ────────────────────────────────────────────────────────
/** Send email OTP for signup verification. */
export const sendEmailOTP = () =>
  request<{ ok: boolean; expiresIn: number }>("/email-otp/send", { method: "POST" });
export const verifyEmailOTP = (code: string) =>
  request<{ ok: boolean }>("/email-otp/verify", { method: "POST", body: JSON.stringify({ code }) });
/** Send email OTP for login 2FA. Same endpoint as signup, separate verify path. */
export const sendEmailOTPLogin = sendEmailOTP; // same endpoint, alias for clarity
export const verifyEmailOTPLogin = (code: string) =>
  request<{ ok: boolean }>("/email-otp/verify-login", { method: "POST", body: JSON.stringify({ code }) });

// ── File updates ─────────────────────────────────────────────────────────────
export const updateFile = (name: string, patch: Record<string, unknown>) =>
  request<Record<string, unknown>>(`/files/${encodeURIComponent(name)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  workspace_id: string;
  user_id: string;
  content: string;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  reply_to: string | null;
  created_at: string;
  updated_at: string | null;
  sender: { name: string; initials: string };
  reactions: ChatReaction[];
  reply_to_preview: { id: string; content: string; sender_name: string } | null;
}

export const getChatMessages = (limit = 50, before?: string) =>
  request<{ messages: ChatMessage[]; has_more: boolean }>(
    `/chat/messages?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ""}`
  );

export const sendChatMessage = (input: {
  content: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  reply_to?: string;
}) =>
  request<ChatMessage>("/chat/messages", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const editChatMessage = (id: string, content: string) =>
  request<ChatMessage>(`/chat/messages/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });

export const deleteChatMessage = (id: string) =>
  request<{ ok: boolean }>(`/chat/messages/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

export const addChatReaction = (messageId: string, emoji: string) =>
  request<ChatReaction & { removed?: boolean }>(
    `/chat/messages/${encodeURIComponent(messageId)}/reactions`,
    { method: "POST", body: JSON.stringify({ emoji }) }
  );

export const removeChatReaction = (messageId: string, emoji: string) =>
  request<{ ok: boolean }>(
    `/chat/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
    { method: "DELETE" }
  );

export const getSessions = () => request<SessionData>("/sessions");
export const revokeSession = (device: string) =>
  request<{ ok: boolean }>(`/sessions/${encodeURIComponent(device)}`, { method: "DELETE" });

// ── Dashboard detail views (drill-down sub-view data) ────────────────────────

export interface ViewStat {
  label: string;
  value: string;
  sub?: string;
  up?: boolean;
}

export interface DashboardDetails {
  executiveSummary: { stats: ViewStat[] };
  execRevenue: { stats: ViewStat[]; growth: { month: string; growth: number }[] };
  execKpis: { stats: ViewStat[]; kpis: { name: string; value: number; target: number; color: string }[] };
  execGoals: { stats: ViewStat[]; goals: { goal: string; progress: number; status: string; due: string; owner: string }[] };
  execDepartments: { stats: ViewStat[]; depts: { dept: string; metric: string; kpi: string; trend: string; up: boolean; color: string }[] };
  operations: { stats: ViewStat[] };
  opsTimeline: { stats: ViewStat[]; projects: { project: string; phase: string; start: number; duration: number; status: string; due: string }[] };
  opsResources: { stats: ViewStat[]; resources: { team: string; allocated: number; available: number; headcount: number }[] };
  opsPerformance: { stats: ViewStat[]; scorecard: { team: string; done: number; total: number; color: string }[]; sprintHistory: { sprint: string; eng: number; design: number }[] };
  opsCapacity: { stats: ViewStat[]; series: { week: string; capacity: number; demand: number }[]; hiringPlan: { role: string; month: string; impact: string }[] };
  financial: { stats: ViewStat[] };
  finBudget: { stats: ViewStat[] };
  finCashflow: { stats: ViewStat[] };
  finExpense: { stats: ViewStat[]; trend: { month: string; eng: number; mktg: number }[] };
  finPL: { stats: ViewStat[]; rows: { label: string; value: string; bold: boolean; neg?: boolean; highlight?: boolean }[] };
  weeklyReport: { stats: ViewStat[]; wins: string[]; blockers: string[] };
  weeklyProductivity: { stats: ViewStat[] };
  weeklyCompletion: { stats: ViewStat[]; projects: { project: string; planned: number; completed: number; rate: number }[] };
  weeklyBudget: { stats: ViewStat[]; dailySpend: { day: string; spend: number }[]; categories: { cat: string; amount: string; pct: number; color: string }[] };
  weeklySatisfaction: { stats: ViewStat[]; csatTrend: { day: string; score: number }[]; themes: { theme: string; count: number; positive: boolean }[] };
  monthlyInsights: { stats: ViewStat[]; highlights: { title: string; value: string; icon: string }[] };
  monthlyRevenue: { stats: ViewStat[]; trend: { month: string; revenue: number }[]; channels: { channel: string; revenue: string; pct: number; growth: string }[] };
  monthlyClients: { stats: ViewStat[]; trend: { month: string; clients: number }[]; segments: { seg: string; count: number; value: string }[] };
  monthlyExpansion: { stats: ViewStat[]; headcount: { month: string; hc: number }[]; hires: { dept: string; hires: number }[] };
  monthlyCost: { stats: ViewStat[]; savings: { month: string; savings: number }[]; initiatives: { initiative: string; saving: string; status: string }[] };
  quarterlyAnalysis: { stats: ViewStat[]; comparison: { metric: string; q1: string; q2: string; up: boolean }[]; okrs: { objective: string; progress: number; status: string }[] };
  quarterlyMarket: { stats: ViewStat[]; shareTrend: { q: string; share: number }[]; competitors: { company: string; share: number; color: string }[] };
  quarterlyROI: { stats: ViewStat[]; byArea: { area: string; roi: number }[]; trend: { q: string; roi: number }[] };
  quarterlyRetention: { stats: ViewStat[]; trend: { q: string; ret: number }[]; churnReasons: { reason: string; count: number; pct: number }[] };
  quarterlyInnovation: { stats: ViewStat[]; features: { q: string; features: number }[]; breakdown: { area: string; score: number; color: string }[] };
  performanceMetrics: { stats: ViewStat[]; radar: { label: string; value: number; color: string }[] };
  perfSales: { stats: ViewStat[]; funnel: { stage: string; count: number; pct: number; color: string }[]; winRateTrend: { month: string; rate: number }[] };
  perfResponse: { stats: ViewStat[]; distribution: { range: string; pct: number; color: string }[]; trend: { month: string; hrs: number }[] };
  perfCLV: { stats: ViewStat[]; trend: { q: string; clv: number }[]; bySegment: { seg: string; clv: number }[] };
  perfChurn: { stats: ViewStat[]; trend: { month: string; churn: number }[]; atRisk: { name: string; score: number; segment: string }[] };
  predictive: { stats: ViewStat[]; insights: { insight: string; severity: string }[] };
  predForecast: { stats: ViewStat[]; series: { month: string; forecast: number; lower: number; upper: number }[]; assumptions: { label: string; value: string }[] };
  predResources: { stats: ViewStat[]; series: { month: string; supply: number; demand: number }[]; roles: { role: string; urgency: string; timeframe: string }[] };
  predTrends: { stats: ViewStat[]; series: { q: string; idx: number }[]; signals: { signal: string; type: string; impact: string }[] };
  predRisks: { stats: ViewStat[]; risks: { risk: string; likelihood: string; impact: string; color: string }[] };
}

export const getDashboardDetails = () => request<DashboardDetails>("/dashboard/details");
export const saveDashboardDetails = (data: Partial<DashboardDetails>) =>
  request<DashboardDetails>("/dashboard/details", { method: "PUT", body: JSON.stringify(data) });

// ── Analytics metrics ─────────────────────────────────────────────────────────

export interface AnalyticsMetrics {
  timeTracking: {
    avgHoursPerDay: number;
    billableHours: number;
    overtimeRate: number;
    focusTime: number;
    byTeam: { team: string; hours: number; color: string }[];
    allocation: { label: string; pct: number; color: string }[];
  };
  teamEfficiency: {
    overall: number;
    sprintVelocity: number;
    blockedTime: number;
    reworkRate: number;
    byTeam: { team: string; score: number; velocity: number; blocked: number; color: string }[];
    sprintHistory: { sprint: string; velocity: number; done: number; goal: number; hit: boolean }[];
  };
  benchmarks: {
    industryRank: string;
    onTimeDelivery: number;
    qualityScore: number;
    nps: number;
    comparison: { label: string; team: number; industry: number }[];
    history: { quarter: string; score: string; rank: string; delta: string }[];
  };
  efficiencyScores: { team: string; score: number; color: string }[];
  completionSeries?: Record<string, { week: string; completed: number; target: number }[]>;
  productivitySeries?: Record<string, { month: string; dev: number; design: number; qa: number }[]>;
  taskMetrics?: { avgCycleTime: string; cycleChange: string; completionChange: string; overdueChange: string };
}

export const getAnalyticsMetrics = () => request<AnalyticsMetrics>("/analytics/metrics");

// ── Dashboard operational data ────────────────────────────────────────────────

export interface DashboardOps {
  projectTimeline: { project: string; start: number; duration: number; status: string }[];
  resourceData: { team: string; allocated: number; available: number }[];
  capacityData: { week: string; capacity: number; utilization: number }[];
  dailyData: { day: string; tasks: number; hours: number; bugs: number }[];
  monthlyTrend: { month: string; delivered: number; planned: number; velocity: number }[];
  performanceMetrics: { metric: string; value: string; change: string; up: boolean }[];
  riskItems: { risk: string; likelihood: string; impact: string; color: string }[];
  forecastData: { month: string; forecast: number; lower: number; upper: number }[];
  deptHighlights: { dept: string; metric: string; sub: string; up: boolean }[];
}

export const getDashboardOps = () => request<DashboardOps>("/dashboard/ops");

// ── Milestones ────────────────────────────────────────────────────────────────

export interface Milestone {
  milestone: string;
  date: string;
  done: boolean;
}

export const getMilestones = (project: string) => request<Milestone[]>(`/milestones/${encodeURIComponent(project)}`);
export const toggleMilestone = (project: string, index: number, done: boolean) =>
  request<Milestone>(`/milestones/${encodeURIComponent(project)}/${index}`, {
    method: "PUT",
    body: JSON.stringify({ done }),
  });
