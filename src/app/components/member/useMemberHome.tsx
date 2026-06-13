import { useEffect, useState } from "react";
import { getMemberHome } from "../../utils/api";

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
  error: Error | null;
}

export function useMemberHome(): UseMemberHomeResult {
  const [data, setData] = useState<MemberHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getMemberHome()
      .then((res) => {
        if (!cancelled) setData(res as MemberHomeData);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}