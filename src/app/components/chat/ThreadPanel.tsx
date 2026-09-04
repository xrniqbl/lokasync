import { logger } from "../../utils/logger";
import { useState, useEffect, useRef, useCallback } from "react";
import { X, Reply } from "lucide-react";
import { toast } from "sonner";
import { useRealtimeSync } from "../../hooks/useRealtimeSync";
import { useLang } from "../../LangContext";
import * as api from "../../utils/api";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";

interface ThreadPanelProps {
  parentMessage: api.ChatMessage;
  onClose: () => void;
  currentUserId: string;
  workspaceId: string;
}

export function ThreadPanel({ parentMessage, onClose, currentUserId, workspaceId }: ThreadPanelProps) {
  const { t } = useLang();
  const [replies, setReplies] = useState<api.ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadReplies = useCallback((opts?: { silent?: boolean }) => {
    api.getChatMessages(100).then(({ messages }) => {
      const threadReplies = messages.filter((m) => m.reply_to === parentMessage.id);
      setReplies(threadReplies);
    }).catch((e) => {
      logger.error("app", "Failed to load thread:", e);
      if (!opts?.silent) toast.error(t("chat.failedToLoadThread"));
    }).finally(() => setLoading(false));
  }, [parentMessage.id]);

  useEffect(() => { loadReplies(); }, [loadReplies]);

  // Scroll to bottom on new replies
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [replies.length]);

  // Realtime updates
  useRealtimeSync(["chat_messages"], () => loadReplies({ silent: true }));

  const handleSend = async (content: string, file?: { url: string; name: string; type: string }) => {
    await api.sendChatMessage({
      content,
      file_url: file?.url,
      file_name: file?.name,
      file_type: file?.type,
      reply_to: parentMessage.id,
    });
  };

  const handleReact = async (msg: api.ChatMessage, emoji: string) => {
    try { await api.addChatReaction(msg.id, emoji); } catch (e) { logger.error("app", "Failed to react:", e); }
  };

  const handleDelete = async (msg: api.ChatMessage) => {
    try { await api.deleteChatMessage(msg.id); } catch (e) { logger.error("app", "Failed to delete:", e); toast.error(t("chat.failedToDeleteMessage")); }
  };

  // Count thread replies from main messages
  const threadCount = replies.length;

  return (
    <div className="flex flex-col h-full border-l border-neutral-800 bg-[#0f0f0f]" style={{ fontFamily: "Lexend, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-2">
          <Reply size={16} className="text-indigo-400" />
          <span className="text-[14px] text-neutral-200 font-medium">Thread</span>
          <span className="text-[12px] text-neutral-500">{threadCount} {threadCount === 1 ? "reply" : "replies"}</span>
        </div>
        <button onClick={onClose} className="p-1 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Parent message */}
      <div className="px-4 py-3 border-b border-neutral-800/50 bg-[#141414]">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-[10px] text-neutral-300">
            {parentMessage.sender.initials}
          </div>
          <span className="text-[12px] font-medium text-neutral-300">{parentMessage.sender.name}</span>
        </div>
        <p className="text-[13px] text-neutral-400 whitespace-pre-wrap break-words">{parentMessage.content}</p>
      </div>

      {/* Replies */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 space-y-1">
        {loading && (
          <div className="text-center text-neutral-600 text-[12px] py-8">Loading...</div>
        )}
        {!loading && replies.length === 0 && (
          <div className="text-center text-neutral-600 text-[12px] py-8">No replies yet</div>
        )}
        {replies.map((msg, i) => {
          const prev = replies[i - 1];
          const showHeader = !prev || prev.user_id !== msg.user_id ||
            (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000);
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.user_id === currentUserId}
              showHeader={showHeader}
              threadCount={0}
              onReply={() => {}}
              onEdit={() => {}}
              onDelete={handleDelete}
              onReact={handleReact}
              onOpenThread={() => {}}
              currentUserId={currentUserId}
              workspaceId={workspaceId}
            />
          );
        })}
      </div>

      {/* Input */}
      <MessageInput
        onSend={handleSend}
        replyTo={null}
        onCancelReply={() => {}}
        workspaceId={workspaceId}
      />
    </div>
  );
}
