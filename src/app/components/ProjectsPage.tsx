import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, CheckCircle, Circle, Clock, Users, BarChart2, AlertCircle, ChevronRight } from "lucide-react";
import { NewProjectModal, type Project } from "./modals/NewProjectModal";
import { ProjectDetailModal } from "./modals/ProjectDetailModal";
import { useNavigation } from "./NavigationContext";
import { PLAN_LIMITS, useSubscription, type PlanId } from "../subscription/SubscriptionContext";
import * as api from "../utils/api";
import { useLang } from "../i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProjView =
  | "grid"
  | "web-application" | "proj-web-frontend" | "proj-web-api" | "proj-web-qa"
  | "mobile-app" | "proj-mobile-design" | "proj-mobile-native"
  | "proj-completed" | "proj-archived";

const subSectionMap: Record<string, ProjView> = {
  "all": "grid",
  "web-application": "web-application",
  "proj-web-frontend": "proj-web-frontend",
  "proj-web-api": "proj-web-api",
  "proj-web-qa": "proj-web-qa",
  "mobile-app": "mobile-app",
  "proj-mobile-design": "proj-mobile-design",
  "proj-mobile-native": "proj-mobile-native",
  "proj-completed": "proj-completed",
  "proj-archived": "proj-archived",
  "completed": "proj-completed",
  "archived": "proj-archived",
};

const VIEW_LABELS: Record<ProjView, string> = {
  "grid": "Projects",
  "web-application": "Web Application v2",
  "proj-web-frontend": "Frontend Development",
  "proj-web-api": "API Integration",
  "proj-web-qa": "Testing & QA",
  "mobile-app": "Mobile App — iOS & Android",
  "proj-mobile-design": "UI/UX Design",
  "proj-mobile-native": "Native Development",
  "proj-completed": "Completed Projects",
  "proj-archived": "Archived Projects",
};

// ── Shared sub-components ─────────────────────────────────────────────────────

const statusCfg: Record<string, { label: string; color: string; dot: string }> = {
  completed: { label: "Done", color: "#10b981", dot: "#10b981" },
  "in-progress": { label: "In Progress", color: "#f59e0b", dot: "#f59e0b" },
  todo: { label: "Todo", color: "#525252", dot: "#404040" },
  review: { label: "Review", color: "#3b82f6", dot: "#3b82f6" },
};

const priorityCfg: Record<string, { label: string; color: string }> = {
  high: { label: "High", color: "#ef4444" },
  medium: { label: "Medium", color: "#f59e0b" },
  low: { label: "Low", color: "#525252" },
};

const projectStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "#10b981", bg: "bg-emerald-950/40" },
  paused: { label: "Paused", color: "#f59e0b", bg: "bg-amber-950/40" },
  completed: { label: "Completed", color: "#6366f1", bg: "bg-indigo-950/40" },
};

const tagColors = [
  "text-neutral-400 bg-neutral-800/60",
  "text-blue-400 bg-blue-950/40",
  "text-purple-400 bg-purple-950/40",
  "text-emerald-400 bg-emerald-950/40",
];

function StatCard({ label, value, sub, up }: { label: string; value: string; sub?: string; up?: boolean }) {
  return (
    <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5">
      <div className="text-neutral-400 text-[12px] mb-2">{label}</div>
      <div className="text-neutral-50 text-[26px] font-['Lexend:SemiBold',_sans-serif] leading-none mb-2">{value}</div>
      {sub && (
        <div className={`flex items-center gap-1 text-[11px] ${up === true ? "text-emerald-400" : up === false ? "text-red-400" : "text-neutral-500"}`}>
          {up === true && <TrendingUp size={11} />}
          {up === false && <TrendingDown size={11} />}
          {sub}
        </div>
      )}
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

function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <div className="text-neutral-100 text-[13px] font-['Lexend:SemiBold',_sans-serif]">{title}</div>
      {sub && <div className="text-neutral-500 text-[11px] mt-0.5">{sub}</div>}
    </div>
  );
}

function ProgressBar({ value, color = "#6366f1" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
    </div>
  );
}

function AvatarGroup({ members }: { members: string[] }) {
  return (
    <div className="flex -space-x-1.5">
      {members.slice(0, 4).map((m, i) => (
        <div key={i} className="w-6 h-6 rounded-full bg-neutral-700 border border-[#141414] flex items-center justify-center text-[10px] text-neutral-300 font-['Lexend:SemiBold',_sans-serif]">{m}</div>
      ))}
      {members.length > 4 && (
        <div className="w-6 h-6 rounded-full bg-neutral-800 border border-[#141414] flex items-center justify-center text-[10px] text-neutral-500">+{members.length - 4}</div>
      )}
    </div>
  );
}

