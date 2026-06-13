import { useEffect, useRef } from "react";
import { supabase } from "../utils/supabase";

export type RefreshListener = (table: string) => void;

export function useRealtimeWorkspace(
  workspaceId: string | null,
  onRefresh: RefreshListener,
) {
  const listenerRef = useRef(onRefresh);
  listenerRef.current = onRefresh;

  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase.channel(`workspace:${workspaceId}`);
    channel
      .on("broadcast", { event: "refresh" }, (payload: any) => {
        const table = payload?.payload?.table || payload?.table;
        if (table) listenerRef.current(table);
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          console.log(`Realtime: subscribed to workspace:${workspaceId}`);
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);
}
