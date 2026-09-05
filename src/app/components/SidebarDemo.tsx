import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useNavigation } from "./NavigationContext";
import { useSubscription } from "../subscription/SubscriptionContext";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import * as api from "../utils/api";
import { signOut, getCurrentUser } from "../utils/supabase";
import { useLang } from "../i18n";
import svgPaths from "../imports/svg-svkvdgwod6";
import {
  Search,
  Dashboard,
  Task,
  Folder,
  Calendar,
  UserMultiple,
  Analytics,
  DocumentAdd,
  Settings,
  User,
  ChevronDown,
  ChevronRight,
  OverflowMenuHorizontal,
  CheckmarkOutline,
  Time,
  InProgress,
  Pending,
  Archive,
  Flag,
  AddLarge,
  Filter,
  Renew,
  View,
  Report,
  Share,
  CloudUpload,
  Notification,
  Security,
  Integration,
  StarFilled,
  Group,
  Calendar as CalendarIcon,
  Home,
  ChartBar,
  FolderOpen,
  ChevronLeft,
  ChevronUp,
} from "@carbon/icons-react";

// Softer spring animation curve
const softSpringEasing = "cubic-bezier(0.25, 1.1, 0.4, 1)";

function InterfacesLogo1() {
  return (
    <div
      className="aspect-[24/24] basis-0 grow min-h-px min-w-px overflow-clip relative shrink-0"
      data-name="Interfaces Logo"
    >
      <div
        className="absolute aspect-[24/16] left-0 right-0 top-1/2 translate-y-[-50%]"
        data-name="Union"
      >
        <svg
          className="block size-full"
          fill="none"
          preserveAspectRatio="none"
          role="presentation"
          viewBox="0 0 24 16"
        >
          <g id="Union">
            <path
              d={svgPaths.p36880f80}
              fill="var(--fill-0, #FAFAFA)"
              style={{
                fill: "color(display-p3 0.9804 0.9804 0.9804)",
                fillOpacity: "1",
              }}
            />
            <path
              d={svgPaths.p355df480}
              fill="var(--fill-0, #FAFAFA)"
              style={{
                fill: "color(display-p3 0.9804 0.9804 0.9804)",
                fillOpacity: "1",
              }}
            />
            <path
              d={svgPaths.pfa0d600}
              fill="var(--fill-0, #FAFAFA)"
              style={{
                fill: "color(display-p3 0.9804 0.9804 0.9804)",
                fillOpacity: "1",
              }}
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div
      className="bg-[#000000] relative rounded-[999px] shrink-0 size-8"
      data-name="Avatar"
    >
      <div className="box-border content-stretch flex flex-row items-center justify-center overflow-clip p-0 relative size-8">
        <User size={16} className="text-neutral-50" />
      </div>
      <div
        aria-hidden="true"
        className="absolute border border-neutral-800 border-solid inset-0 pointer-events-none rounded-[999px]"
      />
    </div>
  );
}

const profileStatuses: { value: string; labelKey: "online" | "away" | "doNotDisturb" | "offline"; color: string }[] = [
  { value: "online",  labelKey: "online",       color: "#10b981" },
  { value: "away",    labelKey: "away",         color: "#f59e0b" },
  { value: "dnd",     labelKey: "doNotDisturb", color: "#ef4444" },
  { value: "offline", labelKey: "offline",      color: "#404040" },
];