type TaskItem = { id: number; title: string; status: string; priority: string; assignee: string; due: string };

function TaskTable({ tasks }: { tasks: TaskItem[] }) {
  const done = tasks.filter((t) => t.status === "completed").length;
  const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-neutral-500 text-[11px]">{done} of {tasks.length} completed</span>
        <span className="text-neutral-500 text-[11px]">{pct}%</span>
      </div>
      <ProgressBar value={pct} />
      <div className="mt-4 space-y-1">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-800/20 transition-colors">
            {t.status === "completed"
              ? <CheckCircle size={14} className="text-emerald-500 shrink-0" />
              : t.status === "in-progress"
              ? <Clock size={14} className="text-amber-400 shrink-0" />
              : <Circle size={14} className="text-neutral-600 shrink-0" />}
            <span className={`flex-1 text-[12px] truncate ${t.status === "completed" ? "line-through text-neutral-600" : "text-neutral-300"}`}>{t.title}</span>
            <span className="text-[10px] shrink-0" style={{ color: priorityCfg[t.priority].color }}>{priorityCfg[t.priority].label}</span>
            <div className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center text-[9px] text-neutral-400 shrink-0">{t.assignee}</div>
            <span className="text-neutral-600 text-[10px] w-10 text-right shrink-0 hidden sm:block">{t.due}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── View: Project grid (default) ──────────────────────────────────────────────

function ProjectGrid({
  projects, filter, setFilter, onSelect, onNew, t,
}: {
  projects: Project[]; filter: string; setFilter: (f: string) => void;
  onSelect: (p: Project) => void; onNew: () => void;
  t: (path: string) => string;
}) {
  const ALL = "All";
  const filters: { value: string; label: string }[] = [
    { value: "All", label: t("projects.all") },
    { value: "Active", label: t("projects.active") },
    { value: "Paused", label: t("projects.paused") },
    { value: "Completed", label: t("projects.completedNav") },
  ];
  const filtered = filter === "All" ? projects : projects.filter((p) => p.status === filter.toLowerCase());
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 lg:px-8 pt-6 lg:pt-8 pb-5 border-b border-neutral-800/40">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif] text-[18px] lg:text-[22px] leading-tight mb-1">{t("projects.allProjectsNav")}</h1>
            <p className="text-neutral-500 text-[12px] lg:text-[13px]">
              {projects.filter((p) => p.status === "active").length} {t("projects.active")} · {projects.filter((p) => p.status === "completed").length} {t("projects.completedNav")}
            </p>
          </div>
          <button onClick={onNew} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors shrink-0">
            + {t("projects.newProject")}
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {filters.map((f) => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-[12px] lg:text-[13px] transition-colors whitespace-nowrap ${filter === f.value ? "bg-neutral-800 text-neutral-50" : "text-neutral-500 hover:text-neutral-300"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((project) => (
            <div key={project.id} onClick={() => onSelect(project)}
              className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 lg:p-5 hover:border-neutral-700/60 transition-colors cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif] truncate mr-3 flex-1">{project.name}</h3>
                <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded shrink-0 ${projectStatusConfig[project.status].bg}`}
                  style={{ color: projectStatusConfig[project.status].color }}>
                  {projectStatusConfig[project.status].label}
                </span>
              </div>
              <p className="text-neutral-500 text-[12px] leading-relaxed mb-4 line-clamp-2">{project.description}</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {project.tags.map((tag, i) => (
                  <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full ${tagColors[i % tagColors.length]}`}>{tag}</span>
                ))}
              </div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-neutral-600 text-[11px]">{project.tasks.done} / {project.tasks.total} {t("projects.tasks")}</span>
                  <span className="text-neutral-500 text-[11px]">{project.progress}%</span>
                </div>
                <ProgressBar value={project.progress} />
              </div>
              <div className="flex items-center justify-between">
                <AvatarGroup members={project.team} />
                <span className="text-neutral-600 text-[12px]">{t("projects.due")} {project.due}</span>
              </div>
            </div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-neutral-600 text-[13px]">{t("projects.noProjectsInCategory")}</div>
        )}
      </div>
    </div>
  );
}

// ── View: Web Application overview ────────────────────────────────────────────

