import { logger } from "../utils/logger";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FileText, Figma, FileCode, FileSpreadsheet, FileImage, GitBranch, Folder as FolderIcon, MoreHorizontal } from "lucide-react";
import { UploadModal } from "./modals/UploadModal";
import { NewFolderModal } from "./modals/NewFolderModal";
import { FilePreviewModal } from "./modals/FilePreviewModal";
import { useNavigation } from "./NavigationContext";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { useAuth } from "../auth/AuthContext";
import * as api from "../utils/api";
import * as storage from "../utils/storage";
import { useLang } from "../LangContext";

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

function FileMenu({ fileName, onDelete, onRename, onPreview, onDownload, onShare }: {
  fileName: string;
  onDelete: () => void;
  onRename: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onShare: () => void;
}) {
  const { t } = useLang();
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
            { label: t("filesPage.preview"), action: (e: React.MouseEvent) => { e.stopPropagation(); onPreview(); } },
            { label: t("filesPage.download"), action: (e: React.MouseEvent) => { e.stopPropagation(); onDownload(); } },
            { label: t("filesPage.rename"), action: (e: React.MouseEvent) => { e.stopPropagation(); onRename(); } },
            { label: t("filesPage.share"), action: (e: React.MouseEvent) => { e.stopPropagation(); onShare(); } },
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
            {t("filesPage.delete")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function FolderMenu({ onDelete, onRename }: { onDelete: () => void; onRename: () => void }) {
  const { t } = useLang();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-300 transition-opacity w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-800"
        >
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="bg-[#1a1a1a] border border-neutral-800 rounded-xl shadow-xl p-1 z-50 min-w-[120px] font-['Lexend:Regular',_sans-serif]"
          sideOffset={4}
          align="end"
        >
          <DropdownMenu.Item
            onClick={(e) => { e.stopPropagation(); onRename(); }}
            className="text-neutral-300 text-[12px] px-3 py-2 rounded-lg hover:bg-neutral-800 cursor-pointer outline-none"
          >
            {t("filesPage.rename")}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="h-px bg-neutral-800 my-1" />
          <DropdownMenu.Item
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-red-400 text-[12px] px-3 py-2 rounded-lg hover:bg-red-950/40 cursor-pointer outline-none"
          >
            {t("filesPage.delete")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const tabs = ["Recent", "My Files", "Shared", "Folders", "Archived"];

// Slug used by sidebar file links (must match SidebarDemo's slugify)
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function FilesPage() {
  const { t } = useLang();
  const { user } = useAuth();
  const { subSection } = useNavigation();
  const [view, setView] = useState<"list" | "grid">("list");
  const [tab, setTab] = useState("Recent");
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [membersMap, setMembersMap] = useState<Map<string, string>>(new Map());

  // Fetch workspace members for resolving owner user_ids to names
  useEffect(() => {
    api.getWorkspaceMembers().then(({ members }) => {
      const map = new Map<string, string>();
      for (const m of members) if (m.user_id) map.set(m.user_id, m.name || m.email);
      setMembersMap(map);
    }).catch(() => {});
  }, []);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback((opts?: { silent?: boolean }) => {
    api.getWorkspace().then(({ workspace }) => {
      if (workspace?.id) setWorkspaceId(workspace.id);
    }).catch(() => {});
    api.getFiles().then(({ files: f, folders: fo }) => {
      setFiles(f.map((f) => ({ ...f })));
      setFolders(fo);
    }).catch((e) => {
      logger.error("app", "Failed to load files:", e);
      if (!opts?.silent) toast.error(t("filesPage.failedToLoadFiles"));
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useRealtimeSync(["files", "folders"], () => loadData({ silent: true }));

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
  // Files and folders have no relational link in the DB, so when viewing a
  // folder we show all non-archived files. A future folder_id column will
  // enable proper per-folder filtering.
  const displayFiles = currentFolder ? nonArchivedFiles : nonArchivedFiles;

  const restoreAll = async () => {
    setRestoring(true);
    try {
      await Promise.all(archivedFiles.map((f) => api.updateFile(f.name, { archived: false })));
      setFiles((prev) => prev.map((f) => f.archived ? { ...f, archived: false } : f));
      toast.success(t("filesPage.filesRestored"));
    } catch (e) {
      logger.error("app", "Failed to restore files:", e);
      toast.error(t("filesPage.failedToDeleteFile"));
    } finally {
      setRestoring(false);
    }
  };
  const filtered = tab === "Shared"
    ? nonArchivedFiles.filter((f) => f.shared)
    : tab === "My Files"
    ? nonArchivedFiles.filter((f) => f.owner === user?.id || f.created_by === user?.id)
    : tab === "Archived"
    ? archivedFiles
    : tab === "Folders"
    ? nonArchivedFiles
    : displayFiles;

  const deleteFile = async (name: string) => {
    const prev = files;
    setFiles((f) => f.filter((x) => x.name !== name));
    try {
      await api.deleteFile(name);
      if (workspaceId) {
        await storage.deleteStoredFile(name, workspaceId).catch(() => {});
      }
      toast.success(t("filesPage.fileDeleted").replace("{name}", name.slice(0, 30)));
    } catch (e) {
      setFiles(prev);
      logger.error("app", "Failed to delete file:", e);
      toast.error(t("filesPage.failedToDeleteFile"));
    }
  };

  const startRename = (name: string) => {
    setRenamingFile(name);
    setRenameValue(name);
    setTimeout(() => renameRef.current?.focus(), 50);
  };

  const commitRename = async (oldName: string) => {
    const newName = renameValue.trim();
    if (newName && newName !== oldName) {
      const prev = files;
      setFiles((f) => f.map((x) => x.name === oldName ? { ...x, name: newName } : x));
      try {
        await api.renameFile(oldName, newName);
        toast.success(t("filesPage.fileRenamed"));
      } catch (e) {
        setFiles(prev);
        logger.error("app", "Failed to rename file:", e);
        toast.error(t("filesPage.failedToRenameFile"));
      }
    }
    setRenamingFile(null);
    setRenameValue("");
  };

  const deleteFolderAction = async (name: string) => {
    const prev = folders;
    setFolders((f) => f.filter((x) => x.name !== name));
    try {
      await api.deleteFolder(name);
      toast.success(t("filesPage.folderDeleted"));
    } catch (e) {
      setFolders(prev);
      logger.error("app", "Failed to delete folder:", e);
      toast.error(t("filesPage.failedToDeleteFolder"));
    }
  };

  const commitFolderRename = async (oldName: string) => {
    const newName = folderRenameValue.trim();
    if (newName && newName !== oldName) {
      const prev = folders;
      setFolders((f) => f.map((x) => x.name === oldName ? { ...x, name: newName } : x));
      try {
        await api.renameFolder(oldName, newName);
        toast.success(t("filesPage.folderRenamed"));
      } catch (e) {
        setFolders(prev);
        logger.error("app", "Failed to rename folder:", e);
        toast.error(t("filesPage.failedToRenameFolder"));
      }
    }
    setRenamingFolder(null);
    setFolderRenameValue("");
  };

  const handleFileRenameFromPreview = async (oldName: string, newName: string) => {
    const prev = files;
    setFiles((f) => f.map((x) => x.name === oldName ? { ...x, name: newName } : x));
    try {
      await api.renameFile(oldName, newName);
    } catch (e) {
      setFiles(prev);
      logger.error("app", "Failed to rename file:", e);
      toast.error(t("filesPage.failedToRenameFile"));
    }
  };

  const handleDownload = async (fileName: string) => {
    try {
      const file = files.find((f) => f.name === fileName);
      if (!file) throw new Error("File not found");
      if (!workspaceId) throw new Error("Workspace not ready");
      const blob = await storage.downloadFile(fileName, workspaceId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("filesPage.downloadStarted"));
    } catch (e) {
      logger.error("app", "Download failed:", e);
      toast.error(t("filesPage.failedToGenerateDownload"));
    }
  };

  const shareFile = async (fileName: string) => {
    try {
      if (!workspaceId) throw new Error("Workspace not ready");
      const url = await storage.getDownloadUrl(fileName, workspaceId, 86400); // 24h
      await navigator.clipboard?.writeText(url);
      toast.success(t("filesPage.shareLinkCopied24h"));
    } catch (e) {
      logger.error("app", "Share failed:", e);
      toast.error(t("filesPage.failedToGenerateShareLink"));
    }
  };

  const openFolder = (name: string) => {
    setCurrentFolder(name);
    setTab("Recent");
  };

  const tabLabels: Record<string, string> = {
    Recent: t("filesPage.recentDocuments"),
    Shared: t("filesPage.sharedWithMe"),
    Folders: t("filesPage.allFolders"),
    Archived: t("filesPage.archivedFiles"),
  };

  return (
    <div className="flex flex-col h-full font-['Lexend:Regular',_sans-serif]">
      {/* Header */}
      <div className="px-4 md:px-6 lg:px-8 pt-6 lg:pt-8 pb-0">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif] text-[18px] lg:text-[22px] leading-tight mb-1">{t("filesPage.filesTitle")}</h1>
            <p className="text-neutral-500 text-[12px] lg:text-[13px]">{t("filesPage.filesCountFolders").replace("{fileCount}", String(files.length)).replace("{folderCount}", String(folders.length))}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-neutral-800/60 rounded-lg p-0.5">
              {(["list", "grid"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1.5 rounded-md text-[12px] transition-colors capitalize ${view === v ? "bg-neutral-700 text-neutral-200" : "text-neutral-500 hover:text-neutral-300"}`}>
                  {t(`filesPage.${v}` as any)}
                </button>
              ))}
            </div>
            <button onClick={() => setShowNewFolder(true)} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 text-[12px] lg:text-[13px] px-3 py-2 rounded-lg transition-colors whitespace-nowrap">+ {t("filesPage.newFolder")}</button>
            <button onClick={() => setShowUpload(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] lg:text-[13px] px-4 py-2 rounded-lg transition-colors">{t("filesPage.upload")}</button>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 mb-4 text-[12px]">
          <button
            onClick={() => setCurrentFolder(null)}
            className={`transition-colors ${currentFolder ? "text-neutral-500 hover:text-neutral-300" : "text-neutral-300"}`}
          >
            {t("filesPage.allFiles")}
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
          {tabs.map((tabKey) => (
            <button key={tabKey} onClick={() => setTab(tabKey)}
              className={`px-3 lg:px-4 py-2.5 text-[12px] lg:text-[13px] border-b-2 transition-colors -mb-px whitespace-nowrap ${tab === tabKey ? "border-indigo-500 text-neutral-50" : "border-transparent text-neutral-500 hover:text-neutral-300"}`}>
              {tabLabels[tabKey] ?? tabKey}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-4">
        {tab === "Archived" && (
          <div className="mb-4 flex items-center gap-2 bg-neutral-800/40 border border-neutral-800/60 rounded-lg px-4 py-2.5 text-[12px] text-neutral-500">
            <span className="text-neutral-600">{t("filesPage.archivedReadOnly")}</span>
            <button disabled={restoring} className="ml-auto text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50" onClick={restoreAll}>{restoring ? "Restoring..." : t("filesPage.restoreAll")}</button>
          </div>
        )}
        {tab === "Folders" && !currentFolder ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {folders.map((folder) => (
              <div key={folder.name}
                onClick={() => { if (renamingFolder !== folder.name) openFolder(folder.name); }}
                className="group relative bg-[#141414] border border-neutral-800/60 rounded-xl p-4 hover:border-neutral-700/60 transition-colors cursor-pointer">
                <FolderMenu
                  onDelete={() => deleteFolderAction(folder.name)}
                  onRename={() => { setRenamingFolder(folder.name); setFolderRenameValue(folder.name); }}
                />
                <div className="text-neutral-400 mb-3"><FolderIcon size={24} /></div>
                {renamingFolder === folder.name ? (
                  <input
                    autoFocus
                    value={folderRenameValue}
                    onChange={(e) => setFolderRenameValue(e.target.value)}
                    onBlur={() => commitFolderRename(folder.name)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitFolderRename(folder.name); if (e.key === "Escape") { setRenamingFolder(null); } }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-[#0f0f0f] border border-indigo-600/60 rounded px-1.5 py-0.5 text-neutral-200 text-[12px] lg:text-[13px] outline-none"
                  />
                ) : (
                  <div className="text-neutral-200 text-[12px] lg:text-[13px] mb-1 truncate">{folder.name}</div>
                )}
                <div className="text-neutral-600 text-[11px]">{folder.files} files</div>
                <div className="text-neutral-700 text-[11px] mt-0.5">{folder.modified}</div>
              </div>
            ))}
          </div>
        ) : view === "list" ? (
          <>
            <div className="hidden md:grid md:grid-cols-[1fr_80px_80px_60px_32px] gap-4 px-3 py-2 mb-1">
              <div className="text-neutral-600 text-[11px] uppercase tracking-wider">{t("filesPage.name")}</div>
              <div className="text-neutral-600 text-[11px] uppercase tracking-wider">{t("filesPage.size")}</div>
              <div className="text-neutral-600 text-[11px] uppercase tracking-wider">{t("filesPage.modified")}</div>
              <div className="text-neutral-600 text-[11px] uppercase tracking-wider">{t("filesPage.owner")}</div>
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
                    <div className="text-neutral-500 text-[12px] hidden md:block">{file.size}</div>
                    <div className="text-neutral-500 text-[12px] hidden md:block">{file.modified}</div>
                    <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-400 hidden md:flex" title={membersMap.get(file.owner) || file.owner}>{(membersMap.get(file.owner) || file.owner || "?")[0].toUpperCase()}</div>
                    <FileMenu fileName={file.name} onDelete={() => deleteFile(file.name)} onRename={() => startRename(file.name)} onPreview={() => setPreviewFile(file)} onDownload={() => handleDownload(file.name)} onShare={() => shareFile(file.name)} />
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
                  <div className="text-neutral-600 text-[11px]">{file.size} · {file.modified}</div>
                  <div className="absolute top-3 right-3">
                    <FileMenu fileName={file.name} onDelete={() => deleteFile(file.name)} onRename={() => startRename(file.name)} onPreview={() => setPreviewFile(file)} onDownload={() => handleDownload(file.name)} onShare={() => shareFile(file.name)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-neutral-600 text-[13px]">{t("filesPage.noFilesHere")}</div>
        )}
      </div>

      <UploadModal
        open={showUpload}
        workspaceId={workspaceId}
        onClose={() => setShowUpload(false)}
        onUpload={(uploaded) => setFiles((prev) => [{ ...uploaded, archived: false }, ...prev])}
      />
      <NewFolderModal open={showNewFolder} onClose={() => setShowNewFolder(false)} onAdd={async (f) => {
        setFolders((prev) => [f, ...prev]);
        try { await api.createFolder(f); } catch (e) { logger.error("app", "Failed to save folder:", e); toast.error(t("filesPage.failedToCreateFolder")); }
      }} />
      <FilePreviewModal
        file={previewFile}
        workspaceId={workspaceId}
        onClose={() => setPreviewFile(null)}
        onRename={handleFileRenameFromPreview}
      />
    </div>
  );
}