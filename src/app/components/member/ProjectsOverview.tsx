import { Link } from "react-router";
import { useLang } from "../../i18n";
import { ChevronRight, FolderKanban } from "lucide-react";

interface Project {
  id: string;
  name: string;
  total_tasks: number;
  completed_tasks: number;
  progress_percent: number;
  next_milestone: string;
}

interface ProjectsOverviewProps {
  projects: Project[];
}

export function ProjectsOverview({ projects }: ProjectsOverviewProps) {
  const { t } = useLang();

  return (
    <div className="rounded-xl border border-neutral-800 bg-[#1a1a1a]/80 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-neutral-200 text-xs font-['Lexend:SemiBold',_sans-serif]">
            {t("memberHome.projects")}
          </span>
          <Link
            to="/app/projects"
            className="flex items-center gap-1 text-indigo-400 text-[11px] hover:text-indigo-300 transition-colors cursor-pointer"
          >
            <span>{t("memberHome.viewAllProjects")}</span>
            <ChevronRight size={11} />
          </Link>
        </div>
      </div>

      {/* Project cards */}
      <div className="px-4 pb-4 flex flex-col gap-3">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-neutral-600">
            <FolderKanban size={20} className="mb-2 opacity-50" />
            <p className="text-xs">No projects yet</p>
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className="p-3 rounded-lg bg-neutral-800/30 border border-neutral-800 hover:border-indigo-500/20 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-neutral-200 text-xs font-['Lexend:Medium',_sans-serif] leading-tight">
                  {project.name}
                </span>
                {project.next_milestone && (
                  <span className="text-neutral-600 text-[10px] shrink-0 ml-2">
                    {project.next_milestone}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${Math.min(project.progress_percent, 100)}%` }}
                />
              </div>

              {/* Task count */}
              <div className="flex items-center gap-1">
                <span className="text-neutral-400 text-[10px]">
                  {project.completed_tasks}/{project.total_tasks} tasks
                </span>
                <span className="text-neutral-700">·</span>
                <span className="text-indigo-400 text-[10px]">
                  {project.progress_percent}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}