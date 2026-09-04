import { logger } from "../utils/logger";
﻿import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, CheckCircle, Circle, Clock, Users, BarChart2, AlertCircle, ChevronRight } from "lucide-react";
import { NewProjectModal, type Project } from "./modals/NewProjectModal";
import { ProjectDetailModal } from "./modals/ProjectDetailModal";
import { useNavigation } from "./NavigationContext";
import { PLAN_LIMITS, useSubscription, type PlanId } from "../subscription/SubscriptionContext";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import * as api from "../utils/api";
import { useLang } from "../LangContext";

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

const VIEW_LABEL_KEYS: Record<ProjView, string> = {
  "grid": "projects.title",
  "web-application": "projects.webApplication",
  "proj-web-frontend": "projects.frontendDevelopment",
  "proj-web-api": "projects.apiIntegration",
  "proj-web-qa": "projects.testingQA",
  "mobile-app": "projects.mobileApp",
  "proj-mobile-design": "projects.uiUxDesign",
  "proj-mobile-native": "projects.nativeDevelopment",
  "proj-completed": "projects.completedProjects",
  "proj-archived": "projects.archivedProjects",
};

// ── Shared sub-components ─────────────────────────────────────────────────────

const statusCfg: Record<string, { labelKey: string; color: string; dot: string }> = {
  completed: { labelKey: "projects.taskStatus.done", color: "#10b981", dot: "#10b981" },
  "in-progress": { labelKey: "projects.taskStatus.inProgress", color: "#f59e0b", dot: "#f59e0b" },
  todo: { labelKey: "projects.taskStatus.todo", color: "#525252", dot: "#404040" },
  review: { labelKey: "projects.taskStatus.review", color: "#3b82f6", dot: "#3b82f6" },
};

const priorityCfg: Record<string, { labelKey: string; color: string }> = {
  high: { labelKey: "projects.priority.high", color: "#ef4444" },
  medium: { labelKey: "projects.priority.medium", color: "#f59e0b" },
  low: { labelKey: "projects.priority.low", color: "#525252" },
};

