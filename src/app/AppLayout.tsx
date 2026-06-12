import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Frame760 } from "./components/SidebarDemo";
import { MainContent } from "./components/MainContent";
import { MaintenanceScreen } from "./components/MaintenanceScreen";
import { NavigationContext } from "./components/NavigationContext";
import { NotificationsHost } from "./components/NotificationsHost";
import { RenewalBanner } from "./components/RenewalBanner";
import { Spinner } from "@/components/cossui/spinner";
import { NotFoundPage } from "./pages/NotFoundPage";
import { useSubscription } from "./subscription/SubscriptionContext";
import { getServiceStatus, type MaintenanceStatus } from "./utils/api";

const VALID_SECTIONS = new Set([
  "dashboard",
  "tasks",
  "projects",
  "calendar",
  "teams",
  "analytics",
  "files",
  "settings",
  "profile",
  "billing",
]);

export function AppLayout() {
  const { section = "dashboard", sub = "" } = useParams();
  const routerNavigate = useNavigate();
  const { isAdmin, loading: subLoading } = useSubscription();
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);

  useEffect(() => {
    getServiceStatus()
      .then(({ maintenance: mt }) => setMaintenance(mt))
      .catch((e) => console.error("Failed to load service status:", e));
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
        <div className="flex min-h-0 flex-1 flex-row">
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
