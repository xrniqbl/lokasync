import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getMemberHome } from "../../utils/api";
import { useWorkspace } from "../../workspace/WorkspaceContext";
import { useRealtimeWorkspace } from "../../realtime";

export interface MemberHomeData {
  workspace: {
    name: string;
    owner_id: string;
    owner_name: string;
    owner_email: string;
    total_members: number;
    plan_id: string;
  };
  today_events: {
    id: string;
    title: string;
    time: string;
    color: string;
  }[];
  my_tasks: {
    in_progress: { id: string; title: string; project: string; priority: string }[];
    in_review: { id: string; title: string; project: string; priority: string }[];
    due_today: { id: string; title: string; project: string; priority: string }[];
    completed: { id: string; title: string; project: string; priority: string }[];
  };
  projects: {
    id: string;
    name: string;
    total_tasks: number;
    completed_tasks: number;
    progress_percent: number;
    next_milestone: string;
  }[];
  mentions: {
    id: string;
    type: string;
    actor: string;
    text: string;
    time: string;
  }[];
  team_activity: {
    id: string;
    actor: string;
    action: string;
    target: string;
    time: string;
  }[];
}

interface UseMemberHomeResult {
  data: MemberHomeData | null;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useMemberHome(): UseMemberHomeResult {
  const [data, setData] = useState<MemberHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  // Race guard: only the latest fetch may write state.
  const seqRef = useRef(0);

  // Normalize partial server payloads so downstream .map calls never crash
  // on a missing array (today_events, my_tasks sub-arrays, mentions, …).
  const normalize = (raw: MemberHomeData): MemberHomeData => ({
    ...raw,
    today_events: raw.today_events ?? [],
    my_tasks: {
      in_progress: raw.my_tasks?.in_progress ?? [],
      in_review: raw.my_tasks?.in_review ?? [],
      due_today: raw.my_tasks?.due_today ?? [],
      completed: raw.my_tasks?.completed ?? [],
    },
    projects: raw.projects ?? [],
    mentions: raw.mentions ?? [],
    team_activity: raw.team_activity ?? [],
  });

  // Background refresh keeps old data on screen with a subtle indicator
  // instead of flashing the full skeleton on every realtime event. A failed
  // refresh leaves stale data visible and toasts — the full error panel is
  // only for the initial load with nothing to show.
  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    setRefreshing(true);
    try {
      const res = await getMemberHome();
      if (seq !== seqRef.current) return;
      setData(normalize(res as MemberHomeData));
      setError(null);
    } catch (e) {
      if (seq !== seqRef.current) return;
      console.error("Member home refresh failed:", e);
      toast.error("Couldn't refresh workspace data — showing last loaded");
    } finally {
      if (seq === seqRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const seq = ++seqRef.current;
    async function fetch() {
      try {
        setLoading(true);
        setError(null);
        const res = await getMemberHome();
        if (seq !== seqRef.current) return;
        setData(normalize(res as MemberHomeData));
      } catch (e) {
        if (seq !== seqRef.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }
    fetch();
  }, [workspaceId]);

  useRealtimeWorkspace(workspaceId, (table) => {
    if (["tasks", "projects", "calendar_events", "mentions", "team_activity"].includes(table)) {
      void refresh();
    }
  });

  return { data, loading, refreshing, error, refresh };
}