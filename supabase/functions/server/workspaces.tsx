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

export type WorkspaceRole = "owner" | "member";

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
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
  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name,
    owner_id: user.id,
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

// Deletes a workspace, its memberships, and all scoped data keys.
export async function deleteWorkspace(workspaceId: string) {
  const members = await getMembers(workspaceId);
  for (const m of members) {
    await removeFromUserIndex(m.user_id, workspaceId);
  }
  await kv.mdel(WORKSPACE_DATA_KEYS.map((k) => wsDataKey(workspaceId, k)));
  await kv.del(`ws_members:${workspaceId}`);
  await kv.del(`workspace:${workspaceId}`);
}
