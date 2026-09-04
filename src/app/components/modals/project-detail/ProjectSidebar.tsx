import { useState, useEffect, useRef } from "react";
import { User, Calendar, Tag, Clock, X, Plus } from "lucide-react";
import type { Project } from "../../../utils/api";
import type { LocalChecklistItem } from "./types";

// ── Status config ────────────────────────────────────────────────────────────

const statusOptions: { value: string; label: string; color: string }[] = [
  { value: "not-started", label: "Not Started", color: "#525252" },
  { value: "planning", label: "Planning", color: "#818cf8" },
  { value: "in-progress", label: "In Progress", color: "#f59e0b" },
  { value: "review", label: "Review", color: "#3b82f6" },
  { value: "testing", label: "Testing", color: "#a855f7" },
  { value: "completed", label: "Completed", color: "#10b981" },
  { value: "cancelled", label: "Cancelled", color: "#ef4444" },
  { value: "paused", label: "Archived", color: "#f59e0b" },
];

const priorityOptions: { value: string; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "#525252" },
  { value: "medium", label: "Medium", color: "#f59e0b" },
  { value: "high", label: "High", color: "#ef4444" },
  { value: "urgent", label: "Urgent", color: "#dc2626" },
];

function getStatusColor(val: string) {
  return statusOptions.find((s) => s.value === val)?.color ?? "#525252";
}
function getPriorityColor(val: string) {
  return priorityOptions.find((p) => p.value === val)?.color ?? "#525252";
}

// ── Sidebar field row ────────────────────────────────────────────────────────

