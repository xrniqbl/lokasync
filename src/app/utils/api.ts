import { projectId, publicAnonKey } from "/utils/supabase/info";

const BASE = `https://${projectId}.supabase.co/functions/v1/server`;

// When a user is signed in, every request carries their JWT so the server can
// enforce plan entitlements. AuthContext keeps this in sync with the session.
let userAccessToken: string | null = null;
export const setApiAccessToken = (token: string | null) => {
  userAccessToken = token;
};

// Fase 14 — active workspace. When set, every request carries X-Workspace-Id
// so the server scopes project data to that workspace (membership-validated
// server-side). When null, the server falls back to the user's default
// workspace, so existing flows keep working unchanged.
let activeWorkspaceId: string | null = null;
export const setApiWorkspaceId = (id: string | null) => {
  activeWorkspaceId = id;
};

/** Error thrown for non-2xx responses; `code` carries the server error code. */
export class ApiError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${userAccessToken ?? publicAnonKey}`,
    ...(activeWorkspaceId ? { "X-Workspace-Id": activeWorkspaceId } : {}),
  };
  // Don't set Content-Type for FormData — browser sets the boundary automatically
  if (opts?.body && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      ...headers,
      ...opts.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401 && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    const text = await res.text();
    let code: string | null = null;
    let message = `API ${opts.method ?? "GET"} ${path} failed (${res.status}): ${text}`;
    try {
      const body = JSON.parse(text);
      if (body?.code) code = body.code;
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code);
  }
  return res.json();
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

// ── Subscription reminders (Fase 13.4) ────────────────────────────────────────

export const sendReminders = (days: number = 7) =>
  request<{ sent: number; skipped: number; daysAhead: number }>(
    "/admin/send-reminders",
    { method: "POST", body: JSON.stringify({ days }) },
  );

// Fase 14.4 — batch migration of legacy global KV data into per-user default
// workspaces. Defaults to dry-run; purge_legacy only applies to a real run.
export interface MigrationReport {
  dry_run: boolean;
  users_processed: number;
  workspaces_created: number;
  keys_copied: number;
  keys_skipped: number;
  legacy_keys_found: string[];
  legacy_purged: boolean;
  details: {
    email: string;
    workspace_id: string | null;
    workspace_created: boolean;
    copied: number;
    skipped: number;
  }[];
}

export const adminMigrateWorkspaces = (input: {
  dry_run?: boolean;
  purge_legacy?: boolean;
}) =>
  request<MigrationReport>("/admin/migrate-workspaces", {
    method: "POST",
    body: JSON.stringify(input),
  });
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

// ── Tasks ─────────────────────────────────────────────────────────────────────

export interface Task {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  project: string;
  due: string;
  completed: boolean;
}

export const getTasks = () => request<Task[]>("/tasks");
export const createTask = (task: Omit<Task, "id">) =>
  request<Task>("/tasks", { method: "POST", body: JSON.stringify(task) });
export const updateTask = (id: number, patch: Partial<Task>) =>
  request<Task>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(patch) });
export const deleteTask = (id: number) =>
  request<{ ok: boolean }>(`/tasks/${id}`, { method: "DELETE" });

// ── Projects ──────────────────────────────────────────────────────────────────

export interface Project {
  id: number;
  name: string;
  description: string;
  status: string;
  progress: number;
  tasks: { total: number; done: number };
  team: string[];
  due: string;
  tags: string[];
}

export const getProjects = () => request<Project[]>("/projects");
export const createProject = (project: Omit<Project, "id">) =>
  request<Project>("/projects", { method: "POST", body: JSON.stringify(project) });
export const updateProject = (id: number, patch: Partial<Project>) =>
  request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(patch) });
export const deleteProject = (id: number) =>
  request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" });

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
export const deleteCalendarEvent = (id: string) =>
  request<{ ok: boolean }>("/calendar/events", { method: "DELETE", body: JSON.stringify({ id }) });

// ── Files ─────────────────────────────────────────────────────────────────────

export interface FileItem {
  name: string;
  type: string;
  size: number;          // bytes
  sizeHuman: string;     // "2.4 MB"
  modified: string;
  owner: string;
  shared: boolean;
  archived: boolean;
  storagePath: string | null;
  url: string | null;
  urlExpiresAt: string | null;
}

export interface QuotaInfo {
  used: number;
  limit: number;
  unlimited: boolean;
}

export interface Folder {
  name: string;
  files: number;
  modified: string;
}

export const getFiles = () => request<{ files: FileItem[]; folders: Folder[] }>("/files");
export const createFile = (file: FileItem) =>
  request<FileItem>("/files", { method: "POST", body: JSON.stringify(file) });
export const renameFile = (id: string, newName: string) =>
  request<FileItem>("/files", { method: "PUT", body: JSON.stringify({ id, name: newName }) });
export const deleteFile = (name: string) =>
  request<{ ok: boolean }>(`/files/${encodeURIComponent(name)}`, { method: "DELETE" });
export const createFolder = (folder: Folder) =>
  request<Folder>("/files/folders", { method: "POST", body: JSON.stringify(folder) });

// ── File upload/download & storage quota (Fase 12) ───────────────────────────

/** Human-readable size string (e.g. "2.4 MB") */
export function humanSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/** Upload a real file via multipart/form-data */
export const uploadFile = (
  file: File,
  metadata?: { owner?: string; shared?: boolean },
) => {
  const form = new FormData();
  form.append("file", file);
  if (metadata) form.append("metadata", JSON.stringify(metadata));
  return request<FileItem>("/files/upload", {
    method: "POST",
    body: form,
  });
};

/** Get a signed download URL for a file */
export const getDownloadUrl = (name: string) =>
  request<{ url: string; expiresIn: number }>(
    `/files/download/${encodeURIComponent(name)}`,
  );

/** Get storage quota for the active workspace */
export const getStorageQuota = () =>
  request<QuotaInfo>("/files/quota");

// ── Settings ──────────────────────────────────────────────────────────────────

export const getSettings = (section: string) => request<any>(`/settings/${section}`);
export const saveSettings = (section: string, data: any) =>
  request<any>(`/settings/${section}`, { method: "PUT", body: JSON.stringify(data) });

// ── Workspaces (Fase 14 — multi-user collaboration) ──────────────────────────

export type WorkspaceRole = "owner" | "member";

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  /** The signed-in user's role in this workspace. */
  role: WorkspaceRole;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  email: string;
  name: string;
  joined_at: string;
}

export const getWorkspaces = () =>
  request<{ workspaces: Workspace[]; active: string }>("/workspaces");
export const createWorkspace = (name: string) =>
  request<Workspace>("/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
export const renameWorkspace = (id: string, name: string) =>
  request<Workspace>(`/workspaces/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