function ProfilePanel({
  onNavigate,
  onClose,
}: {
  onNavigate: (section: string, sub?: string) => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [status, setStatus] = useState("online");
  const [profile, setProfile] = useState<{ firstName?: string; lastName?: string; email?: string } | null>(null);
  const { isAdmin } = useSubscription();
  const routerNavigate = useNavigate();

  useEffect(() => {
    getCurrentUser().then((authUser) => {
      if (authUser) {
        const [firstName, ...rest] = (authUser.full_name ?? "").split(/\s+/);
        setProfile({ firstName, lastName: rest.join(" "), email: authUser.email });
      } else {
        api.getSettings("profile").then(setProfile).catch(() => {});
      }
    });
  }, []);

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "—";
  const initials = `${profile?.firstName?.[0] ?? ""}${profile?.lastName?.[0] ?? ""}` || "·";

  return (
    <div className="w-60 bg-[#1a1a1a] border border-neutral-800 rounded-xl shadow-2xl overflow-hidden font-['Lexend:Regular',_sans-serif]">
      {/* User card */}
      <div className="flex items-center gap-3 px-3 py-3 border-b border-neutral-800/60">
        <div className="w-9 h-9 rounded-full bg-indigo-900/60 flex items-center justify-center text-indigo-300 text-[13px] font-['Lexend:SemiBold',_sans-serif] shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-neutral-50 text-[13px] truncate">{fullName}</div>
          <div className="text-neutral-500 text-[11px] truncate">{profile?.email ?? ""}</div>
        </div>
      </div>

      {/* Status selector */}
      <div className="px-2 py-2 border-b border-neutral-800/60">
        <div className="text-neutral-600 text-[10px] uppercase tracking-wider px-2 mb-1.5">{t("sidebar.status")}</div>
        {profileStatuses.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[12px] transition-colors text-left ${
              status === s.value
                ? "bg-neutral-800 text-neutral-50"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
            }`}
          >
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            {t(`sidebar.${s.labelKey}`)}
            {status === s.value && (
              <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
            )}
          </button>
        ))}
      </div>

      {/* Quick actions */}
      <div className="px-2 py-2 border-b border-neutral-800/60 space-y-0.5">
        <button
          onClick={() => { onNavigate("profile"); onClose(); }}
          className="w-full text-left px-2 py-1.5 text-[12px] text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50 rounded-lg transition-colors"
        >
          {t("sidebar.editProfile")}
        </button>
        <button
          onClick={() => { onNavigate("billing"); onClose(); }}
          className="w-full text-left px-2 py-1.5 text-[12px] text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50 rounded-lg transition-colors"
        >
          {t("sidebar.billingPlanText")}
        </button>
        <button
          onClick={() => { onNavigate("settings", "notifications"); onClose(); }}
          className="w-full text-left px-2 py-1.5 text-[12px] text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50 rounded-lg transition-colors"
        >
          {t("sidebar.notificationPreferences")}
        </button>
        <button
          onClick={() => { onNavigate("settings"); onClose(); }}
          className="w-full text-left px-2 py-1.5 text-[12px] text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50 rounded-lg transition-colors"
        >
          {t("sidebar.settings")}
        </button>
        {isAdmin && (
          <button
            onClick={() => { routerNavigate("/admin"); onClose(); }}
            className="w-full text-left px-2 py-1.5 text-[12px] text-indigo-300 hover:text-indigo-200 hover:bg-indigo-950/40 rounded-lg transition-colors"
          >
            {t("sidebar.founderPanel")}
          </button>
        )}
      </div>

      {/* Sign out */}
      <div className="px-2 py-2">
        <button
          onClick={async () => {
            await signOut();
            toast.success(t("sidebar.signedOutSuccessfully"));
            onClose();
          }}
          className="w-full text-left px-2 py-1.5 text-[12px] text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded-lg transition-colors"
        >
          {t("sidebar.signOut")}
        </button>
      </div>
    </div>
  );
}

function SearchContainer({
  isCollapsed = false,
}: {
  isCollapsed?: boolean;
}) {
  const { t } = useLang();
  const [searchValue, setSearchValue] = useState("");

  return (
    <div
      className={`relative shrink-0 transition-all duration-500 ${
        isCollapsed ? "w-full flex justify-center" : "w-full"
      }`}
      style={{ transitionTimingFunction: softSpringEasing }}
      data-name="Search Container"
    >
      <div
        className={`bg-[#000000] h-10 relative rounded-lg flex items-center transition-all duration-500 ${
          isCollapsed
            ? "w-10 min-w-10 justify-center"
            : "w-full"
        }`}
        style={{ transitionTimingFunction: softSpringEasing }}
      >
        <div
          className={`flex items-center justify-center shrink-0 transition-all duration-500 ${
            isCollapsed ? "p-1" : "px-1"
          }`}
          style={{ transitionTimingFunction: softSpringEasing }}
        >
          <div className="size-8 flex items-center justify-center">
            <Search size={16} className="text-neutral-50" />
          </div>
        </div>
        <div
          className={`flex-1 min-h-px min-w-px relative transition-opacity duration-500 overflow-hidden ${
            isCollapsed ? "opacity-0 w-0" : "opacity-100"
          }`}
          style={{ transitionTimingFunction: softSpringEasing }}
        >
          <div className="flex flex-col justify-center relative size-full">
            <div className="box-border content-stretch flex flex-col gap-2 items-start justify-center pl-0 pr-2 py-1 relative w-full">
              <input
                type="text"
                placeholder={t("sidebar.searchTasksProjects")}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="w-full bg-transparent border-none outline-none font-['Lexend:Regular',_sans-serif] font-normal text-[14px] text-neutral-50 placeholder:text-neutral-400 leading-[20px]"
                tabIndex={isCollapsed ? -1 : 0}
              />
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="absolute border border-neutral-800 border-solid inset-0 pointer-events-none rounded-lg"
        />
      </div>
    </div>
  );
}

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  subId?: string;
  hasDropdown?: boolean;
  isActive?: boolean;
  /** Role required to see this item. If undefined, visible to all. */
  requiredRole?: api.WorkspaceRole[];
  children?: (MenuItem & { subId?: string; requiredRole?: api.WorkspaceRole[] })[];
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

interface SidebarContent {
  title: string;
  sections: MenuSection[];
}

function MenuItem({
  item,
  isExpanded,
  onToggle,
  onItemClick,
  isCollapsed,
}: {
  item: MenuItem;
  isExpanded?: boolean;
  onToggle?: () => void;
  onItemClick?: (subId: string) => void;
  isCollapsed?: boolean;
}) {
  const handleClick = () => {
    if (item.hasDropdown && onToggle) {
      onToggle();
    }
    if (onItemClick && item.subId) {
      onItemClick(item.subId);
    }
  };

  return (
    <div
      className={`relative shrink-0 transition-all duration-500 ${
        isCollapsed ? "w-full flex justify-center" : "w-full"
      }`}
      style={{ transitionTimingFunction: softSpringEasing }}
    >
      <div
        className={`select-none rounded-lg cursor-pointer transition-all duration-500 flex items-center relative my-0.5 ${
          item.isActive
            ? "bg-neutral-900"
            : "hover:bg-neutral-900"
        } ${
          isCollapsed
            ? "w-10 min-w-10 h-10 justify-center p-4"
            : "w-full h-10 px-4 py-2"
        }`}
        style={{ transitionTimingFunction: softSpringEasing }}
        onClick={handleClick}
        title={isCollapsed ? item.label : undefined}
      >
        <div className="flex items-center justify-center shrink-0">
          {item.icon}
        </div>
        <div
          className={`flex-1 min-h-px min-w-px relative transition-opacity duration-500 overflow-hidden ${
            isCollapsed ? "opacity-0 w-0" : "opacity-100 ml-3"
          }`}
          style={{ transitionTimingFunction: softSpringEasing }}
        >
          <div className="flex flex-col justify-center relative size-full">
            <div className="font-['Lexend:Regular',_sans-serif] font-normal text-[14px] text-neutral-50 leading-[20px] truncate">
              {item.label}
            </div>
          </div>
        </div>
        {item.hasDropdown && (
          <div
            className={`flex items-center justify-center shrink-0 transition-opacity duration-500 ${
              isCollapsed ? "opacity-0 w-0" : "opacity-100 ml-2"
            }`}
            style={{
              transitionTimingFunction: softSpringEasing,
            }}
          >
            <ChevronDown
              size={16}
              className={`text-neutral-50 transition-transform duration-500`}
              style={{
                transitionTimingFunction: softSpringEasing,
                transform: isExpanded
                  ? "rotate(180deg)"
                  : "rotate(0deg)",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SubMenuItem({
  item,
  onItemClick,
}: {
  item: MenuItem & { subId?: string };
  onItemClick?: (subId: string) => void;
}) {
  return (
    <div className="select-none w-full pl-9 pr-1 py-[1px]">
      <div
        className="h-10 w-full rounded-lg cursor-pointer transition-colors hover:bg-neutral-900 flex items-center px-3 py-1"
        onClick={() => item.subId && onItemClick?.(item.subId)}
      >
        <div className="flex-1 min-w-0">
          <div className="font-['Lexend:Regular',_sans-serif] font-normal text-[14px] text-neutral-300 leading-[18px] truncate">
            {item.label}
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuSection({
  section,
  expandedItems,
  onToggleExpanded,
  isCollapsed,
  onItemClick,
  role,
}: {
  section: MenuSection;
  expandedItems: Set<string>;
  onToggleExpanded: (itemKey: string) => void;
  isCollapsed?: boolean;
  onItemClick?: (subId: string) => void;
  role: api.WorkspaceRole;
}) {
  const visibleItems = section.items.filter(
    (item) => !item.requiredRole || item.requiredRole.includes(role),
  );
  return (
    <div className="box-border content-stretch flex flex-col items-start justify-stretch p-0 relative shrink-0 w-full">
      <div
        className={`relative shrink-0 w-full transition-all duration-500 overflow-hidden ${
          isCollapsed ? "h-0 opacity-0" : "h-10 opacity-100"
        }`}
        style={{ transitionTimingFunction: softSpringEasing }}
      >
        <div className="flex flex-col justify-center relative size-full">
          <div className="box-border content-stretch flex flex-col h-10 items-start justify-center p-[16px] relative w-full">
            <div className="font-['Lexend:Regular',_sans-serif] font-normal leading-[0] relative shrink-0 text-[14px] text-left text-neutral-400 text-nowrap">
              <p className="block leading-[20px] whitespace-pre">
                {section.title}
              </p>
            </div>
          </div>
        </div>
      </div>
      {visibleItems.map((item, index) => {
        const itemKey = `${section.title}-${index}`;
        const isExpanded = expandedItems.has(itemKey);
        const visibleChildren = item.children?.filter(
          (child) => !child.requiredRole || child.requiredRole.includes(role),
        );
        return (
          <div
            key={itemKey}
            className="w-full flex flex-col content-stretch"
          >
            <MenuItem
              item={item}
              isExpanded={isExpanded}
              onToggle={() => onToggleExpanded(itemKey)}
              onItemClick={onItemClick}
              isCollapsed={isCollapsed}
            />
            {isExpanded && visibleChildren && visibleChildren.length > 0 && !isCollapsed && (
              <div className="flex flex-col gap-1 mb-2">
                {visibleChildren.map((child, childIndex) => (
                  <SubMenuItem
                    key={`${itemKey}-${childIndex}`}
                    item={child}
                    onItemClick={onItemClick}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Slug used by team nav links (must match TeamsPage's teamSlug)
const teamSlug = (name: string) =>
  name.toLowerCase().startsWith("quality") ? "qa" : name.split(" ")[0].toLowerCase();

// Slug used by event/file nav links (must match CalendarPage's and FilesPage's slugify)
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function getSidebarContent(
  t: (path: string) => string,
  activeSection: string,
  teams: api.Team[] = [],
  tasks: api.Task[] = [],
  todayEvents: { title: string; tag: string }[] = [],
  recentFiles: api.FileItem[] = [],
  role: api.WorkspaceRole = "owner",
): SidebarContent {
  const taskChild = (t: api.Task) => ({ label: t.title, subId: `task-${t.id}`, icon: null });
  const todayShort = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dueTodayChildren = tasks.filter((t) => !t.completed && t.due === todayShort).slice(0, 4).map(taskChild);
  const inProgressChildren = tasks.filter((t) => t.status === "in-progress").slice(0, 4).map(taskChild);
  const completedChildren = tasks.filter((t) => t.completed || t.status === "completed").slice(0, 4).map(taskChild);
  const priorityChildren = tasks.filter((t) => t.priority === "high" && !t.completed).slice(0, 4).map(taskChild);
  const eventChildren = todayEvents.map((ev) => ({
    label: ev.tag && ev.tag !== "All day" ? `${ev.title} (${ev.tag})` : ev.title,
    subId: `event-${slugify(ev.title)}`,
    icon: null,
  }));
  const fileChildren = recentFiles.map((f) => ({
    label: f.name,
    subId: `file-${slugify(f.name)}`,
    icon: null,
  }));

  const teamNavItems = teams.map((t) => ({
    icon: <Group size={16} className="text-neutral-50" />,
    label: t.name,
    subId: teamSlug(t.name),
    hasDropdown: true,
    children: t.members.map((m) => ({
      label: m.role.toLowerCase().includes("lead") ? `${m.name} (Lead)` : m.name,
      subId: `member-${m.initials.toLowerCase()}`,
      icon: null,
    })),
  }));

  const contentMap: Record<string, SidebarContent> = {
    dashboard: {
      title: t("sidebar.dashboard"),
      sections: [
        {
          title: t("sidebar.dashboardTypes"),
          items: [
            {
              icon: <View size={16} className="text-neutral-50" />,
              label: t("sidebar.overview"),
              subId: "overview",
              isActive: true,
            },
            {
              icon: <Dashboard size={16} className="text-neutral-50" />,
              label: t("sidebar.executiveSummary"),
              subId: "executive-summary",
              hasDropdown: true,
              children: [
                { label: t("sidebar.revenueOverview"), subId: "exec-revenue", icon: null },
                { label: t("sidebar.keyPerformanceIndicators"), subId: "exec-kpis", icon: null },
                { label: t("sidebar.strategicGoalsProgress"), subId: "exec-goals", icon: null },
                { label: t("sidebar.departmentHighlights"), subId: "exec-departments", icon: null },
              ],
            },
            {
              icon: <ChartBar size={16} className="text-neutral-50" />,
              label: t("sidebar.operationsDashboard"),
              subId: "operations",
              hasDropdown: true,
              children: [
                { label: t("sidebar.projectTimeline"), subId: "ops-timeline", icon: null },
                { label: t("sidebar.resourceAllocation"), subId: "ops-resources", icon: null },
                { label: t("sidebar.teamPerformance"), subId: "ops-performance", icon: null },
                { label: t("sidebar.capacityPlanning"), subId: "ops-capacity", icon: null },
              ],
            },
            {
              icon: <Analytics size={16} className="text-neutral-50" />,
              label: t("sidebar.financialDashboard"),
              subId: "financial",
              hasDropdown: true,
              children: [
                { label: t("sidebar.budgetVsActual"), subId: "fin-budget", icon: null },
                { label: t("sidebar.cashFlowAnalysis"), subId: "fin-cashflow", icon: null },
                { label: t("sidebar.expenseBreakdown"), subId: "fin-expense", icon: null },
                { label: t("sidebar.profitLossSummary"), subId: "fin-pl", icon: null },
              ],
            },
          ],
        },
        {
          title: t("sidebar.reportSummaries"),
          items: [
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: t("sidebar.weeklyReports"),
              subId: "weekly",
              hasDropdown: true,
              children: [
                { label: t("sidebar.teamProductivity"), subId: "weekly-productivity", icon: null },
                { label: t("sidebar.projectCompletion"), subId: "weekly-completion", icon: null },
                { label: t("sidebar.budgetUtilization"), subId: "weekly-budget", icon: null },
                { label: t("sidebar.clientSatisfaction"), subId: "weekly-satisfaction", icon: null },
              ],
            },
            {
              icon: <StarFilled size={16} className="text-neutral-50" />,
              label: t("sidebar.monthlyInsights"),
              subId: "monthly",
              hasDropdown: true,
              children: [
                { label: t("sidebar.revenueGrowth"), subId: "monthly-revenue", icon: null },
                { label: t("sidebar.newClients"), subId: "monthly-clients", icon: null },
                { label: t("sidebar.teamExpansion"), subId: "monthly-expansion", icon: null },
                { label: t("sidebar.costReduction"), subId: "monthly-cost", icon: null },
              ],
            },
            {
              icon: <View size={16} className="text-neutral-50" />,
              label: t("sidebar.quarterlyAnalysis"),
              subId: "quarterly",
              hasDropdown: true,
              children: [
                { label: t("sidebar.marketPosition"), subId: "quarterly-market", icon: null },
                { label: t("sidebar.roi"), subId: "quarterly-roi", icon: null },
                { label: t("sidebar.customerRetention"), subId: "quarterly-retention", icon: null },
                { label: t("sidebar.innovationIndex"), subId: "quarterly-innovation", icon: null },
              ],
            },
          ],
        },
        {
          title: t("sidebar.businessIntelligence"),
          items: [
            {
              icon: <ChartBar size={16} className="text-neutral-50" />,
              label: t("sidebar.performanceMetrics"),
              subId: "performance-metrics",
              hasDropdown: true,
              children: [
                { label: t("sidebar.salesConversion"), subId: "perf-sales", icon: null },
                { label: t("sidebar.leadResponseTime"), subId: "perf-response", icon: null },
                { label: t("sidebar.customerLifetimeValue"), subId: "perf-clv", icon: null },
                { label: t("sidebar.churnRate"), subId: "perf-churn", icon: null },
              ],
            },
            {
              icon: <Analytics size={16} className="text-neutral-50" />,
              label: t("sidebar.predictiveAnalytics"),
              subId: "predictive",
              hasDropdown: true,
              children: [
                { label: t("sidebar.q4RevenueForecast"), subId: "pred-forecast", icon: null },
                { label: t("sidebar.resourceDemand"), subId: "pred-resources", icon: null },
                { label: t("sidebar.marketTrends"), subId: "pred-trends", icon: null },
                { label: t("sidebar.riskAssessment"), subId: "pred-risks", icon: null },
              ],
            },
          ],
        },
      ],
    },
    tasks: {
      title: t("sidebar.tasks"),
      sections: [
        {
          title: t("sidebar.quickActions"),
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: t("sidebar.newTask"),
              subId: "new-task",
            },
            {
              icon: <Filter size={16} className="text-neutral-50" />,
              label: t("sidebar.filterTasks"),
              subId: "filter",
            },
          ],
        },
        {
          title: t("sidebar.myTasksSection"),
          items: [
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: t("sidebar.dueToday"),
              subId: "today",
              hasDropdown: true,
              children: dueTodayChildren,
            },
            {
              icon: <InProgress size={16} className="text-neutral-50" />,
              label: t("sidebar.inProgress"),
              subId: "in-progress",
              hasDropdown: true,
              children: inProgressChildren,
            },
            {
              icon: <CheckmarkOutline size={16} className="text-neutral-50" />,
              label: t("sidebar.completed"),
              subId: "completed",
              hasDropdown: true,
              children: completedChildren,
            },
          ],
        },
        {
          title: t("sidebar.other"),
          items: [
            {
              icon: <Flag size={16} className="text-neutral-50" />,
              label: t("sidebar.priorityTasks"),
              subId: "priority",
              hasDropdown: true,
              children: priorityChildren,
            },
            {
              icon: <Archive size={16} className="text-neutral-50" />,
              label: t("sidebar.archived"),
              subId: "all",
            },
          ],
        },
      ],
    },
    projects: {
      title: t("sidebar.projects"),
      sections: [
        {
          title: t("sidebar.quickActions"),
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: t("sidebar.newProject"),
              subId: "new-project",
            },
            {
              icon: <Filter size={16} className="text-neutral-50" />,
              label: t("sidebar.filterProjects"),
              subId: "all",
            },
          ],
        },
        {
          title: t("sidebar.activeProjectsSection"),
          items: [
            {
              icon: <FolderOpen size={16} className="text-neutral-50" />,
              label: t("sidebar.webApplication"),
              subId: "web-application",
              hasDropdown: true,
              children: [
                { label: t("sidebar.frontendDevelopment"), subId: "proj-web-frontend", icon: null },
                { label: t("sidebar.apiIntegration"), subId: "proj-web-api", icon: null },
                { label: t("sidebar.testingQa"), subId: "proj-web-qa", icon: null },
              ],
            },
            {
              icon: <FolderOpen size={16} className="text-neutral-50" />,
              label: t("sidebar.mobileApp"),
              subId: "mobile-app",
              hasDropdown: true,
              children: [
                { label: t("sidebar.uiUxDesign"), subId: "proj-mobile-design", icon: null },
                { label: t("sidebar.nativeDevelopment"), subId: "proj-mobile-native", icon: null },
              ],
            },
          ],
        },
        {
          title: t("sidebar.other"),
          items: [
            {
              icon: <CheckmarkOutline size={16} className="text-neutral-50" />,
              label: t("sidebar.projCompleted"),
              subId: "proj-completed",
            },
            {
              icon: <Archive size={16} className="text-neutral-50" />,
              label: t("sidebar.projArchived"),
              subId: "proj-archived",
            },
          ],
        },
      ],
    },
    calendar: {
      title: t("sidebar.calendar"),
      sections: [
        {
          title: t("sidebar.views"),
          items: [
            {
              icon: <View size={16} className="text-neutral-50" />,
              label: t("sidebar.monthView"),
              subId: "month",
            },
            {
              icon: <CalendarIcon size={16} className="text-neutral-50" />,
              label: t("sidebar.weekView"),
              subId: "week",
            },
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: t("sidebar.dayView"),
              subId: "day",
            },
          ],
        },
        {
          title: t("sidebar.events"),
          items: [
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: t("sidebar.todaysEvents"),
              subId: "today",
              hasDropdown: true,
              children: eventChildren,
            },
            {
              icon: <CalendarIcon size={16} className="text-neutral-50" />,
              label: t("sidebar.upcomingEvents"),
              subId: "upcoming",
            },
          ],
        },
        {
          title: t("sidebar.quickActionsCalendar"),
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: t("sidebar.newEvent"),
              subId: "new-event",
            },
            {
              icon: <Share size={16} className="text-neutral-50" />,
              label: t("sidebar.shareCalendar"),
              subId: "share-calendar",
            },
          ],
        },
      ],
    },
    teams: {
      title: t("sidebar.teams"),
      sections: [
        {
          title: t("sidebar.myTeams"),
          items: teamNavItems,
        },
        {
          title: t("sidebar.quickActionsTeams"),
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: t("sidebar.inviteMember"),
              subId: "invite",
            },
            {
              icon: <UserMultiple size={16} className="text-neutral-50" />,
              label: t("sidebar.manageTeams"),
              subId: "manage",
            },
          ],
        },
      ],
    },
    analytics: {
      title: t("sidebar.analytics"),
      sections: [
        {
          title: t("sidebar.reports"),
          items: [
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: t("sidebar.performanceReport"),
              subId: "performance",
              requiredRole: ["owner"],
            },
            {
              icon: <ChartBar size={16} className="text-neutral-50" />,
              label: t("sidebar.taskCompletionAnalytics"),
              subId: "task-completion",
              requiredRole: ["owner"],
            },
            {
              icon: <Analytics size={16} className="text-neutral-50" />,
              label: t("sidebar.teamProductivityAnalytics"),
              subId: "productivity",
              requiredRole: ["owner"],
            },
          ],
        },
        {
          title: t("sidebar.insights"),
          items: [
            {
              icon: <StarFilled size={16} className="text-neutral-50" />,
              label: t("sidebar.keyMetrics"),
              subId: "key-metrics",
              hasDropdown: true,
              requiredRole: ["owner"],
              children: [
                { label: t("sidebar.taskCompletionMetrics"), subId: "analytics-task-metrics", icon: null, requiredRole: ["owner"] },
                { label: t("sidebar.timeTrackingAnalysis"), subId: "analytics-time-tracking", icon: null, requiredRole: ["owner"] },
                { label: t("sidebar.teamEfficiencyReport"), subId: "analytics-team-efficiency", icon: null, requiredRole: ["owner"] },
                { label: t("sidebar.performanceBenchmarks"), subId: "analytics-benchmarks", icon: null, requiredRole: ["owner"] },
              ],
            },
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: t("sidebar.topPerformers"),
              subId: "top-performers",
              requiredRole: ["owner"],
            },
          ],
        },
      ],
    },
    billing: {
      title: t("sidebar.billing"),
      sections: [
        {
          title: t("sidebar.subscription"),
          items: [
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: t("sidebar.planSubscription"),
              subId: "plan",
              requiredRole: ["owner"],
            },
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: t("sidebar.paymentHistory"),
              subId: "history",
              requiredRole: ["owner"],
            },
          ],
        },
        {
          title: t("sidebar.insights"),
          items: [
            {
              icon: <StarFilled size={16} className="text-neutral-50" />,
              label: t("sidebar.keyMetrics"),
              subId: "key-metrics",
              hasDropdown: true,
              children: [
                { label: t("sidebar.taskCompletionMetrics"), subId: "analytics-task-metrics", icon: null },
                { label: t("sidebar.timeTrackingAnalysis"), subId: "analytics-time-tracking", icon: null },
                { label: t("sidebar.teamEfficiencyReport"), subId: "analytics-team-efficiency", icon: null },
                { label: t("sidebar.performanceBenchmarks"), subId: "analytics-benchmarks", icon: null },
              ],
            },
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: t("sidebar.topPerformers"),
              subId: "top-performers",
            },
          ],
        },
      ],
    },
    files: {
      title: t("sidebar.files"),
      sections: [
        {
          title: t("sidebar.quickActionsFiles"),
          items: [
            {
              icon: <CloudUpload size={16} className="text-neutral-50" />,
              label: t("sidebar.uploadFile"),
              subId: "upload",
            },
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: t("sidebar.newFolder"),
              subId: "new-folder",
            },
          ],
        },
        {
          title: t("sidebar.browse"),
          items: [
            {
              icon: <DocumentAdd size={16} className="text-neutral-50" />,
              label: t("sidebar.recentDocuments"),
              subId: "recent",
              hasDropdown: true,
              children: fileChildren,
            },
            {
              icon: <Share size={16} className="text-neutral-50" />,
              label: t("sidebar.sharedWithMe"),
              subId: "shared",
            },
            {
              icon: <Folder size={16} className="text-neutral-50" />,
              label: t("sidebar.allFolders"),
              subId: "folders",
            },
            {
              icon: <Archive size={16} className="text-neutral-50" />,
              label: t("sidebar.archivedFiles"),
              subId: "archived",
            },
          ],
        },
      ],
    },
    profile: {
      title: t("sidebar.myProfile"),
      sections: [
        {
          title: t("sidebar.account"),
          items: [
            {
              icon: <User size={16} className="text-neutral-50" />,
              label: t("sidebar.profileDetails"),
              subId: "details",
            },
            {
              icon: <Security size={16} className="text-neutral-50" />,
              label: t("sidebar.security"),
              subId: "security",
            },
          ],
        },
      ],
    },
    settings: {
      title: t("sidebar.settings"),
      sections: [
        {
          title: t("sidebar.accountSettings"),
          items: [
            {
              icon: <User size={16} className="text-neutral-50" />,
              label: t("sidebar.profileSettings"),
              subId: "profile",
            },
            {
              icon: <Security size={16} className="text-neutral-50" />,
              label: t("sidebar.security"),
              subId: "security",
            },
            {
              icon: <Notification size={16} className="text-neutral-50" />,
              label: t("sidebar.notifications"),
              subId: "notifications",
            },
          ],
        },
        {
          title: t("sidebar.workspace"),
          items: (role === "member"
            ? [
                {
                  icon: <Settings size={16} className="text-neutral-50" />,
                  label: t("sidebar.preferences"),
                  subId: "workspace",
                  hasDropdown: true,
                  children: [
                    { label: t("sidebar.themeAppearance"), subId: "settings-theme", icon: null },
                    { label: t("sidebar.timezoneDate"), subId: "settings-timezone", icon: null },
                  ],
                },
              ]
            : [
                {
                  icon: <Settings size={16} className="text-neutral-50" />,
                  label: t("sidebar.preferences"),
                  subId: "workspace",
                  hasDropdown: true,
                  children: [
                    { label: t("sidebar.themeAppearance"), subId: "settings-theme", icon: null },
                    { label: t("sidebar.timezoneDate"), subId: "settings-timezone", icon: null },
                    { label: t("sidebar.defaultNotifications"), subId: "settings-notif-defaults", icon: null },
                  ],
                },
                {
                  icon: <UserMultiple size={16} className="text-neutral-50" />,
                  label: t("sidebar.membersPermissions"),
                  subId: "settings-members",
                  requiredRole: ["owner"],
                },
                {
                  icon: <Report size={16} className="text-neutral-50" />,
                  label: t("sidebar.billingPlan"),
                  subId: "settings-billing",
                  requiredRole: ["owner"],
                },
                {
                  icon: <Integration size={16} className="text-neutral-50" />,
                  label: t("sidebar.integrations"),
                  subId: "integrations",
                  requiredRole: ["owner"],
                },
              ]),
        },
        ...(role === "owner"
          ? [{
              title: t("sidebar.advanced"),
              items: [
                {
                  icon: <ChartBar size={16} className="text-neutral-50" />,
                  label: t("sidebar.apiWebhooks"),
                  subId: "settings-api",
                },
                {
                  icon: <View size={16} className="text-neutral-50" />,
                  label: t("sidebar.auditLog"),
                  subId: "settings-audit",
                },
                {
                  icon: <Archive size={16} className="text-neutral-50" />,
                  label: t("sidebar.dataExport"),
                  subId: "settings-data",
                },
                {
                  icon: <Flag size={16} className="text-neutral-50" />,
                  label: t("sidebar.dangerZone"),
                  subId: "settings-danger",
                },
              ],
            }]
          : []),
      ],
    },
  };

  return contentMap[activeSection] || contentMap.tasks;
}

function IconNavButton({
  children,
  isActive = false,
  onClick,
}: {
  children: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`box-border content-stretch flex flex-row items-center justify-center overflow-clip p-0 relative rounded-lg shrink-0 size-10 min-w-10 cursor-pointer transition-colors duration-500
        ${
          isActive
            ? "bg-neutral-800 text-neutral-50"
            : "hover:bg-neutral-900 text-neutral-400 hover:text-neutral-300"
        }`}
      style={{ transitionTimingFunction: softSpringEasing }}
      data-name="Icon Nav Button"
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function IconNavigation({
  activeSection,
  onSectionChange,
  onAvatarClick,
  showProfile,
}: {
  activeSection: string;
  onSectionChange: (section: string) => void;
  onAvatarClick: () => void;
  showProfile: boolean;
}) {
  const { t } = useLang();

  const navItems = [
    {
      id: "dashboard",
      icon: <Dashboard size={16} />,
      label: t("sidebar.dashboard"),
    },
    { id: "tasks", icon: <Task size={16} />, label: t("sidebar.tasks") },
    {
      id: "projects",
      icon: <Folder size={16} />,
      label: t("sidebar.projects"),
    },
    {
      id: "calendar",
      icon: <Calendar size={16} />,
      label: t("sidebar.calendar"),
    },
    {
      id: "teams",
      icon: <UserMultiple size={16} />,
      label: t("sidebar.teams"),
    },
    {
      id: "analytics",
      icon: <Analytics size={16} />,
      label: t("sidebar.analytics"),
    },
    {
      id: "files",
      icon: <DocumentAdd size={16} />,
      label: t("sidebar.files"),
    },
  ];

  return (
    <div
      className="bg-[#000000] box-border content-stretch flex flex-col gap-2 h-full items-center justify-start overflow-clip p-4 relative shrink-0 w-16 border-r border-neutral-800"
      data-name="Icon Navigation"
    >
      {/* Logo */}
      <div className="mb-2 size-10 flex items-center justify-center">
        <div className="size-7">
          <img src="/lokasynclogo.png" alt="LokaSync" className="w-full h-full object-contain" />
        </div>
      </div>

      {/* Navigation Icons */}
      <div className="flex flex-col gap-2 w-full items-center">
        {navItems.map((item) => (
          <IconNavButton
            key={item.id}
            isActive={activeSection === item.id}
            onClick={() => onSectionChange(item.id)}
          >
            {item.icon}
          </IconNavButton>
        ))}
      </div>

      {/* Bottom section */}
      <div className="flex-1" />
      <div className="flex flex-col gap-2 w-full items-center">
        <IconNavButton
          isActive={activeSection === "settings"}
          onClick={() => onSectionChange("settings")}
        >
          <Settings size={16} />
        </IconNavButton>
        <button
          onClick={onAvatarClick}
          className={`size-8 rounded-full transition-all hover:ring-2 hover:ring-indigo-500/40 ${showProfile ? "ring-2 ring-indigo-500/60" : ""}`}
          title="Profile"
        >
          <Avatar />
        </button>
      </div>
    </div>
  );
}

function SectionTitle({
  title,
  onToggleCollapse,
  isCollapsed,
}: {
  title: string;
  onToggleCollapse: () => void;
  isCollapsed: boolean;
}) {
  if (isCollapsed) {
    return (
      <div
        className="relative shrink-0 w-full flex justify-center transition-all duration-500"
        style={{ transitionTimingFunction: softSpringEasing }}
        data-name="Section Title Collapsed"
      >
        <button
          onClick={onToggleCollapse}
          className="box-border content-stretch flex flex-row items-center justify-center overflow-clip p-0 relative rounded-lg shrink-0 cursor-pointer transition-all duration-500 hover:bg-neutral-900 text-neutral-400 hover:text-neutral-300 size-10 min-w-10"
          style={{ transitionTimingFunction: softSpringEasing }}
        >
          <ChevronLeft
            size={16}
            className="transition-transform duration-500"
            style={{
              transitionTimingFunction: softSpringEasing,
              transform: "rotate(180deg)",
            }}
          />
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 w-full overflow-hidden transition-all duration-500"
      style={{ transitionTimingFunction: softSpringEasing }}
      data-name="Section Title"
    >
      <div className="flex flex-row items-center justify-between relative size-full">
        <div
          className="box-border content-stretch flex flex-row items-center justify-start relative h-10 overflow-hidden transition-opacity opacity-100 duration-500"
          style={{ transitionTimingFunction: softSpringEasing }}
        >
          <div className="box-border content-stretch flex flex-col gap-2 items-start justify-center px-2 py-1 relative shrink-0">
            <div className="font-['Lexend:SemiBold',_sans-serif] font-semibold leading-[0] relative shrink-0 text-[18px] text-left text-neutral-50 text-nowrap">
              <p className="block leading-[27px] whitespace-pre">
                {title}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center pr-1">
          <button
            onClick={onToggleCollapse}
            className="box-border content-stretch flex flex-row items-center justify-center overflow-clip p-0 relative rounded-lg shrink-0 cursor-pointer transition-all duration-500 hover:bg-neutral-900 text-neutral-400 hover:text-neutral-300 size-10 min-w-10"
            style={{
              transitionTimingFunction: softSpringEasing,
            }}
          >
            <ChevronLeft
              size={16}
              className="transition-transform duration-500"
              style={{
                transitionTimingFunction: softSpringEasing,
              }}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailSidebar({
  activeSection,
}: {
  activeSection: string;
}) {
  const { navigate } = useNavigation();
  const { t } = useLang();
  const { activeWorkspace } = useWorkspace();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [teams, setTeams] = useState<api.Team[]>([]);
  const [tasks, setTasks] = useState<api.Task[]>([]);
  const [todayEvents, setTodayEvents] = useState<{ title: string; tag: string }[]>([]);
  const [recentFiles, setRecentFiles] = useState<api.FileItem[]>([]);

  useEffect(() => {
    api.getTeams().then(setTeams).catch(() => {});
    api.getTasks().then(setTasks).catch(() => {});
    api.getCalendarEvents().then((evts) => {
      const now = new Date();
      const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      setTodayEvents(evts[key] ?? []);
    }).catch(() => {});
    api.getFiles().then(({ files }) => setRecentFiles(files.filter((f) => !f.archived).slice(0, 3))).catch(() => {});
  }, []);

  const role = activeWorkspace?.role ?? "member";
  const content = getSidebarContent(t, activeSection, teams, tasks, todayEvents, recentFiles, role);

  const toggleExpanded = (itemKey: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemKey)) {
      newExpanded.delete(itemKey);
    } else {
      newExpanded.add(itemKey);
    }
    setExpandedItems(newExpanded);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleItemClick = (subId: string) => {
    navigate(activeSection, subId);
  };

  return (
    <div
      className={`bg-[#000000] box-border content-stretch flex flex-col gap-4 h-full items-start justify-start overflow-hidden p-4 relative border-r border-neutral-800 shrink-0 transition-all duration-500 ${
        isCollapsed
          ? "w-16 min-w-16 !px-0 justify-center"
          : "w-80"
      }`}
      style={{ transitionTimingFunction: softSpringEasing }}
      data-name="Detail Sidebar"
    >
      <SectionTitle
        title={content.title}
        onToggleCollapse={toggleCollapse}
        isCollapsed={isCollapsed}
      />
      <WorkspaceSwitcher isCollapsed={isCollapsed} />
      <SearchContainer isCollapsed={isCollapsed} />

      <div
        className={`basis-0 box-border content-stretch flex flex-col grow min-h-px min-w-10 p-0 relative shrink-0 w-full overflow-y-auto transition-all duration-500 ${
          isCollapsed
            ? "gap-2 items-center justify-start"
            : "gap-4 items-start justify-start"
        }`}
        style={{ transitionTimingFunction: softSpringEasing }}
      >
        {content.sections.map((section, index) => (
          <MenuSection
            key={`${activeSection}-${index}`}
            section={section}
            expandedItems={expandedItems}
            onToggleExpanded={toggleExpanded}
            isCollapsed={isCollapsed}
            onItemClick={handleItemClick}
            role={role}
          />
        ))}
      </div>
    </div>
  );
}

function TwoLevelSidebar({
  activeSection,
  onSectionChange,
}: {
  activeSection: string;
  onSectionChange: (section: string) => void;
}) {
  const { navigate } = useNavigation();
  const [showProfile, setShowProfile] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    };
    if (showProfile) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProfile]);

  return (
    <div
      className="flex flex-row h-full shrink-0 relative"
      data-name="Two Level Sidebar"
      ref={profileRef}
    >
      <IconNavigation
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        onAvatarClick={() => setShowProfile((v) => !v)}
        showProfile={showProfile}
      />
      <div className="hidden md:block">
        <DetailSidebar activeSection={activeSection} />
      </div>
      {showProfile && (
        <div className="absolute bottom-16 left-16 z-50">
          <ProfilePanel
            onNavigate={(section, sub) => {
              onSectionChange(section);
              if (sub) navigate(section, sub);
            }}
            onClose={() => setShowProfile(false)}
          />
        </div>
      )}
    </div>
  );
}

export function Frame760({
  activeSection,
  onSectionChange,
}: {
  activeSection: string;
  onSectionChange: (section: string) => void;
}) {
  const { t } = useLang();
  return (
    <TwoLevelSidebar
      activeSection={activeSection}
      onSectionChange={onSectionChange}
    />
  );
}