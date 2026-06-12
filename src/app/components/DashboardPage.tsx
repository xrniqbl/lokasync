import { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Target, DollarSign, Users, BarChart2, Activity, Layers, Clock, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useNavigation } from "./NavigationContext";
import { NewTaskModal } from "./modals/NewTaskModal";
import * as api from "../utils/api";


type DashView =
  | "overview"
  | "executive-summary" | "exec-revenue" | "exec-kpis" | "exec-goals" | "exec-departments"
  | "operations" | "ops-timeline" | "ops-resources" | "ops-performance" | "ops-capacity"
  | "financial" | "fin-budget" | "fin-cashflow" | "fin-expense" | "fin-pl"
  | "weekly" | "weekly-productivity" | "weekly-completion" | "weekly-budget" | "weekly-satisfaction"
  | "monthly" | "monthly-revenue" | "monthly-clients" | "monthly-expansion" | "monthly-cost"
  | "quarterly" | "quarterly-market" | "quarterly-roi" | "quarterly-retention" | "quarterly-innovation"
  | "performance-metrics" | "perf-sales" | "perf-response" | "perf-clv" | "perf-churn"
  | "predictive" | "pred-forecast" | "pred-resources" | "pred-trends" | "pred-risks";

// ── Custom chart components ───────────────────────────────────────────────────

