import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthContext";
import {
  getSubscription,
  type Plan,
  type Subscription,
  type SubscriptionInfo,
  type TransactionSummary,
} from "../utils/api";

export type PlanId = "free" | "pro" | "business";

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
  /** True when the signed-in user is on the founder allowlist. */
  isAdmin: boolean;
  /** True when the user's plan rank is at least the given plan's rank. */
  hasPlan: (min: PlanId) => boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionState>({
  plan: FALLBACK_FREE_PLAN,
  subscription: null,
  transactions: [],
  loading: false,
  isAdmin: false,
  hasPlan: (min) => min === "free",
  refresh: async () => {},
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { session, user } = useAuth();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  const userId = user?.id;

  useEffect(() => {
    if (!userId || !session) {
      setInfo(null);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    getSubscription(session.access_token)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((e) => {
        console.error("Failed to load subscription:", e);
        if (!cancelled) setInfo(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // Refetch only when the signed-in user changes, not on token refresh
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    const token = session?.access_token;
    if (!token) return;
    try {
      setInfo(await getSubscription(token));
      setLoaded(true);
    } catch (e) {
      console.error("Failed to refresh subscription:", e);
    }
  }, [session?.access_token]);

  const plan = info?.effective_plan ?? FALLBACK_FREE_PLAN;
  const hasPlan = useCallback(
    (min: PlanId) =>
      (PLAN_RANK[plan.id] ?? 0) >= (PLAN_RANK[min] ?? Number.MAX_SAFE_INTEGER),
    [plan.id],
  );

  return (
    <SubscriptionContext.Provider
      value={{
        plan,
        subscription: info?.subscription ?? null,
        transactions: info?.transactions ?? [],
        loading: !!user && !loaded,
        isAdmin: info?.is_admin ?? false,
        hasPlan,
        refresh,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
