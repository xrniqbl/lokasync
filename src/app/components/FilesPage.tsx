import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FileText, Figma, FileCode, FileSpreadsheet, FileImage, GitBranch, Folder as FolderIcon, MoreHorizontal } from "lucide-react";
import { UploadModal } from "./modals/UploadModal";
import { NewFolderModal } from "./modals/NewFolderModal";
import { FilePreviewModal } from "./modals/FilePreviewModal";
import { useNavigation } from "./NavigationContext";
import * as api from "../utils/api";

type FileItem = api.FileItem;
type FolderItem = api.Folder;

const typeConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pdf: { label: "PDF", color: "#ef4444", bg: "bg-red-950/40", icon: <FileText size={16} /> },
  figma: { label: "Figma", color: "#a78bfa", bg: "bg-purple-950/40", icon: <Figma size={16} /> },
  doc: { label: "Doc", color: "#3b82f6", bg: "bg-blue-950/40", icon: <FileText size={16} /> },
  code: { label: "Code", color: "#10b981", bg: "bg-emerald-950/40", icon: <FileCode size={16} /> },
  sheet: { label: "Sheet", color: "#10b981", bg: "bg-emerald-950/40", icon: <FileSpreadsheet size={16} /> },
  image: { label: "Image", color: "#f59e0b", bg: "bg-amber-950/40", icon: <FileImage size={16} /> },
  diagram: { label: "Diagram", color: "#6366f1", bg: "bg-indigo-950/40", icon: <GitBranch size={16} /> },
};

