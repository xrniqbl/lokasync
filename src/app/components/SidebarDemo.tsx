import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useNavigation } from "./NavigationContext";
import { useSubscription } from "../subscription/SubscriptionContext";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import * as api from "../utils/api";
import { signOut, getCurrentUser } from "../utils/supabase";
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

const profileStatuses = [
  { value: "online",  label: "Online",         color: "#10b981" },
  { value: "away",    label: "Away",            color: "#f59e0b" },
  { value: "dnd",     label: "Do not disturb", color: "#ef4444" },
  { value: "offline", label: "Offline",         color: "#404040" },
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
        <div className="text-neutral-600 text-[10px] uppercase tracking-wider px-2 mb-1.5">Status</div>
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
            {s.label}
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
          Edit profile
        </button>
        <button
          onClick={() => { onNavigate("billing"); onClose(); }}
          className="w-full text-left px-2 py-1.5 text-[12px] text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50 rounded-lg transition-colors"
        >
          Billing &amp; plan
        </button>
        <button
          onClick={() => { onNavigate("settings", "notifications"); onClose(); }}
          className="w-full text-left px-2 py-1.5 text-[12px] text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50 rounded-lg transition-colors"
        >
          Notification preferences
        </button>
        <button
          onClick={() => { onNavigate("settings"); onClose(); }}
          className="w-full text-left px-2 py-1.5 text-[12px] text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50 rounded-lg transition-colors"
        >
          Settings
        </button>
        {isAdmin && (
          <button
            onClick={() => { routerNavigate("/admin"); onClose(); }}
            className="w-full text-left px-2 py-1.5 text-[12px] text-indigo-300 hover:text-indigo-200 hover:bg-indigo-950/40 rounded-lg transition-colors"
          >
            Founder panel
          </button>
        )}
      </div>

      {/* Sign out */}
      <div className="px-2 py-2">
        <button
          onClick={async () => {
            await signOut();
            toast.success("Signed out successfully");
            onClose();
          }}
          className="w-full text-left px-2 py-1.5 text-[12px] text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded-lg transition-colors"
        >
          Sign out
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
                placeholder="Search tasks, projects..."
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
      title: "Dashboard",
      sections: [
        {
          title: "Dashboard Types",
          items: [
            {
              icon: <View size={16} className="text-neutral-50" />,
              label: "Overview",
              subId: "overview",
              isActive: true,
            },
            {
              icon: <Dashboard size={16} className="text-neutral-50" />,
              label: "Executive Summary",
              subId: "executive-summary",
              hasDropdown: true,
              children: [
                { label: "Revenue Overview", subId: "exec-revenue", icon: null },
                { label: "Key Performance Indicators", subId: "exec-kpis", icon: null },
                { label: "Strategic Goals Progress", subId: "exec-goals", icon: null },
                { label: "Department Highlights", subId: "exec-departments", icon: null },
              ],
            },
            {
              icon: <ChartBar size={16} className="text-neutral-50" />,
              label: "Operations Dashboard",
              subId: "operations",
              hasDropdown: true,
              children: [
                { label: "Project Timeline", subId: "ops-timeline", icon: null },
                { label: "Resource Allocation", subId: "ops-resources", icon: null },
                { label: "Team Performance", subId: "ops-performance", icon: null },
                { label: "Capacity Planning", subId: "ops-capacity", icon: null },
              ],
            },
            {
              icon: <Analytics size={16} className="text-neutral-50" />,
              label: "Financial Dashboard",
              subId: "financial",
              hasDropdown: true,
              children: [
                { label: "Budget vs Actual", subId: "fin-budget", icon: null },
                { label: "Cash Flow Analysis", subId: "fin-cashflow", icon: null },
                { label: "Expense Breakdown", subId: "fin-expense", icon: null },
                { label: "Profit & Loss Summary", subId: "fin-pl", icon: null },
              ],
            },
          ],
        },
        {
          title: "Report Summaries",
          items: [
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: "Weekly Reports",
              subId: "weekly",
              hasDropdown: true,
              children: [
                { label: "Team Productivity", subId: "weekly-productivity", icon: null },
                { label: "Project Completion", subId: "weekly-completion", icon: null },
                { label: "Budget Utilization", subId: "weekly-budget", icon: null },
                { label: "Client Satisfaction", subId: "weekly-satisfaction", icon: null },
              ],
            },
            {
              icon: <StarFilled size={16} className="text-neutral-50" />,
              label: "Monthly Insights",
              subId: "monthly",
              hasDropdown: true,
              children: [
                { label: "Revenue Growth", subId: "monthly-revenue", icon: null },
                { label: "New Clients", subId: "monthly-clients", icon: null },
                { label: "Team Expansion", subId: "monthly-expansion", icon: null },
                { label: "Cost Reduction", subId: "monthly-cost", icon: null },
              ],
            },
            {
              icon: <View size={16} className="text-neutral-50" />,
              label: "Quarterly Analysis",
              subId: "quarterly",
              hasDropdown: true,
              children: [
                { label: "Market Position", subId: "quarterly-market", icon: null },
                { label: "ROI", subId: "quarterly-roi", icon: null },
                { label: "Customer Retention", subId: "quarterly-retention", icon: null },
                { label: "Innovation Index", subId: "quarterly-innovation", icon: null },
              ],
            },
          ],
        },
        {
          title: "Business Intelligence",
          items: [
            {
              icon: <ChartBar size={16} className="text-neutral-50" />,
              label: "Performance Metrics",
              subId: "performance-metrics",
              hasDropdown: true,
              children: [
                { label: "Sales Conversion", subId: "perf-sales", icon: null },
                { label: "Lead Response Time", subId: "perf-response", icon: null },
                { label: "Customer Lifetime Value", subId: "perf-clv", icon: null },
                { label: "Churn Rate", subId: "perf-churn", icon: null },
              ],
            },
            {
              icon: <Analytics size={16} className="text-neutral-50" />,
              label: "Predictive Analytics",
              subId: "predictive",
              hasDropdown: true,
              children: [
                { label: "Q4 Revenue Forecast", subId: "pred-forecast", icon: null },
                { label: "Resource Demand", subId: "pred-resources", icon: null },
                { label: "Market Trends", subId: "pred-trends", icon: null },
                { label: "Risk Assessment", subId: "pred-risks", icon: null },
              ],
            },
          ],
        },
      ],
    },
    tasks: {
      title: "Tasks",
      sections: [
        {
          title: "Quick Actions",
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: "New task",
              subId: "new-task",
            },
            {
              icon: <Filter size={16} className="text-neutral-50" />,
              label: "Filter tasks",
              subId: "filter",
            },
          ],
        },
        {
          title: "My Tasks",
          items: [
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: "Due today",
              subId: "today",
              hasDropdown: true,
              children: dueTodayChildren,
            },
            {
              icon: <InProgress size={16} className="text-neutral-50" />,
              label: "In progress",
              subId: "in-progress",
              hasDropdown: true,
              children: inProgressChildren,
            },
            {
              icon: <CheckmarkOutline size={16} className="text-neutral-50" />,
              label: "Completed",
              subId: "completed",
              hasDropdown: true,
              children: completedChildren,
            },
          ],
        },
        {
          title: "Other",
          items: [
            {
              icon: <Flag size={16} className="text-neutral-50" />,
              label: "Priority tasks",
              subId: "priority",
              hasDropdown: true,
              children: priorityChildren,
            },
            {
              icon: <Archive size={16} className="text-neutral-50" />,
              label: "Archived",
              subId: "all",
            },
          ],
        },
      ],
    },
    projects: {
      title: "Projects",
      sections: [
        {
          title: "Quick Actions",
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: "New project",
              subId: "new-project",
            },
            {
              icon: <Filter size={16} className="text-neutral-50" />,
              label: "Filter projects",
              subId: "all",
            },
          ],
        },
        {
          title: "Active Projects",
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
          title: "Other",
          items: [
            {
              icon: <CheckmarkOutline size={16} className="text-neutral-50" />,
              label: "Completed",
              subId: "proj-completed",
            },
            {
              icon: <Archive size={16} className="text-neutral-50" />,
              label: "Archived",
              subId: "proj-archived",
            },
          ],
        },
      ],
    },
    calendar: {
      title: "Calendar",
      sections: [
        {
          title: "Views",
          items: [
            {
              icon: <View size={16} className="text-neutral-50" />,
              label: "Month view",
              subId: "month",
            },
            {
              icon: <CalendarIcon size={16} className="text-neutral-50" />,
              label: "Week view",
              subId: "week",
            },
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: "Day view",
              subId: "day",
            },
          ],
        },
        {
          title: "Events",
          items: [
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: "Today's events",
              subId: "today",
              hasDropdown: true,
              children: eventChildren,
            },
            {
              icon: <CalendarIcon size={16} className="text-neutral-50" />,
              label: "Upcoming events",
              subId: "upcoming",
            },
          ],
        },
        {
          title: "Quick Actions",
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: "New event",
              subId: "new-event",
            },
            {
              icon: <Share size={16} className="text-neutral-50" />,
              label: "Share calendar",
              subId: "share-calendar",
            },
          ],
        },
      ],
    },
    teams: {
      title: "Teams",
      sections: [
        {
          title: "My Teams",
          items: teamNavItems,
        },
        {
          title: "Quick Actions",
          items: [
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: "Invite member",
              subId: "invite",
            },
            {
              icon: <UserMultiple size={16} className="text-neutral-50" />,
              label: "Manage teams",
              subId: "manage",
            },
          ],
        },
      ],
    },
    analytics: {
      title: "Analytics",
      sections: [
        {
          title: "Reports",
          items: [
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: "Performance report",
              subId: "performance",
            },
            {
              icon: <ChartBar size={16} className="text-neutral-50" />,
              label: "Task completion",
              subId: "task-completion",
            },
            {
              icon: <Analytics size={16} className="text-neutral-50" />,
              label: "Team productivity",
              subId: "productivity",
            },
          ],
        },
        {
          title: "Insights",
          items: [
            {
              icon: <StarFilled size={16} className="text-neutral-50" />,
              label: "Key metrics",
              subId: "key-metrics",
              hasDropdown: true,
              children: [
                { label: "Task completion metrics", subId: "analytics-task-metrics", icon: null },
                { label: "Time tracking analysis", subId: "analytics-time-tracking", icon: null },
                { label: "Team efficiency report", subId: "analytics-team-efficiency", icon: null },
                { label: "Performance benchmarks", subId: "analytics-benchmarks", icon: null },
              ],
            },
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: "Top performers",
              subId: "top-performers",
            },
          ],
        },
      ],
    },
    files: {
      title: "Files",
      sections: [
        {
          title: "Quick Actions",
          items: [
            {
              icon: <CloudUpload size={16} className="text-neutral-50" />,
              label: "Upload file",
              subId: "upload",
            },
            {
              icon: <AddLarge size={16} className="text-neutral-50" />,
              label: "New folder",
              subId: "new-folder",
            },
          ],
        },
        {
          title: "Browse",
          items: [
            {
              icon: <DocumentAdd size={16} className="text-neutral-50" />,
              label: "Recent documents",
              subId: "recent",
              hasDropdown: true,
              children: fileChildren,
            },
            {
              icon: <Share size={16} className="text-neutral-50" />,
              label: "Shared with me",
              subId: "shared",
            },
            {
              icon: <Folder size={16} className="text-neutral-50" />,
              label: "All folders",
              subId: "folders",
            },
            {
              icon: <Archive size={16} className="text-neutral-50" />,
              label: "Archived files",
              subId: "archived",
            },
          ],
        },
      ],
    },
    billing: {
      title: "Billing",
      sections: [
        {
          title: "Subscription",
          items: [
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: "Plan & subscription",
              subId: "plan",
            },
            {
              icon: <Time size={16} className="text-neutral-50" />,
              label: "Payment history",
              subId: "history",
            },
          ],
        },
      ],
    },
    profile: {
      title: "My Profile",
      sections: [
        {
          title: "Account",
          items: [
            {
              icon: <User size={16} className="text-neutral-50" />,
              label: "Profile details",
              subId: "details",
            },
            {
              icon: <Security size={16} className="text-neutral-50" />,
              label: "Security",
              subId: "security",
            },
          ],
        },
      ],
    },
    settings: {
      title: "Settings",
      sections: [
        {
          title: "Account",
          items: [
            {
              icon: <User size={16} className="text-neutral-50" />,
              label: "Profile settings",
              subId: "profile",
            },
            {
              icon: <Security size={16} className="text-neutral-50" />,
              label: "Security",
              subId: "security",
            },
            {
              icon: <Notification size={16} className="text-neutral-50" />,
              label: "Notifications",
              subId: "notifications",
            },
          ],
        },
        {
          title: "Workspace",
          items: [
            {
              icon: <Settings size={16} className="text-neutral-50" />,
              label: "Preferences",
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
              label: "Members & Permissions",
              subId: "settings-members",
            },
            {
              icon: <Report size={16} className="text-neutral-50" />,
              label: "Billing & Plan",
              subId: "settings-billing",
            },
            {
              icon: <Integration size={16} className="text-neutral-50" />,
              label: "Integrations",
              subId: "integrations",
            },
          ],
        },
        {
          title: "Advanced",
          items: [
            {
              icon: <ChartBar size={16} className="text-neutral-50" />,
              label: "API & Webhooks",
              subId: "settings-api",
            },
            {
              icon: <View size={16} className="text-neutral-50" />,
              label: "Audit Log",
              subId: "settings-audit",
            },
            {
              icon: <Archive size={16} className="text-neutral-50" />,
              label: "Data & Export",
              subId: "settings-data",
            },
            {
              icon: <Flag size={16} className="text-neutral-50" />,
              label: "Danger Zone",
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

  const navItems = [
    {
      id: "dashboard",
      icon: <Dashboard size={16} />,
      label: "Dashboard",
    },
    { id: "tasks", icon: <Task size={16} />, label: "Tasks" },
    {
      id: "projects",
      icon: <Folder size={16} />,
      label: "Projects",
    },
    {
      id: "calendar",
      icon: <Calendar size={16} />,
      label: "Calendar",
    },
    {
      id: "teams",
      icon: <UserMultiple size={16} />,
      label: "Teams",
    },
    {
      id: "analytics",
      icon: <Analytics size={16} />,
      label: "Analytics",
    },
    {
      id: "files",
      icon: <DocumentAdd size={16} />,
      label: "Files",
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
          <InterfacesLogo1 />
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

  const content = getSidebarContent(activeSection, teams, tasks, todayEvents, recentFiles);

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