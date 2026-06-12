import { useEffect, useState } from "react";
import { BaseModal } from "./BaseModal";
import * as api from "../../utils/api";

interface Member {
  initials: string;
  name: string;
  role: string;
  status: string;
  tasks: number;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  online: { label: "Online", color: "#10b981" },
  away: { label: "Away", color: "#f59e0b" },
  offline: { label: "Offline", color: "#525252" },
};

const avatarColors = [
  "bg-indigo-900/60 text-indigo-300",
  "bg-emerald-900/60 text-emerald-300",
  "bg-amber-900/60 text-amber-300",
  "bg-pink-900/60 text-pink-300",
  "bg-blue-900/60 text-blue-300",
  "bg-purple-900/60 text-purple-300",
];

export function MemberProfileModal({
  open,
  onClose,
  member,
  colorIndex = 0,
}: {
  open: boolean;
  onClose: () => void;
  member: Member | null;
  colorIndex?: number;
}) {
  const [memberTasks, setMemberTasks] = useState<api.Task[]>([]);

  useEffect(() => {
    if (!open || !member) return;
    api.getTasks()
      .then((tasks) => setMemberTasks(tasks.filter((t) => t.assignee === member.initials)))
      .catch(() => setMemberTasks([]));
  }, [open, member?.initials]);

  if (!member) return null;
  const status = statusConfig[member.status] ?? statusConfig.offline;
  const doneCount = memberTasks.filter((t) => t.completed || t.status === "completed").length;
  const recentActivity = memberTasks.slice(0, 5).map((t) => t.title);

  return (
    <BaseModal open={open} onClose={onClose} title="Member Profile" width="max-w-sm">
      <div className="space-y-5">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center text-[20px] font-['Lexend:SemiBold',_sans-serif] ${avatarColors[colorIndex % avatarColors.length]}`}
          >
            {member.initials}
          </div>
          <div className="text-center">
            <div className="text-neutral-50 text-[15px] font-['Lexend:SemiBold',_sans-serif]">{member.name}</div>
            <div className="text-neutral-500 text-[13px] mt-0.5">{member.role}</div>
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: status.color }} />
              <span className="text-neutral-500 text-[12px]">{status.label}</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#0f0f0f] rounded-xl p-3 text-center">
            <div className="text-neutral-50 text-[22px] font-['Lexend:SemiBold',_sans-serif]">{member.tasks}</div>
            <div className="text-neutral-500 text-[11px] mt-0.5">Open tasks</div>
          </div>
          <div className="bg-[#0f0f0f] rounded-xl p-3 text-center">
            <div className="text-neutral-50 text-[22px] font-['Lexend:SemiBold',_sans-serif]">{doneCount}</div>
            <div className="text-neutral-500 text-[11px] mt-0.5">Completed</div>
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <div className="text-neutral-400 text-[12px] mb-2">Recent activity</div>
          <div className="space-y-1.5">
            {recentActivity.length === 0 && (
              <span className="text-neutral-600 text-[12px]">No recent activity</span>
            )}
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-neutral-700 mt-1.5 shrink-0" />
                <span className="text-neutral-500 text-[12px]">{a}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
