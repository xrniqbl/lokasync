import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useNavigation } from "./NavigationContext";
import { useSubscription } from "../subscription/SubscriptionContext";
import * as api from "../utils/api";
import { signOut, getCurrentUser } from "../utils/supabase";
import { useLang } from "../LangContext";
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
  Chat,
  StarFilled,
  Group,
  Calendar as CalendarIcon,
  Home,
  ChartBar,
  FolderOpen,
  ChevronLeft,
  ChevronUp,
  Timer,
  Activity,
  CenterCircle,
  Document,
} from "@carbon/icons-react";

// Softer spring animation curve
const softSpringEasing = "cubic-bezier(0.25, 1.1, 0.4, 1)";

function LokaLogo() {
  return (
    <img
      src="/lokasynclogo.png"
      alt="LokaSync"
      className="size-7 object-contain"
      data-name="LokaSync Logo"
    />
  );
}

function Avatar() {
  return (
    <div
      className="bg-neutral-800 relative rounded-[999px] shrink-0 size-8"
      data-name="Avatar"
    >
      <div className="box-border content-stretch flex flex-row items-center justify-center overflow-clip p-0 relative size-8">
        <User size={16} className="text-neutral-300" />
      </div>
      <div
        aria-hidden="true"
        className="absolute border border-neutral-700 border-solid inset-0 pointer-events-none rounded-[999px]"
      />
    </div>
  );
}

const profileStatuses = [
  { value: "online",  labelKey: "sidebar.statusOnline",  color: "#10b981" },
  { value: "away",    labelKey: "sidebar.statusAway",    color: "#f59e0b" },
  { value: "dnd",     labelKey: "sidebar.statusDnd",     color: "#ef4444" },
  { value: "offline", labelKey: "sidebar.statusOffline", color: "#404040" },
];

