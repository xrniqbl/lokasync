import { useState, useEffect } from "react";
import { toast } from "sonner";
import { NewTaskModal } from "./modals/NewTaskModal";
import { TaskDetailModal } from "./modals/TaskDetailModal";
import { useNavigation } from "./NavigationContext";
import { useLang } from "../i18n";
import * as api from "../utils/api";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useRealtimeWorkspace } from "../realtime";

type Task = api.Task;

const statusConfig: Record<string, { label: string; dot: string }> = {
  "in-progress": { label: "In Progress", dot: "#f59e0b" },
  review: { label: "Review", dot: "#3b82f6" },
  todo: { label: "Todo", dot: "#404040" },
  completed: { label: "Done", dot: "#10b981" },
};

const priorityConfig: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: "High", color: "#ef4444", bg: "bg-red-950/40" },
  medium: { label: "Medium", color: "#f59e0b", bg: "bg-amber-950/40" },
  low: { label: "Low", color: "#525252", bg: "bg-neutral-800/40" },
};

const tabs = ["All", "Today", "In Progress", "Review", "Completed"];

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-indigo-500 border-indigo-500" : "border-neutral-700 hover:border-neutral-500"}`}
    >
      {checked && (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export function TasksPage() {
  const { t } = useLang();
  const { subSection } = useNavigation();
  const { activeWorkspace } = useWorkspace();
  const [activeTab, setActiveTab] = useState("All");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedTasks, setCheckedTasks] = useState<Set<number>>(new Set());
  const [showNewTask, setShowNewTask] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  function fetchTasks() {
    setLoading(true);
    api.getTasks().then((data) => {
      setTasks(data);
      setCheckedTasks(new Set(data.filter((t) => t.completed).map((t) => t.id)));
    }).catch((e) => {
      console.log("Failed to load tasks:", e);
      toast.error(t("tasks.failedToLoadTasks"));
    }).finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchTasks();
  }, []);

  useRealtimeWorkspace(activeWorkspace?.id ?? null, (table) => {
    if (table === "tasks") fetchTasks();
  });

  useEffect(() => {
    if (subSection === "new-task") { setShowNewTask(true); }
    else if (subSection === "filter") { setShowFilter(true); }
    else if (subSection === "today") { setActiveTab("Today"); setSelectedTask(null); }
    else if (subSection === "in-progress") { setActiveTab("In Progress"); setSelectedTask(null); }
    else if (subSection === "completed") { setActiveTab("Completed"); setSelectedTask(null); }
    else if (subSection === "priority") { setActiveTab("All"); setFilterPriority("high"); setSelectedTask(null); }
    else if (subSection === "all") { setActiveTab("All"); setSelectedTask(null); }
    else if (subSection.startsWith("task-")) {
      const taskId = parseInt(subSection.slice(5), 10);
      const found = tasks.find((t) => t.id === taskId) ?? null;
      if (found) { setActiveTab("All"); setSelectedTask(found); }
    }
  }, [subSection, tasks]);

  const toggleTask = async (id: number) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const nowCompleted = !task.completed;
    const newStatus = nowCompleted ? "completed" : "todo";
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed: nowCompleted, status: newStatus } : t));
    const next = new Set(checkedTasks);
    if (nowCompleted) next.add(id); else next.delete(id);
    setCheckedTasks(next);
    try {
      await api.updateTask(id, { completed: nowCompleted, status: newStatus });
    } catch (e) {
      console.log("Failed to update task:", e);
      toast.error(t("tasks.failedToSaveTaskStatus"));
    }
  };

  const handleAddTask = async (task: Task) => {
    try {
      const created = await api.createTask(task);
      setTasks((prev) => [created, ...prev]);
    } catch (e) {
      console.log("Failed to create task:", e);
      toast.error(t("tasks.failedToCreateTask"));
    }
  };

  const handleUpdateTask = async (updated: Task) => {
    setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t));
    const next = new Set(checkedTasks);
    if (updated.completed) next.add(updated.id); else next.delete(updated.id);
    setCheckedTasks(next);
    try {
      await api.updateTask(updated.id, updated);
    } catch (e) {
      console.log("Failed to update task:", e);
      toast.error(t("tasks.failedToSaveTask"));
    }
  };

  const handleDeleteTask = async (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const next = new Set(checkedTasks);
    next.delete(id);
    setCheckedTasks(next);
    try {
      await api.deleteTask(id);
    } catch (e) {
      console.log("Failed to delete task:", e);
      toast.error(t("tasks.failedToDeleteTask"));
    }
  };

  const filtered = tasks.filter((task) => {
    const tabMatch =
      activeTab === "All" ? true :
      activeTab === "Today" ? task.due === "Jun 8" || task.due === "Jun 9" :
      activeTab === "In Progress" ? task.status === "in-progress" :
      activeTab === "Review" ? task.status === "review" :
      activeTab === "Completed" ? task.status === "completed" : true;

    const priorityMatch = filterPriority === "all" || task.priority === filterPriority;
    const projectMatch = filterProject === "all" || task.project === filterProject;
    return tabMatch && priorityMatch && projectMatch;
  });

  const projects = [...new Set(tasks.map((t) => t.project))];

  return (
    <div className="flex flex-col h-full font-['Lexend:Regular',_sans-serif]">
      {/* Header */}
      <div className="px-4 md:px-6 lg:px-8 pt-6 lg:pt-8 pb-0">
        <div className="flex items-center justify-between mb-5 gap-3">
          <div>
            <h1 className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif] text-[18px] lg:text-[22px] leading-tight mb-1">{t("tasks.myTasks")}</h1>
            <p className="text-neutral-500 text-[12px] lg:text-[13px]">
              {tasks.length} {t("common.tasks")} · {tasks.filter((task) => task.status === "in-progress").length} {t("tasks.tasksInProgress")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`border text-[13px] px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${showFilter ? "border-indigo-600/60 bg-indigo-950/30 text-indigo-400" : "border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"}`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 3h10M3 6h6M5 9h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              {t("common.filter")}
            </button>
            <button
              onClick={() => setShowNewTask(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors"
            >
              + {t("tasks.newTask")}
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilter && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-neutral-800/30 rounded-xl flex-wrap">
            <span className="text-neutral-500 text-[12px]">{t("tasks.filterBy")}</span>
            <div className="flex items-center gap-2">
              <label className="text-neutral-500 text-[12px]">{t("common.priority")}</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-[12px] px-2 py-1 rounded-lg outline-none cursor-pointer"
              >
                <option value="all">{t("common.all")}</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-neutral-500 text-[12px]">{t("common.project")}</label>
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-[12px] px-2 py-1 rounded-lg outline-none cursor-pointer"
              >
                <option value="all">{t("common.all")}</option>
                {projects.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            {(filterPriority !== "all" || filterProject !== "all") && (
              <button
                onClick={() => { setFilterPriority("all"); setFilterProject("all"); }}
                className="text-neutral-500 hover:text-neutral-200 text-[12px] px-2 py-1 rounded-lg hover:bg-neutral-800 transition-colors"
              >
                {t("tasks.clearFilters")}
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-neutral-800/60 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 lg:px-4 py-2.5 text-[12px] lg:text-[13px] border-b-2 transition-colors -mb-px whitespace-nowrap ${activeTab === tab ? "border-indigo-500 text-neutral-50" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-4">
        {/* Table header — hidden on mobile */}
        <div className="hidden md:grid md:grid-cols-[20px_1fr_100px_70px_90px_55px] gap-4 px-4 py-2 mb-1">
          <div />
          <div className="text-neutral-600 text-[11px] uppercase tracking-wider">{t("tasks.task")}</div>
          <div className="text-neutral-600 text-[11px] uppercase tracking-wider">{t("common.project")}</div>
          <div className="text-neutral-600 text-[11px] uppercase tracking-wider">{t("common.priority")}</div>
          <div className="text-neutral-600 text-[11px] uppercase tracking-wider">{t("common.status")}</div>
          <div className="text-neutral-600 text-[11px] uppercase tracking-wider">{t("tasks.due")}</div>
        </div>

        {loading && (
          <div className="space-y-0.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 items-center px-4 py-3 rounded-lg animate-pulse">
                <div className="w-4 h-4 rounded bg-neutral-800 shrink-0" />
                <div className="flex-1 h-3 rounded bg-neutral-800" />
                <div className="w-24 h-3 rounded bg-neutral-800 hidden md:block" />
                <div className="w-16 h-3 rounded bg-neutral-800 hidden md:block" />
              </div>
            ))}
          </div>
        )}
        <div className="space-y-0.5">
          {!loading && filtered.map((task) => {
            const isChecked = checkedTasks.has(task.id);
            return (
              <div key={task.id} className="flex md:grid md:grid-cols-[20px_1fr_100px_70px_90px_55px] gap-2 md:gap-4 items-center px-3 md:px-4 py-3 rounded-lg hover:bg-neutral-800/20 transition-colors group cursor-pointer" onClick={() => setSelectedTask(task)}>
                <Checkbox checked={isChecked} onChange={() => toggleTask(task.id)} />
                <div className="min-w-0 flex-1 md:flex-none">
                  <div className={`text-[12px] md:text-[13px] truncate ${isChecked ? "line-through text-neutral-600" : "text-neutral-200"}`}>
                    {task.title}
                  </div>
                  <div className="text-neutral-600 text-[11px] truncate mt-0.5 md:block">{task.description}</div>
                </div>
                <div className="text-neutral-500 text-[12px] truncate hidden md:block">{task.project}</div>
                <div className="hidden md:block">
                  <span
                    className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded ${priorityConfig[task.priority].bg}`}
                    style={{ color: priorityConfig[task.priority].color }}
                  >
                    {priorityConfig[task.priority].label}
                  </span>
                </div>
                <div className="hidden md:flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusConfig[task.status].dot }} />
                  <span className="text-neutral-500 text-[12px]">{statusConfig[task.status].label}</span>
                </div>
                <div className="text-neutral-600 text-[11px] hidden md:block">{task.due}</div>
              </div>
            );
          })}
        </div>

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <span className="text-neutral-600 text-[13px]">{t("tasks.noTasksMatchFilters")}</span>
            <button onClick={() => { setActiveTab("All"); setFilterPriority("all"); setFilterProject("all"); }} className="text-indigo-400 text-[12px] hover:underline">
              {t("tasks.clearFilters")}
            </button>
          </div>
        )}
      </div>

      <NewTaskModal open={showNewTask} onClose={() => setShowNewTask(false)} onAdd={handleAddTask} />
      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={handleUpdateTask}
        onDelete={handleDeleteTask}
      />
    </div>
  );
}
