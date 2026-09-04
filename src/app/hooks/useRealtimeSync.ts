import { useEffect, useRef } from "react";
import { supabase } from "../utils/supabase";
import { invalidateCache } from "../utils/api";

/**
 * Subscribe to Postgres change events for the given tables and run `onChange`
 * whenever any of them change — the "signal → refetch" pattern.
 *
 * Why refetch instead of patching local state from the payload? The app reads
 * all data through the edge function (which maps/shapes rows), so the realtime
 * payload's raw row shape doesn't match what the UI holds. Re-running the page's
 * existing fetch keeps one source of truth and avoids drift.
 *
 * Row Level Security already restricts realtime events to rows the signed-in
 * user can read (i.e. their workspace), so no client-side workspace filtering is
 * needed here. Events caused by the user's own writes also fire — that's fine,
 * a refetch just reconciles with the server (and is debounced).
 *
 * @param tables  Postgres table names to watch (e.g. ["tasks"]).
 * @param onChange Callback to refetch data. Kept in a ref so the subscription
 *                 doesn't tear down/recreate on every render.
 * @param enabled  Optional gate; when false, no subscription is created.
 */
export function useRealtimeSync(
  tables: string[],
  onChange: () => void,
  enabled = true,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Stable key so the effect doesn't re-run when the array identity changes.
  const tablesKey = tables.join(",");

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (debounce) clearTimeout(debounce);
      // Coalesce bursts (e.g. a multi-row write) into a single refetch.
      // Invalidate the API cache first so the refetch gets fresh data.
      debounce = setTimeout(() => { invalidateCache(); onChangeRef.current(); }, 250);
    };

    const channel = supabase.channel(`realtime:${tablesKey}:${Math.random().toString(36).slice(2)}`);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        trigger,
      );
    }
    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(`[Realtime] Connection ${status} for tables: ${tablesKey}. Data may be stale.`);
      }
    });

    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesKey, enabled]);
}
