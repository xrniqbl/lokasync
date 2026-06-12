import { DashboardPage } from "./DashboardPage";
import { TasksPage } from "./TasksPage";
import { ProjectsPage } from "./ProjectsPage";
import { CalendarPage } from "./CalendarPage";
import { TeamsPage } from "./TeamsPage";
import { AnalyticsPage } from "./AnalyticsPage";
import { FilesPage } from "./FilesPage";
import { SettingsPage } from "./SettingsPage";
import { ProfilePage } from "./ProfilePage";
import { BillingPage } from "./BillingPage";
import { PlanGate } from "./PlanGate";

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

const pageMap: Record<string, React.ComponentType> = {
  dashboard: DashboardPage,
  tasks: TasksPage,
  projects: ProjectsPage,
  calendar: CalendarPage,
  teams: GatedTeamsPage,
  analytics: GatedAnalyticsPage,
  files: FilesPage,
  settings: SettingsPage,
  profile: ProfilePage,
  billing: BillingPage,
};

export function MainContent({ activeSection }: { activeSection: string }) {
  const Page = pageMap[activeSection] ?? pageMap.dashboard;
  return (
    <div className="flex-1 overflow-hidden bg-[#0f0f0f] h-full min-w-0">
      <Page />
    </div>
  );
}
