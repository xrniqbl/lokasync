import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useLang } from "../../LangContext";
import { BaseModal, ModalInput, ModalFooter } from "./BaseModal";
import * as api from "../../utils/api";

export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  progress: number;
  tasks: { total: number; done: number };
  team: string[];
  due: string;
  tags: string[];
}

export type NewProjectInput = Omit<Project, "id">;

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onAdd?: (project: NewProjectInput) => Promise<void>;
}

export function NewProjectModal({ open, onClose, onAdd }: NewProjectModalProps) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [tags, setTags] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memberOptions, setMemberOptions] = useState<{ user_id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.getWorkspaceMembers().then(({ members }) => {
      setMemberOptions(members.filter((m) => m.user_id != null).map((m) => ({ user_id: m.user_id!, name: m.name || m.email })));
    }).catch(() => {});
  }, [open]);

  const reset = () => {
    setName("");
    setDescription("");
    setDue("");
    setTags("");
    setSelectedMembers([]);
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t("newProject.nameRequired"));
      return;
    }
    setSubmitting(true);
    const project: NewProjectInput = {
      name: name.trim(),
      description: description.trim() || "No description provided.",
      status: "active",
      progress: 0,
      tasks: { total: 0, done: 0 },
      team: selectedMembers,
      due: due || "TBD",
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : ["new"],
    };
    try {
      await onAdd?.(project);
      toast.success(t("projects.projectCreated"));
      reset();
      onClose();
    } catch {
      // Parent shows error toast — modal stays open
    } finally {
      setSubmitting(false);
    }
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
        {/* Team member selection */}
        {memberOptions.length > 0 && (
          <div>
            <label className="block text-neutral-400 text-[12px] mb-1.5">Team members</label>
            <div className="flex flex-wrap gap-1.5">
              {memberOptions.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => toggleMember(m.user_id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
                    selectedMembers.includes(m.user_id)
                      ? "bg-indigo-950/40 border-indigo-500/40 text-indigo-300"
                      : "bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:border-neutral-600"
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-neutral-700 flex items-center justify-center text-[8px] text-neutral-300">
                    {(m.name[0] ?? "?").toUpperCase()}
                  </div>
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <ModalFooter onCancel={() => { reset(); onClose(); }} onConfirm={handleSubmit} confirmLabel={submitting ? "Creating..." : "Create project"} confirmDisabled={!name.trim() || submitting} />
    </BaseModal>
  );
}
