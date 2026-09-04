import { Hono } from "npm:hono";
import type { Context } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

/** Variables set by middleware and read by route handlers via c.get(). */
type HonoVariables = {
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null;
};

/** Strongly-typed Hono context used throughout the server. */
type C = Context<{ Variables: HonoVariables }>;

// Supabase passes the full request path including the function name
const app = new Hono().basePath("/server");

// Request logger — disabled in production to reduce log noise.
// Enable by setting DEBUG=true in Edge Function secrets.
if (Deno.env.get("DEBUG") === "true") {
  app.use('*', logger(console.log));
}
// CORS — restrict to allowed origins. Set ALLOWED_ORIGINS env var to a
// comma-separated list of frontend domains. The Supabase project URL is
// always allowed. In production (ALLOWED_ORIGINS set), only listed origins
// are accepted. When ALLOWED_ORIGINS is empty, the Supabase project URL
// itself is still enforced as the minimum allowed origin.
const allowedOrigins = (): string[] => {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const fromEnv = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  // Always include Supabase URL + localhost dev ports for local development
  const defaults = [supabaseUrl, "http://localhost:5173", "http://localhost:3000", "http://localhost:5174"];
  return [...new Set([...defaults, ...fromEnv])].filter(Boolean);
};

app.use(
  "/*",
  cors({
    origin: (origin) => {
      const allowed = allowedOrigins();
      // Only allow listed origins. With ALLOWED_ORIGINS empty, only the
      // Supabase project URL is allowed (always included by allowedOrigins()).
      return allowed.includes(origin) ? origin : "";
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// ── Authentication ───────────────────────────────────────────────────────────
// `verify_jwt` is disabled at the gateway (so the Midtrans webhook can call
// /payments/webhook without a Bearer token), so authentication is enforced
// here via middleware. PUBLIC_PATHS are reachable without auth; everything
// else requires a valid Bearer JWT, verified against Supabase Auth. The
// resolved user is stashed on the context so downstream middleware/routes
// reuse it instead of re-verifying on every request.

// Reuse a single service-role client across requests instead of building one
// per call — avoids a fresh connection/pool on every invocation.
let _adminClient: ReturnType<typeof createClient> | null = null;
const adminClient = () => {
  if (!_adminClient) {
    _adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _adminClient;
};

async function getAuthedUser(c: C) {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

const unauthorized = (c: C) =>
  c.json({ error: "Unauthorized", code: "unauthorized" }, 401);

// Serialize any thrown value to a readable string. Supabase/Postgrest errors
// are plain objects (not Error instances), so String(e) yields the useless
// "[object Object]". Pull out the real message/details so the client surfaces
// what actually went wrong instead of a meaningless placeholder.
const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code]
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (parts.length) return parts.join(" — ");
    try {
      return JSON.stringify(e);
    } catch {
      /* fall through */
    }
  }
  return String(e);
};

// Public-safe error message — generic for PostgREST/database errors to avoid
// leaking schema details, constraint names, or internal hints to the client.
const publicErrMsg = (e: unknown): string => {
  if (e instanceof Error && !e.message.includes("Postgrest") && !e.message.includes("PGRST"))
    return e.message;
  return "An unexpected error occurred. Please try again.";
};

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// KV-backed sliding-window rate limiter. Persists across Edge Function cold
// starts. Each entry stores { timestamps: number[] } and is checked against
// the configured window.

async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
): Promise<boolean> {
  const record = (await kv.get(`rate-limit:${key}`)) ?? { timestamps: [] as number[] };
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (record.timestamps as number[]).filter((t: number) => t > cutoff);
  if (recent.length >= maxAttempts) return false;
  recent.push(now);
  await kv.set(`rate-limit:${key}`, { timestamps: recent });
  return true;
}

const PUBLIC_PATHS = new Set<string>([
  "/health",
  "/status",
  "/plans",
  "/payments/webhook",
]);

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const path = c.req.path.replace(/^\/server/, "");
  if (
    PUBLIC_PATHS.has(path) ||
    path.startsWith("/payments/status") || // paid-status polling before login completes
    // Invitation preview is public so a recipient can see who invited them and
    // to which workspace before signing in. Accepting still requires auth.
    (c.req.method === "GET" && /^\/invitations\/[^/]+$/.test(path))
  ) {
    return next();
  }
  const user = await getAuthedUser(c);
  if (!user) return unauthorized(c);
  c.set("user", user);
  await next();
});

// ── Workspace resolution ──────────────────────────────────────────────────────
// The app is single-workspace-per-user for now: each user has at most one
// active workspace (created during onboarding). The schema already supports
// multiple memberships + invitations for a future multi-workspace phase; here
// we simply pick the user's earliest active membership as "the" workspace.
// Every workspace-scoped endpoint resolves it via requireWorkspace(c) instead
// of expecting the client to send a workspace id.

async function getActiveWorkspace(c: C) {
  const user = c.get("user");
  if (!user) return null;
  const { data } = await adminClient()
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.workspace_id, role: data.role } : null;
}

// Auto-provision a workspace + membership + seed data for a user who has none.
// Extracted so both `requireWorkspace` (transparent self-heal) and the explicit
// `POST /workspace` endpoint (onboarding) share one code path.
async function createWorkspaceForUser(
  user: any,
  opts: {
    name?: string;
    industry?: string | null;
    team_size?: string | null;
    region?: string | null;
  } = {},
): Promise<{ id: string; role: string } | null> {
  const db = adminClient();
  const name = (opts.name ?? "").trim().slice(0, 100) || "My Workspace";

  const { data: wsRow, error: wsErr } = await db
    .from("workspaces")
    .insert({
      name,
      industry: opts.industry ?? null,
      team_size: opts.team_size ?? null,
      region: opts.region ?? null,
      owner_id: user.id,
    })
    .select()
    .single();
  if (wsErr) {
    console.error("createWorkspaceForUser insert error:", wsErr);
    return null;
  }

  await db.from("workspace_members").insert({
    workspace_id: wsRow.id,
    user_id: user.id,
    email: user.email,
    role: "owner",
    status: "active",
  });

  await seedWorkspaceData(wsRow.id, user.id);
  return { id: wsRow.id, role: "owner" };
}

// Workspace info returned by requireWorkspace on success.
type WsInfo = { id: string; role: string };

// Role hierarchy used for authorization. viewer = read-only; member = can
// mutate own workspace data; admin = can manage members/billing; owner = can
// delete/transfer the workspace. Every mutating route must call requireRole.
type WorkspaceRole = "owner" | "admin" | "member" | "viewer";
const ROLE_RANK: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

function hasRole(userRole: string, required: WorkspaceRole) {
  return (ROLE_RANK[userRole as WorkspaceRole] ?? 0) >= ROLE_RANK[required];
}

const forbidden = (c: C, message = "You don't have permission to perform this action.") =>
  c.json({ error: message, code: "forbidden" }, 403);

const noWorkspace = (c: C) =>
  c.json(
    { error: "No workspace found. Complete onboarding first.", code: "no_workspace" },
    404,
  );

// Every workspace-scoped handler starts with:
//   const { ws, response } = await requireWorkspace(c);
//   if (response) return response;
//
// Self-heals: if the user has no workspace (e.g. an account created before
// workspaces existed, or onboarding that didn't provision one), a default
// workspace is created transparently instead of 404-ing. This keeps the app
// usable for every signed-in user — a missing workspace is never a dead-end.
async function requireWorkspace(
  c: C,
): Promise<{ ws: WsInfo; response: null } | { ws: null; response: object }> {
  let ws = await getActiveWorkspace(c);
  if (!ws) {
    // Don't auto-provision a solo workspace for someone who was invited — that
    // would strand them away from the workspace they were asked to join. Signal
    // the client to route them to the accept-invite page instead.
    const pending = await findPendingInviteForUser(c);
    if (pending) {
      return {
        ws: null,
        response: c.json(
          { error: "You have a pending workspace invitation.", code: "pending_invite", token: pending.token },
          409,
        ),
      };
    }
    const user = c.get("user");
    // `createWorkspaceForUser` is defined below in this module; safe to call
    // here because requireWorkspace only runs at request time.
    ws = await createWorkspaceForUser(user);
    if (!ws) return { ws: null, response: noWorkspace(c) };
  }
  return { ws, response: null };
}

// ── Audit log ────────────────────────────────────────────────────────────────
// Real workspace activity, stored in workspace_settings (section "audit-log").
// Entries written here carry `_real: true` so the GET handler can distinguish
// them from the legacy demo seed and show only genuine actions.

type AuditCategory = "Security" | "Members" | "Integrations" | "API" | "Settings";

function initialsFrom(name: string, email: string): string {
  const base = (name || "").trim();
  if (base) {
    const parts = base.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  }
  return (email?.[0] ?? "?").toUpperCase();
}

function clientIp(c: C): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return c.req.header("x-real-ip") ?? "";
}

// Best-effort: never let an audit-write failure break the underlying action.
async function writeAudit(
  c: C,
  wsId: string,
  action: string,
  target: string,
  category: AuditCategory,
) {
  try {
    const user = c.get("user") ?? (await getAuthedUser(c));
    if (!user) return;
    const meta = user.user_metadata ?? {};
    const name = meta.full_name ?? user.email ?? "Unknown";
    const entry = {
      id: crypto.randomUUID(),
      actor: initialsFrom(name, user.email ?? ""),
      actorName: name,
      action,
      target,
      ip: clientIp(c),
      timestamp: new Date().toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }),
      category,
      _real: true,
    };
    const db = adminClient();
    const { data: row } = await db
      .from("workspace_settings")
      .select("data")
      .eq("workspace_id", wsId)
      .eq("section", "audit-log")
      .maybeSingle();
    const existing = Array.isArray(row?.data) ? row.data : [];
    // Drop legacy demo-seed rows; keep only genuine entries, newest first, capped.
    const real = existing.filter((e: any) => e && e._real);
    const next = [entry, ...real].slice(0, 200);
    await db.from("workspace_settings").upsert(
      { workspace_id: wsId, section: "audit-log", data: next },
      { onConflict: "workspace_id,section" },
    );
  } catch (e) {
    console.error("writeAudit failed:", e);
  }
}

// Seeds the core relational tables for a freshly created workspace. Reuses the
// existing SEED_* arrays (defined further down in this module — safe to
// reference because this function only runs at request time, by which point
// the module has fully loaded).
async function seedWorkspaceData(workspaceId: string, userId: string) {
  const db = adminClient();
  const now = new Date().toISOString();

  await db.from("tasks").insert(
    SEED_TASKS.map((t) => ({
      workspace_id: workspaceId,
      created_by: userId,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      assignee: t.assignee,
      project: t.project,
      due: t.due,
      completed: t.completed,
    })),
  );

  await db.from("projects").insert(
    SEED_PROJECTS.map((p) => ({
      workspace_id: workspaceId,
      created_by: userId,
      name: p.name,
      description: p.description,
      status: p.status,
      progress: p.progress,
      tasks: p.tasks,
      team: p.team,
      due: p.due,
      tags: p.tags,
    })),
  );

  // Calendar seed is keyed by date string → flatten into one row per event.
  const calRows: any[] = [];
  for (const [dateKey, events] of Object.entries(SEED_CALENDAR)) {
    for (const ev of events) {
      calRows.push({
        workspace_id: workspaceId,
        created_by: userId,
        date_key: dateKey,
        title: ev.title,
        tag: ev.tag,
        color: ev.color,
      });
    }
  }
  await db.from("calendar_events").insert(calRows);

  await db.from("files").insert(
    SEED_FILES.map((f) => ({
      workspace_id: workspaceId,
      created_by: userId,
      name: f.name,
      type: f.type,
      size: f.size,
      modified: f.modified,
      owner: f.owner,
      shared: f.shared,
      archived: f.archived,
    })),
  );

  await db.from("folders").insert(
    SEED_FOLDERS.map((f) => ({
      workspace_id: workspaceId,
      created_by: userId,
      name: f.name,
      modified: f.modified,
    })),
  );

  // Milestones seed is keyed by project slug → flatten into rows.
  const msRows: any[] = [];
  for (const [project, items] of Object.entries(SEED_MILESTONES)) {
    for (const m of items as any[]) {
      msRows.push({
        workspace_id: workspaceId,
        project,
        milestone: m.milestone,
        date: m.date,
        done: m.done,
      });
    }
  }
  await db.from("milestones").insert(msRows);

  // Seed workspace_teams + workspace_team_members relationally.
  for (const seedTeam of SEED_TEAMS) {
    const { data: teamRow } = await db
      .from("workspace_teams")
      .insert({ workspace_id: workspaceId, name: seedTeam.name, description: seedTeam.description, created_by: userId })
      .select("id")
      .single();
    if (teamRow?.id) {
      await db.from("workspace_team_members").insert(
        seedTeam.members.map((m: any) => ({
          team_id: teamRow.id,
          workspace_id: workspaceId,
          initials: m.initials,
          name: m.name,
          role: m.role,
          status: m.status,
          tasks: m.tasks,
        }))
      );
    }
  }

  // Seed per-workspace reporting blobs in KV (financial, analytics, dashboard,
  // settings). These are not yet relational — kept in KV per-workspace.
  await Promise.all([
    kv.set(`financial:data:${workspaceId}`, SEED_FINANCIAL),
    kv.set(`integrations:list:${workspaceId}`, SEED_INTEGRATIONS),
    kv.set(`security:sessions:${workspaceId}`, SEED_SESSIONS),
    kv.set(`dashboard:ops:${workspaceId}`, SEED_DASHBOARD_OPS),
    kv.set(`dashboard:details:${workspaceId}`, SEED_DASHBOARD_DETAILS),
    kv.set(`analytics:metrics:${workspaceId}`, SEED_ANALYTICS),
  ]);

  // Seed workspace_settings relationally (one row per section).
  const settingSections = [
    { section: "workspace",   data: SEED_WORKSPACE },
    { section: "notifications", data: SEED_NOTIFICATIONS },
    { section: "appearance",  data: SEED_APPEARANCE },
    { section: "timezone",    data: SEED_TIMEZONE },
    { section: "members",     data: SEED_MEMBERS },
    { section: "api-keys",    data: SEED_API_KEYS },
    { section: "webhooks",    data: SEED_WEBHOOKS },
    { section: "audit-log",   data: SEED_AUDIT_LOG },
  ];
  await db.from("workspace_settings").upsert(
    settingSections.map((s) => ({
      workspace_id: workspaceId,
      section: s.section,
      data: s.data,
    })),
    { onConflict: "workspace_id,section" }
  );
}

