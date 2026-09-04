import { useState, useRef, useEffect, useMemo } from "react";
import { Send, Smile, Reply, Edit3, Trash2, X } from "lucide-react";
import type { LocalComment } from "./types";

// ── Emoji picker ─────────────────────────────────────────────────────────────

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "✅", "💯"];

function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute bottom-full mb-1 left-0 bg-[#1a1a1a] border border-neutral-800 rounded-lg p-2 shadow-xl z-10 flex gap-1">
      {QUICK_EMOJIS.map((e) => (
        <button key={e} onClick={() => { onSelect(e); onClose(); }} className="w-7 h-7 flex items-center justify-center hover:bg-neutral-800 rounded-md transition-colors text-sm">
          {e}
        </button>
      ))}
    </div>
  );
}

// ── @Mention suggestions ────────────────────────────────────────────────────

function MentionSuggestions({ query, members, onSelect }: { query: string; members: { user_id: string; name: string }[]; onSelect: (name: string) => void }) {
  const filtered = members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
  if (filtered.length === 0) return null;
  return (
    <div className="absolute bottom-full mb-1 left-0 w-56 bg-[#1a1a1a] border border-neutral-800 rounded-lg shadow-xl z-10 py-1 max-h-40 overflow-y-auto">
      {filtered.map((m) => (
        <button key={m.user_id} onClick={() => onSelect(m.name)} className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-neutral-800 transition-colors text-left">
          <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-[9px] shrink-0">{m.name.substring(0, 2).toUpperCase()}</span>
          <span className="text-neutral-300 text-[12px]">{m.name}</span>
        </button>
      ))}
    </div>
  );
}

// ── Single Comment ───────────────────────────────────────────────────────────

