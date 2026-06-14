// Fase 14.1 — Workspace & Membership schema (multi-user collaboration).
//
// KV layout:
//   workspace:{id}          → Workspace
//   ws_members:{id}         → Membership[]
//   user_ws:{userId}        → string[] (workspace ids the user belongs to)
//   ws:{id}:{dataKey}       → per-workspace project data (tasks:list, projects:list, …)
//
// Pre-Fase-14 data lived in single global keys (e.g. `tasks:list`); routes use
// a lazy dual-read migration: on first access the legacy value is copied into
// the workspace-scoped key.

import * as kv from "./kv_store.tsx";
import * as sql from "./sql_client.tsx";
import * as emails from "./emails.tsx";

export type WorkspaceRole = "owner" | "member";

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  plan_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  email: string;
  name: string;
  joined_at: string;
}

// Per-workspace data key prefix: ws:{workspaceId}:{key}
export const wsDataKey = (workspaceId: string, key: string) =>
  `ws:${workspaceId}:${key}`;

// All data keys that live inside a workspace (used for reset/delete).
export const WORKSPACE_DATA_KEYS = [
  "tasks:list",
  "projects:list",
  "teams:list",
  "calendar:events",
  "files:list",
  "files:folders",
  "financial:data",
  "integrations:list",
  "security:sessions",
  "analytics:metrics",
  "dashboard:ops",
  "dashboard:details",
  "milestones:all",
  "settings:profile",
  "settings:workspace",
  "settings:notifications",
  "settings:appearance",
  "settings:timezone",
  "settings:members",
  "settings:billing",
  "settings:api-keys",
  "settings:webhooks",
  "settings:audit-log",
];

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const { data, error } = await sql.getDbClient().from("workspaces").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return { id: data.id, name: data.name, owner_id: data.owner_id, plan_id: data.plan_id, created_at: data.created_at, updated_at: data.updated_at };
}

export async function getMembers(workspaceId: string): Promise<Membership[]> {
  const { data, error } = await sql.getDbClient().from("workspace_members").select("*").eq("workspace_id", workspaceId);
  if (error || !data) return [];
  return data.map((m: any) => ({ workspace_id: m.workspace_id, user_id: m.user_id, role: m.role, email: m.email, name: m.name, joined_at: m.joined_at }));
}

export async function getMembership(
  workspaceId: string,
  userId: string,
): Promise<Membership | null> {
  const { data, error } = await sql.getDbClient().from("workspace_members").select("*").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return { workspace_id: data.workspace_id, user_id: data.user_id, role: data.role, email: data.email, name: data.name, joined_at: data.joined_at };
}

export async function listUserWorkspaceIds(userId: string): Promise<string[]> {
  const { data, error } = await sql.getDbClient().from("workspace_members").select("workspace_id").eq("user_id", userId);
  if (error || !data) return [];
  return data.map((m: any) => m.workspace_id);
}

async function addToUserIndex(_userId: string, _workspaceId: string) {
  // No-op: workspace_members table handles the mapping natively
}

async function removeFromUserIndex(_userId: string, _workspaceId: string) {
  // No-op: workspace_members table handles the mapping natively
}

const displayName = (user: any) =>
  user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

export async function createWorkspace(
  user: any,
  name: string,
): Promise<{ workspace: Workspace; membership: Membership }> {
  const now = new Date().toISOString();
  // Copy owner's current subscription plan into the workspace
  const { data: subscription } = await sql.getDbClient().from("subscriptions").select("plan_id, status").eq("user_id", user.id).maybeSingle();
  const ownerPlan = subscription?.status === "active" ? subscription.plan_id : "free";

  const { data: wsResult, error: wsErr } = await sql.getDbClient().from("workspaces").insert({
    name,
    owner_id: user.id,
    plan_id: ownerPlan,
    created_at: now,
    updated_at: now,
  }).select().single();
  if (!wsResult || wsErr) throw new Error("Failed to create workspace: " + wsErr?.message);

  const workspace: Workspace = {
    id: wsResult.id,
    name: wsResult.name,
    owner_id: wsResult.owner_id,
    plan_id: wsResult.plan_id,
    created_at: wsResult.created_at,
    updated_at: wsResult.updated_at,
  };

  const membership: Membership = {
    workspace_id: workspace.id,
    user_id: user.id,
    role: "owner",
    email: user.email ?? "",
    name: displayName(user),
    joined_at: now,
  };
  await sql.getDbClient().from("workspace_members").insert(membership);
  return { workspace, membership };
}

