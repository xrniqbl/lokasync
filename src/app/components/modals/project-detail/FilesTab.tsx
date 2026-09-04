import { useState, useRef } from "react";
import { Upload, Grid, List, FileText, Image, FileArchive, File, Download, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "../../../LangContext";
import type { LocalFileItem } from "./types";

const typeIcons: Record<string, typeof File> = {
  pdf: FileText, docx: FileText, xlsx: FileText, xls: FileText, doc: FileText,
  png: Image, jpg: Image, jpeg: Image, gif: Image, webp: Image, svg: Image,
  zip: FileArchive, rar: FileArchive, "7z": FileArchive,
  figma: File, sketch: File,
};

function getIcon(type: string) {
  return typeIcons[type.toLowerCase()] ?? File;
}

interface FilesTabProps {
  files: LocalFileItem[];
  onAdd: (file: LocalFileItem) => void;
  onDelete: (name: string) => void;
}

export function FilesTab({ files, onAdd, onDelete }: FilesTabProps) {
  const { t } = useLang();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [previewFile, setPreviewFile] = useState<LocalFileItem | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = (fileList: FileList | File[]) => {
    for (const f of Array.from(fileList)) {
      const ext = f.name.split(".").pop() ?? "";
      const sizeKb = f.size / 1024;
      const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${Math.round(sizeKb)} KB`;

      // Validate file type
      const allowed = ["pdf", "docx", "xlsx", "xls", "doc", "png", "jpg", "jpeg", "gif", "webp", "svg", "zip", "rar", "7z", "figma", "sketch"];
      if (!allowed.includes(ext.toLowerCase())) {
        toast.error(`File type .${ext} is not supported`);
        continue;
      }

      // 50MB limit
      if (f.size > 50 * 1024 * 1024) {
        toast.error(`${f.name} exceeds 50MB limit`);
        continue;
      }

      // Check duplicate
      if (files.some((existing) => existing.name === f.name)) {
        toast.error(`File "${f.name}" already exists`);
        continue;
      }

      onAdd({
        name: f.name,
        type: ext,
        size: sizeStr,
        modified: new Date().toISOString(),
        owner: "You",
        url: URL.createObjectURL(f),
      });
    }
    if (fileList.length > 0) toast.success(`${fileList.length} file(s) uploaded`);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    processFiles(fileList);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleDownload = (f: LocalFileItem) => {
    if (f.url) {
      const a = document.createElement("a");
      a.href = f.url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`Downloading ${f.name}`);
    } else {
      toast.error(t("projectDetail.fileNotAvailable"));
    }
  };

  const handleDeleteConfirm = (name: string) => {
    onDelete(name);
    toast.success(`"${name}" removed`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-neutral-500 text-[11px]">{files.length} file{files.length !== 1 ? "s" : ""}</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-neutral-800/40 rounded-lg p-0.5">
            <button
              onClick={() => setView("grid")}
              className={`p-1.5 rounded-md transition-colors ${view === "grid" ? "bg-neutral-700 text-neutral-200" : "text-neutral-500 hover:text-neutral-300"}`}
            >
              <Grid size={13} strokeWidth={1.8} />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-neutral-700 text-neutral-200" : "text-neutral-500 hover:text-neutral-300"}`}
            >
              <List size={13} strokeWidth={1.8} />
            </button>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] transition-colors"
          >
            <Upload size={12} strokeWidth={2} /> Upload
          </button>
          <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.xlsx,.xls,.doc,.png,.jpg,.jpeg,.gif,.webp,.svg,.zip,.rar,.figma,.sketch" onChange={handleUpload} className="hidden" />
        </div>
      </div>

      {/* Empty state / Drop zone */}
      {files.length === 0 && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragging ? "border-indigo-500 bg-indigo-950/20" : "border-neutral-800 hover:border-neutral-700"
          }`}
        >
          <Upload size={24} className={`mx-auto mb-2 ${isDragging ? "text-indigo-400" : "text-neutral-600"}`} />
          <p className="text-neutral-500 text-[12px]">{isDragging ? "Drop files here" : "Click to upload or drag files here"}</p>
          <p className="text-neutral-700 text-[10px] mt-1">PDF, DOCX, XLSX, PNG, JPG, ZIP, Figma • Max 50MB</p>
        </div>
      )}

      {/* Grid view */}
      {view === "grid" && files.length > 0 && (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 gap-2"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {files.map((f) => {
            const Icon = getIcon(f.type);
            return (
              <div key={f.name} className="p-3 bg-neutral-800/20 rounded-lg hover:bg-neutral-800/40 transition-colors group relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center">
                    <Icon size={16} className="text-neutral-400" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-neutral-300 text-[11px] truncate">{f.name}</p>
                    <p className="text-neutral-600 text-[9px]">{f.size}</p>
                  </div>
                </div>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {f.url && (
                    <button onClick={() => setPreviewFile(f)} className="p-1 rounded bg-neutral-700/80 text-neutral-300 hover:bg-neutral-600 transition-colors" title="Preview">
                      <Eye size={11} strokeWidth={2} />
                    </button>
                  )}
                  <button onClick={() => handleDownload(f)} className="p-1 rounded bg-neutral-700/80 text-neutral-300 hover:bg-neutral-600 transition-colors" title="Download">
                    <Download size={11} strokeWidth={2} />
                  </button>
                  <button onClick={() => handleDeleteConfirm(f.name)} className="p-1 rounded bg-neutral-700/80 text-neutral-300 hover:text-red-400 hover:bg-neutral-600 transition-colors" title="Delete">
                    <Trash2 size={11} strokeWidth={2} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List view */}
      {view === "list" && files.length > 0 && (
        <div className="space-y-0.5">
          <div className="grid grid-cols-[1fr_60px_70px_80px] gap-2 px-3 py-1.5 text-neutral-600 text-[10px] uppercase tracking-wider">
            <span>Name</span><span>Size</span><span>Owner</span><span />
          </div>
          {files.map((f) => {
            const Icon = getIcon(f.type);
            return (
              <div key={f.name} className="grid grid-cols-[1fr_60px_70px_80px] gap-2 items-center px-3 py-2 rounded-lg hover:bg-neutral-800/30 transition-colors group">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon size={14} className="text-neutral-500 shrink-0" strokeWidth={1.5} />
                  <span className="text-neutral-300 text-[12px] truncate">{f.name}</span>
                </div>
                <span className="text-neutral-500 text-[11px]">{f.size}</span>
                <span className="text-neutral-500 text-[11px]">{f.owner}</span>
                <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  {f.url && (
                    <button onClick={() => setPreviewFile(f)} className="p-1 rounded text-neutral-500 hover:text-neutral-200 transition-colors" title="Preview">
                      <Eye size={12} strokeWidth={1.8} />
                    </button>
                  )}
                  <button onClick={() => handleDownload(f)} className="p-1 rounded text-neutral-500 hover:text-neutral-200 transition-colors" title="Download">
                    <Download size={12} strokeWidth={1.8} />
                  </button>
                  <button onClick={() => handleDeleteConfirm(f.name)} className="p-1 rounded text-neutral-500 hover:text-red-400 transition-colors" title="Delete">
                    <Trash2 size={12} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={() => setPreviewFile(null)}>
          <div className="bg-[#141414] border border-neutral-800 rounded-xl p-4 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-neutral-200 text-[13px] font-['Lexend:SemiBold',_sans-serif]">{previewFile.name}</span>
              <div className="flex gap-2">
                <button onClick={() => handleDownload(previewFile)} className="text-neutral-400 hover:text-neutral-200 transition-colors text-[12px] flex items-center gap-1">
                  <Download size={12} /> Download
                </button>
                <button onClick={() => setPreviewFile(null)} className="text-neutral-500 hover:text-neutral-200 transition-colors text-[12px]">Close</button>
              </div>
            </div>
            {previewFile.url && previewFile.type.match(/^(png|jpg|jpeg|gif|webp|svg)$/i) ? (
              <img src={previewFile.url} alt={previewFile.name} className="max-h-[60vh] rounded-lg mx-auto" />
            ) : (
              <div className="text-center py-12 text-neutral-500 text-[12px]">Preview not available for .{previewFile.type} files</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
