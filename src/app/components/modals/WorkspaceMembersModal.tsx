import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BaseModal, ModalInput, ModalSelect } from "./BaseModal";
import { useAuth } from "../../auth/AuthContext";
import { useWorkspace } from "../../workspace/WorkspaceContext";
import * as api from "../../utils/api";

// Fase 14.5 — workspace members & invitations management. Owners can invite
// by email, change roles, revoke invites, and remove members; members get a
// read-only list plus the option to leave the workspace.

const roleOptions = [
  { value: "member", label: "Member" },
  { value: "owner", label: "Owner" },
];

export function WorkspaceMembersModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { activeWorkspace, isOwner, refreshWorkspaces, switchWorkspace, workspaces } =
    useWorkspace();
  const [members, setMembers] = useState<api.WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<api.WorkspaceInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  const workspaceId = activeWorkspace?.id;

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setMembers(await api.getWorkspaceMembers(workspaceId));
      if (isOwner) {
        setInvites(
          (await api.getWorkspaceInvites(workspaceId)).filter(
            (i) => i.status === "pending",
          ),
        );
      }
    } catch (e) {
      console.error("Failed to load members:", e);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, isOwner]);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const copyLink = (token: string | null) => {
    if (!token) return;
    navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
    toast.success("Invite link copied to clipboard");
  };

  const handleInvite = async () => {
    if (!workspaceId || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const created = await api.createWorkspaceInvite(workspaceId, {
        email: inviteEmail.trim(),
        role: inviteRole as api.WorkspaceRole,
      });
      toast.success(
        created.email_sent
          ? `Invitation emailed to ${created.email}`
          : `Invitation created — share the link with ${created.email}`,
      );
      copyLink(created.token);
      setInviteEmail("");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (token: string | null) => {
    if (!workspaceId || !token) return;
    try {
      await api.revokeWorkspaceInvite(workspaceId, token);
      toast.success("Invitation revoked");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke invitation");
    }
  };

  const handleRoleChange = async (memberId: string, role: api.WorkspaceRole) => {
    if (!workspaceId) return;
    try {
      await api.updateWorkspaceMemberRole(workspaceId, memberId, role);
      toast.success("Role updated");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!workspaceId) return;
    const leaving = memberId === user?.id;
    try {
      await api.removeWorkspaceMember(workspaceId, memberId);
      if (leaving) {
        toast.success("You left the workspace");
        onClose();
        await refreshWorkspaces();
        const fallback = workspaces.find((w) => w.id !== workspaceId);
        if (fallback) switchWorkspace(fallback.id);
      } else {
        toast.success("Member removed");
        await reload();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member");
    }
  };

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={`Members — ${activeWorkspace?.name ?? "Workspace"}`}
      description={
        isOwner
          ? "Invite people by email and manage their access."
          : "People with access to this workspace."
      }
      width="max-w-lg"
    >
      {isOwner && (
        <div className="mb-5 space-y-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <ModalInput
                label="Invite by email"
                placeholder="name@company.com"
                value={inviteEmail}
                onChange={setInviteEmail}
                type="email"
              />
            </div>
            <div className="w-32">
              <ModalSelect
                label="Role"
                value={inviteRole}
                onChange={setInviteRole}
                options={roleOptions}
              />
            </div>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {inviting ? "Sending…" : "Invite"}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
        <div className="text-neutral-600 text-[10px] uppercase tracking-wider mb-1.5">
          Members ({members.length})
        </div>
        {loading && members.length === 0 && (
          <div className="text-neutral-500 text-[12px] py-2">Loading…</div>
        )}
        {members.map((m) => {
          const isSelf = m.user_id === user?.id;
          const isWorkspaceOwner = m.user_id === activeWorkspace?.owner_id;
          return (
            <div
              key={m.user_id}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-neutral-800/40"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-900/60 flex items-center justify-center text-indigo-300 text-[11px] shrink-0">
                {(m.name || m.email).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-neutral-100 text-[13px] truncate">
                  {m.name} {isSelf && <span className="text-neutral-500">(you)</span>}
                </div>
                <div className="text-neutral-500 text-[11px] truncate">{m.email}</div>
              </div>
              {isOwner && !isWorkspaceOwner ? (
                <select
                  value={m.role}
                  onChange={(e) =>
                    handleRoleChange(m.user_id, e.target.value as api.WorkspaceRole)
                  }
                  className="bg-[#0f0f0f] border border-neutral-800 rounded-lg px-2 py-1 text-neutral-300 text-[12px] outline-none cursor-pointer"
                >
                  {roleOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-neutral-500 text-[11px] capitalize px-2">
                  {m.role}
                </span>
              )}
              {((isOwner && !isWorkspaceOwner) || (isSelf && !isWorkspaceOwner)) && (
                <button
                  onClick={() => handleRemove(m.user_id)}
                  className="text-red-400/80 hover:text-red-300 text-[11px] px-1 transition-colors"
                >
                  {isSelf ? "Leave" : "Remove"}
                </button>
              )}
            </div>
          );
        })}

        {isOwner && invites.length > 0 && (
          <>
            <div className="text-neutral-600 text-[10px] uppercase tracking-wider mt-4 mb-1.5">
              Pending invitations ({invites.length})
            </div>
            {invites.map((inv) => (
              <div
                key={inv.token ?? inv.email}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-neutral-800/40"
              >
                <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 text-[11px] shrink-0">
                  ✉
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-neutral-300 text-[13px] truncate">{inv.email}</div>
                  <div className="text-neutral-600 text-[11px]">
                    {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => copyLink(inv.token)}
                  className="text-indigo-300 hover:text-indigo-200 text-[11px] px-1 transition-colors"
                >
                  Copy link
                </button>
                <button
                  onClick={() => handleRevoke(inv.token)}
                  className="text-red-400/80 hover:text-red-300 text-[11px] px-1 transition-colors"
                >
                  Revoke
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </BaseModal>
  );
}
