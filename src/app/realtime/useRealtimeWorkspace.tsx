import { useEffect, useRef, useState } from "react";
import { supabase } from "../utils/supabase";

export type RefreshListener = (table: string) => void;

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;

export function useRealtimeWorkspace(
  workspaceId: string | null,
  onRefresh: RefreshListener,
) {
  const listenerRef = useRef(onRefresh);
  listenerRef.current = onRefresh;
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    setDisconnected(false);
    if (!workspaceId) return;
    let cancelled = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;

    const scheduleRetry = () => {
      if (cancelled) return;
      attempts += 1;
      if (attempts > MAX_RECONNECT_ATTEMPTS) {
        console.warn(
          `Realtime: giving up on workspace:${workspaceId} after ${MAX_RECONNECT_ATTEMPTS} attempts`,
        );
        setDisconnected(true);
        return;
      }
      const delay = Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), 30_000);
      retryTimer = setTimeout(() => {
        if (!cancelled) subscribe();
      }, delay);
    };

    const subscribe = () => {
      if (cancelled) return;
      if (channel) void supabase.removeChannel(channel);
      channel = supabase.channel(`workspace:${workspaceId}`);
      channel
        .on("broadcast", { event: "refresh" }, (payload: unknown) => {
          const p = payload as { payload?: { table?: string }; table?: string };
          const table = p?.payload?.table || p?.table;
          if (table) listenerRef.current(table);
        })
        .subscribe((status: string) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            console.debug(`Realtime: subscribed to workspace:${workspaceId}`);
            attempts = 0;
            setDisconnected(false);
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            scheduleRetry();
          }
        });
    };

    subscribe();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) {
        const ch = channel;
        channel = null;
        void (async () => {
          await supabase.removeChannel(ch);
        })();
      }
    };
  }, [workspaceId]);

  return { disconnected };
}
