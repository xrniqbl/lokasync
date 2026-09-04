import { logger } from "../utils/logger";
import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  getNotifications,
  markNotificationsRead,
  type UserNotification,
} from "../utils/api";

const MAX_VISIBLE = 3;

/**
 * Slim banner stack (under the renewal banner) showing unread founder
 * notifications. Dismissing one marks it read server-side.
 */
export function NotificationsHost() {
  const { user } = useAuth();
  const [unread, setUnread] = useState<UserNotification[]>([]);

  useEffect(() => {
    if (!user) {
      setUnread([]);
      return;
    }
    let cancelled = false;
    getNotifications()
      .then((items) => {
        if (!cancelled) setUnread(items.filter((n) => !n.read));
      })
      .catch((e) => logger.error("app", "Failed to load notifications:", e));
    return () => {
      cancelled = true;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (unread.length === 0) return null;

  const dismiss = (id: string) => {
    setUnread((prev) => prev.filter((n) => n.id !== id));
    markNotificationsRead([id]).catch((e) =>
      logger.error("app", "Failed to mark notification read:", e),
    );
  };

  return (
    <div
      className="dark flex flex-col"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      {unread.slice(0, MAX_VISIBLE).map((n) => (
        <div
          key={n.id}
          role="status"
          className="flex items-center justify-center gap-3 border-b border-indigo-500/20 bg-indigo-950/40 px-4 py-2 text-[12.5px] text-indigo-100"
        >
          <Megaphone
            className="size-3.5 shrink-0 text-indigo-300"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="text-indigo-50">{n.title}</span>
            <span className="text-indigo-200/80"> — {n.message}</span>
          </span>
          <button
            type="button"
            onClick={() => dismiss(n.id)}
            aria-label={`Dismiss ${n.title}`}
            className="ml-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-indigo-300/70 transition-colors hover:bg-indigo-400/10 hover:text-indigo-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
