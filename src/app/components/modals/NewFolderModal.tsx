import { useState } from "react";
import { toast } from "sonner";
import { useLang } from "../../LangContext";
import { BaseModal, ModalInput, ModalFooter } from "./BaseModal";

interface NewFolderModalProps {
  open: boolean;
  onClose: () => void;
  onAdd?: (folder: { name: string; files: number; modified: string }) => Promise<void>;
}

export function NewFolderModal({ open, onClose, onAdd }: NewFolderModalProps) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => setName("");

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t("folders.nameRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await onAdd?.({ name: name.trim(), files: 0, modified: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) });
      toast.success(`Folder "${name.trim()}" created`);
      reset();
      onClose();
    } catch {
      // Parent shows error toast
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BaseModal open={open} onClose={() => { reset(); onClose(); }} title="New Folder" description="Create a new folder to organize your files" width="max-w-sm">
      <div className="space-y-4">
        <ModalInput label="Folder name *" placeholder="e.g. Project Assets" value={name} onChange={setName} />
      </div>
      <ModalFooter onCancel={() => { reset(); onClose(); }} onConfirm={handleSubmit} confirmLabel={submitting ? "Creating..." : "Create folder"} confirmDisabled={!name.trim() || submitting} />
    </BaseModal>
  );
}
