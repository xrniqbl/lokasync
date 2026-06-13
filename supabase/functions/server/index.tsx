import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";
import * as ws from "./workspaces.tsx";
import * as emails from "./emails.tsx";
import * as sql from "./sql_client.tsx";

// Supabase passes the full request path including the function name
const app = new Hono().basePath("/server");

app.use('*', logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-Workspace-Id"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

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
  const { data } = await sql.getDbClient().from("system_config").select("value").eq("key", "maintenance").maybeSingle();
  const mt = data?.value ?? { enabled: false, message: "" };
  if (!mt?.enabled) return next();
  const user = await getAuthedUser(c);
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

// ── Workspace gate (Fase 14) ──────────────────────────────────────────────────
// Every project-data route requires a signed-in user AND a valid membership in
// the active workspace. The workspace comes from the X-Workspace-Id header;
// without it the user's default workspace is used (legacy clients keep working).
// All queries are scoped to the membership-validated workspace id — never to a
// raw client-supplied value (anti-IDOR).

const WORKSPACE_SCOPED_PREFIXES = [
  "/tasks",
  "/projects",
  "/teams",
  "/calendar",
  "/files",
  "/settings",
  "/financial",
  "/integrations",
  "/sessions",
  "/analytics",
  "/dashboard",
  "/milestones",
  "/workspace-data",
  "/workspaces",
];

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const path = c.req.path.replace(/^\/server/, "");
  const scoped = WORKSPACE_SCOPED_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
  if (!scoped) return next();
  const user = await getAuthedUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const resolved = await ws.resolveWorkspace(
    c.req.header("X-Workspace-Id") ?? null,
    user,
  );
  if (!resolved) {
    return c.json(
      { error: "You are not a member of this workspace", code: "workspace_forbidden" },
      403,
    );
  }
  c.set("user", user);
  c.set("workspace", resolved.workspace);
  c.set("membership", resolved.membership);
  return next();
});

// Workspace-scoped KV helpers — only usable inside workspace-gated routes.
const wsKey = (c: any, key: string) => ws.wsDataKey(c.get("workspace").id, key);

const isOwner = (c: any) => c.get("membership")?.role === "owner";

// Reads a workspace-scoped value; on first access it lazily migrates the
// pre-Fase-14 global key (dual-read), falling back to the seed.
async function wsGetOrSeed(c: any, key: string, seed: any): Promise<any> {
  const scopedKey = wsKey(c, key);
  let data = await kv.get(scopedKey);
  if (data === undefined || data === null) {
    const legacy = await kv.get(key);
    data = legacy ?? seed;
    await kv.set(scopedKey, data);
  }
  return data;
}

async function logActivity(c: any, action: string, target: string) {
  const user = c.get("user");
  const workspace = c.get("workspace");
  if (!user || !workspace) return;
  const actor = user.email || user.user_metadata?.full_name || "Anonymous";

  const ACTION_MAP: Record<string, string> = {
    create: "created", created: "created", added: "created", add: "created",
    update: "updated", updated: "updated", edit: "updated", assign: "updated", assigned: "updated",
    delete: "deleted", deleted: "deleted", remove: "deleted", removed: "deleted",
    complete: "completed", completed: "completed", finish: "completed", done: "completed",
    upload: "uploaded", uploaded: "uploaded",
    leave: "left", left: "left",
    join: "joined", joined: "joined",
    comment: "commented", commented: "commented",
  };
  const mapped = ACTION_MAP[action.split(/\s+/)[0].toLowerCase()] || "created";

  const t = target.toLowerCase();
  const a = action.toLowerCase();
  let targetType = null;
  if (t.includes("task") || a.includes("task")) targetType = "task";
  else if (t.includes("project") || a.includes("project")) targetType = "project";
  else if (t.includes("file") || a.includes("upload")) targetType = "file";
  else if (t.includes("workspace") || a.includes("join") || a.includes("leave") || a.includes("invite")) targetType = "workspace";
  else if (a.includes("comment")) targetType = "comment";

  await sql.sqlInsert("team_activity", {
    workspace_id: workspace.id,
    actor,
    action: mapped,
    target,
    target_type: targetType,
    created_at: new Date().toISOString(),
  });
}

async function addMention(c: any, mentionee: string, text: string) {
  const user = c.get("user");
  const workspace = c.get("workspace");
  if (!user || !workspace) return;
  const actor = user.email || user.user_metadata?.full_name || "Anonymous";
  await sql.sqlInsert("mentions", {
    workspace_id: workspace.id,
    mentionee,
    text,
    actor,
    read: false,
  });
}

async function broadcastAfterWrite(workspaceId: string, table: string) {
  try {
    const client = adminClient();
    const channel = client.channel(`workspace:${workspaceId}`);
    await channel.send({
      type: "broadcast",
      event: "refresh",
      payload: { table },
    });
  } catch (e) {
    console.log("broadcast error:", e);
  }
}

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
  { name: "Project Proposal — Web App v2.pdf", type: "pdf", size: 2516582, sizeHuman: "2.4 MB", modified: "Jun 7, 2026", owner: "JD", shared: true, archived: false, storagePath: null, url: null, urlExpiresAt: null },
  { name: "Design System Documentation.figma", type: "figma", size: 18981940, sizeHuman: "18.1 MB", modified: "Jun 6, 2026", owner: "SW", shared: true, archived: false, storagePath: null, url: null, urlExpiresAt: null },
  { name: "Meeting Notes — Sprint 24.docx", type: "doc", size: 131072, sizeHuman: "128 KB", modified: "Jun 5, 2026", owner: "EM", shared: false, archived: false, storagePath: null, url: null, urlExpiresAt: null },
  { name: "API Reference v3.pdf", type: "pdf", size: 5976883, sizeHuman: "5.7 MB", modified: "Jun 4, 2026", owner: "MJ", shared: true, archived: false, storagePath: null, url: null, urlExpiresAt: null },
  { name: "Onboarding Checklist.sheet", type: "sheet", size: 65536, sizeHuman: "64 KB", modified: "Jun 3, 2026", owner: "JD", shared: true, archived: false, storagePath: null, url: null, urlExpiresAt: null },
  { name: "App Screenshots — iOS.zip", type: "image", size: 35867443, sizeHuman: "34.2 MB", modified: "Jun 2, 2026", owner: "SW", shared: false, archived: false, storagePath: null, url: null, urlExpiresAt: null },
  { name: "Infrastructure Diagram.diagram", type: "diagram", size: 1153434, sizeHuman: "1.1 MB", modified: "Jun 1, 2026", owner: "AL", shared: true, archived: false, storagePath: null, url: null, urlExpiresAt: null },
  { name: "Q2 Budget Summary.sheet", type: "sheet", size: 524288, sizeHuman: "512 KB", modified: "May 30, 2026", owner: "EM", shared: false, archived: false, storagePath: null, url: null, urlExpiresAt: null },
  { name: "Old Brand Guidelines.pdf", type: "pdf", size: 4299162, sizeHuman: "4.1 MB", modified: "Jan 12, 2026", owner: "SW", shared: false, archived: true, storagePath: null, url: null, urlExpiresAt: null },
  { name: "Legacy API Docs.doc", type: "doc", size: 911360, sizeHuman: "890 KB", modified: "Feb 3, 2026", owner: "MJ", shared: false, archived: true, storagePath: null, url: null, urlExpiresAt: null },
  { name: "2025 Roadmap.sheet", type: "sheet", size: 225280, sizeHuman: "220 KB", modified: "Dec 15, 2025", owner: "EM", shared: true, archived: true, storagePath: null, url: null, urlExpiresAt: null },
  { name: "Old Logo Pack.zip", type: "image", size: 13004902, sizeHuman: "12.4 MB", modified: "Nov 5, 2025", owner: "SW", shared: false, archived: true, storagePath: null, url: null, urlExpiresAt: null },
  { name: "Deprecated Auth Module.code", type: "code", size: 79872, sizeHuman: "78 KB", modified: "Oct 20, 2025", owner: "JD", shared: false, archived: true, storagePath: null, url: null, urlExpiresAt: null },
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
};

const SEED_WORKSPACE = {
  name: "Acme Corp",
  url: "acme-corp",
  industry: "Technology",
  teamSize: "11-50",
  region: "US",
};

const SEED_NOTIFICATIONS = {
  channels: { inapp: true, email: true, slack: false },
  tasks: { assigned: true, dueToday: true, statusChanged: false, comments: true },
  projects: { statusChange: true, newMember: false, deadline: true },
  team: { newMember: true, teamUpdates: false },
  digest: { weekly: true, productUpdates: false },
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

const SEED_AUDIT_LOG = [
  { id: 1, actor: "JD", actorName: "John Doe", action: "Signed in", target: "Account", ip: "192.168.1.10", timestamp: "Jun 8, 2026 09:12 AM", category: "Security" },
  { id: 2, actor: "SW", actorName: "Sarah Wilson", action: "Invited member", target: "chris.taylor@acme.io", ip: "192.168.1.22", timestamp: "Jun 5, 2026 03:45 PM", category: "Members" },
  { id: 3, actor: "JD", actorName: "John Doe", action: "Connected integration", target: "GitHub", ip: "192.168.1.10", timestamp: "Jun 4, 2026 11:20 AM", category: "Integrations" },
  { id: 4, actor: "EM", actorName: "Elena Martinez", action: "Changed workspace name", target: "Acme Corp", ip: "192.168.1.55", timestamp: "Jun 3, 2026 02:10 PM", category: "Settings" },
  { id: 5, actor: "MJ", actorName: "Mike Johnson", action: "Generated API key", target: "Production API Key", ip: "10.0.0.8", timestamp: "Jun 1, 2026 10:05 AM", category: "Security" },
  { id: 6, actor: "JD", actorName: "John Doe", action: "Uploaded file", target: "Project Proposal — Web App v2.pdf", ip: "192.168.1.10", timestamp: "May 30, 2026 04:22 PM", category: "Settings" },
  { id: 7, actor: "SW", actorName: "Sarah Wilson", action: "Changed role", target: "Ben Harris → Viewer", ip: "192.168.1.22", timestamp: "May 28, 2026 09:58 AM", category: "Members" },
  { id: 8, actor: "JD", actorName: "John Doe", action: "Changed password", target: "Account", ip: "192.168.1.10", timestamp: "May 25, 2026 07:33 PM", category: "Security" },
  { id: 9, actor: "EM", actorName: "Elena Martinez", action: "Removed member", target: "Alex Foster", ip: "192.168.1.55", timestamp: "May 22, 2026 01:15 PM", category: "Members" },
  { id: 10, actor: "MJ", actorName: "Mike Johnson", action: "Disconnected integration", target: "Notion", ip: "10.0.0.8", timestamp: "May 20, 2026 11:40 AM", category: "Integrations" },
  { id: 11, actor: "JD", actorName: "John Doe", action: "Enabled 2FA", target: "Account", ip: "192.168.1.10", timestamp: "May 18, 2026 08:20 AM", category: "Security" },
  { id: 12, actor: "SW", actorName: "Sarah Wilson", action: "Updated billing plan", target: "Pro Plan", ip: "192.168.1.22", timestamp: "May 8, 2026 02:00 PM", category: "Settings" },
  { id: 13, actor: "AL", actorName: "Amy Liu", action: "Created webhook", target: "CI/CD Pipeline", ip: "10.0.0.15", timestamp: "Apr 15, 2026 10:30 AM", category: "Integrations" },
  { id: 14, actor: "RC", actorName: "Rachel Chen", action: "Signed in", target: "Account", ip: "192.168.1.88", timestamp: "Jun 7, 2026 08:55 AM", category: "Security" },
  { id: 15, actor: "JD", actorName: "John Doe", action: "Exported data", target: "All Tasks (CSV)", ip: "192.168.1.10", timestamp: "Jun 6, 2026 05:10 PM", category: "Settings" },
];

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (c) => c.json({ status: "ok" }));