// Syncs plan_id on all workspaces owned by userId to the given plan.
export async function syncWorkspacePlans(userId: string, planId: string) {
  await sql.getDbClient().from("workspaces").update({ plan_id: planId, updated_at: new Date().toISOString() }).eq("owner_id", userId);
}

// Reads the cached plan_id for a workspace (falls back to "free").
export async function getWorkspacePlan(workspaceId: string): Promise<string> {
  const workspace = await getWorkspace(workspaceId);
  return workspace?.plan_id ?? "free";
}

export async function addMember(
  workspaceId: string,
  user: any,
  role: WorkspaceRole,
): Promise<Membership> {
  const { data: existing } = await sql.getDbClient().from("workspace_members").select("*").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (existing) return { workspace_id: existing.workspace_id, user_id: existing.user_id, role: existing.role, email: existing.email, name: existing.name, joined_at: existing.joined_at };
  const membership: Membership = {
    workspace_id: workspaceId,
    user_id: user.id,
    role,
    email: user.email ?? "",
    name: displayName(user),
    joined_at: new Date().toISOString(),
  };
  await sql.getDbClient().from("workspace_members").insert(membership);
  return membership;
}

export async function removeMember(workspaceId: string, userId: string) {
  await sql.getDbClient().from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
}

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<Membership | null> {
  const { data: existing } = await sql.getDbClient().from("workspace_members").select("*").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (!existing) return null;
  const updated: Membership = { workspace_id: existing.workspace_id, user_id: existing.user_id, role, email: existing.email, name: existing.name, joined_at: existing.joined_at };
  await sql.getDbClient().from("workspace_members").update(updated).eq("workspace_id", workspaceId).eq("user_id", userId);
  return updated;
}

// Every user gets a personal default workspace on first authenticated request.
export async function ensureDefaultWorkspace(
  user: any,
): Promise<{ workspace: Workspace; membership: Membership }> {
  const ids = await listUserWorkspaceIds(user.id);
  for (const id of ids) {
    const workspace = await getWorkspace(id);
    const membership = await getMembership(id, user.id);
    if (workspace && membership) return { workspace, membership };
  }
  return await createWorkspace(user, `${displayName(user)}'s Workspace`);
}

// Resolves the active workspace for a request. A client-supplied workspace id
// is honored ONLY when the user has a membership in it (anti-IDOR); without a
// header the user's default workspace is used, so legacy clients keep working.
export async function resolveWorkspace(
  requestedId: string | null,
  user: any,
): Promise<{ workspace: Workspace; membership: Membership } | null> {
  if (requestedId) {
    const membership = await getMembership(requestedId, user.id);
    if (!membership) return null;
    const workspace = await getWorkspace(requestedId);
    if (!workspace) return null;
    return { workspace, membership };
  }
  return await ensureDefaultWorkspace(user);
}

// Deletes a workspace, its memberships, invitations, and all scoped data keys.
export async function deleteWorkspace(workspaceId: string) {
  const members = await getMembers(workspaceId);
  for (const m of members) {
    await removeFromUserIndex(m.user_id, workspaceId);
  }
  // Delete invitations via SQL CASCADE (workspace_id FK) and workspace data keys
  await sql.getDbClient().from("workspace_invitations").delete().eq("workspace_id", workspaceId);
  await kv.mdel(WORKSPACE_DATA_KEYS.map((k) => wsDataKey(workspaceId, k)));
  await kv.del(`ws_members:${workspaceId}`);
  await kv.del(`workspace:${workspaceId}`);
}

// ── Invitations (Fase 14.2) ───────────────────────────────────────────────────
// SQL table: workspace_invitations (token is unique, workspace_id FK cascade)

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  token: string;
  workspace_id: string;
  workspace_name: string;
  email: string;
  role: WorkspaceRole;
  invited_by: string;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
}

export const INVITE_TTL_DAYS = 7;

const randomToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

export async function getInvitation(token: string): Promise<Invitation | null> {
  const { data, error } = await sql.getDbClient().from("workspace_invitations").select("*").eq("token", token).maybeSingle();
  if (error || !data) return null;
  // Also fetch workspace name for the invitation object
  const { data: ws } = await sql.getDbClient().from("workspaces").select("name").eq("id", data.workspace_id).maybeSingle();
  return {
    token: data.token,
    workspace_id: data.workspace_id,
    workspace_name: ws?.name ?? "",
    email: data.email,
    role: data.role as WorkspaceRole,
    invited_by: data.invited_by,
    status: data.status as InvitationStatus,
    created_at: data.created_at,
    expires_at: data.expires_at,
  };
}

