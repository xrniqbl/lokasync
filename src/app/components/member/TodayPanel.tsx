import { Link } from "react-router";
import { useLang } from "../../i18n";
import { CalendarDays, ChevronRight } from "lucide-react";

interface TodayEvent {
  id: string;
  title: string;
  time: string;
  color: string;
}

interface DueTask {
  id: string;
  title: string;
  project: string;
  priority: string;
}

interface TodayPanelProps {
  events: TodayEvent[];
  dueTasks: DueTask[];
}

const priorityColor: Record<string, string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-emerald-400",
};

export function TodayPanel({ events, dueTasks }: TodayPanelProps) {
  const { t } = useLang();

  return (
    <div className="flex flex-col gap-4">
      {/* Events card */}
      <div className="rounded-xl border border-neutral-800 bg-[#1a1a1a]/80 p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays size={14} className="text-indigo-400" />
          <span className="text-neutral-200 text-xs font-['Lexend:SemiBold',_sans-serif]">
            {t("memberHome.events")}
          </span>
        </div>

        {events.length === 0 ? (
          <p className="text-neutral-600 text-xs">{t("memberHome.noEventsToday")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2.5">
                <div
                  className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: ev.color || "#6366f1" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-neutral-300 text-xs leading-tight">{ev.title}</p>
                  <p className="text-neutral-600 text-[10px] mt-0.5">{ev.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Due Tasks card */}
      <div className="rounded-xl border border-neutral-800 bg-[#1a1a1a]/80 p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays size={14} className="text-amber-400" />
          <span className="text-neutral-200 text-xs font-['Lexend:SemiBold',_sans-serif]">
            {t("memberHome.dueTasks")}
          </span>
        </div>

        {dueTasks.length === 0 ? (
          <p className="text-neutral-600 text-xs">{t("memberHome.noDueTasks")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {dueTasks.map((task) => (
              <div key={task.id} className="flex items-start gap-2.5">
                <div
                  className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${priorityColor[task.priority] ?? "bg-neutral-500"}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-neutral-300 text-xs leading-tight">{task.title}</p>
                  <p className="text-neutral-600 text-[10px] mt-0.5">{task.project}</p>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                    task.priority === "high"
                      ? "bg-red-950/50 text-red-400"
                      : task.priority === "medium"
                      ? "bg-amber-950/50 text-amber-400"
                      : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {task.priority}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View Calendar link */}
      <Link
        to="/app/calendar"
        className="flex items-center justify-center gap-1.5 py-2 text-indigo-400 text-xs hover:text-indigo-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded-lg"
      >
        <CalendarDays size={12} />
        <span>{t("memberHome.viewCalendar")}</span>
        <ChevronRight size={12} />
      </Link>
    </div>
  );
}