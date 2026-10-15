import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthContext";
import * as api from "../utils/api";

// Fase 14.5 — active-workspace state for the signed-in user. The selection is
// persisted per user; the server is the source of truth for membership, so a
// stale selection (e.g. removed from a workspace) falls back to the default.

const storageKey = (userId: string) => `indologic.activeWorkspace.${userId}`;

/** Persist the workspace to activate on next app load (used by InvitePage). */
export const persistActiveWorkspace = (userId: string, workspaceId: string) => {
  try {
    localStorage.setItem(storageKey(userId), workspaceId);
  } catch {
    /* storage unavailable (private mode) — selection just won't persist */
  }
};

interface WorkspaceState {
  workspaces: api.Workspace[];
  activeWorkspace: api.Workspace | null;
  /** True when the signed-in user owns the active workspace. */
  isOwner: boolean;
  loading: boolean;
  /** Last workspace load/switch failure message, if any. */
  workspaceError: string | null;
  switchWorkspace: (id: string) => Promise<boolean>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceState>({
  workspaces: [],
  activeWorkspace: null,
  isOwner: false,
  loading: false,
  workspaceError: null,
  switchWorkspace: async () => false,
  refreshWorkspaces: async () => {},
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [workspaces, setWorkspaces] = useState<api.Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  // Generation counter: stale load() responses never clobber an explicit
  // user switch that happened while the request was in flight.
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const seq = ++requestSeq.current;
    const applyIfCurrent = <T,>(fn: () => T): T | undefined => {
      if (requestSeq.current !== seq) return undefined;
      return fn();
    };
    const preferred = localStorage.getItem(storageKey(userId));
    api.setApiWorkspaceId(preferred);
    let result: { workspaces: api.Workspace[]; active: string };
    try {
      result = await api.getWorkspaces();
    } catch (e) {
      // Stale selection (membership revoked or workspace deleted) — retry
      // with the default workspace.
      if (e instanceof api.ApiError && (e.status === 403 || e.status === 404)) {
        try {
          localStorage.removeItem(storageKey(userId));
        } catch {
          /* storage unavailable */
        }
        api.setApiWorkspaceId(null);
        result = await api.getWorkspaces();
      } else {
        throw e;
      }
    }
    if (requestSeq.current !== seq) return; // superseded by a user switch
    applyIfCurrent(() => {
      setWorkspaces(result.workspaces);
      if (result.workspaces.length === 0) {
        setActiveId(null);
        api.setApiWorkspaceId(null);
        setWorkspaceError("No workspaces found for this account.");
      } else {
        const resolved = result.workspaces.some((w) => w.id === result.active)
          ? result.active
          : (result.workspaces[0]?.id ?? result.active);
        setActiveId(resolved);
        api.setApiWorkspaceId(resolved);
        persistActiveWorkspace(userId, resolved);
        setWorkspaceError(null);
      }
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      requestSeq.current++;
      api.setApiWorkspaceId(null);
      setWorkspaces([]);
      setActiveId(null);
      setWorkspaceError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setWorkspaceError(null);
    load()
      .catch((e) => {
        if (!cancelled) {
          console.error("Failed to load workspaces:", e);
          setWorkspaceError(e instanceof Error ? e.message : "Failed to load workspaces");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, load]);

  const switchWorkspace = useCallback(
    async (id: string): Promise<boolean> => {
      if (!userId) return false;
      // Verify membership server-side before persisting — never trust a raw id.
      const seq = ++requestSeq.current;
      setWorkspaceError(null);
      try {
        api.setApiWorkspaceId(id);
        const result = await api.getWorkspaces();
        if (requestSeq.current !== seq) return false; // superseded
        const match = result.workspaces.find((w) => w.id === id);
        if (!match) throw new Error("Workspace not found or access denied");
        persistActiveWorkspace(userId, id);
        setWorkspaces(result.workspaces);
        setActiveId(id);
        api.setApiWorkspaceId(id);
        window.dispatchEvent(new Event("workspace-changed"));
        return true;
      } catch (e) {
        if (requestSeq.current === seq) {
          console.error("Failed to switch workspace:", e);
          setWorkspaceError(e instanceof Error ? e.message : "Failed to switch workspace");
          // Restore the previous valid selection.
          const fallback = localStorage.getItem(storageKey(userId));
          api.setApiWorkspaceId(fallback);
        }
        return false;
      }
    },
    [userId],
  );

  const refreshWorkspaces = useCallback(async () => {
    setWorkspaceError(null);
    try {
      await load();
    } catch (e) {
      console.error("Failed to load workspaces:", e);
      setWorkspaceError(e instanceof Error ? e.message : "Failed to load workspaces");
    }
  }, [load]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? null,
    [workspaces, activeId],
  );

  const value = useMemo(
    () => ({
      workspaces,
      activeWorkspace,
      isOwner: activeWorkspace?.role === "owner",
      loading,
      workspaceError,
      switchWorkspace,
      refreshWorkspaces,
    }),
    [workspaces, activeWorkspace, loading, workspaceError, switchWorkspace, refreshWorkspaces],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
