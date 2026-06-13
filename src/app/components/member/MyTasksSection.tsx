import { useState } from "react";
import { Link } from "react-router";
import { useLang } from "../../i18n";
import { ChevronRight } from "lucide-react";

interface Task {
  id: string;
  title: string;
  project: string;
  priority: string;
}

interface MyTasksSectionProps {
  inProgress: Task[];
  inReview: Task[];
  dueToday: Task[];
  completed: Task[];
}

type Tab = "in_progress" | "in_review" | "due_today" | "completed";

const priorityDot: Record<string, string> = {
  high: "bg-red-400",
  medium: "bg-amber-400",
  low: "bg-emerald-400",
};

export function MyTasksSection({
  inProgress,
  inReview,
  dueToday,
  completed,
}: MyTasksSectionProps) {
  const { t } = useLang();
  const [activeTab, setActiveTab] = useState<Tab>("in_progress");

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "in_progress", label: t("memberHome.inProgress"), count: inProgress.length },
    { key: "in_review", label: t("memberHome.inReview"), count: inReview.length },
    { key: "due_today", label: t("memberHome.dueSoon"), count: dueToday.length },
    { key: "completed", label: t("memberHome.completed"), count: completed.length },
  ];

  const tabData: Record<Tab, Task[]> = {
    in_progress: inProgress,
    in_review: inReview,
    due_today: dueToday,
    completed,
  };

  const tasks = tabData[activeTab];

  return (
    <div className="rounded-xl border border-neutral-800 bg-[#1a1a1a]/80 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-neutral-200 text-xs font-['Lexend:SemiBold',_sans-serif]">
            {t("memberHome.myTasks")}
          </span>
          <Link
            to="/app/tasks"
            className="flex items-center gap-1 text-indigo-400 text-[11px] hover:text-indigo-300 transition-colors cursor-pointer"
          >
            <span>{t("memberHome.viewAllTasks")}</span>
            <ChevronRight size={11} />
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-neutral-800/60">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 pb-2.5 text-[11px] font-['Lexend:Medium',_sans-serif] transition-colors relative cursor-pointer
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50
                ${
                  activeTab === tab.key
                    ? "text-indigo-400"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1 text-[10px] text-neutral-600">({tab.count})</span>
              )}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="px-4 py-3 divide-y divide-neutral-800/40">
        {tasks.length === 0 ? (
          <p className="text-neutral-600 text-xs py-2">—</p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0"
            >
              <div
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  priorityDot[task.priority] ?? "bg-neutral-500"
                }`}
              />
              <span className="flex-1 text-neutral-300 text-xs truncate">
                {task.title}
              </span>
              <span className="text-neutral-600 text-[10px] shrink-0 hidden sm:block">
                {task.project}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}