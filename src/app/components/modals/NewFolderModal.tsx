import { useState } from "react";
import { toast } from "sonner";
import { BaseModal, ModalInput, ModalFooter } from "./BaseModal";

interface NewFolderModalProps {
  open: boolean;
  onClose: () => void;
  onAdd?: (folder: { name: string; files: number; modified: string }) => void;
}

export function NewFolderModal({ open, onClose, onAdd }: NewFolderModalProps) {
  const [name, setName] = useState("");

  const reset = () => setName("");

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Folder name is required");
      return;
    }
    onAdd?.({ name: name.trim(), files: 0, modified: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) });
    toast.success(`Folder "${name.trim()}" created`);
    reset();
    onClose();
  };

  return (
    <BaseModal open={open} onClose={() => { reset(); onClose(); }} title="New Folder" description="Create a new folder to organize your files" width="max-w-sm">
      <div className="space-y-4">
        <ModalInput label="Folder name *" placeholder="e.g. Project Assets" value={name} onChange={setName} />
      </div>
      <ModalFooter onCancel={() => { reset(); onClose(); }} onConfirm={handleSubmit} confirmLabel="Create folder" confirmDisabled={!name.trim()} />
    </BaseModal>
  );
}