// ── Profile (authenticated) ───────────────────────────────────────────────────
// Source of truth for user profile data: KV key `profile:{userId}`.
// Reused later for Midtrans customer_details (phase 6).

const adminClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

async function getAuthedUser(c: any) {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// ── Plan entitlements (server-side gating) ────────────────────────────────────
// Effective plan is derived ONLY from `subscription:{userId}` (lazily expired
// on read, same rule as GET /subscription). Client PlanGate is UI-only sugar.

const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, business: 2 };
const FREE_MAX_PROJECTS = 3;

async function getEffectivePlanId(userId: string): Promise<string> {
  const { data: subscription } = await sql.getDbClient().from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  if (
    subscription?.status === "active" &&
    subscription.current_period_end &&
    new Date(subscription.current_period_end) < new Date()
  ) {
    await sql.getDbClient().from("subscriptions").update({
      status: "expired",
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    return "free";
  }
  return subscription?.status === "active" ? subscription.plan_id : "free";
}

// Resolves the authed user iff their plan rank reaches `min`; otherwise returns
// the 401/403 response the route should send.
async function requirePlan(c: any, min: "pro" | "business") {
  const user = await getAuthedUser(c);
  if (!user) {
    return { user: null, response: c.json({ error: "Unauthorized" }, 401) };
  }
  let planId = await getEffectivePlanId(user.id);
  // If personal plan is insufficient, borrow the workspace owner's plan
  if ((PLAN_RANK[planId] ?? 0) < PLAN_RANK[min]) {
    const workspaceId = c.req.header("X-Workspace-Id");
    if (workspaceId) {
      const workspacePlan = await ws.getWorkspacePlan(workspaceId);
      if ((PLAN_RANK[workspacePlan] ?? 0) >= PLAN_RANK[min]) {
        planId = workspacePlan;
      }
    }
  }
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

const adminEmails = () =>
  (Deno.env.get("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

const isAdminUser = (user: any) =>
  !!user?.email && adminEmails().includes(String(user.email).toLowerCase());

// ── Storage helpers (Fase 12) ─────────────────────────────────────────────────

function storageClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function humanSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const PLAN_STORAGE_LIMITS: Record<string, number> = {
  free: 1 * 1024 * 1024 * 1024,      // 1 GB
  pro: 25 * 1024 * 1024 * 1024,      // 25 GB
  business: 0,                         // 0 = unlimited
};

async function getStorageUsage(c: any): Promise<{ used: number; limit: number }> {
  const user = c.get("user");
  const workspace = c.get("workspace");
  const { data: sub } = await sql.getDbClient().from("subscriptions").select("plan_id").eq("user_id", user.id).maybeSingle();
  const planId = sub?.plan_id ?? "free";
  const limit = PLAN_STORAGE_LIMITS[planId] ?? PLAN_STORAGE_LIMITS.free;
  if (!workspace) return { used: 0, limit };
  const rows = await sql.sqlQueryByWorkspace("files", workspace.id, "size_bytes");
  const used = rows.reduce((sum: number, f: any) => sum + (f.size_bytes || 0), 0);
  return { used, limit };
}

async function checkStorageQuota(c: any, additionalBytes: number): Promise<{ allowed: boolean; used: number; limit: number }> {
  const { used, limit } = await getStorageUsage(c);
  if (limit > 0 && used + additionalBytes > limit) {
    return { allowed: false, used, limit };
  }
  return { allowed: true, used, limit };
}

async function incrementStorageUsage(_c: any, _deltaBytes: number) {
  // Storage usage is now computed live from the SQL files table.
  // Call sites kept for compatibility; getStorageUsage() recalculates on demand.
}

async function requireAdmin(c: any) {
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
    const { data } = await sql.getDbClient().from("system_config").select("value").eq("key", "maintenance").maybeSingle();
    const mt = data?.value ?? { enabled: false, message: "" };
    return c.json({
      maintenance: {
        enabled: !!mt?.enabled,
        message: mt?.message ?? "",
      },
    });
  } catch (e) {
    console.log("GET /status error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.get("/profile", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const { data: profile } = await sql.getDbClient().from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    // Lazy migration: accounts registered before phase 3 only have user_metadata
    if (!profile && user.user_metadata?.full_name) {
      const meta = user.user_metadata;
      const now = new Date().toISOString();
      const newProfile = {
        user_id: user.id,
        email: user.email ?? "",
        full_name: meta.full_name,
        phone: meta.phone ?? "",
        job_title: meta.job_title ?? "",
        company: meta.company ?? "",
        created_at: now,
        updated_at: now,
      };
      await sql.getDbClient().from("profiles").insert(newProfile);
      return c.json({ profile: { ...newProfile } });
    }
    return c.json({ profile });
  } catch (e) {
    console.log("GET /profile error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Plans ─────────────────────────────────────────────────────────────────────
// Plans (incl. prices) are defined ONLY here. Checkout (phase 5/6) must read
// prices from this KV record — never trust amounts sent by the client.

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

// Bump to force-overwrite the stored `plans` record on next read (e.g. after
// rebranding or price changes in SEED_PLANS).
const PLANS_SEED_VERSION = 2;

app.get("/plans", async (c) => {
  try {
    const { data: plans } = await sql.getDbClient().from("plans").select("*").eq("active", true).order("sort_order", { ascending: true });
    if (!plans?.length) {
      // Seed plans into SQL
      const now = new Date().toISOString();
      for (const p of SEED_PLANS) {
        await sql.getDbClient().from("plans").insert({
          plan_id: p.id,
          name: p.name,
          description: p.description,
          monthly_price: p.monthly,
          yearly_price: p.yearly,
          price: p.monthly,
          features: JSON.stringify(p.features),
          storage_limit: PLAN_STORAGE_LIMITS[p.id] ?? 0,
          max_projects: p.id === "free" ? 3 : p.id === "pro" ? 100 : 999,
          max_members: p.id === "free" ? 1 : p.id === "pro" ? 50 : 500,
          highlighted: p.highlighted ?? false,
          active: true,
          sort_order: p.id === "free" ? 1 : p.id === "pro" ? 2 : 3,
          created_at: now,
          updated_at: now,
        });
      }
      const { data: seeded } = await sql.getDbClient().from("plans").select("*").eq("active", true).order("sort_order", { ascending: true });
      return c.json(seeded.map((p: any) => ({ ...p, id: p.plan_id })));
    }
    return c.json(plans.map((p: any) => ({
      id: p.plan_id,
      name: p.name,
      description: p.description,
      currency: "IDR",
      monthly: p.monthly_price,
      yearly: p.yearly_price,
      features: typeof p.features === "string" ? JSON.parse(p.features) : p.features,
      highlighted: p.highlighted,
    })));
  } catch (e) {
    console.log("GET /plans error:", e);
    return c.json({ error: String(e) }, 500);
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

    const body = await c.req.json();
    const code = String(body.code ?? "").trim().toUpperCase();
    const planId = String(body.plan_id ?? "");
    const interval = body.interval === "yearly" ? "yearly" : "monthly";
    if (!code) return c.json({ valid: false, reason: "Enter a voucher code" });

    const { data: plans } = await sql.getDbClient().from("plans").select("*").eq("active", true).order("sort_order", { ascending: true });
    const plan = plans?.find((p: any) => p.plan_id === planId);
    if (!plan || plan.price === 0) {
      return c.json({ valid: false, reason: "Invalid plan" });
    }
    const base = interval === "yearly" ? (plan.price * 12) : plan.price;

    const { data: voucher } = await sql.getDbClient().from("vouchers").select("*").eq("code", code).maybeSingle();

    if (!voucher || !voucher.active) {
      return c.json({ valid: false, reason: "This voucher code is not valid" });
    }
    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      return c.json({ valid: false, reason: "This voucher has expired" });
    }
    if (voucher.max_uses != null && voucher.used_count >= voucher.max_uses) {
      return c.json({ valid: false, reason: "This voucher has reached its usage limit" });
    }
    if (voucher.applies_to && !voucher.applies_to.includes(planId)) {
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
    console.log("POST /vouchers/validate error:", e);
    return c.json({ error: String(e) }, 500);
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
  const status = mapStatus(midtransData.transaction_status, midtransData.fraud_status);
  if (tx.status === status) return tx;
  const now = new Date().toISOString();
  const alreadyPaid = tx.status === "paid";
  tx.status = status;
  tx.midtrans = {
    transaction_status: midtransData.transaction_status,
    fraud_status: midtransData.fraud_status ?? null,
    payment_type: midtransData.payment_type ?? null,
    transaction_time: midtransData.transaction_time ?? null,
  };
  tx.updated_at = now;

  // Update transaction in SQL
  await sql.getDbClient().from("transactions").update({
    status: tx.status,
    midtrans: tx.midtrans,
    updated_at: now,
  }).eq("order_id", tx.order_id);

  if (status === "paid" && !alreadyPaid) {
    const started = new Date();
    // Renewing the SAME plan while still active extends the remaining period;
    // anything else (new plan, expired sub) starts a fresh period from now.
    const { data: existing } = await sql.getDbClient().from("subscriptions").select("*").eq("user_id", tx.user_id).maybeSingle();
    const extendsExisting =
      existing?.status === "active" &&
      existing.plan_id === tx.plan_id &&
      existing.current_period_end &&
      new Date(existing.current_period_end) > started;
    const periodBase = extendsExisting
      ? new Date(existing.current_period_end)
      : started;

    // Upsert subscription in SQL
    await sql.getDbClient().from("subscriptions").upsert({
      user_id: tx.user_id,
      plan_id: tx.plan_id,
      interval: tx.interval,
      status: "active",
      order_id: tx.order_id,
      started_at: extendsExisting ? existing.started_at : started.toISOString(),
      current_period_end: periodEnd(tx.interval, periodBase),
      updated_at: now,
    }, { onConflict: "user_id" });

    // Sync workspace plans so invited members inherit the owner's subscription
    await ws.syncWorkspacePlans(tx.user_id, tx.plan_id);

    if (tx.voucher_code) {
      const { data: voucher } = await sql.getDbClient().from("vouchers").select("*").eq("code", tx.voucher_code).maybeSingle();
      if (voucher) {
        await sql.getDbClient().from("vouchers").update({
          used_count: (voucher.used_count ?? 0) + 1,
          updated_at: now,
        }).eq("code", tx.voucher_code);
      }
    }

    // ── Send payment receipt email (Fase 13.2) ─────────────────────────────
    try {
      const { data: rawProfile } = await sql.getDbClient().from("profiles").select("*").eq("user_id", tx.user_id).maybeSingle();
      const userEmail = rawProfile?.email;
      const userName = [rawProfile?.first_name, rawProfile?.last_name].filter(Boolean).join(" ") || userEmail?.split("@")[0] || "User";
      const { data: sub } = await sql.getDbClient().from("subscriptions").select("*").eq("user_id", tx.user_id).maybeSingle();
      if (userEmail) {
        const periodEndStr = sub?.current_period_end ?? periodEnd(tx.interval, started);
        const html = emails.receiptHtml({
          userName,
          planName: tx.plan_name || tx.plan_id,
          interval: tx.interval,
          amount: tx.gross_amount,
          currency: tx.currency || "IDR",
          orderId: tx.order_id,
          periodEnd: periodEndStr,
          paymentType: midtransData.payment_type ?? null,
        });
        await emails.sendEmail(userEmail, "Your LokaSync payment receipt", html);
      }
    } catch (emailErr) {
      // Email failure must never break the transaction
      console.log("Receipt email failed:", emailErr);
    }
  }
  return tx;
}

// TEMP diagnostic — reports key shape only (prefix/length/whitespace), never the key
app.get("/payments/config-check", async (c) => {
  const user = await getAuthedUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const sk = Deno.env.get("MIDTRANS_SERVER_KEY") ?? "";
  const ck = Deno.env.get("MIDTRANS_CLIENT_KEY") ?? "";
  const shape = (k: string) => ({
    set: k.length > 0,
    length: k.length,
    prefix: k.slice(0, 14),
    has_whitespace: /\s/.test(k),
    has_quotes: /["']/.test(k),
  });
  return c.json({ server_key: shape(sk), client_key: shape(ck) });
});

app.post("/payments/checkout", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const config = midtransConfig();
    if (!config) {
      return c.json(
        { error: "Payments are not configured yet (missing Midtrans keys)" },
        503,
      );
    }

    const { data: rawProfile } = await sql.getDbClient().from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (!rawProfile) return c.json({ error: "Complete your profile first" }, 400);
    const profile = {
      full_name: [rawProfile.first_name, rawProfile.last_name].filter(Boolean).join(" "),
      email: rawProfile.email,
      phone: rawProfile.phone,
    };

    const body = await c.req.json();
    const planId = String(body.plan_id ?? "");
    const interval = body.interval === "yearly" ? "yearly" : "monthly";
    const voucherCode = body.voucher_code
      ? String(body.voucher_code).trim().toUpperCase()
      : null;

    const { data: rawPlans } = await sql.getDbClient().from("plans").select("*").eq("active", true).order("sort_order", { ascending: true });
    if (!rawPlans?.length) return c.json({ error: "Plans not found" }, 400);
    const plans = rawPlans.map((p: any) => ({
      id: p.plan_id,
      name: p.name,
      description: p.description,
      monthly: p.monthly_price,
      yearly: p.yearly_price,
      features: typeof p.features === "string" ? JSON.parse(p.features) : p.features,
    }));
    const plan = plans.find((p: any) => p.id === planId);
    if (!plan || plan.monthly === 0) return c.json({ error: "Invalid plan" }, 400);
    const base = interval === "yearly" ? plan.yearly : plan.monthly;

    // Recompute the voucher server-side — never trust client totals
    let discount = 0;
    if (voucherCode) {
      const { data: voucher } = await sql.getDbClient().from("vouchers").select("*").eq("code", voucherCode).maybeSingle();
      const usable =
        voucher &&
        voucher.active &&
        (!voucher.expires_at || new Date(voucher.expires_at) >= new Date()) &&
        (voucher.max_uses == null || voucher.used_count < voucher.max_uses) &&
        (!voucher.applies_to || voucher.applies_to.includes(plan.id));
      if (!usable) return c.json({ error: "This voucher code is not valid" }, 400);
      const vType = voucher.discount_type ?? "percentage";
      const vValue = voucher.discount_value ?? 0;
      discount =
        vType === "percentage"
          ? Math.round((base * vValue) / 100)
          : Math.min(vValue, base);
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
      console.log("Midtrans Snap error:", snapRes.status, detail);
      return c.json(
        {
          error: "Could not start the payment. Please try again.",
          midtrans_status: snapRes.status,
          midtrans_detail: detail.slice(0, 500),
        },
        502,
      );
    }
    const snap = await snapRes.json();

    const now = new Date().toISOString();
    await sql.getDbClient().from("transactions").insert({
      order_id: orderId,
      user_id: user.id,
      plan_id: plan.id,
      plan_name: plan.name,
      interval,
      base,
      discount,
      voucher_code: voucherCode,
      gross_amount: total,
      status: "pending",
      midtrans: { snap_token: snap.token },
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
    console.log("POST /payments/checkout error:", e);
    return c.json({ error: String(e) }, 500);
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
      console.log("Webhook signature mismatch for order:", order_id);
      return c.json({ error: "Invalid signature" }, 403);
    }

    const { data: tx } = await sql.getDbClient().from("transactions").select("*").eq("order_id", order_id).maybeSingle();
    if (!tx) return c.json({ error: "Unknown order" }, 404);

    await applyTransactionStatus(tx, body);
    return c.json({ ok: true });
  } catch (e) {
    console.log("POST /payments/webhook error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.get("/payments/status/:orderId", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const orderId = c.req.param("orderId");
    let { data: tx } = await sql.getDbClient().from("transactions").select("*").eq("order_id", orderId).maybeSingle();
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

    const { data: subscription } = await sql.getDbClient().from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
    return c.json({
      order_id: tx.order_id,
      status: tx.status,
      plan_id: tx.plan_id,
      plan_name: tx.plan_name,
      interval: tx.interval,
      gross_amount: tx.gross_amount,
      payment_type: tx.midtrans?.payment_type ?? null,
      subscription,
    });
  } catch (e) {
    console.log("GET /payments/status error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Subscription (authenticated) ──────────────────────────────────────────────
// Effective plan is derived ONLY from the server-stored subscription. A lapsed
// subscription is expired lazily on read (there is no cron in this setup).

app.get("/subscription", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    let { data: subscription } = await sql.getDbClient().from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
    if (
      subscription?.status === "active" &&
      subscription.current_period_end &&
      new Date(subscription.current_period_end) < new Date()
    ) {
      subscription = {
        ...subscription,
        status: "expired",
        updated_at: new Date().toISOString(),
      };
      await sql.getDbClient().from("subscriptions").update({ status: "expired", updated_at: subscription.updated_at }).eq("user_id", user.id);
    }

    const planId = subscription?.status === "active" ? subscription.plan_id : "free";
    const { data: plans } = await sql.getDbClient().from("plans").select("*").eq("active", true).order("sort_order", { ascending: true });
    const plan = plans?.find((p: any) => p.plan_id === planId) ?? plans?.find((p: any) => p.plan_id === "free");

    const { data: txRows } = await sql.getDbClient().from("transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
    const transactions = (txRows ?? []).map((t: any) => ({
      order_id: t.order_id,
      plan_id: t.plan_id,
      plan_name: t.plan_name,
      interval: t.interval,
      gross_amount: t.gross_amount,
      discount: t.discount ?? 0,
      voucher_code: t.voucher_code ?? null,
      status: t.status,
      payment_type: t.midtrans?.payment_type ?? null,
      created_at: t.created_at,
    }));

    return c.json({
      subscription,
      effective_plan: plan ? { ...plan, id: plan.plan_id } : null,
      transactions,
      is_admin: isAdminUser(user),
    });
  } catch (e) {
    console.log("GET /subscription error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/profile", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const full_name = String(body.full_name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    if (!full_name) return c.json({ error: "Full name is required" }, 400);
    if (!/^\+62\d{7,13}$/.test(phone)) {
      return c.json({ error: "Phone must be a +62 number with 7-13 digits" }, 400);
    }
    const { data: existing } = await sql.getDbClient().from("profiles").select("id, created_at").eq("user_id", user.id).maybeSingle();
    const now = new Date().toISOString();
    const profile = {
      user_id: user.id,
      email: user.email ?? "",
      full_name,
      phone,
      job_title: String(body.job_title ?? "").trim(),
      company: String(body.company ?? "").trim(),
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    if (existing) {
      await sql.getDbClient().from("profiles").update(profile).eq("id", existing.id);
    } else {
      await sql.getDbClient().from("profiles").insert(profile);
    }
    return c.json({ profile });
  } catch (e) {
    console.log("PUT /profile error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Founder panel (admin-only) ────────────────────────────────────────────────

app.get("/admin/overview", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;

    const { data: usersPage } = await adminClient().auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const totalUsers = usersPage?.users?.length ?? 0;

    const { data: allSubs } = await sql.getDbClient().from("subscriptions").select("*");
    const now = new Date();
    const activeByPlan: Record<string, number> = {};
    let expiredCount = 0;
    for (const s of (allSubs ?? [])) {
      const stillActive =
        s?.status === "active" &&
        s.current_period_end &&
        new Date(s.current_period_end) > now;
      if (stillActive) {
        activeByPlan[s.plan_id] = (activeByPlan[s.plan_id] ?? 0) + 1;
      } else {
        expiredCount++;
      }
    }

    const { data: allTxs } = await sql.getDbClient().from("transactions").select("*");
    let revenueTotal = 0;
    let paidCount = 0;
    let pendingCount = 0;
    for (const t of (allTxs ?? [])) {
      if (t?.status === "paid") {
        revenueTotal += t.gross_amount ?? 0;
        paidCount++;
      } else if (t?.status === "pending") {
        pendingCount++;
      }
    }

    const { data: vouchers } = await sql.getDbClient().from("vouchers").select("code");
    const { data: mtData } = await sql.getDbClient().from("system_config").select("value").eq("key", "maintenance").maybeSingle();
    const mt = mtData?.value ?? { enabled: false, message: "" };

    return c.json({
      total_users: totalUsers,
      active_subscriptions: activeByPlan,
      expired_subscriptions: expiredCount,
      revenue_total: revenueTotal,
      paid_transactions: paidCount,
      pending_transactions: pendingCount,
      voucher_count: vouchers?.length ?? 0,
      maintenance: { enabled: !!mt?.enabled, message: mt?.message ?? "" },
    });
  } catch (e) {
    console.log("GET /admin/overview error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Fase 14.4 — batch migration: legacy global KV → per-workspace ─────────────
// The workspace gate already lazy-migrates on first read; this endpoint does a
// controlled batch migration for production cutover. Defaults to DRY RUN.
//
//   POST /admin/migrate-workspaces { dry_run?: true, purge_legacy?: false }
//
// - dry_run (default true): report what would happen, write nothing
// - purge_legacy: after a real run, delete the legacy global keys (cutover);
//   ignored while dry_run is true

app.post("/admin/migrate-workspaces", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false;
    const purgeLegacy = body.purge_legacy === true && !dryRun;

    // Snapshot the legacy global values once
    const legacy: Record<string, any> = {};
    for (const key of ws.WORKSPACE_DATA_KEYS) {
      const value = await kv.get(key);
      if (value !== undefined && value !== null) legacy[key] = value;
    }
    const legacyKeys = Object.keys(legacy);

    const report = {
      dry_run: dryRun,
      users_processed: 0,
      workspaces_created: 0,
      keys_copied: 0,
      keys_skipped: 0,
      legacy_keys_found: legacyKeys,
      legacy_purged: false,
      details: [] as any[],
    };

    let page = 1;
    while (true) {
      const { data, error } = await adminClient().auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(error.message);
      const users = data?.users ?? [];
      if (users.length === 0) break;

      for (const user of users) {
        report.users_processed++;
        const detail: any = {
          email: user.email,
          workspace_id: null,
          workspace_created: false,
          copied: 0,
          skipped: 0,
        };

        // Find the user's default workspace (first valid membership)
        const ids = await ws.listUserWorkspaceIds(user.id);
        let workspaceId: string | null = null;
        for (const id of ids) {
          if (await ws.getMembership(id, user.id)) {
            workspaceId = id;
            break;
          }
        }
        if (!workspaceId) {
          report.workspaces_created++;
          detail.workspace_created = true;
          if (!dryRun) {
            const created = await ws.ensureDefaultWorkspace(user);
            workspaceId = created.workspace.id;
          }
        }
        detail.workspace_id = workspaceId;

        for (const key of legacyKeys) {
          // Without a real workspace (dry run + new user) every key is a copy
          const scoped = workspaceId ? ws.wsDataKey(workspaceId, key) : null;
          const existing = scoped ? await kv.get(scoped) : null;
          if (existing !== undefined && existing !== null) {
            report.keys_skipped++;
            detail.skipped++;
          } else {
            report.keys_copied++;
            detail.copied++;
            if (!dryRun && scoped) await kv.set(scoped, legacy[key]);
          }
        }

        if (report.details.length < 100) report.details.push(detail);
      }
      page++;
    }

    if (purgeLegacy && legacyKeys.length > 0) {
      await kv.mdel(legacyKeys);
      report.legacy_purged = true;
    }

    console.log(
      `migrate-workspaces ${dryRun ? "(dry run) " : ""}— users: ${report.users_processed}, copied: ${report.keys_copied}, skipped: ${report.keys_skipped}, purged: ${report.legacy_purged}`,
    );
    return c.json(report);
  } catch (e) {
    console.log("POST /admin/migrate-workspaces error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// Vouchers CRUD — voucher:{CODE}. used_count is only ever advanced by the
// payment webhook; the panel can edit everything else.

app.get("/admin/vouchers", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const { data: vouchers } = await sql.getDbClient().from("vouchers").select("*").order("code");
    return c.json(vouchers ?? []);
  } catch (e) {
    console.log("GET /admin/vouchers error:", e);
    return c.json({ error: String(e) }, 500);
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
    const { data: existing } = await sql.getDbClient().from("vouchers").select("code").eq("code", parsed.voucher.code).maybeSingle();
    if (existing) return c.json({ error: "A voucher with this code already exists" }, 409);
    const now = new Date().toISOString();
    const voucher = { ...parsed.voucher, used_count: 0, created_at: now, updated_at: now };
    await sql.getDbClient().from("vouchers").insert(voucher);
    return c.json(voucher, 201);
  } catch (e) {
    console.log("POST /admin/vouchers error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/admin/vouchers/:code", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const code = c.req.param("code").toUpperCase();
    const { data: existing } = await sql.getDbClient().from("vouchers").select("*").eq("code", code).maybeSingle();
    if (!existing) return c.json({ error: "Voucher not found" }, 404);
    const parsed = parseVoucherInput({ ...existing, ...(await c.req.json()), code });
    if (parsed.error) return c.json({ error: parsed.error }, 400);
    const now = new Date().toISOString();
    const voucher = {
      ...parsed.voucher,
      used_count: existing.used_count ?? 0,
      created_at: existing.created_at ?? now,
      updated_at: now,
    };
    await sql.getDbClient().from("vouchers").update(voucher).eq("code", code);
    return c.json(voucher);
  } catch (e) {
    console.log("PUT /admin/vouchers error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.delete("/admin/vouchers/:code", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const code = c.req.param("code").toUpperCase();
    const { data: existing } = await sql.getDbClient().from("vouchers").select("code").eq("code", code).maybeSingle();
    if (!existing) return c.json({ error: "Voucher not found" }, 404);
    await sql.getDbClient().from("vouchers").delete().eq("code", code);
    return c.json({ ok: true });
  } catch (e) {
    console.log("DELETE /admin/vouchers error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// Subscribers — every subscription joined with the owner's profile
app.get("/admin/subscribers", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const now = new Date();
    const { data: subs } = await sql.getDbClient().from("subscriptions").select("*");
    const { data: profiles } = await sql.getDbClient().from("profiles").select("*");
    const profileMap: Record<string, any> = {};
    for (const p of (profiles ?? [])) {
      profileMap[p.user_id] = p;
    }
    const rows = (subs ?? []).map((s: any) => {
      const profile = profileMap[s.user_id];
      const lapsed = s.status === "active" && s.current_period_end && new Date(s.current_period_end) < now;
      return {
        user_id: s.user_id,
        email: profile?.email ?? "(no profile)",
        full_name: profile?.full_name ?? "",
        company: profile?.company ?? "",
        plan_id: s.plan_id,
        interval: s.interval,
        status: lapsed ? "expired" : s.status,
        started_at: s.started_at,
        current_period_end: s.current_period_end,
      };
    });
    rows.sort((a, b) => String(a.current_period_end) < String(b.current_period_end) ? 1 : -1);
    return c.json(rows);
  } catch (e) {
    console.log("GET /admin/subscribers error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// Maintenance mode — read also available publicly via GET /status
app.put("/admin/maintenance", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const body = await c.req.json();
    const now = new Date().toISOString();
    const maintenance = {
      enabled: body.enabled === true,
      message: String(body.message ?? "").slice(0, 500),
      updated_at: now,
      updated_by: gate.user.email,
    };
    await sql.getDbClient().from("system_config").upsert(
      { key: "maintenance", value: maintenance, updated_at: now },
      { onConflict: "key" }
    );
    return c.json({ maintenance });
  } catch (e) {
    console.log("PUT /admin/maintenance error:", e);
    return c.json({ error: String(e) }, 500);
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
    console.log("GET /admin/notifications error:", e);
    return c.json({ error: String(e) }, 500);
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
    console.log("POST /admin/notifications error:", e);
    return c.json({ error: String(e) }, 500);
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
    console.log("DELETE /admin/notifications error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Subscription reminders (Fase 13.3) ───────────────────────────────────────
// POST /admin/send-reminders  { days?: number }  →  { sent, skipped, daysAhead }
app.post("/admin/send-reminders", async (c) => {
  try {
    const gate = await requireAdmin(c);
    if (!gate.user) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const daysAhead = Math.min(Math.max(Number(body.days ?? 7), 1), 30);
    const now = Date.now();
    const cutoff = now + daysAhead * 24 * 60 * 60 * 1000;

    const { data: activeSubs } = await sql.getDbClient().from("subscriptions").select("*").eq("status", "active");
    const { data: profiles } = await sql.getDbClient().from("profiles").select("*");
    const profileMap: Record<string, any> = {};
    for (const p of (profiles ?? [])) {
      profileMap[p.user_id] = p;
    }

    let sent = 0;
    let skipped = 0;

    for (const sub of (activeSubs ?? [])) {
      if (!sub.current_period_end) { skipped++; continue; }
      const end = new Date(sub.current_period_end).getTime();
      if (end > now && end <= cutoff) {
        const profile = profileMap[sub.user_id];
        const email = profile?.email;
        const name = profile?.full_name || email?.split("@")[0] || "User";
        const daysLeft = Math.ceil((end - now) / (24 * 60 * 60 * 1000));
        if (email) {
          const html = emails.reminderHtml({
            userName: name,
            planName: sub.plan_id,
            expiryDate: sub.current_period_end,
            daysLeft,
          });
          const ok = await emails.sendEmail(
            email,
            "Your LokaSync subscription expires soon",
            html,
          );
          if (ok) sent++; else skipped++;
        } else {
          skipped++;
        }
      }
    }
    return c.json({ sent, skipped, daysAhead });
  } catch (e) {
    console.log("POST /admin/send-reminders error:", e);
    return c.json({ error: String(e) }, 500);
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
    console.log("GET /notifications error:", e);
    return c.json({ error: String(e) }, 500);
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
    console.log("PUT /notifications/read error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Workspaces (Fase 14) ──────────────────────────────────────────────────────
// Roles: owner (manage workspace + members) | member (read/write project data).

app.get("/workspaces", async (c) => {
  try {
    const user = c.get("user");
    const userId = user.id;
    const memberships = await sql.sqlQuery("workspace_members", "*, workspaces(*)", { user_id: userId });
    const items = memberships.map((m: any) => ({
      id: m.workspaces.id,
      name: m.workspaces.name,
      role: m.role,
      plan_id: m.workspaces.plan_id,
      owner_id: m.workspaces.owner_id,
    }));
    return c.json({ workspaces: items, active: c.get("workspace").id });
  } catch (e) {
    console.log("GET /workspaces error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/workspaces", async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json();
    const name = String(body.name ?? "").trim().slice(0, 80);
    if (!name) return c.json({ error: "Workspace name is required" }, 400);
    const created = await ws.createWorkspace(user, name);
    await broadcastAfterWrite(created.workspace.id, "workspaces");
    return c.json({ ...created.workspace, role: created.membership.role }, 201);
  } catch (e) {
    console.log("POST /workspaces error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/workspaces/:id", async (c) => {
  try {
    const user = c.get("user");
    const id = c.req.param("id");
    const membership = await ws.getMembership(id, user.id);
    if (!membership) return c.json({ error: "Workspace not found" }, 404);
    if (membership.role !== "owner") {
      return c.json({ error: "Only the owner can manage this workspace", code: "owner_required" }, 403);
    }
    const body = await c.req.json();
    const name = String(body.name ?? "").trim().slice(0, 80);
    if (!name) return c.json({ error: "Workspace name is required" }, 400);
    await sql.sqlUpdate("workspaces", id, { name });
    const updated = await ws.getWorkspace(id);
    await broadcastAfterWrite(id, "workspaces");
    return c.json({ ...updated, role: membership.role });
  } catch (e) {
    console.log("PUT /workspaces/:id error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.delete("/workspaces/:id", async (c) => {
  try {
    const user = c.get("user");
    const id = c.req.param("id");
    const membership = await ws.getMembership(id, user.id);
    if (!membership) return c.json({ error: "Workspace not found" }, 404);
    if (membership.role !== "owner") {
      return c.json({ error: "Only the owner can delete this workspace", code: "owner_required" }, 403);
    }
    const ids = await ws.listUserWorkspaceIds(user.id);
    if (ids.length <= 1) {
      return c.json({ error: "You cannot delete your only workspace" }, 400);
    }
    await ws.deleteWorkspace(id);
    await broadcastAfterWrite(id, "workspaces");
    return c.json({ ok: true });
  } catch (e) {
    console.log("DELETE /workspaces/:id error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.get("/workspaces/:id/members", async (c) => {
  try {
    const user = c.get("user");
    const id = c.req.param("id");
    const membership = await ws.getMembership(id, user.id);
    if (!membership) return c.json({ error: "Workspace not found" }, 404);
    return c.json(await ws.getMembers(id));
  } catch (e) {
    console.log("GET /workspaces/:id/members error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/workspaces/:id/members/:userId", async (c) => {
  try {
    const user = c.get("user");
    const id = c.req.param("id");
    const targetId = c.req.param("userId");
    const membership = await ws.getMembership(id, user.id);
    if (!membership) return c.json({ error: "Workspace not found" }, 404);
    if (membership.role !== "owner") {
      return c.json({ error: "Only the owner can change roles", code: "owner_required" }, 403);
    }
    const workspace = await ws.getWorkspace(id);
    if (workspace?.owner_id === targetId) {
      return c.json({ error: "The workspace owner's role cannot be changed" }, 400);
    }
    const body = await c.req.json();
    const role = body.role === "owner" ? "owner" : "member";
    const updated = await ws.updateMemberRole(id, targetId, role);
    if (!updated) return c.json({ error: "Member not found" }, 404);
    return c.json(updated);
  } catch (e) {
    console.log("PUT /workspaces/:id/members/:userId error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.delete("/workspaces/:id/members/:userId", async (c) => {
  try {
    const user = c.get("user");
    const id = c.req.param("id");
    const targetId = c.req.param("userId");
    const membership = await ws.getMembership(id, user.id);
    if (!membership) return c.json({ error: "Workspace not found" }, 404);
    // Owners can remove anyone (except themselves); members may only leave.
    if (membership.role !== "owner" && targetId !== user.id) {
      return c.json({ error: "Only the owner can remove members", code: "owner_required" }, 403);
    }
    const workspace = await ws.getWorkspace(id);
    if (workspace?.owner_id === targetId) {
      return c.json({ error: "The workspace owner cannot be removed" }, 400);
    }
    await ws.removeMember(id, targetId);
    return c.json({ ok: true });
  } catch (e) {
    console.log("DELETE /workspaces/:id/members/:userId error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Workspace invitations (Fase 14.2) ─────────────────────────────────────────
// Single-use tokens with a 7-day expiry. Owners create/revoke; the invitee
// accepts while signed in with the invited email address.

app.get("/workspaces/:id/invites", async (c) => {
  try {
    const user = c.get("user");
    const id = c.req.param("id");
    const membership = await ws.getMembership(id, user.id);
    if (!membership) return c.json({ error: "Workspace not found" }, 404);
    if (membership.role !== "owner") {
      return c.json({ error: "Only the owner can view invitations", code: "owner_required" }, 403);
    }
    const invitations = await ws.listInvitations(id);
    // Tokens are secrets — only expose them for still-pending invitations so
    // the owner can copy the invite link.
    return c.json(
      invitations.map((inv) => ({
        ...inv,
        token: inv.status === "pending" ? inv.token : null,
      })),
    );
  } catch (e) {
    console.log("GET /workspaces/:id/invites error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/workspaces/:id/invites", async (c) => {
  try {
    const user = c.get("user");
    const id = c.req.param("id");
    const membership = await ws.getMembership(id, user.id);
    if (!membership) return c.json({ error: "Workspace not found" }, 404);
    if (membership.role !== "owner") {
      return c.json({ error: "Only the owner can invite members", code: "owner_required" }, 403);
    }
    const body = await c.req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: "A valid email address is required" }, 400);
    }
    const role = body.role === "owner" ? "owner" : "member";

    const members = await ws.getMembers(id);
    if (members.some((m) => m.email.toLowerCase() === email)) {
      return c.json({ error: "This person is already a member of the workspace", code: "already_member" }, 409);
    }

    const workspace = await ws.getWorkspace(id);
    if (!workspace) return c.json({ error: "Workspace not found" }, 404);

    const invitation = await ws.createInvitation(workspace, user, email, role);
    const origin = c.req.header("Origin") ?? "";
    const inviteUrl = `${origin}/invite/${invitation.token}`;
    const emailSent = await ws.sendInvitationEmail(invitation, inviteUrl);

    return c.json({ ...invitation, invite_url: inviteUrl, email_sent: emailSent }, 201);
  } catch (e) {
    console.log("POST /workspaces/:id/invites error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.delete("/workspaces/:id/invites/:token", async (c) => {
  try {
    const user = c.get("user");
    const id = c.req.param("id");
    const token = c.req.param("token");
    const membership = await ws.getMembership(id, user.id);
    if (!membership) return c.json({ error: "Workspace not found" }, 404);
    if (membership.role !== "owner") {
      return c.json({ error: "Only the owner can revoke invitations", code: "owner_required" }, 403);
    }
    const invitation = await ws.getInvitation(token);
    if (!invitation || invitation.workspace_id !== id) {
      return c.json({ error: "Invitation not found" }, 404);
    }
    await ws.saveInvitation({ ...invitation, status: "revoked" });
    return c.json({ ok: true });
  } catch (e) {
    console.log("DELETE /workspaces/:id/invites/:token error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// Public preview for the accept page — the token itself is the secret, so the
// invitee can see what they were invited to before signing in/registering.
app.get("/invites/:token", async (c) => {
  try {
    const invitation = await ws.getInvitation(c.req.param("token"));
    if (!invitation) return c.json({ error: "Invitation not found" }, 404);
    const fresh = await ws.freshInvitation(invitation);
    return c.json({
      workspace_name: fresh.workspace_name,
      email: fresh.email,
      role: fresh.role,
      invited_by: fresh.invited_by,
      status: fresh.status,
      expires_at: fresh.expires_at,
    });
  } catch (e) {
    console.log("GET /invites/:token error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/invites/accept", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const body = await c.req.json();
    const token = String(body.token ?? "");
    const invitation = token ? await ws.getInvitation(token) : null;
    if (!invitation) return c.json({ error: "Invitation not found" }, 404);

    const fresh = await ws.freshInvitation(invitation);
    if (fresh.status === "revoked") {
      return c.json({ error: "This invitation has been revoked", code: "invite_revoked" }, 400);
    }
    if (fresh.status === "expired") {
      return c.json({ error: "This invitation has expired", code: "invite_expired" }, 410);
    }
    if (fresh.status === "accepted") {
      return c.json({ error: "This invitation has already been used", code: "invite_used" }, 400);
    }
    if ((user.email ?? "").toLowerCase() !== fresh.email.toLowerCase()) {
      return c.json(
        { error: "This invitation was sent to a different email address", code: "invite_email_mismatch" },
        403,
      );
    }

    const workspace = await ws.getWorkspace(fresh.workspace_id);
    if (!workspace) return c.json({ error: "This workspace no longer exists" }, 410);

    const alreadyMember = !!(await ws.getMembership(workspace.id, user.id));
    if (!alreadyMember) {
      await ws.addMember(workspace.id, user, fresh.role);
    }
    await ws.saveInvitation({ ...fresh, status: "accepted" });

    return c.json({
      ok: true,
      already_member: alreadyMember,
      workspace: { id: workspace.id, name: workspace.name, role: fresh.role },
    });
  } catch (e) {
    console.log("POST /invites/accept error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Workspace plan (public fallback for invited members) ─────────────────────

app.get("/workspace-plan", async (c) => {
  try {
    const workspaceId = c.req.header("X-Workspace-Id");
    if (!workspaceId) {
      return c.json({ plan: "free", owner_id: null });
    }
    const workspace = await ws.getWorkspace(workspaceId);
    if (!workspace) {
      return c.json({ plan: "free", owner_id: null });
    }
    return c.json({
      plan: workspace.plan_id ?? "free",
      owner_id: workspace.owner_id,
    });
  } catch (e) {
    console.log("GET /workspace-plan error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Member home (consolidated dashboard for invited members) ─────────────────

const SEED_MENTIONS = [
  { id: 1, type: "mention", text: "@iqbal assigned you to Review design mockups v3", project: "Mobile App", time: "10 min ago", read: false },
  { id: 2, type: "comment", text: "2 new comments on Homepage redesign", project: "Web Application", time: "1 hr ago", read: false },
  { id: 3, type: "assignment", text: "You were assigned to Database migration script", project: "Web Application", time: "2 hr ago", read: true },
  { id: 4, type: "mention", text: "@elena mentioned you in Q3 Planning", project: "Internal", time: "3 hr ago", read: true },
  { id: 5, type: "share", text: "John shared a file with you", project: "Web Application", time: "5 hr ago", read: true },
];

const SEED_TEAM_ACTIVITY = [
  { id: 1, actor: "Alice", action: "completed", target: "Homepage redesign", time: "2 min ago" },
  { id: 2, actor: "Bob", action: "started", target: "Login API", time: "15 min ago" },
  { id: 3, actor: "Charlie", action: "commented on", target: "Database migration script", time: "30 min ago" },
  { id: 4, actor: "Diana", action: "uploaded", target: "Design System v3.figma", time: "1 hr ago" },
  { id: 5, actor: "Evan", action: "completed", target: "Mobile responsive fix", time: "2 hr ago" },
  { id: 6, actor: "Fiona", action: "joined", target: "Mobile App", time: "3 hr ago" },
  { id: 7, actor: "George", action: "updated", target: "Q3 Goals", time: "4 hr ago" },
  { id: 8, actor: "Hannah", action: "started", target: "Auth module refactor", time: "5 hr ago" },
  { id: 9, actor: "Ian", action: "completed", target: "Unit tests — payment module", time: "6 hr ago" },
  { id: 10, actor: "Julia", action: "commented on", target: "Client presentation deck", time: "8 hr ago" },
];

app.get("/member-home", async (c) => {
  try {
    const user = c.get("user");
    const workspace = c.get("workspace");
    const membership = c.get("membership");
    if (!user || !workspace || !membership) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const workspaceId = workspace.id;
    const userEmail = user.email;
    const userName = user.user_metadata?.full_name || userEmail;

    // Try SQL first
    try {
      // Tasks filtered by assignee
      const allTasks = await sql.sqlQueryByWorkspace("tasks", workspaceId, "*, projects(name)");
      const memberTasks = allTasks.filter((t: any) =>
        t.assignee === userEmail || t.assignee === userName
      );
      const myTasks = {
        in_progress: memberTasks.filter((t: any) => t.status === "in-progress"),
        in_review: memberTasks.filter((t: any) => t.status === "review"),
        due_today: memberTasks.filter((t: any) => {
          const due = t.due_date ? new Date(t.due_date) : null;
          return due && due.toDateString() === new Date().toDateString();
        }),
        completed: memberTasks.filter((t: any) => t.status === "completed"),
      };

      // Projects (active only, mapped to KV shape)
      const sqlProjects = await sql.sqlQueryByWorkspace("projects", workspaceId, "*", { status: "active" });
      const activeProjects = sqlProjects.map((p: any) => ({
        id: p.legacy_id ?? p.id,
        name: p.name,
        total_tasks: 0,
        completed_tasks: 0,
        progress_percent: p.progress,
        next_milestone: p.due_date,
      }));

      // Calendar events today
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      const sqlEvents = await sql.sqlQueryByWorkspace("calendar_events", workspaceId, "*");
      const todayEvents = sqlEvents.filter((e: any) => {
        const start = new Date(e.start_time);
        return start >= todayStart && start < todayEnd;
      }).map((e: any) => ({
        id: e.id,
        title: e.title,
        time: new Date(e.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        color: e.color,
      }));

      // Mentions
      const mentions = await sql.sqlQueryByWorkspace("mentions", workspaceId, "*");
      const memberMentions = mentions.filter((m: any) =>
        m.mentionee === userEmail || m.mentionee === userName || !m.mentionee
      );

      // Activity
      const teamActivity = await sql.sqlQueryByWorkspace("team_activity", workspaceId, "*");

      // Owner info
      const { data: ownerProfile } = await sql.getDbClient().from("profiles").select("first_name, last_name, email").eq("user_id", workspace.owner_id).maybeSingle();
      const members = await ws.getMembers(workspace.id);
      const owner = members.find((m: any) => m.user_id === workspace.owner_id);

      return c.json({
        workspace: {
          name: workspace.name,
          owner_id: workspace.owner_id,
          owner_name: [ownerProfile?.first_name, ownerProfile?.last_name].filter(Boolean).join(" ") || owner?.name ?? "Owner",
          owner_email: ownerProfile?.email ?? owner?.email ?? "",
          total_members: members.length,
          plan_id: workspace.plan_id ?? "free",
        },
        today_events: todayEvents,
        my_tasks: myTasks,
        projects: activeProjects,
        mentions: memberMentions.slice(0, 5),
        team_activity: teamActivity.slice(0, 10),
      });
  } catch (e) {
    console.log("GET /member-home error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Reset workspace data ──────────────────────────────────────────────────────

app.delete("/workspace-data", async (c) => {
  try {
    if (!isOwner(c)) {
      return c.json({ error: "Only the owner can reset workspace data", code: "owner_required" }, 403);
    }
    const workspace = c.get("workspace");
    const tables = [
      "tasks", "projects", "team_members", "teams", "calendar_events", "files", "file_folders",
      "workspace_financial", "workspace_integrations", "workspace_sessions", "workspace_dashboard",
      "workspace_analytics", "workspace_settings", "workspace_milestones", "mentions", "team_activity",
    ];
    for (const table of tables) {
      await sql.getDbClient().from(table).delete().eq("workspace_id", workspace.id);
    }
    return c.json({ ok: true });
  } catch (e) {
    console.log("DELETE /workspace-data error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/leave-workspace", async (c) => {
  try {
    const user = c.get("user");
    const workspace = c.get("workspace");
    const membership = c.get("membership");
    if (!user || !workspace || !membership) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (membership.role === "owner") {
      return c.json({ error: "Owner cannot leave. Transfer ownership first.", code: "owner_cannot_leave" }, 403);
    }

    // Read current members (for validation only)
    const members = await ws.getMembers(workspace.id);
    const filtered = members.filter((m: any) => m.user_id !== user.id);

    // Update user's workspace index (handled by workspace_members SQL delete)
    await ws.removeMember(workspace.id, user.id);

    // Log the activity
    await logActivity(c, "left", workspace.name);

    return c.json({ ok: true });
  } catch (e) {
    console.log("POST /leave-workspace error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

app.get("/tasks", async (c) => {
  try {
    const workspace = c.get("workspace");
    const sqlTasks = await sql.sqlQueryByWorkspace("tasks", workspace.id, "*, projects(name)");
    const mapped = sqlTasks.map((t: any) => ({
      id: t.legacy_id ?? t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      assignee: t.assignee,
      project: t.projects?.name ?? "",
      due: t.due_date,
      completed: t.status === "completed",
    }));
    return c.json(mapped);
  } catch (e) {
    console.log("GET /tasks error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/tasks", async (c) => {
  try {
    const workspace = c.get("workspace");
    const body = await c.req.json();
    const newTask = await sql.sqlInsert("tasks", {
      workspace_id: workspace.id,
      title: body.title,
      description: body.description ?? null,
      status: body.status || "todo",
      priority: body.priority || "medium",
      assignee: body.assignee ?? null,
      due_date: body.due ? body.due : null,
      project_id: null,
    });
    await logActivity(c, "created", body.title);
    await broadcastAfterWrite(workspace.id, "tasks");
    return c.json(newTask, 201);
  } catch (e) {
    console.log("POST /tasks error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/tasks/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const workspace = c.get("workspace");
    const body = await c.req.json();

    const sqlTasks = await sql.sqlQueryByWorkspace("tasks", workspace.id, "*", { legacy_id: id });
    if (sqlTasks.length === 0) return c.json({ error: "Task not found" }, 404);
    const sqlTask = await sql.sqlUpdate("tasks", sqlTasks[0].id, {
      title: body.title !== undefined ? body.title : sqlTasks[0].title,
      description: body.description !== undefined ? body.description : sqlTasks[0].description,
      status: body.status !== undefined ? body.status : sqlTasks[0].status,
      priority: body.priority !== undefined ? body.priority : sqlTasks[0].priority,
      assignee: body.assignee !== undefined ? body.assignee : sqlTasks[0].assignee,
      due_date: body.due !== undefined ? body.due : sqlTasks[0].due_date,
    });

    if (body.status && body.status !== sqlTasks[0].status) {
      await logActivity(c, "updated", body.title ?? sqlTasks[0].title);
    }
    if (body.assignee && body.assignee !== sqlTasks[0].assignee) {
      const actor = c.get("user").email || c.get("user").user_metadata?.full_name || "Anonymous";
      await addMention(c, body.assignee, `${actor} assigned you to "${body.title ?? sqlTasks[0].title}"`);
    }
    await broadcastAfterWrite(workspace.id, "tasks");
    return c.json(sqlTask);
  } catch (e) {
    console.log("PUT /tasks/:id error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.delete("/tasks/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const workspace = c.get("workspace");

    const sqlTasks = await sql.sqlQueryByWorkspace("tasks", workspace.id, "*", { legacy_id: id });
    if (sqlTasks.length === 0) return c.json({ error: "Task not found" }, 404);
    await sql.sqlDelete("tasks", sqlTasks[0].id);

    await logActivity(c, "deleted", sqlTasks[0].title);
    await broadcastAfterWrite(workspace.id, "tasks");
    return c.json({ ok: true });
  } catch (e) {
    console.log("DELETE /tasks/:id error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Projects ──────────────────────────────────────────────────────────────────

app.get("/projects", async (c) => {
  try {
    const workspace = c.get("workspace");
    const sqlProjects = await sql.sqlQueryByWorkspace("projects", workspace.id, "*");
    const mapped = sqlProjects.map((p: any) => ({
      id: p.legacy_id ?? p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      progress: p.progress,
      tasks: { total: 0, done: 0 },
      team: [],
      due: p.due_date,
      tags: p.tags ?? [],
    }));
    return c.json(mapped);
  } catch (e) {
    console.log("GET /projects error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/projects", async (c) => {
  try {
    const user = c.get("user");
    const workspace = c.get("workspace");
    const body = await c.req.json();
    const planId = await getEffectivePlanId(user.id);

    // Count existing projects for plan limit check
    const existingProjects = await sql.sqlQueryByWorkspace("projects", workspace.id, "id");
    if (planId === "free" && existingProjects.length >= FREE_MAX_PROJECTS) {
      return c.json(
        {
          error: `The Free plan is limited to ${FREE_MAX_PROJECTS} projects. Upgrade to add more.`,
          code: "project_limit",
          max_projects: FREE_MAX_PROJECTS,
        },
        403,
      );
    }

    const newProject = await sql.sqlInsert("projects", {
      workspace_id: workspace.id,
      name: body.name,
      description: body.description ?? null,
      status: body.status || "active",
      progress: body.progress ?? 0,
      due_date: body.due ? body.due : null,
      tags: body.tags ?? [],
    });

    await logActivity(c, "created", body.name);
    await broadcastAfterWrite(workspace.id, "projects");
    return c.json(newProject, 201);
  } catch (e) {
    console.log("POST /projects error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/projects/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const workspace = c.get("workspace");

    const sqlProjects = await sql.sqlQueryByWorkspace("projects", workspace.id, "*", { legacy_id: id });
    if (sqlProjects.length === 0) return c.json({ error: "Project not found" }, 404);
    const updated = await sql.sqlUpdate("projects", sqlProjects[0].id, {
      name: body.name !== undefined ? body.name : sqlProjects[0].name,
      description: body.description !== undefined ? body.description : sqlProjects[0].description,
      status: body.status !== undefined ? body.status : sqlProjects[0].status,
      progress: body.progress !== undefined ? body.progress : sqlProjects[0].progress,
      due_date: body.due !== undefined ? body.due : sqlProjects[0].due_date,
      tags: body.tags !== undefined ? body.tags : sqlProjects[0].tags,
    });

    await broadcastAfterWrite(workspace.id, "projects");
    return c.json(updated);
  } catch (e) {
    console.log("PUT /projects/:id error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.delete("/projects/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const workspace = c.get("workspace");

    const sqlProjects = await sql.sqlQueryByWorkspace("projects", workspace.id, "*", { legacy_id: id });
    if (sqlProjects.length === 0) return c.json({ error: "Project not found" }, 404);
    await sql.sqlDelete("projects", sqlProjects[0].id);

    await broadcastAfterWrite(workspace.id, "projects");
    return c.json({ ok: true });
  } catch (e) {
    console.log("DELETE /projects/:id error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Teams ─────────────────────────────────────────────────────────────────────

app.get("/teams", async (c) => {
  try {
    const gate = await requirePlan(c, "pro");
    if (!gate.user) return gate.response;
    const workspace = c.get("workspace");
    const teams = await sql.sqlQueryByWorkspace("teams", workspace.id, "id, name, description");
    let members: any[] = [];
    if (teams.length) {
      const teamIds = teams.map((t: any) => t.id);
      const { data: m, error } = await sql.getDbClient().from("team_members").select("*").in("team_id", teamIds);
      if (!error && m) members = m;
    }
    const result = teams.map((t: any) => ({
      name: t.name,
      description: t.description,
      members: members.filter((m: any) => m.team_id === t.id).map((m: any) => ({
        initials: m.initials,
        name: m.name,
        role: m.role,
        status: m.status,
        tasks: m.tasks,
      })),
    }));
    return c.json(result.length ? result : SEED_TEAMS);
  } catch (e) {
    console.log("GET /teams error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/teams/invite", async (c) => {
  try {
    const gate = await requirePlan(c, "pro");
    if (!gate.user) return gate.response;
    const workspace = c.get("workspace");
    const { teamName, member } = await c.req.json();
    const rows = await sql.sqlQueryByWorkspace("teams", workspace.id, "id, name, description", { name: teamName });
    if (!rows.length) return c.json({ error: "Team not found" }, 404);
    const team = rows[0];
    await sql.sqlInsert("team_members", {
      team_id: team.id,
      initials: member.initials,
      name: member.name,
      role: member.role,
      status: member.status ?? "offline",
      tasks: member.tasks ?? 0,
    });
    await broadcastAfterWrite(workspace.id, "teams");
    const { data: members } = await sql.getDbClient().from("team_members").select("*").eq("team_id", team.id);
    return c.json({
      name: team.name,
      description: team.description,
      members: members?.map((m: any) => ({
        initials: m.initials,
        name: m.name,
        role: m.role,
        status: m.status,
        tasks: m.tasks,
      })) ?? [],
    }, 201);
  } catch (e) {
    console.log("POST /teams/invite error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/teams/member", async (c) => {
  try {
    const gate = await requirePlan(c, "pro");
    if (!gate.user) return gate.response;
    const workspace = c.get("workspace");
    const { teamName, initials, patch } = await c.req.json();
    const rows = await sql.sqlQueryByWorkspace("teams", workspace.id, "id", { name: teamName });
    if (!rows.length) return c.json({ error: "Team not found" }, 404);
    const teamId = rows[0].id;
    const { data: members } = await sql.getDbClient().from("team_members").select("*").eq("team_id", teamId).eq("initials", initials);
    if (!members?.length) return c.json({ error: "Member not found" }, 404);
    const member = members[0];
    const allowed = ["initials", "name", "role", "status", "tasks"];
    const safePatch = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
    if (Object.keys(safePatch).length) {
      await sql.sqlUpdate("team_members", member.id, safePatch);
    }
    await broadcastAfterWrite(workspace.id, "teams");
    return c.json({ ...member, ...safePatch });
  } catch (e) {
    console.log("PUT /teams/member error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.delete("/teams/member", async (c) => {
  try {
    const gate = await requirePlan(c, "pro");
    if (!gate.user) return gate.response;
    const workspace = c.get("workspace");
    const { teamName, initials } = await c.req.json();
    const rows = await sql.sqlQueryByWorkspace("teams", workspace.id, "id", { name: teamName });
    if (!rows.length) return c.json({ error: "Team not found" }, 404);
    const teamId = rows[0].id;
    const { data: members } = await sql.getDbClient().from("team_members").select("id").eq("team_id", teamId).eq("initials", initials);
    if (!members?.length) return c.json({ error: "Member not found" }, 404);
    await sql.sqlDelete("team_members", members[0].id);
    await broadcastAfterWrite(workspace.id, "teams");
    return c.json({ ok: true });
  } catch (e) {
    console.log("DELETE /teams/member error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Calendar ──────────────────────────────────────────────────────────────────

app.get("/calendar", async (c) => {
  try {
    const workspace = c.get("workspace");
    const sqlEvents = await sql.sqlQueryByWorkspace("calendar_events", workspace.id, "*");
    // Group by date (YYYY-M-D) and time
    const events: Record<string, any[]> = {};
    sqlEvents.forEach((e: any) => {
      const date = new Date(e.start_time);
      const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      if (!events[dateKey]) events[dateKey] = [];
      events[dateKey].push({ id: e.id, title: e.title, time: e.start_time.split('T')[1].slice(0,5), color: e.color });
    });
    return c.json(events);
  } catch (e) {
    console.log("GET /calendar error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/calendar/events", async (c) => {
  try {
    const workspace = c.get("workspace");
    const { dateKey, event } = await c.req.json();

    // Parse dateKey (YYYY-M-D) + time ("09:30") into ISO start_time
    const [year, month, day] = dateKey.split("-").map(Number);
    const startTime = new Date(year, month - 1, day);
    const [h, m] = (event.time || "00:00").split(":").map(Number);
    startTime.setHours(h || 0, m || 0, 0, 0);

    const sqlEvent = await sql.sqlInsert("calendar_events", {
      workspace_id: workspace.id,
      title: event.title,
      start_time: startTime.toISOString(),
      color: event.color || "#6366f1",
    });

    await broadcastAfterWrite(workspace.id, "calendar_events");
    return c.json({ id: sqlEvent.id, title: sqlEvent.title, time: event.time || "00:00", color: sqlEvent.color }, 201);
  } catch (e) {
    console.log("POST /calendar/events error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.delete("/calendar/events", async (c) => {
  try {
    const workspace = c.get("workspace");
    const { id } = await c.req.json();
    if (!id) return c.json({ error: "id is required" }, 400);
    await sql.sqlDelete("calendar_events", id);
    await broadcastAfterWrite(workspace.id, "calendar_events");
    return c.json({ ok: true });
  } catch (e) {
    console.log("DELETE /calendar/events error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Files ─────────────────────────────────────────────────────────────────────

app.get("/files", async (c) => {
  try {
    const workspace = c.get("workspace");
    const sqlFiles = await sql.sqlQueryByWorkspace("files", workspace.id, "*");
    const sqlFolders = await sql.sqlQueryByWorkspace("file_folders", workspace.id, "*");
    const files = sqlFiles.map((f: any) => ({
      id: f.id,
      name: f.name,
      size: f.size_bytes,
      type: f.mime_type?.split('/')[1] || '',
      date: f.created_at.split('T')[0],
      uploader: f.uploader,
      folderId: f.folder_id,
      url: f.url,
    }));
    return c.json({ files, folders: sqlFolders });
  } catch (e) {
    console.log("GET /files error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/files", async (c) => {
  try {
    const workspace = c.get("workspace");
    const file = await c.req.json();
    const sqlFile = await sql.sqlInsert("files", {
      workspace_id: workspace.id,
      name: file.name,
      size_bytes: typeof file.size === "number" ? file.size : 0,
      mime_type: file.type ? `application/${file.type}` : null,
      storage_path: file.storagePath || "",
      url: file.url || "",
      uploader: file.uploader || "unknown",
    });
    await logActivity(c, "uploaded", file.name);
    await broadcastAfterWrite(workspace.id, "files");
    return c.json({ ...file, id: sqlFile.id }, 201);
  } catch (e) {
    console.log("POST /files error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/files", async (c) => {
  try {
    const workspace = c.get("workspace");
    const { id, name } = await c.req.json();
    if (!id) return c.json({ error: "id is required" }, 400);
    await sql.sqlUpdate("files", id, { name });
    await broadcastAfterWrite(workspace.id, "files");
    return c.json({ ok: true });
  } catch (e) {
    console.log("PUT /files error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.delete("/files/:name", async (c) => {
  try {
    const workspace = c.get("workspace");
    const client = storageClient();
    const name = decodeURIComponent(c.req.param("name"));

    const sqlFiles = await sql.sqlQueryByWorkspace("files", workspace.id, "*", { name });
    if (sqlFiles.length === 0) return c.json({ error: "File not found" }, 404);
    const file = sqlFiles[0];

    if (client && file.storage_path) {
      const { error } = await client.storage.from("workspace-files").remove([file.storage_path]);
      if (error) console.log("Storage delete error:", error);
    }

    if (file.size_bytes) {
      await incrementStorageUsage(c, -file.size_bytes);
    }

    await sql.sqlDelete("files", file.id);
    await broadcastAfterWrite(workspace.id, "files");
    return c.json({ ok: true });
  } catch (e) {
    console.log("DELETE /files/:name error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// POST /files/upload — real multipart upload to Supabase Storage
app.post("/files/upload", async (c) => {
  try {
    const client = storageClient();
    if (!client) return c.json({ error: "Storage not configured" }, 503);

    const form = await c.req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return c.json({ error: "Missing file field" }, 400);
    }
    if (file.size === 0) return c.json({ error: "Empty file" }, 400);

    const rawMeta = form.get("metadata");
    const parsedMeta = rawMeta && typeof rawMeta === "string" ? JSON.parse(rawMeta) : {};

    // 1. Quota check
    const quota = await checkStorageQuota(c, file.size);
    if (!quota.allowed) {
      return c.json(
        { error: "Storage quota exceeded", used: quota.used, limit: quota.limit },
        413,
      );
    }

    // 2. Upload to Supabase Storage
    const workspace = c.get("workspace");
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${workspace.id}/${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadErr } = await client
      .storage
      .from("workspace-files")
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) {
      console.log("Storage upload error:", uploadErr);
      return c.json({ error: uploadErr.message }, 500);
    }

    // 3. Get signed URL (7 days)
    const { data: urlData } = await client
      .storage
      .from("workspace-files")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    const fileRecord = {
      name: file.name,
      type: ext || "doc",
      size: file.size,
      sizeHuman: humanSize(file.size),
      modified: new Date().toISOString(),
      owner: parsedMeta.owner || "—",
      shared: parsedMeta.shared ?? false,
      archived: false,
      storagePath,
      url: urlData?.signedUrl ?? null,
      urlExpiresAt: urlData?.signedUrl
        ? new Date(Date.now() + 60 * 60 * 24 * 7 * 1000).toISOString()
        : null,
    };

    // 4. Save metadata to SQL
    await sql.sqlInsert("files", {
      workspace_id: workspace.id,
      name: fileRecord.name,
      size_bytes: fileRecord.size,
      mime_type: file.type || "application/octet-stream",
      storage_path: fileRecord.storagePath,
      url: fileRecord.url,
      uploader: fileRecord.owner,
      folder_id: parsedMeta.folderId || null,
    });
    await broadcastAfterWrite(workspace.id, "files");

    // 5. Update usage counter
    await incrementStorageUsage(c, file.size);

    return c.json(fileRecord, 201);
  } catch (e) {
    console.log("POST /files/upload error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// GET /files/download/:name — generate a fresh signed URL (1 hour expiry)
app.get("/files/download/:name", async (c) => {
  try {
    const client = storageClient();
    if (!client) return c.json({ error: "Storage not configured" }, 503);

    const workspace = c.get("workspace");
    const name = decodeURIComponent(c.req.param("name"));
    const rows = await sql.sqlQueryByWorkspace("files", workspace.id, "*", { name });
    if (!rows.length || !rows[0].storage_path) return c.json({ error: "File not found" }, 404);
    const file = rows[0];

    const { data, error } = await client
      .storage
      .from("workspace-files")
      .createSignedUrl(file.storage_path, 60 * 60); // 1 hour

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ url: data.signedUrl, expiresIn: 3600 });
  } catch (e) {
    console.log("GET /files/download error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// GET /files/quota — return current storage usage and limit
app.get("/files/quota", async (c) => {
  try {
    const { used, limit } = await getStorageUsage(c);
    return c.json({ used, limit, unlimited: limit === 0 });
  } catch (e) {
    console.log("GET /files/quota error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/files/folders", async (c) => {
  try {
    const workspace = c.get("workspace");
    const folder = await c.req.json();
    const newFolder = await sql.sqlInsertInWorkspace("file_folders", workspace.id, folder);
    await broadcastAfterWrite(workspace.id, "file_folders");
    return c.json(newFolder, 201);
  } catch (e) {
    console.log("POST /files/folders error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

// ── Settings ──────────────────────────────────────────────────────────────────

const settingsSeedMap: Record<string, any> = {
  profile: SEED_PROFILE,
  workspace: SEED_WORKSPACE,
  notifications: SEED_NOTIFICATIONS,
  appearance: SEED_APPEARANCE,
  timezone: SEED_TIMEZONE,
  members: SEED_MEMBERS,
  billing: SEED_BILLING,
  "api-keys": SEED_API_KEYS,
  webhooks: SEED_WEBHOOKS,
  "audit-log": SEED_AUDIT_LOG,
};

app.get("/settings/:section", async (c) => {
  try {
    const section = c.req.param("section");
    const seed = settingsSeedMap[section];
    if (!seed) return c.json({ error: "Unknown settings section: " + section }, 400);
    const workspace = c.get("workspace");
    const rows = await sql.sqlQueryByWorkspace("workspace_settings", workspace.id, "*", { section });
    const data = rows.length ? rows[0].data : seed;
    return c.json(data);
  } catch (e) {
    console.log("GET /settings/:section error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/settings/:section", async (c) => {
  try {
    const section = c.req.param("section");
    if (!settingsSeedMap[section]) return c.json({ error: "Unknown settings section: " + section }, 400);
    const OWNER_ONLY_SECTIONS = ["workspace", "members", "billing", "api-keys", "webhooks"];
    if (OWNER_ONLY_SECTIONS.includes(section) && !isOwner(c)) {
      return c.json({ error: "Only the workspace owner can change these settings", code: "owner_required" }, 403);
    }
    const body = await c.req.json();
    const workspace = c.get("workspace");
    const rows = await sql.sqlQueryByWorkspace("workspace_settings", workspace.id, "*", { section });
    if (rows.length) {
      await sql.sqlUpdate("workspace_settings", rows[0].id, { data: body, updated_at: new Date().toISOString() });
    } else {
      await sql.sqlInsertInWorkspace("workspace_settings", workspace.id, { section, data: body });
    }
    await broadcastAfterWrite(workspace.id, "workspace_settings");
    return c.json(body);
  } catch (e) {
    console.log("PUT /settings/:section error:", e);
    return c.json({ error: String(e) }, 500);
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
    const workspace = c.get("workspace");
    const row = await sql.sqlQueryFirst("workspace_financial", workspace.id, "data");
    const data = row?.data ?? SEED_FINANCIAL;
    return c.json(data);
  } catch (e) {
    console.log("GET /financial error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/financial", async (c) => {
  try {
    const workspace = c.get("workspace");
    const body = await c.req.json();
    const row = await sql.sqlQueryFirst("workspace_financial", workspace.id, "data");
    const existing = row?.data ?? SEED_FINANCIAL;
    const updated = { ...existing, ...body };
    await sql.sqlUpsert("workspace_financial", { workspace_id: workspace.id, data: updated, updated_at: new Date().toISOString() }, "workspace_id");
    await broadcastAfterWrite(workspace.id, "workspace_financial");
    return c.json(updated);
  } catch (e) {
    console.log("PUT /financial error:", e);
    return c.json({ error: String(e) }, 500);
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
    const workspace = c.get("workspace");
    const rows = await sql.sqlQueryByWorkspace("workspace_integrations", workspace.id);
    const data = rows.map((r: any) => ({
      name: r.name,
      description: r.description,
      connected: r.connected,
      lastSync: r.last_sync,
      scopes: r.scopes,
    }));
    return c.json(data.length ? data : SEED_INTEGRATIONS);
  } catch (e) {
    console.log("GET /integrations error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/integrations/:name", async (c) => {
  try {
    const workspace = c.get("workspace");
    const name = decodeURIComponent(c.req.param("name"));
    const body = await c.req.json();
    const rows = await sql.sqlQueryByWorkspace("workspace_integrations", workspace.id, "*", { name });
    if (!rows.length) return c.json({ error: "Integration not found" }, 404);
    const integration = rows[0];
    const updated = { ...integration, ...body, updated_at: new Date().toISOString() };
    await sql.sqlUpdate("workspace_integrations", integration.id, updated);
    await broadcastAfterWrite(workspace.id, "workspace_integrations");
    return c.json(updated);
  } catch (e) {
    console.log("PUT /integrations/:name error:", e);
    return c.json({ error: String(e) }, 500);
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
    const workspace = c.get("workspace");
    const row = await sql.sqlQueryFirst("workspace_sessions", workspace.id, "data");
    const data = row?.data ?? SEED_SESSIONS;
    return c.json(data);
  } catch (e) {
    console.log("GET /sessions error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.delete("/sessions/:device", async (c) => {
  try {
    const workspace = c.get("workspace");
    const device = decodeURIComponent(c.req.param("device"));
    const row = await sql.sqlQueryFirst("workspace_sessions", workspace.id, "data");
    const data = row?.data ?? SEED_SESSIONS;
    data.active = data.active.filter((s: any) => s.device !== device);
    await sql.sqlUpsert("workspace_sessions", { workspace_id: workspace.id, data, updated_at: new Date().toISOString() }, "workspace_id");
    await broadcastAfterWrite(workspace.id, "workspace_sessions");
    return c.json({ ok: true });
  } catch (e) {
    console.log("DELETE /sessions/:device error:", e);
    return c.json({ error: String(e) }, 500);
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
    const workspace = c.get("workspace");

    const tasks = await sql.sqlQueryByWorkspace("tasks", workspace.id, "*");
    const projects = await sql.sqlQueryByWorkspace("projects", workspace.id, "*");

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t: any) => t.status === "completed").length;
    const inProgressTasks = tasks.filter((t: any) => t.status === "in-progress").length;
    const reviewTasks = tasks.filter((t: any) => t.status === "review").length;
    const todoTasks = tasks.filter((t: any) => t.status === "todo").length;
    const overdueTasks = tasks.filter((t: any) => {
      if (!t.due_date) return false;
      return new Date(t.due_date) < new Date() && t.status !== "completed";
    }).length;
    const totalProjects = projects.length;
    const activeProjects = projects.filter((p: any) => p.status === "active").length;
    const avgProgress = totalProjects > 0
      ? Math.round(projects.reduce((sum: number, p: any) => sum + (p.progress ?? 0), 0) / totalProjects)
      : 0;

    const storedResult = await sql.sqlQueryFirst("workspace_analytics", workspace.id, "data");
    const stored = storedResult?.data ?? SEED_ANALYTICS;
    const data = {
      ...SEED_ANALYTICS,
      ...stored,
      taskMetrics: {
        ...(stored.taskMetrics ?? SEED_ANALYTICS.taskMetrics),
        totalTasks,
        completedTasks,
        inProgressTasks,
        reviewTasks,
        todoTasks,
        overdueTasks,
        totalProjects,
        activeProjects,
        avgProgress,
      },
    };
    if (!stored.completionSeries) {
      await sql.sqlUpsert("workspace_analytics", { workspace_id: workspace.id, data, updated_at: new Date().toISOString() }, "workspace_id");
      await broadcastAfterWrite(workspace.id, "workspace_analytics");
    }
    return c.json(data);
  } catch (e) {
    console.log("GET /analytics/metrics error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/analytics/metrics", async (c) => {
  try {
    const gate = await requirePlan(c, "pro");
    if (!gate.user) return gate.response;
    const workspace = c.get("workspace");
    const body = await c.req.json();
    const row = await sql.sqlQueryFirst("workspace_analytics", workspace.id, "data");
    const existing = row?.data ?? SEED_ANALYTICS;
    const updated = { ...existing, ...body };
    await sql.sqlUpsert("workspace_analytics", { workspace_id: workspace.id, data: updated, updated_at: new Date().toISOString() }, "workspace_id");
    await broadcastAfterWrite(workspace.id, "workspace_analytics");
    return c.json(updated);
  } catch (e) {
    console.log("PUT /analytics/metrics error:", e);
    return c.json({ error: String(e) }, 500);
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
    const workspace = c.get("workspace");
    const row = await sql.sqlQueryFirst("workspace_dashboard", workspace.id, "data", { category: "ops" });
    const data = row?.data ?? SEED_DASHBOARD_OPS;
    return c.json(data);
  } catch (e) {
    console.log("GET /dashboard/ops error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/dashboard/ops", async (c) => {
  try {
    const workspace = c.get("workspace");
    const body = await c.req.json();
    const row = await sql.sqlQueryFirst("workspace_dashboard", workspace.id, "data", { category: "ops" });
    const existing = row?.data ?? SEED_DASHBOARD_OPS;
    const updated = { ...existing, ...body };
    await sql.sqlUpsert("workspace_dashboard", { workspace_id: workspace.id, category: "ops", data: updated, updated_at: new Date().toISOString() }, "workspace_id,category");
    await broadcastAfterWrite(workspace.id, "workspace_dashboard");
    return c.json(updated);
  } catch (e) {
    console.log("PUT /dashboard/ops error:", e);
    return c.json({ error: String(e) }, 500);
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
    const workspace = c.get("workspace");
    const row = await sql.sqlQueryFirst("workspace_dashboard", workspace.id, "data", { category: "details" });
    const stored = row?.data ?? SEED_DASHBOARD_DETAILS;
    const data = { ...SEED_DASHBOARD_DETAILS, ...stored };
    return c.json(data);
  } catch (e) {
    console.log("GET /dashboard/details error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/dashboard/details", async (c) => {
  try {
    const workspace = c.get("workspace");
    const body = await c.req.json();
    const row = await sql.sqlQueryFirst("workspace_dashboard", workspace.id, "data", { category: "details" });
    const existing = row?.data ?? SEED_DASHBOARD_DETAILS;
    const updated = { ...existing, ...body };
    await sql.sqlUpsert("workspace_dashboard", { workspace_id: workspace.id, category: "details", data: updated, updated_at: new Date().toISOString() }, "workspace_id,category");
    await broadcastAfterWrite(workspace.id, "workspace_dashboard");
    return c.json(updated);
  } catch (e) {
    console.log("PUT /dashboard/details error:", e);
    return c.json({ error: String(e) }, 500);
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

app.get("/milestones/:project", async (c) => {
  try {
    const workspace = c.get("workspace");
    const project = c.req.param("project");
    const row = await sql.sqlQueryFirst("workspace_milestones", workspace.id, "data");
    const all = row?.data ?? SEED_MILESTONES;
    return c.json(all[project] ?? []);
  } catch (e) {
    console.log("GET /milestones/:project error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/milestones/:project/:index", async (c) => {
  try {
    const workspace = c.get("workspace");
    const project = c.req.param("project");
    const idx = parseInt(c.req.param("index"));
    const body = await c.req.json();
    const row = await sql.sqlQueryFirst("workspace_milestones", workspace.id, "data");
    const all = row?.data ?? SEED_MILESTONES;
    if (!all[project] || !all[project][idx]) return c.json({ error: "Not found" }, 404);
    all[project][idx] = { ...all[project][idx], ...body };
    await sql.sqlUpsert("workspace_milestones", { workspace_id: workspace.id, data: all, updated_at: new Date().toISOString() }, "workspace_id");
    await broadcastAfterWrite(workspace.id, "workspace_milestones");
    return c.json(all[project][idx]);
  } catch (e) {
    console.log("PUT /milestones/:project/:index error:", e);
    return c.json({ error: String(e) }, 500);
  }
});

Deno.serve(app.fetch);

