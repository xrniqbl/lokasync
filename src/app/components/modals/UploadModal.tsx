import { useState, useEffect } from "react";
import { toast } from "sonner";
import { BaseModal, ModalSelect, ModalFooter } from "./BaseModal";
import * as api from "../../utils/api";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUpload?: (file: api.FileItem) => void;
}

export function UploadModal({ open, onClose, onUpload }: UploadModalProps) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [folder, setFolder] = useState("Recent");
  const [ownerInitials, setOwnerInitials] = useState("");

  useEffect(() => {
    if (!open) return;
    api.getSettings("profile").then((p) => {
      const initials = `${p?.firstName?.[0] ?? ""}${p?.lastName?.[0] ?? ""}`;
      if (initials) setOwnerInitials(initials.toUpperCase());
    }).catch(() => {});
  }, [open]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const reset = () => {
    setFile(null);
    setFolder("Recent");
    setUploading(false);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Select a file to upload");
      return;
    }
    setUploading(true);
    try {
      const uploaded = await api.uploadFile(file, {
        owner: ownerInitials || undefined,
        shared: false,
      });
      onUpload?.(uploaded);
      toast.success(`"${file.name}" uploaded (${uploaded.sizeHuman})`);
      reset();
      onClose();
    } catch (e: any) {
      if (e.message?.includes("413")) {
        toast.error("Storage quota exceeded — upgrade your plan to upload more files");
      } else {
        toast.error(`Upload failed: ${e.message}`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <BaseModal open={open} onClose={() => { reset(); onClose(); }} title="Upload File" description="Add files to your workspace">
      <div className="space-y-4">
        {/* Dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragging ? "border-indigo-500 bg-indigo-950/20" : "border-neutral-800 hover:border-neutral-600"}`}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <input id="file-input" type="file" className="hidden" onChange={handleFileInput} />
          {file ? (
            <div>
              <div className="text-2xl mb-2">📄</div>
              <div className="text-neutral-200 text-[13px]">{file.name}</div>
              <div className="text-neutral-500 text-[12px] mt-1">{api.humanSize(file.size)}</div>
            </div>
          ) : (
            <div>
              <div className="text-2xl mb-2">☁</div>
              <div className="text-neutral-300 text-[13px]">Drop files here or click to browse</div>
              <div className="text-neutral-600 text-[12px] mt-1">Max size depends on your plan</div>
            </div>
          )}
        </div>

        <ModalSelect
          label="Upload to"
          value={folder}
          onChange={setFolder}
          options={[
            { value: "Recent", label: "Recent Files" },
            { value: "Design Assets", label: "Design Assets" },
            { value: "Engineering Docs", label: "Engineering Docs" },
            { value: "Client Deliverables", label: "Client Deliverables" },
          ]}
        />
      </div>
      <ModalFooter
        onCancel={() => { reset(); onClose(); }}
        onConfirm={handleUpload}
        confirmLabel={uploading ? "Uploading..." : "Upload"}
        confirmDisabled={!file || uploading}
      />
    </BaseModal>
  );
}