const projectStatusConfig: Record<string, { labelKey: string; color: string; bg: string }> = {
  active: { labelKey: "projects.status.active", color: "#10b981", bg: "bg-emerald-950/40" },
  paused: { labelKey: "projects.status.paused", color: "#f59e0b", bg: "bg-amber-950/40" },
  completed: { labelKey: "projects.status.completed", color: "#6366f1", bg: "bg-indigo-950/40" },
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

function AvatarGroup({ members, membersMap }: { members: string[]; membersMap?: Map<string, string> }) {
  const resolve = (id: string) => membersMap?.get(id) || id;
  return (
    <div className="flex -space-x-1.5" title={members.map(resolve).join(", ")}>
      {members.slice(0, 4).map((m, i) => (
        <div key={i} className="w-6 h-6 rounded-full bg-neutral-700 border border-[#141414] flex items-center justify-center text-[10px] text-neutral-300 font-['Lexend:SemiBold',_sans-serif]">
          {(resolve(m)[0] ?? "?").toUpperCase()}
        </div>
      ))}
      {members.length > 4 && (
        <div className="w-6 h-6 rounded-full bg-neutral-800 border border-[#141414] flex items-center justify-center text-[10px] text-neutral-500">+{members.length - 4}</div>
      )}
    </div>
  );
}

type TaskItem = { id: string; title: string; status: string; priority: string; assignee: string; due: string; project: string };

function TaskTable({ tasks }: { tasks: TaskItem[] }) {
  const { t } = useLang();
  const done = tasks.filter((t) => t.status === "completed").length;
  const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-neutral-500 text-[11px]">{done} / {tasks.length} {t("projects.completedOf")}</span>
        <span className="text-neutral-500 text-[11px]">{pct}%</span>
      </div>
      <ProgressBar value={pct} />
      <div className="mt-4 space-y-1">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-800/20 transition-colors">
            {task.status === "completed"
              ? <CheckCircle size={14} className="text-emerald-500 shrink-0" />
              : task.status === "in-progress"
              ? <Clock size={14} className="text-amber-400 shrink-0" />
              : <Circle size={14} className="text-neutral-600 shrink-0" />}
            <span className={`flex-1 text-[12px] truncate ${task.status === "completed" ? "line-through text-neutral-600" : "text-neutral-300"}`}>{task.title}</span>
            <span className="text-[10px] shrink-0" style={{ color: priorityCfg[task.priority].color }}>{t(priorityCfg[task.priority].labelKey as any)}</span>
            <div className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center text-[9px] text-neutral-400 shrink-0">{task.assignee}</div>
            <span className="text-neutral-600 text-[10px] w-10 text-right shrink-0 hidden sm:block">{task.due}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── View: Project grid (default) ──────────────────────────────────────────────

function ProjectGrid({
  projects, filter, setFilter, onSelect, onNew, onAnalytics, membersMap,
}: {
  projects: Project[]; filter: string; setFilter: (f: string) => void;
  onSelect: (p: Project) => void; onNew: () => void; onAnalytics?: (p: Project) => void;
  membersMap?: Map<string, string>;
}) {
  const { t } = useLang();
  const filters = ["All", "Active", "Paused", "Completed"];
  const filtered = filter === "All" ? projects : projects.filter((p) => p.status === filter.toLowerCase());
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 lg:px-8 pt-6 lg:pt-8 pb-5 border-b border-neutral-800/40">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif] text-[18px] lg:text-[22px] leading-tight mb-1">{t("projects.title")}</h1>
            <p className="text-neutral-500 text-[12px] lg:text-[13px]">
              {projects.filter((p) => p.status === "active").length} {t("projects.activeCount")} · {projects.filter((p) => p.status === "completed").length} {t("projects.completedCount")}
            </p>
          </div>
          <button onClick={onNew} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors shrink-0">
            {t("projects.newProject")}
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {filters.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-[12px] lg:text-[13px] transition-colors whitespace-nowrap ${filter === f ? "bg-neutral-800 text-neutral-50" : "text-neutral-500 hover:text-neutral-300"}`}>
              {t(`projects.${f.toLowerCase()}` as any)}
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
                  {t(projectStatusConfig[project.status].labelKey as any)}
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
                <AvatarGroup members={project.team} membersMap={membersMap} />
                <div className="flex items-center gap-2">
                  {onAnalytics && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onAnalytics(project); }}
                      className="text-neutral-600 hover:text-indigo-400 transition-colors p-1"
                      title="View analytics"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                      </svg>
                    </button>
                  )}
                  <span className="text-neutral-600 text-[12px]">{project.due}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-neutral-600 text-[13px]">{t("projects.noProjects")}</div>
        )}
      </div>
    </div>
  );
}

// ── View: Web Application overview ────────────────────────────────────────────

function WebAppView({ onDrillDown, allTasks, webMilestones, projects, onToggleMilestone, membersMap }: { onDrillDown: (v: ProjView) => void; allTasks: TaskItem[]; webMilestones: { milestone: string; date: string; done: boolean }[]; projects: Project[]; onToggleMilestone?: (index: number) => void; membersMap?: Map<string, string> }) {
  const { t } = useLang();
  const proj = projects.find((p) => p.name.toLowerCase().includes("web app") || p.name.toLowerCase().includes("web application"));
  const webTasks = allTasks.filter((t) => t.project === "Web Application v2" || t.project === "Web App v2");
  const frontendTasks = webTasks.filter((t) => !t.title.toLowerCase().includes("api") && !t.title.toLowerCase().includes("test") && !t.title.toLowerCase().includes("auth endpoint"));
  const apiTasks = webTasks.filter((t) => t.title.toLowerCase().includes("api") || t.title.toLowerCase().includes("endpoint") || t.title.toLowerCase().includes("webhook"));
  const qaTasks = webTasks.filter((t) => t.title.toLowerCase().includes("test") || t.title.toLowerCase().includes("qa") || t.title.toLowerCase().includes("bug"));
  const areas = [
    { labelKey: "projects.frontendDevelopment", view: "proj-web-frontend" as ProjView, tasks: frontendTasks, color: "#818cf8", team: [...new Set(frontendTasks.map((t) => t.assignee))] },
    { labelKey: "projects.apiIntegration", view: "proj-web-api" as ProjView, tasks: apiTasks, color: "#10b981", team: [...new Set(apiTasks.map((t) => t.assignee))] },
    { labelKey: "projects.testingQA", view: "proj-web-qa" as ProjView, tasks: qaTasks, color: "#f59e0b", team: [...new Set(qaTasks.map((t) => t.assignee))] },
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
              { label: t("projects.tasksCompleted"), value: totalDone, total: webTasks.length, color: "#818cf8" },
              { label: t("projects.inProgress"), value: webTasks.filter(t => t.status === "in-progress").length, total: webTasks.length, color: "#10b981" },
              { label: t("projects.inReview"), value: webTasks.filter(t => t.status === "review").length, total: webTasks.length, color: "#f59e0b" },
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
            {webMilestones.map((m, idx) => (
              <button key={m.milestone} onClick={() => onToggleMilestone?.(idx)}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-neutral-800/20 hover:bg-neutral-800/40 transition-colors w-full text-left">
                {m.done
                  ? <CheckCircle size={15} className="text-emerald-500 shrink-0" />
                  : <Circle size={15} className="text-neutral-600 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className={`text-[12px] ${m.done ? "line-through text-neutral-600" : "text-neutral-300"}`}>{m.milestone}</div>
                </div>
                <span className="text-neutral-500 text-[11px] shrink-0">{m.date}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {areas.map((a) => {
          const done = a.tasks.filter((t) => t.status === "completed").length;
          const pct = Math.round((done / a.tasks.length) * 100);
          return (
            <div key={a.labelKey} onClick={() => onDrillDown(a.view)}
              className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 hover:border-neutral-700/60 transition-colors cursor-pointer group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-neutral-200 text-[13px] font-['Lexend:SemiBold',_sans-serif]">{t(a.labelKey as any)}</span>
                <ChevronRight size={14} className="text-neutral-600 group-hover:text-neutral-400 transition-colors" />
              </div>
              <div className="text-neutral-50 text-[24px] font-['Lexend:SemiBold',_sans-serif] mb-1" style={{ color: a.color }}>{pct}%</div>
              <div className="text-neutral-600 text-[11px] mb-3">{done}/{a.tasks.length} {t("projects.tasksCount")}</div>
              <ProgressBar value={pct} color={a.color} />
              <div className="flex items-center justify-between mt-3">
                <AvatarGroup members={a.team} membersMap={membersMap} />
                <span className={`text-[10px] px-2 py-0.5 rounded-full`}
                  style={{ color: a.color, backgroundColor: `${a.color}18` }}>
                  {a.tasks.filter((t) => t.status === "in-progress").length} {t("projects.activeCount")}
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

function MobileAppView({ onDrillDown, allTasks, mobileMilestones, projects, onToggleMilestone, membersMap }: { onDrillDown: (v: ProjView) => void; allTasks: TaskItem[]; mobileMilestones: { milestone: string; date: string; done: boolean }[]; projects: Project[]; onToggleMilestone?: (index: number) => void; membersMap?: Map<string, string> }) {
  const { t } = useLang();
  const proj = projects.find((p) => p.name.toLowerCase().includes("mobile"));
  const mobileTasks = allTasks.filter((t) => t.project === "Mobile App");
  const designTasks = mobileTasks.filter((t) => t.title.toLowerCase().includes("design") || t.title.toLowerCase().includes("ui") || t.title.toLowerCase().includes("wireframe") || t.title.toLowerCase().includes("mockup"));
  const nativeTasks = mobileTasks.filter((t) => !t.title.toLowerCase().includes("design") && !t.title.toLowerCase().includes("ui") && !t.title.toLowerCase().includes("wireframe"));
  const areas = [
    { labelKey: "projects.uiUxDesign", view: "proj-mobile-design" as ProjView, tasks: designTasks, color: "#818cf8", team: [...new Set(designTasks.map((t) => t.assignee))] },
    { labelKey: "projects.nativeDevelopment", view: "proj-mobile-native" as ProjView, tasks: nativeTasks, color: "#10b981", team: [...new Set(nativeTasks.map((t) => t.assignee))] },
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
              { platformKey: "projects.uiUxDesign", done: designTasks.filter((t) => t.status === "completed").length, total: designTasks.length, color: "#818cf8" },
              { platformKey: "projects.nativeDevelopment", done: nativeTasks.filter((t) => t.status === "completed").length, total: nativeTasks.length, color: "#10b981" },
            ].map((p) => {
              const progress = Math.round((p.done / Math.max(p.total, 1)) * 100);
              return (
              <div key={p.platformKey}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-neutral-300 text-[12px]">{t(p.platformKey as any)}</span>
                  <span className="text-neutral-500 text-[11px]">{p.done}/{p.total} {t("projects.tasks")} — {progress}%</span>
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
            {mobileMilestones.map((m, idx) => (
              <button key={m.milestone} onClick={() => onToggleMilestone?.(idx)}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-neutral-800/20 hover:bg-neutral-800/40 transition-colors w-full text-left">
                {m.done
                  ? <CheckCircle size={15} className="text-emerald-500 shrink-0" />
                  : <Circle size={15} className="text-neutral-600 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className={`text-[12px] ${m.done ? "line-through text-neutral-600" : "text-neutral-300"}`}>{m.milestone}</div>
                </div>
                <span className="text-neutral-500 text-[11px] shrink-0">{m.date}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {areas.map((a) => {
          const done = a.tasks.filter((t) => t.status === "completed").length;
          const pct = Math.round((done / a.tasks.length) * 100);
          return (
            <div key={a.labelKey} onClick={() => onDrillDown(a.view)}
              className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 hover:border-neutral-700/60 transition-colors cursor-pointer group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-neutral-200 text-[13px] font-['Lexend:SemiBold',_sans-serif]">{t(a.labelKey as any)}</span>
                <ChevronRight size={14} className="text-neutral-600 group-hover:text-neutral-400 transition-colors" />
              </div>
              <div className="text-neutral-50 text-[24px] font-['Lexend:SemiBold',_sans-serif] mb-1" style={{ color: a.color }}>{pct}%</div>
              <div className="text-neutral-600 text-[11px] mb-3">{done}/{a.tasks.length} {t("projects.tasksCount")}</div>
              <ProgressBar value={pct} color={a.color} />
              <div className="flex items-center justify-between mt-3">
                <AvatarGroup members={a.team} membersMap={membersMap} />
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: a.color, backgroundColor: `${a.color}18` }}>
                  {a.tasks.filter((t) => t.status === "in-progress").length} {t("projects.activeCount")}
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
  stats, tasks, teamLabel, milestones,
}: {
  stats: { label: string; value: string; sub?: string; up?: boolean }[];
  tasks: TaskItem[];
  teamLabel: string;
  milestones?: { milestone: string; date: string; done: boolean }[];
}) {
  const { t } = useLang();
  const [statusFilter, setStatusFilter] = useState("All");
  const tabs = ["All", "In Progress", "Todo", "Done"];
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
            <SectionHeader title={t("projects.taskList")} sub={`${tasks.filter((t) => t.status === "completed").length} / ${tasks.length} ${t("projects.completedOf")}`} />
            <div className="flex gap-1">
              {tabs.map((tab) => (
                <button key={tab} onClick={() => setStatusFilter(tab)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors whitespace-nowrap ${statusFilter === tab ? "bg-neutral-800 text-neutral-200" : "text-neutral-600 hover:text-neutral-400"}`}>
                  {tab === "All" ? t("projects.all") : tab === "In Progress" ? t("projects.inProgress") : tab === "Todo" ? t("projects.taskStatus.todo") : t("projects.taskStatus.done")}
                </button>
              ))}
            </div>
          </div>
          <TaskTable tasks={filtered} />
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionHeader title={t("projects.team")} sub={teamLabel} />
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

