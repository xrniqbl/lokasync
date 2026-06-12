import { useState, useEffect } from "react";
import { toast } from "sonner";
import { BaseModal, ModalSelect, ModalFooter } from "./BaseModal";
import * as api from "../../utils/api";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUpload?: (file: { name: string; size: string; type: string; owner: string; modified: string; shared: boolean }) => void;
}

export function UploadModal({ open, onClose, onUpload }: UploadModalProps) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
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
    const file = e.dataTransfer.files[0];
    if (file) setFileName(file.name);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFileName(file.name);
  };

  const reset = () => {
    setFileName("");
    setFolder("Recent");
  };

  const handleUpload = () => {
    if (!fileName) {
      toast.error("Select a file to upload");
      return;
    }
    const ext = fileName.split(".").pop()?.toLowerCase() || "doc";
    const typeMap: Record<string, string> = {
      pdf: "pdf", figma: "figma", docx: "doc", xlsx: "sheet",
      png: "image", jpg: "image", json: "code", js: "code", ts: "code",
    };
    onUpload?.({
      name: fileName,
      size: "—",
      type: typeMap[ext] || "doc",
      owner: ownerInitials || "—",
      modified: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      shared: false,
    });
    toast.success(`"${fileName}" uploaded successfully`);
    reset();
    onClose();
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
          {fileName ? (
            <div>
              <div className="text-2xl mb-2">📄</div>
              <div className="text-neutral-200 text-[13px]">{fileName}</div>
              <div className="text-neutral-500 text-[12px] mt-1">Click to change</div>
            </div>
          ) : (
            <div>
              <div className="text-2xl mb-2">☁</div>
              <div className="text-neutral-300 text-[13px]">Drop files here or click to browse</div>
              <div className="text-neutral-600 text-[12px] mt-1">Any file type supported</div>
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
      <ModalFooter onCancel={() => { reset(); onClose(); }} onConfirm={handleUpload} confirmLabel="Upload" confirmDisabled={!fileName} />
    </BaseModal>
  );
}