export const deleteWorkspace = (id: string) =>
  request<{ ok: boolean }>(`/workspaces/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
export const getWorkspaceMembers = (id: string) =>
  request<WorkspaceMember[]>(`/workspaces/${encodeURIComponent(id)}/members`);
export const updateWorkspaceMemberRole = (
  id: string,
  userId: string,
  role: WorkspaceRole,
) =>
  request<WorkspaceMember>(
    `/workspaces/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
    { method: "PUT", body: JSON.stringify({ role }) },
  );
export const removeWorkspaceMember = (id: string, userId: string) =>
  request<{ ok: boolean }>(
    `/workspaces/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );

// ── Workspace invitations (Fase 14.2) ─────────────────────────────────────────

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface WorkspaceInvitation {
  /** Secret invite token; null for non-pending invitations. */
  token: string | null;
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: WorkspaceRole;
  invited_by: string;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
}

export interface CreatedInvitation extends WorkspaceInvitation {
  token: string;
  /** Shareable accept link (also emailed when the provider is configured). */
  invite_url: string;
  email_sent: boolean;
}

export interface InvitePreview {
  workspace_name: string;
  email: string;
  role: WorkspaceRole;
  invited_by: string;
  status: InvitationStatus;
  expires_at: string;
}

export const getWorkspaceInvites = (workspaceId: string) =>
  request<WorkspaceInvitation[]>(
    `/workspaces/${encodeURIComponent(workspaceId)}/invites`,
  );
export const createWorkspaceInvite = (
  workspaceId: string,
  input: { email: string; role: WorkspaceRole },
) =>
  request<CreatedInvitation>(
    `/workspaces/${encodeURIComponent(workspaceId)}/invites`,
    { method: "POST", body: JSON.stringify(input) },
  );
export const revokeWorkspaceInvite = (workspaceId: string, token: string) =>
  request<{ ok: boolean }>(
    `/workspaces/${encodeURIComponent(workspaceId)}/invites/${encodeURIComponent(token)}`,
    { method: "DELETE" },
  );
export const getInvitePreview = (token: string) =>
  request<InvitePreview>(`/invites/${encodeURIComponent(token)}`);
export const acceptInvite = (token: string) =>
  request<{
    ok: boolean;
    already_member: boolean;
    workspace: { id: string; name: string; role: WorkspaceRole };
  }>("/invites/accept", { method: "POST", body: JSON.stringify({ token }) });

// ── Workspace admin ───────────────────────────────────────────────────────────

export const resetWorkspaceData = () =>
  request<{ ok: boolean }>("/workspace-data", { method: "DELETE" });

// ── Workspace plan (Fase 14.5 — member plan inheritance) ───────────────────────

type PlanId = "free" | "pro" | "business";

export interface WorkspacePlan {
  plan: PlanId;
  owner_id: string | null;
}

export async function getWorkspacePlan() {
  return request<WorkspacePlan>("/workspace-plan");
}

// ── Member home (consolidated endpoint for member dashboard) ─────────────────

export async function getMemberHome() {
  return request<any>("/member-home");
}

export async function leaveWorkspace() {
  return request<{ ok: boolean }>("/leave-workspace", { method: "POST", body: JSON.stringify({}) });
}

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

export const getMilestones = (project: string) => request<Milestone[]>(`/milestones/${project}`);
export const toggleMilestone = (project: string, index: number, done: boolean) =>
  request<Milestone>(`/milestones/${project}/${index}`, {
    method: "PUT",
    body: JSON.stringify({ done }),
  });

// ── Two-factor authentication (TOTP) ────────────────────────────────────────
export const setup2FA = () =>
  request<{ secret: string; otpauthUrl: string; backupCodes: string[] }>("/2fa/setup");
export const verify2FA = (code: string) =>
  request<{ ok: boolean }>("/2fa/verify", { method: "POST", body: JSON.stringify({ code }) });
export const disable2FA = (code?: string, backupCode?: string, emailOTPCode?: string) =>
  request<{ ok: boolean }>("/2fa", { method: "DELETE", body: JSON.stringify({ code, backupCode, emailOTPCode }) });
export const verify2FALogin = (code: string, backupCode?: string) =>
  request<{ ok: boolean }>("/2fa/verify-login", { method: "POST", body: JSON.stringify({ code, backupCode }) });

// ── Email OTP (alternative 2FA method) ──────────────────────────────────────
export const sendEmailOTP = () =>
  request<{ ok: boolean; expiresIn: number }>("/email-otp/send", { method: "POST" });
export const verifyEmailOTP = (code: string) =>
  request<{ ok: boolean }>("/email-otp/verify", { method: "POST", body: JSON.stringify({ code }) });
/** Same endpoint as enrollment send — alias for the login flow. */
export const sendEmailOTPLogin = sendEmailOTP;
export const verifyEmailOTPLogin = (code: string) =>
  request<{ ok: boolean }>("/email-otp/verify-login", { method: "POST", body: JSON.stringify({ code }) });