function ProfilePanel({
  onNavigate,
  onClose,
}: {
  onNavigate: (section: string, sub?: string) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState("online");
  const [profile, setProfile] = useState<{ firstName?: string; lastName?: string; email?: string } | null>(null);
  const { isAdmin } = useSubscription();
  const routerNavigate = useNavigate();
  const { t } = useLang();

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
            {t(s.labelKey as any)}
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
          onClick={() => { onNavigate("authentication"); onClose(); }}
          className="w-full text-left px-2 py-1.5 text-[12px] text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50 rounded-lg transition-colors"
        >
          {t("nav.authentication")}
        </button>
        <button
          onClick={() => { onNavigate("billing"); onClose(); }}
          className="w-full text-left px-2 py-1.5 text-[12px] text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50 rounded-lg transition-colors"
        >
          {t("sidebar.billingPlan")}
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
            toast.success(t("sidebar.signedOut"));
            onClose();
            routerNavigate("/login", { replace: true });
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
  const [searchValue, setSearchValue] = useState("");
  const { t } = useLang();

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
                placeholder={t("sidebar.searchPlaceholder")}
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
  children?: (MenuItem & { subId?: string })[];
}

interface MenuSection {
  title: string;
  items: MenuItem[];
  subId?: string; // If set, section header becomes clickable and navigates to this subId
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
}: {
  section: MenuSection;
  expandedItems: Set<string>;
  onToggleExpanded: (itemKey: string) => void;
  isCollapsed?: boolean;
  onItemClick?: (subId: string) => void;
}) {
  const isClickable = !!section.subId;
  return (
    <div className="box-border content-stretch flex flex-col items-start justify-stretch p-0 relative shrink-0 w-full">
      <div
        className={`relative shrink-0 w-full transition-all duration-500 ${
          isCollapsed ? "h-0 opacity-0 overflow-hidden" : "h-10 opacity-100"
        } ${isClickable && !isCollapsed ? "cursor-pointer" : ""}`}
        style={{ transitionTimingFunction: softSpringEasing }}
        onClick={isClickable && !isCollapsed ? () => onItemClick?.(section.subId!) : undefined}
      >
        <div className="flex flex-col justify-center relative size-full">
          <div
            className={`box-border content-stretch flex flex-col h-10 items-start justify-center p-[16px] relative w-full ${
              isClickable && !isCollapsed ? "hover:bg-neutral-900 rounded-lg" : ""
            }`}
          >
            <div className={`font-['Lexend:SemiBold',_sans-serif] font-semibold leading-[0] relative shrink-0 text-[14px] text-left text-nowrap ${
              isClickable ? "text-neutral-200" : "text-neutral-400"
            }`}>
              <p className="block leading-[20px] whitespace-pre">
                {section.title}
              </p>
            </div>
          </div>
        </div>
      </div>
      {section.items.map((item, index) => {
        const itemKey = `${section.title}-${index}`;
        const isExpanded = expandedItems.has(itemKey);
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
            {isExpanded && item.children && !isCollapsed && (
              <div className="flex flex-col gap-1 mb-2">
                {item.children.map((child, childIndex) => (
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
  t: (k: any) => string,
  activeSection: string,
  teams: api.Team[] = [],
  tasks: api.Task[] = [],
  todayEvents: { title: string; tag: string }[] = [],
  recentFiles: api.FileItem[] = [],
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
      title: t("nav.dashboard"),
      sections: [
        {
          title: t("sidebar.sectionDashboardTypes"),
          items: [
            {
              icon: <View size={16} className="text-neutral-50" />,
              label: t("sidebar.itemOverview"),
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
          title: t("sidebar.sectionReportSummaries"),
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
          title: t("sidebar.sectionBusinessIntelligence"),
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
      title: t("nav.tasks"),
      sections: [
        {
          title: t("sidebar.sectionQuickActions"),
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: t("sidebar.itemNewTask"),
              subId: "new-task",
            },
            {
              icon: <Filter size={16} className="text-neutral-50" />,
              label: t("sidebar.itemFilterTasks"),
              subId: "filter",
            },
          ],
        },
        {
          title: t("sidebar.sectionMyTasks"),
          subId: "all",
          items: [
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: t("sidebar.itemDueToday"),
              subId: "today",
              hasDropdown: true,
              children: dueTodayChildren,
            },
            {
              icon: <InProgress size={16} className="text-neutral-50" />,
              label: t("sidebar.itemInProgress"),
              subId: "in-progress",
              hasDropdown: true,
              children: inProgressChildren,
            },
            {
              icon: <CheckmarkOutline size={16} className="text-neutral-50" />,
              label: t("sidebar.itemCompleted"),
              subId: "completed",
              hasDropdown: true,
              children: completedChildren,
            },
          ],
        },
        {
          title: t("sidebar.sectionOther"),
          items: [
            {
              icon: <Flag size={16} className="text-neutral-50" />,
              label: t("sidebar.itemPriorityTasks"),
              subId: "priority",
              hasDropdown: true,
              children: priorityChildren,
            },
            {
              icon: <Archive size={16} className="text-neutral-50" />,
              label: t("sidebar.itemArchived"),
              subId: "all",
            },
          ],
        },
      ],
    },
    projects: {
      title: t("nav.projects"),
      sections: [
        {
          title: t("sidebar.sectionQuickActions"),
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: t("sidebar.itemNewProject"),
              subId: "new-project",
            },
            {
              icon: <Filter size={16} className="text-neutral-50" />,
              label: t("sidebar.itemFilterProjects"),
              subId: "all",
            },
          ],
        },
        {
          title: t("sidebar.sectionActiveProjects"),
          items: [
            {
              icon: <FolderOpen size={16} className="text-neutral-50" />,
              label: "Web Application",
              subId: "web-application",
              hasDropdown: true,
              children: [
                { label: "Frontend development", subId: "proj-web-frontend", icon: null },
                { label: "API integration", subId: "proj-web-api", icon: null },
                { label: "Testing & QA", subId: "proj-web-qa", icon: null },
              ],
            },
            {
              icon: <FolderOpen size={16} className="text-neutral-50" />,
              label: "Mobile App",
              subId: "mobile-app",
              hasDropdown: true,
              children: [
                { label: "UI/UX design", subId: "proj-mobile-design", icon: null },
                { label: "Native development", subId: "proj-mobile-native", icon: null },
              ],
            },
          ],
        },
        {
          title: t("sidebar.sectionOther"),
          items: [
            {
              icon: <CheckmarkOutline size={16} className="text-neutral-50" />,
              label: t("sidebar.itemCompleted"),
              subId: "proj-completed",
            },
            {
              icon: <Archive size={16} className="text-neutral-50" />,
              label: t("sidebar.itemArchived"),
              subId: "proj-archived",
            },
          ],
        },
      ],
    },
    calendar: {
      title: t("nav.calendar"),
      sections: [
        {
          title: t("sidebar.sectionViews"),
          items: [
            {
              icon: <View size={16} className="text-neutral-50" />,
              label: t("sidebar.itemMonthView"),
              subId: "month",
            },
            {
              icon: <CalendarIcon size={16} className="text-neutral-50" />,
              label: t("sidebar.itemWeekView"),
              subId: "week",
            },
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: t("sidebar.itemDayView"),
              subId: "day",
            },
          ],
        },
        {
          title: t("sidebar.sectionEvents"),
          items: [
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: t("sidebar.itemTodaysEvents"),
              subId: "today",
              hasDropdown: true,
              children: eventChildren,
            },
            {
              icon: <CalendarIcon size={16} className="text-neutral-50" />,
              label: t("sidebar.itemUpcomingEvents"),
              subId: "upcoming",
            },
          ],
        },
        {
          title: t("sidebar.sectionQuickActions"),
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: t("sidebar.itemNewEvent"),
              subId: "new-event",
            },
            {
              icon: <Share size={16} className="text-neutral-50" />,
              label: t("sidebar.itemShareCalendar"),
              subId: "share-calendar",
            },
          ],
        },
      ],
    },
    teams: {
      title: t("nav.teams"),
      sections: [
        {
          title: t("sidebar.sectionMyTeams"),
          subId: "manage",
          items: teamNavItems,
        },
        {
          title: t("sidebar.sectionQuickActions"),
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: t("sidebar.itemInviteMember"),
              subId: "invite",
            },
            {
              icon: <UserMultiple size={16} className="text-neutral-50" />,
              label: t("sidebar.itemManageTeams"),
              subId: "manage",
            },
          ],
        },
      ],
    },
    analytics: {
      title: t("nav.analytics"),
      sections: [
        {
          title: t("sidebar.sectionReports"),
          items: [
            {
              icon: <Dashboard size={16} className="text-neutral-50" />,
              label: t("sidebar.itemOverview"),
              subId: "overview",
            },
            {
              icon: <Timer size={16} className="text-neutral-50" />,
              label: t("sidebar.itemTimeTracking"),
              subId: "analytics-time-tracking",
            },
            {
              icon: <Activity size={16} className="text-neutral-50" />,
              label: t("sidebar.itemTeamEfficiency"),
              subId: "analytics-team-efficiency",
            },
            {
              icon: <CenterCircle size={16} className="text-neutral-50" />,
              label: t("sidebar.itemBenchmarks"),
              subId: "analytics-benchmarks",
            },
          ],
        },
        {
          title: t("sidebar.sectionInsights"),
          items: [
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: t("sidebar.itemPerformanceReport"),
              subId: "performance",
            },
            {
              icon: <ChartBar size={16} className="text-neutral-50" />,
              label: t("sidebar.itemTaskCompletion"),
              subId: "task-completion",
            },
            {
              icon: <Analytics size={16} className="text-neutral-50" />,
              label: t("sidebar.itemTeamProductivity"),
              subId: "productivity",
            },
            {
              icon: <StarFilled size={16} className="text-neutral-50" />,
              label: t("sidebar.itemKeyMetrics"),
              subId: "key-metrics",
              hasDropdown: true,
              children: [
                { label: "Task completion metrics", subId: "analytics-task-metrics", icon: null },
                { label: "Performance benchmarks", subId: "analytics-benchmarks", icon: null },
              ],
            },
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: t("sidebar.itemTopPerformers"),
              subId: "top-performers",
            },
          ],
        },
      ],
    },
    files: {
      title: t("nav.files"),
      sections: [
        {
          title: t("sidebar.sectionQuickActions"),
          items: [
            {
              icon: <CloudUpload size={16} className="text-neutral-50" />,
              label: t("sidebar.itemUploadFile"),
              subId: "upload",
            },
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: t("sidebar.itemNewFolder"),
              subId: "new-folder",
            },
          ],
        },
        {
          title: t("sidebar.sectionBrowse"),
          items: [
            {
              icon: <DocumentAdd size={16} className="text-neutral-50" />,
              label: t("sidebar.itemRecentDocuments"),
              subId: "recent",
              hasDropdown: true,
              children: fileChildren,
            },
            {
              icon: <Share size={16} className="text-neutral-50" />,
              label: t("sidebar.itemSharedWithMe"),
              subId: "shared",
            },
            {
              icon: <Folder size={16} className="text-neutral-50" />,
              label: t("sidebar.itemAllFolders"),
              subId: "folders",
            },
            {
              icon: <Archive size={16} className="text-neutral-50" />,
              label: t("sidebar.itemArchivedFiles"),
              subId: "archived",
            },
          ],
        },
      ],
    },
    chat: {
      title: t("nav.chat"),
      sections: [],
    },
    schedule: {
      title: t("nav.schedule"),
      sections: [
        {
          title: t("sidebar.sectionViews"),
          items: [
            {
              icon: <View size={16} className="text-neutral-50" />,
              label: t("sidebar.itemMonthView"),
              subId: "month",
            },
            {
              icon: <CalendarIcon size={16} className="text-neutral-50" />,
              label: t("sidebar.itemWeekView"),
              subId: "week",
            },
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: t("sidebar.itemDayView"),
              subId: "day",
            },
          ],
        },
        {
          title: t("sidebar.sectionEvents"),
          items: [
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: t("sidebar.itemTodaysEvents"),
              subId: "today",
              hasDropdown: true,
              children: eventChildren,
            },
            {
              icon: <CalendarIcon size={16} className="text-neutral-50" />,
              label: t("sidebar.itemUpcomingEvents"),
              subId: "upcoming",
            },
          ],
        },
        {
          title: t("sidebar.sectionQuickActions"),
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: t("sidebar.itemNewEvent"),
              subId: "new-event",
            },
          ],
        },
      ],
    },
    notes: {
      title: t("nav.notes"),
      sections: [
        {
          title: t("sidebar.sectionQuickActions"),
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: t("sidebar.itemNewNote"),
              subId: "new-note",
            },
          ],
        },
        {
          title: t("sidebar.sectionBrowse"),
          items: [
            {
              icon: <View size={16} className="text-neutral-50" />,
              label: t("sidebar.itemAllNotes"),
              subId: "all",
            },
            {
              icon: <StarFilled size={16} className="text-neutral-50" />,
              label: t("sidebar.itemPinnedNotes"),
              subId: "pinned",
            },
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: t("sidebar.itemRecentNotes"),
              subId: "recent",
            },
          ],
        },
      ],
    },
    authentication: {
      title: t("nav.authentication"),
      sections: [
        {
          title: t("sidebar.sectionAccount"),
          items: [
            {
              icon: <User size={16} className="text-neutral-50" />,
              label: t("sidebar.itemProfileDetails"),
              subId: "details",
            },
            {
              icon: <Security size={16} className="text-neutral-50" />,
              label: t("sidebar.itemSecurity"),
              subId: "security",
            },
          ],
        },
      ],
    },
    billing: {
      title: t("nav.billing"),
      sections: [
        {
          title: t("sidebar.sectionSubscription"),
          items: [
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: t("sidebar.itemPlanSubscription"),
              subId: "plan",
            },
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: t("sidebar.itemPaymentHistory"),
              subId: "history",
            },
          ],
        },
      ],
    },
    profile: {
      title: t("nav.profile"),
      sections: [
        {
          title: t("sidebar.sectionAccount"),
          items: [
            {
              icon: <User size={16} className="text-neutral-50" />,
              label: t("sidebar.itemProfileDetails"),
              subId: "details",
            },
            {
              icon: <Security size={16} className="text-neutral-50" />,
              label: t("sidebar.itemSecurity"),
              subId: "security",
            },
          ],
        },
      ],
    },
    settings: {
      title: t("nav.settings"),
      sections: [
        {
          title: t("sidebar.sectionAccount"),
          items: [
            {
              icon: <User size={16} className="text-neutral-50" />,
              label: t("sidebar.itemProfileSettings"),
              subId: "profile",
            },
            {
              icon: <Security size={16} className="text-neutral-50" />,
              label: t("sidebar.itemSecurity"),
              subId: "security",
            },
            {
              icon: <Notification size={16} className="text-neutral-50" />,
              label: t("sidebar.itemNotifications"),
              subId: "notifications",
            },
          ],
        },
        {
          title: t("sidebar.sectionWorkspace"),
          items: [
            {
              icon: <Settings size={16} className="text-neutral-50" />,
              label: t("sidebar.itemPreferences"),
              subId: "workspace",
              hasDropdown: true,
              children: [
                { label: "Theme & Appearance", subId: "settings-theme", icon: null },
                { label: "Time zone & Date", subId: "settings-timezone", icon: null },
                { label: "Default notifications", subId: "settings-notif-defaults", icon: null },
              ],
            },
            {
              icon: <UserMultiple size={16} className="text-neutral-50" />,
              label: t("sidebar.itemMembersPermissions"),
              subId: "settings-members",
            },
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: t("sidebar.itemBillingPlan"),
              subId: "settings-billing",
            },
            {
              icon: <Integration size={16} className="text-neutral-50" />,
              label: t("sidebar.itemIntegrations"),
              subId: "integrations",
            },
          ],
        },
        {
          title: t("sidebar.sectionAdvanced"),
          items: [
            {
              icon: <ChartBar size={16} className="text-neutral-50" />,
              label: t("sidebar.itemApiWebhooks"),
              subId: "settings-api",
            },
            {
              icon: <View size={16} className="text-neutral-50" />,
              label: t("sidebar.itemAuditLog"),
              subId: "settings-audit",
            },
            {
              icon: <Archive size={16} className="text-neutral-50" />,
              label: t("sidebar.itemDataExport"),
              subId: "settings-data",
            },
            {
              icon: <Flag size={16} className="text-neutral-50" />,
              label: t("sidebar.itemDangerZone"),
              subId: "settings-danger",
            },
          ],
        },
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
  const [workspace, setWorkspace] = useState<api.Workspace | null>(null);

  useEffect(() => {
    api.getWorkspace()
      .then(({ workspace: ws }) => setWorkspace(ws))
      .catch(() => {});
  }, []);

  const { t } = useLang();

  const navItems = [
    {
      id: "dashboard",
      icon: <Dashboard size={16} />,
      label: t("nav.dashboard"),
    },
    { id: "tasks", icon: <Task size={16} />, label: t("nav.tasks") },
    {
      id: "projects",
      icon: <Folder size={16} />,
      label: t("nav.projects"),
    },
    {
      id: "teams",
      icon: <UserMultiple size={16} />,
      label: t("nav.teams"),
    },
    {
      id: "schedule",
      icon: <Calendar size={16} />,
      label: t("nav.schedule"),
    },
    {
      id: "notes",
      icon: <Document size={16} />,
      label: t("nav.notes"),
    },
    {
      id: "files",
      icon: <DocumentAdd size={16} />,
      label: t("nav.files"),
    },
    {
      id: "analytics",
      icon: <Analytics size={16} />,
      label: t("nav.analytics"),
    },
  ];

  return (
    <div
      className="bg-[#000000] box-border content-stretch flex flex-col gap-2 h-full items-center justify-start overflow-clip p-4 relative shrink-0 w-16 border-r border-neutral-800"
      data-name="Icon Navigation"
    >
      {/* LokaSync Logo */}
      <div className="mb-1 size-10 flex items-center justify-center" title="LokaSync">
        <LokaLogo />
      </div>

      {/* Workspace indicator */}
      {workspace && (
        <div
          className="mb-1 w-10 flex items-center justify-center rounded-lg bg-indigo-900/40 py-1.5 cursor-default"
          title={workspace.name || "Workspace"}
        >
          <span className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider truncate px-0.5" style={{ fontFamily: "Lexend, sans-serif" }}>
            {(workspace.name || "WS").substring(0, 2)}
          </span>
        </div>
      )}

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
        {/* Language toggle removed — now in Settings > Language */}
        <IconNavButton
          isActive={activeSection === "chat"}
          onClick={() => onSectionChange("chat")}
        >
          <Chat size={16} />
        </IconNavButton>
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

  const content = getSidebarContent(t, activeSection, teams, tasks, todayEvents, recentFiles);

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
  return (
    <TwoLevelSidebar
      activeSection={activeSection}
      onSectionChange={onSectionChange}
    />
  );
}

