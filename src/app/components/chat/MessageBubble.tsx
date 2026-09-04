import { memo, useState } from "react";
import { Reply, Smile, Pencil, Trash2, MessageSquare } from "lucide-react";
import type { ChatMessage } from "../../utils/api";
import { ReactionPicker } from "./ReactionPicker";
import { FilePreview } from "./FilePreview";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showHeader: boolean;
  threadCount: number;
  onReply: (msg: ChatMessage) => void;
  onEdit: (msg: ChatMessage) => void;
  onDelete: (msg: ChatMessage) => void;
  onReact: (msg: ChatMessage, emoji: string) => void;
  onOpenThread: (msg: ChatMessage) => void;
  currentUserId: string;
  workspaceId: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const MessageBubble = memo(function MessageBubble({
  message, isOwn, showHeader, threadCount, onReply, onEdit, onDelete, onReact, onOpenThread, currentUserId, workspaceId,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [showReactPicker, setShowReactPicker] = useState(false);

  // Group reactions by emoji with counts
  const reactionGroups = message.reactions.reduce<Record<string, { count: number; hasOwn: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasOwn: false };
    acc[r.emoji].count++;
    if (r.user_id === currentUserId) acc[r.emoji].hasOwn = true;
    return acc;
  }, {});

  return (
    <div
      className={`group flex gap-2 px-4 py-0.5 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactPicker(false); }}
    >
      {/* Avatar */}
      {showHeader && !isOwn ? (
        <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center text-[11px] text-neutral-300 shrink-0 mt-0.5">
          {message.sender.initials}
        </div>
      ) : !isOwn ? (
        <div className="w-8 shrink-0" />
      ) : null}

      {/* Content */}
      <div className={`relative flex flex-col max-w-[75%] min-w-0 ${isOwn ? "items-end" : "items-start"}`}>
        {/* Header */}
        {showHeader && (
          <div className={`flex items-center gap-2 mb-0.5 ${isOwn ? "flex-row-reverse" : ""}`}>
            <span className="text-[12px] font-medium text-neutral-300">{message.sender.name}</span>
            <span className="text-[11px] text-neutral-600">{formatTime(message.created_at)}</span>
          </div>
        )}

        {/* Reply-to preview */}
        {message.reply_to_preview && (
          <div className={`flex items-center gap-1.5 mb-1 px-2 py-1 rounded-lg bg-neutral-800/40 border-l-2 border-indigo-500/50 max-w-full ${isOwn ? "self-end" : ""}`}>
            <Reply size={10} className="text-neutral-500 shrink-0" />
            <span className="text-[11px] text-neutral-500 truncate">
              {message.reply_to_preview.sender_name}: {message.reply_to_preview.content}
            </span>
          </div>
        )}

        {/* Action toolbar — appears on hover, positioned above the bubble */}
        {showActions && (
          <div
            className={`absolute -top-9 ${isOwn ? "right-0" : "left-0"} flex items-center gap-0.5 bg-[#1a1a1a] border border-neutral-700 rounded-xl shadow-xl px-1 py-0.5 z-20`}
            style={{ minWidth: "fit-content" }}
          >
            <button
              onClick={() => onReply(message)}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-neutral-700/80 active:bg-neutral-600 transition-colors text-neutral-400 hover:text-neutral-100"
              aria-label="Reply"
              title="Reply"
            >
              <Reply size={16} strokeWidth={2} />
            </button>
            <button
              onClick={() => setShowReactPicker(!showReactPicker)}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-neutral-700/80 active:bg-neutral-600 transition-colors text-neutral-400 hover:text-neutral-100"
              aria-label="React"
              title="React"
            >
              <Smile size={16} strokeWidth={2} />
            </button>
            {isOwn && (
              <button
                onClick={() => onEdit(message)}
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-neutral-700/80 active:bg-neutral-600 transition-colors text-neutral-400 hover:text-neutral-100"
                aria-label="Edit"
                title="Edit"
              >
                <Pencil size={16} strokeWidth={2} />
              </button>
            )}
            <button
              onClick={() => onDelete(message)}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-red-950/60 active:bg-red-950/80 transition-colors text-neutral-400 hover:text-red-400"
              aria-label="Delete"
              title="Delete"
            >
              <Trash2 size={16} strokeWidth={2} />
            </button>
          </div>
        )}

        {/* Reaction picker popover */}
        {showReactPicker && (
          <div className={`absolute -top-20 ${isOwn ? "right-0" : "left-0"} z-30`}>
            <ReactionPicker onSelect={(emoji) => { onReact(message, emoji); setShowReactPicker(false); }} />
          </div>
        )}

        {/* Bubble */}
        <div
          className={`rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
            isOwn
              ? "bg-indigo-950/40 text-neutral-100 rounded-tr-sm"
              : "bg-[#1a1a1a] text-neutral-200 rounded-tl-sm border border-neutral-800/50"
          }`}
        >
          {message.content}

          {/* File attachment */}
          {message.file_url && (
            <FilePreview
              fileUrl={message.file_url}
              fileName={message.file_name ?? "file"}
              fileType={message.file_type}
              workspaceId={workspaceId}
            />
          )}

          {/* Edited indicator */}
          {message.updated_at && (
            <span className="text-[10px] text-neutral-600 ml-1">(edited)</span>
          )}
        </div>

        {/* Reactions bar */}
        {Object.keys(reactionGroups).length > 0 && (
          <div className={`flex items-center gap-1 mt-1 flex-wrap ${isOwn ? "justify-end" : "justify-start"}`}>
            {Object.entries(reactionGroups).map(([emoji, { count, hasOwn }]) => (
              <button
                key={emoji}
                onClick={() => onReact(message, emoji)}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[12px] border transition-colors ${
                  hasOwn
                    ? "bg-indigo-950/40 border-indigo-500/40 text-indigo-300 hover:bg-indigo-950/60"
                    : "bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:bg-neutral-800/60"
                }`}
              >
                <span>{emoji}</span>
                {count > 1 && <span className="font-medium">{count}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Thread indicator */}
        {threadCount > 0 && (
          <button
            onClick={() => onOpenThread(message)}
            className="flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-lg text-[12px] text-indigo-400 hover:bg-indigo-950/30 hover:text-indigo-300 active:bg-indigo-950/50 transition-colors"
          >
            <MessageSquare size={13} />
            {threadCount} {threadCount === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>
    </div>
  );
});
