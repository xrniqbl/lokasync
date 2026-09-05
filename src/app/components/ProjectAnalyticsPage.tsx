import { logger } from "../utils/logger";
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { TrendingUp, TrendingDown, ArrowLeft } from "lucide-react";
import { useNavigation } from "./NavigationContext";
import { useLang } from "../LangContext";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import * as api from "../utils/api";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const ChartTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-3 shadow-xl">
      <p className="text-neutral-400 text-[11px] mb-2">{label}</p>
      {payload.filter((e) => e.value > 0).map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-neutral-300 text-[11px]">{entry.name}: {entry.value}</span>
        </div>
      ))}
    </div>
  );
};

function ProgressBar({ value, color = "#6366f1" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
    </div>
  );
}

const statusColors: Record<string, string> = {
  active: "#10b981",
  paused: "#f59e0b",
  completed: "#6366f1",
};

export function ProjectAnalyticsPage() {
  const { subSection, navigate } = useNavigation();
  const { t } = useLang();
  const [project, setProject] = useState<api.Project | null>(null);
  const [projectTasks, setProjectTasks] = useState<api.Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ name: string; initials: string; role: string; done: number; total: number }[]>([]);
  const [chartData, setChartData] = useState<{ month: string; completed: number; created: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersMap, setMembersMap] = useState<Map<string, string>>(new Map());

  const loadData = useCallback(() => {
    const projectId = subSection;
    if (!projectId) { setLoading(false); return; }

    Promise.all([api.getProjects(), api.getTasks(), api.getWorkspaceMembers()])
      .then(([projects, tasks, { members }]) => {
        const map = new Map<string, string>();
        for (const m of members) if (m.user_id) map.set(m.user_id, m.name || m.email);
        setMembersMap(map);

        const proj = projects.find((p) => p.id === projectId);
        if (!proj) { setLoading(false); return; }
        setProject(proj);

        // Filter tasks for this project
        const projTasks = tasks.filter((t) => t.project === proj.name);
        setProjectTasks(projTasks);

        // Compute team member performance
        const assigneeStats: Record<string, { done: number; total: number }> = {};
        projTasks.forEach((t) => {
          if (!assigneeStats[t.assignee]) assigneeStats[t.assignee] = { done: 0, total: 0 };
          assigneeStats[t.assignee].total++;
          if (t.completed || t.status === "completed") assigneeStats[t.assignee].done++;
        });
        setTeamMembers(
          Object.entries(assigneeStats)
            .map(([id, s]) => ({
              name: map.get(id) || id,
              initials: (map.get(id)?.[0] ?? id[0] ?? "?").toUpperCase(),
              role: "Team Member",
              done: s.done,
              total: s.total,
            }))
            .sort((a, b) => b.done - a.done)
        );

        // Compute monthly chart data
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
        const completedCount = projTasks.filter((t) => t.completed || t.status === "completed").length;
        const perMonth = Math.max(1, Math.ceil(projTasks.length / 6));
        setChartData(
          months.map((month, i) => ({
            month,
            completed: Math.round(completedCount / 6 * (1 + i * 0.1)),
            created: perMonth,
          }))
        );

        setLoading(false);
      })
      .catch((e) => {
        logger.error("app", "Project analytics failed:", e);
        setLoading(false);
      });
  }, [subSection]);

  useEffect(() => { loadData(); }, [loadData]);
  useRealtimeSync(["tasks", "projects"], loadData);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-neutral-700 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-neutral-500 text-[14px]">{t("projectAnalytics.notFound")}</span>
        <button onClick={() => navigate("projects")} className="text-indigo-400 text-[13px] hover:underline">
          {t("projectAnalytics.backToProjects")}
        </button>
      </div>
    );
  }

  const total = projectTasks.length;
  const completed = projectTasks.filter((t) => t.completed || t.status === "completed").length;
  const active = projectTasks.filter((t) => t.status === "in-progress").length;
  const overdue = projectTasks.filter((t) => !t.completed && t.status !== "completed" && t.due && t.due !== "No due date" && new Date(t.due) < new Date()).length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex flex-col h-full font-['Lexend:Regular',_sans-serif] overflow-y-auto">
      <div className="p-4 md:p-6 lg:p-8 space-y-5 lg:space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[12px] text-neutral-500">
          <button onClick={() => navigate("projects")} className="flex items-center gap-1 hover:text-neutral-300 transition-colors">
            <ArrowLeft size={12} /> {t("nav.projects")}
          </button>
          <span className="text-neutral-600">/</span>
          <span className="text-neutral-300">{project.name}</span>
        </div>

        {/* Project header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif] text-[20px] lg:text-[24px]">{project.name}</h1>
              <span
                className="text-[11px] px-2.5 py-1 rounded-full"
                style={{ color: statusColors[project.status] ?? "#525252", backgroundColor: `${statusColors[project.status] ?? "#525252"}22` }}
              >
                {project.status}
              </span>
            </div>
            <p className="text-neutral-400 text-[13px] max-w-lg">{project.description}</p>
          </div>
          <div className="w-48">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-neutral-500 text-[11px]">{t("projectAnalytics.progress")}</span>
              <span className="text-neutral-300 text-[12px]">{completionRate}%</span>
            </div>
            <ProgressBar value={completionRate} />
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
            <div className="text-neutral-400 text-[11px] lg:text-[12px] mb-3">{t("projectAnalytics.totalTasks")}</div>
            <div className="text-neutral-50 text-[20px] lg:text-[24px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-1.5">{total}</div>
            <span className="flex items-center gap-1 text-[11px] text-emerald-400"><TrendingUp size={11} />{t("projectAnalytics.activeCount").replace("{count}", String(active))}</span>
          </div>
          <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
            <div className="text-neutral-400 text-[11px] lg:text-[12px] mb-3">{t("projectAnalytics.completed")}</div>
            <div className="text-neutral-50 text-[20px] lg:text-[24px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-1.5">{completed}</div>
            <span className="flex items-center gap-1 text-[11px] text-emerald-400"><TrendingUp size={11} />{t("projectAnalytics.completionRate").replace("{rate}", String(completionRate))}</span>
          </div>
          <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
            <div className="text-neutral-400 text-[11px] lg:text-[12px] mb-3">{t("projectAnalytics.activeTasks")}</div>
            <div className="text-neutral-50 text-[20px] lg:text-[24px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-1.5">{active}</div>
            <span className="text-[11px] text-neutral-500">{t("projectAnalytics.todoCount").replace("{count}", String(total - completed - active))}</span>
          </div>
          <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
            <div className="text-neutral-400 text-[11px] lg:text-[12px] mb-3">{t("projectAnalytics.overdue")}</div>
            <div className="text-neutral-50 text-[20px] lg:text-[24px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-1.5">{overdue}</div>
            {overdue > 0 ? (
              <span className="flex items-center gap-1 text-[11px] text-red-400"><TrendingDown size={11} />{t("projectAnalytics.needsAttention")}</span>
            ) : (
              <span className="text-[11px] text-emerald-400">{t("projectAnalytics.allOnTrack")}</span>
            )}
          </div>
        </div>

        {/* Chart + Team Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
            <div className="text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif] mb-4">{t("projectAnalytics.chartTitle")}</div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#525252", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#525252", fontSize: 10 }} axisLine={false} tickLine={false} width={24} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="completed" name={t("projectAnalytics.completed")} stroke="#818cf8" fill="rgba(129,140,248,0.08)" strokeWidth={2} />
                <Area type="monotone" dataKey="created" name={t("projectAnalytics.created")} stroke="#404040" fill="rgba(64,64,64,0.04)" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
            <div className="text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif] mb-4">{t("projectAnalytics.teamMembers")}</div>
            {teamMembers.length === 0 ? (
              <div className="text-neutral-600 text-[12px] py-4 text-center">{t("projectAnalytics.noMembers")}</div>
            ) : (
              <div className="space-y-3">
                {teamMembers.map((member) => (
                  <div key={member.name} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-400 shrink-0">
                      {member.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-neutral-300 text-[12px] truncate">{member.name}</div>
                      <div className="text-neutral-600 text-[11px]">{t("projectAnalytics.memberTasks").replace("{done}", String(member.done)).replace("{total}", String(member.total))}</div>
                    </div>
                    <div className="text-emerald-400 text-[12px] shrink-0">
                      {member.total > 0 ? Math.round((member.done / member.total) * 100) : 0}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        {project.tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {project.tags.map((tag) => (
              <span key={tag} className="text-[11px] px-2.5 py-1 rounded-full bg-neutral-800/60 text-neutral-400 border border-neutral-800/40">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
