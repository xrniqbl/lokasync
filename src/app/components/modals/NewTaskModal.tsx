import { useState, useEffect } from "react";
import { toast } from "sonner";
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
  onAdd?: (task: NewTask & { id: number; status: string; completed: boolean }) => void;
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
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error("Task title is required");
      return;
    }
    const newTask = {
      id: Date.now(),
      title: title.trim(),
      description: description.trim() || "No description",
      priority,
      project,
      assignee,
      due: due || "No due date",
      status: "todo",
      completed: false,
    };
    onAdd?.(newTask);
    toast.success("Task created");
    reset();
    onClose();
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
      <ModalFooter onCancel={() => { reset(); onClose(); }} onConfirm={handleSubmit} confirmLabel="Create task" confirmDisabled={!title.trim()} />
    </BaseModal>
  );
}
