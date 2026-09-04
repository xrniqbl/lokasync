import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useLang } from "../../LangContext";
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

export type NewTaskInput = NewTask & { status: string; completed: boolean };

interface NewTaskModalProps {
  open: boolean;
  onClose: () => void;
  onAdd?: (task: NewTaskInput) => void;
}

export function NewTaskModal({ open, onClose, onAdd }: NewTaskModalProps) {
  const { t } = useLang();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [project, setProject] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [assigneeOptions, setAssigneeOptions] = useState<{ value: string; label: string }[]>([]);
  const [projectOptions, setProjectOptions] = useState<{ value: string; label: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Fetch workspace members for assignee dropdown — use user_id as value
    // so "My Tasks" can filter by assignee matching the logged-in user.
    api.getWorkspaceMembers().then(({ members }) => {
      const opts = members.filter((m) => m.user_id != null).map((m) => ({ value: m.user_id!, label: m.name || m.email }));
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
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error(t("newTask.titleRequired"));
      return;
    }
    setSubmitting(true);
    const newTask: NewTaskInput = {
      title: title.trim(),
      description: description.trim() || "No description",
      priority,
      project,
      assignee,
      due: due || "No due date",
      status: "todo",
      completed: false,
    };
    try {
      await onAdd?.(newTask);
      toast.success(t("newTask.created"));
      reset();
      onClose();
    } catch {
      // Error toast already shown by parent — modal stays open
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BaseModal open={open} onClose={() => { reset(); onClose(); }} title="New Task" description="Add a new task to your board">
      <div className="space-y-4">
        <ModalInput label="Title *" placeholder="What needs to be done?" value={title} onChange={setTitle} />
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
          <ModalInput label="Due date" placeholder="Jun 15" value={due} onChange={setDue} />
        </div>
      </div>
      <ModalFooter onCancel={() => { reset(); onClose(); }} onConfirm={handleSubmit} confirmLabel={submitting ? "Creating..." : "Create task"} confirmDisabled={!title.trim() || submitting} />
    </BaseModal>
  );
}
