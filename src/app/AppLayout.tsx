import { logger } from "./utils/logger";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { Frame760 } from "./components/SidebarDemo";
import { MainContent } from "./components/MainContent";
import { MaintenanceScreen } from "./components/MaintenanceScreen";
import { NavigationContext } from "./components/NavigationContext";
import { NotificationsHost } from "./components/NotificationsHost";
import { RenewalBanner } from "./components/RenewalBanner";
import { Spinner } from "@/components/cossui/spinner";
import { NotFoundPage } from "./pages/NotFoundPage";
import { useSubscription } from "./subscription/SubscriptionContext";
import { ensureWorkspace, getServiceStatus, type MaintenanceStatus } from "./utils/api";
import { useAppearance } from "./AppearanceContext";

const VALID_SECTIONS = new Set([
  "dashboard",
  "tasks",
  "projects",
  "calendar",
  "schedule",
  "teams",
  "analytics",
  "files",
  "chat",
  "notes",
  "authentication",
  "billing",
  "project-analytics",
  "settings",
  "profile",
]);

export function AppLayout() {
  const { section = "dashboard", sub = "" } = useParams();
  const routerNavigate = useNavigate();
  const { isAdmin, loading: subLoading } = useSubscription();
  const { sidebarPosition } = useAppearance();
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);

  // Defense-in-depth: the server's requireWorkspace middleware auto-provisions
  // any workspace-scoped request, but we still fire a single ensureWorkspace()
  // once on mount and hold the render until it resolves. This gives the user a
  // single provisioning point (no parallel races from child components), and
  // avoids a flash of an unscoped UI on first entry. POST /workspace is
  // idempotent, so a user who already has a workspace just gets it back.
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    ensureWorkspace()
      .catch((e: unknown) => {
        // An invited user has no workspace of their own yet — route them to the
        // accept-invite page instead of provisioning a stray solo workspace.
        if (e && typeof e === "object" && "code" in e && e.code === "pending_invite" && "token" in e) {
          if (!cancelled) setPendingInviteToken(e.token as string);
        } else {
          logger.error("app", e instanceof Error ? e : new Error("Workspace provisioning failed"));
        }
      })
      .finally(() => {
        if (!cancelled) setWorkspaceReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    getServiceStatus()
      .then(({ maintenance: mt }) => setMaintenance(mt))
      .catch((e) => logger.error("app", "Failed to load service status:", e));
  }, []);

  const navigate = useCallback(
    (nextSection: string, nextSub = "") => {
      routerNavigate(
        nextSub ? `/app/${nextSection}/${nextSub}` : `/app/${nextSection}`,
      );
    },
    [routerNavigate],
  );

  const contextValue = useMemo(
    () => ({ activeSection: section, subSection: sub, navigate }),
    [section, sub, navigate],
  );

  // Hold the render until workspace provisioning has settled — prevents child
  // components from racing to auto-provision in parallel and avoids a flash of
  // an unscoped workspace on first entry.
  if (!workspaceReady) {
    return (
      <div className="dark flex h-screen items-center justify-center bg-[#0f0f0f]">
        <Spinner className="size-6 text-neutral-400" />
      </div>
    );
  }

  // An invited user has no workspace — send them to accept the invitation
  // instead of running the app against a non-existent workspace.
  if (pendingInviteToken) {
    return <Navigate to={`/join/${pendingInviteToken}`} replace />;
  }

  if (!VALID_SECTIONS.has(section)) {
    return <NotFoundPage />;
  }

  // Maintenance lock-out for non-founders. Wait for the subscription to load
  // first so admins never see a flash of the maintenance screen.
  if (maintenance?.enabled) {
    if (subLoading) {
      return (
        <div className="dark flex h-screen items-center justify-center bg-[#0f0f0f]">
          <Spinner className="size-6 text-neutral-400" />
        </div>
      );
    }
    if (!isAdmin) {
      return <MaintenanceScreen message={maintenance.message} />;
    }
  }

  return (
    <NavigationContext.Provider value={contextValue}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0f0f0f]">
        {maintenance?.enabled && isAdmin && (
          <div
            className="dark flex items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-950/40 px-4 py-2 text-[12.5px] text-amber-200"
            style={{ fontFamily: "Lexend, sans-serif" }}
          >
            Maintenance mode is ON — users are locked out.
            <Link
              to="/admin"
              className="rounded-full border border-amber-400/40 px-3 py-0.5 text-amber-100 transition-colors hover:bg-amber-400/10"
            >
              Founder panel
            </Link>
          </div>
        )}
        <RenewalBanner />
        <NotificationsHost />
        <div className={`flex min-h-0 flex-1 ${sidebarPosition === "right" ? "flex-row-reverse" : "flex-row"}`}>
          <Frame760
            activeSection={section}
            onSectionChange={(nextSection) => navigate(nextSection)}
          />
          <MainContent activeSection={section} />
        </div>
      </div>
    </NavigationContext.Provider>
  );
}