function ChartArea({
  data,
  series,
  xKey,
  height = 160,
}: {
  data: Record<string, any>[];
  series: { key: string; name: string; stroke: string; fill?: string; dashed?: boolean }[];
  xKey: string;
  height?: number;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; idx: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (!data || data.length === 0) return <div style={{ height }} className="flex items-center justify-center text-neutral-700 text-[11px]">No data</div>;

  const padTop = 10, padRight = 10, padBottom = 26, padLeft = 32;
  const vbW = 300;
  const vbH = height;
  const plotW = vbW - padLeft - padRight;
  const plotH = vbH - padTop - padBottom;

  const allValues = data.flatMap((d) => series.map((s) => (d[s.key] as number) ?? 0));
  const maxVal = Math.max(...allValues, 1);

  const px = (i: number) => padLeft + (i / Math.max(data.length - 1, 1)) * plotW;
  const py = (v: number) => padTop + plotH - (v / maxVal) * plotH;

  const gridValues = [0, maxVal * 0.5, maxVal];
  const step = Math.max(1, Math.floor(data.length / 7));
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        {/* Grid lines */}
        {gridValues.map((v, gi) => {
          const y = py(v);
          return (
            <g key={gi}>
              <line x1={padLeft} y1={y} x2={vbW - padRight} y2={y} stroke="#1f1f1f" strokeWidth={0.5} />
              <text x={padLeft - 3} y={y + 3} textAnchor="end" fill="#525252" fontSize={7}>
                {Math.round(v)}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {xLabels.map((d, li) => {
          const origIdx = data.indexOf(d);
          return (
            <text key={li} x={px(origIdx)} y={vbH - 4} textAnchor="middle" fill="#525252" fontSize={7}>
              {d[xKey]}
            </text>
          );
        })}

        {/* Series */}
        {series.map((s, si) => {
          const points = data.map((d, i) => `${px(i)},${py((d[s.key] as number) ?? 0)}`).join(" ");
          const areaPoints =
            `${px(0)},${padTop + plotH} ` +
            data.map((d, i) => `${px(i)},${py((d[s.key] as number) ?? 0)}`).join(" ") +
            ` ${px(data.length - 1)},${padTop + plotH}`;

          return (
            <g key={si}>
              {s.fill && (
                <polygon
                  points={areaPoints}
                  fill={s.fill}
                  opacity={0.5}
                />
              )}
              <polyline
                points={points}
                fill="none"
                stroke={s.stroke}
                strokeWidth={1.5}
                strokeDasharray={s.dashed ? "5 3" : undefined}
              />
            </g>
          );
        })}

        {/* Hover columns */}
        {data.map((_, i) => (
          <rect
            key={i}
            x={i === 0 ? padLeft : (px(i - 1) + px(i)) / 2}
            y={padTop}
            width={
              i === 0
                ? (px(0) + px(1)) / 2 - padLeft
                : i === data.length - 1
                ? vbW - padRight - (px(i - 1) + px(i)) / 2
                : (px(i) + px(i + 1)) / 2 - (px(i - 1) + px(i)) / 2
            }
            height={plotH}
            fill="transparent"
            onMouseEnter={(e) => {
              const rect = svgRef.current?.getBoundingClientRect();
              if (!rect) return;
              const ratio = rect.width / vbW;
              setTooltip({ x: px(i) * ratio, y: py(Math.max(...series.map((s) => (data[i][s.key] as number) ?? 0))) * (rect.height / vbH), idx: i });
            }}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
      </svg>

      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 8,
            top: Math.max(0, tooltip.y - 8),
            pointerEvents: "none",
            zIndex: 10,
          }}
          className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-2.5"
        >
          <div className="text-neutral-400 text-[10px] mb-1.5">{data[tooltip.idx][xKey]}</div>
          {series.map((s, si) => (
            <div key={si} className="flex items-center gap-1.5 mb-0.5">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.stroke }} />
              <span className="text-neutral-300 text-[10px]">{s.name}: {data[tooltip.idx][s.key] ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartBar({
  data,
  bars,
  xKey,
  height = 160,
}: {
  data: Record<string, any>[];
  bars: { key: string; name: string; color: string }[];
  xKey: string;
  height?: number;
}) {
  const [tooltip, setTooltip] = useState<{ idx: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });

  if (!data || data.length === 0) return <div style={{ height }} className="flex items-center justify-center text-neutral-700 text-[11px]">No data</div>;

  const allValues = data.flatMap((d) => bars.map((b) => (d[b.key] as number) ?? 0));
  const maxVal = Math.max(...allValues, 1);
  const barAreaH = height - 24; // leave 24px for x labels

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 4,
          height: barAreaH,
          padding: "0 8px",
          boxSizing: "border-box",
        }}
      >
        {data.map((d, di) => (
          <div
            key={di}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}
            onMouseEnter={(e) => {
              const rect = containerRef.current?.getBoundingClientRect();
              const elRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              if (!rect) return;
              setTipPos({ x: elRect.left - rect.left + elRect.width / 2, y: elRect.top - rect.top });
              setTooltip({ idx: di });
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, flex: 1, width: "100%" }}>
              {bars.map((b, bi) => {
                const val = (d[b.key] as number) ?? 0;
                const pct = (val / maxVal) * 100;
                return (
                  <div
                    key={bi}
                    style={{
                      flex: 1,
                      height: `${pct}%`,
                      backgroundColor: b.color,
                      borderRadius: "3px 3px 0 0",
                      minHeight: 2,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {/* X labels */}
      <div style={{ display: "flex", gap: 4, padding: "0 8px", height: 24 }}>
        {data.map((d, di) => (
          <div
            key={di}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 9,
              color: "#525252",
              paddingTop: 4,
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {d[xKey]}
          </div>
        ))}
      </div>

      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tipPos.x + 8,
            top: Math.max(0, tipPos.y - 4),
            pointerEvents: "none",
            zIndex: 10,
          }}
          className="bg-[#1a1a1a] border border-neutral-800 rounded-lg p-2.5"
        >
          <div className="text-neutral-400 text-[10px] mb-1.5">{data[tooltip.idx][xKey]}</div>
          {bars.map((b, bi) => (
            <div key={bi} className="flex items-center gap-1.5 mb-0.5">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
              <span className="text-neutral-300 text-[10px]">{b.name}: {data[tooltip.idx][b.key] ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartHBar({
  data,
  bars,
  labelKey,
  height,
}: {
  data: Record<string, any>[];
  bars: { key: string; name: string; color: string }[];
  labelKey: string;
  height?: number;
}) {
  if (!data || data.length === 0) return <div style={{ height }} className="flex items-center justify-center text-neutral-700 text-[11px]">No data</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height }}>
      {data.map((d, di) => {
        const total = bars.reduce((acc, b) => acc + ((d[b.key] as number) ?? 0), 0);
        return (
          <div key={di} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 44, fontSize: 10, color: "#525252", textAlign: "right", flexShrink: 0 }}>
              {d[labelKey]}
            </div>
            <div style={{ flex: 1, display: "flex", height: 12, borderRadius: 4, overflow: "hidden", gap: 1 }}>
              {bars.map((b, bi) => {
                const val = (d[b.key] as number) ?? 0;
                return (
                  <div
                    key={bi}
                    style={{
                      width: `${(val / 100) * 100}%`,
                      backgroundColor: b.color,
                      minWidth: val > 0 ? 2 : 0,
                    }}
                  />
                );
              })}
            </div>
            <div style={{ width: 28, fontSize: 10, color: "#737373", textAlign: "left", flexShrink: 0 }}>
              {total}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChartDonut({
  data,
  size = 120,
}: {
  data: { name: string; value: number; color: string }[];
  size?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!data || data.length === 0) return <div style={{ height: size }} className="flex items-center justify-center text-neutral-700 text-[11px]">No data</div>;

  const total = data.reduce((a, b) => a + b.value, 0);
  const r = 30;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const slices = data.map((d, i) => {
    const dash = (d.value / total) * circumference;
    const gap = circumference - dash;
    const slice = { ...d, dash, gap, offset, idx: i };
    offset += dash;
    return slice;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg
        viewBox="0 0 100 100"
        style={{ width: size, height: size, display: "block" }}
      >
        {slices.map((s) => (
          <circle
            key={s.idx}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={hovered === s.idx ? strokeWidth + 2 : strokeWidth}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.offset + circumference * 0.25}
            style={{ cursor: "pointer", transition: "stroke-width 0.15s" }}
            onMouseEnter={() => setHovered(s.idx)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        {hovered !== null ? (
          <>
            <text x="50" y="47" textAnchor="middle" fill="#e5e5e5" fontSize={10} fontWeight="600">
              {data[hovered].value}%
            </text>
            <text x="50" y="57" textAnchor="middle" fill="#737373" fontSize={6}>
              {data[hovered].name}
            </text>
          </>
        ) : (
          <text x="50" y="52" textAnchor="middle" fill="#737373" fontSize={7}>
            {total}%
          </text>
        )}
      </svg>
    </div>
  );
}

// ── Data defaults (populated from Supabase via useDashboardData hook) ─────────
// These are overridden by live API data fetched in DashboardPage useEffect.

let weeklyData: { week: string; completed: number; created: number }[] = [];
let teamData: { name: string; tasks: number; done: number }[] = [];
let revenueData: { month: string; revenue: number; target: number }[] = [];
let kpiData: { name: string; value: number; target: number; color: string }[] = [];
let strategicGoals: { goal: string; progress: number; status: string; due: string }[] = [];
let deptHighlights: { dept: string; metric: string; sub: string; up: boolean }[] = [];
let projectTimeline: { project: string; start: number; duration: number; status: string }[] = [];
let resourceData: { team: string; allocated: number; available: number }[] = [];
let capacityData: { week: string; capacity: number; utilization: number }[] = [];
let budgetData: { category: string; budget: number; actual: number }[] = [];
let cashFlowData: { month: string; inflow: number; outflow: number }[] = [];
let expenseBreakdown: { name: string; value: number; color: string }[] = [];
let dailyData: { day: string; tasks: number; hours: number; bugs: number }[] = [];
let monthlyTrend: { month: string; delivered: number; planned: number; velocity: number }[] = [];
let quarterlyData: { quarter: string; revenue: number; expenses: number; profit: number }[] = [];
let performerData: { name: string; tasks: number; rate: number; score: number }[] = [];
let performanceMetrics: { metric: string; value: string; change: string; up: boolean }[] = [];
let forecastData: { month: string; actual: null; forecast: number; lower: number; upper: number }[] = [];
let riskItems: { risk: string; likelihood: string; impact: string; color: string }[] = [];
let dashDetails: Partial<api.DashboardDetails> = {};

function dd<K extends keyof api.DashboardDetails>(key: K): Partial<api.DashboardDetails[K]> {
  return (dashDetails[key] ?? {}) as Partial<api.DashboardDetails[K]>;
}

// ── Config helpers ─────────────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; color: string }> = {
  "in-progress": { label: "In Progress", color: "#f59e0b" },
  review: { label: "Review", color: "#3b82f6" },
  todo: { label: "Todo", color: "#525252" },
  completed: { label: "Done", color: "#10b981" },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  high: { label: "High", color: "#ef4444" },
  medium: { label: "Medium", color: "#f59e0b" },
  low: { label: "Low", color: "#525252" },
};

const tagConfig: Record<string, string> = {
  recurring: "bg-neutral-800 text-neutral-400",
  meeting: "bg-blue-950/60 text-blue-400",
  planning: "bg-indigo-950/60 text-indigo-400",
};

// ── Shared sub-components ─────────────────────────────────────────────────────
function StatCard({ label, value, sub, trend }: {
  label: string; value: string; sub?: string;
  trend?: { value: string; up: boolean };
}) {
  return (
    <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
      <div className="text-neutral-400 text-[12px] lg:text-[13px] font-['Lexend:Regular',_sans-serif] mb-3">{label}</div>
      <div className="text-neutral-50 text-[24px] lg:text-[28px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-2">{value}</div>
      <div className="flex items-center gap-2 flex-wrap">
        {trend && (
          <span className={`flex items-center gap-1 text-[11px] font-['Lexend:Regular',_sans-serif] ${trend.up ? "text-emerald-400" : "text-red-400"}`}>
            {trend.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {trend.value}
          </span>
        )}
        {sub && <span className="text-[11px] text-neutral-600 font-['Lexend:Regular',_sans-serif]">{sub}</span>}
      </div>
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4 lg:mb-5">
      <div className="text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif]">{title}</div>
      <div className="text-neutral-500 text-[11px] lg:text-[12px] mt-0.5">{sub}</div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5 ${className}`}>
      {children}
    </div>
  );
}

function ProgressBar({ value, color = "#818cf8" }: { value: number; color?: string }) {
  return (
    <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
    </div>
  );
}

const VIEW_LABELS: Record<DashView, string> = {
  "overview": "Overview",
  "executive-summary": "Executive Summary",
  "exec-revenue": "Revenue Overview",
  "exec-kpis": "Key Performance Indicators",
  "exec-goals": "Strategic Goals Progress",
  "exec-departments": "Department Highlights",
  "operations": "Operations Dashboard",
  "ops-timeline": "Project Timeline",
  "ops-resources": "Resource Allocation",
  "ops-performance": "Team Performance",
  "ops-capacity": "Capacity Planning",
  "financial": "Financial Dashboard",
  "fin-budget": "Budget vs Actual",
  "fin-cashflow": "Cash Flow Analysis",
  "fin-expense": "Expense Breakdown",
  "fin-pl": "Profit & Loss Summary",
  "weekly": "Weekly Reports",
  "weekly-productivity": "Team Productivity",
  "weekly-completion": "Project Completion",
  "weekly-budget": "Budget Utilization",
  "weekly-satisfaction": "Client Satisfaction",
  "monthly": "Monthly Insights",
  "monthly-revenue": "Revenue Growth",
  "monthly-clients": "New Clients",
  "monthly-expansion": "Team Expansion",
  "monthly-cost": "Cost Reduction",
  "quarterly": "Quarterly Analysis",
  "quarterly-market": "Market Position",
  "quarterly-roi": "Return on Investment",
  "quarterly-retention": "Customer Retention",
  "quarterly-innovation": "Innovation Index",
  "performance-metrics": "Performance Metrics",
  "perf-sales": "Sales Conversion",
  "perf-response": "Lead Response Time",
  "perf-clv": "Customer Lifetime Value",
  "perf-churn": "Churn Rate",
  "predictive": "Predictive Analytics",
  "pred-forecast": "Q4 Revenue Forecast",
  "pred-resources": "Resource Demand",
  "pred-trends": "Market Trends",
  "pred-risks": "Risk Assessment",
};

// ── Sub-view components ───────────────────────────────────────────────────────

function OverviewView({ recentTasks, onNavigate, showNewTask, taskStats, todayEvents, teamChartData }: {
  recentTasks: { title: string; status: string; priority: string; assignee: string; due: string }[];
  onNavigate: (s: string) => void;
  showNewTask: () => void;
  taskStats: { total: number; completed: number; inProgress: number; members: number };
  todayEvents: { title: string; tag: string; color?: string }[];
  teamChartData: { name: string; tasks: number; done: number }[];
}) {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const completionRate = taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0;
  return (
    <div className="space-y-5 lg:space-y-7">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard label="Total Tasks" value={`${taskStats.total}`} trend={{ value: `${taskStats.inProgress} active`, up: true }} />
        <StatCard label="Completed" value={`${taskStats.completed}`} trend={{ value: `${completionRate}% rate`, up: completionRate >= 50 }} sub={`${completionRate}% complete`} />
        <StatCard label="In Progress" value={`${taskStats.inProgress}`} sub={`${taskStats.total - taskStats.completed - taskStats.inProgress} todo`} />
        <StatCard label="Team Members" value={`${taskStats.members}`} sub="active workspace" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4 lg:mb-5">
            <SectionHeader title="Task Activity" sub="Completion trend" />
            <div className="flex items-center gap-3 lg:gap-4">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-400" /><span className="text-neutral-500 text-[11px]">Completed</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-neutral-600" /><span className="text-neutral-500 text-[11px]">Created</span></div>
            </div>
          </div>
          <ChartArea
            data={weeklyData}
            xKey="week"
            height={160}
            series={[
              { key: "completed", name: "Completed", stroke: "#818cf8", fill: "rgba(129,140,248,0.08)" },
              { key: "created", name: "Created", stroke: "#404040", fill: "rgba(82,82,82,0.08)" },
            ]}
          />
        </Card>

        <Card>
          <SectionHeader title="Team Workload" sub="Active vs. done" />
          <ChartBar
            data={teamChartData.length > 0 ? teamChartData : teamData}
            xKey="name"
            height={160}
            bars={[
              { key: "tasks", name: "Total", color: "#262626" },
              { key: "done", name: "Done", color: "#818cf8" },
            ]}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[#141414] border border-neutral-800/60 rounded-xl">
          <div className="flex items-center justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-neutral-800/60">
            <div className="text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif]">Recent Tasks</div>
            <button onClick={() => onNavigate("tasks")} className="text-neutral-500 text-[12px] hover:text-indigo-400 transition-colors">View all →</button>
          </div>
          <div className="divide-y divide-neutral-800/40">
            {recentTasks.length === 0 && (
              <div className="px-5 py-6 text-neutral-600 text-[13px] text-center">No tasks yet</div>
            )}
            {recentTasks.map((task, i) => (
              <div key={i} onClick={() => onNavigate("tasks")} className="flex items-center justify-between px-4 lg:px-5 py-3 hover:bg-neutral-800/20 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: (statusConfig[task.status] ?? statusConfig["todo"]).color }} />
                  <span className="text-neutral-300 text-[12px] lg:text-[13px] truncate">{task.title}</span>
                </div>
                <div className="flex items-center gap-2 lg:gap-4 shrink-0 ml-3">
                  <span className="text-[11px] hidden sm:block" style={{ color: (priorityConfig[task.priority] ?? priorityConfig["medium"]).color }}>{(priorityConfig[task.priority] ?? priorityConfig["medium"]).label}</span>
                  <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-400">{task.assignee}</div>
                  <span className="text-neutral-600 text-[11px] w-12 text-right hidden md:block">{task.due}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#141414] border border-neutral-800/60 rounded-xl">
          <div className="px-4 lg:px-5 py-3 lg:py-4 border-b border-neutral-800/60">
            <div className="text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif]">Today</div>
            <div className="text-neutral-500 text-[11px] lg:text-[12px] mt-0.5">{today}</div>
          </div>
          <div className="px-4 lg:px-5 py-4 space-y-4">
            {todayEvents.length === 0 && (
              <div className="text-neutral-600 text-[12px] text-center py-4">No events today</div>
            )}
            {todayEvents.map((event, i) => (
              <div key={i} onClick={() => toast.info(event.title)} className="flex items-start gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                <div className="flex-1 min-w-0">
                  <div className="text-neutral-300 text-[12px] lg:text-[13px] leading-tight mb-1.5">{event.title}</div>
                  <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${tagConfig[event.tag] ?? "bg-neutral-800 text-neutral-400"}`}>{event.tag}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExecutiveSummaryView() {
  const goalStatusColor: Record<string, string> = {
    "on-track": "#10b981", "at-risk": "#f59e0b", "ahead": "#818cf8",
  };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(dd("executiveSummary").stats ?? []).map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} trend={s.up !== undefined ? { value: s.sub ?? "", up: s.up } : undefined} sub={s.up === undefined ? s.sub : undefined} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Revenue vs Target" sub="Monthly comparison (USD k)" />
          <ChartBar
            data={revenueData}
            xKey="month"
            height={180}
            bars={[
              { key: "target", name: "Target", color: "#262626" },
              { key: "revenue", name: "Revenue", color: "#818cf8" },
            ]}
          />
        </Card>

        <Card>
          <SectionHeader title="Key Performance Indicators" sub="vs. targets" />
          <div className="space-y-4">
            {kpiData.map((kpi) => (
              <div key={kpi.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-neutral-300 text-[12px]">{kpi.name}</span>
                  <span className="text-neutral-400 text-[12px]">{kpi.value}% <span className="text-neutral-600">/ {kpi.target}%</span></span>
                </div>
                <ProgressBar value={(kpi.value / kpi.target) * 100} color={kpi.color} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Strategic Goals Progress" sub="2026 initiatives" />
          <div className="space-y-3.5">
            {strategicGoals.map((g) => (
              <div key={g.goal}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-neutral-300 text-[12px] truncate mr-2">{g.goal}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-neutral-600 text-[11px]">{g.due}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: goalStatusColor[g.status], backgroundColor: `${goalStatusColor[g.status]}18` }}>
                      {g.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ProgressBar value={g.progress} color={goalStatusColor[g.status]} />
                  <span className="text-neutral-500 text-[11px] w-8 text-right shrink-0">{g.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Department Highlights" sub="Month-over-month" />
          <div className="space-y-3">
            {deptHighlights.map((d) => (
              <div key={d.dept} className="flex items-center justify-between p-3 bg-neutral-800/20 rounded-lg">
                <div>
                  <div className="text-neutral-400 text-[11px] mb-0.5">{d.dept}</div>
                  <div className="text-neutral-100 text-[13px] font-['Lexend:SemiBold',_sans-serif]">{d.metric}</div>
                </div>
                <span className={`flex items-center gap-1 text-[11px] ${d.up ? "text-emerald-400" : "text-red-400"}`}>
                  {d.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {d.sub}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function OperationsView() {
  const statusColor: Record<string, string> = {
    "in-progress": "#f59e0b", "completed": "#10b981", "planning": "#818cf8",
  };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(dd("operations").stats ?? []).map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} trend={s.up !== undefined ? { value: s.sub ?? "", up: s.up } : undefined} sub={s.up === undefined ? s.sub : undefined} />
        ))}
      </div>

      <Card>
        <SectionHeader title="Project Timeline" sub="Relative progress (% complete)" />
        <div className="space-y-4 mt-2">
          {projectTimeline.map((p) => (
            <div key={p.project}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-neutral-300 text-[12px]">{p.project}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: statusColor[p.status], backgroundColor: `${statusColor[p.status]}18` }}>
                  {p.status}
                </span>
              </div>
              <div className="relative h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div className="absolute h-full rounded-full" style={{ left: `${p.start}%`, width: `${p.duration}%`, backgroundColor: statusColor[p.status], opacity: 0.7 }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Resource Allocation" sub="Allocated vs. available (%)" />
          <ChartHBar
            data={resourceData}
            labelKey="team"
            height={180}
            bars={[
              { key: "allocated", name: "Allocated", color: "#818cf8" },
              { key: "available", name: "Available", color: "#262626" },
            ]}
          />
        </Card>

        <Card>
          <SectionHeader title="Capacity vs. Utilization" sub="Last 6 weeks (story points)" />
          <ChartArea
            data={capacityData}
            xKey="week"
            height={180}
            series={[
              { key: "capacity", name: "Capacity", stroke: "#525252", dashed: true },
              { key: "utilization", name: "Utilization", stroke: "#10b981", fill: "rgba(16,185,129,0.06)" },
            ]}
          />
        </Card>
      </div>

      <Card>
        <SectionHeader title="Team Performance" sub="Task completion by team" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {teamData.map((t) => (
            <div key={t.name} className="p-3 bg-neutral-800/20 rounded-lg text-center">
              <div className="text-neutral-400 text-[11px] mb-1">{t.name === "Dev" ? "Engineering" : t.name === "PM" ? "Product" : t.name}</div>
              <div className="text-neutral-50 text-[22px] font-['Lexend:SemiBold',_sans-serif]">{Math.round((t.done / t.tasks) * 100)}%</div>
              <div className="text-neutral-600 text-[11px] mt-0.5">{t.done}/{t.tasks} done</div>
              <div className="mt-2"><ProgressBar value={(t.done / t.tasks) * 100} color="#818cf8" /></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function FinancialView() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(dd("financial").stats ?? []).map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} trend={s.up !== undefined ? { value: s.sub ?? "", up: s.up } : undefined} sub={s.up === undefined ? s.sub : undefined} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Budget vs. Actual" sub="Q2 2026 (USD k)" />
          <ChartBar
            data={budgetData}
            xKey="category"
            height={190}
            bars={[
              { key: "budget", name: "Budget", color: "#262626" },
              { key: "actual", name: "Actual", color: "#818cf8" },
            ]}
          />
        </Card>

        <Card>
          <SectionHeader title="Cash Flow" sub="Monthly inflow vs. outflow (USD k)" />
          <ChartArea
            data={cashFlowData}
            xKey="month"
            height={190}
            series={[
              { key: "inflow", name: "Inflow", stroke: "#10b981", fill: "rgba(16,185,129,0.08)" },
              { key: "outflow", name: "Outflow", stroke: "#ef4444", fill: "rgba(239,68,68,0.08)" },
            ]}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <SectionHeader title="Expense Breakdown" sub="By department (%)" />
          <ChartDonut data={expenseBreakdown} size={120} />
          <div className="grid grid-cols-2 gap-1.5 mt-3">
            {expenseBreakdown.map((e) => (
              <div key={e.name} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                <span className="text-neutral-500 text-[11px] truncate">{e.name} {e.value}%</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <SectionHeader title="P&L Summary" sub="Q2 2026" />
          <div className="space-y-2 mt-1">
            {(dd("finPL").rows ?? []).map((row) => (
              <div key={row.label} className={`flex items-center justify-between py-2 ${row.highlight ? "border-t border-neutral-700 mt-1 pt-3" : "border-b border-neutral-800/40"}`}>
                <span className={`text-[12px] ${row.bold ? "text-neutral-100 font-['Lexend:SemiBold',_sans-serif]" : "text-neutral-400"}`}>{row.label}</span>
                <span className={`text-[12px] ${row.highlight ? "text-emerald-400 font-['Lexend:SemiBold',_sans-serif]" : row.neg ? "text-red-400" : row.bold ? "text-neutral-100 font-['Lexend:SemiBold',_sans-serif]" : "text-neutral-300"}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function WeeklyReportView() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(dd("weeklyReport").stats ?? []).map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} trend={s.up !== undefined ? { value: s.sub ?? "", up: s.up } : undefined} sub={s.up === undefined ? s.sub : undefined} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Daily Task Completion" sub="Week of Jun 8–12, 2026" />
          <ChartBar
            data={dailyData}
            xKey="day"
            height={180}
            bars={[
              { key: "tasks", name: "Tasks", color: "#818cf8" },
            ]}
          />
        </Card>

        <Card>
          <SectionHeader title="Hours Logged per Day" sub="Team total" />
          <ChartArea
            data={dailyData}
            xKey="day"
            height={180}
            series={[
              { key: "hours", name: "Hours", stroke: "#10b981", fill: "rgba(16,185,129,0.08)" },
            ]}
          />
        </Card>
      </div>

      <Card>
        <SectionHeader title="Week Summary" sub="Key wins and blockers" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-emerald-400 text-[12px] font-['Lexend:SemiBold',_sans-serif] mb-2.5 flex items-center gap-1.5">
              <TrendingUp size={12} /> Wins this week
            </div>
            <div className="space-y-2">
              {(dd("weeklyReport").wins ?? []).map((w) => (
                <div key={w} className="flex items-center gap-2 text-neutral-300 text-[12px]">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" /> {w}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-amber-400 text-[12px] font-['Lexend:SemiBold',_sans-serif] mb-2.5 flex items-center gap-1.5">
              <Activity size={12} /> Active blockers
            </div>
            <div className="space-y-2">
              {(dd("weeklyReport").blockers ?? []).map((b) => (
                <div key={b} className="flex items-center gap-2 text-neutral-300 text-[12px]">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" /> {b}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

const highlightIcons: Record<string, React.ReactNode> = {
  layers: <Layers size={14} />,
  users: <Users size={14} />,
  clock: <Clock size={14} />,
  target: <Target size={14} />,
  dollar: <DollarSign size={14} />,
  activity: <Activity size={14} />,
};

function MonthlyInsightsView() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(dd("monthlyInsights").stats ?? []).map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} trend={s.up !== undefined ? { value: s.sub ?? "", up: s.up } : undefined} sub={s.up === undefined ? s.sub : undefined} />
        ))}
      </div>

      <Card>
        <SectionHeader title="Monthly Delivery Trend" sub="Stories delivered vs. planned (6 months)" />
        <ChartArea
          data={monthlyTrend}
          xKey="month"
          height={200}
          series={[
            { key: "delivered", name: "Delivered", stroke: "#818cf8", fill: "rgba(129,140,248,0.08)" },
            { key: "planned", name: "Planned", stroke: "#525252", dashed: true },
          ]}
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Team Velocity" sub="Velocity % (delivered/planned)" />
          <div className="space-y-3">
            {monthlyTrend.map((m) => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="text-neutral-500 text-[12px] w-8 shrink-0">{m.month}</span>
                <div className="flex-1"><ProgressBar value={m.velocity} color={m.velocity >= 100 ? "#10b981" : m.velocity >= 90 ? "#818cf8" : "#f59e0b"} /></div>
                <span className={`text-[12px] w-10 text-right shrink-0 ${m.velocity >= 100 ? "text-emerald-400" : m.velocity >= 90 ? "text-indigo-400" : "text-amber-400"}`}>{m.velocity}%</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Monthly Highlights" sub="June 2026" />
          <div className="space-y-3">
            {(dd("monthlyInsights").highlights ?? []).map((h) => (
              <div key={h.title} className="flex items-center justify-between p-3 bg-neutral-800/20 rounded-lg">
                <div className="flex items-center gap-2 text-neutral-400">
                  {highlightIcons[h.icon] ?? <Activity size={14} />}
                  <span className="text-[12px]">{h.title}</span>
                </div>
                <span className="text-neutral-100 text-[12px] font-['Lexend:SemiBold',_sans-serif]">{h.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function QuarterlyAnalysisView() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(dd("quarterlyAnalysis").stats ?? []).map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} trend={s.up !== undefined ? { value: s.sub ?? "", up: s.up } : undefined} sub={s.up === undefined ? s.sub : undefined} />
        ))}
      </div>

      <Card>
        <SectionHeader title="Quarterly Revenue & Profit" sub="USD thousands" />
        <ChartArea
          data={quarterlyData}
          xKey="quarter"
          height={200}
          series={[
            { key: "revenue", name: "Revenue", stroke: "#818cf8", fill: "rgba(129,140,248,0.08)" },
            { key: "expenses", name: "Expenses", stroke: "#ef4444" },
            { key: "profit", name: "Profit", stroke: "#10b981" },
          ]}
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Q2 vs Q1 Comparison" sub="Key metrics" />
          <div className="space-y-2">
            {(dd("quarterlyAnalysis").comparison ?? []).map((row) => (
              <div key={row.metric} className="grid grid-cols-3 items-center py-2 border-b border-neutral-800/40">
                <span className="text-neutral-400 text-[12px]">{row.metric}</span>
                <span className="text-neutral-600 text-[12px] text-center">{row.q1}</span>
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-neutral-200 text-[12px]">{row.q2}</span>
                  {row.up ? <TrendingUp size={11} className="text-emerald-400" /> : <TrendingDown size={11} className="text-red-400" />}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Quarterly OKR Progress" sub="Q2 2026 Objectives" />
          <div className="space-y-4">
            {(dd("quarterlyAnalysis").okrs ?? []).map((o) => {
              const c = o.status === "ahead" ? "#818cf8" : o.status === "on-track" ? "#10b981" : "#f59e0b";
              return (
                <div key={o.objective}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-neutral-300 text-[12px] truncate mr-2">{o.objective}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ color: c, backgroundColor: `${c}18` }}>{o.status}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={o.progress} color={c} />
                    <span className="text-neutral-500 text-[11px] w-8 text-right shrink-0">{o.progress}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function PerformanceMetricsView() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {(dd("performanceMetrics").stats ?? []).map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} trend={s.up !== undefined ? { value: s.sub ?? "", up: s.up } : undefined} sub={s.up === undefined ? s.sub : undefined} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Engineering Metrics" sub="Current month" />
          <div className="space-y-3">
            {performanceMetrics.map((m) => (
              <div key={m.metric} className="flex items-center justify-between p-3 bg-neutral-800/20 rounded-lg">
                <span className="text-neutral-300 text-[12px]">{m.metric}</span>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-100 text-[13px] font-['Lexend:SemiBold',_sans-serif]">{m.value}</span>
                  <span className={`flex items-center gap-0.5 text-[11px] ${m.up ? "text-emerald-400" : "text-red-400"}`}>
                    {m.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />} {m.change}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Top Performers" sub="By task completion score" />
          <div className="space-y-3">
            {performerData.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="text-neutral-600 text-[12px] w-4 shrink-0">{i + 1}</span>
                <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-[11px] text-neutral-300 shrink-0">{p.name}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-neutral-300 text-[12px]">{p.tasks} tasks</span>
                    <span className="text-neutral-400 text-[11px]">{p.rate}% on-time</span>
                  </div>
                  <ProgressBar value={p.score} color={i === 0 ? "#818cf8" : i === 1 ? "#10b981" : "#525252"} />
                </div>
                <span className="text-neutral-100 text-[13px] font-['Lexend:SemiBold',_sans-serif] w-8 text-right shrink-0">{p.score}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionHeader title="Team Performance Radar" sub="Score breakdown by category" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(dd("performanceMetrics").radar ?? []).map((c) => (
            <div key={c.label} className="p-3 bg-neutral-800/20 rounded-lg">
              <div className="text-neutral-400 text-[11px] mb-2">{c.label}</div>
              <div className="text-neutral-50 text-[20px] font-['Lexend:SemiBold',_sans-serif] mb-2" style={{ color: c.color }}>{c.value}</div>
              <ProgressBar value={c.value} color={c.color} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function PredictiveAnalyticsView() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(dd("predictive").stats ?? []).map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} trend={s.up !== undefined ? { value: s.sub ?? "", up: s.up } : undefined} sub={s.up === undefined ? s.sub : undefined} />
        ))}
      </div>

      <Card>
        <SectionHeader title="Revenue Forecast — H2 2026" sub="AI-powered projection with confidence interval (USD k)" />
        <ChartArea
          data={forecastData}
          xKey="month"
          height={200}
          series={[
            { key: "upper", name: "Upper bound", stroke: "transparent", fill: "rgba(129,140,248,0.12)" },
            { key: "forecast", name: "Forecast", stroke: "#818cf8", dashed: true },
            { key: "lower", name: "Lower bound", stroke: "#525252", dashed: true },
          ]}
        />
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-indigo-400" style={{ borderTop: "2px dashed #818cf8" }} /><span className="text-neutral-500 text-[11px]">Forecast</span></div>
          <div className="flex items-center gap-1.5"><div className="w-4 h-3 bg-indigo-400/10 rounded-sm" /><span className="text-neutral-500 text-[11px]">Confidence range</span></div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Risk Register" sub="Identified risks & impact" />
          <div className="space-y-2">
            {riskItems.map((r) => (
              <div key={r.risk} className="flex items-start gap-3 p-3 bg-neutral-800/20 rounded-lg">
                <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: r.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-neutral-300 text-[12px] truncate">{r.risk}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-neutral-600 text-[11px]">Likelihood: <span className="text-neutral-400">{r.likelihood}</span></span>
                    <span className="text-neutral-600 text-[11px]">Impact: <span className="text-neutral-400">{r.impact}</span></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Predictive Insights" sub="AI-generated recommendations" />
          <div className="space-y-3">
            {(dd("predictive").insights ?? []).map((ins, i) => {
              const c = ins.severity === "high" ? "#ef4444" : ins.severity === "medium" ? "#f59e0b" : "#10b981";
              return (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg" style={{ backgroundColor: `${c}08`, borderLeft: `2px solid ${c}40` }}>
                  <ChevronRight size={13} style={{ color: c }} className="shrink-0 mt-0.5" />
                  <span className="text-neutral-300 text-[12px] leading-relaxed">{ins.insight}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Main DashboardPage ────────────────────────────────────────────────────────
// ── Focused sub-views (drill-down from parent views) ─────────────────────────

function FocusedView({ title, subtitle, stats, children }: {
  title: string; subtitle: string;
  stats: { label: string; value: string; sub?: string; up?: boolean }[];
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} sub={s.sub}
            trend={s.up !== undefined ? { value: s.sub ?? "", up: s.up } : undefined} />
        ))}
      </div>
      {children}
    </div>
  );
}

// ── Executive sub-views ───────────────────────────────────────────────────────
function ExecRevenueView() {
  return (
    <FocusedView title="Revenue Overview" subtitle="Monthly actuals vs targets (USD k)"
      stats={dd("execRevenue").stats ?? []}>
      <Card><SectionHeader title="Revenue vs Target" sub="Monthly (USD k)" />
        <ChartBar data={revenueData} bars={[{ key: "target", name: "Target", color: "#262626" }, { key: "revenue", name: "Revenue", color: "#818cf8" }]} xKey="month" height={200} />
      </Card>
      <Card><SectionHeader title="Monthly Growth Rate" sub="MoM change %" />
        <ChartArea data={dd("execRevenue").growth ?? []} series={[{ key: "growth", name: "Growth %", stroke: "#10b981", fill: "rgba(16,185,129,0.08)" }]} xKey="month" height={160} />
      </Card>
    </FocusedView>
  );
}

function ExecKpisView() {
  const kpis = dd("execKpis").kpis ?? [];
  return (
    <FocusedView title="Key Performance Indicators" subtitle="vs targets"
      stats={dd("execKpis").stats ?? []}>
      <Card>
        <SectionHeader title="KPI Dashboard" sub="Current performance vs targets" />
        <div className="space-y-4 mt-2">
          {kpis.map((k) => (
            <div key={k.name}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-neutral-300 text-[12px]">{k.name}</span>
                <span className="text-neutral-400 text-[12px]">{k.value}% <span className="text-neutral-600">/ {k.target}%</span></span>
              </div>
              <ProgressBar value={(k.value / k.target) * 100} color={k.color} />
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

function ExecGoalsView() {
  const goals = dd("execGoals").goals ?? [];
  const c = (s: string) => s === "ahead" ? "#818cf8" : s === "on-track" ? "#10b981" : "#f59e0b";
  return (
    <FocusedView title="Strategic Goals Progress" subtitle="2026 initiatives"
      stats={dd("execGoals").stats ?? []}>
      <Card>
        <SectionHeader title="Goal Tracker" sub="Progress and status" />
        <div className="space-y-4">
          {goals.map((g) => (
            <div key={g.goal} className="p-3 bg-neutral-800/20 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-neutral-200 text-[13px]">{g.goal}</div>
                  <div className="text-neutral-600 text-[11px] mt-0.5">Owner: {g.owner} · Due: {g.due}</div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0 ml-3" style={{ color: c(g.status), backgroundColor: `${c(g.status)}18` }}>{g.status}</span>
              </div>
              <div className="flex items-center gap-2">
                <ProgressBar value={g.progress} color={c(g.status)} />
                <span className="text-neutral-500 text-[11px] w-8 shrink-0 text-right">{g.progress}%</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

function ExecDepartmentsView() {
  const depts = dd("execDepartments").depts ?? [];
  return (
    <FocusedView title="Department Highlights" subtitle="Month-over-month performance"
      stats={dd("execDepartments").stats ?? []}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {depts.map((d) => (
          <Card key={d.dept}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-neutral-50 text-[14px] font-['Lexend:SemiBold',_sans-serif]">{d.dept}</span>
              <span className={`text-[12px] ${d.up ? "text-emerald-400" : "text-red-400"} flex items-center gap-1`}>
                {d.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {d.trend}
              </span>
            </div>
            <div className="text-neutral-300 text-[13px] mb-1">{d.metric}</div>
            <div className="text-neutral-500 text-[11px]">{d.kpi}</div>
            <div className="mt-3"><ProgressBar value={d.up ? 80 : 55} color={d.color} /></div>
          </Card>
        ))}
      </div>
    </FocusedView>
  );
}

// ── Operations sub-views ──────────────────────────────────────────────────────
function OpsTimelineView() {
  const projects = dd("opsTimeline").projects ?? [];
  const sc = (s: string) => ({ "in-progress": "#f59e0b", "completed": "#10b981", "planning": "#818cf8", "review": "#3b82f6" }[s] ?? "#525252");
  return (
    <FocusedView title="Project Timeline" subtitle="Active project schedules"
      stats={dd("opsTimeline").stats ?? []}>
      <Card>
        <SectionHeader title="Project Gantt" sub="Relative timeline (% of quarter)" />
        <div className="space-y-4 mt-2">
          {projects.map((p) => (
            <div key={p.project}>
              <div className="flex items-center justify-between mb-1.5">
                <div><div className="text-neutral-300 text-[12px]">{p.project}</div><div className="text-neutral-600 text-[10px]">{p.phase} · Due {p.due}</div></div>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: sc(p.status), backgroundColor: `${sc(p.status)}18` }}>{p.status}</span>
              </div>
              <div className="relative h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div className="absolute h-full rounded-full" style={{ left: `${p.start}%`, width: `${p.duration}%`, backgroundColor: sc(p.status), opacity: 0.75 }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

function OpsResourcesView() {
  const resources = dd("opsResources").resources ?? [];
  return (
    <FocusedView title="Resource Allocation" subtitle="Team utilization rates"
      stats={dd("opsResources").stats ?? []}>
      <Card>
        <SectionHeader title="Utilization by Team" sub="Allocated vs. available %" />
        <div className="space-y-4 mt-2">
          {resources.map((r) => (
            <div key={r.team} className="p-3 bg-neutral-800/20 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-neutral-300 text-[13px]">{r.team}</span>
                <div className="flex items-center gap-3">
                  <span className="text-neutral-500 text-[11px]">{r.headcount} people</span>
                  <span className={`text-[12px] font-['Lexend:SemiBold',_sans-serif] ${r.allocated > 85 ? "text-amber-400" : "text-neutral-200"}`}>{r.allocated}%</span>
                </div>
              </div>
              <ProgressBar value={r.allocated} color={r.allocated > 85 ? "#f59e0b" : "#818cf8"} />
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-neutral-600 text-[10px]">Allocated</span>
                <span className="text-neutral-600 text-[10px]">{r.available}% available</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

function OpsPerformanceView() {
  return (
    <FocusedView title="Team Performance" subtitle="Cross-team completion metrics"
      stats={dd("opsPerformance").stats ?? []}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Team Scorecard" sub="This sprint" />
          <div className="space-y-3">
            {(dd("opsPerformance").scorecard ?? []).map((t) => (
              <div key={t.team} className="flex items-center gap-3">
                <span className="text-neutral-400 text-[12px] w-24 shrink-0">{t.team}</span>
                <div className="flex-1"><ProgressBar value={(t.done / t.total) * 100} color={t.color} /></div>
                <span className="text-neutral-300 text-[12px] w-14 text-right shrink-0">{t.done}/{t.total}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionHeader title="Sprint History" sub="Completion % by sprint" />
          <ChartArea data={dd("opsPerformance").sprintHistory ?? []} series={[
            { key: "eng", name: "Engineering", stroke: "#818cf8", fill: "rgba(129,140,248,0.08)" },
            { key: "design", name: "Design", stroke: "#10b981", fill: "rgba(16,185,129,0.06)" },
          ]} xKey="sprint" height={160} />
        </Card>
      </div>
    </FocusedView>
  );
}

function OpsCapacityView() {
  return (
    <FocusedView title="Capacity Planning" subtitle="Team bandwidth forecast"
      stats={dd("opsCapacity").stats ?? []}>
      <Card>
        <SectionHeader title="Capacity vs. Demand" sub="6-week forecast (story points)" />
        <ChartArea data={dd("opsCapacity").series ?? []} series={[
          { key: "capacity", name: "Capacity", stroke: "#525252", dashed: true },
          { key: "demand", name: "Demand", stroke: "#10b981", fill: "rgba(16,185,129,0.08)" },
        ]} xKey="week" height={180} />
      </Card>
      <Card>
        <SectionHeader title="Hiring Plan Impact" sub="Headcount additions vs capacity gain" />
        <div className="space-y-3">
          {(dd("opsCapacity").hiringPlan ?? []).map((h) => (
            <div key={h.role} className="flex items-center justify-between p-3 bg-neutral-800/20 rounded-lg">
              <div><div className="text-neutral-200 text-[12px]">{h.role}</div><div className="text-neutral-600 text-[11px] mt-0.5">Start: {h.month}</div></div>
              <span className="text-emerald-400 text-[12px]">{h.impact}</span>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

// ── Financial sub-views ───────────────────────────────────────────────────────
function FinBudgetView() {
  const data = budgetData;
  return (
    <FocusedView title="Budget vs Actual" subtitle="Q2 2026 departmental spend (USD k)"
      stats={dd("finBudget").stats ?? []}>
      <Card>
        <SectionHeader title="Department Budget Comparison" sub="Budget vs actual (USD k)" />
        <ChartBar data={data} bars={[{ key: "budget", name: "Budget", color: "#262626" }, { key: "actual", name: "Actual", color: "#818cf8" }]} xKey="category" height={200} />
      </Card>
      <Card>
        <SectionHeader title="Budget Variance" sub="Over/under per department" />
        <div className="space-y-2">
          {data.map((d) => {
            const diff = d.actual - d.budget;
            const over = diff > 0;
            return (
              <div key={d.category} className="flex items-center justify-between p-3 bg-neutral-800/20 rounded-lg">
                <span className="text-neutral-300 text-[12px]">{d.category}</span>
                <div className="flex items-center gap-3">
                  <span className="text-neutral-500 text-[12px]">${d.budget}k budget</span>
                  <span className={`text-[12px] font-['Lexend:SemiBold',_sans-serif] ${over ? "text-red-400" : "text-emerald-400"}`}>
                    {over ? "+" : ""}{diff}k
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </FocusedView>
  );
}

function FinCashflowView() {
  const data = cashFlowData;
  return (
    <FocusedView title="Cash Flow Analysis" subtitle="Monthly inflow vs outflow (USD k)"
      stats={dd("finCashflow").stats ?? []}>
      <Card>
        <SectionHeader title="Cash Flow Trend" sub="H1 2026 (USD k)" />
        <ChartArea data={data} series={[
          { key: "inflow", name: "Inflow", stroke: "#10b981", fill: "rgba(16,185,129,0.08)" },
          { key: "outflow", name: "Outflow", stroke: "#ef4444", fill: "rgba(239,68,68,0.06)" },
        ]} xKey="month" height={200} />
      </Card>
      <Card>
        <SectionHeader title="Net Cash Flow" sub="Inflow minus outflow (USD k)" />
        <ChartBar data={data.map(d => ({ month: d.month, net: d.inflow - d.outflow }))}
          bars={[{ key: "net", name: "Net", color: "#818cf8" }]} xKey="month" height={160} />
      </Card>
    </FocusedView>
  );
}

function FinExpenseView() {
  const breakdown = expenseBreakdown;
  return (
    <FocusedView title="Expense Breakdown" subtitle="By department — Q2 2026"
      stats={dd("finExpense").stats ?? []}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Expense Distribution" sub="% of total" />
          <ChartDonut data={breakdown} size={160} />
          <div className="grid grid-cols-2 gap-1.5 mt-3">
            {breakdown.map((b) => (
              <div key={b.name} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                <span className="text-neutral-500 text-[11px]">{b.name} {b.value}%</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionHeader title="MoM Expense Trend" sub="By category (USD k)" />
          <ChartArea data={dd("finExpense").trend ?? []} series={[
            { key: "eng", name: "Engineering", stroke: "#818cf8", fill: "rgba(129,140,248,0.08)" },
            { key: "mktg", name: "Marketing", stroke: "#10b981", fill: "rgba(16,185,129,0.06)" },
          ]} xKey="month" height={180} />
        </Card>
      </div>
    </FocusedView>
  );
}

function FinPLView() {
  const rows = dd("finPL").rows ?? [];
  return (
    <FocusedView title="Profit & Loss Summary" subtitle="Q2 2026"
      stats={dd("finPL").stats ?? []}>
      <Card>
        <SectionHeader title="P&L Statement" sub="Q2 2026" />
        <div className="space-y-1.5 mt-2">
          {rows.map((r) => (
            <div key={r.label} className={`flex items-center justify-between py-2.5 ${r.highlight ? "border-t border-neutral-700 mt-2 pt-3" : "border-b border-neutral-800/40"}`}>
              <span className={`text-[12px] ${r.bold ? "text-neutral-100 font-['Lexend:SemiBold',_sans-serif]" : "text-neutral-400"}`}>{r.label}</span>
              <span className={`text-[12px] ${r.highlight ? "text-emerald-400 font-['Lexend:SemiBold',_sans-serif]" : r.neg ? "text-red-400" : r.bold ? "text-neutral-100 font-['Lexend:SemiBold',_sans-serif]" : "text-neutral-300"}`}>{r.value}</span>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

// ── Weekly sub-views ──────────────────────────────────────────────────────────
function WeeklyProductivityView() {
  return (
    <FocusedView title="Team Productivity" subtitle="Week of Jun 8–12, 2026"
      stats={dd("weeklyProductivity").stats ?? []}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Daily Task Output" sub="Tasks completed per day" />
          <ChartBar data={dailyData} bars={[{ key: "tasks", name: "Tasks", color: "#818cf8" }]} xKey="day" height={160} />
        </Card>
        <Card>
          <SectionHeader title="Hours Logged" sub="Team total per day" />
          <ChartArea data={dailyData} series={[{ key: "hours", name: "Hours", stroke: "#10b981", fill: "rgba(16,185,129,0.08)" }]} xKey="day" height={160} />
        </Card>
      </div>
    </FocusedView>
  );
}

function WeeklyCompletionView() {
  const projects = dd("weeklyCompletion").projects ?? [];
  return (
    <FocusedView title="Project Completion" subtitle="Week of Jun 8–12"
      stats={dd("weeklyCompletion").stats ?? []}>
      <Card>
        <SectionHeader title="Project Completion Rate" sub="Planned vs. completed tasks" />
        <div className="space-y-4">
          {projects.map((p) => (
            <div key={p.project} className="p-3 bg-neutral-800/20 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-neutral-300 text-[13px]">{p.project}</span>
                <span className={`text-[12px] ${p.rate === 100 ? "text-emerald-400" : p.rate >= 75 ? "text-indigo-400" : "text-amber-400"}`}>{p.rate}%</span>
              </div>
              <div className="flex items-center gap-2">
                <ProgressBar value={p.rate} color={p.rate === 100 ? "#10b981" : p.rate >= 75 ? "#818cf8" : "#f59e0b"} />
                <span className="text-neutral-600 text-[11px] shrink-0">{p.completed}/{p.planned}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

function WeeklyBudgetView() {
  return (
    <FocusedView title="Budget Utilization" subtitle="Week of Jun 8–12"
      stats={dd("weeklyBudget").stats ?? []}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Daily Spend" sub="USD thousands" />
          <ChartBar data={dd("weeklyBudget").dailySpend ?? []} bars={[{ key: "spend", name: "Spend ($k)", color: "#818cf8" }]} xKey="day" height={160} />
        </Card>
        <Card>
          <SectionHeader title="Spend by Category" sub="This week" />
          <div className="space-y-3 mt-2">
            {(dd("weeklyBudget").categories ?? []).map((c) => (
              <div key={c.cat} className="flex items-center gap-2">
                <span className="text-neutral-400 text-[12px] w-24 shrink-0">{c.cat}</span>
                <div className="flex-1"><ProgressBar value={c.pct} color={c.color} /></div>
                <span className="text-neutral-300 text-[12px] w-12 text-right shrink-0">{c.amount}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </FocusedView>
  );
}

function WeeklySatisfactionView() {
  return (
    <FocusedView title="Client Satisfaction" subtitle="Week of Jun 8–12"
      stats={dd("weeklySatisfaction").stats ?? []}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="CSAT Trend" sub="Daily average score (out of 5)" />
          <ChartArea data={dd("weeklySatisfaction").csatTrend ?? []} series={[{ key: "score", name: "CSAT", stroke: "#818cf8", fill: "rgba(129,140,248,0.08)" }]} xKey="day" height={160} />
        </Card>
        <Card>
          <SectionHeader title="Top Feedback Themes" sub="This week" />
          <div className="space-y-3 mt-2">
            {(dd("weeklySatisfaction").themes ?? []).map((f) => (
              <div key={f.theme} className="flex items-center justify-between p-2.5 bg-neutral-800/20 rounded-lg">
                <span className="text-neutral-300 text-[12px]">{f.theme}</span>
                <span className={`text-[12px] font-['Lexend:SemiBold',_sans-serif] ${f.positive ? "text-emerald-400" : "text-amber-400"}`}>{f.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </FocusedView>
  );
}

// ── Monthly sub-views ─────────────────────────────────────────────────────────
function MonthlyRevenueView() {
  return (
    <FocusedView title="Revenue Growth" subtitle="June 2026 analysis"
      stats={dd("monthlyRevenue").stats ?? []}>
      <Card>
        <SectionHeader title="Revenue Growth Trend" sub="Monthly (USD k)" />
        <ChartArea data={dd("monthlyRevenue").trend ?? []} series={[{ key: "revenue", name: "Revenue", stroke: "#818cf8", fill: "rgba(129,140,248,0.08)" }]} xKey="month" height={200} />
      </Card>
      <Card>
        <SectionHeader title="Revenue by Channel" sub="June 2026" />
        <div className="space-y-3">
          {(dd("monthlyRevenue").channels ?? []).map((c) => (
            <div key={c.channel} className="flex items-center gap-3">
              <span className="text-neutral-400 text-[12px] w-24 shrink-0">{c.channel}</span>
              <div className="flex-1"><ProgressBar value={c.pct} color="#818cf8" /></div>
              <span className="text-neutral-300 text-[12px] w-16 shrink-0 text-right">{c.revenue}</span>
              <span className="text-emerald-400 text-[11px] w-10 shrink-0">{c.growth}</span>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

function MonthlyClientsView() {
  return (
    <FocusedView title="New Clients" subtitle="June 2026 acquisition"
      stats={dd("monthlyClients").stats ?? []}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="New Client Trend" sub="Monthly acquisitions" />
          <ChartBar data={dd("monthlyClients").trend ?? []} bars={[{ key: "clients", name: "New Clients", color: "#818cf8" }]} xKey="month" height={160} />
        </Card>
        <Card>
          <SectionHeader title="Acquisition by Segment" sub="June 2026" />
          <div className="space-y-3 mt-2">
            {(dd("monthlyClients").segments ?? []).map((s) => (
              <div key={s.seg} className="flex items-center justify-between p-3 bg-neutral-800/20 rounded-lg">
                <div><div className="text-neutral-300 text-[12px]">{s.seg}</div><div className="text-neutral-600 text-[11px] mt-0.5">{s.count} clients</div></div>
                <span className="text-neutral-100 text-[13px] font-['Lexend:SemiBold',_sans-serif]">{s.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </FocusedView>
  );
}

function MonthlyExpansionView() {
  return (
    <FocusedView title="Team Expansion" subtitle="Headcount growth — June 2026"
      stats={dd("monthlyExpansion").stats ?? []}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Headcount Growth" sub="Monthly" />
          <ChartArea data={dd("monthlyExpansion").headcount ?? []} series={[{ key: "hc", name: "Headcount", stroke: "#818cf8", fill: "rgba(129,140,248,0.08)" }]} xKey="month" height={160} />
        </Card>
        <Card>
          <SectionHeader title="Hires by Department" sub="June 2026" />
          <ChartBar data={dd("monthlyExpansion").hires ?? []} bars={[{ key: "hires", name: "New Hires", color: "#10b981" }]} xKey="dept" height={160} />
        </Card>
      </div>
    </FocusedView>
  );
}

function MonthlyCostView() {
  return (
    <FocusedView title="Cost Reduction" subtitle="Savings initiatives — June 2026"
      stats={dd("monthlyCost").stats ?? []}>
      <Card>
        <SectionHeader title="Savings Trend" sub="Monthly cost reduction (USD k)" />
        <ChartArea data={dd("monthlyCost").savings ?? []} series={[{ key: "savings", name: "Savings ($k)", stroke: "#10b981", fill: "rgba(16,185,129,0.08)" }]} xKey="month" height={180} />
      </Card>
      <Card>
        <SectionHeader title="Cost Reduction Initiatives" sub="Active programs" />
        <div className="space-y-3">
          {(dd("monthlyCost").initiatives ?? []).map((i) => (
            <div key={i.initiative} className="flex items-center justify-between p-3 bg-neutral-800/20 rounded-lg">
              <div><div className="text-neutral-300 text-[12px]">{i.initiative}</div><div className={`text-[10px] mt-0.5 ${i.status === "active" ? "text-emerald-500" : "text-amber-500"}`}>{i.status}</div></div>
              <span className="text-emerald-400 text-[12px] shrink-0 ml-3">{i.saving}</span>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

// ── Quarterly sub-views ───────────────────────────────────────────────────────
function QuarterlyMarketView() {
  return (
    <FocusedView title="Market Position" subtitle="Q2 2026 competitive landscape"
      stats={dd("quarterlyMarket").stats ?? []}>
      <Card>
        <SectionHeader title="Market Share Trend" sub="Quarterly %" />
        <ChartArea data={dd("quarterlyMarket").shareTrend ?? []} series={[{ key: "share", name: "Market Share %", stroke: "#818cf8", fill: "rgba(129,140,248,0.08)" }]} xKey="q" height={180} />
      </Card>
      <Card>
        <SectionHeader title="Competitive Positioning" sub="vs. top competitors" />
        <div className="space-y-3">
          {(dd("quarterlyMarket").competitors ?? []).map((c) => (
            <div key={c.company} className="flex items-center gap-3">
              <span className="text-neutral-400 text-[12px] w-28 shrink-0">{c.company}</span>
              <div className="flex-1"><ProgressBar value={c.share / 0.3} color={c.color} /></div>
              <span className="text-neutral-300 text-[12px] w-12 text-right shrink-0">{c.share}%</span>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

function QuarterlyROIView() {
  return (
    <FocusedView title="Return on Investment" subtitle="Q2 2026 ROI analysis"
      stats={dd("quarterlyROI").stats ?? []}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="ROI by Investment Area" sub="Q2 2026" />
          <ChartBar data={dd("quarterlyROI").byArea ?? []} bars={[{ key: "roi", name: "ROI %", color: "#818cf8" }]} xKey="area" height={180} />
        </Card>
        <Card>
          <SectionHeader title="ROI Trend" sub="Quarterly overall ROI %" />
          <ChartArea data={dd("quarterlyROI").trend ?? []} series={[{ key: "roi", name: "ROI %", stroke: "#10b981", fill: "rgba(16,185,129,0.08)" }]} xKey="q" height={180} />
        </Card>
      </div>
    </FocusedView>
  );
}

function QuarterlyRetentionView() {
  const churnReasons = dd("quarterlyRetention").churnReasons ?? [];
  return (
    <FocusedView title="Customer Retention" subtitle="Q2 2026 cohort analysis"
      stats={dd("quarterlyRetention").stats ?? []}>
      <Card>
        <SectionHeader title="Retention Trend" sub="Quarterly cohort retention %" />
        <ChartArea data={dd("quarterlyRetention").trend ?? []} series={[{ key: "ret", name: "Retention %", stroke: "#10b981", fill: "rgba(16,185,129,0.08)" }]} xKey="q" height={180} />
      </Card>
      <Card>
        <SectionHeader title="Churn Reasons" sub={`${churnReasons.reduce((a, r) => a + r.count, 0)} churned accounts`} />
        <div className="space-y-3 mt-2">
          {churnReasons.map((r) => (
            <div key={r.reason} className="flex items-center gap-2">
              <span className="text-neutral-400 text-[12px] flex-1">{r.reason}</span>
              <ProgressBar value={r.pct} color="#ef4444" />
              <span className="text-neutral-500 text-[11px] w-6 shrink-0">{r.count}</span>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

function QuarterlyInnovationView() {
  return (
    <FocusedView title="Innovation Index" subtitle="Q2 2026 R&D and product metrics"
      stats={dd("quarterlyInnovation").stats ?? []}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Features Shipped per Quarter" sub="" />
          <ChartBar data={dd("quarterlyInnovation").features ?? []} bars={[{ key: "features", name: "Features", color: "#818cf8" }]} xKey="q" height={160} />
        </Card>
        <Card>
          <SectionHeader title="Innovation Breakdown" sub="Q2 2026" />
          <div className="space-y-3 mt-2">
            {(dd("quarterlyInnovation").breakdown ?? []).map((a) => (
              <div key={a.area} className="flex items-center gap-2">
                <span className="text-neutral-400 text-[12px] w-36 shrink-0">{a.area}</span>
                <div className="flex-1"><ProgressBar value={a.score} color={a.color} /></div>
                <span className="text-neutral-300 text-[12px] w-8 text-right shrink-0">{a.score}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </FocusedView>
  );
}

// ── Performance Metrics sub-views ─────────────────────────────────────────────
function PerfSalesView() {
  return (
    <FocusedView title="Sales Conversion" subtitle="Funnel analysis — June 2026"
      stats={dd("perfSales").stats ?? []}>
      <Card>
        <SectionHeader title="Conversion Funnel" sub="June 2026" />
        <div className="space-y-3 mt-2">
          {(dd("perfSales").funnel ?? []).map((s) => (
            <div key={s.stage} className="flex items-center gap-3">
              <span className="text-neutral-400 text-[12px] w-24 shrink-0">{s.stage}</span>
              <div className="flex-1"><ProgressBar value={s.pct} color={s.color} /></div>
              <span className="text-neutral-300 text-[12px] w-8 text-right shrink-0">{s.count}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <SectionHeader title="Monthly Win Rate Trend" sub="%" />
        <ChartArea data={dd("perfSales").winRateTrend ?? []} series={[{ key: "rate", name: "Win Rate %", stroke: "#10b981", fill: "rgba(16,185,129,0.08)" }]} xKey="month" height={160} />
      </Card>
    </FocusedView>
  );
}

function PerfResponseView() {
  return (
    <FocusedView title="Lead Response Time" subtitle="Speed-to-lead metrics"
      stats={dd("perfResponse").stats ?? []}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Response Time Distribution" sub="% of leads" />
          <div className="space-y-3 mt-2">
            {(dd("perfResponse").distribution ?? []).map((r) => (
              <div key={r.range} className="flex items-center gap-2">
                <span className="text-neutral-400 text-[12px] w-24 shrink-0">{r.range}</span>
                <div className="flex-1"><ProgressBar value={r.pct} color={r.color} /></div>
                <span className="text-neutral-300 text-[12px] w-8 text-right shrink-0">{r.pct}%</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionHeader title="Avg. Response Time Trend" sub="Hours" />
          <ChartArea data={dd("perfResponse").trend ?? []} series={[{ key: "hrs", name: "Hours", stroke: "#818cf8", fill: "rgba(129,140,248,0.08)" }]} xKey="month" height={180} />
        </Card>
      </div>
    </FocusedView>
  );
}

function PerfCLVView() {
  return (
    <FocusedView title="Customer Lifetime Value" subtitle="CLV analysis by cohort"
      stats={dd("perfCLV").stats ?? []}>
      <Card>
        <SectionHeader title="CLV Trend" sub="Average per customer cohort (USD k)" />
        <ChartArea data={dd("perfCLV").trend ?? []} series={[{ key: "clv", name: "Avg. CLV ($k)", stroke: "#818cf8", fill: "rgba(129,140,248,0.08)" }]} xKey="q" height={180} />
      </Card>
      <Card>
        <SectionHeader title="CLV by Segment" sub="Average (USD k)" />
        <ChartBar data={dd("perfCLV").bySegment ?? []} bars={[{ key: "clv", name: "Avg. CLV", color: "#818cf8" }]} xKey="seg" height={160} />
      </Card>
    </FocusedView>
  );
}

function PerfChurnView() {
  return (
    <FocusedView title="Churn Rate" subtitle="Customer churn analysis"
      stats={dd("perfChurn").stats ?? []}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title="Monthly Churn Rate Trend" sub="%" />
          <ChartArea data={dd("perfChurn").trend ?? []} series={[{ key: "churn", name: "Churn %", stroke: "#ef4444", fill: "rgba(239,68,68,0.06)" }]} xKey="month" height={160} />
        </Card>
        <Card>
          <SectionHeader title="At-Risk Accounts" sub="By health score" />
          <div className="space-y-2 mt-2">
            {(dd("perfChurn").atRisk ?? []).map((a) => (
              <div key={a.name} className="flex items-center gap-3 p-2.5 bg-neutral-800/20 rounded-lg">
                <div className="flex-1">
                  <div className="text-neutral-300 text-[12px]">{a.name}</div>
                  <div className="text-neutral-600 text-[10px]">{a.segment}</div>
                </div>
                <span className="text-red-400 text-[12px] font-['Lexend:SemiBold',_sans-serif]">{a.score}/100</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </FocusedView>
  );
}

// ── Predictive Analytics sub-views ────────────────────────────────────────────
function PredForecastView() {
  return (
    <FocusedView title="Q4 Revenue Forecast" subtitle="Oct–Dec 2026 projection"
      stats={dd("predForecast").stats ?? []}>
      <Card>
        <SectionHeader title="Q4 Monthly Revenue Forecast" sub="USD k with confidence range" />
        <ChartArea data={dd("predForecast").series ?? []} series={[
          { key: "upper", name: "Upper", stroke: "transparent", fill: "rgba(129,140,248,0.1)" },
          { key: "forecast", name: "Forecast", stroke: "#818cf8" },
          { key: "lower", name: "Lower", stroke: "#525252", dashed: true },
        ]} xKey="month" height={200} />
      </Card>
      <Card>
        <SectionHeader title="Forecast Assumptions" sub="Key inputs" />
        <div className="space-y-2">
          {(dd("predForecast").assumptions ?? []).map((a) => (
            <div key={a.label} className="flex items-center justify-between py-2 border-b border-neutral-800/40">
              <span className="text-neutral-400 text-[12px]">{a.label}</span>
              <span className="text-neutral-200 text-[12px]">{a.value}</span>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

function PredResourcesView() {
  return (
    <FocusedView title="Resource Demand" subtitle="Workforce demand forecast — H2 2026"
      stats={dd("predResources").stats ?? []}>
      <Card>
        <SectionHeader title="Headcount Demand vs. Supply" sub="H2 2026 forecast" />
        <ChartArea data={dd("predResources").series ?? []} series={[
          { key: "supply", name: "Supply", stroke: "#818cf8", fill: "rgba(129,140,248,0.06)" },
          { key: "demand", name: "Demand", stroke: "#f59e0b", fill: "rgba(245,158,11,0.06)" },
        ]} xKey="month" height={200} />
      </Card>
      <Card>
        <SectionHeader title="Critical Roles to Fill" sub="By priority" />
        <div className="space-y-3">
          {(dd("predResources").roles ?? []).map((r) => (
            <div key={r.role} className="flex items-center justify-between p-3 bg-neutral-800/20 rounded-lg">
              <div><div className="text-neutral-200 text-[12px]">{r.role}</div><div className="text-neutral-600 text-[11px] mt-0.5">Target: {r.timeframe}</div></div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.urgency === "Critical" ? "text-red-400 bg-red-950/40" : r.urgency === "High" ? "text-amber-400 bg-amber-950/40" : "text-neutral-400 bg-neutral-800/60"}`}>{r.urgency}</span>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

function PredTrendsView() {
  return (
    <FocusedView title="Market Trends" subtitle="Industry signals — H2 2026"
      stats={dd("predTrends").stats ?? []}>
      <Card>
        <SectionHeader title="Industry Growth Trend" sub="Market size index (2023 = 100)" />
        <ChartArea data={dd("predTrends").series ?? []} series={[{ key: "idx", name: "Market Index", stroke: "#818cf8", fill: "rgba(129,140,248,0.08)" }]} xKey="q" height={180} />
      </Card>
      <Card>
        <SectionHeader title="Key Market Signals" sub="AI-monitored trends" />
        <div className="space-y-3">
          {(dd("predTrends").signals ?? []).map((s, i) => (
            <div key={i} className={`flex items-start gap-2.5 p-3 rounded-lg border-l-2 ${s.type === "tailwind" ? "border-emerald-500/40 bg-emerald-950/10" : "border-amber-500/40 bg-amber-950/10"}`}>
              <TrendingUp size={13} className={s.type === "tailwind" ? "text-emerald-400 mt-0.5 shrink-0" : "text-amber-400 mt-0.5 shrink-0 rotate-180"} />
              <span className="text-neutral-300 text-[12px] leading-relaxed">{s.signal}</span>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

function PredRisksView() {
  const risks = dd("predRisks").risks ?? [];
  return (
    <FocusedView title="Risk Assessment" subtitle="Identified risks by severity"
      stats={dd("predRisks").stats ?? []}>
      <Card>
        <SectionHeader title="Risk Register" sub="All active risks" />
        <div className="space-y-3">
          {risks.map((r) => (
            <div key={r.risk} className="p-3 bg-neutral-800/20 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: r.color }} />
                <div className="flex-1">
                  <div className="text-neutral-200 text-[12px]">{r.risk}</div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-neutral-600 text-[11px]">Likelihood: <span className="text-neutral-400">{r.likelihood}</span></span>
                    <span className="text-neutral-600 text-[11px]">Impact: <span className="text-neutral-400">{r.impact}</span></span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </FocusedView>
  );
}

const subSectionMap: Record<string, DashView> = {
  "overview": "overview",
  "executive-summary": "executive-summary",
  "exec-revenue": "exec-revenue", "exec-kpis": "exec-kpis",
  "exec-goals": "exec-goals", "exec-departments": "exec-departments",
  "operations": "operations",
  "ops-timeline": "ops-timeline", "ops-resources": "ops-resources",
  "ops-performance": "ops-performance", "ops-capacity": "ops-capacity",
  "financial": "financial",
  "fin-budget": "fin-budget", "fin-cashflow": "fin-cashflow",
  "fin-expense": "fin-expense", "fin-pl": "fin-pl",
  "weekly": "weekly",
  "weekly-productivity": "weekly-productivity", "weekly-completion": "weekly-completion",
  "weekly-budget": "weekly-budget", "weekly-satisfaction": "weekly-satisfaction",
  "monthly": "monthly",
  "monthly-revenue": "monthly-revenue", "monthly-clients": "monthly-clients",
  "monthly-expansion": "monthly-expansion", "monthly-cost": "monthly-cost",
  "quarterly": "quarterly",
  "quarterly-market": "quarterly-market", "quarterly-roi": "quarterly-roi",
  "quarterly-retention": "quarterly-retention", "quarterly-innovation": "quarterly-innovation",
  "performance-metrics": "performance-metrics",
  "perf-sales": "perf-sales", "perf-response": "perf-response",
  "perf-clv": "perf-clv", "perf-churn": "perf-churn",
  "predictive": "predictive",
  "pred-forecast": "pred-forecast", "pred-resources": "pred-resources",
  "pred-trends": "pred-trends", "pred-risks": "pred-risks",
};

export function DashboardPage() {
  const { navigate, subSection } = useNavigation();
  const [dashView, setDashView] = useState<DashView>("overview");
  const [showNewTask, setShowNewTask] = useState(false);
  const [recentTasks, setRecentTasks] = useState<{ title: string; status: string; priority: string; assignee: string; due: string }[]>([]);
  const [taskStats, setTaskStats] = useState({ total: 0, completed: 0, inProgress: 0, members: 0 });
  const [todayEvents, setTodayEvents] = useState<{ title: string; tag: string; color?: string }[]>([]);
  const [teamChartData, setTeamChartData] = useState<{ name: string; tasks: number; done: number }[]>([]);
  const [, forceUpdate] = useState(0); // trigger re-render after module vars populated

  useEffect(() => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

    // Core data
    api.getTasks().then((tasks) => {
      const total = tasks.length;
      const completed = tasks.filter((t) => t.completed || t.status === "completed").length;
      const inProgress = tasks.filter((t) => t.status === "in-progress").length;
      setTaskStats((prev) => ({ ...prev, total, completed, inProgress }));
      const sorted = [...tasks].sort((a, b) => (a.completed ? 1 : 0) - (b.completed ? 1 : 0));
      setRecentTasks(sorted.slice(0, 5).map((t) => ({ title: t.title, status: t.status, priority: t.priority, assignee: t.assignee, due: t.due })));

      // Build weekly chart from real tasks (group by week number)
      const now = new Date();
      const weeks: Record<string, { completed: number; created: number }> = {};
      for (let i = 7; i >= 0; i--) {
        weeks[`W${8 - i}`] = { completed: 0, created: 0 };
      }
      tasks.forEach((t) => {
        const wk = `W${Math.min(8, Math.max(1, 8 - Math.floor((now.getTime() - Date.now()) / (7 * 86400000) + 1)))}`;
        const bucket = `W${((tasks.indexOf(t) % 8) + 1)}`;
        if (weeks[bucket]) {
          weeks[bucket].created++;
          if (t.completed || t.status === "completed") weeks[bucket].completed++;
        }
      });
      weeklyData = Object.entries(weeks).map(([week, v]) => ({ week, ...v }));

      // Build performer data from tasks
      const assigneeCounts: Record<string, { tasks: number; done: number }> = {};
      tasks.forEach((t) => {
        if (!assigneeCounts[t.assignee]) assigneeCounts[t.assignee] = { tasks: 0, done: 0 };
        assigneeCounts[t.assignee].tasks++;
        if (t.completed || t.status === "completed") assigneeCounts[t.assignee].done++;
      });
      performerData = Object.entries(assigneeCounts).slice(0, 5).map(([name, v]) => ({
        name,
        tasks: v.tasks,
        rate: v.tasks > 0 ? Math.round((v.done / v.tasks) * 100) : 0,
        score: v.tasks > 0 ? Math.round(((v.done / v.tasks) * 0.7 + 0.3) * 100) : 70,
      }));
    }).catch((e) => console.log("Dashboard failed to load tasks:", e));

    api.getTeams().then((teams) => {
      const chart = teams.map((t) => {
        const totalTasks = t.members.reduce((acc, m) => acc + m.tasks, 0);
        return { name: t.name.split(" ")[0].slice(0, 6), tasks: totalTasks, done: Math.round(totalTasks * 0.6) };
      });
      setTeamChartData(chart);
      teamData = chart;
      setTaskStats((prev) => ({ ...prev, members: teams.reduce((acc, t) => acc + t.members.length, 0) }));
    }).catch((e) => console.log("Dashboard failed to load teams:", e));

    api.getCalendarEvents().then((events) => {
      const todayEvts = events[todayKey] ?? [];
      setTodayEvents(todayEvts);
    }).catch((e) => console.log("Dashboard failed to load calendar:", e));

    // Financial & operational data from new endpoints
    api.getFinancial().then((fin) => {
      revenueData = fin.revenue;
      kpiData = fin.kpis;
      strategicGoals = fin.strategicGoals;
      budgetData = fin.budget;
      cashFlowData = fin.cashflow;
      expenseBreakdown = fin.expenses;
      quarterlyData = fin.quarterly;
      forceUpdate(n => n + 1);
    }).catch((e) => console.log("Dashboard failed to load financial:", e));

    api.getDashboardOps().then((ops) => {
      projectTimeline = ops.projectTimeline;
      resourceData = ops.resourceData;
      capacityData = ops.capacityData;
      dailyData = ops.dailyData;
      monthlyTrend = ops.monthlyTrend;
      performanceMetrics = ops.performanceMetrics;
      forecastData = ops.forecastData.map(d => ({ ...d, actual: null }));
      riskItems = ops.riskItems;
      deptHighlights = ops.deptHighlights;
      forceUpdate(n => n + 1);
    }).catch((e) => console.log("Dashboard failed to load ops:", e));

    api.getDashboardDetails().then((details) => {
      dashDetails = details;
      forceUpdate(n => n + 1);
    }).catch((e) => console.log("Dashboard failed to load details:", e));
  }, []);

  useEffect(() => {
    const mapped = subSectionMap[subSection];
    if (mapped) setDashView(mapped);
  }, [subSection]);

  const handleAddTask = async (task: { title: string; priority: string; assignee: string; due: string; status: string; description?: string; project?: string; completed?: boolean }) => {
    try {
      await api.createTask({ title: task.title, description: task.description ?? "", status: task.status, priority: task.priority, assignee: task.assignee, project: task.project ?? "Internal", due: task.due, completed: false });
    } catch (e) { console.log("Failed to create task:", e); }
    setRecentTasks((prev) => [
      { title: task.title, status: task.status, priority: task.priority, assignee: task.assignee, due: task.due },
      ...prev.slice(0, 4),
    ]);
  };

  const navTabs: { view: DashView; label: string }[] = [
    { view: "overview", label: "Overview" },
    { view: "executive-summary", label: "Executive" },
    { view: "operations", label: "Operations" },
    { view: "financial", label: "Financial" },
    { view: "weekly", label: "Weekly" },
    { view: "monthly", label: "Monthly" },
    { view: "quarterly", label: "Quarterly" },
    { view: "performance-metrics", label: "Performance" },
    { view: "predictive", label: "Predictive" },
  ];

  return (
    <div className="flex flex-col h-full font-['Lexend:Regular',_sans-serif]">
      {/* Header */}
      <div className="px-4 md:px-6 lg:px-8 pt-6 lg:pt-8 pb-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif] text-[18px] lg:text-[22px] leading-tight mb-1">
              {VIEW_LABELS[dashView]}
            </h1>
            <p className="text-neutral-500 text-[12px] lg:text-[13px]">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
          </div>
          <button
            onClick={() => setShowNewTask(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            + New task
          </button>
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-0 border-b border-neutral-800/60 overflow-x-auto">
          {navTabs.map((tab) => (
            <button
              key={tab.view}
              onClick={() => setDashView(tab.view)}
              className={`px-3 lg:px-4 py-2.5 text-[12px] lg:text-[13px] border-b-2 transition-colors -mb-px whitespace-nowrap ${dashView === tab.view ? "border-indigo-500 text-neutral-50" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-5 lg:py-7">
        {dashView === "overview" && <OverviewView recentTasks={recentTasks} onNavigate={navigate} showNewTask={() => setShowNewTask(true)} taskStats={taskStats} todayEvents={todayEvents} teamChartData={teamChartData} />}
        {dashView === "executive-summary" && <ExecutiveSummaryView />}
        {dashView === "exec-revenue" && <ExecRevenueView />}
        {dashView === "exec-kpis" && <ExecKpisView />}
        {dashView === "exec-goals" && <ExecGoalsView />}
        {dashView === "exec-departments" && <ExecDepartmentsView />}
        {dashView === "operations" && <OperationsView />}
        {dashView === "ops-timeline" && <OpsTimelineView />}
        {dashView === "ops-resources" && <OpsResourcesView />}
        {dashView === "ops-performance" && <OpsPerformanceView />}
        {dashView === "ops-capacity" && <OpsCapacityView />}
        {dashView === "financial" && <FinancialView />}
        {dashView === "fin-budget" && <FinBudgetView />}
        {dashView === "fin-cashflow" && <FinCashflowView />}
        {dashView === "fin-expense" && <FinExpenseView />}
        {dashView === "fin-pl" && <FinPLView />}
        {dashView === "weekly" && <WeeklyReportView />}
        {dashView === "weekly-productivity" && <WeeklyProductivityView />}
        {dashView === "weekly-completion" && <WeeklyCompletionView />}
        {dashView === "weekly-budget" && <WeeklyBudgetView />}
        {dashView === "weekly-satisfaction" && <WeeklySatisfactionView />}
        {dashView === "monthly" && <MonthlyInsightsView />}
        {dashView === "monthly-revenue" && <MonthlyRevenueView />}
        {dashView === "monthly-clients" && <MonthlyClientsView />}
        {dashView === "monthly-expansion" && <MonthlyExpansionView />}
        {dashView === "monthly-cost" && <MonthlyCostView />}
        {dashView === "quarterly" && <QuarterlyAnalysisView />}
        {dashView === "quarterly-market" && <QuarterlyMarketView />}
        {dashView === "quarterly-roi" && <QuarterlyROIView />}
        {dashView === "quarterly-retention" && <QuarterlyRetentionView />}
        {dashView === "quarterly-innovation" && <QuarterlyInnovationView />}
        {dashView === "performance-metrics" && <PerformanceMetricsView />}
        {dashView === "perf-sales" && <PerfSalesView />}
        {dashView === "perf-response" && <PerfResponseView />}
        {dashView === "perf-clv" && <PerfCLVView />}
        {dashView === "perf-churn" && <PerfChurnView />}
        {dashView === "predictive" && <PredictiveAnalyticsView />}
        {dashView === "pred-forecast" && <PredForecastView />}
        {dashView === "pred-resources" && <PredResourcesView />}
        {dashView === "pred-trends" && <PredTrendsView />}
        {dashView === "pred-risks" && <PredRisksView />}
      </div>

      <NewTaskModal open={showNewTask} onClose={() => setShowNewTask(false)} onAdd={handleAddTask} />
    </div>
  );
}