function ProjectAreaView({ tasks, label1, label2, teamLabel, milestones, deadline }: {
  tasks: TaskItem[]; label1: string; label2: string; teamLabel: string;
  milestones?: { milestone: string; date: string; done: boolean }[]; deadline: string;
}) {
  const { t } = useLang();
  const done = tasks.filter((t) => t.status === "completed").length;
  const inProg = tasks.filter((t) => t.status === "in-progress").length;
  const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-neutral-600 text-[13px]">
        {t("projects.noTasksArea")}
      </div>
    );
  }
  return <AreaView
    stats={[
      { label: label1, value: `${done}/${tasks.length}`, sub: `${pct}% ${t("projects.complete")}`, up: pct >= 50 },
      { label: t("projects.progress"), value: `${pct}%`, sub: t("projects.ofAreaTasks"), up: pct >= 50 },
      { label: t("projects.active"), value: `${inProg}`, sub: t("projects.inProgressCount") },
      { label: t("projects.dueDate"), value: deadline, sub: t("projects.projectDeadline") },
    ]}
    tasks={tasks}
    teamLabel={teamLabel}
    milestones={milestones}
  />;
}

// ── View: Completed projects ──────────────────────────────────────────────────

function CompletedView({ projects, membersMap }: { projects: Project[]; membersMap?: Map<string, string> }) {
  const { t } = useLang();
  const completed = projects.filter((p) => p.status === "completed");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t("projects.completed")} value={`${completed.length}`} sub={t("projects.projectsShipped")} up={true} />
        <StatCard label={t("projects.totalTasks")} value={`${completed.reduce((a, p) => a + p.tasks.total, 0)}`} sub={t("projects.allDone")} up={true} />
        <StatCard label={t("projects.latestShip")} value={completed.length > 0 ? completed[completed.length - 1].due : "—"} sub={completed.length > 0 ? completed[completed.length - 1].name : t("projects.noCompletedProjects")} />
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
              <AvatarGroup members={p.team} membersMap={membersMap} />
              <span className="text-neutral-600 text-[12px]">{t("projects.shipped")} {p.due}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── View: Archived / Paused projects ─────────────────────────────────────────