app.get("/workspace", async (c) => {
  try {
    const ws = await getActiveWorkspace(c);
    if (!ws) return c.json({ workspace: null });
    const { data } = await adminClient()
      .from("workspaces")
      .select("*")
      .eq("id", ws.id)
      .maybeSingle();
    return c.json({ workspace: data, role: ws.role });
  } catch (e) {
    console.error("GET /workspace error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// Idempotent create-or-return. Called from onboarding (new users) and from
// the client self-heal (existing users who pre-date this migration).
app.post("/workspace", async (c) => {
  try {
    const user = c.get("user");

    const existing = await getActiveWorkspace(c);
    if (existing) {
      const { data } = await adminClient()
        .from("workspaces")
        .select("*")
        .eq("id", existing.id)
        .maybeSingle();
      return c.json({ workspace: data, role: existing.role });
    }

    // If this user was invited, don't create a solo workspace — point the client
    // at the accept-invite flow so they land in the workspace they were invited to.
    const pending = await findPendingInviteForUser(c);
    if (pending) {
      return c.json(
        { error: "You have a pending workspace invitation.", code: "pending_invite", token: pending.token },
        409,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const ws = await createWorkspaceForUser(user, {
      name: body.name,
      industry: body.industry ? String(body.industry) : null,
      team_size: body.team_size ? String(body.team_size) : null,
      region: body.region ? String(body.region) : null,
    });
    if (!ws) return c.json({ error: "Could not create workspace" }, 500);

    const { data: wsRow } = await adminClient()
      .from("workspaces")
      .select("*")
      .eq("id", ws.id)
      .maybeSingle();
    return c.json({ workspace: wsRow, role: ws.role }, 201);
  } catch (e) {
    console.error("POST /workspace error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Workspace invitations ─────────────────────────────────────────────────────
// Token-based invites: an admin/owner creates one, shares the link, and the
// recipient accepts it (after signing in) to join the workspace as a member.
// This is what makes a workspace genuinely multi-user.

const INVITE_TTL_DAYS = 7;

function generateInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Returns a pending, unexpired invitation matching the signed-in user's email,
// or null. Used to stop an invited user from auto-provisioning their own
// workspace before they accept (which would strand them in a solo workspace).
async function findPendingInviteForUser(c: C) {
  const user = c.get("user");
  if (!user?.email) return null;
  // A user may have pending invites to several workspaces — take the newest
  // unexpired one. (Avoid .maybeSingle(), which errors on multiple matches.)
  const { data: rows } = await adminClient()
    .from("invitations")
    .select("id, token, workspace_id, role, status, expires_at, email")
    .ilike("email", user.email)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  const now = new Date();
  return (rows ?? []).find((r: any) => !r.expires_at || new Date(r.expires_at) >= now) ?? null;
}

// Create an invitation. Pro-gated (only paying owners build teams) + admin role.
app.post("/workspace/invitations", async (c) => {
  try {
    const gate = await requirePlan(c, "pro");
    if (!gate.user) return gate.response;
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "admin")) return forbidden(c);

    const body = await c.req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "member");
    const team = body.team ? String(body.team).trim() : null;
    if (!email || !email.includes("@")) return c.json({ error: "A valid email is required" }, 400);
    if (!["admin", "member", "viewer"].includes(role)) return c.json({ error: "Invalid role" }, 400);

    const db = adminClient();
    // Already a member of this workspace?
    const { data: alreadyMember } = await db
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", ws.id)
      .ilike("email", email)
      .maybeSingle();
    if (alreadyMember) return c.json({ error: "That person is already a member" }, 409);

    const token = generateInviteToken();
    const expires_at = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000).toISOString();
    // Upsert on (workspace_id, email): re-inviting refreshes the token & expiry.
    const { data: invite, error } = await db
      .from("invitations")
      .upsert(
        {
          workspace_id: ws.id,
          email,
          role,
          team,
          token,
          invited_by: gate.user.id,
          status: "pending",
          expires_at,
          accepted_at: null,
        },
        { onConflict: "workspace_id,email" },
      )
      .select("id, email, role, team, token, status, expires_at, created_at")
      .single();
    if (error) throw error;

    await writeAudit(c, ws.id, "Invited member", email, "Members");
    return c.json({ invitation: invite }, 201);
  } catch (e) {
    console.error("POST /workspace/invitations error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// List pending invitations for the workspace (admin).
app.get("/workspace/invitations", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "admin")) return forbidden(c);
    const { data, error } = await adminClient()
      .from("invitations")
      .select("id, email, role, token, status, expires_at, created_at")
      .eq("workspace_id", ws.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return c.json({ invitations: data ?? [] });
  } catch (e) {
    console.error("GET /workspace/invitations error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// Revoke a pending invitation (admin).
app.delete("/workspace/invitations/:id", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "admin")) return forbidden(c);
    const id = c.req.param("id");
    const db = adminClient();
    const { data: inv } = await db
      .from("invitations")
      .select("id, email, workspace_id")
      .eq("id", id)
      .eq("workspace_id", ws.id)
      .maybeSingle();
    if (!inv) return c.json({ error: "Invitation not found" }, 404);
    await db.from("invitations").update({ status: "revoked" }).eq("id", id);
    await writeAudit(c, ws.id, "Revoked invitation", inv.email, "Members");
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /workspace/invitations/:id error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// Public preview of an invitation (no auth) so the recipient sees who invited
// them and to which workspace before signing in.
app.get("/invitations/:token", async (c) => {
  try {
    const token = c.req.param("token");
    const db = adminClient();
    const { data: inv } = await db
      .from("invitations")
      .select("email, role, status, expires_at, workspace_id, invited_by")
      .eq("token", token)
      .maybeSingle();
    if (!inv) return c.json({ error: "Invitation not found", code: "not_found" }, 404);

    const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
    const status = inv.status === "pending" && expired ? "expired" : inv.status;

    const { data: ws } = await db
      .from("workspaces").select("name").eq("id", inv.workspace_id).maybeSingle();
    let inviterName = "A teammate";
    const { data: inviterProfile } = await db
      .from("profiles").select("full_name, email").eq("user_id", inv.invited_by).maybeSingle();
    if (inviterProfile) inviterName = inviterProfile.full_name || inviterProfile.email || inviterName;

    return c.json({
      email: inv.email,
      role: inv.role,
      status,
      workspace_name: ws?.name ?? "a workspace",
      inviter_name: inviterName,
    });
  } catch (e) {
    console.error("GET /invitations/:token error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// Accept an invitation: link the signed-in user to the workspace as a member.
app.post("/invitations/:token/accept", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const token = c.req.param("token");
    const db = adminClient();

    const { data: inv } = await db
      .from("invitations")
      .select("id, email, role, team, status, expires_at, workspace_id")
      .eq("token", token)
      .maybeSingle();
    if (!inv) return c.json({ error: "Invitation not found", code: "not_found" }, 404);
    if (inv.status !== "pending") return c.json({ error: "This invitation is no longer valid", code: "not_pending" }, 409);
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
      await db.from("invitations").update({ status: "expired" }).eq("id", inv.id);
      return c.json({ error: "This invitation has expired", code: "expired" }, 409);
    }
    // The invite is addressed to a specific email; the accepting account must match.
    if ((user.email ?? "").toLowerCase() !== inv.email.toLowerCase()) {
      return c.json(
        { error: `This invitation was sent to ${inv.email}. Sign in with that email to accept.`, code: "email_mismatch" },
        403,
      );
    }

    // Link membership (idempotent on workspace_id+user_id).
    const { error: memberErr } = await db.from("workspace_members").upsert(
      {
        workspace_id: inv.workspace_id,
        user_id: user.id,
        email: user.email,
        role: inv.role,
        status: "active",
      },
      { onConflict: "workspace_id,user_id" },
    );
    if (memberErr) throw memberErr;

    // Auto-add to team if one was specified during invitation.
    if (inv.team) {
      // Find or create the team.
      let { data: teamRow } = await db
        .from("workspace_teams")
        .select("id")
        .eq("workspace_id", inv.workspace_id)
        .ilike("name", inv.team)
        .maybeSingle();

      if (!teamRow) {
        const { data: created } = await db
          .from("workspace_teams")
          .insert({ workspace_id: inv.workspace_id, name: inv.team.trim(), created_by: inv.invited_by ?? user.id })
          .select("id")
          .single();
        teamRow = created;
      }

      if (teamRow) {
        const initials = (user.user_metadata?.full_name ?? user.email ?? "U")
          .split(" ")
          .map((w: string) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);

        await db.from("workspace_team_members").insert({
          team_id: teamRow.id,
          workspace_id: inv.workspace_id,
          initials,
          name: user.user_metadata?.full_name ?? user.email ?? "Member",
          role: "member",
          status: "online",
          tasks: 0,
        });
      }
    }

    await db.from("invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", inv.id);

    await writeAudit(c, inv.workspace_id, "Joined workspace", user.email ?? "", "Members");

    const { data: ws } = await db
      .from("workspaces").select("name").eq("id", inv.workspace_id).maybeSingle();
    return c.json({ ok: true, workspace_id: inv.workspace_id, workspace_name: ws?.name ?? "", role: inv.role });
  } catch (e) {
    console.error("POST /invitations/:token/accept error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Workspace members (real roster) ───────────────────────────────────────────
// The real list of people in the workspace, from workspace_members joined with
// their profiles. Any active member can read; only admins can change roles or
// remove people.

function memberInitials(name: string, email: string): string {
  const base = (name || "").trim();
  if (base) {
    const p = base.split(/\s+/);
    return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || (email[0] ?? "?").toUpperCase();
  }
  return (email?.[0] ?? "?").toUpperCase();
}

app.get("/workspace/members", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const db = adminClient();
    const { data: rows, error } = await db
      .from("workspace_members")
      .select("user_id, email, role, status, joined_at")
      .eq("workspace_id", ws.id)
      .order("joined_at", { ascending: true });
    if (error) throw error;

    const ids = (rows ?? []).map((r: any) => r.user_id).filter(Boolean);
    const nameById: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: profiles } = await db
        .from("profiles").select("user_id, full_name, email").in("user_id", ids);
      for (const p of profiles ?? []) nameById[p.user_id] = p.full_name || p.email || "";
    }

    const members = (rows ?? []).map((r: any) => {
      const name = (r.user_id && nameById[r.user_id]) || r.email || "Unknown";
      return {
        user_id: r.user_id,
        name,
        email: r.email ?? "",
        role: r.role,
        status: r.status,
        initials: memberInitials(name, r.email ?? ""),
        joined: r.joined_at ? new Date(r.joined_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "",
      };
    });
    return c.json({ members, my_role: ws.role });
  } catch (e) {
    console.error("GET /workspace/members error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// Change a member's role (admin). The owner row can't be changed here.
app.put("/workspace/members/:userId", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "admin")) return forbidden(c);
    const userId = c.req.param("userId");
    const { role } = await c.req.json();
    if (!["admin", "member", "viewer"].includes(role)) return c.json({ error: "Invalid role" }, 400);
    const db = adminClient();
    const { data: target } = await db
      .from("workspace_members").select("role, email").eq("workspace_id", ws.id).eq("user_id", userId).maybeSingle();
    if (!target) return c.json({ error: "Member not found" }, 404);
    if (target.role === "owner") return c.json({ error: "Cannot change the owner's role" }, 400);
    await db.from("workspace_members").update({ role }).eq("workspace_id", ws.id).eq("user_id", userId);
    await writeAudit(c, ws.id, "Changed role", `${target.email} → ${role}`, "Members");
    return c.json({ ok: true });
  } catch (e) {
    console.error("PUT /workspace/members/:userId error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// Remove a member (admin). The owner can't be removed.
app.delete("/workspace/members/:userId", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "admin")) return forbidden(c);
    const userId = c.req.param("userId");
    const db = adminClient();
    const { data: target } = await db
      .from("workspace_members").select("role, email").eq("workspace_id", ws.id).eq("user_id", userId).maybeSingle();
    if (!target) return c.json({ error: "Member not found" }, 404);
    if (target.role === "owner") return c.json({ error: "Cannot remove the workspace owner" }, 400);
    await db.from("workspace_members").delete().eq("workspace_id", ws.id).eq("user_id", userId);
    await writeAudit(c, ws.id, "Removed member", target.email ?? "", "Members");
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /workspace/members/:userId error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Maintenance gate ──────────────────────────────────────────────────────────
// When KV `maintenance` is enabled, non-admin traffic gets 503. Routes needed
// for the landing page, billing, webhooks, and the founder panel stay open.
// (Helpers like isAdminUser are defined below — callbacks run at request time.)
const MAINTENANCE_OPEN_PATHS = new Set([
  "/health",
  "/status",
  "/plans",
  "/profile",
  "/subscription",
  "/payments/webhook",
]);

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const path = c.req.path.replace(/^\/server/, "");
  if (
    MAINTENANCE_OPEN_PATHS.has(path) ||
    path.startsWith("/admin") ||
    path.startsWith("/payments/status")
  ) {
    return next();
  }
  const mt = await kv.get("maintenance");
  if (!mt?.enabled) return next();
  // Reuse the user already resolved by the auth middleware above.
  const user = c.get("user");
  if (user && isAdminUser(user)) return next();
  return c.json(
    {
      error:
        mt.message ||
        "LokaSync is briefly down for maintenance. Please check back soon.",
      code: "maintenance",
    },
    503,
  );
});

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED_TASKS = [
  { id: 1, title: "Implement authentication flow", description: "OAuth2 + JWT session management", status: "in-progress", priority: "high", assignee: "JD", project: "Web Application", due: "Jun 9", completed: false },
  { id: 2, title: "Review design mockups v3", description: "Check spacing and component consistency", status: "review", priority: "medium", assignee: "SW", project: "Mobile App", due: "Jun 9", completed: false },
  { id: 3, title: "Database migration script", description: "PostgreSQL schema update for v2.1", status: "in-progress", priority: "high", assignee: "MJ", project: "Web Application", due: "Jun 10", completed: false },
  { id: 4, title: "Update API documentation", description: "Swagger/OpenAPI spec for new endpoints", status: "todo", priority: "low", assignee: "TB", project: "Web Application", due: "Jun 9", completed: false },
  { id: 5, title: "Fix mobile responsive layout", description: "Breakpoints for tablet view", status: "completed", priority: "medium", assignee: "JS", project: "Mobile App", due: "Jun 8", completed: true },
  { id: 6, title: "Security audit — dependencies", description: "npm audit + Snyk scan", status: "todo", priority: "high", assignee: "JD", project: "Web Application", due: "Jun 12", completed: false },
  { id: 7, title: "Client presentation deck", description: "Q2 progress and Q3 roadmap slides", status: "in-progress", priority: "high", assignee: "SW", project: "Internal", due: "Jun 13", completed: false },
  { id: 8, title: "Unit tests — payment module", description: "Coverage target: 80%", status: "todo", priority: "medium", assignee: "MJ", project: "Web Application", due: "Jun 14", completed: false },
  { id: 9, title: "Updated dependencies", description: "Bumped all npm packages to latest stable versions", status: "completed", priority: "low", assignee: "JS", project: "Web Application", due: "Jun 7", completed: true },
  { id: 10, title: "Code review completed", description: "Reviewed PR #42 — auth module refactor", status: "completed", priority: "medium", assignee: "JD", project: "Web Application", due: "Jun 7", completed: true },
  { id: 11, title: "Test new feature", description: "QA testing for dashboard filter enhancements", status: "review", priority: "medium", assignee: "TB", project: "Web Application", due: "Jun 9", completed: false },
];

const SEED_PROJECTS = [
  { id: 1, name: "Web Application v2", description: "Full-stack rewrite with Next.js and PostgreSQL. New auth layer, admin panel, and API gateway.", status: "active", progress: 64, tasks: { total: 84, done: 54 }, team: ["JD", "MJ", "JS", "TB"], due: "Jul 15, 2026", tags: ["frontend", "backend"] },
  { id: 2, name: "Mobile App — iOS & Android", description: "React Native port of the core platform. Focus on offline-first data sync and push notifications.", status: "active", progress: 38, tasks: { total: 52, done: 20 }, team: ["SW", "TB"], due: "Aug 30, 2026", tags: ["mobile", "react-native"] },
  { id: 3, name: "Design System", description: "Unified component library across all products. Storybook + Figma tokens sync.", status: "active", progress: 81, tasks: { total: 36, done: 29 }, team: ["SW", "JS"], due: "Jun 30, 2026", tags: ["design", "components"] },
  { id: 4, name: "Data Pipeline Refactor", description: "Replace cron-based ETL with event-driven architecture using Kafka and dbt.", status: "paused", progress: 22, tasks: { total: 28, done: 6 }, team: ["MJ", "JD"], due: "Sep 15, 2026", tags: ["data", "infrastructure"] },
  { id: 5, name: "Customer Portal", description: "Self-service portal for enterprise clients. Billing, usage analytics, and support tickets.", status: "completed", progress: 100, tasks: { total: 44, done: 44 }, team: ["JD", "SW", "TB"], due: "May 20, 2026", tags: ["frontend", "billing"] },
  { id: 6, name: "API v3 Migration", description: "Breaking changes cleanup and REST-to-GraphQL migration for core data models.", status: "active", progress: 15, tasks: { total: 62, done: 9 }, team: ["MJ", "JS"], due: "Oct 1, 2026", tags: ["api", "graphql"] },
];

const SEED_TEAMS = [
  {
    name: "Development",
    description: "Core platform engineering — frontend, backend, and infrastructure.",
    members: [
      { initials: "JD", name: "John Doe", role: "Lead Engineer", status: "online", tasks: 18 },
      { initials: "MJ", name: "Mike Johnson", role: "Backend Engineer", status: "online", tasks: 12 },
      { initials: "JS", name: "Jane Smith", role: "Frontend Engineer", status: "away", tasks: 9 },
      { initials: "AL", name: "Amy Liu", role: "DevOps Engineer", status: "offline", tasks: 6 },
    ],
  },
  {
    name: "Design",
    description: "Product design, design system, and UX research.",
    members: [
      { initials: "SW", name: "Sarah Wilson", role: "Design Lead", status: "online", tasks: 11 },
      { initials: "TB", name: "Tom Brown", role: "Product Designer", status: "online", tasks: 8 },
    ],
  },
  {
    name: "Quality Assurance",
    description: "Testing, QA automation, and release validation.",
    members: [
      { initials: "RC", name: "Rachel Chen", role: "QA Lead", status: "online", tasks: 14 },
      { initials: "DK", name: "David Kim", role: "QA Engineer", status: "away", tasks: 9 },
      { initials: "LP", name: "Laura Park", role: "Automation Engineer", status: "online", tasks: 7 },
    ],
  },
  {
    name: "Product Management",
    description: "Roadmap planning, stakeholder alignment, and sprint facilitation.",
    members: [
      { initials: "EM", name: "Elena Martinez", role: "Product Manager", status: "online", tasks: 21 },
      { initials: "BH", name: "Ben Harris", role: "Product Analyst", status: "offline", tasks: 5 },
    ],
  },
  {
    name: "Marketing",
    description: "Brand strategy, content marketing, growth campaigns, and social media.",
    members: [
      { initials: "NR", name: "Nina Rodriguez", role: "Marketing Lead", status: "online", tasks: 15 },
      { initials: "KT", name: "Kevin Tan", role: "Content Strategist", status: "online", tasks: 10 },
      { initials: "PL", name: "Priya Lakshmi", role: "Growth Marketer", status: "away", tasks: 7 },
    ],
  },
  {
    name: "Sales",
    description: "Revenue growth, client acquisition, and partnership development.",
    members: [
      { initials: "RH", name: "Ryan Hughes", role: "Sales Manager", status: "online", tasks: 13 },
      { initials: "SA", name: "Siti Aminah", role: "Account Executive", status: "online", tasks: 9 },
      { initials: "CM", name: "Carlos Mendez", role: "Business Development", status: "offline", tasks: 6 },
    ],
  },
  {
    name: "Customer Success",
    description: "Client onboarding, retention, support operations, and feedback loops.",
    members: [
      { initials: "LW", name: "Lisa Wang", role: "Customer Success Lead", status: "online", tasks: 16 },
      { initials: "AT", name: "Arif Triyono", role: "Support Engineer", status: "away", tasks: 11 },
    ],
  },
  {
    name: "Data & Analytics",
    description: "Data engineering, business intelligence, and reporting dashboards.",
    members: [
      { initials: "NK", name: "Nathan Kim", role: "Data Lead", status: "online", tasks: 12 },
      { initials: "RS", name: "Rina Sari", role: "Data Analyst", status: "online", tasks: 8 },
      { initials: "OP", name: "Oscar Perez", role: "Data Engineer", status: "offline", tasks: 5 },
    ],
  },
  {
    name: "Human Resources",
    description: "Recruitment, people operations, culture, and employee development.",
    members: [
      { initials: "MA", name: "Maya Anwar", role: "HR Manager", status: "online", tasks: 14 },
      { initials: "DT", name: "Daniel Torres", role: "Recruiter", status: "away", tasks: 10 },
    ],
  },
  {
    name: "Finance & Operations",
    description: "Budgeting, procurement, compliance, and operational efficiency.",
    members: [
      { initials: "HF", name: "Hana Fitriani", role: "Finance Manager", status: "online", tasks: 11 },
      { initials: "WG", name: "William Garcia", role: "Operations Analyst", status: "offline", tasks: 6 },
    ],
  },
];

const SEED_CALENDAR = {
  "2026-6-8": [
    { title: "Team Standup", tag: "9:00 AM", color: "#6366f1" },
    { title: "Client Call", tag: "2:00 PM", color: "#3b82f6" },
    { title: "Project Review", tag: "4:00 PM", color: "#8b5cf6" },
  ],
  "2026-6-10": [{ title: "Release v2.1", tag: "All day", color: "#10b981" }],
  "2026-6-11": [{ title: "Design Sync", tag: "11:00 AM", color: "#f59e0b" }],
  "2026-6-13": [{ title: "Team Building", tag: "All day", color: "#ec4899" }],
  "2026-6-15": [{ title: "Quarterly Review", tag: "10:00 AM", color: "#ef4444" }],
  "2026-6-17": [{ title: "Board Meeting", tag: "3:00 PM", color: "#f97316" }],
  "2026-6-20": [{ title: "Product Demo", tag: "2:00 PM", color: "#6366f1" }],
  "2026-6-22": [{ title: "Sprint Review", tag: "4:00 PM", color: "#8b5cf6" }],
  "2026-6-25": [{ title: "Retrospective", tag: "11:00 AM", color: "#10b981" }],
  "2026-6-30": [{ title: "Month Close", tag: "5:00 PM", color: "#f59e0b" }],
};

const SEED_FILES = [
  { name: "Project Proposal — Web App v2.pdf", type: "pdf", size: "2.4 MB", modified: "Jun 7, 2026", owner: "JD", shared: true, archived: false },
  { name: "Design System Documentation.figma", type: "figma", size: "18.1 MB", modified: "Jun 6, 2026", owner: "SW", shared: true, archived: false },
  { name: "Meeting Notes — Sprint 24.docx", type: "doc", size: "128 KB", modified: "Jun 5, 2026", owner: "EM", shared: false, archived: false },
  { name: "API Reference v3.pdf", type: "pdf", size: "5.7 MB", modified: "Jun 4, 2026", owner: "MJ", shared: true, archived: false },
  { name: "Onboarding Checklist.sheet", type: "sheet", size: "64 KB", modified: "Jun 3, 2026", owner: "JD", shared: true, archived: false },
  { name: "App Screenshots — iOS.zip", type: "image", size: "34.2 MB", modified: "Jun 2, 2026", owner: "SW", shared: false, archived: false },
  { name: "Infrastructure Diagram.diagram", type: "diagram", size: "1.1 MB", modified: "Jun 1, 2026", owner: "AL", shared: true, archived: false },
  { name: "Q2 Budget Summary.sheet", type: "sheet", size: "512 KB", modified: "May 30, 2026", owner: "EM", shared: false, archived: false },
  { name: "Old Brand Guidelines.pdf", type: "pdf", size: "4.1 MB", modified: "Jan 12, 2026", owner: "SW", shared: false, archived: true },
  { name: "Legacy API Docs.doc", type: "doc", size: "890 KB", modified: "Feb 3, 2026", owner: "MJ", shared: false, archived: true },
  { name: "2025 Roadmap.sheet", type: "sheet", size: "220 KB", modified: "Dec 15, 2025", owner: "EM", shared: true, archived: true },
  { name: "Old Logo Pack.zip", type: "image", size: "12.4 MB", modified: "Nov 5, 2025", owner: "SW", shared: false, archived: true },
  { name: "Deprecated Auth Module.code", type: "code", size: "78 KB", modified: "Oct 20, 2025", owner: "JD", shared: false, archived: true },
];

const SEED_FOLDERS = [
  { name: "Design Assets", files: 3, modified: "Jun 6, 2026" },
  { name: "Engineering Docs", files: 3, modified: "Jun 4, 2026" },
  { name: "Client Deliverables", files: 2, modified: "Jun 7, 2026" },
  { name: "Archive — 2025", files: 1, modified: "Jan 12, 2026" },
];

const SEED_PROFILE = {
  firstName: "John",
  lastName: "Doe",
  email: "john.doe@acme.io",
  phone: "+1 (555) 012-3456",
  title: "Lead Engineer",
  department: "Engineering",
  bio: "Full-stack engineer with 8+ years of experience building scalable web applications.",
  github: "https://github.com/johndoe",
  linkedin: "https://linkedin.com/in/johndoe",
  securityPrefs: { trustedDevices: true, loginNotifications: true, sessionTimeout: false },
};

const SEED_WORKSPACE = {
  name: "Acme Corp",
  url: "acme-corp",
  industry: "Technology",
  teamSize: "11-50",
  region: "US",
  workspacePrefs: { showCompletedTasks: false, compactView: false, publicProjectLinks: true, require2FA: false, guestAccess: true },
  dataPrefs: { autoArchiveCompleted: false, autoDeleteArchived: false, retainAuditLogs: true },
};

const SEED_NOTIFICATIONS = {
  inApp: true, email: true, slack: false, browser: false,
  taskAssigned: true, taskDue: true, taskStatus: false, comments: true, mentions: true,
  projectStatus: false, newMember: false, milestone: true,
  teamMember: false, announcements: true,
  digest: true, productUpdates: false, security: true,
  defaults: {
    taskAssigned: true, taskDue: true, comments: true, projectStatus: false,
    newMember: false, digest: true, productUpdates: false, security: true,
  },
};

const SEED_APPEARANCE = {
  theme: "dark",
  accent: "indigo",
  fontSize: "medium",
  sidebarPosition: "left",
  density: "comfortable",
};

const SEED_TIMEZONE = {
  timezone: "America/New_York",
  dateFormat: "MM/DD/YYYY",
  timeFormat: "12h",
  firstDay: "Monday",
  autoDetect: false,
};

const SEED_MEMBERS = {
  rows: [
    { initials: "JD", name: "John Doe", email: "john.doe@acme.io", role: "Owner", status: "Active", joined: "Jan 2025" },
    { initials: "SW", name: "Sarah Wilson", email: "sarah.wilson@acme.io", role: "Admin", status: "Active", joined: "Feb 2025" },
    { initials: "MJ", name: "Mike Johnson", email: "mike.johnson@acme.io", role: "Member", status: "Active", joined: "Mar 2025" },
    { initials: "JS", name: "Jane Smith", email: "jane.smith@acme.io", role: "Member", status: "Active", joined: "Mar 2025" },
    { initials: "TB", name: "Tom Brown", email: "tom.brown@acme.io", role: "Member", status: "Active", joined: "Apr 2025" },
    { initials: "RC", name: "Rachel Chen", email: "rachel.chen@acme.io", role: "Member", status: "Active", joined: "Apr 2025" },
    { initials: "DK", name: "David Kim", email: "david.kim@acme.io", role: "Member", status: "Active", joined: "May 2025" },
    { initials: "LP", name: "Laura Park", email: "laura.park@acme.io", role: "Member", status: "Active", joined: "May 2025" },
    { initials: "EM", name: "Elena Martinez", email: "elena.martinez@acme.io", role: "Admin", status: "Active", joined: "Jan 2025" },
    { initials: "BH", name: "Ben Harris", email: "ben.harris@acme.io", role: "Viewer", status: "Active", joined: "Jun 2025" },
    { initials: "AL", name: "Amy Liu", email: "amy.liu@acme.io", role: "Member", status: "Active", joined: "Jun 2025" },
  ],
  pending: [
    { email: "chris.taylor@acme.io", role: "Member", sent: "Jun 5, 2026" },
    { email: "diana.lee@partner.com", role: "Viewer", sent: "Jun 7, 2026" },
  ],
};

const SEED_BILLING = {
  plan: "Pro",
  price: 29,
  seats: 11,
  nextBilling: "Jul 8, 2026",
  usage: { members: 11, memberLimit: 50, projects: 4, projectLimit: 10, storage: 8.2, storageLimit: 50 },
  payment: { brand: "Visa", last4: "4242", expiry: "12/27" },
  invoices: [
    { date: "Jun 8, 2026", amount: "$319.00", status: "Paid" },
    { date: "May 8, 2026", amount: "$319.00", status: "Paid" },
    { date: "Apr 8, 2026", amount: "$290.00", status: "Paid" },
    { date: "Mar 8, 2026", amount: "$290.00", status: "Paid" },
  ],
};

const SEED_API_KEYS = [
  { id: 1, name: "Production API Key", prefix: "sk_live_xKq2", created: "Jan 15, 2026", lastUsed: "Jun 7, 2026" },
  { id: 2, name: "Development Key", prefix: "sk_dev_mN8p", created: "Mar 2, 2026", lastUsed: "Jun 8, 2026" },
];

const SEED_WEBHOOKS = [
  { id: 1, name: "Slack Notifications", url: "https://hooks.slack.com/services/xxx", events: ["task.created", "task.completed"], active: true },
  { id: 2, name: "CI/CD Pipeline", url: "https://ci.acme.io/webhook/deploy", events: ["project.updated"], active: false },
];

// Audit log starts empty — entries are written by writeAudit() as real actions
// happen in the workspace. (Legacy demo rows are filtered out on read.)
const SEED_AUDIT_LOG: any[] = [];

// ── Helper ────────────────────────────────────────────────────────────────────

async function getOrSeed(key: string, seed: any): Promise<any> {
  let data = await kv.get(key);
  if (data === undefined || data === null) {
    await kv.set(key, seed);
    data = seed;
  }
  return data;
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (c) => c.json({ status: "ok" }));

// ── Profile (authenticated) ───────────────────────────────────────────────────
// Source of truth for user profile data: KV key `profile:{userId}`.
// Reused later for Midtrans customer_details (phase 6).

// ── Plan entitlements (server-side gating) ────────────────────────────────────
// Effective plan is derived ONLY from `subscription:{userId}` (lazily expired
// on read, same rule as GET /subscription). Client PlanGate is UI-only sugar.

const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, business: 2 };
const FREE_MAX_PROJECTS = 3;

async function getEffectivePlanId(userId: string): Promise<string> {
  const subscription = await getSubscriptionForUser(userId);
  return subscription?.status === "active" ? subscription.plan_id : "free";
}

// Resolves the authed user iff their plan rank reaches `min`; otherwise returns
// the 401/403 response the route should send.
async function requirePlan(c: C, min: "pro" | "business") {
  const user = await getAuthedUser(c);
  if (!user) {
    return { user: null, response: c.json({ error: "Unauthorized" }, 401) };
  }
  const planId = await getEffectivePlanId(user.id);
  if ((PLAN_RANK[planId] ?? 0) < PLAN_RANK[min]) {
    return {
      user: null,
      response: c.json(
        {
          error: `This feature requires the ${min} plan`,
          code: "plan_required",
          required_plan: min,
        },
        403,
      ),
    };
  }
  return { user, response: null };
}

// ── Founder/admin access ──────────────────────────────────────────────────────
// Admins are identified by email via the ADMIN_EMAILS secret (comma-separated).
// Set with: npx supabase secrets set ADMIN_EMAILS=you@example.com --project-ref …

// Admin emails are read from the ADMIN_EMAILS env var only.
// Set ADMIN_EMAILS in Supabase Edge Function secrets before deploying.
// Cache admin emails at module load — env var doesn't change during a request.
let _adminEmails: string[] | null = null;
const adminEmails = (): string[] => {
  if (_adminEmails) return _adminEmails;
  const fromEnv = (Deno.env.get("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  _adminEmails = [...new Set(fromEnv)];
  return _adminEmails;
};

const isAdminUser = (user: any) =>
  !!user?.email && adminEmails().includes(String(user.email).toLowerCase());

async function requireAdmin(c: C) {
  const user = await getAuthedUser(c);
  if (!user) {
    return { user: null, response: c.json({ error: "Unauthorized" }, 401) };
  }
  if (!isAdminUser(user)) {
    return { user: null, response: c.json({ error: "Forbidden" }, 403) };
  }
  return { user, response: null };
}

// Public service status — the client uses this to render the maintenance screen
app.get("/status", async (c) => {
  try {
    const mt = await kv.get("maintenance");
    return c.json({
      maintenance: {
        enabled: !!mt?.enabled,
        message: mt?.message ?? "",
      },
    });
  } catch (e) {
    console.error("GET /status error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// -- TOTP 2FA helpers ----------------------------------------------------------

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function bytesToBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32ToBytes(base32: string): Uint8Array {
  const cleaned = base32.toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(cleaned[i]);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return new Uint8Array(sig);
}

function uint64ToBytes(counter: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setBigUint64(0, BigInt.asUintN(64, BigInt(counter)), false);
  return new Uint8Array(buf);
}

async function hotp(secret: string, counter: number, digits = 6): Promise<string> {
  const hash = await hmacSha1(base32ToBytes(secret), uint64ToBytes(counter));
  const offset = hash[hash.length - 1] & 0x0f;
  const code = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16) | ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
  return String(code % Math.pow(10, digits)).padStart(digits, "0");
}

async function totp(secret: string, window = 0, step = 30): Promise<string> {
  const counter = Math.floor(Date.now() / 1000 / step) + window;
  return hotp(secret, counter);
}

function generateSecret(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return bytesToBase32(bytes);
}

function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()
  );
}

async function verifyTotp(secret: string, code: string): Promise<boolean> {
  for (let w = -1; w <= 1; w++) {
    if (await totp(secret, w) === code) return true;
  }
  return false;
}

app.get("/profile", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const profile = await getOrCreateProfile(user.id, user.email ?? "");
    return c.json({ profile: profile ?? null });
  } catch (e) {
    console.error("GET /profile error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Plans ─────────────────────────────────────────────────────────────────────
// ── Relational billing helpers ───────────────────────────────────────────────
// profiles, plans, subscriptions, and transactions are now stored in relational
// tables. The helpers below keep the route handlers clean and consistent.

async function seedPlansIfEmpty(): Promise<any[]> {
  const db = adminClient();
  const { data: existing } = await db.from("plans").select("id");
  if (existing && existing.length > 0) {
    return (await db.from("plans").select("*").order("monthly", { ascending: true })).data ?? [];
  }
  const plans = SEED_PLANS.map((p) => ({ ...p }));
  const { data, error } = await db.from("plans").insert(plans).select("*");
  if (error) throw error;
  return data ?? [];
}

// Re-upsert every plan from SEED_PLANS — used to self-heal a `plans` table
// whose paid rows have been zeroed out (e.g. by a prior buggy migration).
async function reseedPlansFromSeed(): Promise<any[]> {
  const db = adminClient();
  for (const p of SEED_PLANS) {
    await db.from("plans").upsert({
      id: p.id, name: p.name, description: p.description,
      currency: p.currency, monthly: p.monthly, yearly: p.yearly,
      features: p.features, highlighted: !!p.highlighted,
    }, { onConflict: "id" });
  }
  const { data } = await db.from("plans").select("*").order("monthly", { ascending: true });
  return data ?? SEED_PLANS;
}

// Normalise a plan row from whatever shape the DB returns into the canonical
// client shape ({ id, name, description, currency, monthly, yearly, features,
// highlighted }). Handles two known schemas:
//   - new schema (this codebase): { id, monthly, yearly, ... }
//   - legacy schema (older deploy): { plan_id, monthly_price, yearly_price, price, ... }
function normalisePlanRow(row: any) {
  const id = row.id ?? row.plan_id;
  const monthly = Number(row.monthly) || Number(row.monthly_price) || Number(row.price) || 0;
  const yearly = Number(row.yearly) || Number(row.yearly_price) || monthly * 12;
  return {
    id,
    name: row.name ?? id,
    description: row.description ?? "",
    currency: row.currency ?? "IDR",
    monthly,
    yearly,
    features: Array.isArray(row.features) ? row.features : [],
    highlighted: !!row.highlighted,
  };
}

async function getPlans(): Promise<any[]> {
  // Always fall back to SEED_PLANS so pricing/checkout never shows Rp 0 just
  // because the `plans` table is missing (migration not yet run) or empty.
  try {
    const db = adminClient();
    const { data, error } = await db.from("plans").select("*");
    if (error) throw error;
    if (data && data.length > 0) {
      const normalised = data.map(normalisePlanRow);
      // Self-heal: a paid plan with monthly === 0 across BOTH schemas means
      // every price column is zero — restore from SEED_PLANS.
      const corrupted = normalised.some(
        (row) => row.id !== "free" && (!row.monthly || row.monthly <= 0),
      );
      if (corrupted) {
        console.warn("getPlans: detected zero-priced paid plan, falling back to SEED_PLANS");
        return SEED_PLANS;
      }
      // Sort by monthly price ascending after normalisation.
      normalised.sort((a, b) => a.monthly - b.monthly);
      return normalised;
    }
    try {
      const seeded = await seedPlansIfEmpty();
      if (seeded.length > 0) return seeded.map(normalisePlanRow);
    } catch (seedErr) {
      console.error("seedPlansIfEmpty failed, using in-memory SEED_PLANS:", seedErr);
    }
    return SEED_PLANS;
  } catch (e) {
    console.error("getPlans DB error, using in-memory SEED_PLANS:", e);
    return SEED_PLANS;
  }
}

async function getPlanById(planId: string) {
  const plans = await getPlans();
  return plans.find((p: any) => p.id === planId) ?? null;
}

// `user_id` is the auth uid and the table's unique key; `id` is a surrogate
// primary key with its own default. All reads/writes key off `user_id` so we
// never collide with the unique constraint or accidentally insert a duplicate.
async function getOrCreateProfile(userId: string, email: string) {
  const db = adminClient();
  const existing = await db.from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.data) return existing.data;
  // Fall back to auth user_metadata for accounts created before the table existed.
  const { data: { user } } = await adminClient().auth.admin.getUserById(userId);
  const meta = user?.user_metadata ?? {};
  return upsertProfile(userId, {
    email,
    full_name: meta.full_name ?? email,
    phone: meta.phone ?? "",
    job_title: meta.job_title ?? "",
    company: meta.company ?? "",
  });
}

async function upsertProfile(userId: string, input: {
  email: string;
  full_name: string;
  phone?: string;
  job_title?: string;
  company?: string;
}) {
  const db = adminClient();
  // Upsert on `user_id` so a repeat call updates the existing row instead of
  // inserting a duplicate (which would violate profiles_user_id_key).
  const { data, error } = await db.from("profiles")
    .upsert({ user_id: userId, ...input }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) {
    // Defensive: if the conflict target isn't recognised (schema variance) or a
    // race slipped a row in, fall back to updating the existing row by user_id
    // rather than surfacing a hard duplicate-key error to the user.
    const recovered = await db.from("profiles")
      .update(input)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (recovered.data) return recovered.data;
    throw error;
  }
  return data;
}

async function getSubscriptionForUser(userId: string) {
  const db = adminClient();
  const { data } = await db.from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  // Lazy expiration check
  if (data.status === "active" && data.current_period_end && new Date(data.current_period_end) < new Date()) {
    const updated = { ...data, status: "expired" };
    await db.from("subscriptions").update({ status: "expired" }).eq("id", data.id);
    return updated;
  }
  return data;
}

// Founders/admins get a complimentary Business plan valid for 1 year. Idempotent:
// only provisions/refreshes when they don't already have an active Business sub
// with at least ~11 months remaining, so it self-heals after expiry too.
async function ensureAdminSubscription(user: any) {
  if (!isAdminUser(user)) return;
  try {
    const existing = await getSubscriptionForUser(user.id);
    const elevenMonthsOut = new Date();
    elevenMonthsOut.setMonth(elevenMonthsOut.getMonth() + 11);
    const stillGood =
      existing?.status === "active" &&
      existing.plan_id === "business" &&
      existing.current_period_end &&
      new Date(existing.current_period_end) > elevenMonthsOut;
    if (stillGood) return;

    const now = new Date();
    const oneYear = new Date(now);
    oneYear.setFullYear(oneYear.getFullYear() + 1);
    await upsertSubscription({
      user_id: user.id,
      plan_id: "business",
      interval: "yearly",
      status: "active",
      order_id: `ADMIN-COMP-${user.id.slice(0, 8).toUpperCase()}`,
      started_at: now.toISOString(),
      current_period_end: oneYear.toISOString(),
    });
  } catch (e) {
    console.error("ensureAdminSubscription failed:", e);
  }
}

async function upsertSubscription(sub: {
  user_id: string;
  plan_id: string;
  interval: string;
  status: string;
  order_id: string;
  started_at: string;
  current_period_end: string;
}) {
  const db = adminClient();
  const { data: existing } = await db.from("subscriptions")
    .select("id")
    .eq("user_id", sub.user_id)
    .maybeSingle();
  if (existing) {
    const { data, error } = await db.from("subscriptions")
      .update(sub)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from("subscriptions").insert(sub).select("*").single();
  if (error) throw error;
  return data;
}

async function getTransactionByOrderId(orderId: string) {
  const db = adminClient();
  const { data } = await db.from("transactions")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  return data;
}

async function upsertTransaction(tx: any) {
  const db = adminClient();
  const { data: existing } = await db.from("transactions")
    .select("id")
    .eq("order_id", tx.order_id)
    .maybeSingle();
  if (existing) {
    const { data, error } = await db.from("transactions")
      .update(tx)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from("transactions").insert(tx).select("*").single();
  if (error) throw error;
  return data;
}

async function getTransactionsForUser(userId: string, limit = 20) {
  const db = adminClient();
  const { data, error } = await db.from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Plans (incl. prices) are defined ONLY here. Checkout (phase 5/6) must read
// prices from the `plans` relational table — never trust amounts sent by the client.

const SEED_PLANS = [
  {
    id: "free",
    name: "Free",
    description: "For individuals getting started with LokaSync.",
    currency: "IDR",
    monthly: 0,
    yearly: 0,
    features: [
      "Up to 3 projects",
      "Basic task management",
      "Calendar view",
      "1 GB file storage",
    ],
    highlighted: false,
  },
  {
    id: "pro",
    name: "Pro",
    description: "For small teams that need the full toolkit.",
    currency: "IDR",
    monthly: 99000,
    yearly: 990000,
    features: [
      "Unlimited projects",
      "Analytics & reporting",
      "Team management",
      "25 GB file storage",
      "Priority email support",
    ],
    highlighted: true,
  },
  {
    id: "business",
    name: "Business",
    description: "For growing companies with advanced needs.",
    currency: "IDR",
    monthly: 299000,
    yearly: 2990000,
    features: [
      "Everything in Pro",
      "Advanced dashboards & forecasting",
      "Unlimited file storage",
      "Audit log & API access",
      "Dedicated support",
    ],
    highlighted: false,
  },
];

async function getPlansFromKv(): Promise<any[]> {
  // Backwards-compatible alias: plans now live in the relational table.
  return getPlans();
}

app.get("/plans", async (c) => {
  try {
    const plans = await getPlans();
    return c.json(plans);
  } catch (e) {
    console.error("GET /plans error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Vouchers ──────────────────────────────────────────────────────────────────
// Stored as `voucher:{CODE}`. Validation only computes the discount — a voucher
// is marked used exclusively by the payment webhook after settlement (phase 6).

const SEED_VOUCHERS = [
  {
    code: "LOKA20",
    type: "percent",
    value: 20,
    active: true,
    expires_at: "2026-12-31T16:59:59Z",
    max_uses: 100,
    used_count: 0,
    applies_to: null, // all paid plans
  },
  {
    code: "WELCOME50",
    type: "fixed",
    value: 50000,
    active: true,
    expires_at: null,
    max_uses: null,
    used_count: 0,
    applies_to: ["pro", "business"],
  },
];

app.post("/vouchers/validate", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    // Rate limit: max 10 voucher validations per hour
    if (!await checkRateLimit(`voucher:${user.id}`, 10, 60 * 60 * 1000)) {
      return c.json({ error: "Too many attempts. Please try again later.", code: "rate_limited" }, 429);
    }

    const body = await c.req.json();
    const code = String(body.code ?? "").trim().toUpperCase();
    const planId = String(body.plan_id ?? "");
    const interval = body.interval === "yearly" ? "yearly" : "monthly";
    if (!code) return c.json({ valid: false, reason: "Enter a voucher code" });

    const plans = await getPlansFromKv();
    const plan = plans.find((p: any) => p.id === planId);
    if (!plan || plan.monthly === 0) {
      return c.json({ valid: false, reason: "Invalid plan" });
    }
    const base = interval === "yearly" ? plan.yearly : plan.monthly;

    let voucher = await kv.get(`voucher:${code}`);
    if (!voucher) {
      const seed = SEED_VOUCHERS.find((v) => v.code === code);
      if (seed) {
        voucher = seed;
        await kv.set(`voucher:${code}`, seed);
      }
    }

    if (!voucher || !voucher.active) {
      return c.json({ valid: false, reason: "This voucher code is not valid" });
    }
    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      return c.json({ valid: false, reason: "This voucher has expired" });
    }
    if (voucher.max_uses != null && voucher.used_count >= voucher.max_uses) {
      return c.json({ valid: false, reason: "This voucher has reached its usage limit" });
    }
    if (voucher.applies_to && !voucher.applies_to.includes(plan.id)) {
      return c.json({ valid: false, reason: `This voucher does not apply to the ${plan.name} plan` });
    }

    const discount =
      voucher.type === "percent"
        ? Math.round((base * voucher.value) / 100)
        : Math.min(voucher.value, base);

    return c.json({
      valid: true,
      code: voucher.code,
      type: voucher.type,
      value: voucher.value,
      base,
      discount,
      total: base - discount,
    });
  } catch (e) {
    console.error("POST /vouchers/validate error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Payments (Midtrans Snap) ──────────────────────────────────────────────────
// Server key lives ONLY in Edge Function secrets. Amounts are computed
// server-side from the `plans` KV record; the client never sends an amount.
// Subscription state transitions happen only from verified Midtrans data:
// the webhook (SHA512-verified) or a server-to-Midtrans status fetch.

const midtransConfig = () => {
  const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
  const clientKey = Deno.env.get("MIDTRANS_CLIENT_KEY");
  const isProduction = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";
  if (!serverKey || !clientKey) return null;
  return {
    serverKey,
    clientKey,
    isProduction,
    snapBase: isProduction
      ? "https://app.midtrans.com/snap/v1"
      : "https://app.sandbox.midtrans.com/snap/v1",
    apiBase: isProduction
      ? "https://api.midtrans.com/v2"
      : "https://api.sandbox.midtrans.com/v2",
  };
};

const periodEnd = (interval: string, from: Date) => {
  const d = new Date(from);
  if (interval === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
};

// Maps a Midtrans transaction_status (+ fraud_status) to our internal status.
const mapStatus = (txStatus: string, fraudStatus?: string) => {
  if (txStatus === "settlement") return "paid";
  if (txStatus === "capture") {
    return fraudStatus === "challenge" ? "pending" : "paid";
  }
  if (txStatus === "pending") return "pending";
  if (["deny", "cancel", "expire", "failure"].includes(txStatus)) return "failed";
  return "pending";
};

// Idempotently applies verified Midtrans data to a transaction; on first
// transition to paid it activates the subscription and consumes the voucher.
async function applyTransactionStatus(tx: any, midtransData: any) {
  const db = adminClient();
  const status = mapStatus(midtransData.transaction_status, midtransData.fraud_status);
  if (tx.status === status) return tx;
  const now = new Date().toISOString();
  const alreadyPaid = tx.status === "paid";
  const updatedTx = {
    ...tx,
    status,
    midtrans_data: {
      ...(tx.midtrans_data ?? {}),
      transaction_status: midtransData.transaction_status,
      fraud_status: midtransData.fraud_status ?? null,
      payment_type: midtransData.payment_type ?? null,
      transaction_time: midtransData.transaction_time ?? null,
    },
    payment_type: midtransData.payment_type ?? tx.payment_type ?? null,
    updated_at: now,
  };
  await upsertTransaction(updatedTx);

  if (status === "paid" && !alreadyPaid) {
    const started = new Date();
    const existing = await getSubscriptionForUser(tx.user_id);
    const extendsExisting =
      existing?.status === "active" &&
      existing.plan_id === tx.plan_id &&
      existing.current_period_end &&
      new Date(existing.current_period_end) > started;
    const periodBase = extendsExisting
      ? new Date(existing.current_period_end)
      : started;
    await upsertSubscription({
      user_id: tx.user_id,
      plan_id: tx.plan_id,
      interval: tx.interval,
      status: "active",
      order_id: tx.order_id,
      started_at: extendsExisting ? existing.started_at : started.toISOString(),
      current_period_end: periodEnd(tx.interval, periodBase),
    });
    if (tx.voucher_code) {
      const voucher = await kv.get(`voucher:${tx.voucher_code}`);
      if (voucher) {
        voucher.used_count = (voucher.used_count ?? 0) + 1;
        await kv.set(`voucher:${tx.voucher_code}`, voucher);
      }
    }
  }
  return updatedTx;
}

app.post("/payments/checkout", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    // Rate limit: max 3 checkouts per hour per user
    if (!await checkRateLimit(`checkout:${user.id}`, 3, 60 * 60 * 1000)) {
      return c.json({ error: "Too many checkout attempts. Please try again later.", code: "rate_limited" }, 429);
    }

    const config = midtransConfig();
    if (!config) {
      return c.json(
        { error: "Payments are not configured yet (missing Midtrans keys)" },
        503,
      );
    }

    const profile = await getOrCreateProfile(user.id, user.email ?? "");
    if (!profile) return c.json({ error: "Complete your profile first" }, 400);

    const body = await c.req.json();
    const planId = String(body.plan_id ?? "");
    const interval = body.interval === "yearly" ? "yearly" : "monthly";
    const voucherCode = body.voucher_code
      ? String(body.voucher_code).trim().toUpperCase()
      : null;

    const plan = await getPlanById(planId);
    if (!plan || plan.monthly === 0) return c.json({ error: "Invalid plan" }, 400);
    const base = interval === "yearly" ? plan.yearly : plan.monthly;

    // Recompute the voucher server-side — never trust client totals
    let discount = 0;
    if (voucherCode) {
      const voucher = await kv.get(`voucher:${voucherCode}`);
      const usable =
        voucher &&
        voucher.active &&
        (!voucher.expires_at || new Date(voucher.expires_at) >= new Date()) &&
        (voucher.max_uses == null || voucher.used_count < voucher.max_uses) &&
        (!voucher.applies_to || voucher.applies_to.includes(plan.id));
      if (!usable) return c.json({ error: "This voucher code is not valid" }, 400);
      discount =
        voucher.type === "percent"
          ? Math.round((base * voucher.value) / 100)
          : Math.min(voucher.value, base);
    }
    const total = base - discount;

    const orderId = `LOKA-${Date.now().toString(36).toUpperCase()}-${crypto
      .randomUUID()
      .slice(0, 8)
      .toUpperCase()}`;

    const itemDetails = [
      {
        id: `${plan.id}-${interval}`,
        price: base,
        quantity: 1,
        name: `LokaSync ${plan.name} — ${interval}`,
      },
    ];
    if (discount > 0) {
      itemDetails.push({
        id: `voucher-${voucherCode}`,
        price: -discount,
        quantity: 1,
        name: `Voucher ${voucherCode}`,
      });
    }

    const origin = c.req.header("Origin") ?? "";
    const snapRes = await fetch(`${config.snapBase}/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${btoa(config.serverKey + ":")}`,
      },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: total },
        item_details: itemDetails,
        customer_details: {
          first_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
        },
        ...(origin ? { callbacks: { finish: `${origin}/payment/finish` } } : {}),
      }),
    });
    if (!snapRes.ok) {
      const detail = await snapRes.text();
      console.error("Midtrans Snap error:", snapRes.status, detail);
      return c.json(
        {
          error: "Could not start the payment. Please try again.",
        },
        502,
      );
    }
    const snap = await snapRes.json();

    const now = new Date().toISOString();
    await upsertTransaction({
      order_id: orderId,
      user_id: user.id,
      plan_id: plan.id,
      plan_name: plan.name,
      interval,
      gross_amount: total,
      discount,
      voucher_code: voucherCode,
      status: "pending",
      payment_type: null,
      midtrans_data: { snap_token: snap.token },
      created_at: now,
      updated_at: now,
    });

    return c.json({
      order_id: orderId,
      token: snap.token,
      client_key: config.clientKey,
      is_production: config.isProduction,
    });
  } catch (e) {
    console.error("POST /payments/checkout error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// Called by Midtrans — no Authorization header. Authenticity is proven by the
// SHA512 signature, so the function must be deployed with verify_jwt disabled.
app.post("/payments/webhook", async (c) => {
  try {
    const config = midtransConfig();
    if (!config) return c.json({ error: "Not configured" }, 503);

    const body = await c.req.json();
    const { order_id, status_code, gross_amount, signature_key } = body;
    if (!order_id || !signature_key) return c.json({ error: "Bad payload" }, 400);

    const raw = `${order_id}${status_code}${gross_amount}${config.serverKey}`;
    const digest = await crypto.subtle.digest(
      "SHA-512",
      new TextEncoder().encode(raw),
    );
    const expected = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (expected !== signature_key) {
      console.warn("Webhook signature mismatch for order:", order_id);
      return c.json({ error: "Invalid signature" }, 403);
    }

    const tx = await getTransactionByOrderId(order_id);
    if (!tx) return c.json({ error: "Unknown order" }, 404);

    // Verify gross_amount matches the stored transaction to prevent tampering.
    const webhookGross = Number(gross_amount);
    if (Number.isFinite(webhookGross) && webhookGross !== tx.gross_amount) {
      console.warn(`Webhook gross_amount mismatch for ${order_id}: expected ${tx.gross_amount}, got ${webhookGross}`);
      return c.json({ error: "Amount mismatch" }, 400);
    }

    await applyTransactionStatus(tx, body);
    return c.json({ ok: true });
  } catch (e) {
    console.error("POST /payments/webhook error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.get("/payments/status/:orderId", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const orderId = c.req.param("orderId");
    let tx = await getTransactionByOrderId(orderId);
    if (!tx || tx.user_id !== user.id) {
      return c.json({ error: "Order not found" }, 404);
    }

    // Reconcile pending orders directly with Midtrans (server-to-server) so
    // the flow also works where the webhook can't reach (e.g. local dev).
    const config = midtransConfig();
    if (tx.status === "pending" && config) {
      const res = await fetch(`${config.apiBase}/${orderId}/status`, {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${btoa(config.serverKey + ":")}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.transaction_status) {
          tx = await applyTransactionStatus(tx, data);
        }
      }
    }

    const subscription = await getSubscriptionForUser(user.id);

    // Return snap_token + Snap client config for pending orders so the client
    // can re-open the Midtrans payment popup without creating a new checkout.
    const result: Record<string, any> = {
      order_id: tx.order_id,
      status: tx.status,
      plan_id: tx.plan_id,
      plan_name: tx.plan_name,
      interval: tx.interval,
      gross_amount: tx.gross_amount,
      payment_type: tx.payment_type ?? tx.midtrans_data?.payment_type ?? null,
      subscription: subscription ?? null,
    };

    if (tx.status === "pending" && config) {
      result.snap_token = tx.midtrans_data?.snap_token ?? null;
      result.client_key = config.clientKey;
      result.is_production = config.isProduction;
    }

    return c.json(result);
  } catch (e) {
    console.error("GET /payments/status error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Subscription (authenticated) ──────────────────────────────────────────────
// Effective plan is derived ONLY from the server-stored subscription. A lapsed
// subscription is expired lazily on read (there is no cron in this setup).

app.get("/subscription", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    // Founders/admins always have a complimentary Business plan (1 year).
    await ensureAdminSubscription(user);

    const subscription = await getSubscriptionForUser(user.id);
    const planId = subscription?.status === "active" ? subscription.plan_id : "free";
    const plan = (await getPlanById(planId)) ?? (await getPlanById("free"));

    const transactions = (await getTransactionsForUser(user.id)).map((t: any) => ({
      order_id: t.order_id,
      plan_id: t.plan_id,
      plan_name: t.plan_name,
      interval: t.interval,
      gross_amount: t.gross_amount,
      discount: t.discount ?? 0,
      voucher_code: t.voucher_code ?? null,
      status: t.status,
      payment_type: t.payment_type ?? t.midtrans_data?.payment_type ?? null,
      created_at: t.created_at,
    }));

    return c.json({
      subscription: subscription ?? null,
      effective_plan: plan,
      transactions,
      is_admin: isAdminUser(user),
    });
  } catch (e) {
    console.error("GET /subscription error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/profile", async (c) => {
  try {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const full_name = String(body.full_name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    if (!full_name) return c.json({ error: "Full name is required" }, 400);
    if (!/^\+62\d{7,13}$/.test(phone)) {
      return c.json({ error: "Phone must be a +62 number with 7-13 digits" }, 400);
    }
    const profile = await upsertProfile(user.id, {
      email: user.email ?? "",
      full_name,
      phone,
      job_title: String(body.job_title ?? "").trim(),
      company: String(body.company ?? "").trim(),
    });
    return c.json({ profile });
  } catch (e) {
    console.error("PUT /profile error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Founder panel (admin-only) ────────────────────────────────────────────────

// -- Two-factor authentication -------------------------------------------------

app.get("/2fa/setup", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return unauthorized(c);
    const secret = generateSecret();
    const backupCodes = generateBackupCodes();
    const issuer = "LokaSync";
    const otpauthUrl = `otpauth://totp/${issuer}:${encodeURIComponent(user.email ?? user.id)}?secret=${secret}&issuer=${issuer}`;
    // Store pending secret (not enabled until verified)
    await kv.set(`2fa:pending:${user.id}`, { secret, backupCodes });
    return c.json({ secret, otpauthUrl, backupCodes });
  } catch (e) {
    console.error("GET /2fa/setup error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.post("/2fa/verify", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return unauthorized(c);

    // Rate limit: max 5 verification attempts per 15 min
    if (!await checkRateLimit(`2fa-verify:${user.id}`, 5, 15 * 60 * 1000)) {
      return c.json({ error: "Too many attempts. Please try again later.", code: "rate_limited" }, 429);
    }

    const { code } = await c.req.json();
    if (!code || String(code).length !== 6) return c.json({ error: "Enter a 6-digit code" }, 400);
    const pending = await kv.get(`2fa:pending:${user.id}`);
    if (!pending?.secret) return c.json({ error: "Setup not started" }, 400);
    if (!(await verifyTotp(pending.secret, String(code)))) {
      return c.json({ error: "Invalid code" }, 400);
    }
    await kv.set(`2fa:${user.id}`, { secret: pending.secret, backupCodes: pending.backupCodes, enabledAt: new Date().toISOString() });
    await kv.del(`2fa:pending:${user.id}`);
    // Persist enabled flag to user metadata so login flow can detect it
    await adminClient().auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, totp_enabled: true } });
    c.set("user", user);
    const ws2fa = await getActiveWorkspace(c);
    if (ws2fa) await writeAudit(c, ws2fa.id, "Enabled 2FA", "Account", "Security");
    return c.json({ ok: true });
  } catch (e) {
    console.error("POST /2fa/verify error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.delete("/2fa", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return unauthorized(c);

    // Require current TOTP code, backup code, or email OTP code before disabling 2FA
    let body: any;
    try { body = await c.req.json(); } catch { body = {}; }
    const code = String(body?.code ?? "");
    const backupCode = String(body?.backupCode ?? "").toUpperCase();
    const emailOTPCode = String(body?.emailOTPCode ?? "");
    if (!code && !backupCode && !emailOTPCode) {
      return c.json({ error: "Current 2FA code or backup code is required to disable 2FA", code: "verification_required" }, 400);
    }

    let verified = false;

    // Try TOTP verification
    const record2fa = await kv.get(`2fa:${user.id}`);
    if (record2fa?.secret && code && code.length === 6) {
      verified = await verifyTotp(record2fa.secret, code);
    }
    // Try backup code
    if (!verified && backupCode && record2fa?.backupCodes) {
      const idx = record2fa.backupCodes.indexOf(backupCode);
      if (idx !== -1) {
        verified = true;
        record2fa.backupCodes.splice(idx, 1);
        await kv.set(`2fa:${user.id}`, record2fa);
      }
    }
    // Try email OTP
    if (!verified && emailOTPCode && emailOTPCode.length === 6) {
      const emailOtpRecord = await kv.get(`email-otp:${user.id}`);
      if (emailOtpRecord && emailOtpRecord.code === emailOTPCode) {
        if (new Date(emailOtpRecord.expiresAt) > new Date()) {
          verified = true;
          await kv.del(`email-otp:${user.id}`);
        }
      }
    }

    if (!verified) {
      return c.json({ error: "Invalid code", code: "invalid_code" }, 403);
    }

    await kv.del(`2fa:${user.id}`);
    await kv.del(`2fa:pending:${user.id}`);
    await adminClient().auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, totp_enabled: false, email_otp_enabled: false } });
    c.set("user", user);
    const wsOff = await getActiveWorkspace(c);
    if (wsOff) await writeAudit(c, wsOff.id, "Disabled 2FA", "Account", "Security");
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /2fa error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// -- Account deletion ---------------------------------------------------------

// -- Workspace ownership transfer ---------------------------------------------

app.post("/workspace/transfer-ownership", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return unauthorized(c);
    const { targetEmail } = await c.req.json();
    if (!targetEmail) return c.json({ error: "Target email is required" }, 400);
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const db = adminClient();
    // Verify current user is owner
    const { data: currentMembership } = await db.from("workspace_members")
      .select("role").eq("workspace_id", ws.id).eq("user_id", user.id).single();
    if (currentMembership?.role !== "owner") return c.json({ error: "Only owner can transfer ownership" }, 403);
    // Find the target by their workspace membership email (no admin getUserByEmail
    // API exists; the target must already be a member of this workspace anyway).
    const { data: targetMembership } = await db.from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", ws.id)
      .eq("email", targetEmail)
      .maybeSingle();
    if (!targetMembership?.user_id) return c.json({ error: "Target user not found in this workspace" }, 404);
    if (targetMembership.role !== "admin") {
      return c.json({ error: "Target user must be an admin in this workspace" }, 400);
    }
    const targetUserId = targetMembership.user_id;
    // Swap roles and move the workspace.owner_id pointer to the new owner.
    await db.from("workspace_members").update({ role: "admin" }).eq("workspace_id", ws.id).eq("user_id", user.id);
    await db.from("workspace_members").update({ role: "owner" }).eq("workspace_id", ws.id).eq("user_id", targetUserId);
    await db.from("workspaces").update({ owner_id: targetUserId }).eq("id", ws.id);
    c.set("user", user);
    await writeAudit(c, ws.id, "Transferred ownership", targetEmail, "Members");
    return c.json({ ok: true });
  } catch (e) {
    console.error("POST /workspace/transfer-ownership error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.delete("/account", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return unauthorized(c);

    // Rate limit: max 3 account deletion attempts per day
    if (!await checkRateLimit(`account-delete:${user.id}`, 3, 24 * 60 * 60 * 1000)) {
      return c.json({ error: "Too many attempts. Please try again later.", code: "rate_limited" }, 429);
    }

    // Require password re-verification before irreversible deletion
    let body: any;
    try { body = await c.req.json(); } catch { body = {}; }
    const password = String(body?.password ?? "");
    if (!password) {
      return c.json({ error: "Password is required for account deletion", code: "password_required" }, 400);
    }
    // Verify password against Supabase Auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey },
      body: JSON.stringify({ email: user.email, password }),
    });
    if (!verifyRes.ok) {
      return c.json({ error: "Incorrect password", code: "invalid_password" }, 403);
    }

    // Clean up workspace memberships (RLS would normally scope this, but we use admin client)
    const db = adminClient();
    const { data: memberships } = await db.from("workspace_members").select("workspace_id").eq("user_id", user.id);
    if (memberships && memberships.length > 0) {
      for (const m of memberships) {
        // If user is the only owner, require transferring ownership first
        const { data: owners } = await db.from("workspace_members").select("user_id").eq("workspace_id", m.workspace_id).eq("role", "owner");
        if (owners?.length === 1 && owners[0].user_id === user.id) {
          return c.json({ error: "Transfer workspace ownership before deleting your account" }, 400);
        }
      }
      await db.from("workspace_members").delete().eq("user_id", user.id);
    }
    // Delete relational user-scoped data. profiles is keyed by user_id (the auth
    // uid); `id` is a surrogate PK, so delete by user_id to actually remove the row.
    await db.from("profiles").delete().eq("user_id", user.id);
    await db.from("subscriptions").delete().eq("user_id", user.id);
    await db.from("transactions").delete().eq("user_id", user.id);
    // Delete auth user
    const { error } = await adminClient().auth.admin.deleteUser(user.id);
    if (error) throw error;
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /account error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.post("/2fa/verify-login", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return unauthorized(c);

    // KV-backed brute-force protection: max 5 attempts, 15-min lockout
    const attemptKey = `2fa-attempts:${user.id}`;
    const attemptRecord = (await kv.get(attemptKey)) ?? { count: 0 };
    if (attemptRecord.count >= 5 && attemptRecord.lockedUntil && new Date(attemptRecord.lockedUntil) > new Date()) {
      return c.json({ error: "Too many failed attempts. Please try again later.", code: "rate_limited" }, 429);
    }

    const { code, backupCode } = await c.req.json();
    const totpCode = code ? String(code) : "";
    const bkCode = backupCode ? String(backupCode).toUpperCase() : "";

    if (!totpCode && !bkCode) return c.json({ error: "Enter a 6-digit code or backup code" }, 400);
    if (totpCode && totpCode.length !== 6) return c.json({ error: "Enter a 6-digit code" }, 400);

    const record = await kv.get(`2fa:${user.id}`);
    if (!record?.secret) return c.json({ error: "2FA not enabled" }, 400);

    let verified = false;

    // Try TOTP code first
    if (totpCode.length === 6) {
      verified = await verifyTotp(record.secret, totpCode);
    }

    // Try backup code if TOTP didn't match
    if (!verified && bkCode && record.backupCodes) {
      const idx = record.backupCodes.indexOf(bkCode);
      if (idx !== -1) {
        verified = true;
        // Remove used backup code (single-use)
        record.backupCodes.splice(idx, 1);
        await kv.set(`2fa:${user.id}`, record);
      }
    }

    if (!verified) {
      // Record failed attempt
      attemptRecord.count = (attemptRecord.count ?? 0) + 1;
      if (attemptRecord.count >= 5) {
        attemptRecord.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      await kv.set(attemptKey, attemptRecord);
      return c.json({ error: "Invalid code" }, 400);
    }

    // Success — clear attempt counter
    await kv.del(attemptKey);
    return c.json({ ok: true });
  } catch (e) {
    console.error("POST /2fa/verify-login error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Email OTP (Brevo) ─────────────────────────────────────────────────────────
// Alternative 2FA method: send a 6-digit code via email using Brevo's
// transactional email API.

app.post("/email-otp/send", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return unauthorized(c);

    // Rate limit: max 3 sends per 10 minutes
    if (!await checkRateLimit(`email-otp-send:${user.id}`, 3, 10 * 60 * 1000)) {
      return c.json({ error: "Too many requests. Please wait before requesting another code.", code: "rate_limited" }, 429);
    }

    // Generate cryptographically secure 6-digit code
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const code = String((new DataView(bytes.buffer).getUint32(0) % 900000) + 100000);

    // Store in KV with 5-min TTL and attempt counter
    await kv.set(`email-otp:${user.id}`, {
      code,
      attempts: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    // Send via Brevo API
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoApiKey) {
      console.warn("BREVO_API_KEY not configured");
      return c.json({ error: "Email service not configured" }, 503);
    }

    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@lokasync.com";
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify({
        sender: { name: "LokaSync", email: senderEmail },
        to: [{ email: user.email }],
        subject: "Your LokaSync Verification Code",
        htmlContent: `<!DOCTYPE html><html><body style="font-family:Lexend,sans-serif;background:#0f0f0f;color:#fafafa;padding:32px">
          <h2 style="margin:0 0 16px">Verification Code</h2>
          <p style="margin:0 0 24px;color:#a3a3a3">Enter this code to verify your identity:</p>
          <div style="background:#1a1a1a;border:1px solid #262626;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px">
            <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#fafafa">${code}</span>
          </div>
          <p style="margin:0;color:#737373;font-size:13px">This code expires in 5 minutes. If you didn't request this, please ignore this email.</p>
        </body></html>`,
      }),
    });

    if (!brevoRes.ok) {
      const detail = await brevoRes.text();
      console.error("Brevo API error:", brevoRes.status, detail);
      return c.json({ error: "Failed to send email. Please try again." }, 502);
    }

    return c.json({ ok: true, expiresIn: 300 });
  } catch (e) {
    console.error("POST /email-otp/send error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.post("/email-otp/verify", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return unauthorized(c);

    const { code } = await c.req.json();
    if (!code || String(code).length !== 6) {
      return c.json({ error: "Enter a 6-digit code" }, 400);
    }

    const record = await kv.get(`email-otp:${user.id}`);
    if (!record) {
      return c.json({ error: "No code was sent. Request a new one.", code: "no_pending_code" }, 400);
    }

    // Check expiry
    if (new Date(record.expiresAt) < new Date()) {
      await kv.del(`email-otp:${user.id}`);
      return c.json({ error: "Code has expired. Request a new one.", code: "expired" }, 400);
    }

    // Check attempt limit
    if (record.attempts >= 5) {
      await kv.del(`email-otp:${user.id}`);
      return c.json({ error: "Too many incorrect attempts. Request a new code.", code: "too_many_attempts" }, 429);
    }

    // Verify
    if (String(record.code) !== String(code)) {
      record.attempts += 1;
      await kv.set(`email-otp:${user.id}`, record);
      return c.json({ error: "Invalid code" }, 400);
    }

    // Success — clean up
    await kv.del(`email-otp:${user.id}`);

    // Persist email OTP as enabled 2FA method in user metadata
    await adminClient().auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, email_otp_enabled: true },
    });

    c.set("user", user);
    const wsOtp = await getActiveWorkspace(c);
    if (wsOtp) await writeAudit(c, wsOtp.id, "Enabled Email OTP 2FA", "Account", "Security");

    return c.json({ ok: true });
  } catch (e) {
    console.error("POST /email-otp/verify error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// Endpoint for verifying email OTP during login (does NOT enable — just verifies identity)
app.post("/email-otp/verify-login", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return unauthorized(c);

    // Rate limit
    if (!await checkRateLimit(`email-otp-login:${user.id}`, 5, 15 * 60 * 1000)) {
      return c.json({ error: "Too many attempts. Please try again later.", code: "rate_limited" }, 429);
    }

    const { code } = await c.req.json();
    if (!code || String(code).length !== 6) {
      return c.json({ error: "Enter a 6-digit code" }, 400);
    }

    const record = await kv.get(`email-otp:${user.id}`);
    if (!record) {
      return c.json({ error: "No code was sent. Request a new one.", code: "no_pending_code" }, 400);
    }

    if (new Date(record.expiresAt) < new Date()) {
      await kv.del(`email-otp:${user.id}`);
      return c.json({ error: "Code has expired. Request a new one.", code: "expired" }, 400);
    }

    if (record.attempts >= 5) {
      await kv.del(`email-otp:${user.id}`);
      return c.json({ error: "Too many incorrect attempts.", code: "too_many_attempts" }, 429);
    }

    if (String(record.code) !== String(code)) {
      record.attempts += 1;
      await kv.set(`email-otp:${user.id}`, record);
      return c.json({ error: "Invalid code" }, 400);
    }

    await kv.del(`email-otp:${user.id}`);
    return c.json({ ok: true });
  } catch (e) {
    console.error("POST /email-otp/verify-login error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Chat ───────────────────────────────────────────────────────────────────────
// Real-time team chat — one channel per workspace.

const ALLOWED_EMOJIS = new Set(["👍", "❤️", "😂", "🎉", "👀", "🔥"]);

// Enrich a raw chat_messages row with sender info, reactions, and reply preview.
async function mapChatMessage(db: ReturnType<typeof adminClient>, row: any, workspaceId: string) {
  // Sender profile
  const { data: profile } = await db
    .from("profiles").select("full_name, email")
    .eq("user_id", row.user_id).maybeSingle();
  const name = profile?.full_name || profile?.email || "Unknown";
  const initials = name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

  // Reactions
  const { data: reactions } = await db
    .from("chat_reactions").select("id, message_id, user_id, emoji, created_at")
    .eq("message_id", row.id).eq("workspace_id", workspaceId);

  // Reply-to preview
  let replyToPreview = null;
  if (row.reply_to) {
    const { data: parent } = await db
      .from("chat_messages").select("id, content, user_id")
      .eq("id", row.reply_to).maybeSingle();
    if (parent) {
      const { data: parentProfile } = await db
        .from("profiles").select("full_name, email")
        .eq("user_id", parent.user_id).maybeSingle();
      replyToPreview = {
        id: parent.id,
        content: (parent.content || "").slice(0, 100),
        sender_name: parentProfile?.full_name || parentProfile?.email || "Unknown",
      };
    }
  }

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    content: row.content ?? "",
    file_url: row.file_url ?? null,
    file_name: row.file_name ?? null,
    file_type: row.file_type ?? null,
    reply_to: row.reply_to ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
    sender: { name, initials },
    reactions: (reactions ?? []).map((r: any) => ({ id: r.id, message_id: r.message_id, user_id: r.user_id, emoji: r.emoji, created_at: r.created_at })),
    reply_to_preview: replyToPreview,
  };
}

// GET /chat/messages — fetch message history with cursor pagination
app.get("/chat/messages", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const before = c.req.query("before"); // ISO timestamp cursor

    let query = adminClient()
      .from("chat_messages")
      .select("id, workspace_id, user_id, content, file_url, file_name, file_type, reply_to, created_at, updated_at")
      .eq("workspace_id", ws.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) query = query.lt("created_at", before);

    const { data, error } = await query;
    if (error) throw error;

    const messages = await Promise.all(
      (data ?? []).map((row) => mapChatMessage(adminClient(), row, ws.id))
    );

    return c.json({ messages: messages.reverse(), has_more: (data?.length ?? 0) >= limit });
  } catch (e) {
    console.error("GET /chat/messages error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// POST /chat/messages — send a message
app.post("/chat/messages", async (c) => {
  try {
    const user = c.get("user");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);

    const body = await c.req.json();
    const content = String(body.content ?? "").trim().slice(0, 4000);
    let fileUrl = body.file_url ? String(body.file_url) : null;
    const fileName = body.file_name ? String(body.file_name).slice(0, 255) : null;
    const fileType = body.file_type ? String(body.file_type).slice(0, 100) : null;
    const replyTo = body.reply_to ? String(body.reply_to) : null;

    // Validate file_url belongs to this workspace's storage path
    if (fileUrl && !fileUrl.startsWith(`${ws.id}/`)) {
      return c.json({ error: "Invalid file path" }, 400);
    }

    if (!content && !fileUrl) return c.json({ error: "Message content or file is required" }, 400);

    // Verify reply_to target exists in same workspace
    if (replyTo) {
      const { data: parent } = await adminClient()
        .from("chat_messages").select("id").eq("id", replyTo).eq("workspace_id", ws.id).maybeSingle();
      if (!parent) return c.json({ error: "Reply target not found" }, 404);
    }

    const { data, error } = await adminClient()
      .from("chat_messages")
      .insert({
        workspace_id: ws.id,
        user_id: user.id,
        content,
        file_url: fileUrl,
        file_name: fileName,
        file_type: fileType,
        reply_to: replyTo,
      })
      .select("id, workspace_id, user_id, content, file_url, file_name, file_type, reply_to, created_at, updated_at")
      .single();
    if (error) throw error;

    const message = await mapChatMessage(adminClient(), data, ws.id);
    return c.json(message, 201);
  } catch (e) {
    console.error("POST /chat/messages error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// PUT /chat/messages/:id — edit own message
app.put("/chat/messages/:id", async (c) => {
  try {
    const user = c.get("user");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);

    const id = c.req.param("id");
    const { content } = await c.req.json();
    const trimmed = String(content ?? "").trim().slice(0, 4000);
    if (!trimmed) return c.json({ error: "Content is required" }, 400);

    const { data, error } = await adminClient()
      .from("chat_messages")
      .update({ content: trimmed, updated_at: new Date().toISOString() })
      .eq("id", id).eq("workspace_id", ws.id).eq("user_id", user.id)
      .select("id, workspace_id, user_id, content, file_url, file_name, file_type, reply_to, created_at, updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) return c.json({ error: "Message not found or not authorized" }, 404);

    const message = await mapChatMessage(adminClient(), data, ws.id);
    return c.json(message);
  } catch (e) {
    console.error("PUT /chat/messages/:id error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// DELETE /chat/messages/:id — delete message (author or admin)
app.delete("/chat/messages/:id", async (c) => {
  try {
    const user = c.get("user");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);

    const id = c.req.param("id");

    // Check ownership or admin
    const { data: msg } = await adminClient()
      .from("chat_messages").select("user_id").eq("id", id).eq("workspace_id", ws.id).maybeSingle();
    if (!msg) return c.json({ error: "Message not found" }, 404);
    if (msg.user_id !== user.id && !hasRole(ws.role, "admin")) return forbidden(c);

    const { error } = await adminClient().from("chat_messages").delete().eq("id", id).eq("workspace_id", ws.id);
    if (error) throw error;
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /chat/messages/:id error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// POST /chat/messages/:id/reactions — toggle reaction (upsert)
app.post("/chat/messages/:id/reactions", async (c) => {
  try {
    const user = c.get("user");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);

    const messageId = c.req.param("id");
    const { emoji } = await c.req.json();
    if (!ALLOWED_EMOJIS.has(emoji)) return c.json({ error: "Invalid emoji" }, 400);

    // Verify message exists in workspace
    const { data: msg } = await adminClient()
      .from("chat_messages").select("id").eq("id", messageId).eq("workspace_id", ws.id).maybeSingle();
    if (!msg) return c.json({ error: "Message not found" }, 404);

    // Upsert (toggle: if exists, remove; if not, add)
    const { data: existing } = await adminClient()
      .from("chat_reactions").select("id")
      .eq("message_id", messageId).eq("user_id", user.id).eq("emoji", emoji).maybeSingle();

    if (existing) {
      await adminClient().from("chat_reactions").delete().eq("id", existing.id);
      return c.json({ removed: true, emoji });
    }

    const { data, error } = await adminClient()
      .from("chat_reactions")
      .insert({ message_id: messageId, user_id: user.id, workspace_id: ws.id, emoji })
      .select("id, message_id, user_id, emoji, created_at")
      .single();
    if (error) throw error;
    return c.json(data, 201);
  } catch (e) {
    console.error("POST /chat/messages/:id/reactions error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// DELETE /chat/messages/:id/reactions/:emoji — remove own reaction
app.delete("/chat/messages/:id/reactions/:emoji", async (c) => {
  try {
    const user = c.get("user");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;

    const messageId = c.req.param("id");
    const emoji = decodeURIComponent(c.req.param("emoji"));

    await adminClient().from("chat_reactions").delete()
      .eq("message_id", messageId).eq("user_id", user.id).eq("emoji", emoji).eq("workspace_id", ws.id);
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /chat/messages/:id/reactions/:emoji error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.get("/admin/overview", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;

    const db = adminClient();

    // Lazy auto-migration: if the relational billing tables are still empty but
    // legacy KV data exists (e.g. from earlier testing), pull it across once so
    // the admin panel shows the historical simulation data instead of blanks.
    try {
      const { count: subCount } = await db.from("subscriptions")
        .select("id", { count: "exact", head: true });
      if (!subCount) {
        const kvSubs = await kv.getByPrefix("subscription:");
        if (kvSubs.filter(Boolean).length > 0) {
          await migrateKvToRelational();
        }
      }
    } catch (mErr) {
      console.error("admin overview lazy-migration skipped:", mErr);
    }

    const { data: usersPage } = await adminClient().auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const totalUsers = usersPage?.users?.length ?? 0;

    const now = new Date();
    const { data: subs } = await db.from("subscriptions").select("plan_id, status, current_period_end");
    const activeByPlan: Record<string, number> = {};
    let expiredCount = 0;
    for (const s of subs ?? []) {
      const stillActive =
        s.status === "active" &&
        s.current_period_end &&
        new Date(s.current_period_end) > now;
      if (stillActive) {
        activeByPlan[s.plan_id] = (activeByPlan[s.plan_id] ?? 0) + 1;
      } else {
        expiredCount++;
      }
    }

    const { data: txs } = await db.from("transactions").select("status, gross_amount");
    let revenueTotal = 0;
    let paidCount = 0;
    let pendingCount = 0;
    for (const t of txs ?? []) {
      if (t.status === "paid") {
        revenueTotal += t.gross_amount ?? 0;
        paidCount++;
      } else if (t.status === "pending") {
        pendingCount++;
      }
    }

    const vouchers = await kv.getByPrefix("voucher:");
    const mt = await kv.get("maintenance");

    return c.json({
      total_users: totalUsers,
      active_subscriptions: activeByPlan,
      expired_subscriptions: expiredCount,
      revenue_total: revenueTotal,
      paid_transactions: paidCount,
      pending_transactions: pendingCount,
      voucher_count: vouchers.filter(Boolean).length,
      maintenance: { enabled: !!mt?.enabled, message: mt?.message ?? "" },
    });
  } catch (e) {
    console.error("GET /admin/overview error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// Vouchers CRUD — voucher:{CODE}. used_count is only ever advanced by the
// payment webhook; the panel can edit everything else.

app.get("/admin/vouchers", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const vouchers = (await kv.getByPrefix("voucher:")).filter(Boolean);
    vouchers.sort((a: any, b: any) => String(a.code).localeCompare(String(b.code)));
    return c.json(vouchers);
  } catch (e) {
    console.error("GET /admin/vouchers error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

function parseVoucherInput(body: any) {
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,24}$/.test(code)) {
    return { error: "Code must be 3-24 letters/numbers" };
  }
  const type = body.type === "fixed" ? "fixed" : body.type === "percent" ? "percent" : null;
  if (!type) return { error: "Type must be percent or fixed" };
  const value = Number(body.value);
  if (!Number.isFinite(value) || value <= 0) return { error: "Value must be a positive number" };
  if (type === "percent" && value > 100) return { error: "Percent value cannot exceed 100" };
  let expires_at: string | null = null;
  if (body.expires_at) {
    const d = new Date(body.expires_at);
    if (isNaN(d.getTime())) return { error: "Invalid expiry date" };
    expires_at = d.toISOString();
  }
  let max_uses: number | null = null;
  if (body.max_uses != null && body.max_uses !== "") {
    max_uses = Math.floor(Number(body.max_uses));
    if (!Number.isFinite(max_uses) || max_uses <= 0) return { error: "Max uses must be a positive number" };
  }
  let applies_to: string[] | null = null;
  if (Array.isArray(body.applies_to) && body.applies_to.length > 0) {
    applies_to = body.applies_to.map((p: any) => String(p));
  }
  return {
    voucher: {
      code,
      type,
      value,
      active: body.active !== false,
      expires_at,
      max_uses,
      applies_to,
    },
  };
}

app.post("/admin/vouchers", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const parsed = parseVoucherInput(await c.req.json());
    if (parsed.error) return c.json({ error: parsed.error }, 400);
    const existing = await kv.get(`voucher:${parsed.voucher!.code}`);
    if (existing) return c.json({ error: "A voucher with this code already exists" }, 409);
    const voucher = { ...parsed.voucher!, used_count: 0, created_at: new Date().toISOString() };
    await kv.set(`voucher:${voucher.code}`, voucher);
    return c.json(voucher, 201);
  } catch (e) {
    console.error("POST /admin/vouchers error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/admin/vouchers/:code", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const code = c.req.param("code").toUpperCase();
    const existing = await kv.get(`voucher:${code}`);
    if (!existing) return c.json({ error: "Voucher not found" }, 404);
    const parsed = parseVoucherInput({ ...existing, ...(await c.req.json()), code });
    if (parsed.error) return c.json({ error: parsed.error }, 400);
    const voucher = {
      ...parsed.voucher,
      used_count: existing.used_count ?? 0,
      created_at: existing.created_at ?? null,
      updated_at: new Date().toISOString(),
    };
    await kv.set(`voucher:${code}`, voucher);
    return c.json(voucher);
  } catch (e) {
    console.error("PUT /admin/vouchers error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.delete("/admin/vouchers/:code", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const code = c.req.param("code").toUpperCase();
    const existing = await kv.get(`voucher:${code}`);
    if (!existing) return c.json({ error: "Voucher not found" }, 404);
    await kv.del(`voucher:${code}`);
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /admin/vouchers error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// Subscribers — every subscription joined with the owner's profile
app.get("/admin/subscribers", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const db = adminClient();
    const now = new Date();
    const { data: subs } = await db.from("subscriptions").select("*");
    const userIds = (subs ?? []).map((s: any) => s.user_id);
    const profileMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await db.from("profiles")
        .select("user_id, email, full_name, company")
        .in("user_id", userIds);
      for (const p of profiles ?? []) profileMap[p.user_id] = p;
    }
    const rows = (subs ?? []).map((s: any) => {
      const profile = profileMap[s.user_id] ?? {};
      const lapsed =
        s.status === "active" &&
        s.current_period_end &&
        new Date(s.current_period_end) < now;
      return {
        user_id: s.user_id,
        email: profile.email ?? "(no profile)",
        full_name: profile.full_name ?? "",
        company: profile.company ?? "",
        plan_id: s.plan_id,
        interval: s.interval,
        status: lapsed ? "expired" : s.status,
        started_at: s.started_at,
        current_period_end: s.current_period_end,
      };
    });
    rows.sort((a, b) =>
      String(a.current_period_end) < String(b.current_period_end) ? 1 : -1,
    );
    return c.json(rows);
  } catch (e) {
    console.error("GET /admin/subscribers error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// Maintenance mode — read also available publicly via GET /status
app.put("/admin/maintenance", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const body = await c.req.json();
    const maintenance = {
      enabled: body.enabled === true,
      message: String(body.message ?? "").slice(0, 500),
      updated_at: new Date().toISOString(),
      updated_by: gate.user.email,
    };
    await kv.set("maintenance", maintenance);
    return c.json({ maintenance });
  } catch (e) {
    console.error("PUT /admin/maintenance error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// Notifications — notification:{id}, audience: all | free | pro | business
app.get("/admin/notifications", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const items = (await kv.getByPrefix("notification:")).filter(Boolean);
    items.sort((a: any, b: any) =>
      String(a.created_at) < String(b.created_at) ? 1 : -1,
    );
    return c.json(items);
  } catch (e) {
    console.error("GET /admin/notifications error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.post("/admin/notifications", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const body = await c.req.json();
    const title = String(body.title ?? "").trim().slice(0, 120);
    const message = String(body.message ?? "").trim().slice(0, 1000);
    if (!title || !message) return c.json({ error: "Title and message are required" }, 400);
    const audience = ["all", "free", "pro", "business"].includes(body.audience)
      ? body.audience
      : "all";
    const notification = {
      id: crypto.randomUUID(),
      title,
      message,
      audience,
      created_at: new Date().toISOString(),
      created_by: gate.user.email,
    };
    await kv.set(`notification:${notification.id}`, notification);
    return c.json(notification, 201);
  } catch (e) {
    console.error("POST /admin/notifications error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.delete("/admin/notifications/:id", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const id = c.req.param("id");
    const existing = await kv.get(`notification:${id}`);
    if (!existing) return c.json({ error: "Notification not found" }, 404);
    await kv.del(`notification:${id}`);
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /admin/notifications error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── User notifications (authenticated) ────────────────────────────────────────
// Read state lives in `notification_reads:{userId}` as an array of ids.

app.get("/notifications", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const planId = await getEffectivePlanId(user.id);
    const all = (await kv.getByPrefix("notification:")).filter(Boolean);
    const reads: string[] = (await kv.get(`notification_reads:${user.id}`)) ?? [];
    const items = all
      .filter((n: any) => n.audience === "all" || n.audience === planId)
      .sort((a: any, b: any) =>
        String(a.created_at) < String(b.created_at) ? 1 : -1,
      )
      .slice(0, 20)
      .map((n: any) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        created_at: n.created_at,
        read: reads.includes(n.id),
      }));
    return c.json(items);
  } catch (e) {
    console.error("GET /notifications error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/notifications/read", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (ids.length === 0) return c.json({ error: "ids is required" }, 400);
    const reads: string[] = (await kv.get(`notification_reads:${user.id}`)) ?? [];
    const merged = Array.from(new Set([...reads, ...ids])).slice(-200);
    await kv.set(`notification_reads:${user.id}`, merged);
    return c.json({ ok: true });
  } catch (e) {
    console.error("PUT /notifications/read error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Reset workspace ───────────────────────────────────────────────────────────

// ── Workspace data reset ──────────────────────────────────────────────────────
// Clears the relational core tables + per-workspace KV reporting blobs so the
// user starts fresh. Relies on CASCADE for workspaces (deleted via a dedicated
// path); here we only wipe the data rows, not the workspace itself.

app.delete("/workspace-data", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "admin")) return forbidden(c);
    const db = adminClient();
    // Core relational tables — workspace_team_members deleted first (FK child of workspace_teams).
    await db.from("workspace_team_members").delete().eq("workspace_id", ws.id);
    await Promise.all([
      db.from("tasks").delete().eq("workspace_id", ws.id),
      db.from("projects").delete().eq("workspace_id", ws.id),
      db.from("calendar_events").delete().eq("workspace_id", ws.id),
      db.from("files").delete().eq("workspace_id", ws.id),
      db.from("folders").delete().eq("workspace_id", ws.id),
      db.from("milestones").delete().eq("workspace_id", ws.id),
      db.from("workspace_teams").delete().eq("workspace_id", ws.id),
      // Per-workspace KV blobs (financial, analytics, dashboard, settings).
      kv.del(`financial:data:${ws.id}`),
      kv.del(`integrations:list:${ws.id}`),
      kv.del(`security:sessions:${ws.id}`),
      kv.del(`dashboard:ops:${ws.id}`),
      kv.del(`dashboard:details:${ws.id}`),
      kv.del(`analytics:metrics:${ws.id}`),
    ]);
    await writeAudit(c, ws.id, "Reset workspace data", "", "Settings");
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /workspace-data error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
// Stored in the `tasks` table (workspace-scoped, UUID primary key). Responses
// are mapped back to the legacy client shape so the UI doesn't change.

const TASK_COLUMNS =
  "id, title, description, status, priority, assignee, project, due, completed, created_by";

function mapTaskRow(r: any) {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    status: r.status,
    priority: r.priority,
    assignee: r.assignee ?? "",
    project: r.project ?? "",
    due: r.due ?? "",
    completed: r.completed ?? false,
    created_by: r.created_by ?? null,
  };
}

app.get("/tasks", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const { data, error } = await adminClient()
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("workspace_id", ws.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return c.json((data ?? []).map(mapTaskRow));
  } catch (e) {
    console.error("GET /tasks error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.post("/tasks", async (c) => {
  try {
    const user = c.get("user");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const body = await c.req.json();
    const insert = {
      workspace_id: ws.id,
      created_by: user.id,
      title: String(body.title ?? "").trim() || "Untitled task",
      description: String(body.description ?? ""),
      status: body.status ?? "todo",
      priority: body.priority ?? "medium",
      assignee: body.assignee ?? null,
      project: body.project ?? null,
      due: body.due ?? null,
      completed: !!body.completed,
    };
    const { data, error } = await adminClient()
      .from("tasks")
      .insert(insert)
      .select(TASK_COLUMNS)
      .single();
    if (error) throw error;
    return c.json(mapTaskRow(data), 201);
  } catch (e) {
    console.error("POST /tasks error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/tasks/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const body = await c.req.json();
    // Only allow known columns; never let the client overwrite workspace_id/id.
    const patch: Record<string, any> = {};
    for (const k of ["title", "description", "status", "priority", "assignee", "project", "due", "completed"]) {
      if (k in body) patch[k] = body[k];
    }
    const { data, error } = await adminClient()
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .eq("workspace_id", ws.id)
      .select(TASK_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return c.json({ error: "Task not found" }, 404);
    return c.json(mapTaskRow(data));
  } catch (e) {
    console.error("PUT /tasks/:id error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.delete("/tasks/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const { error } = await adminClient()
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ws.id);
    if (error) throw error;
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /tasks/:id error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Projects ──────────────────────────────────────────────────────────────────
// Stored in the `projects` table (workspace-scoped, UUID primary key).

const PROJECT_COLUMNS =
  "id, name, description, status, progress, tasks, team, due, tags";

function mapProjectRow(r: any) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    status: r.status,
    progress: r.progress ?? 0,
    tasks: r.tasks ?? { total: 0, done: 0 },
    team: r.team ?? [],
    due: r.due ?? "",
    tags: r.tags ?? [],
  };
}

app.get("/projects", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const { data, error } = await adminClient()
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("workspace_id", ws.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return c.json((data ?? []).map(mapProjectRow));
  } catch (e) {
    console.error("GET /projects error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.post("/projects", async (c) => {
  try {
    const user = c.get("user");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);

    const planId = await getEffectivePlanId(user.id);
    if (planId === "free") {
      const { count } = await adminClient()
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws.id);
      if ((count ?? 0) >= FREE_MAX_PROJECTS) {
        return c.json(
          {
            error: `The Free plan is limited to ${FREE_MAX_PROJECTS} projects. Upgrade to add more.`,
            code: "project_limit",
            max_projects: FREE_MAX_PROJECTS,
          },
          403,
        );
      }
    }

    const body = await c.req.json();
    const insert = {
      workspace_id: ws.id,
      created_by: user.id,
      name: String(body.name ?? "").trim() || "Untitled project",
      description: String(body.description ?? ""),
      status: body.status ?? "active",
      progress: Number(body.progress ?? 0) || 0,
      tasks: body.tasks ?? { total: 0, done: 0 },
      team: Array.isArray(body.team) ? body.team : [],
      due: body.due ?? null,
      tags: Array.isArray(body.tags) ? body.tags : [],
    };
    const { data, error } = await adminClient()
      .from("projects")
      .insert(insert)
      .select(PROJECT_COLUMNS)
      .single();
    if (error) throw error;
    return c.json(mapProjectRow(data), 201);
  } catch (e) {
    console.error("POST /projects error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/projects/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const body = await c.req.json();
    const patch: Record<string, any> = {};
    for (const k of ["name", "description", "status", "progress", "tasks", "team", "due", "tags"]) {
      if (k in body) patch[k] = body[k];
    }
    const { data, error } = await adminClient()
      .from("projects")
      .update(patch)
      .eq("id", id)
      .eq("workspace_id", ws.id)
      .select(PROJECT_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return c.json({ error: "Project not found" }, 404);
    return c.json(mapProjectRow(data));
  } catch (e) {
    console.error("PUT /projects/:id error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.delete("/projects/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const { error } = await adminClient()
      .from("projects")
      .delete()
      .eq("id", id)
      .eq("workspace_id", ws.id);
    if (error) throw error;
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /projects/:id error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Teams ─────────────────────────────────────────────────────────────────────
// Stored in `workspace_teams` (group) + `workspace_team_members` (roster).
// Response shape mirrors the old KV structure so the frontend doesn't change:
//   [{ name, description, members: [{ initials, name, role, status, tasks }] }]

// Helper: read all teams + members for a workspace as the legacy array shape.
async function getTeamsForWorkspace(workspaceId: string): Promise<any[]> {
  const db = adminClient();
  const { data: teamRows, error: tErr } = await db
    .from("workspace_teams")
    .select("id, name, description")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (tErr) throw tErr;
  if (!teamRows?.length) return [];

  const teamIds = teamRows.map((t: any) => t.id);
  const { data: memberRows, error: mErr } = await db
    .from("workspace_team_members")
    .select("team_id, initials, name, role, status, tasks")
    .in("team_id", teamIds)
    .order("created_at", { ascending: true });
  if (mErr) throw mErr;

  return teamRows.map((t: any) => ({
    name: t.name,
    description: t.description,
    members: (memberRows ?? []).filter((m: any) => m.team_id === t.id),
  }));
}

app.get("/teams", async (c) => {
  try {
    const gate = await requirePlan(c, "pro");
    if (!gate.user) return gate.response;
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const db = adminClient();

    // Self-heal: if workspace has no teams yet, seed them.
    const { count } = await db
      .from("workspace_teams")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ws.id);
    if (!count) {
      const user = c.get("user");
      for (const seedTeam of SEED_TEAMS) {
        const { data: teamRow } = await db
          .from("workspace_teams")
          .insert({ workspace_id: ws.id, name: seedTeam.name, description: seedTeam.description, created_by: user.id })
          .select("id")
          .single();
        if (teamRow?.id) {
          await db.from("workspace_team_members").insert(
            seedTeam.members.map((m: any) => ({
              team_id: teamRow.id,
              workspace_id: ws.id,
              initials: m.initials,
              name: m.name,
              role: m.role,
              status: m.status,
              tasks: m.tasks,
            }))
          );
        }
      }
    }

    return c.json(await getTeamsForWorkspace(ws.id));
  } catch (e) {
    console.error("GET /teams error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.post("/teams/invite", async (c) => {
  try {
    const gate = await requirePlan(c, "pro");
    if (!gate.user) return gate.response;
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "admin")) return forbidden(c);
    if (response) return response;
    const db = adminClient();
    const { teamName, member } = await c.req.json();

    let { data: teamRow } = await db
      .from("workspace_teams")
      .select("id")
      .eq("workspace_id", ws.id)
      .eq("name", teamName)
      .maybeSingle();

    // Auto-create the team if it doesn't exist yet.
    if (!teamRow) {
      const { data: created } = await db
        .from("workspace_teams")
        .insert({ workspace_id: ws.id, name: teamName, created_by: user.id })
        .select("id")
        .single();
      teamRow = created;
    }

    await db.from("workspace_team_members").insert({
      team_id: teamRow.id,
      workspace_id: ws.id,
      initials: member.initials,
      name: member.name,
      role: member.role ?? "member",
      status: member.status ?? "online",
      tasks: member.tasks ?? 0,
    });

    const teams = await getTeamsForWorkspace(ws.id);
    const team = teams.find((t: any) => t.name === teamName);
    return c.json(team, 201);
  } catch (e) {
    console.error("POST /teams/invite error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/teams/member", async (c) => {
  try {
    const gate = await requirePlan(c, "pro");
    if (!gate.user) return gate.response;
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "admin")) return forbidden(c);
    if (response) return response;
    const db = adminClient();
    const { teamName, initials, patch } = await c.req.json();

    const { data: teamRow } = await db
      .from("workspace_teams")
      .select("id")
      .eq("workspace_id", ws.id)
      .eq("name", teamName)
      .maybeSingle();
    if (!teamRow) return c.json({ error: "Team not found" }, 404);

    const { data: updated } = await db
      .from("workspace_team_members")
      .update({
        ...(patch.name != null && { name: patch.name }),
        ...(patch.role != null && { role: patch.role }),
        ...(patch.status != null && { status: patch.status }),
        ...(patch.tasks != null && { tasks: patch.tasks }),
      })
      .eq("team_id", teamRow.id)
      .eq("initials", initials)
      .select("initials, name, role, status, tasks")
      .maybeSingle();
    if (!updated) return c.json({ error: "Member not found" }, 404);
    return c.json(updated);
  } catch (e) {
    console.error("PUT /teams/member error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.delete("/teams/member", async (c) => {
  try {
    const gate = await requirePlan(c, "pro");
    if (!gate.user) return gate.response;
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "admin")) return forbidden(c);
    if (response) return response;
    const db = adminClient();
    const { teamName, initials } = await c.req.json();

    const { data: teamRow } = await db
      .from("workspace_teams")
      .select("id")
      .eq("workspace_id", ws.id)
      .eq("name", teamName)
      .maybeSingle();
    if (!teamRow) return c.json({ error: "Team not found" }, 404);

    const { error } = await db
      .from("workspace_team_members")
      .delete()
      .eq("team_id", teamRow.id)
      .eq("initials", initials);
    if (error) throw error;
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /teams/member error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Calendar ──────────────────────────────────────────────────────────────────
// Stored in `calendar_events` (one row per event, keyed by date_key). The
// legacy client shape is `{ [dateKey]: [{title, tag, color}] }`, so we
// regroup rows into that object on read.

app.get("/calendar", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const { data, error } = await adminClient()
      .from("calendar_events")
      .select("date_key, title, tag, color, created_by")
      .eq("workspace_id", ws.id);
    if (error) throw error;
    const out: Record<string, any[]> = {};
    for (const r of data ?? []) {
      (out[r.date_key] ??= []).push({ title: r.title, tag: r.tag, color: r.color, created_by: r.created_by ?? null });
    }
    return c.json(out);
  } catch (e) {
    console.error("GET /calendar error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.post("/calendar/events", async (c) => {
  try {
    const user = c.get("user");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const { dateKey, event } = await c.req.json();
    if (!dateKey || !event?.title) {
      return c.json({ error: "dateKey and event.title are required" }, 400);
    }
    const { data, error } = await adminClient()
      .from("calendar_events")
      .insert({
        workspace_id: ws.id,
        created_by: user.id,
        date_key: String(dateKey),
        title: event.title,
        tag: event.tag ?? null,
        color: event.color ?? null,
      })
      .select("title, tag, color")
      .single();
    if (error) throw error;
    return c.json([data], 201);
  } catch (e) {
    console.error("POST /calendar/events error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.delete("/calendar/events", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const { dateKey, index } = await c.req.json();
    // Rows are ordered by created_at, so the Nth row of dateKey matches the
    // client's positional index. Fetch ids then delete the right one.
    const { data } = await adminClient()
      .from("calendar_events")
      .select("id")
      .eq("workspace_id", ws.id)
      .eq("date_key", String(dateKey))
      .order("created_at", { ascending: true });
    const row = (data ?? [])[Number(index)];
    if (row) {
      await adminClient().from("calendar_events").delete().eq("id", row.id);
    }
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /calendar/events error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Files ─────────────────────────────────────────────────────────────────────
// `files` + `folders` tables. Files are keyed by name in the legacy client
// API (rename/delete identify by name), so we look rows up by name.

const FILE_COLUMNS = "id, name, type, size, modified, owner, shared, archived, created_by";

function mapFileRow(r: any) {
  return {
    name: r.name,
    type: r.type ?? "",
    size: r.size ?? "",
    modified: r.modified ?? "",
    created_by: r.created_by ?? null,
    owner: r.owner ?? "",
    shared: r.shared ?? false,
    archived: r.archived ?? false,
  };
}

const FOLDER_COLUMNS = "id, name, modified";

function mapFolderRow(r: any) {
  return { name: r.name, files: 0, modified: r.modified ?? "" };
}

app.get("/files", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const [filesRes, foldersRes] = await Promise.all([
      adminClient().from("files").select(FILE_COLUMNS).eq("workspace_id", ws.id).order("created_at", { ascending: false }),
      adminClient().from("folders").select(FOLDER_COLUMNS).eq("workspace_id", ws.id).order("created_at", { ascending: false }),
    ]);
    if (filesRes.error) throw filesRes.error;
    if (foldersRes.error) throw foldersRes.error;
    return c.json({
      files: (filesRes.data ?? []).map(mapFileRow),
      folders: (foldersRes.data ?? []).map(mapFolderRow),
    });
  } catch (e) {
    console.error("GET /files error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.post("/files", async (c) => {
  try {
    const user = c.get("user");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const body = await c.req.json();
    const insert = {
      workspace_id: ws.id,
      created_by: user.id,
      name: String(body.name ?? "").trim(),
      type: body.type ?? null,
      size: body.size ?? null,
      modified: body.modified ?? null,
      owner: body.owner ?? null,
      shared: !!body.shared,
      archived: !!body.archived,
    };
    const { data, error } = await adminClient()
      .from("files")
      .insert(insert)
      .select(FILE_COLUMNS)
      .single();
    if (error) throw error;
    return c.json(mapFileRow(data), 201);
  } catch (e) {
    console.error("POST /files error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/files", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const { oldName, newName } = await c.req.json();
    const { data, error } = await adminClient()
      .from("files")
      .update({ name: newName })
      .eq("workspace_id", ws.id)
      .eq("name", oldName)
      .select(FILE_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return c.json({ error: "File not found" }, 404);
    return c.json(mapFileRow(data));
  } catch (e) {
    console.error("PUT /files error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// PATCH — update file fields (archived, shared) by name
app.patch("/files/:name", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const name = decodeURIComponent(c.req.param("name"));
    const body = await c.req.json();
    // Only allow updating safe fields
    const allowed: Record<string, unknown> = {};
    if (typeof body.archived === "boolean") allowed.archived = body.archived;
    if (typeof body.shared === "boolean") allowed.shared = body.shared;
    if (Object.keys(allowed).length === 0) return c.json({ error: "No valid fields to update" }, 400);
    const { data, error } = await adminClient()
      .from("files")
      .update(allowed)
      .eq("workspace_id", ws.id)
      .eq("name", name)
      .select(FILE_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return c.json({ error: "File not found" }, 404);
    return c.json(mapFileRow(data));
  } catch (e) {
    console.error("PATCH /files/:name error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.delete("/files/:name", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const name = decodeURIComponent(c.req.param("name"));
    const { error } = await adminClient()
      .from("files")
      .delete()
      .eq("workspace_id", ws.id)
      .eq("name", name);
    if (error) throw error;
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /files/:name error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.post("/files/folders", async (c) => {
  try {
    const user = c.get("user");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const body = await c.req.json();
    const { data, error } = await adminClient()
      .from("folders")
      .insert({
        workspace_id: ws.id,
        created_by: user.id,
        name: String(body.name ?? "").trim(),
        modified: body.modified ?? null,
      })
      .select(FOLDER_COLUMNS)
      .single();
    if (error) throw error;
    return c.json(mapFolderRow(data), 201);
  } catch (e) {
    console.error("POST /files/folders error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/files/folders", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const { oldName, newName } = await c.req.json();
    const { data, error } = await adminClient()
      .from("folders")
      .update({ name: newName, modified: new Date().toISOString() })
      .eq("workspace_id", ws.id)
      .eq("name", oldName)
      .select(FOLDER_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return c.json({ error: "Folder not found" }, 404);
    return c.json(mapFolderRow(data));
  } catch (e) {
    console.error("PUT /files/folders error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.delete("/files/folders/:name", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const name = decodeURIComponent(c.req.param("name"));
    const { error } = await adminClient()
      .from("folders")
      .delete()
      .eq("workspace_id", ws.id)
      .eq("name", name);
    if (error) throw error;
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /files/folders/:name error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Settings ─────────────────────────────────────────────────────────────────────
// Workspace-scoped sections (workspace, notifications, appearance, timezone,
// members, api-keys, webhooks, audit-log) are stored in the `workspace_settings`
// relational table — isolated per tenant and protected by RLS.
// User-scoped sections (profile, billing) remain in KV per user.

const settingsSeedMap: Record<string, any> = {
  profile:       SEED_PROFILE,
  workspace:     SEED_WORKSPACE,
  notifications: SEED_NOTIFICATIONS,
  appearance:    SEED_APPEARANCE,
  timezone:      SEED_TIMEZONE,
  members:       SEED_MEMBERS,
  billing:       SEED_BILLING,
  "api-keys":    SEED_API_KEYS,
  webhooks:      SEED_WEBHOOKS,
  "audit-log":   SEED_AUDIT_LOG,
};

// These sections live in workspace_settings (relational, RLS-gated).
const WORKSPACE_SETTINGS_SECTIONS = new Set([
  "workspace",
  "notifications",
  "appearance",
  "timezone",
  "members",
  "api-keys",
  "webhooks",
  "audit-log",
]);

app.get("/settings/:section", async (c) => {
  try {
    const section = c.req.param("section");
    const seed = settingsSeedMap[section];
    if (!seed) return c.json({ error: "Unknown settings section: " + section }, 400);

    if (WORKSPACE_SETTINGS_SECTIONS.has(section)) {
      // Workspace-scoped → workspace_settings relational table.
      const { ws, response } = await requireWorkspace(c);
      if (response) return response;
      // Members can read workspace settings; mutating settings (PUT) requires admin.
      const db = adminClient();
      const { data: row } = await db
        .from("workspace_settings")
        .select("data")
        .eq("workspace_id", ws.id)
        .eq("section", section)
        .maybeSingle();
      if (row) {
        // The audit log only ever shows genuine entries — drop any legacy
        // demo-seed rows that may still be stored from before it went live.
        if (section === "audit-log") {
          const real = Array.isArray(row.data) ? row.data.filter((e: any) => e && e._real) : [];
          return c.json(real);
        }
        return c.json(row.data);
      }
      // Self-heal: row missing → insert seed and return it.
      await db.from("workspace_settings").upsert(
        { workspace_id: ws.id, section, data: seed },
        { onConflict: "workspace_id,section" }
      );
      return c.json(seed);
    }

    // User-scoped (profile, billing) → KV per user.
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const data = await getOrSeed(`settings:${section}:${user.id}`, seed);
    return c.json(data);
  } catch (e) {
    console.error("GET /settings/:section error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/settings/:section", async (c) => {
  try {
    const section = c.req.param("section");
    if (!settingsSeedMap[section]) return c.json({ error: "Unknown settings section: " + section }, 400);
    const body = await c.req.json();

    if (WORKSPACE_SETTINGS_SECTIONS.has(section)) {
      // Workspace-scoped → workspace_settings relational table.
      const { ws, response } = await requireWorkspace(c);
      if (response) return response;
      if (!hasRole(ws.role, "admin")) return forbidden(c);
      const db = adminClient();
      const { error } = await db.from("workspace_settings").upsert(
        { workspace_id: ws.id, section, data: body },
        { onConflict: "workspace_id,section" }
      );
      if (error) throw error;
      // Record genuine settings changes (the audit-log section itself is never
      // user-edited, so don't log writes to it — that would be self-referential).
      const AUDIT_LABELS: Record<string, { action: string; category: AuditCategory }> = {
        workspace:    { action: "Updated workspace settings", category: "Settings" },
        members:      { action: "Updated members", category: "Members" },
        "api-keys":   { action: "Updated API keys", category: "API" },
        webhooks:     { action: "Updated webhooks", category: "Integrations" },
        notifications:{ action: "Updated notification settings", category: "Settings" },
        appearance:   { action: "Updated appearance settings", category: "Settings" },
        timezone:     { action: "Updated timezone settings", category: "Settings" },
      };
      const label = AUDIT_LABELS[section];
      if (label) await writeAudit(c, ws.id, label.action, "", label.category);
      return c.json(body);
    }

    // User-scoped (profile, billing) → KV per user.
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    await kv.set(`settings:${section}:${user.id}`, body);
    return c.json(body);
  } catch (e) {
    console.error("PUT /settings/:section error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Financial data ────────────────────────────────────────────────────────────

const SEED_FINANCIAL = {
  revenue: [
    { month: "Jan", revenue: 420, target: 400 },
    { month: "Feb", revenue: 380, target: 420 },
    { month: "Mar", revenue: 510, target: 450 },
    { month: "Apr", revenue: 490, target: 470 },
    { month: "May", revenue: 560, target: 500 },
    { month: "Jun", revenue: 620, target: 530 },
  ],
  budget: [
    { category: "Engineering", budget: 180, actual: 162 },
    { category: "Design", budget: 60, actual: 58 },
    { category: "Marketing", budget: 80, actual: 94 },
    { category: "Operations", budget: 40, actual: 37 },
    { category: "Sales", budget: 70, actual: 65 },
  ],
  cashflow: [
    { month: "Jan", inflow: 520, outflow: 410 },
    { month: "Feb", inflow: 480, outflow: 430 },
    { month: "Mar", inflow: 610, outflow: 470 },
    { month: "Apr", inflow: 590, outflow: 490 },
    { month: "May", inflow: 680, outflow: 520 },
    { month: "Jun", inflow: 720, outflow: 540 },
  ],
  quarterly: [
    { quarter: "Q1 25", revenue: 1240, expenses: 980, profit: 260 },
    { quarter: "Q2 25", revenue: 1580, expenses: 1100, profit: 480 },
    { quarter: "Q3 25", revenue: 1420, expenses: 1050, profit: 370 },
    { quarter: "Q4 25", revenue: 1890, expenses: 1230, profit: 660 },
    { quarter: "Q1 26", revenue: 1650, expenses: 1140, profit: 510 },
    { quarter: "Q2 26", revenue: 1920, expenses: 1280, profit: 640 },
  ],
  expenses: [
    { name: "Engineering", value: 42, color: "#818cf8" },
    { name: "Marketing", value: 22, color: "#10b981" },
    { name: "Sales", value: 18, color: "#f59e0b" },
    { name: "Operations", value: 10, color: "#3b82f6" },
    { name: "Other", value: 8, color: "#525252" },
  ],
  kpis: [
    { name: "Customer Satisfaction", value: 87, target: 90, color: "#818cf8" },
    { name: "Employee Retention", value: 94, target: 95, color: "#10b981" },
    { name: "Project On-Time Rate", value: 76, target: 85, color: "#f59e0b" },
    { name: "Budget Utilization", value: 91, target: 100, color: "#3b82f6" },
  ],
  strategicGoals: [
    { goal: "Launch v2.0 Platform", progress: 68, status: "on-track", due: "Q3 2026" },
    { goal: "Expand to EU Market", progress: 34, status: "at-risk", due: "Q4 2026" },
    { goal: "Hire 20 Engineers", progress: 55, status: "on-track", due: "Q3 2026" },
    { goal: "SOC 2 Certification", progress: 80, status: "ahead", due: "Q2 2026" },
    { goal: "Partner Program Launch", progress: 20, status: "at-risk", due: "Q4 2026" },
  ],
  headcount: 87,
  q2Revenue: "$3.8M",
  grossMargin: "64%",
};

app.get("/financial", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const data = await getOrSeed(`financial:data:${ws.id}`, SEED_FINANCIAL);
    return c.json(data);
  } catch (e) {
    console.error("GET /financial error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/financial", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const body = await c.req.json();
    const existing = await getOrSeed(`financial:data:${ws.id}`, SEED_FINANCIAL);
    const updated = { ...existing, ...body };
    await kv.set(`financial:data:${ws.id}`, updated);
    return c.json(updated);
  } catch (e) {
    console.error("PUT /financial error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Integrations ──────────────────────────────────────────────────────────────

const SEED_INTEGRATIONS = [
  { name: "GitHub", description: "Sync pull requests and issues", connected: true, lastSync: "2 min ago", scopes: "repos, issues" },
  { name: "Slack", description: "Receive task notifications in channels", connected: true, lastSync: "5 min ago", scopes: "messages, channels" },
  { name: "Figma", description: "Link design files to tasks", connected: false, lastSync: null, scopes: "files, comments" },
  { name: "Google Calendar", description: "Two-way event sync", connected: false, lastSync: null, scopes: "calendar, events" },
  { name: "Jira", description: "Import and track Jira issues", connected: false, lastSync: null, scopes: "projects, issues" },
  { name: "Notion", description: "Sync pages and databases", connected: false, lastSync: null, scopes: "pages, databases" },
  { name: "Zoom", description: "Auto-attach Zoom links to events", connected: false, lastSync: null, scopes: "meetings" },
  { name: "Zapier", description: "Automate workflows across apps", connected: false, lastSync: null, scopes: "triggers, actions" },
];

app.get("/integrations", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const data = await getOrSeed(`integrations:list:${ws.id}`, SEED_INTEGRATIONS);
    return c.json(data);
  } catch (e) {
    console.error("GET /integrations error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/integrations/:name", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "admin")) return forbidden(c);
    const name = decodeURIComponent(c.req.param("name"));
    const body = await c.req.json();
    const integrations = await getOrSeed(`integrations:list:${ws.id}`, SEED_INTEGRATIONS);
    const idx = integrations.findIndex((i: any) => i.name === name);
    if (idx === -1) return c.json({ error: "Integration not found" }, 404);
    const wasConnected = !!integrations[idx].connected;
    integrations[idx] = { ...integrations[idx], ...body };
    await kv.set(`integrations:list:${ws.id}`, integrations);
    if (typeof body.connected === "boolean" && body.connected !== wasConnected) {
      await writeAudit(
        c, ws.id,
        body.connected ? "Connected integration" : "Disconnected integration",
        name, "Integrations",
      );
    }
    return c.json(integrations[idx]);
  } catch (e) {
    console.error("PUT /integrations/:name error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Sessions (active device sessions) ────────────────────────────────────────

const SEED_SESSIONS = {
  active: [
    { device: "Chrome on macOS", location: "Jakarta, ID", ip: "103.41.22.5", lastActive: "Now — current session", current: true },
    { device: "Safari on iPhone 15", location: "Jakarta, ID", ip: "103.41.22.9", lastActive: "2 hours ago", current: false },
    { device: "Chrome on Windows 11", location: "Singapore, SG", ip: "128.76.14.3", lastActive: "3 days ago", current: false },
  ],
  loginHistory: [
    { date: "Jun 8, 2026 09:14", ip: "103.41.22.5", device: "Chrome / macOS", status: "success" },
    { date: "Jun 7, 2026 18:30", ip: "103.41.22.9", device: "Safari / iOS", status: "success" },
    { date: "Jun 6, 2026 22:01", ip: "91.198.174.0", device: "Firefox / Unknown", status: "failed" },
    { date: "Jun 5, 2026 10:55", ip: "103.41.22.5", device: "Chrome / macOS", status: "success" },
    { date: "Jun 3, 2026 08:22", ip: "128.76.14.3", device: "Chrome / Windows", status: "success" },
  ],
};

app.get("/sessions", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const data = await getOrSeed(`security:sessions:${ws.id}`, SEED_SESSIONS);
    return c.json(data);
  } catch (e) {
    console.error("GET /sessions error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.delete("/sessions/:device", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "admin")) return forbidden(c);
    const device = decodeURIComponent(c.req.param("device"));
    const data = await getOrSeed(`security:sessions:${ws.id}`, SEED_SESSIONS);
    data.active = data.active.filter((s: any) => s.device !== device);
    await kv.set(`security:sessions:${ws.id}`, data);
    return c.json({ ok: true });
  } catch (e) {
    console.error("DELETE /sessions/:device error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Analytics aggregate metrics ───────────────────────────────────────────────

const SEED_ANALYTICS = {
  timeTracking: {
    avgHoursPerDay: 6.8,
    billableHours: 1240,
    overtimeRate: 12,
    focusTime: 4.2,
    byTeam: [
      { team: "Development", hours: 420, color: "#818cf8" },
      { team: "Design", hours: 280, color: "#a78bfa" },
      { team: "QA", hours: 310, color: "#34d399" },
      { team: "Product", hours: 230, color: "#f59e0b" },
    ],
    allocation: [
      { label: "Feature Development", pct: 42, color: "#818cf8" },
      { label: "Bug Fixes", pct: 18, color: "#f87171" },
      { label: "Meetings & Reviews", pct: 15, color: "#f59e0b" },
      { label: "Testing & QA", pct: 14, color: "#34d399" },
      { label: "Documentation", pct: 11, color: "#64748b" },
    ],
  },
  teamEfficiency: {
    overall: 85,
    sprintVelocity: 34,
    blockedTime: 8,
    reworkRate: 4.3,
    byTeam: [
      { team: "Development", score: 90, velocity: 34, blocked: 7, color: "#818cf8" },
      { team: "QA", score: 87, velocity: 28, blocked: 5, color: "#34d399" },
      { team: "Design", score: 83, velocity: 22, blocked: 9, color: "#a78bfa" },
      { team: "Product Management", score: 81, velocity: 18, blocked: 11, color: "#f59e0b" },
    ],
    sprintHistory: [
      { sprint: "Sprint 18", velocity: 34, done: 34, goal: 32, hit: true },
      { sprint: "Sprint 17", velocity: 31, done: 29, goal: 30, hit: false },
      { sprint: "Sprint 16", velocity: 28, done: 31, goal: 28, hit: true },
      { sprint: "Sprint 15", velocity: 26, done: 26, goal: 25, hit: true },
    ],
  },
  benchmarks: {
    industryRank: "Top 15%",
    onTimeDelivery: 91,
    qualityScore: 9.1,
    nps: 72,
    comparison: [
      { label: "Task Completion Rate", team: 87, industry: 74 },
      { label: "On-time Delivery", team: 91, industry: 79 },
      { label: "Sprint Velocity (norm.)", team: 85, industry: 68 },
      { label: "Bug Escape Rate (inv.)", team: 92, industry: 80 },
      { label: "Team Satisfaction", team: 84, industry: 71 },
    ],
    history: [
      { quarter: "Q2 2026", score: "91%", rank: "Top 15%", delta: "+7%" },
      { quarter: "Q1 2026", score: "84%", rank: "Top 22%", delta: "+4%" },
      { quarter: "Q4 2025", score: "80%", rank: "Top 28%", delta: "+3%" },
      { quarter: "Q3 2025", score: "77%", rank: "Top 31%", delta: "+1%" },
    ],
  },
  efficiencyScores: [
    { team: "Development", score: 90, color: "#818cf8" },
    { team: "QA", score: 87, color: "#34d399" },
    { team: "Design", score: 83, color: "#a78bfa" },
    { team: "Product", score: 81, color: "#f59e0b" },
  ],
  completionSeries: {
    "8w": [
      { week: "W1", completed: 18, target: 22 }, { week: "W2", completed: 22, target: 22 },
      { week: "W3", completed: 19, target: 22 }, { week: "W4", completed: 28, target: 25 },
      { week: "W5", completed: 24, target: 25 }, { week: "W6", completed: 31, target: 25 },
      { week: "W7", completed: 27, target: 28 }, { week: "W8", completed: 35, target: 28 },
    ],
    "3m": [
      { week: "Mar W1", completed: 21, target: 20 }, { week: "Mar W2", completed: 25, target: 20 },
      { week: "Apr W1", completed: 18, target: 22 }, { week: "Apr W2", completed: 29, target: 22 },
      { week: "May W1", completed: 26, target: 24 }, { week: "May W2", completed: 31, target: 24 },
      { week: "Jun W1", completed: 28, target: 26 }, { week: "Jun W2", completed: 35, target: 26 },
    ],
    qtr: [
      { week: "Apr W1", completed: 18, target: 22 }, { week: "Apr W2", completed: 29, target: 22 },
      { week: "Apr W3", completed: 24, target: 22 }, { week: "Apr W4", completed: 31, target: 22 },
      { week: "May W1", completed: 26, target: 24 }, { week: "May W2", completed: 31, target: 24 },
      { week: "Jun W1", completed: 28, target: 26 }, { week: "Jun W2", completed: 35, target: 26 },
    ],
  },
  productivitySeries: {
    "8w": [
      { month: "Jan", dev: 78, design: 65, qa: 82 }, { month: "Feb", dev: 82, design: 70, qa: 79 },
      { month: "Mar", dev: 75, design: 74, qa: 85 }, { month: "Apr", dev: 88, design: 80, qa: 88 },
      { month: "May", dev: 84, design: 77, qa: 91 }, { month: "Jun", dev: 90, design: 83, qa: 87 },
    ],
    "3m": [
      { month: "Mar", dev: 75, design: 74, qa: 85 }, { month: "Apr", dev: 88, design: 80, qa: 88 },
      { month: "May", dev: 84, design: 77, qa: 91 }, { month: "Jun", dev: 90, design: 83, qa: 87 },
    ],
    qtr: [
      { month: "Apr", dev: 88, design: 80, qa: 88 }, { month: "May", dev: 84, design: 77, qa: 91 },
      { month: "Jun", dev: 90, design: 83, qa: 87 },
    ],
  },
  taskMetrics: {
    avgCycleTime: "3.2d", cycleChange: "-0.4d",
    completionChange: "+5%", overdueChange: "-3",
  },
};

app.get("/analytics/metrics", async (c) => {
  try {
    const gate = await requirePlan(c, "pro");
    if (!gate.user) return gate.response;
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const key = `analytics:metrics:${ws.id}`;
    const stored = await kv.get(key);
    // Merge seed defaults so newly added fields appear for previously seeded workspaces
    const data = stored ? { ...SEED_ANALYTICS, ...stored } : SEED_ANALYTICS;
    if (!stored) await kv.set(key, SEED_ANALYTICS);
    else if (!stored.completionSeries) await kv.set(key, data);
    return c.json(data);
  } catch (e) {
    console.error("GET /analytics/metrics error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/analytics/metrics", async (c) => {
  try {
    const gate = await requirePlan(c, "pro");
    if (!gate.user) return gate.response;
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const body = await c.req.json();
    const existing = await getOrSeed(`analytics:metrics:${ws.id}`, SEED_ANALYTICS);
    const updated = { ...existing, ...body };
    await kv.set(`analytics:metrics:${ws.id}`, updated);
    return c.json(updated);
  } catch (e) {
    console.error("PUT /analytics/metrics error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Dashboard operational metrics ─────────────────────────────────────────────

const SEED_DASHBOARD_OPS = {
  projectTimeline: [
    { project: "Web App v2", start: 10, duration: 40, status: "in-progress" },
    { project: "Mobile App", start: 25, duration: 30, status: "in-progress" },
    { project: "API Redesign", start: 5, duration: 20, status: "completed" },
    { project: "Data Pipeline", start: 35, duration: 45, status: "planning" },
    { project: "Admin Panel", start: 50, duration: 25, status: "in-progress" },
  ],
  resourceData: [
    { team: "Dev", allocated: 85, available: 15 },
    { team: "Design", allocated: 72, available: 28 },
    { team: "QA", allocated: 90, available: 10 },
    { team: "DevOps", allocated: 60, available: 40 },
  ],
  capacityData: [
    { week: "W1", capacity: 80, utilization: 72 },
    { week: "W2", capacity: 80, utilization: 78 },
    { week: "W3", capacity: 80, utilization: 85 },
    { week: "W4", capacity: 80, utilization: 68 },
    { week: "W5", capacity: 80, utilization: 91 },
    { week: "W6", capacity: 80, utilization: 76 },
  ],
  dailyData: [
    { day: "Mon", tasks: 12, hours: 7.5, bugs: 2 },
    { day: "Tue", tasks: 15, hours: 8.2, bugs: 1 },
    { day: "Wed", tasks: 9, hours: 6.8, bugs: 3 },
    { day: "Thu", tasks: 18, hours: 8.5, bugs: 0 },
    { day: "Fri", tasks: 14, hours: 7.1, bugs: 1 },
  ],
  monthlyTrend: [
    { month: "Jan", delivered: 42, planned: 50, velocity: 84 },
    { month: "Feb", delivered: 38, planned: 45, velocity: 84 },
    { month: "Mar", delivered: 55, planned: 55, velocity: 100 },
    { month: "Apr", delivered: 49, planned: 52, velocity: 94 },
    { month: "May", delivered: 62, planned: 60, velocity: 103 },
    { month: "Jun", delivered: 58, planned: 65, velocity: 89 },
  ],
  performanceMetrics: [
    { metric: "Avg. Task Completion Time", value: "2.3 days", change: "-0.4 days", up: true },
    { metric: "Code Review Cycle", value: "18 hrs", change: "-3 hrs", up: true },
    { metric: "Bug Escape Rate", value: "4.2%", change: "+0.8%", up: false },
    { metric: "Deploy Frequency", value: "3.1/wk", change: "+0.5/wk", up: true },
    { metric: "Mean Time to Recovery", value: "1.8 hrs", change: "-0.6 hrs", up: true },
    { metric: "Test Coverage", value: "78%", change: "+3%", up: true },
  ],
  riskItems: [
    { risk: "Resource shortage — Engineering", likelihood: "High", impact: "High", color: "#ef4444" },
    { risk: "Deadline slip — Web App v2", likelihood: "Medium", impact: "High", color: "#f59e0b" },
    { risk: "Budget overrun — Marketing", likelihood: "High", impact: "Medium", color: "#f59e0b" },
    { risk: "Key person dependency — API", likelihood: "Low", impact: "High", color: "#3b82f6" },
    { risk: "Security vulnerability", likelihood: "Low", impact: "Critical", color: "#ef4444" },
  ],
  forecastData: [
    { month: "Jul", forecast: 680, lower: 620, upper: 740 },
    { month: "Aug", forecast: 720, lower: 645, upper: 795 },
    { month: "Sep", forecast: 765, lower: 670, upper: 860 },
    { month: "Oct", forecast: 810, lower: 700, upper: 920 },
    { month: "Nov", forecast: 870, lower: 740, upper: 1000 },
    { month: "Dec", forecast: 940, lower: 790, upper: 1090 },
  ],
  deptHighlights: [
    { dept: "Engineering", metric: "84 PRs merged", sub: "+12% vs last month", up: true },
    { dept: "Design", metric: "31 screens delivered", sub: "+8% vs last month", up: true },
    { dept: "Sales", metric: "$1.2M pipeline", sub: "-5% vs last month", up: false },
    { dept: "Support", metric: "98% resolution rate", sub: "+2% vs last month", up: true },
  ],
};

app.get("/dashboard/ops", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const data = await getOrSeed(`dashboard:ops:${ws.id}`, SEED_DASHBOARD_OPS);
    return c.json(data);
  } catch (e) {
    console.error("GET /dashboard/ops error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/dashboard/ops", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const body = await c.req.json();
    const existing = await getOrSeed(`dashboard:ops:${ws.id}`, SEED_DASHBOARD_OPS);
    const updated = { ...existing, ...body };
    await kv.set(`dashboard:ops:${ws.id}`, updated);
    return c.json(updated);
  } catch (e) {
    console.error("PUT /dashboard/ops error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Dashboard detail views (drill-down sub-view data) ────────────────────────

const SEED_DASHBOARD_DETAILS = {
  executiveSummary: {
    stats: [
      { label: "Q2 Revenue", value: "$3.8M", sub: "+18% YoY", up: true },
      { label: "Gross Margin", value: "64%", sub: "+3pp", up: true },
      { label: "Active Projects", value: "11", sub: "3 at risk" },
      { label: "Headcount", value: "87", sub: "+6 this quarter", up: true },
    ],
  },
  execRevenue: {
    stats: [
      { label: "Jun Revenue", value: "$620k", sub: "+11% vs May", up: true },
      { label: "vs Target", value: "+17%", sub: "above plan", up: true },
      { label: "YTD Revenue", value: "$2.98M", sub: "vs $2.74M plan", up: true },
      { label: "Forecast EOY", value: "$7.4M", sub: "+22% YoY", up: true },
    ],
    growth: [
      { month: "Feb", growth: -9 }, { month: "Mar", growth: 34 }, { month: "Apr", growth: -4 },
      { month: "May", growth: 14 }, { month: "Jun", growth: 11 },
    ],
  },
  execKpis: {
    stats: [
      { label: "Above Target", value: "3", sub: "of 6 KPIs", up: true },
      { label: "At Risk", value: "2", sub: "need attention" },
      { label: "Avg. Score", value: "86%", sub: "+2pp this month", up: true },
      { label: "Critical", value: "1", sub: "project on-time" },
    ],
    kpis: [
      { name: "Customer Satisfaction", value: 87, target: 90, color: "#818cf8" },
      { name: "Employee Retention", value: 94, target: 95, color: "#10b981" },
      { name: "Project On-Time Rate", value: 76, target: 85, color: "#f59e0b" },
      { name: "Budget Utilization", value: 91, target: 100, color: "#3b82f6" },
      { name: "NPS Score", value: 72, target: 80, color: "#818cf8" },
      { name: "Support SLA", value: 98, target: 99, color: "#10b981" },
    ],
  },
  execGoals: {
    stats: [
      { label: "Total Goals", value: "6", sub: "active initiatives" },
      { label: "On Track", value: "3", sub: "per plan", up: true },
      { label: "At Risk", value: "2", sub: "need escalation" },
      { label: "Ahead", value: "1", sub: "SOC 2 cert", up: true },
    ],
    goals: [
      { goal: "Launch v2.0 Platform", progress: 68, status: "on-track", due: "Q3 2026", owner: "Engineering" },
      { goal: "Expand to EU Market", progress: 34, status: "at-risk", due: "Q4 2026", owner: "Sales" },
      { goal: "Hire 20 Engineers", progress: 55, status: "on-track", due: "Q3 2026", owner: "HR" },
      { goal: "SOC 2 Certification", progress: 80, status: "ahead", due: "Q2 2026", owner: "Security" },
      { goal: "Partner Program Launch", progress: 20, status: "at-risk", due: "Q4 2026", owner: "BD" },
      { goal: "Mobile App v3", progress: 45, status: "on-track", due: "Q3 2026", owner: "Product" },
    ],
  },
  execDepartments: {
    stats: [
      { label: "Departments", value: "6", sub: "reporting" },
      { label: "Above Target", value: "4", sub: "this month", up: true },
      { label: "Below Target", value: "1", sub: "Sales", up: false },
      { label: "Avg. Health", value: "82%", sub: "+3pp", up: true },
    ],
    depts: [
      { dept: "Engineering", metric: "84 PRs merged", kpi: "Velocity: 89%", trend: "+12%", up: true, color: "#818cf8" },
      { dept: "Design", metric: "31 screens delivered", kpi: "On-time: 94%", trend: "+8%", up: true, color: "#10b981" },
      { dept: "Sales", metric: "$1.2M pipeline", kpi: "Conversion: 18%", trend: "-5%", up: false, color: "#f59e0b" },
      { dept: "Support", metric: "98% resolution rate", kpi: "SLA: 99.2%", trend: "+2%", up: true, color: "#3b82f6" },
      { dept: "Marketing", metric: "2,400 leads", kpi: "CAC: $142", trend: "+15%", up: true, color: "#818cf8" },
      { dept: "HR", metric: "3 hires closed", kpi: "Retention: 94%", trend: "0%", up: true, color: "#10b981" },
    ],
  },
  operations: {
    stats: [
      { label: "Active Projects", value: "8", sub: "3 teams involved" },
      { label: "On-Time Delivery", value: "76%", sub: "-4% vs last mo.", up: false },
      { label: "Avg. Velocity", value: "42 pts", sub: "+6 this sprint", up: true },
      { label: "Blockers", value: "5", sub: "2 escalated" },
    ],
  },
  opsTimeline: {
    stats: [
      { label: "Active Projects", value: "5", sub: "in development" },
      { label: "On Schedule", value: "3", sub: "of 5", up: true },
      { label: "Delayed", value: "1", sub: "Web App v2" },
      { label: "Completed", value: "1", sub: "this period", up: true },
    ],
    projects: [
      { project: "Web App v2", phase: "Development", start: 10, duration: 40, status: "in-progress", due: "Aug 15" },
      { project: "Mobile App", phase: "Design", start: 25, duration: 30, status: "in-progress", due: "Jul 30" },
      { project: "API Redesign", phase: "Done", start: 5, duration: 20, status: "completed", due: "Jun 1" },
      { project: "Data Pipeline", phase: "Planning", start: 35, duration: 45, status: "planning", due: "Sep 20" },
      { project: "Admin Panel", phase: "Development", start: 50, duration: 25, status: "in-progress", due: "Aug 1" },
      { project: "Auth Service", phase: "Testing", start: 60, duration: 15, status: "review", due: "Jul 10" },
    ],
  },
  opsResources: {
    stats: [
      { label: "Avg. Utilization", value: "76%", sub: "+4% vs last mo.", up: true },
      { label: "Over-capacity", value: "1 team", sub: "QA at 90%" },
      { label: "Under-utilized", value: "1 team", sub: "DevOps at 60%" },
      { label: "Total Headcount", value: "47", sub: "across 5 teams" },
    ],
    resources: [
      { team: "Engineering", allocated: 85, available: 15, headcount: 24 },
      { team: "Design", allocated: 72, available: 28, headcount: 8 },
      { team: "QA", allocated: 90, available: 10, headcount: 6 },
      { team: "DevOps", allocated: 60, available: 40, headcount: 4 },
      { team: "Product", allocated: 75, available: 25, headcount: 5 },
    ],
  },
  opsPerformance: {
    stats: [
      { label: "Avg. Completion", value: "78%", sub: "+6% vs last sprint", up: true },
      { label: "Best Team", value: "QA", sub: "94% completion", up: true },
      { label: "Velocity", value: "42 pts", sub: "+6 this sprint", up: true },
      { label: "Blockers", value: "5", sub: "2 escalated" },
    ],
    scorecard: [
      { team: "Engineering", done: 31, total: 48, color: "#818cf8" },
      { team: "Design", done: 19, total: 24, color: "#10b981" },
      { team: "QA", done: 17, total: 18, color: "#3b82f6" },
      { team: "Product", done: 10, total: 12, color: "#f59e0b" },
    ],
    sprintHistory: [
      { sprint: "S1", eng: 72, design: 88 }, { sprint: "S2", eng: 81, design: 75 },
      { sprint: "S3", eng: 68, design: 92 }, { sprint: "S4", eng: 85, design: 80 },
      { sprint: "S5", eng: 79, design: 87 },
    ],
  },
  opsCapacity: {
    stats: [
      { label: "Current Capacity", value: "80 pts", sub: "this sprint" },
      { label: "Utilization", value: "76%", sub: "of capacity", up: true },
      { label: "Projected Aug", value: "85 pts", sub: "+6% growth", up: true },
      { label: "Hiring Gap", value: "3 FTEs", sub: "to reach Q3 target" },
    ],
    series: [
      { week: "W1", capacity: 80, demand: 72 }, { week: "W2", capacity: 80, demand: 78 },
      { week: "W3", capacity: 80, demand: 85 }, { week: "W4", capacity: 82, demand: 68 },
      { week: "W5", capacity: 82, demand: 91 }, { week: "W6", capacity: 85, demand: 76 },
    ],
    hiringPlan: [
      { role: "Senior Engineer ×2", month: "Jul 2026", impact: "+16 pts/sprint" },
      { role: "QA Engineer ×1", month: "Aug 2026", impact: "+8 pts/sprint" },
      { role: "DevOps ×1", month: "Sep 2026", impact: "+6 pts/sprint" },
    ],
  },
  financial: {
    stats: [
      { label: "Q2 Revenue", value: "$3.8M", sub: "+18% YoY", up: true },
      { label: "Total Expenses", value: "$2.5M", sub: "+11% YoY", up: false },
      { label: "Net Profit", value: "$1.3M", sub: "+28% · 34% margin", up: true },
      { label: "Runway", value: "14 mo.", sub: "at current burn" },
    ],
  },
  finBudget: {
    stats: [
      { label: "Total Budget", value: "$430k", sub: "Q2 approved" },
      { label: "Actual Spend", value: "$416k", sub: "-3.3% under", up: true },
      { label: "Over Budget", value: "1 dept", sub: "Marketing +18%" },
      { label: "Remaining", value: "$14k", sub: "available", up: true },
    ],
  },
  finCashflow: {
    stats: [
      { label: "Jun Inflow", value: "$720k", sub: "+6% vs May", up: true },
      { label: "Jun Outflow", value: "$540k", sub: "+4% vs May" },
      { label: "Net Cash Flow", value: "$180k", sub: "+14% vs May", up: true },
      { label: "Cash Position", value: "$2.1M", sub: "current balance", up: true },
    ],
  },
  finExpense: {
    stats: [
      { label: "Total Expenses", value: "$2.5M", sub: "+11% vs Q1" },
      { label: "Largest Dept", value: "Engineering", sub: "42% of spend" },
      { label: "Fastest Growth", value: "Marketing", sub: "+28% vs Q1" },
      { label: "Cost per Head", value: "$28.7k", sub: "avg. per person" },
    ],
    trend: [
      { month: "Jan", eng: 180, mktg: 60 }, { month: "Feb", eng: 175, mktg: 65 },
      { month: "Mar", eng: 185, mktg: 72 }, { month: "Apr", eng: 190, mktg: 80 },
      { month: "May", eng: 195, mktg: 88 }, { month: "Jun", eng: 200, mktg: 94 },
    ],
  },
  finPL: {
    stats: [
      { label: "Gross Revenue", value: "$3.82M", sub: "+18% vs Q1", up: true },
      { label: "COGS", value: "$1.38M", sub: "36% of revenue" },
      { label: "EBITDA", value: "$1.30M", sub: "34% margin", up: true },
      { label: "Net Profit", value: "$1.21M", sub: "+28% vs Q1", up: true },
    ],
    rows: [
      { label: "Gross Revenue", value: "$3,820,000", bold: false },
      { label: "Cost of Goods Sold", value: "($1,375,200)", bold: false, neg: true },
      { label: "Gross Profit", value: "$2,444,800", bold: true },
      { label: "Operating Expenses", value: "($1,148,000)", bold: false, neg: true },
      { label: "EBITDA", value: "$1,296,800", bold: true },
      { label: "Depreciation & Amortization", value: "($86,000)", bold: false, neg: true },
      { label: "Net Profit", value: "$1,210,800", bold: true, highlight: true },
    ],
  },
  weeklyReport: {
    stats: [
      { label: "Tasks Completed", value: "68", sub: "+12 vs prev. week", up: true },
      { label: "Hours Logged", value: "38.1", sub: "avg. 7.6/day" },
      { label: "Bugs Resolved", value: "7", sub: "-3 vs prev. week", up: true },
      { label: "PRs Merged", value: "14", sub: "+4 vs prev. week", up: true },
    ],
    wins: ["Shipped auth module to staging", "Completed design system audit", "Resolved 7 critical bugs", "Onboarded 2 new engineers"],
    blockers: ["EU data residency decision pending", "QA resources stretched across 3 sprints", "API partner integration delayed"],
  },
  weeklyProductivity: {
    stats: [
      { label: "Tasks Completed", value: "68", sub: "+12 vs last week", up: true },
      { label: "Hours Logged", value: "38.1", sub: "avg. 7.6/day" },
      { label: "Avg. Velocity", value: "8.5 pts", sub: "+1.2 vs avg.", up: true },
      { label: "Focus Time", value: "72%", sub: "of logged hours", up: true },
    ],
  },
  weeklyCompletion: {
    stats: [
      { label: "Milestones Hit", value: "3", sub: "of 4 planned", up: true },
      { label: "Avg. Completion", value: "76%", sub: "of sprint goals", up: true },
      { label: "Slipped Tasks", value: "8", sub: "moved to next week" },
      { label: "PRs Merged", value: "14", sub: "+4 vs last week", up: true },
    ],
    projects: [
      { project: "Web App v2", planned: 12, completed: 9, rate: 75 },
      { project: "Mobile App", planned: 8, completed: 8, rate: 100 },
      { project: "API Redesign", planned: 5, completed: 4, rate: 80 },
      { project: "Data Pipeline", planned: 6, completed: 3, rate: 50 },
    ],
  },
  weeklyBudget: {
    stats: [
      { label: "Week Spend", value: "$48.2k", sub: "of $52k budget", up: true },
      { label: "Utilization", value: "93%", sub: "on track", up: true },
      { label: "Largest Expense", value: "Payroll", sub: "$38k (79%)" },
      { label: "Savings", value: "$3.8k", sub: "vs planned", up: true },
    ],
    dailySpend: [
      { day: "Mon", spend: 9.2 }, { day: "Tue", spend: 10.1 }, { day: "Wed", spend: 8.8 },
      { day: "Thu", spend: 11.4 }, { day: "Fri", spend: 8.7 },
    ],
    categories: [
      { cat: "Payroll", amount: "$38k", pct: 79, color: "#818cf8" },
      { cat: "Software", amount: "$5.2k", pct: 11, color: "#10b981" },
      { cat: "Cloud Infra", amount: "$3.8k", pct: 8, color: "#f59e0b" },
      { cat: "Other", amount: "$1.2k", pct: 2, color: "#525252" },
    ],
  },
  weeklySatisfaction: {
    stats: [
      { label: "Avg. CSAT", value: "4.6/5", sub: "+0.2 vs last week", up: true },
      { label: "NPS Score", value: "72", sub: "+4 this week", up: true },
      { label: "Tickets Resolved", value: "34", sub: "of 36 open", up: true },
      { label: "Escalations", value: "2", sub: "both resolved" },
    ],
    csatTrend: [
      { day: "Mon", score: 4.4 }, { day: "Tue", score: 4.7 }, { day: "Wed", score: 4.5 },
      { day: "Thu", score: 4.8 }, { day: "Fri", score: 4.6 },
    ],
    themes: [
      { theme: "Fast response time", count: 18, positive: true },
      { theme: "Clear communication", count: 14, positive: true },
      { theme: "Feature requests", count: 8, positive: false },
      { theme: "Bug reports", count: 5, positive: false },
    ],
  },
  monthlyInsights: {
    stats: [
      { label: "Stories Delivered", value: "58", sub: "+16 vs May", up: true },
      { label: "Sprint Velocity", value: "89%", sub: "of planned capacity" },
      { label: "Defect Rate", value: "3.8%", sub: "-0.4% vs May", up: true },
      { label: "Releases", value: "4", sub: "2 major, 2 patch" },
    ],
    highlights: [
      { title: "Product Releases", value: "4 shipped", icon: "layers" },
      { title: "Team Growth", value: "+2 engineers", icon: "users" },
      { title: "Avg. Response Time", value: "1.4 hrs", icon: "clock" },
      { title: "Customer NPS", value: "72 (+4)", icon: "target" },
      { title: "Revenue Growth", value: "+11% MoM", icon: "dollar" },
      { title: "Bug Backlog", value: "23 (-8)", icon: "activity" },
    ],
  },
  monthlyRevenue: {
    stats: [
      { label: "Jun Revenue", value: "$638k", sub: "+11% MoM", up: true },
      { label: "vs May", value: "+$63k", sub: "absolute growth", up: true },
      { label: "YTD Growth", value: "+22%", sub: "vs same period", up: true },
      { label: "Run Rate", value: "$7.6M", sub: "annualized", up: true },
    ],
    trend: [
      { month: "Jan", revenue: 520 }, { month: "Feb", revenue: 480 }, { month: "Mar", revenue: 610 },
      { month: "Apr", revenue: 575 }, { month: "May", revenue: 575 }, { month: "Jun", revenue: 638 },
    ],
    channels: [
      { channel: "Enterprise", revenue: "$320k", pct: 50, growth: "+14%" },
      { channel: "SMB", revenue: "$191k", pct: 30, growth: "+8%" },
      { channel: "Self-serve", revenue: "$127k", pct: 20, growth: "+12%" },
    ],
  },
  monthlyClients: {
    stats: [
      { label: "New Clients", value: "12", sub: "+3 vs May", up: true },
      { label: "Pipeline", value: "34", sub: "active prospects" },
      { label: "Win Rate", value: "26%", sub: "+4pp vs May", up: true },
      { label: "Avg. Deal", value: "$42k", sub: "ACV", up: true },
    ],
    trend: [
      { month: "Jan", clients: 7 }, { month: "Feb", clients: 9 }, { month: "Mar", clients: 11 },
      { month: "Apr", clients: 8 }, { month: "May", clients: 9 }, { month: "Jun", clients: 12 },
    ],
    segments: [
      { seg: "Enterprise (>500)", count: 3, value: "$182k" },
      { seg: "Mid-market", count: 5, value: "$124k" },
      { seg: "SMB (<50)", count: 4, value: "$48k" },
    ],
  },
  monthlyExpansion: {
    stats: [
      { label: "Total Headcount", value: "87", sub: "+6 this month", up: true },
      { label: "New Hires", value: "6", sub: "joined in June", up: true },
      { label: "Open Roles", value: "14", sub: "actively recruiting" },
      { label: "Time to Fill", value: "38 days", sub: "avg.", up: true },
    ],
    headcount: [
      { month: "Jan", hc: 72 }, { month: "Feb", hc: 74 }, { month: "Mar", hc: 76 },
      { month: "Apr", hc: 80 }, { month: "May", hc: 81 }, { month: "Jun", hc: 87 },
    ],
    hires: [
      { dept: "Eng", hires: 3 }, { dept: "Design", hires: 1 }, { dept: "Sales", hires: 1 }, { dept: "Ops", hires: 1 },
    ],
  },
  monthlyCost: {
    stats: [
      { label: "Monthly Savings", value: "$42k", sub: "+$8k vs May", up: true },
      { label: "YTD Savings", value: "$218k", sub: "vs baseline", up: true },
      { label: "Initiatives", value: "8", sub: "active programs" },
      { label: "Q3 Target", value: "$60k/mo", sub: "vs $42k current" },
    ],
    savings: [
      { month: "Jan", savings: 28 }, { month: "Feb", savings: 31 }, { month: "Mar", savings: 35 },
      { month: "Apr", savings: 38 }, { month: "May", savings: 34 }, { month: "Jun", savings: 42 },
    ],
    initiatives: [
      { initiative: "Cloud infrastructure optimization", saving: "$18k/mo", status: "active" },
      { initiative: "SaaS tool consolidation", saving: "$8k/mo", status: "active" },
      { initiative: "Remote work cost savings", saving: "$12k/mo", status: "active" },
      { initiative: "Vendor renegotiation", saving: "$4k/mo", status: "pending" },
    ],
  },
  quarterlyAnalysis: {
    stats: [
      { label: "Q2 Revenue", value: "$3.8M", sub: "+21% QoQ", up: true },
      { label: "Q2 Profit", value: "$1.3M", sub: "+26% QoQ · 34% margin", up: true },
      { label: "New Customers", value: "48", sub: "+15 vs Q1", up: true },
      { label: "Churn Rate", value: "2.1%", sub: "-0.4% vs Q1", up: true },
    ],
    comparison: [
      { metric: "Revenue", q1: "$3.1M", q2: "$3.8M", up: true },
      { metric: "Expenses", q1: "$2.2M", q2: "$2.5M", up: false },
      { metric: "Profit", q1: "$0.9M", q2: "$1.3M", up: true },
      { metric: "Customers", q1: "312", q2: "360", up: true },
      { metric: "Headcount", q1: "81", q2: "87", up: true },
      { metric: "Churn", q1: "2.5%", q2: "2.1%", up: true },
    ],
    okrs: [
      { objective: "Grow ARR to $15M", progress: 71, status: "on-track" },
      { objective: "Reach 360 enterprise customers", progress: 88, status: "ahead" },
      { objective: "Ship platform v2.0", progress: 68, status: "on-track" },
      { objective: "Reduce infra costs by 15%", progress: 40, status: "at-risk" },
    ],
  },
  quarterlyMarket: {
    stats: [
      { label: "Market Share", value: "8.4%", sub: "+1.2pp vs Q1", up: true },
      { label: "Rank", value: "#3", sub: "in segment", up: true },
      { label: "Brand Awareness", value: "34%", sub: "+5pp vs Q1", up: true },
      { label: "Share of Voice", value: "12%", sub: "digital mentions" },
    ],
    shareTrend: [
      { q: "Q3 25", share: 5.8 }, { q: "Q4 25", share: 6.4 }, { q: "Q1 26", share: 7.2 }, { q: "Q2 26", share: 8.4 },
    ],
    competitors: [
      { company: "Our Company", share: 8.4, color: "#818cf8" },
      { company: "Competitor A", share: 22.1, color: "#525252" },
      { company: "Competitor B", share: 14.8, color: "#525252" },
      { company: "Competitor C", share: 11.3, color: "#525252" },
    ],
  },
  quarterlyROI: {
    stats: [
      { label: "Overall ROI", value: "142%", sub: "+18pp vs Q1", up: true },
      { label: "Marketing ROI", value: "380%", sub: "per $ spent", up: true },
      { label: "R&D ROI", value: "210%", sub: "projected 18-mo", up: true },
      { label: "Sales ROI", value: "520%", sub: "revenue / cost", up: true },
    ],
    byArea: [
      { area: "Mktg", roi: 380 }, { area: "Sales", roi: 520 }, { area: "R&D", roi: 210 }, { area: "Ops", roi: 180 },
    ],
    trend: [
      { q: "Q3 25", roi: 112 }, { q: "Q4 25", roi: 128 }, { q: "Q1 26", roi: 124 }, { q: "Q2 26", roi: 142 },
    ],
  },
  quarterlyRetention: {
    stats: [
      { label: "Retention Rate", value: "97.9%", sub: "+0.4pp vs Q1", up: true },
      { label: "Churn Rate", value: "2.1%", sub: "-0.4pp vs Q1", up: true },
      { label: "Churned Accounts", value: "7", sub: "this quarter" },
      { label: "Expansion ARR", value: "$180k", sub: "from upsells", up: true },
    ],
    trend: [
      { q: "Q3 25", ret: 96.2 }, { q: "Q4 25", ret: 97.1 }, { q: "Q1 26", ret: 97.5 }, { q: "Q2 26", ret: 97.9 },
    ],
    churnReasons: [
      { reason: "Price / budget cuts", count: 3, pct: 43 },
      { reason: "Switched to competitor", count: 2, pct: 29 },
      { reason: "Company closure", count: 1, pct: 14 },
      { reason: "Feature gaps", count: 1, pct: 14 },
    ],
  },
  quarterlyInnovation: {
    stats: [
      { label: "Features Shipped", value: "18", sub: "+6 vs Q1", up: true },
      { label: "Patents Filed", value: "2", sub: "this quarter" },
      { label: "R&D Spend", value: "$420k", sub: "11% of revenue" },
      { label: "Innovation Score", value: "74/100", sub: "+8 vs Q1", up: true },
    ],
    features: [
      { q: "Q3 25", features: 10 }, { q: "Q4 25", features: 14 }, { q: "Q1 26", features: 12 }, { q: "Q2 26", features: 18 },
    ],
    breakdown: [
      { area: "New Features", score: 82, color: "#818cf8" },
      { area: "Tech Debt Reduction", score: 68, color: "#10b981" },
      { area: "Infrastructure", score: 75, color: "#3b82f6" },
      { area: "Research Initiatives", score: 60, color: "#f59e0b" },
    ],
  },
  performanceMetrics: {
    stats: [
      { label: "Team Efficiency", value: "82%", sub: "+4% vs last mo.", up: true },
      { label: "Avg. Cycle Time", value: "2.3 days", sub: "-0.4d improvement", up: true },
      { label: "Deploy Frequency", value: "3.1/wk", sub: "+0.5/wk", up: true },
    ],
    radar: [
      { label: "Code Quality", value: 84, color: "#818cf8" },
      { label: "Delivery Speed", value: 76, color: "#10b981" },
      { label: "Collaboration", value: 91, color: "#3b82f6" },
      { label: "Documentation", value: 58, color: "#f59e0b" },
      { label: "Testing", value: 72, color: "#818cf8" },
      { label: "On-time Delivery", value: 76, color: "#10b981" },
      { label: "Bug Rate", value: 88, color: "#3b82f6" },
      { label: "Innovation", value: 65, color: "#f59e0b" },
    ],
  },
  perfSales: {
    stats: [
      { label: "Win Rate", value: "26%", sub: "+4pp vs May", up: true },
      { label: "Deals Closed", value: "12", sub: "this month", up: true },
      { label: "Avg. Sales Cycle", value: "42 days", sub: "-6 days vs avg.", up: true },
      { label: "Pipeline Value", value: "$1.4M", sub: "+$200k vs May", up: true },
    ],
    funnel: [
      { stage: "Leads", count: 280, pct: 100, color: "#525252" },
      { stage: "Qualified", count: 84, pct: 30, color: "#818cf8" },
      { stage: "Proposal", count: 46, pct: 16, color: "#818cf8" },
      { stage: "Negotiation", count: 18, pct: 6, color: "#818cf8" },
      { stage: "Closed Won", count: 12, pct: 4, color: "#10b981" },
    ],
    winRateTrend: [
      { month: "Jan", rate: 18 }, { month: "Feb", rate: 22 }, { month: "Mar", rate: 20 },
      { month: "Apr", rate: 24 }, { month: "May", rate: 22 }, { month: "Jun", rate: 26 },
    ],
  },
  perfResponse: {
    stats: [
      { label: "Avg. Response", value: "1.4 hrs", sub: "-0.6 hrs vs May", up: true },
      { label: "< 1 Hour Rate", value: "68%", sub: "+12pp vs May", up: true },
      { label: "SLA Breach", value: "4%", sub: "-2pp vs May", up: true },
      { label: "Best Rep", value: "SW", sub: "avg. 22 min", up: true },
    ],
    distribution: [
      { range: "< 15 min", pct: 24, color: "#10b981" },
      { range: "15–60 min", pct: 44, color: "#818cf8" },
      { range: "1–4 hours", pct: 20, color: "#f59e0b" },
      { range: "4–24 hours", pct: 8, color: "#ef4444" },
      { range: "> 24 hours", pct: 4, color: "#525252" },
    ],
    trend: [
      { month: "Jan", hrs: 3.2 }, { month: "Feb", hrs: 2.8 }, { month: "Mar", hrs: 2.4 },
      { month: "Apr", hrs: 2.1 }, { month: "May", hrs: 2.0 }, { month: "Jun", hrs: 1.4 },
    ],
  },
  perfCLV: {
    stats: [
      { label: "Avg. CLV", value: "$48.2k", sub: "+$4.1k vs Q1", up: true },
      { label: "CLV:CAC Ratio", value: "14:1", sub: "excellent", up: true },
      { label: "Payback Period", value: "8 months", sub: "-1 mo vs Q1", up: true },
      { label: "Top Segment CLV", value: "$142k", sub: "Enterprise", up: true },
    ],
    trend: [
      { q: "Q3 25", clv: 38 }, { q: "Q4 25", clv: 42 }, { q: "Q1 26", clv: 44 }, { q: "Q2 26", clv: 48 },
    ],
    bySegment: [
      { seg: "Enterprise", clv: 142 }, { seg: "Mid-market", clv: 48 }, { seg: "SMB", clv: 18 },
    ],
  },
  perfChurn: {
    stats: [
      { label: "Monthly Churn", value: "0.7%", sub: "-0.1pp vs May", up: true },
      { label: "Annual Churn", value: "8.4%", sub: "projected", up: true },
      { label: "Churned MRR", value: "$12.4k", sub: "this month" },
      { label: "At-Risk Accounts", value: "14", sub: "health score <40" },
    ],
    trend: [
      { month: "Jan", churn: 1.1 }, { month: "Feb", churn: 0.9 }, { month: "Mar", churn: 0.8 },
      { month: "Apr", churn: 0.9 }, { month: "May", churn: 0.8 }, { month: "Jun", churn: 0.7 },
    ],
    atRisk: [
      { name: "Acme Corp", score: 22, segment: "Enterprise" },
      { name: "TechStart", score: 31, segment: "SMB" },
      { name: "GlobalCo", score: 35, segment: "Mid-market" },
      { name: "Startup XYZ", score: 38, segment: "SMB" },
    ],
  },
  predictive: {
    stats: [
      { label: "Projected H2 Revenue", value: "$9.4M", sub: "+24% vs H1", up: true },
      { label: "Forecast Accuracy", value: "91%", sub: "last 6 months" },
      { label: "Risk Items", value: "5", sub: "2 high severity" },
      { label: "Growth Rate", value: "18%", sub: "projected YoY" },
    ],
    insights: [
      { insight: "Engineering capacity will be 15% short by August — consider starting hiring now", severity: "high" },
      { insight: "Marketing spend efficiency is declining — ROI may drop 8% next quarter without adjustment", severity: "medium" },
      { insight: "At current velocity, Web App v2 will slip by 3 weeks — reprioritization needed", severity: "high" },
      { insight: "Customer satisfaction trend suggests 5% NPS improvement if support SLAs are tightened", severity: "low" },
      { insight: "Cash flow surplus in July enables $200k infrastructure investment with 14-month payback", severity: "low" },
    ],
  },
  predForecast: {
    stats: [
      { label: "Q4 Forecast", value: "$4.8M", sub: "+26% vs Q3", up: true },
      { label: "Confidence", value: "High", sub: "91% accuracy model", up: true },
      { label: "Best Case", value: "$5.4M", sub: "if pipeline converts" },
      { label: "Worst Case", value: "$4.1M", sub: "at 80% conversion" },
    ],
    series: [
      { month: "Oct", forecast: 1480, lower: 1320, upper: 1640 },
      { month: "Nov", forecast: 1580, lower: 1400, upper: 1760 },
      { month: "Dec", forecast: 1740, lower: 1520, upper: 1960 },
    ],
    assumptions: [
      { label: "Pipeline conversion rate", value: "26%" },
      { label: "Avg. deal size", value: "$42k ACV" },
      { label: "New logo target", value: "14/month" },
      { label: "Churn assumption", value: "0.7%/month" },
      { label: "Upsell contribution", value: "$320k" },
    ],
  },
  predResources: {
    stats: [
      { label: "Projected Shortage", value: "8 FTEs", sub: "by Q4 2026" },
      { label: "Critical Roles", value: "3", sub: "urgent hiring" },
      { label: "Projected Cost", value: "$1.2M", sub: "incremental H2" },
      { label: "Hiring Timeline", value: "6–8 wks", sub: "avg. to fill" },
    ],
    series: [
      { month: "Jul", supply: 87, demand: 90 }, { month: "Aug", supply: 90, demand: 96 },
      { month: "Sep", supply: 91, demand: 102 }, { month: "Oct", supply: 93, demand: 108 },
      { month: "Nov", supply: 95, demand: 112 }, { month: "Dec", supply: 97, demand: 115 },
    ],
    roles: [
      { role: "Senior Backend Engineer", urgency: "Critical", timeframe: "Jul 2026" },
      { role: "Security Engineer", urgency: "Critical", timeframe: "Jul 2026" },
      { role: "Data Analyst", urgency: "High", timeframe: "Aug 2026" },
      { role: "QA Engineer", urgency: "Medium", timeframe: "Sep 2026" },
    ],
  },
  predTrends: {
    stats: [
      { label: "Market Growth", value: "+18%", sub: "YoY for our segment", up: true },
      { label: "Tailwinds", value: "3", sub: "major drivers" },
      { label: "Headwinds", value: "2", sub: "risk factors" },
      { label: "Opportunity", value: "$48M", sub: "addressable expansion" },
    ],
    series: [
      { q: "Q1 24", idx: 100 }, { q: "Q2 24", idx: 108 }, { q: "Q3 24", idx: 114 },
      { q: "Q4 24", idx: 122 }, { q: "Q1 25", idx: 130 }, { q: "Q2 25", idx: 138 },
      { q: "Q3 25", idx: 148 }, { q: "Q4 25", idx: 158 }, { q: "Q1 26", idx: 168 }, { q: "Q2 26", idx: 180 },
    ],
    signals: [
      { signal: "AI adoption accelerating in enterprise segment", type: "tailwind", impact: "High" },
      { signal: "Regulatory changes in EU data privacy", type: "headwind", impact: "Medium" },
      { signal: "Remote work permanence driving SaaS demand", type: "tailwind", impact: "High" },
      { signal: "Venture funding tightening — SMB budgets squeezed", type: "headwind", impact: "Medium" },
      { signal: "Platform consolidation trend favoring full-suite vendors", type: "tailwind", impact: "High" },
    ],
  },
  predRisks: {
    stats: [
      { label: "Total Risks", value: "6", sub: "active items" },
      { label: "High Severity", value: "2", sub: "require action" },
      { label: "Medium", value: "3", sub: "monitoring" },
      { label: "Mitigated", value: "4", sub: "this quarter", up: true },
    ],
    risks: [
      { risk: "Engineering capacity shortage by Aug", likelihood: "High", impact: "High", color: "#ef4444" },
      { risk: "Web App v2 deadline slip (3 weeks)", likelihood: "Medium", impact: "High", color: "#f59e0b" },
      { risk: "Marketing budget overrun Q3", likelihood: "High", impact: "Medium", color: "#f59e0b" },
      { risk: "Key person dependency — API team", likelihood: "Low", impact: "High", color: "#3b82f6" },
      { risk: "Security vulnerability in auth layer", likelihood: "Low", impact: "Critical", color: "#ef4444" },
      { risk: "EU GDPR compliance gap", likelihood: "Medium", impact: "High", color: "#f59e0b" },
    ],
  },
};

app.get("/dashboard/details", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const key = `dashboard:details:${ws.id}`;
    const stored = await kv.get(key);
    const data = stored ? { ...SEED_DASHBOARD_DETAILS, ...stored } : SEED_DASHBOARD_DETAILS;
    if (!stored) await kv.set(key, SEED_DASHBOARD_DETAILS);
    return c.json(data);
  } catch (e) {
    console.error("GET /dashboard/details error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/dashboard/details", async (c) => {
  try {
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const key = `dashboard:details:${ws.id}`;
    const body = await c.req.json();
    const existing = (await kv.get(key)) ?? SEED_DASHBOARD_DETAILS;
    const updated = { ...existing, ...body };
    await kv.set(key, updated);
    return c.json(updated);
  } catch (e) {
    console.error("PUT /dashboard/details error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Project milestones ────────────────────────────────────────────────────────

const SEED_MILESTONES = {
  web: [
    { milestone: "Auth layer complete", date: "Jun 10", done: true },
    { milestone: "Admin panel v1", date: "Jun 28", done: false },
    { milestone: "API gateway live", date: "Jul 5", done: false },
    { milestone: "Beta release", date: "Jul 15", done: false },
  ],
  mobile: [
    { milestone: "Design handoff", date: "Jul 1", done: false },
    { milestone: "Alpha internal build", date: "Jul 20", done: false },
    { milestone: "TestFlight beta", date: "Aug 1", done: false },
    { milestone: "App Store submission", date: "Aug 30", done: false },
  ],
};

// ── Project milestones ────────────────────────────────────────────────────────
// Stored in the `milestones` table, grouped by the `project` column. The
// legacy client API indexes by position within a project; rows are ordered by
// created_at so that positional index stays stable.

function mapMilestoneRow(r: any) {
  return { milestone: r.milestone, date: r.date ?? "", done: r.done ?? false };
}

app.get("/milestones/:project", async (c) => {
  try {
    const project = c.req.param("project");
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    const { data, error } = await adminClient()
      .from("milestones")
      .select("milestone, date, done")
      .eq("workspace_id", ws.id)
      .eq("project", project)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return c.json((data ?? []).map(mapMilestoneRow));
  } catch (e) {
    console.error("GET /milestones/:project error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

app.put("/milestones/:project/:index", async (c) => {
  try {
    const project = c.req.param("project");
    const idx = parseInt(c.req.param("index"));
    const body = await c.req.json();
    const { ws, response } = await requireWorkspace(c);
    if (response) return response;
    if (!hasRole(ws.role, "member")) return forbidden(c);
    const { data } = await adminClient()
      .from("milestones")
      .select("id")
      .eq("workspace_id", ws.id)
      .eq("project", project)
      .order("created_at", { ascending: true });
    const row = (data ?? [])[idx];
    if (!row) return c.json({ error: "Not found" }, 404);
    const patch: Record<string, any> = {};
    for (const k of ["milestone", "date", "done"]) {
      if (k in body) patch[k] = body[k];
    }
    const { data: updated, error } = await adminClient()
      .from("milestones")
      .update(patch)
      .eq("id", row.id)
      .select("milestone, date, done")
      .single();
    if (error) throw error;
    return c.json(mapMilestoneRow(updated));
  } catch (e) {
    console.error("PUT /milestones/:project/:index error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

// ── Data migration: legacy KV → relational tables ────────────────────────────
// Idempotent: safe to run multiple times (upserts by natural key). Moves
// profiles, subscriptions, transactions, and plans from the KV store into the
// relational tables introduced in migration 20260615000005.
async function migrateKvToRelational() {
  const db = adminClient();
  const report = { plans: 0, profiles: 0, subscriptions: 0, transactions: 0, errors: [] as string[] };

  // Plans — ALWAYS upsert from SEED_PLANS (authoritative source of truth).
  // We deliberately ignore KV `plans` here because legacy KV records can be
  // stale or zeroed-out and would otherwise overwrite correct prices.
  try {
    for (const p of SEED_PLANS) {
      const { error } = await db.from("plans").upsert({
        id: p.id, name: p.name, description: p.description,
        currency: p.currency, monthly: p.monthly, yearly: p.yearly,
        features: p.features, highlighted: !!p.highlighted,
      }, { onConflict: "id" });
      if (!error) report.plans++;
    }
  } catch (e) { report.errors.push(`plans: ${String(e)}`); }

  // Profiles
  try {
    const profiles = await kv.getByPrefix("profile:");
    for (const p of profiles.filter(Boolean)) {
      if (!p.user_id) continue;
      const { error } = await db.from("profiles").upsert({
        user_id: p.user_id, email: p.email ?? "", full_name: p.full_name ?? p.email ?? "",
        phone: p.phone ?? "", job_title: p.job_title ?? "", company: p.company ?? "",
      }, { onConflict: "user_id" });
      if (!error) report.profiles++;
      else report.errors.push(`profile ${p.user_id}: ${error.message}`);
    }
  } catch (e) { report.errors.push(`profiles: ${String(e)}`); }

  // Subscriptions
  try {
    const subs = await kv.getByPrefix("subscription:");
    for (const s of subs.filter(Boolean)) {
      if (!s.user_id || !s.plan_id) continue;
      const { error } = await db.from("subscriptions").upsert({
        user_id: s.user_id, plan_id: s.plan_id,
        interval: s.interval === "yearly" ? "yearly" : "monthly",
        status: ["active", "expired", "cancelled", "pending"].includes(s.status) ? s.status : "pending",
        order_id: s.order_id ?? null,
        started_at: s.started_at ?? null,
        current_period_end: s.current_period_end ?? null,
      }, { onConflict: "user_id" });
      if (!error) report.subscriptions++;
      else report.errors.push(`subscription ${s.user_id}: ${error.message}`);
    }
  } catch (e) { report.errors.push(`subscriptions: ${String(e)}`); }

  // Transactions
  try {
    const txs = await kv.getByPrefix("transaction:");
    for (const t of txs.filter(Boolean)) {
      if (!t.order_id || !t.user_id || !t.plan_id) continue;
      const { error } = await db.from("transactions").upsert({
        order_id: t.order_id, user_id: t.user_id, plan_id: t.plan_id,
        plan_name: t.plan_name ?? t.plan_id,
        interval: t.interval === "yearly" ? "yearly" : "monthly",
        gross_amount: t.gross_amount ?? 0, discount: t.discount ?? 0,
        voucher_code: t.voucher_code ?? null,
        status: ["pending", "paid", "failed"].includes(t.status) ? t.status : "pending",
        payment_type: t.midtrans?.payment_type ?? null,
        midtrans_data: t.midtrans ?? (t.snap_token ? { snap_token: t.snap_token } : {}),
        created_at: t.created_at ?? new Date().toISOString(),
      }, { onConflict: "order_id" });
      if (!error) report.transactions++;
      else report.errors.push(`transaction ${t.order_id}: ${error.message}`);
    }
  } catch (e) { report.errors.push(`transactions: ${String(e)}`); }

  return report;
}

app.post("/admin/migrate-kv", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const report = await migrateKvToRelational();
    return c.json(report);
  } catch (e) {
    console.error("POST /admin/migrate-kv error:", e);
    return c.json({ error: publicErrMsg(e) }, 500);
  }
});

Deno.serve(app.fetch);

