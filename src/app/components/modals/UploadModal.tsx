import { useEffect, useRef, useState } from "react";
import { BaseModal, ModalSelect, ModalFooter } from "./BaseModal";
import * as api from "../../utils/api";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUpload?: (file: api.FileItem) => void | Promise<void>;
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// Mirror of the backend upload blacklist: executable/active content that must
// never be stored, even if the server check is bypassed.
export const BLOCKED_UPLOAD_MIME = new Set([
  "text/html",
  "image/svg+xml",
  "application/javascript",
  "application/xhtml+xml",
]);

function validateFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File is too large (${api.humanSize(file.size)}). Maximum upload size is 50 MB.`;
  }
  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  if (mime && BLOCKED_UPLOAD_MIME.has(mime)) {
    return `Files of type "${mime}" are blocked for security (executable content).`;
  }
  return null;
}

export function UploadModal({ open, onClose, onUpload }: UploadModalProps) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [folder, setFolder] = useState("Recent");
  const [ownerInitials, setOwnerInitials] = useState("");
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    api.getSettings("profile").then((p) => {
      const initials = `${p?.firstName?.[0] ?? ""}${p?.lastName?.[0] ?? ""}`;
      if (initials) setOwnerInitials(initials.toUpperCase());
    }).catch(() => {});
  }, [open]);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    const err = validateFile(f);
    setFileError(err ?? "");
    if (!err) setFile(f);
    else setFile(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    pickFile(e.target.files?.[0]);
    e.target.value = "";
  };

  const reset = () => {
    setFile(null);
    setFolder("Recent");
    setUploading(false);
    setFileError("");
    setSubmitError("");
  };

  const handleUpload = async () => {
    if (submittingRef.current) return;
    if (!file) {
      setFileError("Select a file to upload");
      return;
    }
    const err = validateFile(file);
    if (err) {
      setFileError(err);
      return;
    }
    submittingRef.current = true;
    setUploading(true);
    setSubmitError("");
    try {
      const uploaded = await api.uploadFile(file, {
        owner: ownerInitials || undefined,
        shared: false,
      });
      await onUpload?.(uploaded);
      reset();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("413")) {
        setSubmitError("Upload rejected (413): file too large or storage quota exceeded — upgrade your plan to upload more files.");
      } else {
        setSubmitError(`Upload failed: ${msg}`);
      }
    } finally {
      submittingRef.current = false;
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
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragging ? "border-indigo-500 bg-indigo-950/20" : fileError ? "border-red-900/60" : "border-neutral-800 hover:border-neutral-600"}`}
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
              <div className="text-neutral-600 text-[12px] mt-1">Max 50 MB · HTML, SVG, JS and XHTML files are blocked</div>
            </div>
          )}
        </div>
        {fileError && <p className="text-red-400 text-[11px]">{fileError}</p>}

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
        {submitError && (
          <p role="alert" className="text-red-400 text-[12px] bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{submitError}</p>
        )}
      </div>
      <ModalFooter
        onCancel={() => { reset(); onClose(); }}
        onConfirm={handleUpload}
        confirmLabel={uploading ? "Uploading..." : "Upload"}
        confirmDisabled={!file || uploading || !!fileError}
      />
    </BaseModal>
  );
}