export async function saveInvitation(invitation: Invitation) {
  const now = new Date().toISOString();
  await sql.getDbClient().from("workspace_invitations").upsert({
    token: invitation.token,
    workspace_id: invitation.workspace_id,
    email: invitation.email,
    role: invitation.role,
    invited_by: invitation.invited_by,
    status: invitation.status,
    expires_at: invitation.expires_at,
    updated_at: now,
  }, { onConflict: "token" });
}

// Lazily marks a pending invitation as expired once past its expiry date.
export async function freshInvitation(
  invitation: Invitation,
): Promise<Invitation> {
  if (
    invitation.status === "pending" &&
    new Date(invitation.expires_at) < new Date()
  ) {
    const now = new Date().toISOString();
    await sql.getDbClient().from("workspace_invitations").update({
      status: "expired",
      updated_at: now,
    }).eq("token", invitation.token).eq("status", "pending");
    return { ...invitation, status: "expired" };
  }
  return invitation;
}

export async function listInvitations(
  workspaceId: string,
): Promise<Invitation[]> {
  const { data: rows, error } = await sql.getDbClient().from("workspace_invitations").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (error || !rows) return [];
  const { data: wsRow } = await sql.getDbClient().from("workspaces").select("name").eq("id", workspaceId).maybeSingle();
  const wsName = wsRow?.name ?? "";
  return rows.map((r: any) => ({
    token: r.token,
    workspace_id: r.workspace_id,
    workspace_name: wsName,
    email: r.email,
    role: r.role as WorkspaceRole,
    invited_by: r.invited_by,
    status: r.status as InvitationStatus,
    created_at: r.created_at,
    expires_at: r.expires_at,
  }));
}

export async function createInvitation(
  workspace: Workspace,
  inviter: any,
  email: string,
  role: WorkspaceRole,
): Promise<Invitation> {
  // Re-invite: revoke any previous pending invitation for the same email.
  const now = new Date();
  const expires = new Date(now);
  expires.setDate(expires.getDate() + INVITE_TTL_DAYS);
  const token = randomToken();
  const nowISO = now.toISOString();
  const expiresISO = expires.toISOString();
  const inviterName = displayName(inviter);

  // Revoke existing pending invites for this email in this workspace
  await sql.getDbClient().from("workspace_invitations").update({
    status: "revoked",
    updated_at: nowISO,
  }).eq("workspace_id", workspace.id).eq("email", email).eq("status", "pending");

  const { data: inserted } = await sql.getDbClient().from("workspace_invitations").insert({
    workspace_id: workspace.id,
    token,
    email,
    role,
    invited_by: inviterName,
    status: "pending",
    expires_at: expiresISO,
    created_at: nowISO,
    updated_at: nowISO,
  }).select().single();

  if (!inserted) throw new Error("Failed to create invitation");

  return {
    token: inserted.token,
    workspace_id: inserted.workspace_id,
    workspace_name: workspace.name,
    email: inserted.email,
    role: inserted.role as WorkspaceRole,
    invited_by: inserted.invited_by,
    status: inserted.status as InvitationStatus,
    created_at: inserted.created_at,
    expires_at: inserted.expires_at,
  };
}

// Sends the invitation email via Resend when RESEND_API_KEY is configured;
// otherwise logs the link (dev fallback — the API also returns invite_url so
// the owner can share it manually).
export async function sendInvitationEmail(
  invitation: Invitation,
  inviteUrl: string,
): Promise<boolean> {
  return emails.sendEmail(
    invitation.email,
    `${invitation.invited_by} invited you to "${invitation.workspace_name}" on LokaSync`,
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>You're invited to ${invitation.workspace_name}</h2>
      <p><strong>${invitation.invited_by}</strong> invited you to join the
      workspace <strong>${invitation.workspace_name}</strong> on LokaSync
      as a <strong>${invitation.role}</strong>.</p>
      <p><a href="${inviteUrl}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none">Accept invitation</a></p>
      <p style="color:#888;font-size:13px">This invitation expires on
      ${new Date(invitation.expires_at).toUTCString()}. If you didn't expect
      this email, you can safely ignore it.</p>
    </div>`,
  );
}
