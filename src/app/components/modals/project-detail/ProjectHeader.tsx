import { useState, useRef, useEffect } from "react";
import { Star, Link2, MoreHorizontal, X, Layers, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "../../../LangContext";

interface ProjectHeaderProps {
  name: string;
  starred: boolean;
  projectId: string;
  onNameChange: (name: string) => void;
  onToggleStar: () => void;
  onClose: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function ProjectHeader({
  name,
  starred,
  projectId,
  onNameChange,
  onToggleStar,
  onClose,
  onDuplicate,
  onArchive,
  onDelete,
}: ProjectHeaderProps) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setEditValue(name); }, [name]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name) onNameChange(trimmed);
    else setEditValue(name);
    setEditing(false);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#/projects/${encodeURIComponent(projectId)}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success(t("projectDetail.linkCopied"));
    }).catch(() => {
      toast.error(t("projectDetail.failedToCopyLink"));
    });
    setShowMenu(false);
  };

  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") { setEditValue(name); setEditing(false); }
            }}
            className="flex-1 bg-[#0f0f0f] border border-indigo-500/50 rounded-lg px-3 py-1.5 text-neutral-50 text-[15px] font-['Lexend:SemiBold',_sans-serif] outline-none"
          />
        ) : (
          <h2
            onClick={() => setEditing(true)}
            className="text-neutral-50 text-[15px] font-['Lexend:SemiBold',_sans-serif] truncate cursor-pointer hover:text-indigo-300 transition-colors"
            title="Click to edit"
          >
            {name}
          </h2>
        )}

        {/* Star */}
        <button
          onClick={onToggleStar}
          className={`p-1.5 rounded-lg transition-colors ${starred ? "text-amber-400" : "text-neutral-600 hover:text-neutral-400"}`}
          title={starred ? "Unstar" : "Star"}
        >
          <Star size={16} fill={starred ? "currentColor" : "none"} strokeWidth={1.8} />
        </button>

        {/* Copy Link */}
        <button onClick={handleCopyLink} className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-300 transition-colors" title="Copy project link">
          <Link2 size={15} strokeWidth={1.8} />
        </button>
      </div>

      <div className="flex items-center gap-1 shrink-0 ml-3">
        {/* More menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            <MoreHorizontal size={16} strokeWidth={1.8} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-[#1a1a1a] border border-neutral-800 rounded-lg shadow-xl z-10 py-1">
              <button
                onClick={() => { onDuplicate(); setShowMenu(false); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-[12px] text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                <Layers size={14} strokeWidth={1.8} /> Duplicate Project
              </button>
              <button
                onClick={() => { onArchive(); setShowMenu(false); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-[12px] text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                <Archive size={14} strokeWidth={1.8} /> Archive Project
              </button>
              <div className="border-t border-neutral-800 my-1" />
              <button
                onClick={() => { onDelete(); setShowMenu(false); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-[12px] text-red-400 hover:bg-red-950/30 transition-colors"
              >
                <Trash2 size={14} strokeWidth={1.8} /> Delete Project
              </button>
            </div>
          )}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
