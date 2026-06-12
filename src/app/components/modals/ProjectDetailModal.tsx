import { BaseModal } from "./BaseModal";
import type { Project } from "./NewProjectModal";

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "#10b981" },
  paused: { label: "Paused", color: "#f59e0b" },
  completed: { label: "Completed", color: "#6366f1" },
};

export function ProjectDetailModal({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project: Project | null;
}) {
  if (!project) return null;
  const status = statusConfig[project.status];

  return (
    <BaseModal open={open} onClose={onClose} title={project.name} width="max-w-lg">
      <div className="space-y-5">
        {/* Status + tags */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[12px] px-2.5 py-1 rounded-full"
            style={{ color: status.color, backgroundColor: `${status.color}22` }}
          >
            {status.label}
          </span>
          {project.tags.map((tag) => (
            <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
              {tag}
            </span>
          ))}
        </div>

        {/* Description */}
        <p className="text-neutral-400 text-[13px] leading-relaxed">{project.description}</p>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-neutral-400 text-[12px]">Progress</span>
            <span className="text-neutral-300 text-[12px]">{project.progress}%</span>
          </div>
          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total tasks", value: project.tasks.total },
            { label: "Completed", value: project.tasks.done },
            { label: "Remaining", value: project.tasks.total - project.tasks.done },
          ].map((s) => (
            <div key={s.label} className="bg-[#0f0f0f] rounded-xl p-3 text-center">
              <div className="text-neutral-50 text-[20px] font-['Lexend:SemiBold',_sans-serif]">{s.value}</div>
              <div className="text-neutral-500 text-[11px] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Team + due */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-800/40">
          <div className="flex -space-x-1.5">
            {project.team.map((m) => (
              <div key={m} className="w-7 h-7 rounded-full bg-neutral-700 border border-[#141414] flex items-center justify-center text-[11px] text-neutral-300">
                {m}
              </div>
            ))}
          </div>
          <span className="text-neutral-500 text-[12px]">Due {project.due}</span>
        </div>
      </div>
    </BaseModal>
  );
}
