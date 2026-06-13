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
  return (await kv.get(`workspace:${id}`)) ?? null;
}

export async function getMembers(workspaceId: string): Promise<Membership[]> {
  return (await kv.get(`ws_members:${workspaceId}`)) ?? [];
}

export async function getMembership(
  workspaceId: string,
  userId: string,
): Promise<Membership | null> {
  const members = await getMembers(workspaceId);
  return members.find((m) => m.user_id === userId) ?? null;
}

export async function listUserWorkspaceIds(userId: string): Promise<string[]> {
  return (await kv.get(`user_ws:${userId}`)) ?? [];
}

async function addToUserIndex(userId: string, workspaceId: string) {
  const ids = await listUserWorkspaceIds(userId);
  if (!ids.includes(workspaceId)) {
    await kv.set(`user_ws:${userId}`, [...ids, workspaceId]);
  }
}

async function removeFromUserIndex(userId: string, workspaceId: string) {
  const ids = await listUserWorkspaceIds(userId);
  await kv.set(`user_ws:${userId}`, ids.filter((id) => id !== workspaceId));
}

const displayName = (user: any) =>
  user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

export async function createWorkspace(
  user: any,
  name: string,
): Promise<{ workspace: Workspace; membership: Membership }> {
  const now = new Date().toISOString();
  // Copy owner's current subscription plan into the workspace
  const subscription = await kv.get(`subscription:${user.id}`);
  const ownerPlan = subscription?.status === "active" ? subscription.plan_id : "free";
  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name,
    owner_id: user.id,
    plan_id: ownerPlan,
    created_at: now,
    updated_at: now,
  };
  const membership: Membership = {
    workspace_id: workspace.id,
    user_id: user.id,
    role: "owner",
    email: user.email ?? "",
    name: displayName(user),
    joined_at: now,
  };
  await kv.set(`workspace:${workspace.id}`, workspace);
  await kv.set(`ws_members:${workspace.id}`, [membership]);
  await addToUserIndex(user.id, workspace.id);
  return { workspace, membership };
}

// Syncs plan_id on all workspaces owned by userId to the given plan.
export async function syncWorkspacePlans(userId: string, planId: string) {
  const ids = await listUserWorkspaceIds(userId);
  for (const id of ids) {
    const workspace = await getWorkspace(id);
    if (workspace && workspace.owner_id === userId) {
      workspace.plan_id = planId;
      workspace.updated_at = new Date().toISOString();
      await kv.set(`workspace:${id}`, workspace);
    }
  }
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
  const members = await getMembers(workspaceId);
  const existing = members.find((m) => m.user_id === user.id);
  if (existing) return existing;
  const membership: Membership = {
    workspace_id: workspaceId,
    user_id: user.id,
    role,
    email: user.email ?? "",
    name: displayName(user),
    joined_at: new Date().toISOString(),
  };
  await kv.set(`ws_members:${workspaceId}`, [...members, membership]);
  await addToUserIndex(user.id, workspaceId);
  return membership;
}

export async function removeMember(workspaceId: string, userId: string) {
  const members = await getMembers(workspaceId);
  await kv.set(
    `ws_members:${workspaceId}`,
    members.filter((m) => m.user_id !== userId),
  );
  await removeFromUserIndex(userId, workspaceId);
}

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<Membership | null> {
  const members = await getMembers(workspaceId);
  const idx = members.findIndex((m) => m.user_id === userId);
  if (idx === -1) return null;
  members[idx] = { ...members[idx], role };
  await kv.set(`ws_members:${workspaceId}`, members);
  return members[idx];
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
  const tokens: string[] = (await kv.get(`ws_invites:${workspaceId}`)) ?? [];
  if (tokens.length) {
    await kv.mdel(tokens.map((t) => `ws_invite:${t}`));
    await kv.del(`ws_invites:${workspaceId}`);
  }
  await kv.mdel(WORKSPACE_DATA_KEYS.map((k) => wsDataKey(workspaceId, k)));
  await kv.del(`ws_members:${workspaceId}`);
  await kv.del(`workspace:${workspaceId}`);
}

// ── Invitations (Fase 14.2) ───────────────────────────────────────────────────
// KV layout:
//   ws_invite:{token}      → Invitation (single-use, expiring token)
//   ws_invites:{wsId}      → string[] (tokens issued for the workspace)

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
  return (await kv.get(`ws_invite:${token}`)) ?? null;
}

export async function saveInvitation(invitation: Invitation) {
  await kv.set(`ws_invite:${invitation.token}`, invitation);
}

// Lazily marks a pending invitation as expired once past its expiry date.
export async function freshInvitation(
  invitation: Invitation,
): Promise<Invitation> {
  if (
    invitation.status === "pending" &&
    new Date(invitation.expires_at) < new Date()
  ) {
    const expired = { ...invitation, status: "expired" as InvitationStatus };
    await saveInvitation(expired);
    return expired;
  }
  return invitation;
}

export async function listInvitations(
  workspaceId: string,
): Promise<Invitation[]> {
  const tokens: string[] = (await kv.get(`ws_invites:${workspaceId}`)) ?? [];
  const items: Invitation[] = [];
  for (const token of tokens) {
    const invitation = await getInvitation(token);
    if (invitation) items.push(await freshInvitation(invitation));
  }
  return items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function createInvitation(
  workspace: Workspace,
  inviter: any,
  email: string,
  role: WorkspaceRole,
): Promise<Invitation> {
  // Re-invite: revoke any previous pending invitation for the same email.
  const existing = await listInvitations(workspace.id);
  for (const inv of existing) {
    if (inv.status === "pending" && inv.email === email) {
      await saveInvitation({ ...inv, status: "revoked" });
    }
  }
  const now = new Date();
  const expires = new Date(now);
  expires.setDate(expires.getDate() + INVITE_TTL_DAYS);
  const invitation: Invitation = {
    token: randomToken(),
    workspace_id: workspace.id,
    workspace_name: workspace.name,
    email,
    role,
    invited_by: displayName(inviter),
    status: "pending",
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };
  await saveInvitation(invitation);
  const tokens: string[] = (await kv.get(`ws_invites:${workspace.id}`)) ?? [];
  await kv.set(`ws_invites:${workspace.id}`, [...tokens, invitation.token]);
  return invitation;
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
