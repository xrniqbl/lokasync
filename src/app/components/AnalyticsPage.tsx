import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useNavigation } from "./NavigationContext";
import * as api from "../utils/api";
import type { AnalyticsMetrics } from "../utils/api";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-3">
        <p className="text-neutral-400 text-[11px] mb-2">{label}</p>
        {payload.filter((e) => e.value > 0).map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-neutral-300 text-[11px]">{entry.name}: {entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

type AnalyticsView =
  | "performance"
  | "task-completion"
  | "productivity"
  | "key-metrics"
  | "top-performers"
  | "analytics-task-metrics"
  | "analytics-time-tracking"
  | "analytics-team-efficiency"
  | "analytics-benchmarks";

const viewLabels: Record<AnalyticsView, string> = {
  performance: "Performance Report",
  "task-completion": "Task Completion",
  productivity: "Team Productivity",
  "key-metrics": "Key Metrics",
  "top-performers": "Top Performers",
  "analytics-task-metrics": "Task Completion Metrics",
  "analytics-time-tracking": "Time Tracking Analysis",
  "analytics-team-efficiency": "Team Efficiency Report",
  "analytics-benchmarks": "Performance Benchmarks",
};

export function AnalyticsPage() {
  const { subSection } = useNavigation();
  const [period, setPeriod] = useState("Last 8 weeks");
  const [activeView, setActiveView] = useState<AnalyticsView>("performance");
  const [liveDistribution, setLiveDistribution] = useState<{ name: string; value: number; color: string }[]>([]);
  const [livePerformers, setLivePerformers] = useState<{ name: string; initials: string; tasks: number; rate: number }[]>([]);
  const [liveMetrics, setLiveMetrics] = useState<{ total: number; completed: number; inProgress: number; todo: number } | null>(null);
  const [analyticsMetrics, setAnalyticsMetrics] = useState<AnalyticsMetrics | null>(null);
  const periodKey = period === "Last 8 weeks" ? "8w" : period === "Last 3 months" ? "3m" : "qtr";
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;

  useEffect(() => {
    // Fetch tasks for live KPI cards, distribution, performers
    api.getTasks().then((tasks) => {
      const total = tasks.length;
      const completed = tasks.filter((t) => t.status === "completed" || t.completed).length;
      const inProgress = tasks.filter((t) => t.status === "in-progress").length;
      const todo = tasks.filter((t) => t.status === "todo").length;
      setLiveMetrics({ total, completed, inProgress, todo });

      const projectCounts: Record<string, number> = {};
      tasks.forEach((t) => { projectCounts[t.project] = (projectCounts[t.project] ?? 0) + 1; });
      const colors = ["#6366f1", "#8b5cf6", "#10b981", "#f59e0b", "#3b82f6", "#ef4444"];
      const dist = Object.entries(projectCounts).map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }));
      setLiveDistribution(dist);

      const assigneeStats: Record<string, { name: string; initials: string; completed: number; total: number }> = {};
      tasks.forEach((t) => {
        if (!assigneeStats[t.assignee]) assigneeStats[t.assignee] = { name: t.assignee, initials: t.assignee, completed: 0, total: 0 };
        assigneeStats[t.assignee].total++;
        if (t.status === "completed" || t.completed) assigneeStats[t.assignee].completed++;
      });
      const performers = Object.values(assigneeStats)
        .map((s) => ({ name: s.name, initials: s.initials, tasks: s.total, rate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0 }))
        .sort((a, b) => b.tasks - a.tasks).slice(0, 5);
      setLivePerformers(performers);
    }).catch((e) => console.log("Analytics failed to load tasks:", e));

    // Fetch analytics aggregate metrics from Supabase
    api.getAnalyticsMetrics().then(setAnalyticsMetrics)
      .catch((e) => console.log("Analytics failed to load metrics:", e));
  }, []);

  useEffect(() => {
    const validViews: AnalyticsView[] = [
      "performance", "task-completion", "productivity", "key-metrics", "top-performers",
      "analytics-task-metrics", "analytics-time-tracking", "analytics-team-efficiency", "analytics-benchmarks",
    ];
    if (validViews.includes(subSection as AnalyticsView)) {
      setActiveView(subSection as AnalyticsView);
    }
  }, [subSection]);

  const handleExport = () => {
    toast.success("Report exported as PDF");
  };

  return (
    <div className="flex flex-col h-full font-['Lexend:Regular',_sans-serif] overflow-y-auto">
      <div className="p-4 md:p-6 lg:p-8 space-y-5 lg:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif] text-[18px] lg:text-[22px] leading-tight mb-1">{viewLabels[activeView]}</h1>
            <p className="text-neutral-500 text-[12px] lg:text-[13px]">Performance overview · Q{q} {now.getFullYear()}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-[12px] lg:text-[13px] px-2 lg:px-3 py-2 rounded-lg appearance-none cursor-pointer outline-none"
            >
              <option>Last 8 weeks</option>
              <option>Last 3 months</option>
              <option>This quarter</option>
            </select>
            <button onClick={handleExport} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 text-[12px] lg:text-[13px] px-3 py-2 rounded-lg transition-colors">Export</button>
          </div>
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {(Object.keys(viewLabels) as AnalyticsView[]).map((v) => (
            <button key={v} onClick={() => setActiveView(v)}
              className={`px-3 py-1.5 rounded-lg text-[12px] lg:text-[13px] whitespace-nowrap transition-colors ${activeView === v ? "bg-neutral-800 text-neutral-50" : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/40"}`}>
              {viewLabels[v]}
            </button>
          ))}
        </div>

        {/* KPI Cards — performance, key-metrics, performance view */}
        {(activeView === "performance" || activeView === "key-metrics") && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            {liveMetrics ? (
              <>
                <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
                  <div className="text-neutral-400 text-[11px] lg:text-[12px] mb-3">Total Tasks</div>
                  <div className="text-neutral-50 text-[20px] lg:text-[24px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-1.5">{liveMetrics.total}</div>
                  <span className="text-[11px] text-emerald-400">{liveMetrics.inProgress} active</span>
                </div>
                <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
                  <div className="text-neutral-400 text-[11px] lg:text-[12px] mb-3">Completion Rate</div>
                  <div className="text-neutral-50 text-[20px] lg:text-[24px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-1.5">{liveMetrics.total > 0 ? Math.round((liveMetrics.completed / liveMetrics.total) * 100) : 0}%</div>
                  <span className="text-[11px] text-emerald-400">{liveMetrics.completed} completed</span>
                </div>
                <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
                  <div className="text-neutral-400 text-[11px] lg:text-[12px] mb-3">In Progress</div>
                  <div className="text-neutral-50 text-[20px] lg:text-[24px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-1.5">{liveMetrics.inProgress}</div>
                  <span className="text-[11px] text-neutral-500">{liveMetrics.todo} still todo</span>
                </div>
                <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
                  <div className="text-neutral-400 text-[11px] lg:text-[12px] mb-3">Projects</div>
                  <div className="text-neutral-50 text-[20px] lg:text-[24px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-1.5">{liveDistribution.length}</div>
                  <span className="text-[11px] text-neutral-500">active projects</span>
                </div>
              </>
            ) : [0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5 h-[110px] animate-pulse" />
            ))}
          </div>
        )}

        {/* Task Completion chart */}
        {(activeView === "performance" || activeView === "task-completion") && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
              <div className="flex items-center justify-between mb-4 lg:mb-5 flex-wrap gap-2">
                <div>
                  <div className="text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif]">Task Completion</div>
                  <div className="text-neutral-500 text-[11px] lg:text-[12px] mt-0.5">Actual vs. target · {period}</div>
                </div>
                <div className="flex items-center gap-3 lg:gap-4">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-400" /><span className="text-neutral-500 text-[11px]">Actual</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-[2px] bg-neutral-600" /><span className="text-neutral-500 text-[11px]">Target</span></div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={analyticsMetrics?.completionSeries?.[periodKey] ?? []} barSize={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: "#525252", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#525252", fontSize: 10 }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="completed" name="Actual" fill="#818cf8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="target" name="Target" fill="#262626" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
              <div className="mb-4">
                <div className="text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif]">Task Distribution</div>
                <div className="text-neutral-500 text-[11px] lg:text-[12px] mt-0.5">By team</div>
              </div>
              <div className="flex justify-center mb-3">
                <ResponsiveContainer width={130} height={130}>
                  <PieChart>
                    <Pie data={liveDistribution} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value">
                      {liveDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {liveDistribution.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-neutral-400 text-[12px]">{item.name}</span>
                    </div>
                    <span className="text-neutral-300 text-[12px]">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Productivity chart */}
        {(activeView === "performance" || activeView === "productivity") && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
              <div className="flex items-center justify-between mb-4 lg:mb-5 flex-wrap gap-2">
                <div>
                  <div className="text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif]">Team Productivity</div>
                  <div className="text-neutral-500 text-[11px] lg:text-[12px] mt-0.5">Efficiency score · {period}</div>
                </div>
                <div className="flex items-center gap-3">
                  {[{ color: "#818cf8", label: "Dev" }, { color: "#a78bfa", label: "Design" }, { color: "#34d399", label: "QA" }].map((l) => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                      <span className="text-neutral-500 text-[11px]">{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={analyticsMetrics?.productivitySeries?.[periodKey] ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "#525252", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#525252", fontSize: 10 }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="dev" name="Dev" stroke="#818cf8" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                  <Line type="monotone" dataKey="design" name="Design" stroke="#a78bfa" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                  <Line type="monotone" dataKey="qa" name="QA" stroke="#34d399" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
              <div className="text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif] mb-4">Efficiency Scores</div>
              <div className="space-y-3">
                {(analyticsMetrics?.efficiencyScores ?? []).map((t) => (
                  <div key={t.team}>
                    <div className="flex justify-between text-[12px] mb-1.5">
                      <span className="text-neutral-400">{t.team}</span>
                      <span className="text-neutral-300">{t.score}%</span>
                    </div>
                    <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${t.score}%`, backgroundColor: t.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top performers — standalone view */}
        {(activeView === "performance" || activeView === "top-performers") && (
          <div className={activeView === "top-performers" ? "" : "grid grid-cols-1 lg:grid-cols-3 gap-4"}>
            <div className={`bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5 ${activeView === "top-performers" ? "" : ""}`}>
              <div className="text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif] mb-4">Top Performers</div>
              <div className="space-y-3">
                {livePerformers.map((p, i) => (
                  <div key={p.initials} className="flex items-center gap-3">
                    <span className="text-neutral-600 text-[11px] w-4 shrink-0">{i + 1}</span>
                    <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-[11px] text-neutral-400 shrink-0">{p.initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-neutral-300 text-[12px] truncate">{p.name}</div>
                      <div className="text-neutral-600 text-[11px]">{p.tasks} tasks</div>
                    </div>
                    <div className="text-emerald-400 text-[12px] shrink-0">{p.rate}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Task Completion Metrics */}
        {activeView === "analytics-task-metrics" && (() => {
          const total = liveMetrics?.total ?? 0;
          const completed = liveMetrics?.completed ?? 0;
          const inProgress = liveMetrics?.inProgress ?? 0;
          const todo = liveMetrics?.todo ?? 0;
          const review = Math.max(0, total - completed - inProgress - todo);
          const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
          const completionData = (analyticsMetrics?.completionSeries?.[periodKey] ?? []).map((d, i, arr) => ({
            ...d,
            completed: i === arr.length - 1 && completed > 0 ? Math.min(completed, 40) : d.completed,
          }));
          const taskMetricCards = [
            { label: "Completion Rate", value: `${completionRate}%`, change: analyticsMetrics?.taskMetrics?.completionChange ?? "", note: "vs last period" },
            { label: "Avg. Cycle Time", value: analyticsMetrics?.taskMetrics?.avgCycleTime ?? "—", change: analyticsMetrics?.taskMetrics?.cycleChange ?? "", note: "vs last period" },
            { label: "Tasks Closed", value: `${completed}`, change: "", note: "this quarter" },
            { label: "Overdue Tasks", value: `${todo}`, change: analyticsMetrics?.taskMetrics?.overdueChange ?? "", note: "vs last period" },
          ];
          const statusRows = [
            { label: "Completed", count: completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 },
            { label: "In Progress", count: inProgress, pct: total > 0 ? Math.round((inProgress / total) * 100) : 0 },
            { label: "In Review", count: review, pct: total > 0 ? Math.round((review / total) * 100) : 0 },
            { label: "Backlog", count: todo, pct: total > 0 ? Math.round((todo / total) * 100) : 0 },
          ];
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {taskMetricCards.map((m) => (
                  <div key={m.label} className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4">
                    <div className="text-neutral-500 text-[11px] mb-2">{m.label}</div>
                    <div className="text-neutral-50 text-[22px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-1">{m.value}</div>
                    <span className="text-emerald-400 text-[11px]">{m.change} {m.note}</span>
                  </div>
                ))}
              </div>
              <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
                <div className="text-neutral-50 text-[13px] font-['Lexend:SemiBold',_sans-serif] mb-4">Weekly Completion vs Target</div>
                <div className="flex items-end gap-2 h-36">
                  {completionData.map((d) => (
                    <div key={d.week} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end gap-0.5 h-28">
                        <div className="flex-1 rounded-t" style={{ height: `${(d.completed / 40) * 100}%`, backgroundColor: "#818cf8" }} />
                        <div className="flex-1 rounded-t" style={{ height: `${(d.target / 40) * 100}%`, backgroundColor: "#262626" }} />
                      </div>
                      <span className="text-neutral-600 text-[9px]">{d.week}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-indigo-400" /><span className="text-neutral-500 text-[11px]">Actual</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-neutral-700" /><span className="text-neutral-500 text-[11px]">Target</span></div>
                </div>
              </div>
              <div className="bg-[#141414] border border-neutral-800/60 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-800/40 text-neutral-50 text-[13px] font-['Lexend:SemiBold',_sans-serif]">Task Status Breakdown</div>
                <div className="divide-y divide-neutral-800/40">
                  {statusRows.map((s) => (
                    <div key={s.label} className="grid grid-cols-[1fr_60px_100px] gap-4 px-4 py-3 items-center">
                      <span className="text-neutral-300 text-[12px]">{s.label}</span>
                      <span className="text-neutral-50 text-[12px] font-['Lexend:SemiBold',_sans-serif]">{s.count}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${s.pct}%` }} />
                        </div>
                        <span className="text-neutral-500 text-[11px] w-7 text-right">{s.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Time Tracking Analysis */}
        {activeView === "analytics-time-tracking" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Avg. Hours/Day", value: analyticsMetrics ? `${analyticsMetrics.timeTracking.avgHoursPerDay}h` : "—", change: "", note: "per member" },
                { label: "Billable Hours", value: analyticsMetrics ? analyticsMetrics.timeTracking.billableHours.toLocaleString() : "—", change: "", note: "this quarter" },
                { label: "Overtime Rate", value: analyticsMetrics ? `${analyticsMetrics.timeTracking.overtimeRate}%` : "—", change: "", note: "vs last quarter" },
                { label: "Focus Time", value: analyticsMetrics ? `${analyticsMetrics.timeTracking.focusTime}h` : "—", change: "", note: "per day avg" },
              ].map((m) => (
                <div key={m.label} className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4">
                  <div className="text-neutral-500 text-[11px] mb-2">{m.label}</div>
                  <div className="text-neutral-50 text-[22px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-1">{m.value}</div>
                  <span className="text-emerald-400 text-[11px]">{m.change} {m.note}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
                <div className="text-neutral-50 text-[13px] font-['Lexend:SemiBold',_sans-serif] mb-4">Hours by Team</div>
                <div className="space-y-4">
                  {(analyticsMetrics?.timeTracking.byTeam ?? []).map((t, _i, arr) => (
                    <div key={t.team}>
                      <div className="flex justify-between text-[12px] mb-1.5">
                        <span className="text-neutral-400">{t.team}</span>
                        <span className="text-neutral-300">{t.hours}h</span>
                      </div>
                      <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${(t.hours / Math.max(...arr.map((x) => x.hours), 1)) * 100}%`, backgroundColor: t.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
                <div className="text-neutral-50 text-[13px] font-['Lexend:SemiBold',_sans-serif] mb-4">Time Allocation</div>
                <div className="space-y-3">
                  {(analyticsMetrics?.timeTracking.allocation ?? []).map((a) => (
                    <div key={a.label} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                      <span className="text-neutral-400 text-[12px] flex-1">{a.label}</span>
                      <span className="text-neutral-300 text-[12px]">{a.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Team Efficiency Report */}
        {activeView === "analytics-team-efficiency" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Overall Efficiency", value: analyticsMetrics ? `${analyticsMetrics.teamEfficiency.overall}%` : "—", change: "", note: "vs last quarter" },
                { label: "Sprint Velocity", value: analyticsMetrics ? `${analyticsMetrics.teamEfficiency.sprintVelocity} pts` : "—", change: "", note: "per sprint" },
                { label: "Blocked Time", value: analyticsMetrics ? `${analyticsMetrics.teamEfficiency.blockedTime}%` : "—", change: "", note: "reduction" },
                { label: "Rework Rate", value: analyticsMetrics ? `${analyticsMetrics.teamEfficiency.reworkRate}%` : "—", change: "", note: "improvement" },
              ].map((m) => (
                <div key={m.label} className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4">
                  <div className="text-neutral-500 text-[11px] mb-2">{m.label}</div>
                  <div className="text-neutral-50 text-[22px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-1">{m.value}</div>
                  <span className="text-emerald-400 text-[11px]">{m.change} {m.note}</span>
                </div>
              ))}
            </div>
            <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
              <div className="text-neutral-50 text-[13px] font-['Lexend:SemiBold',_sans-serif] mb-5">Team Efficiency Scores</div>
              <div className="space-y-5">
                {(analyticsMetrics?.teamEfficiency.byTeam ?? []).map((t) => (
                  <div key={t.team}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-neutral-300 text-[13px]">{t.team}</span>
                      <div className="flex items-center gap-4 text-[11px]">
                        <span className="text-neutral-600">Velocity: <span className="text-neutral-400">{t.velocity} pts</span></span>
                        <span className="text-neutral-600">Blocked: <span className="text-neutral-400">{t.blocked}%</span></span>
                        <span style={{ color: t.color }} className="font-['Lexend:SemiBold',_sans-serif]">{t.score}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${t.score}%`, backgroundColor: t.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#141414] border border-neutral-800/60 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-800/40 text-neutral-50 text-[13px] font-['Lexend:SemiBold',_sans-serif]">Sprint Performance History</div>
              <div className="divide-y divide-neutral-800/40">
                {(analyticsMetrics?.teamEfficiency.sprintHistory ?? []).map((s) => (
                  <div key={s.sprint} className="grid grid-cols-[1fr_80px_80px_80px] gap-4 px-4 py-3 text-[12px]">
                    <span className="text-neutral-300">{s.sprint}</span>
                    <span className="text-neutral-50">{s.velocity} pts</span>
                    <span className="text-neutral-500">{s.done}/{s.goal}</span>
                    <span className={s.hit ? "text-emerald-400" : "text-red-400"}>{s.hit ? "Goal met" : "Missed"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Performance Benchmarks */}
        {activeView === "analytics-benchmarks" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Industry Rank", value: analyticsMetrics?.benchmarks.industryRank ?? "—", change: "", note: "this quarter" },
                { label: "On-time Delivery", value: analyticsMetrics ? `${analyticsMetrics.benchmarks.onTimeDelivery}%` : "—", change: "", note: "vs baseline" },
                { label: "Quality Score", value: analyticsMetrics ? `${analyticsMetrics.benchmarks.qualityScore}/10` : "—", change: "", note: "vs last quarter" },
                { label: "Customer NPS", value: analyticsMetrics ? `${analyticsMetrics.benchmarks.nps}` : "—", change: "", note: "vs last quarter" },
              ].map((m) => (
                <div key={m.label} className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4">
                  <div className="text-neutral-500 text-[11px] mb-2">{m.label}</div>
                  <div className="text-neutral-50 text-[22px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-1">{m.value}</div>
                  <span className="text-emerald-400 text-[11px]">{m.change} {m.note}</span>
                </div>
              ))}
            </div>
            <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
              <div className="text-neutral-50 text-[13px] font-['Lexend:SemiBold',_sans-serif] mb-2">Team vs. Industry Benchmark</div>
              <div className="text-neutral-500 text-[12px] mb-5">Comparison against industry average across key metrics</div>
              <div className="space-y-5">
                {(analyticsMetrics?.benchmarks.comparison ?? []).map((b) => (
                  <div key={b.label}>
                    <div className="flex items-center justify-between mb-2 text-[12px]">
                      <span className="text-neutral-400">{b.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-indigo-400">{b.team}%</span>
                        <span className="text-neutral-600">{b.industry}% avg</span>
                      </div>
                    </div>
                    <div className="relative h-2 bg-neutral-800 rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-neutral-700" style={{ width: `${b.industry}%` }} />
                      <div className="absolute inset-y-0 left-0 rounded-full bg-indigo-500" style={{ width: `${b.team}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-4">
                <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-indigo-500" /><span className="text-neutral-500 text-[11px]">Your team</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-neutral-700" /><span className="text-neutral-500 text-[11px]">Industry avg</span></div>
              </div>
            </div>
            <div className="bg-[#141414] border border-neutral-800/60 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-800/40 text-neutral-50 text-[13px] font-['Lexend:SemiBold',_sans-serif]">Quarterly Benchmark History</div>
              <div className="divide-y divide-neutral-800/40">
                {(analyticsMetrics?.benchmarks.history ?? []).map((q) => (
                  <div key={q.quarter} className="grid grid-cols-[1fr_80px_90px_80px] gap-4 px-4 py-3 text-[12px]">
                    <span className="text-neutral-300">{q.quarter}</span>
                    <span className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif]">{q.score}</span>
                    <span className="text-neutral-500">{q.rank}</span>
                    <span className="text-emerald-400">{q.delta}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Key metrics detailed table */}
        {activeView === "key-metrics" && (
          <div className="bg-[#141414] border border-neutral-800/60 rounded-xl overflow-hidden">
            <div className="px-4 lg:px-5 py-3 lg:py-4 border-b border-neutral-800/40">
              <div className="text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif]">Detailed Metrics</div>
            </div>
            <div className="divide-y divide-neutral-800/40">
              {(() => {
                const rows: { label: string; value: string; prev: string; change: string; up: boolean }[] = [
                  ...(liveMetrics ? [
                    { label: "Task Completion Rate", value: `${liveMetrics.total > 0 ? Math.round((liveMetrics.completed / liveMetrics.total) * 100) : 0}%`, prev: "—", change: "", up: true },
                    { label: "Tasks Completed", value: `${liveMetrics.completed}`, prev: "—", change: "", up: true },
                    { label: "Tasks In Progress", value: `${liveMetrics.inProgress}`, prev: "—", change: "", up: true },
                  ] : []),
                  ...(analyticsMetrics?.taskMetrics ? [
                    { label: "Average Cycle Time", value: analyticsMetrics.taskMetrics.avgCycleTime, prev: "—", change: analyticsMetrics.taskMetrics.cycleChange, up: true },
                  ] : []),
                  ...(analyticsMetrics ? [
                    { label: "Sprint Velocity", value: `${analyticsMetrics.teamEfficiency.sprintVelocity} pts`, prev: "—", change: "", up: true },
                    { label: "On-time Delivery", value: `${analyticsMetrics.benchmarks.onTimeDelivery}%`, prev: "—", change: "", up: true },
                    { label: "Rework Rate", value: `${analyticsMetrics.teamEfficiency.reworkRate}%`, prev: "—", change: "", up: true },
                    { label: "Quality Score", value: `${analyticsMetrics.benchmarks.qualityScore}/10`, prev: "—", change: "", up: true },
                  ] : []),
                ];
                if (rows.length === 0) {
                  return (
                    <div className="px-4 lg:px-5 py-3 text-[12px] lg:text-[13px] text-neutral-500">No data yet</div>
                  );
                }
                return rows.map((m) => (
                  <div key={m.label} className="grid grid-cols-[1fr_80px_80px_80px] gap-4 px-4 lg:px-5 py-3 text-[12px] lg:text-[13px] hover:bg-neutral-800/10 transition-colors">
                    <div className="text-neutral-300">{m.label}</div>
                    <div className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif]">{m.value}</div>
                    <div className="text-neutral-600">{m.prev}</div>
                    <div className={m.up ? "text-emerald-400" : "text-red-400"}>{m.change}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
