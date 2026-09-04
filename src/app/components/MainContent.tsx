import { lazy, Suspense } from "react";
import { PlanGate } from "./PlanGate";

// ── Lazy-loaded dashboard pages ───────────────────────────────────────────────
const DashboardPage = lazy(() => import("./DashboardPage").then(m => ({ default: m.DashboardPage })));
const TasksPage = lazy(() => import("./TasksPage").then(m => ({ default: m.TasksPage })));
const ProjectsPage = lazy(() => import("./ProjectsPage").then(m => ({ default: m.ProjectsPage })));
const CalendarPage = lazy(() => import("./CalendarPage").then(m => ({ default: m.CalendarPage })));
const TeamsPage = lazy(() => import("./TeamsPage").then(m => ({ default: m.TeamsPage })));
const AnalyticsPage = lazy(() => import("./AnalyticsPage").then(m => ({ default: m.AnalyticsPage })));
const FilesPage = lazy(() => import("./FilesPage").then(m => ({ default: m.FilesPage })));
const ChatPage = lazy(() => import("./ChatPage").then(m => ({ default: m.ChatPage })));
const NotesPage = lazy(() => import("./NotesPage").then(m => ({ default: m.NotesPage })));
const SettingsPage = lazy(() => import("./SettingsPage").then(m => ({ default: m.SettingsPage })));
const ProfilePage = lazy(() => import("./ProfilePage").then(m => ({ default: m.ProfilePage })));
const BillingPage = lazy(() => import("./BillingPage").then(m => ({ default: m.BillingPage })));
const ProjectAnalyticsPage = lazy(() => import("./ProjectAnalyticsPage").then(m => ({ default: m.ProjectAnalyticsPage })));

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
  schedule: CalendarPage,
  teams: GatedTeamsPage,
  analytics: GatedAnalyticsPage,
  files: FilesPage,
  chat: ChatPage,
  notes: NotesPage,
  authentication: ProfilePage,
  billing: BillingPage,
  "project-analytics": ProjectAnalyticsPage,
  settings: SettingsPage,
  profile: ProfilePage,
};

function PageSpinner() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0f0f0f]">
      <div className="w-5 h-5 border-2 border-neutral-700 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

export function MainContent({ activeSection }: { activeSection: string }) {
  const Page = pageMap[activeSection] ?? pageMap.dashboard;
  return (
    <div className="flex-1 overflow-hidden bg-[#0f0f0f] h-full min-w-0">
      <Suspense fallback={<PageSpinner />}>
        <Page />
      </Suspense>
    </div>
  );
}
