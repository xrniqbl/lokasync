import { useRef, useState } from "react";
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
  onAdd?: (project: Project) => void | Promise<void>;
}

export function NewProjectModal({ open, onClose, onAdd }: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [tags, setTags] = useState("");
  const [nameError, setNameError] = useState("");
  const [dueError, setDueError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const reset = () => {
    setName("");
    setDescription("");
    setDue("");
    setTags("");
    setNameError("");
    setDueError("");
    setSubmitError("");
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    let valid = true;
    if (!name.trim()) {
      setNameError("Project name is required");
      valid = false;
    } else {
      setNameError("");
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
      const project: Project = {
        id: Date.now(),
        name: name.trim(),
        description: description.trim() || "No description provided.",
        status: "active",
        progress: 0,
        tasks: { total: 0, done: 0 },
        team: ["JD"],
        due: due.trim() || "TBD",
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : ["new"],
      };
      await onAdd?.(project);
      reset();
      onClose();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <BaseModal open={open} onClose={() => { reset(); onClose(); }} title="New Project" description="Create a new project for your team">
      <div className="space-y-4">
        <div>
          <ModalInput label="Project name *" placeholder="e.g. Customer Dashboard" value={name} onChange={(v) => { setName(v); if (nameError) setNameError(""); }} />
          {nameError && <p className="text-red-400 text-[11px] mt-1">{nameError}</p>}
        </div>
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
          <div>
            <ModalInput label="Due date" placeholder="2026-07-30" value={due} onChange={(v) => { setDue(v); if (dueError) setDueError(""); }} />
            {dueError && <p className="text-red-400 text-[11px] mt-1">{dueError}</p>}
          </div>
          <ModalInput label="Tags (comma-separated)" placeholder="frontend, api" value={tags} onChange={setTags} />
        </div>
        {submitError && (
          <p role="alert" className="text-red-400 text-[12px] bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{submitError}</p>
        )}
      </div>
      <ModalFooter onCancel={() => { reset(); onClose(); }} onConfirm={handleSubmit} confirmLabel={submitting ? "Creating…" : "Create project"} confirmDisabled={!name.trim() || submitting} />
    </BaseModal>
  );
}