function WebAppView({ onDrillDown, allTasks, webMilestones, projects, t }: { onDrillDown: (v: ProjView) => void; allTasks: TaskItem[]; webMilestones: { milestone: string; date: string; done: boolean }[]; projects: Project[]; t: (path: string) => string; }){
  const proj = projects.find((p) => p.name.toLowerCase().includes("web app") || p.name.toLowerCase().includes("web application"));
  const webTasks = allTasks.filter((t) => t.project === "Web Application v2" || t.project === "Web App v2");
  const frontendTasks = webTasks.filter((t) => !t.title.toLowerCase().includes("api") && !t.title.toLowerCase().includes("test") && !t.title.toLowerCase().includes("auth endpoint"));
  const apiTasks = webTasks.filter((t) => t.title.toLowerCase().includes("api") || t.title.toLowerCase().includes("endpoint") || t.title.toLowerCase().includes("webhook"));
  const qaTasks = webTasks.filter((t) => t.title.toLowerCase().includes("test") || t.title.toLowerCase().includes("qa") || t.title.toLowerCase().includes("bug"));
  const areas = [
    { label: t("projects.frontendDevelopment"), view: "proj-web-frontend" as ProjView, tasks: frontendTasks, color: "#818cf8", team: [...new Set(frontendTasks.map((t) => t.assignee))] },
    { label: t("projects.apiIntegration"), view: "proj-web-api" as ProjView, tasks: apiTasks, color: "#10b981", team: [...new Set(apiTasks.map((t) => t.assignee))] },
    { label: t("projects.testingQa"), view: "proj-web-qa" as ProjView, tasks: qaTasks, color: "#f59e0b", team: [...new Set(qaTasks.map((t) => t.assignee))] },
  ];
  const totalDone = webTasks.filter(t => t.status === "completed").length;
  const pct = webTasks.length > 0 ? Math.round((totalDone / webTasks.length) * 100) : 0;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t("projects.overallProgress")} value={`${pct}%`} sub={`${totalDone}/${webTasks.length} ${t("projects.tasks")}`} up={pct >= 50} />
        <StatCard label={t("projects.tasksDone")} value={`${totalDone}/${webTasks.length}`} sub={`${webTasks.length - totalDone} ${t("projects.remaining")}`} />
        <StatCard label={t("projects.dueDate")} value={proj?.due ?? "—"} sub={t("projects.targetDeadline")} />
        <StatCard label={t("projects.teamSize")} value={`${[...new Set(webTasks.map(t => t.assignee))].length}`} sub={[...new Set(webTasks.map(t => t.assignee))].join(", ") || "—"} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title={t("projects.sprintProgress")} sub={t("projects.currentSprint")} />
          <div className="space-y-3">
            {[
              { label: t("projects.tasksCompletedStat"), value: totalDone, total: webTasks.length, color: "#818cf8" },
              { label: t("projects.inProgressTasks"), value: webTasks.filter(t => t.status === "in-progress").length, total: webTasks.length, color: "#10b981" },
              { label: t("projects.inReviewTasks"), value: webTasks.filter(t => t.status === "review").length, total: webTasks.length, color: "#f59e0b" },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-neutral-400 text-[12px]">{s.label}</span>
                  <span className="text-neutral-300 text-[12px]">{s.value}/{s.total}</span>
                </div>
                <ProgressBar value={(s.value / Math.max(s.total, 1)) * 100} color={s.color} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title={t("projects.milestones")} sub={t("projects.keyDeliveryDates")} />
          <div className="space-y-3">
            {webMilestones.map((m) => (
              <div key={m.milestone} className="flex items-center gap-3 p-2.5 rounded-lg bg-neutral-800/20">
                {m.done
                  ? <CheckCircle size={15} className="text-emerald-500 shrink-0" />
                  : <Circle size={15} className="text-neutral-600 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className={`text-[12px] ${m.done ? "line-through text-neutral-600" : "text-neutral-300"}`}>{m.milestone}</div>
                </div>
                <span className="text-neutral-500 text-[11px] shrink-0">{m.date}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {areas.map((a) => {
          const done = a.tasks.filter((t) => t.status === "completed").length;
          const pct = Math.round((done / a.tasks.length) * 100);
          return (
            <div key={a.label} onClick={() => onDrillDown(a.view)}
              className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 hover:border-neutral-700/60 transition-colors cursor-pointer group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-neutral-200 text-[13px] font-['Lexend:SemiBold',_sans-serif]">{a.label}</span>
                <ChevronRight size={14} className="text-neutral-600 group-hover:text-neutral-400 transition-colors" />
              </div>
              <div className="text-neutral-50 text-[24px] font-['Lexend:SemiBold',_sans-serif] mb-1" style={{ color: a.color }}>{pct}%</div>
              <div className="text-neutral-600 text-[11px] mb-3">{done}/{a.tasks.length} {t("projects.tasks")}</div>
              <ProgressBar value={pct} color={a.color} />
              <div className="flex items-center justify-between mt-3">
                <AvatarGroup members={a.team} />
                <span className={`text-[10px] px-2 py-0.5 rounded-full`}
                  style={{ color: a.color, backgroundColor: `${a.color}18` }}>
                  {a.tasks.filter((t) => t.status === "in-progress").length} {t("projects.active")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── View: Mobile App overview ─────────────────────────────────────────────────

function MobileAppView({ onDrillDown, allTasks, mobileMilestones, projects, t }: { onDrillDown: (v: ProjView) => void; allTasks: TaskItem[]; mobileMilestones: { milestone: string; date: string; done: boolean }[]; projects: Project[]; t: (path: string) => string; }) {
  const proj = projects.find((p) => p.name.toLowerCase().includes("mobile"));
  const mobileTasks = allTasks.filter((t) => t.project === "Mobile App");
  const designTasks = mobileTasks.filter((t) => t.title.toLowerCase().includes("design") || t.title.toLowerCase().includes("ui") || t.title.toLowerCase().includes("wireframe") || t.title.toLowerCase().includes("mockup"));
  const nativeTasks = mobileTasks.filter((t) => !t.title.toLowerCase().includes("design") && !t.title.toLowerCase().includes("ui") && !t.title.toLowerCase().includes("wireframe"));
  const areas = [
    { label: t("projects.uiUxDesign"), view: "proj-mobile-design" as ProjView, tasks: designTasks, color: "#818cf8", team: [...new Set(designTasks.map((t) => t.assignee))] },
    { label: t("projects.nativeDevelopment"), view: "proj-mobile-native" as ProjView, tasks: nativeTasks, color: "#10b981", team: [...new Set(nativeTasks.map((t) => t.assignee))] },
  ];
  const totalDone = mobileTasks.filter(t => t.status === "completed").length;
  const pct = mobileTasks.length > 0 ? Math.round((totalDone / mobileTasks.length) * 100) : 0;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t("projects.overallProgress")} value={`${pct}%`} sub={`${totalDone}/${mobileTasks.length} ${t("projects.tasks")}`} up={pct >= 50} />
        <StatCard label={t("projects.tasksDone")} value={`${totalDone}/${mobileTasks.length}`} sub={`${mobileTasks.length - totalDone} ${t("projects.remaining")}`} />
        <StatCard label={t("projects.dueDate")} value={proj?.due ?? "—"} sub={t("projects.targetDeadline")} />
        <StatCard label={t("projects.teamSize")} value={`${[...new Set(mobileTasks.map(t => t.assignee))].length}`} sub={[...new Set(mobileTasks.map(t => t.assignee))].join(", ") || "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionHeader title={t("projects.platformStatus")} sub={t("projects.byWorkArea")} />
          <div className="space-y-4 mt-1">
            {[
              { platform: t("projects.uiUxDesign"), done: designTasks.filter((t) => t.status === "completed").length, total: designTasks.length, color: "#818cf8" },
              { platform: t("projects.nativeDevelopment"), done: nativeTasks.filter((t) => t.status === "completed").length, total: nativeTasks.length, color: "#10b981" },
            ].map((p) => {
              const progress = Math.round((p.done / Math.max(p.total, 1)) * 100);
              return (
              <div key={p.platform}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-neutral-300 text-[12px]">{p.platform}</span>
                  <span className="text-neutral-500 text-[11px]">{p.done}/{p.total} ${t("projects.tasks")} — {progress}%</span>
                </div>
                <ProgressBar value={progress} color={p.color} />
              </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionHeader title={t("projects.milestones")} sub={t("projects.keyDeliveryDates")} />
          <div className="space-y-3">
            {mobileMilestones.map((m) => (
              <div key={m.milestone} className="flex items-center gap-3 p-2.5 rounded-lg bg-neutral-800/20">
                {m.done
                  ? <CheckCircle size={15} className="text-emerald-500 shrink-0" />
                  : <Circle size={15} className="text-neutral-600 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className={`text-[12px] ${m.done ? "line-through text-neutral-600" : "text-neutral-300"}`}>{m.milestone}</div>
                </div>
                <span className="text-neutral-500 text-[11px] shrink-0">{m.date}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {areas.map((a) => {
          const done = a.tasks.filter((t) => t.status === "completed").length;
          const pct = Math.round((done / a.tasks.length) * 100);
          return (
            <div key={a.label} onClick={() => onDrillDown(a.view)}
              className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 hover:border-neutral-700/60 transition-colors cursor-pointer group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-neutral-200 text-[13px] font-['Lexend:SemiBold',_sans-serif]">{a.label}</span>
                <ChevronRight size={14} className="text-neutral-600 group-hover:text-neutral-400 transition-colors" />
              </div>
              <div className="text-neutral-50 text-[24px] font-['Lexend:SemiBold',_sans-serif] mb-1" style={{ color: a.color }}>{pct}%</div>
              <div className="text-neutral-600 text-[11px] mb-3">{done}/{a.tasks.length} {t("projects.tasks")}</div>
              <ProgressBar value={pct} color={a.color} />
              <div className="flex items-center justify-between mt-3">
                <AvatarGroup members={a.team} />
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: a.color, backgroundColor: `${a.color}18` }}>
                  {a.tasks.filter((t) => t.status === "in-progress").length} {t("projects.active")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── View: Sub-area task views ─────────────────────────────────────────────────

function AreaView({
  stats, tasks, teamLabel, milestones, t,
}: {
  stats: { label: string; value: string; sub?: string; up?: boolean }[];
  tasks: TaskItem[];
  teamLabel: string;
  milestones?: { milestone: string; date: string; done: boolean }[];
  t: (path: string) => string;
}) {
  const [statusFilter, setStatusFilter] = useState("All");
  const tabs: { value: string; label: string }[] = [
    { value: "All", label: t("projects.all") },
    { value: "In Progress", label: t("projects.inProgressTasks") },
    { value: "Todo", label: t("projects.todo") },
    { value: "Done", label: t("projects.doneLabel") },
  ];
  const filtered = statusFilter === "All" ? tasks
    : statusFilter === "In Progress" ? tasks.filter((t) => t.status === "in-progress")
    : statusFilter === "Todo" ? tasks.filter((t) => t.status === "todo")
    : tasks.filter((t) => t.status === "completed");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <SectionHeader title={t("projects.taskList")} sub={`${tasks.filter((t) => t.status === "completed").length} of ${tasks.length} done`} />
            <div className="flex gap-1">
              {tabs.map((tab) => (
                <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors whitespace-nowrap ${statusFilter === tab.value ? "bg-neutral-800 text-neutral-200" : "text-neutral-600 hover:text-neutral-400"}`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <TaskTable tasks={filtered} />
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionHeader title={t("projects.teamLabel")} sub={teamLabel} />
            <div className="space-y-2">
              {[...new Set(tasks.map((t) => t.assignee))].map((a) => {
                const count = tasks.filter((t) => t.assignee === a).length;
                const done = tasks.filter((t) => t.assignee === a && t.status === "completed").length;
                return (
                  <div key={a} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-neutral-800/20">
                    <div className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center text-[11px] text-neutral-300 shrink-0">{a}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-neutral-300 text-[12px]">{a}</span>
                        <span className="text-neutral-500 text-[11px]">{done}/{count}</span>
                      </div>
                      <ProgressBar value={(done / count) * 100} color="#818cf8" />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {milestones && (
            <Card>
              <SectionHeader title={t("projects.milestones")} sub="" />
              <div className="space-y-2">
                {milestones.map((m) => (
                  <div key={m.milestone} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-neutral-800/20">
                    {m.done
                      ? <CheckCircle size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                      : <Circle size={13} className="text-neutral-600 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <div className={`text-[11px] ${m.done ? "line-through text-neutral-600" : "text-neutral-300"}`}>{m.milestone}</div>
                      <div className="text-neutral-600 text-[10px] mt-0.5">{m.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectAreaView({ tasks, label1, label2, teamLabel, milestones, deadline, t }: {
  tasks: TaskItem[]; label1: string; label2: string; teamLabel: string;
  milestones?: { milestone: string; date: string; done: boolean }[]; deadline: string;
  t: (path: string) => string;
}) {
  const done = tasks.filter((t) => t.status === "completed").length;
  const inProg = tasks.filter((t) => t.status === "in-progress").length;
  const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-neutral-600 text-[13px]">
        {t("projects.noTasksFoundArea")}
      </div>
    );
  }
  return <AreaView
    stats={[
      { label: label1, value: `${done}/${tasks.length}`, sub: `${pct}% ${t("projects.ofAreaTasks")}`, up: pct >= 50 },
      { label: t("projects.progressLabel"), value: `${pct}%`, sub: t("projects.ofAreaTasks"), up: pct >= 50 },
      { label: t("projects.active"), value: `${inProg}`, sub: t("projects.inProgressTasks") },
      { label: t("projects.due"), value: deadline, sub: t("projects.projectDeadline") },
    ]}
    tasks={tasks}
    teamLabel={teamLabel}
    milestones={milestones}
    t={t}
  />;
}

// ── View: Completed projects ──────────────────────────────────────────────────

function CompletedView({ projects, t }: { projects: Project[]; t: (path: string) => string; }) {
  const completed = projects.filter((p) => p.status === "completed");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t("projects.completedNav")} value={`${completed.length}`} sub={t("projects.completedShipped")} up={true} />
        <StatCard label={t("projects.totalTasksStat")} value={`${completed.reduce((a, p) => a + p.tasks.total, 0)}`} sub={t("projects.allDone")} up={true} />
        <StatCard label={t("projects.latestShip")} value={completed.length > 0 ? completed[completed.length - 1].due : "—"} sub={completed.length > 0 ? completed[completed.length - 1].name : t("projects.noCompletedProjectsYet")} />
        <StatCard label={t("projects.avgProgress")} value="100%" sub={t("projects.allComplete")} up={true} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {completed.length === 0 ? (
          <div className="col-span-2 flex items-center justify-center h-32 text-neutral-600 text-[13px]">{t("projects.noCompletedProjectsYet")}</div>
        ) : completed.map((p) => (
          <Card key={p.id}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-neutral-50 text-[13px] font-['Lexend:SemiBold',_sans-serif] truncate mr-3 flex-1">{p.name}</h3>
              <CheckCircle size={15} className="text-emerald-500 shrink-0 mt-0.5" />
            </div>
            <p className="text-neutral-500 text-[12px] leading-relaxed mb-4 line-clamp-2">{p.description}</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {p.tags.map((tag, i) => (
                <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full ${tagColors[i % tagColors.length]}`}>{tag}</span>
              ))}
            </div>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-neutral-600 text-[11px]">{p.tasks.total}/{p.tasks.total} {t("projects.tasks")}</span>
                <span className="text-emerald-400 text-[11px]">100%</span>
              </div>
              <ProgressBar value={100} color="#10b981" />
            </div>
            <div className="flex items-center justify-between">
              <AvatarGroup members={p.team} />
              <span className="text-neutral-600 text-[12px]">{t("projects.shipped")} {p.due}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── View: Archived / Paused projects ─────────────────────────────────────────

function ArchivedView({ projects, t }: { projects: Project[]; t: (path: string) => string; }) {
  const paused = projects.filter((p) => p.status === "paused");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t("projects.pausedProjects")} value={`${paused.length}`} sub={t("projects.projectsOnHold")} />
        <StatCard label={t("projects.tasksPending")} value={`${paused.reduce((a, p) => a + (p.tasks.total - p.tasks.done), 0)}`} sub={t("projects.awaitingResume")} />
        <StatCard label={t("projects.avgProgressPaused")} value={`${Math.round(paused.reduce((a, p) => a + p.progress, 0) / Math.max(paused.length, 1))}%`} sub={t("projects.atPauseTime")} />
        <StatCard label={t("projects.estResume")} value={paused[0]?.due ?? "—"} sub={t("projects.earliestDueDate")} />
      </div>

      {paused.length === 0 ? (
        <Card>
          <div className="flex items-center justify-center h-24 text-neutral-600 text-[13px]">{t("projects.noArchivedProjects")}</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {paused.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-neutral-50 text-[13px] font-['Lexend:SemiBold',_sans-serif] truncate mr-3 flex-1">{p.name}</h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  <AlertCircle size={13} className="text-amber-400" />
                  <span className="text-amber-400 text-[11px]">{t("projects.pausedProjects")}</span>
                </div>
              </div>
              <p className="text-neutral-500 text-[12px] leading-relaxed mb-4 line-clamp-2">{p.description}</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {p.tags.map((tag, i) => (
                  <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full ${tagColors[i % tagColors.length]}`}>{tag}</span>
                ))}
              </div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-neutral-600 text-[11px]">{p.tasks.done} / {p.tasks.total} {t("projects.tasks")}</span>
                  <span className="text-neutral-500 text-[11px]">{p.progress}%</span>
                </div>
                <ProgressBar value={p.progress} color="#f59e0b" />
              </div>
              <div className="flex items-center justify-between">
                <AvatarGroup members={p.team} />
                <span className="text-neutral-600 text-[12px]">{t("projects.due")} {p.due}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <SectionHeader title={t("projects.resumeChecklist")} sub={t("projects.resumeChecklistSub")} />
        <div className="space-y-2">
          {[
            t("projects.reviewLastSprint"),
            t("projects.confirmTeamAvailability"),
            t("projects.reEstimateBacklog"),
            t("projects.updateDependencies"),
            t("projects.scheduleKickoff"),
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-neutral-800/20">
              <Circle size={13} className="text-neutral-600 shrink-0" />
              <span className="text-neutral-400 text-[12px]">{item}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Main ProjectsPage ─────────────────────────────────────────────────────────

export function ProjectsPage() {
  const { t } = useLang();
  const { subSection } = useNavigation();
  const routerNavigate = useNavigate();
  const { plan } = useSubscription();
  const [view, setView] = useState<ProjView>("grid");
  const [gridFilter, setGridFilter] = useState("All");
  const [projects, setProjects] = useState<Project[]>([]);
  const [allTasks, setAllTasks] = useState<TaskItem[]>([]);
  const [webMilestones, setWebMilestones] = useState<{ milestone: string; date: string; done: boolean }[]>([]);
  const [mobileMilestones, setMobileMilestones] = useState<{ milestone: string; date: string; done: boolean }[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Plan-based gating: the Free plan caps how many projects can be created
  const maxProjects = PLAN_LIMITS[plan.id as PlanId]?.maxProjects ?? null;
  const openNewProject = () => {
    if (maxProjects != null && projects.length >= maxProjects) {
      toast.error(`The ${plan.name} plan is limited to ${maxProjects} projects`, {
        description: "Upgrade to Pro for unlimited projects.",
        action: { label: "Upgrade", onClick: () => routerNavigate("/pricing") },
      });
      return;
    }
    setShowNew(true);
  };

  useEffect(() => {
    api.getProjects().then((data) => setProjects(data)).catch((e) => {
      console.log("Failed to load projects:", e);
      toast.error(t("projects.failedToLoadProjectsToast"));
    });
    api.getTasks().then((data) => setAllTasks(data)).catch((e) => {
      console.log("Failed to load tasks:", e);
    });
    // Fetch milestones from Supabase
    api.getMilestones("web").then(setWebMilestones).catch(() => {});
    api.getMilestones("mobile").then(setMobileMilestones).catch(() => {});
  }, []);

  useEffect(() => {
    if (subSection === "new-project") { openNewProject(); return; }
    const mapped = subSectionMap[subSection];
    if (mapped) setView(mapped);
  }, [subSection]);

  const isGridView = view === "grid";

  const webProj = projects.find((p) => p.name.toLowerCase().includes("web app") || p.name.toLowerCase().includes("web application"));
  const mobileProj = projects.find((p) => p.name.toLowerCase().includes("mobile"));

  const navTabs: { view: ProjView; label: string }[] = [
    { view: "grid", label: t("projects.allProjectsNav") },
    { view: "web-application", label: t("projects.webApp") },
    { view: "mobile-app", label: t("projects.mobileAppLabel") },
    { view: "proj-completed", label: t("projects.completedNav") },
    { view: "proj-archived", label: t("projects.archivedNav") },
  ];

  if (isGridView) {
    return (
      <>
        <ProjectGrid
          projects={projects}
          filter={gridFilter}
          setFilter={setGridFilter}
          onSelect={setSelectedProject}
          onNew={openNewProject}
          t={t}
        />
        <NewProjectModal open={showNew} onClose={() => setShowNew(false)} onAdd={async (p) => {
          try { const created = await api.createProject(p); setProjects((prev) => [created, ...prev]); }
          catch (e) {
            console.log("Failed to create project:", e);
            // The server enforces the plan limit too (in case the UI is stale)
            if (e instanceof api.ApiError && e.code === "project_limit") {
              toast.error(e.message, {
                action: { label: "Upgrade", onClick: () => routerNavigate("/pricing") },
              });
            } else {
              toast.error(t("projects.failedToCreateProjectToast"));
            }
          }
        }} />
        <ProjectDetailModal open={!!selectedProject} onClose={() => setSelectedProject(null)} project={selectedProject} />
      </>
    );
  }

  return (
    <div className="flex flex-col h-full font-['Lexend:Regular',_sans-serif]">
      {/* Header */}
      <div className="px-4 md:px-6 lg:px-8 pt-6 lg:pt-8 pb-0">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div>
            <h1 className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif] text-[18px] lg:text-[22px] leading-tight mb-1">
              {view === "web-application" ? t("projects.webApplication") : view === "mobile-app" ? t("projects.mobileAppLabel") : view === "proj-web-frontend" ? t("projects.frontendDevelopment") : view === "proj-web-api" ? t("projects.apiIntegration") : view === "proj-web-qa" ? t("projects.testingQa") : view === "proj-mobile-design" ? t("projects.uiUxDesign") : view === "proj-mobile-native" ? t("projects.nativeDevelopment") : view === "proj-completed" ? t("projects.completedProjects") : view === "proj-archived" ? t("projects.archivedProjects") : t("projects.projects")}
            </h1>
            <p className="text-neutral-500 text-[12px] lg:text-[13px]">
              {view === "web-application" || view.startsWith("proj-web") ? `${t("projects.webApplication")} · ${t("projects.due")} ${webProj?.due ?? "—"}`
                : view === "mobile-app" || view.startsWith("proj-mobile") ? `${t("projects.mobileAppLabel")} · ${t("projects.due")} ${mobileProj?.due ?? "—"}`
                : t("projects.projectsOverview")}
            </p>
          </div>
          <button onClick={openNewProject} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors shrink-0">
            + {t("projects.newProject")}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-neutral-800/60 overflow-x-auto">
          {navTabs.map((tab) => (
            <button key={tab.view} onClick={() => setView(tab.view)}
              className={`px-3 lg:px-4 py-2.5 text-[12px] lg:text-[13px] border-b-2 transition-colors -mb-px whitespace-nowrap ${view === tab.view ? "border-indigo-500 text-neutral-50" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}>
              {tab.label}
            </button>
          ))}
          {/* Sub-area pill if drilled into an area */}
          {(view === "proj-web-frontend" || view === "proj-web-api" || view === "proj-web-qa" || view === "proj-mobile-design" || view === "proj-mobile-native") && (
            <div className="flex items-center gap-1 ml-2">
              <ChevronRight size={13} className="text-neutral-600" />
              <span className="text-indigo-400 text-[12px] py-2.5">{view === "proj-web-frontend" ? t("projects.frontendDevelopment") : view === "proj-web-api" ? t("projects.apiIntegration") : view === "proj-web-qa" ? t("projects.testingQa") : view === "proj-mobile-design" ? t("projects.uiUxDesign") : t("projects.nativeDevelopment")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-5 lg:py-7">
        {(() => {
          const webTasks = allTasks.filter((t) => t.project === "Web App v2" || t.project === "Web Application v2");
          const mobileTasks = allTasks.filter((t) => t.project === "Mobile App");
          return (
            <>
              {view === "web-application" && <WebAppView onDrillDown={setView} allTasks={allTasks} webMilestones={webMilestones} projects={projects} t={t} />}
              {view === "proj-web-frontend" && <ProjectAreaView tasks={webTasks.filter((t) => !t.title.toLowerCase().includes("api") && !t.title.toLowerCase().includes("test"))} label1={t("projects.tasksCompleted")} label2="Frontend area" teamLabel={t("projects.webFrontendTeam")} milestones={webMilestones} deadline={webProj?.due ?? "—"} t={t} />}
              {view === "proj-web-api" && <ProjectAreaView tasks={webTasks.filter((t) => t.title.toLowerCase().includes("api") || t.title.toLowerCase().includes("endpoint") || t.title.toLowerCase().includes("auth"))} label1={t("projects.tasksCompleted")} label2="API area" teamLabel={t("projects.backendTeam")} deadline={webProj?.due ?? "—"} t={t} />}
              {view === "proj-web-qa" && <ProjectAreaView tasks={webTasks.filter((t) => t.title.toLowerCase().includes("test") || t.title.toLowerCase().includes("qa") || t.title.toLowerCase().includes("bug"))} label1={t("projects.testsPassing")} label2="QA area" teamLabel={t("projects.qaTeam")} deadline={webProj?.due ?? "—"} t={t} />}
              {view === "mobile-app" && <MobileAppView onDrillDown={setView} allTasks={allTasks} mobileMilestones={mobileMilestones} projects={projects} t={t} />}
              {view === "proj-mobile-design" && <ProjectAreaView tasks={mobileTasks.filter((t) => t.title.toLowerCase().includes("design") || t.title.toLowerCase().includes("ui") || t.title.toLowerCase().includes("wireframe"))} label1={t("projects.screensDone")} label2="Design area" teamLabel={t("projects.designTeam")} milestones={mobileMilestones} deadline={mobileProj?.due ?? "—"} t={t} />}
              {view === "proj-mobile-native" && <ProjectAreaView tasks={mobileTasks.filter((t) => !t.title.toLowerCase().includes("design") && !t.title.toLowerCase().includes("ui"))} label1={t("projects.tasksCompleted")} label2="Native dev area" teamLabel={t("projects.mobileDevTeam")} deadline={mobileProj?.due ?? "—"} t={t} />}
              {view === "proj-completed" && <CompletedView projects={projects} t={t} />}
              {view === "proj-archived" && <ArchivedView projects={projects} t={t} />}
            </>
          );
        })()}
      </div>

      <NewProjectModal open={showNew} onClose={() => setShowNew(false)} onAdd={(p) => setProjects((prev) => [p, ...prev])} />
    </div>
  );
}
