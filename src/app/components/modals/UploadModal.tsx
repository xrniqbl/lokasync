import { logger } from "../../utils/logger";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useLang } from "../../LangContext";
import { BaseModal, ModalSelect, ModalFooter } from "./BaseModal";
import * as api from "../../utils/api";
import * as storage from "../../utils/storage";

export interface UploadedFileMeta {
  name: string;
  size: string;
  type: string;
  owner: string;
  modified: string;
  shared: boolean;
  archived: boolean;
}

interface UploadModalProps {
  open: boolean;
  workspaceId: string | null;
  onClose: () => void;
  onUpload?: (file: UploadedFileMeta) => void;
}

export function UploadModal({ open, workspaceId, onClose, onUpload }: UploadModalProps) {
  const { t } = useLang();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [folder, setFolder] = useState("Recent");
  const [ownerInitials, setOwnerInitials] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    api.getSettings("profile").then((p) => {
      const initials = `${p?.firstName?.[0] ?? ""}${p?.lastName?.[0] ?? ""}`;
      if (initials) setOwnerInitials(initials.toUpperCase());
    }).catch(() => {});
  }, [open]);

  const reset = () => {
    setFile(null);
    setFolder("Recent");
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const typeFromName = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "doc";
    const typeMap: Record<string, string> = {
      pdf: "pdf", figma: "figma", docx: "doc", xlsx: "sheet", csv: "sheet",
      png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
      json: "code", js: "code", ts: "code", tsx: "code", jsx: "code",
    };
    return typeMap[ext] || "doc";
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error(t("upload.selectFile"));
      return;
    }
    if (!workspaceId) {
      toast.error(t("upload.workspaceNotReady"));
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      // Simulated progress — Supabase Storage client doesn't expose upload
      // progress events, so we tick from 10→90% during the actual upload and
      // jump to 100% on completion. Gives the user visual feedback.
      const progressTimer = setInterval(() => {
        setProgress((p) => Math.min(p + Math.random() * 15, 90));
      }, 300);

      const owner = ownerInitials || "ME";
      const modified = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

      // Upload binary to Supabase Storage first.
      await storage.uploadFile(file, workspaceId);
      clearInterval(progressTimer);
      setProgress(100);

      // Persist metadata via the API so it appears in the file list.
      const meta: api.FileItem = {
        name: file.name,
        type: typeFromName(file.name),
        size: storage.formatFileSize(file.size),
        modified,
        owner,
        shared: false,
        archived: false,
      };
      await api.createFile(meta);

      onUpload?.(meta);
      toast.success(`"${file.name}" uploaded successfully`);
      reset();
      onClose();
    } catch (e) {
      logger.error("app", "Upload failed:", e);
      toast.error(t("upload.failed"));
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
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" className="hidden" onChange={handleFileInput} />
          {file ? (
            <div>
              <div className="text-2xl mb-2">📄</div>
              <div className="text-neutral-200 text-[13px]">{file.name}</div>
              <div className="text-neutral-500 text-[12px] mt-1">{storage.formatFileSize(file.size)} · Click to change</div>
            </div>
          ) : (
            <div>
              <div className="text-2xl mb-2">☁</div>
              <div className="text-neutral-300 text-[13px]">Drop files here or click to browse</div>
              <div className="text-neutral-600 text-[12px] mt-1">Any file type supported</div>
            </div>
          )}
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-neutral-400">{progress < 100 ? "Uploading…" : "Processing…"}</span>
              <span className="text-neutral-500">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

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
        confirmDisabled={!file || uploading || !workspaceId}
      />
    </BaseModal>
  );
}