function ArchivedView({ projects, membersMap }: { projects: Project[]; membersMap?: Map<string, string> }) {
  const { t } = useLang();
  const paused = projects.filter((p) => p.status === "paused");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={t("projects.paused")} value={`${paused.length}`} sub={t("projects.projectsOnHold")} />
        <StatCard label={t("projects.tasksPending")} value={`${paused.reduce((a, p) => a + (p.tasks.total - p.tasks.done), 0)}`} sub={t("projects.awaitingResume")} />
        <StatCard label={t("projects.avgProgress")} value={`${Math.round(paused.reduce((a, p) => a + p.progress, 0) / Math.max(paused.length, 1))}%`} sub={t("projects.atPauseTime")} />
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
                  <span className="text-amber-400 text-[11px]">{t("projects.paused")}</span>
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
                  <span className="text-neutral-600 text-[11px]">{p.tasks.done} / {p.tasks.total} tasks</span>
                  <span className="text-neutral-500 text-[11px]">{p.progress}%</span>
                </div>
                <ProgressBar value={p.progress} color="#f59e0b" />
              </div>
              <div className="flex items-center justify-between">
                <AvatarGroup members={p.team} membersMap={membersMap} />
                <span className="text-neutral-600 text-[12px]">Due {p.due}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <SectionHeader title="Resume Checklist" sub="Steps to re-activate a paused project" />
        <div className="space-y-2">
          {[
            "Review last sprint retrospective notes",
            "Confirm team availability and assignments",
            "Re-estimate remaining backlog items",
            "Update dependencies and blockers",
            "Schedule kickoff meeting with stakeholders",
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
  const { subSection, navigate } = useNavigation();
  const routerNavigate = useNavigate();
  const { plan } = useSubscription();
  const [view, setView] = useState<ProjView>("grid");
  const [gridFilter, setGridFilter] = useState("All");
  const [projects, setProjects] = useState<Project[]>([]);
  const [allTasks, setAllTasks] = useState<TaskItem[]>([]);
  const [membersMap, setMembersMap] = useState<Map<string, string>>(new Map());
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

  // Fetch workspace members for resolving team user_ids to names
  useEffect(() => {
    api.getWorkspaceMembers().then(({ members }) => {
      const map = new Map<string, string>();
      for (const m of members) if (m.user_id) map.set(m.user_id, m.name || m.email);
      setMembersMap(map);
    }).catch(() => {});
  }, []);

  const loadData = useCallback((opts?: { silent?: boolean }) => {
    const onErr = (label: string) => (e: unknown) => {
      logger.error("app", e instanceof Error ? e : new Error(`Failed to load ${label}`));
      if (!opts?.silent) toast.error(`Failed to load ${label}`);
    };
    api.getProjects().then((data) => setProjects(data)).catch(onErr("projects"));
    api.getTasks().then((data) => setAllTasks(data)).catch(onErr("tasks"));
    api.getMilestones("web").then(setWebMilestones).catch(onErr("milestones"));
    api.getMilestones("mobile").then(setMobileMilestones).catch(onErr("milestones"));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useRealtimeSync(["projects", "tasks", "milestones"], () => loadData({ silent: true }));

  useEffect(() => {
    if (subSection === "new-project") { openNewProject(); return; }
    const mapped = subSectionMap[subSection];
    if (mapped) setView(mapped);
  }, [subSection]);

  const isGridView = view === "grid";

  const webProj = projects.find((p) => p.name.toLowerCase().includes("web app") || p.name.toLowerCase().includes("web application"));
  const mobileProj = projects.find((p) => p.name.toLowerCase().includes("mobile"));

  const navTabs: { view: ProjView; labelKey: string }[] = [
    { view: "grid", labelKey: "projects.allProjects" },
    { view: "web-application", labelKey: "projects.webApp" },
    { view: "mobile-app", labelKey: "projects.mobileAppShort" },
    { view: "proj-completed", labelKey: "projects.completed" },
    { view: "proj-archived", labelKey: "projects.archived" },
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
          onAnalytics={(p) => navigate("project-analytics", p.id)}
          membersMap={membersMap}
        />
        <NewProjectModal open={showNew} onClose={() => setShowNew(false)} onAdd={async (p) => {
          try { const created = await api.createProject(p); setProjects((prev) => [created, ...prev]); }
          catch (e) {
            logger.error("app", "Failed to create project:", e);
            if (e instanceof api.ApiError && e.code === "project_limit") {
              toast.error(e.message, {
                action: { label: "Upgrade", onClick: () => routerNavigate("/pricing") },
              });
            } else {
              toast.error(t("projects.failedToCreate"));
            }
            throw e;
          }
        }} />
        <ProjectDetailModal
          open={!!selectedProject}
          onClose={() => setSelectedProject(null)}
          project={selectedProject}
          onUpdate={async (id, patch) => {
            const prev = projects;
            setProjects((ps) => ps.map((p) => p.id === id ? { ...p, ...patch } : p));
            try {
              const updated = await api.updateProject(id, patch);
              setProjects((ps) => ps.map((p) => p.id === id ? updated : p));
            } catch (e) {
              setProjects(prev);
              logger.error("app", "Failed to update project:", e);
              toast.error(t("projects.failedToUpdate"));
              throw e;
            }
          }}
          onDelete={async (id) => {
            const prev = projects;
            setProjects((ps) => ps.filter((p) => p.id !== id));
            try {
              await api.deleteProject(id);
            } catch (e) {
              setProjects(prev);
              logger.error("app", "Failed to delete project:", e);
              toast.error(t("projects.failedToDelete"));
              throw e;
            }
          }}
        />
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
              {t(VIEW_LABEL_KEYS[view] as any)}
            </h1>
            <p className="text-neutral-500 text-[12px] lg:text-[13px]">
              {view === "web-application" || view.startsWith("proj-web") ? `${t("projects.webApplication")} · ${t("projects.due")} ${webProj?.due ?? "—"}`
                : view === "mobile-app" || view.startsWith("proj-mobile") ? `${t("projects.mobileAppShort")} · ${t("projects.due")} ${mobileProj?.due ?? "—"}`
                : t("projects.overview")}
            </p>
          </div>
          <button onClick={openNewProject} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors shrink-0">
            {t("projects.newProject")}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-neutral-800/60 overflow-x-auto">
          {navTabs.map((tab) => (
            <button key={tab.view} onClick={() => setView(tab.view)}
              className={`px-3 lg:px-4 py-2.5 text-[12px] lg:text-[13px] border-b-2 transition-colors -mb-px whitespace-nowrap ${view === tab.view ? "border-indigo-500 text-neutral-50" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}>
              {t(tab.labelKey as any)}
            </button>
          ))}
          {/* Sub-area pill if drilled into an area */}
          {(view === "proj-web-frontend" || view === "proj-web-api" || view === "proj-web-qa" || view === "proj-mobile-design" || view === "proj-mobile-native") && (
            <div className="flex items-center gap-1 ml-2">
              <ChevronRight size={13} className="text-neutral-600" />
              <span className="text-indigo-400 text-[12px] py-2.5">{t(VIEW_LABEL_KEYS[view] as any)}</span>
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
              {view === "web-application" && <WebAppView onDrillDown={setView} allTasks={allTasks} webMilestones={webMilestones} projects={projects} membersMap={membersMap}
                onToggleMilestone={(idx) => {
                  const m = webMilestones[idx];
                  if (!m) return;
                  const newDone = !m.done;
                  setWebMilestones((prev) => prev.map((item, i) => i === idx ? { ...item, done: newDone } : item));
                  api.toggleMilestone("web", idx, newDone).catch((e) => {
                    logger.error("app", "Failed to toggle milestone:", e);
                    setWebMilestones((prev) => prev.map((item, i) => i === idx ? { ...item, done: !newDone } : item));
                    toast.error(t("projects.failedToUpdateMilestone"));
                  });
                }}
              />}
              {view === "proj-web-frontend" && <ProjectAreaView tasks={webTasks.filter((t) => !t.title.toLowerCase().includes("api") && !t.title.toLowerCase().includes("test"))} label1={t("projects.tasksCompleted")} label2={t("projects.frontendArea")} teamLabel={t("projects.webFrontendTeam")} milestones={webMilestones} deadline={webProj?.due ?? "—"} />}
              {view === "proj-web-api" && <ProjectAreaView tasks={webTasks.filter((t) => t.title.toLowerCase().includes("api") || t.title.toLowerCase().includes("endpoint") || t.title.toLowerCase().includes("auth"))} label1={t("projects.tasksCompleted")} label2={t("projects.apiArea")} teamLabel={t("projects.backendTeam")} deadline={webProj?.due ?? "—"} />}
              {view === "proj-web-qa" && <ProjectAreaView tasks={webTasks.filter((t) => t.title.toLowerCase().includes("test") || t.title.toLowerCase().includes("qa") || t.title.toLowerCase().includes("bug"))} label1={t("projects.testsPassing")} label2={t("projects.qaArea")} teamLabel={t("projects.qaTeam")} deadline={webProj?.due ?? "—"} />}
              {view === "mobile-app" && <MobileAppView onDrillDown={setView} allTasks={allTasks} mobileMilestones={mobileMilestones} projects={projects} membersMap={membersMap}
                onToggleMilestone={(idx) => {
                  const m = mobileMilestones[idx];
                  if (!m) return;
                  const newDone = !m.done;
                  setMobileMilestones((prev) => prev.map((item, i) => i === idx ? { ...item, done: newDone } : item));
                  api.toggleMilestone("mobile", idx, newDone).catch((e) => {
                    logger.error("app", "Failed to toggle milestone:", e);
                    setMobileMilestones((prev) => prev.map((item, i) => i === idx ? { ...item, done: !newDone } : item));
                    toast.error(t("projects.failedToUpdateMilestone"));
                  });
                }}
              />}
              {view === "proj-mobile-design" && <ProjectAreaView tasks={mobileTasks.filter((t) => t.title.toLowerCase().includes("design") || t.title.toLowerCase().includes("ui") || t.title.toLowerCase().includes("wireframe"))} label1={t("projects.screensDone")} label2={t("projects.designArea")} teamLabel={t("projects.designTeam")} milestones={mobileMilestones} deadline={mobileProj?.due ?? "—"} />}
              {view === "proj-mobile-native" && <ProjectAreaView tasks={mobileTasks.filter((t) => !t.title.toLowerCase().includes("design") && !t.title.toLowerCase().includes("ui"))} label1={t("projects.tasksCompleted")} label2={t("projects.nativeDevArea")} teamLabel={t("projects.mobileDevTeam")} deadline={mobileProj?.due ?? "—"} />}
              {view === "proj-completed" && <CompletedView projects={projects} membersMap={membersMap} />}
              {view === "proj-archived" && <ArchivedView projects={projects} membersMap={membersMap} />}
            </>
          );
        })()}
      </div>

      <NewProjectModal open={showNew} onClose={() => setShowNew(false)} onAdd={async (p) => {
        try {
          const created = await api.createProject(p);
          setProjects((prev) => [created, ...prev]);
        } catch (e) {
          logger.error("app", "Failed to create project:", e);
          if (e instanceof api.ApiError && e.code === "project_limit") {
            toast.error(e.message, {
              action: { label: "Upgrade", onClick: () => routerNavigate("/pricing") },
            });
          } else {
            toast.error(t("projects.failedToCreate"));
          }
          throw e;
        }
      }} />
    </div>
  );
}


