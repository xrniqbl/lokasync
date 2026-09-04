import { useState, useEffect, useCallback } from "react";
import { useLang } from "../LangContext";
import { Plus, Search, MoreHorizontal, Pin, Trash2, Edit3, FileText } from "lucide-react";
import { toast } from "sonner";

interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function NotesPage() {
  const { t } = useLang();
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [showNewNote, setShowNewNote] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "pinned">("all");

  // Load notes from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("loka-notes");
    if (saved) {
      try {
        const parsed = JSON.parse(saved).map((n: { title: string; content: string; pinned: boolean; createdAt: string; updatedAt: string }) => ({
          ...n,
          createdAt: new Date(n.createdAt),
          updatedAt: new Date(n.updatedAt),
        }));
        setNotes(parsed);
      } catch {
        setNotes([]);
      }
    }
  }, []);

  // Save notes to localStorage
  useEffect(() => {
    localStorage.setItem("loka-notes", JSON.stringify(notes));
  }, [notes]);

  const filteredNotes = notes
    .filter((n) => {
      if (activeTab === "pinned" && !n.pinned) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

  const handleCreateNote = () => {
    if (!newTitle.trim()) {
      toast.error(t("notes.titleRequired"));
      return;
    }
    const note: Note = {
      id: generateId(),
      title: newTitle.trim(),
      content: newContent.trim(),
      pinned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setNotes((prev) => [note, ...prev]);
    setNewTitle("");
    setNewContent("");
    setShowNewNote(false);
    setSelectedNote(note);
    toast.success(t("notes.created"));
  };

  const handleUpdateNote = () => {
    if (!selectedNote || !editTitle.trim()) {
      toast.error(t("notes.titleRequired"));
      return;
    }
    setNotes((prev) =>
      prev.map((n) =>
        n.id === selectedNote.id
          ? { ...n, title: editTitle.trim(), content: editContent.trim(), updatedAt: new Date() }
          : n
      )
    );
    setIsEditing(false);
    setSelectedNote({
      ...selectedNote,
      title: editTitle.trim(),
      content: editContent.trim(),
      updatedAt: new Date(),
    });
    toast.success(t("notes.updated"));
  };

  const handleDeleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedNote?.id === id) {
      setSelectedNote(null);
      setIsEditing(false);
    }
    toast.success(t("notes.deleted"));
  };

  const handleTogglePin = (id: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n))
    );
  };

  const startEditing = (note: Note) => {
    setEditTitle(note.title);
    setEditContent(note.content);
    setIsEditing(true);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="flex flex-col h-full font-['Lexend:Regular',_sans-serif]">
      {/* Header */}
      <div className="px-4 md:px-6 lg:px-8 pt-6 lg:pt-8 pb-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif] text-[18px] lg:text-[22px] leading-tight mb-1">
              {t("nav.notes")}
            </h1>
            <p className="text-neutral-500 text-[12px] lg:text-[13px]">
              {notes.length} {notes.length === 1 ? t("notes.note") : t("notes.notes")}
            </p>
          </div>
          <button
            onClick={() => setShowNewNote(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors shrink-0 flex items-center gap-2"
          >
            <Plus size={14} />
            {t("notes.newNote")}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-neutral-800/60 mb-4">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 lg:px-4 py-2.5 text-[12px] lg:text-[13px] border-b-2 transition-colors -mb-px ${
              activeTab === "all"
                ? "border-indigo-500 text-neutral-50"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t("notes.allNotes")}
          </button>
          <button
            onClick={() => setActiveTab("pinned")}
            className={`px-3 lg:px-4 py-2.5 text-[12px] lg:text-[13px] border-b-2 transition-colors -mb-px ${
              activeTab === "pinned"
                ? "border-indigo-500 text-neutral-50"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t("notes.pinned")}
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder={t("notes.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#141414] border border-neutral-800 rounded-lg pl-9 pr-4 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-700"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Notes List */}
          <div className="lg:col-span-1 space-y-2">
            {filteredNotes.length === 0 && (
              <div className="text-center py-12">
                <FileText size={32} className="mx-auto mb-3 text-neutral-700" />
                <p className="text-neutral-600 text-[13px]">
                  {searchQuery ? t("notes.noMatch") : t("notes.noNotesYet")}
                </p>
                <p className="text-neutral-700 text-[12px] mt-1">
                  {!searchQuery && t("notes.getStarted")}
                </p>
              </div>
            )}
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => {
                  setSelectedNote(note);
                  setIsEditing(false);
                }}
                className={`p-3 rounded-lg cursor-pointer transition-all ${
                  selectedNote?.id === note.id
                    ? "bg-[#1a1a1a] border border-neutral-700"
                    : "bg-[#141414] border border-neutral-800/60 hover:border-neutral-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="text-neutral-200 text-[13px] font-['Lexend:SemiBold',_sans-serif] truncate flex-1">
                    {note.title}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    {note.pinned && (
                      <Pin size={11} className="text-indigo-400" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePin(note.id);
                      }}
                      className="p-1 rounded hover:bg-neutral-800 transition-colors"
                    >
                      <Pin size={11} className={note.pinned ? "text-indigo-400" : "text-neutral-600"} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                      className="p-1 rounded hover:bg-red-950/40 transition-colors"
                    >
                      <Trash2 size={11} className="text-neutral-600 hover:text-red-400" />
                    </button>
                  </div>
                </div>
                <p className="text-neutral-500 text-[11px] line-clamp-2 mb-2">
                  {note.content || t("notes.noContent")}
                </p>
                <p className="text-neutral-700 text-[10px]">
                  {formatDate(note.updatedAt)}
                </p>
              </div>
            ))}
          </div>

          {/* Note Detail / Editor */}
          <div className="lg:col-span-2">
            {selectedNote && !isEditing ? (
              <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-5 lg:p-6">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-neutral-50 text-[18px] font-['Lexend:SemiBold',_sans-serif] mb-1">
                      {selectedNote.title}
                    </h2>
                    <p className="text-neutral-600 text-[11px]">
                      {t("notes.lastUpdated")} {formatDate(selectedNote.updatedAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => startEditing(selectedNote)}
                    className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    <Edit3 size={12} />
                    {t("notes.edit")}
                  </button>
                </div>
                <div className="text-neutral-300 text-[13px] leading-relaxed whitespace-pre-wrap">
                  {selectedNote.content || t("notes.noContent")}
                </div>
              </div>
            ) : selectedNote && isEditing ? (
              <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-5 lg:p-6">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-transparent text-neutral-50 text-[18px] font-['Lexend:SemiBold',_sans-serif] mb-4 focus:outline-none border-b border-neutral-800 pb-2"
                  placeholder={t("notes.noteTitle")}
                />
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full bg-transparent text-neutral-300 text-[13px] leading-relaxed min-h-[300px] resize-none focus:outline-none"
                  placeholder={t("notes.writePlaceholder")}
                />
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-neutral-800">
                  <button
                    onClick={handleUpdateNote}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] px-4 py-2 rounded-lg transition-colors"
                  >
                    {t("notes.saveChanges")}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[12px] px-4 py-2 rounded-lg transition-colors"
                  >
                    {t("notes.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-12 flex flex-col items-center justify-center text-center">
                <FileText size={48} className="text-neutral-800 mb-4" />
                <p className="text-neutral-600 text-[14px] mb-1">{t("notes.selectNote")}</p>
                <p className="text-neutral-700 text-[12px]">
                  {t("notes.chooseNote")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Note Modal */}
      {showNewNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-neutral-800 rounded-xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-neutral-50 text-[16px] font-['Lexend:SemiBold',_sans-serif] mb-4">
              {t("notes.createTitle")}
            </h3>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t("notes.noteTitle")}
              className="w-full bg-[#141414] border border-neutral-800 rounded-lg px-4 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-700 mb-3"
              autoFocus
            />
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={t("notes.writePlaceholder")}
              className="w-full bg-[#141414] border border-neutral-800 rounded-lg px-4 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-700 min-h-[200px] resize-none mb-4"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => {
                  setShowNewNote(false);
                  setNewTitle("");
                  setNewContent("");
                }}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[12px] px-4 py-2 rounded-lg transition-colors"
              >
                {t("notes.cancel")}
              </button>
              <button
                onClick={handleCreateNote}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] px-4 py-2 rounded-lg transition-colors"
              >
                {t("notes.createBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
