import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthContext";
import {
  getSubscription,
  getWorkspacePlan,
  type Plan,
  type Subscription,
  type SubscriptionInfo,
  type TransactionSummary,
} from "../utils/api";

export type PlanId = "free" | "pro" | "business";

function isPlanId(v: unknown): v is PlanId {
  return v === "free" || v === "pro" || v === "business";
}

const normalizePlanId = (v: unknown): PlanId => (isPlanId(v) ? v : "free");

/** Order matters: each plan includes everything from the plans before it. */
const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, business: 2 };

/** Per-plan limits that the UI enforces. Prices/entitlements live server-side. */
export const PLAN_LIMITS: Record<PlanId, { maxProjects: number | null }> = {
  free: { maxProjects: 3 },
  pro: { maxProjects: null },
  business: { maxProjects: null },
};

const FALLBACK_FREE_PLAN: Plan = {
  id: "free",
  name: "Free",
  description: "",
  currency: "IDR",
  monthly: 0,
  yearly: 0,
  features: [],
  highlighted: false,
};

interface SubscriptionState {
  /** Plan the user effectively has right now (free until loaded). */
  plan: Plan;
  subscription: Subscription | null;
  transactions: TransactionSummary[];
  /** True until the first fetch for the signed-in user resolves. */
  loading: boolean;
  /** True while the workspace-inherited plan is being resolved. */
  workspacePlanLoading: boolean;
  /** True when the signed-in user is on the founder allowlist. */
  isAdmin: boolean;
  /** True when the user's plan rank is at least the given plan's rank. */
  hasPlan: (min: PlanId) => boolean;
  refresh: () => Promise<void>;
  /** Workspace-level plan for invited members (borrowed from workspace owner). */
  workspacePlan: PlanId;
}

const SubscriptionContext = createContext<SubscriptionState>({
  plan: FALLBACK_FREE_PLAN,
  workspacePlan: "free",
  subscription: null,
  transactions: [],
  loading: false,
  workspacePlanLoading: false,
  isAdmin: false,
  hasPlan: (min) => min === "free",
  refresh: async () => {},
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { session, user } = useAuth();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Fase 14.5 — workspace-level plan for invited members
  const [workspacePlan, setWorkspacePlan] = useState<PlanId>("free");
  const [workspacePlanLoading, setWorkspacePlanLoading] = useState(false);

  const userId = user?.id;
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.access_token ?? null;

  const refresh = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      const data = await getSubscription(token);
      setInfo(data);
      setLoaded(true);
      const personalPlan = data?.effective_plan?.id;
      if (!personalPlan || personalPlan === "free") {
        setWorkspacePlanLoading(true);
        try {
          const wp = await getWorkspacePlan();
          setWorkspacePlan(normalizePlanId(wp.plan));
        } catch {
          /* keep previous workspace plan */
        } finally {
          setWorkspacePlanLoading(false);
        }
      } else {
        setWorkspacePlan("free");
      }
    } catch (e) {
      console.error("Failed to refresh subscription:", e);
      setWorkspacePlanLoading(true);
      try {
        const wp = await getWorkspacePlan();
        setWorkspacePlan(normalizePlanId(wp.plan));
      } catch {
        /* keep previous workspace plan */
      } finally {
        setWorkspacePlanLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const h = () => {
      void refresh();
    };
    window.addEventListener("workspace-changed", h);
    return () => window.removeEventListener("workspace-changed", h);
  }, [refresh]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!userId || !token) {
      setInfo(null);
      setLoaded(false);
      setWorkspacePlan("free");
      setWorkspacePlanLoading(false);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    setWorkspacePlan("free");
    setWorkspacePlanLoading(false);

    (async () => {
      try {
        const data = await getSubscription(token);
        if (cancelled) return;
        setInfo(data);
        // If personal plan is free or missing, fall back to workspace plan.
        // Await it BEFORE marking loaded so PlanGate never flashes locked.
        // Only show the workspace-plan spinner when the fetch actually runs.
        const personalPlan = data?.effective_plan?.id;
        if (!personalPlan || personalPlan === "free") {
          setWorkspacePlanLoading(true);
          try {
            const wp = await getWorkspacePlan();
            if (!cancelled) setWorkspacePlan(normalizePlanId(wp.plan));
          } catch {
            /* workspace plan unavailable — keep free */
          } finally {
            if (!cancelled) setWorkspacePlanLoading(false);
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to load subscription:", e);
          setInfo(null);
          // On error, still try workspace plan (awaited before loaded).
          setWorkspacePlanLoading(true);
          try {
            const wp = await getWorkspacePlan();
            if (!cancelled) setWorkspacePlan(normalizePlanId(wp.plan));
          } catch {
            /* workspace plan unavailable — keep free */
          } finally {
            if (!cancelled) setWorkspacePlanLoading(false);
          }
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const plan = info?.effective_plan ?? FALLBACK_FREE_PLAN;
  // Use whichever plan is higher: personal or workspace-inherited
  const effectivePlanRank = Math.max(
    PLAN_RANK[plan.id] ?? 0,
    PLAN_RANK[workspacePlan] ?? 0,
  );
  const hasPlan = useCallback(
    (min: PlanId) => effectivePlanRank >= (PLAN_RANK[min] ?? Number.MAX_SAFE_INTEGER),
    [effectivePlanRank],
  );

  return (
    <SubscriptionContext.Provider
      value={{
        plan,
        subscription: info?.subscription ?? null,
        transactions: info?.transactions ?? [],
        loading: (!!user && !loaded) || workspacePlanLoading,
        workspacePlanLoading,
        isAdmin: info?.is_admin ?? false,
        hasPlan,
        refresh,
        workspacePlan,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
