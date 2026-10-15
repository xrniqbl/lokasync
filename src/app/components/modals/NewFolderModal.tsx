import { useRef, useState } from "react";
import { BaseModal, ModalInput, ModalFooter } from "./BaseModal";

interface NewFolderModalProps {
  open: boolean;
  onClose: () => void;
  onAdd?: (folder: { name: string; files: number; modified: string }) => void | Promise<void>;
}

export function NewFolderModal({ open, onClose, onAdd }: NewFolderModalProps) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const reset = () => {
    setName("");
    setNameError("");
    setSubmitError("");
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!name.trim()) {
      setNameError("Folder name is required");
      return;
    }
    setNameError("");
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      await onAdd?.({ name: name.trim(), files: 0, modified: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) });
      reset();
      onClose();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to create folder");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <BaseModal open={open} onClose={() => { reset(); onClose(); }} title="New Folder" description="Create a new folder to organize your files" width="max-w-sm">
      <div className="space-y-4">
        <div>
          <ModalInput label="Folder name *" placeholder="e.g. Project Assets" value={name} onChange={(v) => { setName(v); if (nameError) setNameError(""); }} />
          {nameError && <p className="text-red-400 text-[11px] mt-1">{nameError}</p>}
        </div>
        {submitError && (
          <p role="alert" className="text-red-400 text-[12px] bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{submitError}</p>
        )}
      </div>
      <ModalFooter onCancel={() => { reset(); onClose(); }} onConfirm={handleSubmit} confirmLabel={submitting ? "Creating…" : "Create folder"} confirmDisabled={!name.trim() || submitting} />
    </BaseModal>
  );
}
