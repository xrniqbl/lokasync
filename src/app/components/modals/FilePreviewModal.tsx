import { useState, useEffect } from "react";
import { toast } from "sonner";
import { FileText, Figma, FileCode, FileSpreadsheet, FileImage, GitBranch, Download, Share2, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as api from "../../utils/api";

type FileItem = api.FileItem;

interface FilePreviewModalProps {
  file: FileItem | null;
  onClose: () => void;
  onRename: (oldName: string, newName: string) => void;
}

const typeConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pdf: { label: "PDF Document", color: "#ef4444", bg: "bg-red-950/40", icon: <FileText size={32} /> },
  figma: { label: "Figma File", color: "#a78bfa", bg: "bg-purple-950/40", icon: <Figma size={32} /> },
  doc: { label: "Document", color: "#3b82f6", bg: "bg-blue-950/40", icon: <FileText size={32} /> },
  code: { label: "Code File", color: "#10b981", bg: "bg-emerald-950/40", icon: <FileCode size={32} /> },
  sheet: { label: "Spreadsheet", color: "#10b981", bg: "bg-emerald-950/40", icon: <FileSpreadsheet size={32} /> },
  image: { label: "Image", color: "#f59e0b", bg: "bg-amber-950/40", icon: <FileImage size={32} /> },
  diagram: { label: "Diagram", color: "#6366f1", bg: "bg-indigo-950/40", icon: <GitBranch size={32} /> },
};

export function FilePreviewModal({ file, onClose, onRename }: FilePreviewModalProps) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(file?.name ?? "");
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!file) return;
    api.getTeams().then((teams) => {
      const map: Record<string, string> = {};
      teams.forEach((t) => t.members.forEach((m) => { map[m.initials] = m.name; }));
      setOwnerNames(map);
    }).catch(() => {});
  }, [file?.name]);

  if (!file) return null;

  const type = typeConfig[file.type] || typeConfig.doc;

  const handleRename = () => {
    if (newName.trim() && newName.trim() !== file.name) {
      onRename(file.name, newName.trim());
      toast.success("File renamed");
    }
    setRenaming(false);
    onClose();
  };

  const handleDownload = () => {
    toast.success(`Downloading "${file.name}"`);
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(`https://app.io/files/${encodeURIComponent(file.name)}`).catch(() => {});
    toast.success("Share link copied to clipboard");
  };

  return (
    <Dialog.Root open={!!file} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[#141414] border border-neutral-800 rounded-2xl shadow-2xl font-['Lexend:Regular',_sans-serif] overflow-hidden">
          {/* Preview area */}
          <div className={`flex items-center justify-center h-40 ${type.bg}`} style={{ color: type.color }}>
            {type.icon}
          </div>

          {/* Info */}
          <div className="p-6 space-y-4">
            {/* Title */}
            <div>
              {renaming ? (
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
                  className="w-full bg-[#0f0f0f] border border-indigo-600/60 rounded-lg px-3 py-2 text-neutral-50 text-[14px] outline-none font-['Lexend:Regular',_sans-serif]"
                />
              ) : (
                <div
                  onClick={() => { setNewName(file.name); setRenaming(true); }}
                  className="text-neutral-50 text-[14px] font-['Lexend:SemiBold',_sans-serif] cursor-text hover:text-white truncate"
                  title="Click to rename"
                >
                  {file.name}
                </div>
              )}
              <span className={`inline-block text-[11px] px-2 py-0.5 rounded mt-1.5 ${type.bg}`} style={{ color: type.color }}>
                {type.label}
              </span>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-3 py-4 border-t border-b border-neutral-800/40 text-[12px]">
              <div>
                <div className="text-neutral-600 text-[11px] mb-1">Size</div>
                <div className="text-neutral-300">{file.size}</div>
              </div>
              <div>
                <div className="text-neutral-600 text-[11px] mb-1">Modified</div>
                <div className="text-neutral-300">{file.modified}</div>
              </div>
              <div>
                <div className="text-neutral-600 text-[11px] mb-1">Owner</div>
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-neutral-700 flex items-center justify-center text-[9px] text-neutral-400">{file.owner}</div>
                  <span className="text-neutral-300">{ownerNames[file.owner] ?? file.owner}</span>
                </div>
              </div>
              <div>
                <div className="text-neutral-600 text-[11px] mb-1">Shared</div>
                <div className={file.shared ? "text-emerald-400" : "text-neutral-500"}>{file.shared ? "Shared" : "Private"}</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] rounded-lg transition-colors"
              >
                <Download size={13} /> Download
              </button>
              <button
                onClick={handleShare}
                className="flex-1 flex items-center justify-center gap-2 py-2 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[13px] rounded-lg transition-colors"
              >
                <Share2 size={13} /> Share
              </button>
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center border border-neutral-800 hover:bg-neutral-800 text-neutral-500 rounded-lg transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {renaming && (
              <div className="flex gap-2">
                <button onClick={() => setRenaming(false)} className="flex-1 py-2 border border-neutral-800 text-neutral-400 text-[13px] rounded-lg hover:bg-neutral-800 transition-colors">
                  Cancel
                </button>
                <button onClick={handleRename} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] rounded-lg transition-colors">
                  Save name
                </button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
