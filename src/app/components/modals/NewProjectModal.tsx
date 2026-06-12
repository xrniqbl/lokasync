import { useState } from "react";
import { toast } from "sonner";
import { BaseModal, ModalInput, ModalFooter } from "./BaseModal";

export interface Project {
  id: number;
  name: string;
  description: string;
  status: string;
  progress: number;
  tasks: { total: number; done: number };
  team: string[];
  due: string;
  tags: string[];
}

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onAdd?: (project: Project) => void;
}

export function NewProjectModal({ open, onClose, onAdd }: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [tags, setTags] = useState("");

  const reset = () => {
    setName("");
    setDescription("");
    setDue("");
    setTags("");
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    const project: Project = {
      id: Date.now(),
      name: name.trim(),
      description: description.trim() || "No description provided.",
      status: "active",
      progress: 0,
      tasks: { total: 0, done: 0 },
      team: ["JD"],
      due: due || "TBD",
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : ["new"],
    };
    onAdd?.(project);
    toast.success("Project created");
    reset();
    onClose();
  };

  return (
    <BaseModal open={open} onClose={() => { reset(); onClose(); }} title="New Project" description="Create a new project for your team">
      <div className="space-y-4">
        <ModalInput label="Project name *" placeholder="e.g. Customer Dashboard" value={name} onChange={setName} />
        <div>
          <label className="block text-neutral-400 text-[12px] mb-1.5">Description</label>
          <textarea
            placeholder="What is this project about?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-600 resize-none font-['Lexend:Regular',_sans-serif]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ModalInput label="Due date" placeholder="Jul 30, 2026" value={due} onChange={setDue} />
          <ModalInput label="Tags (comma-separated)" placeholder="frontend, api" value={tags} onChange={setTags} />
        </div>
      </div>
      <ModalFooter onCancel={() => { reset(); onClose(); }} onConfirm={handleSubmit} confirmLabel="Create project" confirmDisabled={!name.trim()} />
    </BaseModal>
  );
}
