import { logger } from "../../utils/logger";
import { useState } from "react";
import { toast } from "sonner";
import { useLang } from "../../LangContext";
import { BaseModal } from "./BaseModal";

interface Member {
  initials: string;
  name: string;
  role: string;
  status: string;
  tasks: number;
}

interface ManageTeamModalProps {
  open: boolean;
  onClose: () => void;
  teamName: string;
  members: Member[];
  onRemove?: (teamName: string, initials: string) => Promise<void>;
}

const statusDot: Record<string, string> = {
  online: "#10b981",
  away: "#f59e0b",
  offline: "#404040",
};

export function ManageTeamModal({ open, onClose, teamName, members, onRemove }: ManageTeamModalProps) {
  const { t } = useLang();
  const [list, setList] = useState(members);
  const [removing, setRemoving] = useState<string | null>(null);

  const remove = async (initials: string, name: string) => {
    setRemoving(initials);
    try {
      if (onRemove) await onRemove(teamName, initials);
      setList((prev) => prev.filter((m) => m.initials !== initials));
      toast.success(`${name} removed from ${teamName}`);
    } catch (e) {
      logger.error("app", "Failed to remove member:", e);
      toast.error(t("invite.failedToRemove"));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <BaseModal open={open} onClose={onClose} title={`Manage — ${teamName}`} description="View and remove team members" width="max-w-lg">
      <div className="space-y-1">
        {list.map((member) => (
          <div key={member.initials} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-neutral-800/20 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-[12px] text-neutral-300 shrink-0">
                {member.initials}
              </div>
              <div>
                <div className="text-neutral-200 text-[13px]">{member.name}</div>
                <div className="text-neutral-500 text-[12px]">{member.role} · {member.tasks} tasks</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusDot[member.status] ?? "#404040" }} />
                <span className="text-neutral-600 text-[11px] capitalize">{member.status}</span>
              </div>
              <button
                onClick={() => remove(member.initials, member.name)}
                disabled={removing === member.initials}
                className="text-neutral-600 hover:text-red-400 text-[12px] px-2 py-1 rounded transition-colors hover:bg-red-950/30 disabled:opacity-50"
              >
                {removing === member.initials ? "..." : "Remove"}
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="text-center py-8 text-neutral-600 text-[13px]">No members in this team</div>
        )}
      </div>
    </BaseModal>
  );
}
