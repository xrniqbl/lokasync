import { logger } from "../../utils/logger";
import { useState, useRef, useCallback } from "react";
import { Send, Paperclip, X, Reply } from "lucide-react";
import { toast } from "sonner";
import type { ChatMessage } from "../../utils/api";
import * as storage from "../../utils/storage";
import { useLang } from "../../LangContext";

interface MessageInputProps {
  onSend: (content: string, file?: { url: string; name: string; type: string }) => Promise<void>;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  workspaceId: string | null;
}

export function MessageInput({ onSend, replyTo, onCancelReply, workspaceId }: MessageInputProps) {
  const { t } = useLang();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content && !attachedFile) return;
    try {
      await onSend(content, attachedFile ?? undefined);
      setText("");
      setAttachedFile(null);
      inputRef.current?.focus();
    } catch {
      // Parent handles error toast
    }
  }, [text, attachedFile, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("chat.fileTooLarge"));
      return;
    }
    if (!workspaceId) {
      toast.error(t("chat.workspaceNotReady"));
      return;
    }
    setUploading(true);
    try {
      const result = await storage.uploadChatFile(file, workspaceId);
      setAttachedFile({ url: result.path, name: file.name, type: file.type });
    } catch (err) {
      logger.error("app", "Failed to upload file:", err);
      toast.error(t("chat.failedToUploadFile"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="border-t border-neutral-800 bg-[#0f0f0f]">
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-800/50 bg-[#141414]">
          <Reply size={14} className="text-indigo-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[11px] text-indigo-400">{t("chat.replyingTo")} {replyTo.sender.name}</span>
            <span className="text-[11px] text-neutral-500 ml-2 truncate">{replyTo.content.slice(0, 60)}</span>
          </div>
          <button onClick={onCancelReply} className="text-neutral-500 hover:text-neutral-300 transition-colors p-1">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Attached file preview */}
      {attachedFile && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-800/50 bg-[#141414]">
          <Paperclip size={14} className="text-neutral-400 shrink-0" />
          <span className="text-[12px] text-neutral-300 truncate flex-1">{attachedFile.name}</span>
          <button onClick={() => setAttachedFile(null)} className="text-neutral-500 hover:text-neutral-300 transition-colors p-1">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 p-3">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.zip,.txt,.json,.mp4"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="p-2 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50 shrink-0"
          aria-label={t("chat.attachFile")}
        >
          <Paperclip size={18} />
        </button>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("chat.typeMessage")}
          rows={1}
          className="flex-1 bg-[#1a1a1a] border border-neutral-800 focus:border-indigo-600/60 rounded-xl px-4 py-2.5 text-[13px] text-neutral-200 outline-none resize-none placeholder:text-neutral-600 transition-colors min-h-[40px] max-h-[120px]"
          style={{ fontFamily: "Lexend, sans-serif" }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = Math.min(target.scrollHeight, 120) + "px";
          }}
        />
        <button
          onClick={handleSend}
          disabled={(!text.trim() && !attachedFile) || uploading}
          className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-lg transition-colors shrink-0"
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
