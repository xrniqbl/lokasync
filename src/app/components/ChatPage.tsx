import { logger } from "../utils/logger";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { ArrowDown } from "lucide-react";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { useAuth } from "../auth/AuthContext";
import { useLang } from "../LangContext";
import * as api from "../utils/api";
import { MessageBubble } from "./chat/MessageBubble";
import { MessageInput } from "./chat/MessageInput";
import { ThreadPanel } from "./chat/ThreadPanel";

export function ChatPage() {
  const { t } = useLang();
  const { user } = useAuth();

  const [messages, setMessages] = useState<api.ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<api.ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [threadMessage, setThreadMessage] = useState<api.ChatMessage | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Load workspace ID
  useEffect(() => {
    api.getWorkspace().then(({ workspace }) => {
      if (workspace?.id) setWorkspaceId(workspace.id);
    }).catch(() => {});
  }, []);

  // Load messages
  const loadMessages = useCallback((opts?: { silent?: boolean; older?: boolean }) => {
    const before = opts?.older && messages.length > 0 ? messages[0].created_at : undefined;
    if (opts?.older) setLoadingMore(true);

    api.getChatMessages(50, before).then(({ messages: newMsgs, has_more }) => {
      if (opts?.older) {
        setMessages((prev) => [...newMsgs, ...prev]);
        setHasMore(has_more);
      } else {
        setMessages(newMsgs);
        setHasMore(has_more);
      }
    }).catch((e) => {
      logger.error("app", "Failed to load messages:", e);
      if (!opts?.silent) toast.error(t("chat.failedToLoad"));
    }).finally(() => {
      setLoading(false);
      setLoadingMore(false);
    });
  }, [messages, t]);

  useEffect(() => { loadMessages(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime
  useRealtimeSync(["chat_messages", "chat_reactions"], () => loadMessages({ silent: true }));

  // Auto-scroll on new messages (only if near bottom)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      setShowScrollBtn(false);
    } else {
      setShowScrollBtn(true);
    }
  }, [messages.length]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 50);
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll up
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loadingMore) {
        loadMessages({ older: true });
      }
    }, { root: scrollRef.current, threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMessages]);

  // Thread reply counts
  const threadCounts = messages.reduce<Record<string, number>>((acc, m) => {
    if (m.reply_to) acc[m.reply_to] = (acc[m.reply_to] || 0) + 1;
    return acc;
  }, {});

  // Send message
  const handleSend = async (content: string, file?: { url: string; name: string; type: string }) => {
    if (editingId) {
      // Edit mode
      await api.editChatMessage(editingId, content);
      setEditingId(null);
      setEditText("");
      return;
    }
    await api.sendChatMessage({
      content,
      file_url: file?.url,
      file_name: file?.name,
      file_type: file?.type,
      reply_to: replyTo?.id,
    });
    setReplyTo(null);
  };

  // Reactions
  const handleReact = async (msg: api.ChatMessage, emoji: string) => {
    try {
      await api.addChatReaction(msg.id, emoji);
    } catch (e) {
      logger.error("app", "Failed to toggle reaction:", e);
    }
  };

  // Delete
  const handleDelete = async (msg: api.ChatMessage) => {
    try {
      await api.deleteChatMessage(msg.id);
      toast.success(t("chat.messageDeleted"));
    } catch (e) {
      logger.error("app", "Failed to delete:", e);
      toast.error(t("chat.failedToDeleteMessage"));
    }
  };

  // Edit
  const handleEdit = (msg: api.ChatMessage) => {
    setEditingId(msg.id);
    setEditText(msg.content);
    setReplyTo(null);
  };

  // Scroll to bottom button
  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setShowScrollBtn(false);
  };

  // Detect if user is near bottom on scroll
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    setShowScrollBtn(!nearBottom);
  };

  const currentUserId = user?.id ?? "";

  return (
    <div className="flex h-full font-['Lexend:Regular',_sans-serif]" style={{ fontFamily: "Lexend, sans-serif" }}>
      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="px-4 md:px-6 lg:px-8 pt-6 lg:pt-8 pb-4 shrink-0">
          <h1 className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif] text-[18px] lg:text-[22px] leading-tight mb-1">
            {t("chat.title")}
          </h1>
          <p className="text-neutral-500 text-[12px] lg:text-[13px]">
            {messages.length > 0
              ? `${messages.length} messages`
              : t("chat.noMessages")}
          </p>
        </div>

        {/* Messages */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-2 md:px-4">
          {/* Sentinel for infinite scroll */}
          {hasMore && <div ref={sentinelRef} className="h-1" />}
          {loadingMore && (
            <div className="text-center text-neutral-600 text-[12px] py-3">Loading older messages...</div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="text-neutral-600 text-[13px]">Loading...</div>
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-neutral-800/50 flex items-center justify-center mb-1">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-neutral-500">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-neutral-300 text-[15px] font-medium">{t("chat.noMessages")}</span>
              <span className="text-neutral-500 text-[13px]">{t("chat.startConversation")}</span>
            </div>
          )}

          <div className="space-y-0.5 pb-3">
            {messages.map((msg, i) => {
              const prev = messages[i - 1];
              const showHeader = !prev || prev.user_id !== msg.user_id ||
                (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000);

              // Edit mode: show inline edit UI
              if (editingId === msg.id) {
                return (
                  <div key={msg.id} className="px-4 py-2">
                    <div className="bg-[#1a1a1a] border border-indigo-500/40 rounded-xl p-3">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full bg-transparent text-[13px] text-neutral-200 outline-none resize-none"
                        rows={2}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(editText); }
                          if (e.key === "Escape") { setEditingId(null); setEditText(""); }
                        }}
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button onClick={() => { setEditingId(null); setEditText(""); }} className="text-[12px] text-neutral-500 hover:text-neutral-300 px-2 py-1 rounded transition-colors">
                          Cancel
                        </button>
                        <button onClick={() => handleSend(editText)} className="text-[12px] text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded transition-colors">
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={msg.user_id === currentUserId}
                  showHeader={showHeader}
                  threadCount={threadCounts[msg.id] || 0}
                  onReply={setReplyTo}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onReact={handleReact}
                  onOpenThread={setThreadMessage}
                  currentUserId={currentUserId}
                  workspaceId={workspaceId ?? ""}
                />
              );
            })}
          </div>
        </div>

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <div className="relative">
            <button
              onClick={scrollToBottom}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] border border-neutral-800 rounded-full text-[12px] text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-colors shadow-lg z-10"
            >
              <ArrowDown size={12} /> {t("chat.newMessages")}
            </button>
          </div>
        )}

        {/* Input */}
        <MessageInput
          onSend={handleSend}
          replyTo={editingId ? null : replyTo}
          onCancelReply={() => setReplyTo(null)}
          workspaceId={workspaceId}
        />
      </div>

      {/* Thread panel */}
      {threadMessage && (
        <div className="w-[360px] shrink-0 hidden lg:block">
          <ThreadPanel
            parentMessage={threadMessage}
            onClose={() => setThreadMessage(null)}
            currentUserId={currentUserId}
            workspaceId={workspaceId ?? ""}
          />
        </div>
      )}
    </div>
  );
}
