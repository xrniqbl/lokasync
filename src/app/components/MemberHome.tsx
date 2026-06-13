import { useLang } from "../i18n";
import { useMemberHome } from "./member/useMemberHome";
import { MemberHeader } from "./member/MemberHeader";
import { QuickActionsGrid } from "./member/QuickActionsGrid";
import { TodayPanel } from "./member/TodayPanel";
import { MyTasksSection } from "./member/MyTasksSection";
import { ProjectsOverview } from "./member/ProjectsOverview";
import { MentionsFeed } from "./member/MentionsFeed";
import { TeamActivityFeed } from "./member/TeamActivityFeed";

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-neutral-800 ${className}`} />;
}

function SkeletonLoader() {
  return (
    <div className="space-y-7">
      {/* Header skeleton */}
      <div className="space-y-3">
        <SkeletonBar className="h-7 w-64" />
        <SkeletonBar className="h-4 w-40" />
        <div className="flex gap-2">
          <SkeletonBar className="h-6 w-24" />
          <SkeletonBar className="h-6 w-20" />
          <SkeletonBar className="h-6 w-16" />
        </div>
      </div>

      {/* Quick actions skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-neutral-800/50 animate-pulse" />
        ))}
      </div>

      {/* Today panel skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <SkeletonBar className="h-28 rounded-xl" />
          <SkeletonBar className="h-28 rounded-xl" />
        </div>
        <div className="space-y-3">
          <SkeletonBar className="h-28 rounded-xl" />
          <SkeletonBar className="h-28 rounded-xl" />
        </div>
      </div>

      {/* My tasks skeleton */}
      <SkeletonBar className="h-40 rounded-xl" />

      {/* Projects skeleton */}
      <SkeletonBar className="h-40 rounded-xl" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 rounded-xl border border-neutral-800 bg-[#1a1a1a]/50">
      <p className="text-neutral-600 text-xs">{message}</p>
    </div>
  );
}

export function MemberHome() {
  const { t } = useLang();
  const { data, loading, error } = useMemberHome();

  if (loading) return <SkeletonLoader />;

  if (error || !data) {
    return (
      <EmptyState
        message={t ? t("sidebar.refreshToContinue") : "Unable to load workspace data."}
      />
    );
  }

  const ws = data.workspace;
  const tasks = data.my_tasks;

  return (
    <div className="max-w-6xl space-y-7">
      {/* Header */}
      <MemberHeader
        workspaceName={ws.name}
        ownerName={ws.owner_name}
        totalMembers={ws.total_members}
      />

      {/* Quick Actions — full width */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-neutral-200 text-xs font-['Lexend:SemiBold',_sans-serif]">
            {t("memberHome.quickActions")}
          </span>
        </div>
        <QuickActionsGrid />
      </section>

      {/* Today panel — 2 column: left=TodayPanel, right=mentions+activity stacked */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-neutral-200 text-xs font-['Lexend:SemiBold',_sans-serif]">
              {t("memberHome.today")}
            </span>
          </div>
          <TodayPanel
            events={data.today_events}
            dueTasks={tasks.due_today}
          />
        </div>

        {/* Right column — mentions + activity stacked */}
        <div className="space-y-4">
          <MentionsFeed mentions={data.mentions} />
          <TeamActivityFeed items={data.team_activity} />
        </div>
      </div>

      {/* My Tasks — full width */}
      <section>
        <MyTasksSection
          inProgress={tasks.in_progress}
          inReview={tasks.in_review}
          dueToday={tasks.due_today}
          completed={tasks.completed}
        />
      </section>

      {/* Projects — full width */}
      <section>
        <ProjectsOverview projects={data.projects} />
      </section>
    </div>
  );
}