import { Suspense, lazy } from "react";
import { PlanGate } from "./PlanGate";
import { OwnerOnly } from "./OwnerOnly";
import { Spinner } from "@/components/cossui/spinner";

// Access model:
// - Teams = PlanGate(pro): any role may use it once the (personal or
//   workspace-inherited) plan qualifies — inherited access is OK.
// - Analytics = OwnerOnly + PlanGate: owners only, and still plan-gated.
// - Billing = OwnerOnly: owners only (no plan requirement).
import { DashboardPage } from "./DashboardPage";

const TasksPage = lazy(() => import("./TasksPage").then((m) => ({ default: m.TasksPage })));
const ProjectsPage = lazy(() => import("./ProjectsPage").then((m) => ({ default: m.ProjectsPage })));
const CalendarPage = lazy(() => import("./CalendarPage").then((m) => ({ default: m.CalendarPage })));
const TeamsPage = lazy(() => import("./TeamsPage").then((m) => ({ default: m.TeamsPage })));
const AnalyticsPage = lazy(() => import("./AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })));
const FilesPage = lazy(() => import("./FilesPage").then((m) => ({ default: m.FilesPage })));
const SettingsPage = lazy(() => import("./SettingsPage").then((m) => ({ default: m.SettingsPage })));
const ProfilePage = lazy(() => import("./ProfilePage").then((m) => ({ default: m.ProfilePage })));
const BillingPage = lazy(() => import("./BillingPage").then((m) => ({ default: m.BillingPage })));

const GatedAnalyticsPage = () => (
  <PlanGate min="pro" feature="Analytics & reporting">
    <AnalyticsPage />
  </PlanGate>
);

const GatedTeamsPage = () => (
  <PlanGate min="pro" feature="Team management">
    <TeamsPage />
  </PlanGate>
);

const OwnerBillingPage = () => (
  <OwnerOnly>
    <BillingPage />
  </OwnerOnly>
);

const OwnerAnalyticsPage = () => (
  <OwnerOnly>
    <GatedAnalyticsPage />
  </OwnerOnly>
);

const pageMap: Record<string, React.ComponentType> = {
  dashboard: DashboardPage,
  tasks: TasksPage,
  projects: ProjectsPage,
  calendar: CalendarPage,
  teams: GatedTeamsPage,
  analytics: OwnerAnalyticsPage,
  files: FilesPage,
  settings: SettingsPage,
  profile: ProfilePage,
  billing: OwnerBillingPage,
};

export function MainContent({ activeSection }: { activeSection: string }) {
  const Page = pageMap[activeSection] ?? pageMap.dashboard;
  // Dashboard renders synchronously; lazy sections get a spinner fallback.
  if (activeSection === "dashboard") {
    return (
      <div className="flex-1 overflow-hidden bg-[#0f0f0f] h-full min-w-0">
        <Page />
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-hidden bg-[#0f0f0f] h-full min-w-0">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center" aria-busy="true" aria-label="Loading section">
            <Spinner className="size-6 text-neutral-400" />
          </div>
        }
      >
        <Page />
      </Suspense>
    </div>
  );
}