function FileMenu({ fileName, onDelete, onRename, onPreview, onDownload }: {
  fileName: string;
  onDelete: () => void;
  onRename: () => void;
  onPreview: () => void;
  onDownload: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-300 transition-opacity w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-800"
        >
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="bg-[#1a1a1a] border border-neutral-800 rounded-xl shadow-xl p-1 z-50 min-w-[140px] font-['Lexend:Regular',_sans-serif]"
          sideOffset={4}
          align="end"
        >
          {[
            { label: "Preview", action: (e: React.MouseEvent) => { e.stopPropagation(); onPreview(); } },
            { label: "Download", action: (e: React.MouseEvent) => { e.stopPropagation(); onDownload(); } },
            { label: "Rename", action: (e: React.MouseEvent) => { e.stopPropagation(); onRename(); } },
            { label: "Share", action: (e: React.MouseEvent) => { e.stopPropagation(); toast.success("Share link copied to clipboard"); } },
          ].map((item) => (
            <DropdownMenu.Item
              key={item.label}
              onClick={item.action}
              className="flex items-center px-3 py-2 text-[13px] text-neutral-300 hover:text-neutral-50 hover:bg-neutral-800 rounded-lg cursor-pointer outline-none transition-colors"
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="h-px bg-neutral-800/60 my-1" />
          <DropdownMenu.Item
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="flex items-center px-3 py-2 text-[13px] text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded-lg cursor-pointer outline-none transition-colors"
          >
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const tabs = ["Recent", "Shared", "Folders", "Archived"];

// Slug used by sidebar file links (must match SidebarDemo's slugify)
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function FilesPage() {
  const { subSection } = useNavigation();
  const [view, setView] = useState<"list" | "grid">("list");
  const [tab, setTab] = useState("Recent");
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getFiles().then(({ files: f, folders: fo }) => {
      setFiles(f);
      setFolders(fo);
    }).catch((e) => {
      console.log("Failed to load files:", e);
      toast.error("Failed to load files");
    });
  }, []);

  useEffect(() => {
    if (subSection === "upload") { setShowUpload(true); }
    else if (subSection === "new-folder") { setShowNewFolder(true); }
    else if (subSection === "shared") { setTab("Shared"); setCurrentFolder(null); }
    else if (subSection === "folders") { setTab("Folders"); setCurrentFolder(null); }
    else if (subSection === "recent") { setTab("Recent"); setCurrentFolder(null); }
    else if (subSection === "archived") { setTab("Archived"); setCurrentFolder(null); }
    else if (subSection.startsWith("file-")) {
      const slug = subSection.slice("file-".length);
      setTab("Recent"); setCurrentFolder(null);
      setFiles((prev) => { const f = prev.find((x) => slugify(x.name) === slug); if (f) setPreviewFile(f); return prev; });
    }
  }, [subSection]);

  const nonArchivedFiles = files.filter((f) => !f.archived);
  const archivedFiles = files.filter((f) => f.archived);
  const displayFiles = currentFolder ? nonArchivedFiles.filter((f) => f.name.includes(currentFolder.slice(0, 4))) : nonArchivedFiles;
  const filtered = tab === "Shared"
    ? nonArchivedFiles.filter((f) => f.shared)
    : tab === "Archived"
    ? archivedFiles
    : tab === "Folders"
    ? nonArchivedFiles
    : displayFiles;

  const deleteFile = async (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    toast.success(`"${name.slice(0, 30)}..." deleted`);
    try { await api.deleteFile(name); }
    catch (e) { console.log("Failed to delete file:", e); }
  };

  const startRename = (name: string) => {
    setRenamingFile(name);
    setRenameValue(name);
    setTimeout(() => renameRef.current?.focus(), 50);
  };

  const commitRename = async (oldName: string) => {
    const newName = renameValue.trim();
    if (newName && newName !== oldName) {
      setFiles((prev) => prev.map((f) => f.name === oldName ? { ...f, name: newName } : f));
      toast.success("File renamed");
      try { await api.renameFile(oldName, newName); }
      catch (e) { console.log("Failed to rename file:", e); }
    }
    setRenamingFile(null);
    setRenameValue("");
  };

  const handleFileRenameFromPreview = async (oldName: string, newName: string) => {
    setFiles((prev) => prev.map((f) => f.name === oldName ? { ...f, name: newName } : f));
    try { await api.renameFile(oldName, newName); }
    catch (e) { console.log("Failed to rename file:", e); }
  };

  const handleDownload = async (fileName: string) => {
    try {
      const { url } = await api.getDownloadUrl(fileName);
      window.open(url, "_blank");
    } catch (e) {
      toast.error("Failed to generate download link");
    }
  };

  const openFolder = (name: string) => {
    setCurrentFolder(name);
    setTab("Recent");
  };

  return (
    <div className="flex flex-col h-full font-['Lexend:Regular',_sans-serif]">
      {/* Header */}
      <div className="px-4 md:px-6 lg:px-8 pt-6 lg:pt-8 pb-0">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif] text-[18px] lg:text-[22px] leading-tight mb-1">Files</h1>
            <p className="text-neutral-500 text-[12px] lg:text-[13px]">{files.length} files · {folders.length} folders</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-neutral-800/60 rounded-lg p-0.5">
              {(["list", "grid"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1.5 rounded-md text-[12px] transition-colors capitalize ${view === v ? "bg-neutral-700 text-neutral-200" : "text-neutral-500 hover:text-neutral-300"}`}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={() => setShowNewFolder(true)} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 text-[12px] lg:text-[13px] px-3 py-2 rounded-lg transition-colors whitespace-nowrap">+ Folder</button>
            <button onClick={() => setShowUpload(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] lg:text-[13px] px-4 py-2 rounded-lg transition-colors">Upload</button>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 mb-4 text-[12px]">
          <button
            onClick={() => setCurrentFolder(null)}
            className={`transition-colors ${currentFolder ? "text-neutral-500 hover:text-neutral-300" : "text-neutral-300"}`}
          >
            All Files
          </button>
          {currentFolder && (
            <>
              <span className="text-neutral-700">›</span>
              <span className="text-neutral-300">{currentFolder}</span>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-neutral-800/60 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 lg:px-4 py-2.5 text-[12px] lg:text-[13px] border-b-2 transition-colors -mb-px whitespace-nowrap ${tab === t ? "border-indigo-500 text-neutral-50" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-4">
        {tab === "Archived" && (
          <div className="mb-4 flex items-center gap-2 bg-neutral-800/40 border border-neutral-800/60 rounded-lg px-4 py-2.5 text-[12px] text-neutral-500">
            <span className="text-neutral-600">These files are archived and read-only.</span>
            <button className="ml-auto text-indigo-400 hover:text-indigo-300 transition-colors" onClick={() => toast.success("Files restored to All Files")}>Restore all</button>
          </div>
        )}
        {tab === "Folders" && !currentFolder ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {folders.map((folder) => (
              <div key={folder.name} onClick={() => openFolder(folder.name)}
                className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 hover:border-neutral-700/60 transition-colors cursor-pointer">
                <div className="text-neutral-400 mb-3"><FolderIcon size={24} /></div>
                <div className="text-neutral-200 text-[12px] lg:text-[13px] mb-1 truncate">{folder.name}</div>
                <div className="text-neutral-600 text-[11px]">{folder.files} files</div>
                <div className="text-neutral-700 text-[11px] mt-0.5">{folder.modified}</div>
              </div>
            ))}
          </div>
        ) : view === "list" ? (
          <>
            <div className="hidden md:grid md:grid-cols-[1fr_80px_80px_60px_32px] gap-4 px-3 py-2 mb-1">
              <div className="text-neutral-600 text-[11px] uppercase tracking-wider">Name</div>
              <div className="text-neutral-600 text-[11px] uppercase tracking-wider">Size</div>
              <div className="text-neutral-600 text-[11px] uppercase tracking-wider">Modified</div>
              <div className="text-neutral-600 text-[11px] uppercase tracking-wider">Owner</div>
              <div />
            </div>
            <div className="space-y-0.5">
              {filtered.map((file) => {
                const type = typeConfig[file.type] || typeConfig.doc;
                const isRenaming = renamingFile === file.name;
                return (
                  <div key={file.name} onClick={() => !isRenaming && setPreviewFile(file)} className="flex md:grid md:grid-cols-[1fr_80px_80px_60px_32px] gap-2 md:gap-4 items-center px-3 py-2.5 rounded-lg hover:bg-neutral-800/20 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3 min-w-0 flex-1 md:flex-none">
                      <span className="shrink-0" style={{ color: type.color }}>{type.icon}</span>
                      <div className="min-w-0 flex-1">
                        {isRenaming ? (
                          <input
                            ref={renameRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={() => commitRename(file.name)}
                            onKeyDown={(e) => { if (e.key === "Enter") commitRename(file.name); if (e.key === "Escape") setRenamingFile(null); }}
                            className="w-full bg-[#0f0f0f] border border-indigo-600/60 rounded px-2 py-0.5 text-neutral-200 text-[12px] lg:text-[13px] outline-none"
                          />
                        ) : (
                          <div className="text-neutral-200 text-[12px] lg:text-[13px] truncate">{file.name}</div>
                        )}
                        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded mt-0.5 ${type.bg}`} style={{ color: type.color }}>{type.label}</span>
                      </div>
                    </div>
                    <div className="text-neutral-500 text-[12px] hidden md:block">{file.sizeHuman}</div>
                    <div className="text-neutral-500 text-[12px] hidden md:block">{file.modified}</div>
                    <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-400 hidden md:flex">{file.owner}</div>
                    <FileMenu fileName={file.name} onDelete={() => deleteFile(file.name)} onRename={() => startRename(file.name)} onPreview={() => setPreviewFile(file)} onDownload={() => handleDownload(file.name)} />
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((file) => {
              const type = typeConfig[file.type] || typeConfig.doc;
              return (
                <div key={file.name} onClick={() => setPreviewFile(file)} className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 hover:border-neutral-700/60 transition-colors cursor-pointer group relative">
                  <div className="mb-3" style={{ color: type.color }}>{type.icon}</div>
                  <div className="text-neutral-200 text-[12px] truncate mb-1">{file.name}</div>
                  <div className="text-neutral-600 text-[11px]">{file.sizeHuman} · {file.modified}</div>
                  <div className="absolute top-3 right-3">
                    <FileMenu fileName={file.name} onDelete={() => deleteFile(file.name)} onRename={() => startRename(file.name)} onPreview={() => setPreviewFile(file)} onDownload={() => handleDownload(file.name)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-neutral-600 text-[13px]">No files here</div>
        )}
      </div>

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onUpload={(uploaded) => setFiles((prev) => [uploaded, ...prev])} />
      <NewFolderModal open={showNewFolder} onClose={() => setShowNewFolder(false)} onAdd={async (f) => {
        setFolders((prev) => [f, ...prev]);
        try { await api.createFolder(f); } catch (e) { console.log("Failed to save folder:", e); }
      }} />
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} onRename={handleFileRenameFromPreview} />
    </div>
  );
}
