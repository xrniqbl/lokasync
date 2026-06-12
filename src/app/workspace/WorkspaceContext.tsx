import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthContext";
import * as api from "../utils/api";

// Fase 14.5 — active-workspace state for the signed-in user. The selection is
// persisted per user; the server is the source of truth for membership, so a
// stale selection (e.g. removed from a workspace) falls back to the default.

const storageKey = (userId: string) => `lokasync.activeWorkspace.${userId}`;

/** Persist the workspace to activate on next app load (used by InvitePage). */
export const persistActiveWorkspace = (userId: string, workspaceId: string) => {
  localStorage.setItem(storageKey(userId), workspaceId);
};

interface WorkspaceState {
  workspaces: api.Workspace[];
  activeWorkspace: api.Workspace | null;
  /** True when the signed-in user owns the active workspace. */
  isOwner: boolean;
  loading: boolean;
  switchWorkspace: (id: string) => void;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceState>({
  workspaces: [],
  activeWorkspace: null,
  isOwner: false,
  loading: true,
  switchWorkspace: () => {},
  refreshWorkspaces: async () => {},
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [workspaces, setWorkspaces] = useState<api.Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const preferred = localStorage.getItem(storageKey(userId));
    api.setApiWorkspaceId(preferred);
    let result: { workspaces: api.Workspace[]; active: string };
    try {
      result = await api.getWorkspaces();
    } catch (e) {
      // Stale selection (membership revoked) — retry with the default workspace
      if (e instanceof api.ApiError && e.status === 403) {
        api.setApiWorkspaceId(null);
        result = await api.getWorkspaces();
      } else {
        throw e;
      }
    }
    setWorkspaces(result.workspaces);
    setActiveId(result.active);
    api.setApiWorkspaceId(result.active);
    persistActiveWorkspace(userId, result.active);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      api.setApiWorkspaceId(null);
      setWorkspaces([]);
      setActiveId(null);
      setLoading(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    load()
      .catch((e) => console.error("Failed to load workspaces:", e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, load]);

  const switchWorkspace = useCallback(
    (id: string) => {
      if (!userId) return;
      api.setApiWorkspaceId(id);
      persistActiveWorkspace(userId, id);
      setActiveId(id);
    },
    [userId],
  );

  const refreshWorkspaces = useCallback(async () => {
    await load();
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
      switchWorkspace,
      refreshWorkspaces,
    }),
    [workspaces, activeWorkspace, loading, switchWorkspace, refreshWorkspaces],
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
