import { useEffect, useRef, useState } from "react";
import { BaseModal, ModalInput, ModalSelect, ModalFooter } from "./BaseModal";
import * as api from "../../utils/api";

interface NewTask {
  title: string;
  description: string;
  priority: string;
  project: string;
  assignee: string;
  due: string;
}

interface NewTaskModalProps {
  open: boolean;
  onClose: () => void;
  onAdd?: (task: NewTask & { id: number; status: string; completed: boolean }) => void | Promise<void>;
}

export function NewTaskModal({ open, onClose, onAdd }: NewTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [project, setProject] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [assigneeOptions, setAssigneeOptions] = useState<{ value: string; label: string }[]>([]);
  const [projectOptions, setProjectOptions] = useState<{ value: string; label: string }[]>([]);
  const [titleError, setTitleError] = useState("");
  const [dueError, setDueError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    api.getTeams().then((teams) => {
      const opts = teams.flatMap((t) => t.members).map((m) => ({ value: m.initials, label: m.name }));
      setAssigneeOptions(opts);
      setAssignee((prev) => prev || opts[0]?.value || "");
    }).catch(() => {});
    api.getProjects().then((projects) => {
      const opts = projects.map((p) => ({ value: p.name, label: p.name }));
      setProjectOptions(opts);
      setProject((prev) => prev || opts[0]?.value || "");
    }).catch(() => {});
  }, [open]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setProject(projectOptions[0]?.value ?? "");
    setAssignee(assigneeOptions[0]?.value ?? "");
    setDue("");
    setTitleError("");
    setDueError("");
    setSubmitError("");
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    let valid = true;
    if (!title.trim()) {
      setTitleError("Task title is required");
      valid = false;
    } else {
      setTitleError("");
    }
    if (due.trim()) {
      const parsed = new Date(due.trim());
      if (Number.isNaN(parsed.getTime())) {
        setDueError("Enter a valid date (e.g. 2026-07-30)");
        valid = false;
      } else {
        setDueError("");
      }
    } else {
      setDueError("");
    }
    if (!valid) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      const newTask = {
        id: Date.now(),
        title: title.trim(),
        description: description.trim() || "No description",
        priority,
        project,
        assignee,
        due: due.trim() || "No due date",
        status: "todo",
        completed: false,
      };
      await onAdd?.(newTask);
      reset();
      onClose();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <BaseModal open={open} onClose={() => { reset(); onClose(); }} title="New Task" description="Add a new task to your board">
      <div className="space-y-4">
        <div>
          <ModalInput label="Title *" placeholder="What needs to be done?" value={title} onChange={(v) => { setTitle(v); if (titleError) setTitleError(""); }} />
          {titleError && <p className="text-red-400 text-[11px] mt-1">{titleError}</p>}
        </div>
        <div>
          <label className="block text-neutral-400 text-[12px] mb-1.5">Description</label>
          <textarea
            placeholder="Add more details..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-600 resize-none font-['Lexend:Regular',_sans-serif]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
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
          <ModalSelect
            label="Project"
            value={project}
            onChange={setProject}
            options={projectOptions}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ModalSelect
            label="Assignee"
            value={assignee}
            onChange={setAssignee}
            options={assigneeOptions}
          />
          <div>
            <ModalInput label="Due date" placeholder="2026-07-30" value={due} onChange={(v) => { setDue(v); if (dueError) setDueError(""); }} />
            {dueError && <p className="text-red-400 text-[11px] mt-1">{dueError}</p>}
          </div>
        </div>
        {submitError && (
          <p role="alert" className="text-red-400 text-[12px] bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{submitError}</p>
        )}
      </div>
      <ModalFooter onCancel={() => { reset(); onClose(); }} onConfirm={handleSubmit} confirmLabel={submitting ? "Creating…" : "Create task"} confirmDisabled={!title.trim() || submitting} />
    </BaseModal>
  );
}
