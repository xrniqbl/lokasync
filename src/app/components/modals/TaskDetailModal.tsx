import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useLang } from "../../LangContext";
import { BaseModal, ModalSelect } from "./BaseModal";
import type { Task } from "../../utils/api";
import * as api from "../../utils/api";

interface TaskDetailModalProps {
  task: Task | null;
  onClose: () => void;
  onUpdate: (updated: Task) => void;
  onDelete: (id: string) => void;
}

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  "in-progress": { label: "In Progress", color: "#f59e0b", dot: "#f59e0b" },
  review: { label: "Review", color: "#3b82f6", dot: "#3b82f6" },
  todo: { label: "Todo", color: "#525252", dot: "#404040" },
  completed: { label: "Done", color: "#10b981", dot: "#10b981" },
};

const priorityConfig: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: "High", color: "#ef4444", bg: "bg-red-950/40" },
  medium: { label: "Medium", color: "#f59e0b", bg: "bg-amber-950/40" },
  low: { label: "Low", color: "#525252", bg: "bg-neutral-800/40" },
};

export function TaskDetailModal({ task, onClose, onUpdate, onDelete }: TaskDetailModalProps) {
  const { t } = useLang();
  const [status, setStatus] = useState(task?.status ?? "todo");
  const [priority, setPriority] = useState(task?.priority ?? "medium");
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task?.title ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [description, setDescription] = useState(task?.description ?? "");

  // Sync state when task prop changes (fixes stale state bug)
  useEffect(() => {
    if (task) {
      setStatus(task.status);
      setPriority(task.priority);
      setTitle(task.title);
      setDescription(task.description);
      setEditingTitle(false);
      setEditingDesc(false);
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve assignee name from workspace members
  const [assigneeName, setAssigneeName] = useState(task?.assignee ?? "");
  useEffect(() => {
    if (!task?.assignee) { setAssigneeName(""); return; }
    api.getWorkspaceMembers().then(({ members }) => {
      const m = members.find((m) => m.user_id === task.assignee);
      setAssigneeName(m?.name || m?.email || task.assignee);
    }).catch(() => setAssigneeName(task.assignee));
  }, [task?.assignee]);

  if (!task) return null;

  const handleSave = () => {
    onUpdate({
      ...task,
      title: title.trim() || task.title,
      description: description.trim(),
      status,
      priority,
      completed: status === "completed",
    });
    toast.success(t("taskDetail.updated"));
    onClose();
  };

  const handleDelete = () => {
    onDelete(task.id);
    toast.success(t("taskDetail.deleted"));
    onClose();
  };

  const p = priorityConfig[priority];
  const s = statusConfig[status];

  return (
    <BaseModal open={!!task} onClose={onClose} title="" width="max-w-lg">
      <div className="-mt-5 space-y-5">
        {/* Title */}
        <div>
          {editingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
              className="w-full bg-transparent border-b border-indigo-600/60 text-neutral-50 text-[16px] font-['Lexend:SemiBold',_sans-serif] outline-none pb-0.5"
            />
          ) : (
            <div
              onClick={() => setEditingTitle(true)}
              className="text-neutral-50 text-[16px] font-['Lexend:SemiBold',_sans-serif] cursor-text hover:text-white transition-colors"
            >
              {title}
            </div>
          )}

          {/* Description — editable */}
          {editingDesc ? (
            <textarea
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => setEditingDesc(false)}
              rows={3}
              placeholder="Add a description..."
              className="w-full bg-neutral-800/30 border border-neutral-700 rounded-lg text-neutral-300 text-[12px] outline-none p-2 mt-2 resize-none focus:border-indigo-600/60 transition-colors"
            />
          ) : (
            <div
              onClick={() => setEditingDesc(true)}
              className="text-neutral-500 text-[12px] mt-1.5 cursor-text hover:text-neutral-400 transition-colors min-h-[18px]"
            >
              {description || "Click to add a description..."}
            </div>
          )}
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-4 py-4 border-t border-b border-neutral-800/40">
          <div>
            <div className="text-neutral-600 text-[11px] mb-1.5 uppercase tracking-wider">Project</div>
            <div className="text-neutral-300 text-[13px]">{task.project || "—"}</div>
          </div>
          <div>
            <div className="text-neutral-600 text-[11px] mb-1.5 uppercase tracking-wider">Assignee</div>
            <div className="flex items-center gap-2">
              {task.assignee ? (
                <>
                  <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-400">{(assigneeName[0] ?? "?").toUpperCase()}</div>
                  <span className="text-neutral-300 text-[13px]">{assigneeName}</span>
                </>
              ) : (
                <span className="text-neutral-500 text-[13px]">Unassigned</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-neutral-600 text-[11px] mb-1.5 uppercase tracking-wider">Due date</div>
            <div className="text-neutral-300 text-[13px]">{task.due || "—"}</div>
          </div>
          <div>
            <div className="text-neutral-600 text-[11px] mb-1.5 uppercase tracking-wider">Priority</div>
            <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded ${p.bg}`} style={{ color: p.color }}>
              {p.label}
            </span>
          </div>
        </div>

        {/* Status + priority selectors */}
        <div className="grid grid-cols-2 gap-3">
          <ModalSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "todo", label: "Todo" },
              { value: "in-progress", label: "In Progress" },
              { value: "review", label: "Review" },
              { value: "completed", label: "Done" },
            ]}
          />
          <ModalSelect
            label="Priority"
            value={priority}
            onChange={setPriority}
            options={[
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ]}
          />
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 text-[12px]" style={{ color: s.color }}>
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.dot }} />
          {s.label}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-800/60">
          <button
            onClick={handleDelete}
            className="text-red-400 hover:text-red-300 text-[12px] px-3 py-1.5 rounded-lg hover:bg-red-950/30 transition-colors"
          >
            Delete task
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-neutral-400 hover:text-neutral-200 text-[13px] transition-colors border border-neutral-800 hover:bg-neutral-800">
              Cancel
            </button>
            <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] transition-colors">
              Save changes
            </button>
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