function CommentItem({
  comment,
  allComments,
  membersMap,
  onEdit,
  onDelete,
  onReact,
  onRemoveReaction,
  onReply,
  currentUserId,
  depth = 0,
}: {
  comment: LocalComment;
  allComments: LocalComment[];
  membersMap: Map<string, string>;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onRemoveReaction: (id: string, emoji: string) => void;
  onReply: (parentId: string) => void;
  currentUserId: string;
  depth?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment.content);
  const [showActions, setShowActions] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Find all nested replies (any depth)
  const replies = useMemo(() => allComments.filter((c) => c.parentId === comment.id), [allComments, comment.id]);

  const handleSaveEdit = () => {
    if (editValue.trim()) onEdit(comment.id, editValue.trim());
    setEditing(false);
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete(comment.id);
  };

  // Group reactions by emoji
  const groupedReactions = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of comment.reactions) {
      const existing = map.get(r.emoji) ?? [];
      existing.push(r.userId);
      map.set(r.emoji, existing);
    }
    return Array.from(map.entries());
  }, [comment.reactions]);

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  return (
    <div className={depth > 0 ? "ml-6 border-l-2 border-neutral-800/60 pl-3" : ""}>
      <div className="flex items-start gap-2.5 py-2 group" onMouseEnter={() => setShowActions(true)} onMouseLeave={() => { setShowActions(false); setConfirmDelete(false); }}>
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-neutral-700 flex items-center justify-center text-[10px] text-neutral-300 shrink-0 mt-0.5">
          {comment.authorInitials.substring(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-neutral-200 text-[12px] font-['Lexend:SemiBold',_sans-serif]">{comment.author}</span>
            <span className="text-neutral-600 text-[10px]">{timeAgo(comment.createdAt)}{comment.updatedAt ? " (edited)" : ""}</span>
          </div>

          {/* Content */}
          {editing ? (
            <div className="space-y-1.5">
              <textarea
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={2}
                className="w-full bg-[#0f0f0f] border border-indigo-500/50 rounded-lg px-3 py-2 text-neutral-200 text-[12px] outline-none resize-none"
              />
              <div className="flex gap-1.5">
                <button onClick={handleSaveEdit} className="px-2.5 py-1 rounded-md bg-indigo-600 text-white text-[10px]">Save</button>
                <button onClick={() => { setEditing(false); setEditValue(comment.content); }} className="px-2.5 py-1 rounded-md text-neutral-500 text-[10px] hover:text-neutral-300">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-neutral-400 text-[12px] leading-relaxed whitespace-pre-wrap break-words">
              {/* Render @mentions with highlight */}
              {comment.content.split(/(@[\w\s]+(?=\s|$))/g).map((part, i) =>
                part.startsWith("@") ? <span key={i} className="text-indigo-400 font-medium">{part}</span> : part
              )}
            </p>
          )}

          {/* Reactions */}
          {groupedReactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {groupedReactions.map(([emoji, userIds]) => {
                const reacted = userIds.includes(currentUserId);
                return (
                  <button
                    key={emoji}
                    onClick={() => reacted ? onRemoveReaction(comment.id, emoji) : onReact(comment.id, emoji)}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors ${
                      reacted ? "bg-indigo-950/40 border-indigo-500/30 text-indigo-300" : "bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:border-neutral-600"
                    }`}
                  >
                    <span>{emoji}</span>
                    <span>{userIds.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        {showActions && !editing && (
          <div className="flex items-center gap-0.5 shrink-0">
            <div className="relative">
              <button onClick={() => setShowEmoji(!showEmoji)} className="p-1 rounded-md text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 transition-colors">
                <Smile size={13} strokeWidth={1.8} />
              </button>
              {showEmoji && <EmojiPicker onSelect={(emoji) => onReact(comment.id, emoji)} onClose={() => setShowEmoji(false)} />}
            </div>
            <button onClick={() => onReply(comment.id)} className="p-1 rounded-md text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 transition-colors" title="Reply">
              <Reply size={13} strokeWidth={1.8} />
            </button>
            <button onClick={() => setEditing(true)} className="p-1 rounded-md text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 transition-colors" title="Edit">
              <Edit3 size={13} strokeWidth={1.8} />
            </button>
            <button onClick={handleDelete} className={`p-1 rounded-md hover:bg-neutral-800 transition-colors ${confirmDelete ? "text-red-400" : "text-neutral-600 hover:text-red-400"}`} title={confirmDelete ? "Click again to confirm" : "Delete"}>
              <Trash2 size={13} strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>

      {/* Nested replies (recursive — supports any depth) */}
      {replies.length > 0 && replies.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          allComments={allComments}
          membersMap={membersMap}
          onEdit={onEdit}
          onDelete={onDelete}
          onReact={onReact}
          onRemoveReaction={onRemoveReaction}
          onReply={onReply}
          currentUserId={currentUserId}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

// ── Main Comments Tab ────────────────────────────────────────────────────────

interface CommentsTabProps {
  comments: LocalComment[];
  membersMap: Map<string, string>;
  onAdd: (comment: LocalComment) => void;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onReact: (commentId: string, emoji: string) => void;
  onRemoveReaction: (commentId: string, emoji: string) => void;
  currentUserId: string;
  currentUserName: string;
  currentUserInitials: string;
}

export function CommentsTab({
  comments,
  membersMap,
  onAdd,
  onEdit,
  onDelete,
  onReact,
  onRemoveReaction,
  currentUserId,
  currentUserName,
  currentUserInitials,
}: CommentsTabProps) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const memberList = useMemo(() => Array.from(membersMap.entries()).map(([id, name]) => ({ user_id: id, name })), [membersMap]);

  // Top-level comments (no parent)
  const topLevel = useMemo(() => comments.filter((c) => !c.parentId), [comments]);

  const handleSend = () => {
    const content = text.trim();
    if (!content) return;
    onAdd({
      id: crypto.randomUUID(),
      author: currentUserName,
      authorInitials: currentUserInitials,
      content,
      createdAt: new Date().toISOString(),
      reactions: [],
      parentId: replyTo ?? undefined,
    });
    setText("");
    setReplyTo(null);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    const cursorPos = e.target.selectionStart;
    const beforeCursor = val.substring(0, cursorPos);
    const mentionMatch = beforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (name: string) => {
    const cursorPos = textareaRef.current?.selectionStart ?? text.length;
    const beforeCursor = text.substring(0, cursorPos);
    const afterCursor = text.substring(cursorPos);
    const newBefore = beforeCursor.replace(/@\w*$/, `@${name} `);
    setText(newBefore + afterCursor);
    setShowMentions(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const replyComment = replyTo ? comments.find((c) => c.id === replyTo) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Comment list */}
      <div className="flex-1 overflow-y-auto space-y-0 min-h-0 max-h-[400px] pr-1">
        {comments.length === 0 && (
          <p className="text-neutral-600 text-[12px] text-center py-12">No comments yet. Start the conversation below.</p>
        )}
        {topLevel.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            allComments={comments}
            membersMap={membersMap}
            onEdit={onEdit}
            onDelete={onDelete}
            onReact={onReact}
            onRemoveReaction={onRemoveReaction}
            onReply={setReplyTo}
            currentUserId={currentUserId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply indicator */}
      {replyComment && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/30 rounded-t-lg border border-b-0 border-neutral-800 mt-2">
          <Reply size={12} className="text-neutral-500" />
          <span className="text-neutral-400 text-[11px] flex-1 truncate">Replying to <strong className="text-neutral-300">{replyComment.author}</strong></span>
          <button onClick={() => setReplyTo(null)} className="text-neutral-500 hover:text-neutral-300"><X size={12} /></button>
        </div>
      )}

      {/* Input */}
      <div className="relative mt-2">
        {showMentions && <MentionSuggestions query={mentionQuery} members={memberList} onSelect={insertMention} />}
        <div className={`flex items-end gap-2 bg-[#0f0f0f] border border-neutral-800 focus-within:border-indigo-600/40 rounded-lg ${replyComment ? "rounded-t-none" : ""} px-3 py-2 transition-colors`}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={replyTo ? "Write a reply..." : "Write a comment... (@ to mention)"}
            rows={1}
            className="flex-1 bg-transparent text-neutral-200 text-[12px] outline-none resize-none placeholder:text-neutral-600 min-h-[20px] max-h-[80px]"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            <Send size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}