function FieldRow({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="text-neutral-600 mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-neutral-500 text-[10px] uppercase tracking-wider mb-1">{label}</div>
        {children}
      </div>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface ProjectSidebarProps {
  project: Project;
  checklist: LocalChecklistItem[];
  timeTracking: { estimated: number; logged: number };
  membersMap: Map<string, string>;
  onUpdate: (id: string, patch: Partial<Project>) => Promise<void>;
  onTimeTrackingChange: (tt: { estimated: number; logged: number }) => void;
}

export function ProjectSidebar({ project, checklist, timeTracking, membersMap, onUpdate, onTimeTrackingChange }: ProjectSidebarProps) {
  const [editTags, setEditTags] = useState(false);
  const [tagInput, setTagInput] = useState(project.tags.join(", "));
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const tagRef = useRef<HTMLInputElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTagInput(project.tags.join(", ")); }, [project.tags]);
  useEffect(() => { if (editTags && tagRef.current) tagRef.current.focus(); }, [editTags]);

  // Close assignee picker on outside click
  useEffect(() => {
    if (!showAssigneePicker) return;
    const handler = (e: MouseEvent) => {
      if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) setShowAssigneePicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAssigneePicker]);

  // Progress calculation
  const checklistDone = checklist.filter((i) => i.completed).length;
  const checklistTotal = checklist.length;
  const taskDone = project.tasks.done;
  const taskTotal = project.tasks.total;
  const combinedTotal = checklistTotal + taskTotal;
  const combinedDone = checklistDone + taskDone;
  const progress = combinedTotal > 0 ? Math.round((combinedDone / combinedTotal) * 100) : project.progress;

  const handleFieldChange = (field: string, value: string) => {
    onUpdate(project.id, { [field]: value } as Partial<Project>);
  };

  const handleTagsSave = () => {
    const tags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);
    onUpdate(project.id, { tags });
    setEditTags(false);
  };

  const resolveMember = (id: string) => membersMap.get(id) || id;

  const toggleAssignee = (userId: string) => {
    const current = project.team;
    const updated = current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId];
    onUpdate(project.id, { team: updated });
  };

  // Available members not yet assigned
  const availableMembers = Array.from(membersMap.entries())
    .filter(([id]) => !project.team.includes(id));

  const timeRemaining = Math.max(0, timeTracking.estimated - timeTracking.logged);

  return (
    <div className="space-y-0.5 divide-y divide-neutral-800/40">
      {/* Assignees */}
      <FieldRow label="Assignees" icon={<User size={14} strokeWidth={1.8} />}>
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {project.team.length > 0 ? project.team.map((m) => (
              <span key={m} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-neutral-800 text-neutral-300 text-[11px] group">
                <span className="w-4 h-4 rounded-full bg-neutral-700 flex items-center justify-center text-[8px] text-neutral-400 shrink-0">
                  {resolveMember(m).substring(0, 2).toUpperCase()}
                </span>
                {resolveMember(m)}
                <button
                  onClick={() => toggleAssignee(m)}
                  className="p-0.5 rounded-full text-neutral-600 hover:text-red-400 hover:bg-neutral-700 opacity-0 group-hover:opacity-100 transition-all"
                  title="Remove"
                >
                  <X size={10} strokeWidth={2} />
                </button>
              </span>
            )) : (
              <span className="text-neutral-600 text-[11px]">No assignees</span>
            )}
          </div>
          {/* Add assignee */}
          <div className="relative" ref={assigneeRef}>
            <button
              onClick={() => setShowAssigneePicker(!showAssigneePicker)}
              className="flex items-center gap-1 text-neutral-500 hover:text-neutral-300 text-[10px] transition-colors"
            >
              <Plus size={10} /> Add member
            </button>
            {showAssigneePicker && availableMembers.length > 0 && (
              <div className="absolute left-0 top-full mt-1 w-48 bg-[#1a1a1a] border border-neutral-800 rounded-lg shadow-xl z-10 py-1 max-h-40 overflow-y-auto">
                {availableMembers.map(([id, name]) => (
                  <button
                    key={id}
                    onClick={() => { toggleAssignee(id); setShowAssigneePicker(false); }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-neutral-800 transition-colors text-left"
                  >
                    <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-[9px] shrink-0">
                      {name.substring(0, 2).toUpperCase()}
                    </span>
                    <span className="text-neutral-300 text-[11px]">{name}</span>
                  </button>
                ))}
              </div>
            )}
            {showAssigneePicker && availableMembers.length === 0 && (
              <div className="absolute left-0 top-full mt-1 w-48 bg-[#1a1a1a] border border-neutral-800 rounded-lg shadow-xl z-10 py-2 px-3">
                <span className="text-neutral-500 text-[11px]">All members are assigned</span>
              </div>
            )}
          </div>
        </div>
      </FieldRow>

      {/* Status */}
      <FieldRow label="Status" icon={<div className="w-2.5 h-2.5 rounded-full mt-0.5" style={{ backgroundColor: getStatusColor(project.status) }} />}>
        <select
          value={project.status}
          onChange={(e) => handleFieldChange("status", e.target.value)}
          className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg pl-2.5 pr-6 py-1.5 text-neutral-200 text-[12px] outline-none cursor-pointer transition-colors appearance-none"
        >
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </FieldRow>

      {/* Priority */}
      <FieldRow label="Priority" icon={<div className="w-2.5 h-2.5 rounded-sm mt-0.5" style={{ backgroundColor: getPriorityColor(project.priority ?? "medium") }} />}>
        <select
          value={project.priority ?? "medium"}
          onChange={(e) => handleFieldChange("priority", e.target.value)}
          className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg pl-2.5 pr-6 py-1.5 text-neutral-200 text-[12px] outline-none cursor-pointer transition-colors appearance-none"
        >
          {priorityOptions.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </FieldRow>

      {/* Due Date */}
      <FieldRow label="Due Date" icon={<Calendar size={14} strokeWidth={1.8} />}>
        <input
          type="text"
          value={project.due}
          onChange={(e) => handleFieldChange("due", e.target.value)}
          placeholder="e.g. Jul 30, 2026"
          onBlur={(e) => {
            // Basic validation: ensure it's not empty
            if (!e.target.value.trim()) handleFieldChange("due", "TBD");
          }}
          className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-2.5 py-1.5 text-neutral-200 text-[12px] outline-none transition-colors"
        />
      </FieldRow>

      {/* Tags */}
      <FieldRow label="Tags" icon={<Tag size={14} strokeWidth={1.8} />}>
        {editTags ? (
          <div>
            <input
              ref={tagRef}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onBlur={handleTagsSave}
              onKeyDown={(e) => { if (e.key === "Enter") handleTagsSave(); if (e.key === "Escape") { setTagInput(project.tags.join(", ")); setEditTags(false); } }}
              placeholder="Comma-separated tags"
              className="w-full bg-[#0f0f0f] border border-indigo-500/50 rounded-lg px-2.5 py-1.5 text-neutral-200 text-[12px] outline-none"
            />
            <span className="text-neutral-600 text-[9px] mt-0.5 block">Press Enter to save, Esc to cancel</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1 cursor-pointer min-h-[24px]" onClick={() => setEditTags(true)}>
            {project.tags.length > 0 ? project.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-[10px]">
                {tag}
              </span>
            )) : (
              <span className="text-neutral-600 text-[11px]">Click to add tags</span>
            )}
          </div>
        )}
      </FieldRow>

      {/* Time Tracking */}
      <FieldRow label="Time Tracking" icon={<Clock size={14} strokeWidth={1.8} />}>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Estimated", key: "estimated" as const, value: timeTracking.estimated },
            { label: "Logged", key: "logged" as const, value: timeTracking.logged },
            { label: "Remaining", key: "remaining" as const, value: timeRemaining },
          ].map((t) => (
            <div key={t.key} className="text-center">
              {t.key === "remaining" ? (
                <div className="text-neutral-300 text-[13px] font-['Lexend:SemiBold',_sans-serif]">{t.value}h</div>
              ) : (
                <input
                  type="number"
                  min={0}
                  value={t.value || ""}
                  onChange={(e) => onTimeTrackingChange({
                    ...timeTracking,
                    [t.key]: Math.max(0, Number(e.target.value) || 0),
                  })}
                  placeholder="0"
                  className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-md px-1.5 py-1 text-neutral-200 text-[13px] text-center outline-none transition-colors font-['Lexend:SemiBold',_sans-serif]"
                />
              )}
              <div className="text-neutral-600 text-[9px] mt-0.5">{t.label}</div>
            </div>
          ))}
        </div>
      </FieldRow>

      {/* Progress */}
      <div className="pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider">Progress</span>
          <span className="text-neutral-300 text-[12px] font-['Lexend:SemiBold',_sans-serif]">{progress}%</span>
        </div>
        <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-neutral-600 text-[10px]">
          <span>{checklistDone}/{checklistTotal} checklist</span>
          <span>{taskDone}/{taskTotal} tasks</span>
        </div>
      </div>
    </div>
  );
}
