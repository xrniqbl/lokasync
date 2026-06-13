import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  Github, Figma, MessageSquare, CalendarDays,
  CreditCard, Download, Shield,
  Eye, EyeOff, Copy, Check, Trash2, RefreshCw,
  X, Plus, Zap, BookOpen, Video, Layers, ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { useNavigation } from "./NavigationContext";
import { InviteMemberModal } from "./modals/InviteMemberModal";
import { useLang, LangToggle } from "../i18n";
import * as api from "../utils/api";

// ─── Primitives ────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-indigo-600" : "bg-neutral-700"}`}
    >
      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

function InputField({
  label, defaultValue, value, onChange, type = "text", hint, placeholder,
}: {
  label: string; defaultValue?: string; value?: string; onChange?: (v: string) => void; type?: string; hint?: string; placeholder?: string;
}) {
  const [val, setVal] = useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  return (
    <div>
      <label className="block text-neutral-300 text-[13px] mb-1.5">{label}</label>
      <input
        type={type} value={isControlled ? value : val} placeholder={placeholder}
        onChange={(e) => (isControlled ? onChange?.(e.target.value) : setVal(e.target.value))}
        className="w-full bg-[#0f0f0f] border border-neutral-800 hover:border-neutral-700 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-600 font-['Lexend:Regular',_sans-serif]"
      />
      {hint && <p className="text-neutral-600 text-[11px] mt-1">{hint}</p>}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="pb-7 lg:pb-8 border-b border-neutral-800/40 last:border-0 last:pb-0">
      <div className="mb-5">
        <h2 className="text-neutral-50 text-[14px] lg:text-[15px] font-['Lexend:SemiBold',_sans-serif] mb-1">{title}</h2>
        {description && <p className="text-neutral-500 text-[12px]">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, description, defaultChecked = false }: { label: string; description?: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="min-w-0">
        <div className="text-neutral-200 text-[13px]">{label}</div>
        {description && <div className="text-neutral-600 text-[12px] mt-0.5">{description}</div>}
      </div>
      <Toggle checked={checked} onChange={() => setChecked(!checked)} />
    </div>
  );
}

function SaveRow({ onSave, label = "Save changes" }: { onSave: () => void; label?: string }) {
  return (
    <div className="flex justify-end pt-2">
      <button onClick={onSave} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-5 py-2 rounded-lg transition-colors">
        {label}
      </button>
    </div>
  );
}

// ─── Data ──────────────────────────────────────────────────────────────────────

const integrationIcons: Record<string, React.ReactNode> = {
  GitHub: <Github size={16} />,
  Slack: <MessageSquare size={16} />,
  Figma: <Figma size={16} />,
  "Google Calendar": <CalendarDays size={16} />,
  Jira: <Layers size={16} />,
  Notion: <BookOpen size={16} />,
  Zoom: <Video size={16} />,
  Zapier: <Zap size={16} />,
};

// sessionList and loginHistory are now fetched from Supabase — see SettingsPage useEffect

const accentColors = [
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#10b981", label: "Emerald" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ef4444", label: "Rose" },
];

const navGroups = [
  { label: "Account", items: ["Profile", "Security", "Notifications"] },
  { label: "Workspace", items: ["Workspace", "Appearance", "Language", "Timezone", "Default Notifications", "Members", "Billing", "Integrations"] },
  { label: "Advanced", items: ["API Keys", "Audit Log", "Data & Export", "Danger Zone"] },
];

const subSectionMap: Record<string, string> = {
  profile: "Profile",
  security: "Security",
  notifications: "Notifications",
  workspace: "Workspace",
  "settings-theme": "Appearance",
  "settings-language": "Language",
  "settings-timezone": "Timezone",
  "settings-notif-defaults": "Default Notifications",
  "settings-members": "Members",
  "settings-billing": "Billing",
  integrations: "Integrations",
  "settings-api": "API Keys",
  "settings-audit": "Audit Log",
  "settings-data": "Data & Export",
  "settings-danger": "Danger Zone",
};

// ─── Main Component ─────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { subSection } = useNavigation();
  const { lang, setLang, t } = useLang();
  const [activeNav, setActiveNav] = useState("Profile");
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [sessions, setSessions] = useState<{ device: string; location: string; ip: string; lastActive: string; current: boolean }[]>([]);
  const [loginHistory, setLoginHistory] = useState<{ date: string; ip: string; device: string; status: string }[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [billing, setBilling] = useState<any | null>(null);
  const [quota, setQuota] = useState<api.QuotaInfo | null>(null);
  const [profileData, setProfileData] = useState<any>({});
  const [workspaceData, setWorkspaceData] = useState<any>({});
  const [showInvite, setShowInvite] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [show2FA, setShow2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [accentColor, setAccentColor] = useState("#6366f1");
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">("medium");
  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">("comfortable");
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY");
  const [timeFormat, setTimeFormat] = useState("12h");
  const [weekStart, setWeekStart] = useState("Monday");
  const [auditFilter, setAuditFilter] = useState("All");
  const [auditLogData, setAuditLogData] = useState<any[]>([]);
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});
  const [apiKeysList, setApiKeysList] = useState<any[]>([]);
  const [webhooksList, setWebhooksList] = useState<any[]>([]);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [dangerEmail, setDangerEmail] = useState("");
  const [dangerReset, setDangerReset] = useState("");
  const [exportFormats, setExportFormats] = useState<Record<string, string>>({
    "All tasks": "CSV", "All projects": "CSV", "Team data": "CSV", "Files & attachments": "CSV",
  });
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvents, setNewWebhookEvents] = useState("");
  const [notifState, setNotifState] = useState({
    inApp: true, email: true, slack: false, browser: false,
    taskAssigned: true, taskDue: true, taskStatus: false, comments: true, mentions: true,
    projectStatus: false, newMember: false, milestone: true,
    teamMember: false, announcements: true,
    digest: true, productUpdates: false, security: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load settings sections from Supabase
  useEffect(() => {
    api.getSettings("members").then((data) => {
      if (data?.rows) {
        setMembers(data.rows);
        setMemberRoles(Object.fromEntries(data.rows.map((m: any) => [m.initials, m.role])));
      }
      if (data?.pending) setPendingList(data.pending);
    }).catch((e) => console.log("Failed to load members settings:", e));

    api.getSettings("api-keys").then((data) => {
      if (Array.isArray(data)) setApiKeysList(data);
    }).catch((e) => console.log("Failed to load api-keys:", e));

    api.getSettings("webhooks").then((data) => {
      if (Array.isArray(data)) setWebhooksList(data);
    }).catch((e) => console.log("Failed to load webhooks:", e));

    api.getSettings("audit-log").then((data) => {
      if (Array.isArray(data)) setAuditLogData(data.map((e: any) => ({
        actor: e.actor, name: e.actorName, action: e.action, target: e.target,
        ip: e.ip, time: e.timestamp, category: e.category,
      })));
    }).catch((e) => console.log("Failed to load audit-log:", e));

    api.getSettings("appearance").then((data) => {
      if (data) {
        if (data.theme) setTheme(data.theme);
        if (data.accent) setAccentColor(accentColors.find((a) => a.label.toLowerCase() === data.accent)?.value ?? "#6366f1");
        if (data.fontSize) setFontSize(data.fontSize);
        if (data.density) setDensity(data.density);
      }
    }).catch((e) => console.log("Failed to load appearance:", e));

    api.getSettings("timezone").then((data) => {
      if (data) {
        if (data.dateFormat) setDateFormat(data.dateFormat);
        if (data.timeFormat) setTimeFormat(data.timeFormat);
        if (data.firstDay) setWeekStart(data.firstDay);
      }
    }).catch((e) => console.log("Failed to load timezone:", e));

    api.getSettings("notifications").then((data) => {
      if (data && typeof data === "object") setNotifState((prev) => ({ ...prev, ...data }));
    }).catch((e) => console.log("Failed to load notifications:", e));

    // Fetch integrations from Supabase
    api.getIntegrations().then((data) => {
      if (Array.isArray(data)) {
        setIntegrations(data.map((d: any) => ({ ...d, icon: integrationIcons[d.name] ?? <Zap size={16} /> })));
      }
    }).catch((e) => console.log("Failed to load integrations:", e));

    api.getSettings("billing").then((data) => {
      if (data) setBilling(data);
    }).catch((e) => console.log("Failed to load billing:", e));

    api.getSettings("profile").then((data) => {
      if (data) setProfileData(data);
    }).catch((e) => console.log("Failed to load profile:", e));

    api.getSettings("workspace").then((data) => {
      if (data) setWorkspaceData(data);
    }).catch((e) => console.log("Failed to load workspace:", e));

    // Fetch sessions from Supabase
    api.getSessions().then((data) => {
      if (data?.active) setSessions(data.active);
      if (data?.loginHistory) setLoginHistory(data.loginHistory);
    }).catch((e) => console.log("Failed to load sessions:", e));
  }, []);

  useEffect(() => {
    if (subSectionMap[subSection]) setActiveNav(subSectionMap[subSection]);
  }, [subSection]);

  // Fetch storage quota when Billing section is active (Fase 12.9)
  useEffect(() => {
    if (activeNav === "Billing") {
      api.getStorageQuota().then(setQuota).catch(() => {});
    }
  }, [activeNav]);

  const toggleIntegration = (name: string) => {
    setIntegrations((prev) =>
      prev.map((i) => {
        if (i.name !== name) return i;
        const next = { ...i, connected: !i.connected, lastSync: !i.connected ? "just now" : null };
        toast.success(next.connected ? `Connected to ${name}` : `Disconnected from ${name}`);
        // Persist to Supabase
        api.updateIntegration(name, { connected: next.connected, lastSync: next.lastSync }).catch(() => {});
        return next;
      })
    );
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setAvatarSrc(objectUrl);
    toast.success("Profile photo updated");
  };

  const updatePassword = () => {
    if (!pw.current) return toast.error("Enter your current password");
    if (pw.next.length < 12) return toast.error("New password must be at least 12 characters");
    if (pw.next !== pw.confirm) return toast.error("Passwords do not match");
    toast.success("Password updated successfully");
    setPw({ current: "", next: "", confirm: "" });
  };

  const verify2FA = () => {
    if (twoFACode.length < 6) return toast.error("Enter the 6-digit code");
    toast.success("Two-factor authentication enabled");
    setShow2FA(false);
    setTwoFACode("");
  };

  const generateApiKey = async () => {
    if (!newKeyName.trim()) return toast.error("Enter a name for the key");
    const key = `sk-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 14)}`;
    setGeneratedKey(key);
    const newEntry = { id: Date.now(), name: newKeyName.trim(), prefix: `sk_${key.slice(3, 7)}`, created: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), lastUsed: "Never" };
    const updated = [...apiKeysList, newEntry];
    setApiKeysList(updated);
    setNewKeyName("");
    toast.success("API key generated — copy it now, it won't be shown again");
    try { await api.saveSettings("api-keys", updated); } catch (e) { console.log("Failed to save api keys:", e); }
  };

  const copyKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey).catch(() => {});
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const revokeKey = async (name: string) => {
    const updated = apiKeysList.filter((k) => k.name !== name);
    setApiKeysList(updated);
    toast.success(`API key "${name}" revoked`);
    try { await api.saveSettings("api-keys", updated); } catch (e) { console.log("Failed to save api keys:", e); }
  };

  const toggleWebhook = async (idx: number) => {
    const updated = webhooksList.map((w, i) => i === idx ? { ...w, active: !w.active } : w);
    setWebhooksList(updated);
    try { await api.saveSettings("webhooks", updated); } catch (e) { console.log("Failed to save webhooks:", e); }
  };

  const deleteWebhook = async (idx: number) => {
    const updated = webhooksList.filter((_, i) => i !== idx);
    setWebhooksList(updated);
    toast.success("Webhook deleted");
    try { await api.saveSettings("webhooks", updated); } catch (e) { console.log("Failed to save webhooks:", e); }
  };

  const saveMembers = async (updatedMembers: any[], updatedPending?: any[]) => {
    const data = { rows: updatedMembers, pending: updatedPending ?? pendingList };
    try { await api.saveSettings("members", data); } catch (e) { console.log("Failed to save members:", e); }
  };

  const saveAppearance = async () => {
    const accentLabel = accentColors.find((a) => a.value === accentColor)?.label.toLowerCase() ?? "indigo";
    try {
      await api.saveSettings("appearance", { theme, accent: accentLabel, fontSize, density, sidebarPosition: "left" });
      toast.success("Appearance settings saved");
    } catch (e) { console.log("Failed to save appearance:", e); toast.error("Failed to save"); }
  };

  const saveTimezone = async () => {
    try {
      await api.saveSettings("timezone", { timezone: "America/New_York", dateFormat, timeFormat, firstDay: weekStart, autoDetect: false });
      toast.success("Timezone settings saved");
    } catch (e) { console.log("Failed to save timezone:", e); toast.error("Failed to save"); }
  };

  const saveProfile = async () => {
    try {
      await api.saveSettings("profile", { firstName: "", lastName: "", email: "", phone: "", title: "", department: "Engineering", bio: "", github: "", linkedin: "", ...profileData });
      toast.success("Profile saved");
    } catch (e) { console.log("Failed to save profile:", e); toast.error("Failed to save"); }
  };

  const saveNotifications = async () => {
    try {
      await api.saveSettings("notifications", notifState);
      toast.success("Notification settings saved");
    } catch (e) { console.log("Failed to save notifications:", e); toast.error("Failed to save"); }
  };

  const handleExport = async (label: string) => {
    const format = exportFormats[label] ?? "CSV";
    try {
      let data: any;
      if (label === "All tasks") data = await api.getTasks();
      else if (label === "All projects") data = await api.getProjects();
      else if (label === "Team data") data = await api.getTeams();
      else if (label === "Files & attachments") { const res = await api.getFiles(); data = res.files; }
      if (!data) { toast.error("No data to export"); return; }
      let content: string;
      if (format === "JSON") {
        content = JSON.stringify(data, null, 2);
      } else {
        const flat = Array.isArray(data) ? data : [data];
        if (flat.length === 0) { toast.error("No data to export"); return; }
        const keys = Object.keys(flat[0]);
        content = [keys.join(","), ...flat.map((row: any) => keys.map((k) => JSON.stringify(row[k] ?? "")).join(","))].join("\n");
      }
      const ext = format === "JSON" ? "json" : "csv";
      const mimeType = format === "JSON" ? "application/json" : "text/csv";
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${label.toLowerCase().replace(/\s+/g, "-")}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${label} exported as ${format}`);
    } catch (e) { console.log("Export failed:", e); toast.error("Export failed"); }
  };

  const addWebhook = async () => {
    if (!newWebhookUrl.trim()) return toast.error("Enter a webhook URL");
    if (!newWebhookEvents.trim()) return toast.error("Enter at least one event");
    const newHook = { url: newWebhookUrl.trim(), events: newWebhookEvents.trim(), active: true };
    const updated = [...webhooksList, newHook];
    setWebhooksList(updated);
    setShowWebhookForm(false);
    setNewWebhookUrl("");
    setNewWebhookEvents("");
    toast.success("Webhook added");
    try { await api.saveSettings("webhooks", updated); } catch (e) { console.log("Failed to save webhooks:", e); }
  };

  const filteredLogs = auditFilter === "All" ? auditLogData : auditLogData.filter((l) => l.category === auditFilter);

  return (
    <div className="flex flex-col lg:flex-row h-full font-['Lexend:Regular',_sans-serif]">
      {/* Left nav */}
      <div className="w-full lg:w-56 shrink-0 px-4 lg:px-6 pt-6 lg:pt-8 pb-2 lg:pb-8 border-b lg:border-b-0 lg:border-r border-neutral-800/40 overflow-x-auto lg:overflow-y-auto">
        <div className="hidden lg:block text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif] mb-4">{t("sidebar.settingsNav")}</div>
        <nav className="flex lg:flex-col gap-x-1 lg:gap-x-0 overflow-x-auto lg:overflow-x-visible">
          {navGroups.map((group) => (
            <div key={group.label} className="flex lg:flex-col gap-x-1 lg:gap-x-0 lg:mb-4 last:mb-0">
              <div className="hidden lg:block text-neutral-600 text-[10px] uppercase tracking-wider px-3 mb-1">
                {group.label === "Account" ? t("settings.account") : group.label === "Workspace" ? t("settings.workspace") : t("settings.advanced")}
              </div>
              {group.items.map((item) => {
                const labelKey = item === "Profile" ? "sidebar.profileNav"
                  : item === "Security" ? "sidebar.securityNav"
                  : item === "Notifications" ? "sidebar.notificationsNav"
                  : item === "Workspace" ? "sidebar.workspaceNav"
                  : item === "Appearance" ? "sidebar.appearanceNav"
                  : item === "Language" ? "sidebar.languageNav"
                  : item === "Timezone" ? "sidebar.timezoneNav"
                  : item === "Default Notifications" ? "sidebar.defaultNotificationsNav"
                  : item === "Members" ? "sidebar.membersNav"
                  : item === "Billing" ? "sidebar.billingNav"
                  : item === "Integrations" ? "sidebar.integrationsNav"
                  : item === "API Keys" ? "sidebar.apiKeysNav"
                  : item === "Audit Log" ? "sidebar.auditLogNav"
                  : item === "Data & Export" ? "sidebar.dataExportNav"
                  : item === "Danger Zone" ? "sidebar.dangerZoneNav"
                  : item;
                return (
                  <button
                    key={item}
                    onClick={() => setActiveNav(item)}
                    className={`shrink-0 lg:w-full text-left px-3 py-2 rounded-lg text-[12px] lg:text-[13px] transition-colors whitespace-nowrap ${activeNav === item ? "bg-neutral-800 text-neutral-50" : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/30"}`}
                  >
                    {t(labelKey as any)}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-2xl space-y-7 lg:space-y-8">

          {/* ── Profile ── */}
          {activeNav === "Profile" && (
            <>
              <Section title={t("settings.profile")} description={t("settings.managePersonalInfo")}>
                <div className="flex items-center gap-4 mb-6">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden shrink-0 cursor-pointer ring-2 ring-neutral-800 hover:ring-indigo-600/40 transition-all"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {avatarSrc ? (
                      <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-indigo-900/60 flex items-center justify-center text-indigo-300 text-[20px] font-['Lexend:SemiBold',_sans-serif]">{((profileData.firstName?.[0] ?? "") + (profileData.lastName?.[0] ?? "")) || "?"}</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button onClick={() => fileInputRef.current?.click()} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[12px] lg:text-[13px] px-3 py-1.5 rounded-lg transition-colors w-fit">
                      {t("settings.changePhoto")}
                    </button>
                    <span className="text-neutral-600 text-[11px]">{t("settings.jpgOrPng")}</span>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 lg:gap-4">
                    <InputField label={t("settings.firstName")} value={profileData.firstName ?? ""} onChange={(v) => setProfileData((p: any) => ({ ...p, firstName: v }))} />
                    <InputField label={t("settings.lastName")} value={profileData.lastName ?? ""} onChange={(v) => setProfileData((p: any) => ({ ...p, lastName: v }))} />
                  </div>
                  <InputField label={t("settings.email")} value={profileData.email ?? ""} onChange={(v) => setProfileData((p: any) => ({ ...p, email: v }))} type="email" hint={t("settings.emailVerificationHint")} />
                  <InputField label={t("settings.phoneNumber")} value={profileData.phone ?? ""} onChange={(v) => setProfileData((p: any) => ({ ...p, phone: v }))} type="tel" />
                  <InputField label={t("settings.jobTitle")} value={profileData.title ?? ""} onChange={(v) => setProfileData((p: any) => ({ ...p, title: v }))} />
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.department")}</label>
                    <select
                      value={profileData.department ?? "Engineering"}
                      onChange={(e) => setProfileData((p: any) => ({ ...p, department: e.target.value }))}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 hover:border-neutral-700 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none appearance-none cursor-pointer transition-colors"
                    >
                      {profileData.department && !["Engineering", "Design", "Product", "QA", "Marketing"].includes(profileData.department) && (
                        <option>{profileData.department}</option>
                      )}
                      <option>Engineering</option>
                      <option>Design</option>
                      <option>Product</option>
                      <option>QA</option>
                      <option>Marketing</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.bio")}</label>
                    <textarea
                      rows={3}
                      value={profileData.bio ?? ""}
                      onChange={(e) => setProfileData((p: any) => ({ ...p, bio: e.target.value }))}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 hover:border-neutral-700 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors resize-none placeholder:text-neutral-600 font-['Lexend:Regular',_sans-serif]"
                    />
                    <p className="text-neutral-600 text-[11px] mt-1">{t("settings.visibleToTeammates")}</p>
                  </div>
                </div>
              </Section>
              <Section title={t("settings.socialLinks")} description={t("settings.socialLinksDesc")}>
                <div className="space-y-3">
                  <InputField label="GitHub" value={profileData.github ?? ""} onChange={(v) => setProfileData((p: any) => ({ ...p, github: v }))} placeholder="https://github.com/username" />
                  <InputField label="LinkedIn" value={profileData.linkedin ?? ""} onChange={(v) => setProfileData((p: any) => ({ ...p, linkedin: v }))} placeholder="https://linkedin.com/in/username" />
                </div>
              </Section>
              <SaveRow onSave={saveProfile} label={t("settings.saveChanges")} />
            </>
          )}

          {/* ── Security ── */}
          {activeNav === "Security" && (
            <>
              <Section title={t("settings.changePasswordSection")} description={t("settings.changePasswordDesc")}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.currentPassword")}</label>
                    <div className="relative">
                      <input
                        type={showCurrent ? "text" : "password"}
                        value={pw.current}
                        onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                        className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 pr-10 text-neutral-200 text-[13px] outline-none transition-colors font-['Lexend:Regular',_sans-serif]"
                      />
                      <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400 transition-colors">
                        {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.newPasswordField")}</label>
                    <div className="relative">
                      <input
                        type={showNext ? "text" : "password"}
                        value={pw.next}
                        onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                        className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 pr-10 text-neutral-200 text-[13px] outline-none transition-colors font-['Lexend:Regular',_sans-serif]"
                      />
                      <button onClick={() => setShowNext(!showNext)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400 transition-colors">
                        {showNext ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <div className="mt-2 flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={`flex-1 h-1 rounded-full transition-colors ${pw.next.length >= i * 3 ? (pw.next.length >= 12 ? "bg-emerald-500" : "bg-amber-500") : "bg-neutral-800"}`} />
                      ))}
                    </div>
                    <p className="text-neutral-600 text-[11px] mt-1">{t("settings.min12Chars")}</p>
                  </div>
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.confirmNewPassword")}</label>
                    <input
                      type="password"
                      value={pw.confirm}
                      onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors font-['Lexend:Regular',_sans-serif]"
                    />
                    {pw.confirm && pw.next !== pw.confirm && (
                      <p className="text-red-400 text-[11px] mt-1">{t("settings.passwordsDoNotMatch")}</p>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <button onClick={updatePassword} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-5 py-2 rounded-lg transition-colors">{t("settings.updatePassword")}</button>
                  </div>
                </div>
              </Section>

              <Section title={t("settings.twoFactorAuth")} description={t("settings.twoFactorAuthDesc")}>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400 shrink-0">
                      <Shield size={15} />
                    </div>
                    <div>
                      <div className="text-neutral-200 text-[13px]">{t("settings.authenticatorApp")}</div>
                      <div className="text-neutral-600 text-[12px]">{t("settings.authenticatorAppDesc")}</div>
                    </div>
                  </div>
                  <button onClick={() => setShow2FA(!show2FA)} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors shrink-0">
                    {show2FA ? t("common.cancel") : t("settings.setup2FA")}
                  </button>
                </div>
                {show2FA && (
                  <div className="p-4 bg-neutral-800/30 rounded-xl space-y-3">
                    <div className="flex justify-center">
                      <div className="w-24 h-24 bg-white rounded-lg flex items-center justify-center p-1">
                        <div className="grid grid-cols-5 gap-0.5 w-full h-full">
                          {Array.from({ length: 25 }).map((_, i) => (
                            <div key={i} className="rounded-[1px]" style={{ backgroundColor: [0, 6, 12, 18, 24, 1, 5, 7, 11, 13, 17, 19].includes(i) ? "#000" : "#fff" }} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="text-neutral-400 text-[12px] text-center">{t("settings.scanAuthenticator")}</p>
                    <div className="flex gap-2">
                      <input
                        type="text" maxLength={6} placeholder="000000" value={twoFACode}
                        onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, ""))}
                        className="flex-1 bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[14px] text-center tracking-widest outline-none transition-colors font-['Lexend:Regular',_sans-serif]"
                      />
                      <button onClick={verify2FA} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors">{t("settings.verify")}</button>
                    </div>
                  </div>
                )}
              </Section>

              <Section title={t("settings.activeSessions")} description={t("settings.activeSessionsDesc")}>
                <div className="space-y-2">
                  {(sessions.length > 0 ? sessions : [
                    { device: t("settings.loadingSessions"), location: "", ip: "", lastActive: "", current: true },
                  ]).map((s) => (
                    <div key={s.device} className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-neutral-200 text-[13px]">{s.device}</span>
                          {s.current && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400">{t("settings.current")}</span>}
                        </div>
                        <div className="text-neutral-600 text-[11px] mt-0.5">{s.location}{s.ip ? ` · ${s.ip}` : ""}{s.lastActive ? ` · ${s.lastActive}` : ""}</div>
                      </div>
                      {!s.current && (
                        <button onClick={async () => {
                          setSessions(prev => prev.filter(x => x.device !== s.device));
                          toast.success(`Session revoked: ${s.device}`);
                          try { await api.revokeSession(s.device); } catch (e) { console.log("Revoke failed:", e); }
                        }} className="text-red-400 hover:text-red-300 text-[12px] px-2.5 py-1 rounded-lg border border-red-900/40 hover:bg-red-950/30 transition-colors shrink-0">{t("settings.revoke")}</button>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              <Section title={t("settings.loginHistory")} description={t("settings.loginHistoryDesc")}>
                <div className="bg-[#141414] border border-neutral-800/60 rounded-xl overflow-hidden">
                  <div className="divide-y divide-neutral-800/40">
                    {loginHistory.map((l, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 items-center">
                        <div>
                          <div className="text-neutral-300 text-[12px]">{l.device}</div>
                          <div className="text-neutral-600 text-[11px] mt-0.5">{l.ip} · {l.date}</div>
                        </div>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${l.status === "success" ? "bg-emerald-900/40 text-emerald-400" : "bg-red-900/40 text-red-400"}`}>
                          {l.status === "success" ? t("settings.success") : t("settings.failed")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>

              <Section title={t("settings.securityPreferences")}>
                <div className="divide-y divide-neutral-800/40">
                  <ToggleRow label={t("settings.trustedDevices")} description={t("settings.trustedDevicesDesc")} defaultChecked />
                  <ToggleRow label={t("settings.loginNotifications")} description={t("settings.loginNotificationsDesc")} defaultChecked />
                  <ToggleRow label={t("settings.sessionTimeout")} description={t("settings.sessionTimeoutDesc")} />
                </div>
              </Section>
            </>
          )}

          {/* ── Notifications ── */}
          {activeNav === "Notifications" && (
            <>
              {(() => {
                const n = (key: keyof typeof notifState, label: string, description?: string) => (
                  <div className="flex items-center justify-between py-3 gap-4">
                    <div className="min-w-0">
                      <div className="text-neutral-200 text-[13px]">{label}</div>
                      {description && <div className="text-neutral-600 text-[12px] mt-0.5">{description}</div>}
                    </div>
                    <Toggle checked={notifState[key]} onChange={() => setNotifState((prev) => ({ ...prev, [key]: !prev[key] }))} />
                  </div>
                );
                return (
                  <>
                    <Section title="Notification Channels" description="Choose where you receive notifications.">
                      <div className="divide-y divide-neutral-800/40">
                        {n("inApp", "In-app notifications", "Show notification bell in the sidebar")}
                        {n("email", "Email notifications", "Receive summaries and alerts by email")}
                        {n("slack", "Slack notifications", "Push to your connected Slack workspace")}
                        {n("browser", "Browser push notifications", "Desktop alerts when the app is in background")}
                      </div>
                    </Section>
                    <Section title="Tasks">
                      <div className="divide-y divide-neutral-800/40">
                        {n("taskAssigned", "Task assigned to me")}
                        {n("taskDue", "Task due today")}
                        {n("taskStatus", "Task status changed", "When a task I own moves to a new status")}
                        {n("comments", "Comments on my tasks")}
                        {n("mentions", "Mentions in comments")}
                      </div>
                    </Section>
                    <Section title="Projects">
                      <div className="divide-y divide-neutral-800/40">
                        {n("projectStatus", "Project status changes")}
                        {n("newMember", "New member added to project")}
                        {n("milestone", "Milestone deadline approaching", "3 days before a milestone is due")}
                      </div>
                    </Section>
                    <Section title="Team & Workspace">
                      <div className="divide-y divide-neutral-800/40">
                        {n("teamMember", "New team member joined", "When someone joins your workspace")}
                        {n("announcements", "Team announcements")}
                      </div>
                    </Section>
                    <Section title="Digest & Updates">
                      <div className="divide-y divide-neutral-800/40">
                        {n("digest", "Weekly activity digest", "Summary every Monday morning")}
                        {n("productUpdates", "Product & feature updates")}
                        {n("security", "Security & compliance alerts")}
                      </div>
                    </Section>
                    <SaveRow onSave={saveNotifications} />
                  </>
                );
              })()}
            </>
          )}

          {/* ── Workspace ── */}
          {activeNav === "Workspace" && (
            <>
              <Section title="Workspace Identity" description="Settings visible to all workspace members.">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-indigo-900/60 flex items-center justify-center text-indigo-300 text-[20px] font-['Lexend:SemiBold',_sans-serif] shrink-0">{workspaceData.name?.[0]?.toUpperCase() ?? "?"}</div>
                    <div>
                      <button onClick={() => toast.success("Logo upload coming soon")} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors">Upload logo</button>
                      <p className="text-neutral-600 text-[11px] mt-1">PNG or SVG · 512×512 recommended</p>
                    </div>
                  </div>
                  <InputField label="Workspace name" value={workspaceData.name ?? ""} onChange={(v) => setWorkspaceData((p: any) => ({ ...p, name: v }))} />
                  <InputField label="Workspace URL" value={workspaceData.url ?? ""} onChange={(v) => setWorkspaceData((p: any) => ({ ...p, url: v }))} hint="Changing this will break all existing shared links." />
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">Industry</label>
                    <select
                      value={workspaceData.industry ?? "Software / Technology"}
                      onChange={(e) => setWorkspaceData((p: any) => ({ ...p, industry: e.target.value }))}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none appearance-none cursor-pointer"
                    >
                      {workspaceData.industry && !["Software / Technology", "Design & Creative", "Finance", "Healthcare", "E-commerce"].includes(workspaceData.industry) && (
                        <option>{workspaceData.industry}</option>
                      )}
                      <option>Software / Technology</option>
                      <option>Design & Creative</option>
                      <option>Finance</option>
                      <option>Healthcare</option>
                      <option>E-commerce</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">Team size</label>
                    <select
                      value={workspaceData.teamSize ?? "1–10"}
                      onChange={(e) => setWorkspaceData((p: any) => ({ ...p, teamSize: e.target.value }))}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none appearance-none cursor-pointer"
                    >
                      {workspaceData.teamSize && !["1–10", "11–50", "51–200", "200+"].includes(workspaceData.teamSize) && (
                        <option>{workspaceData.teamSize}</option>
                      )}
                      <option>1–10</option>
                      <option>11–50</option>
                      <option>51–200</option>
                      <option>200+</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">Data region</label>
                    <select
                      value={workspaceData.region ?? "United States (US-East)"}
                      onChange={(e) => setWorkspaceData((p: any) => ({ ...p, region: e.target.value }))}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none appearance-none cursor-pointer"
                    >
                      {workspaceData.region && !["United States (US-East)", "Europe (EU-West)", "Asia-Pacific (AP-Southeast)"].includes(workspaceData.region) && (
                        <option>{workspaceData.region}</option>
                      )}
                      <option>United States (US-East)</option>
                      <option>Europe (EU-West)</option>
                      <option>Asia-Pacific (AP-Southeast)</option>
                    </select>
                  </div>
                </div>
              </Section>
              <Section title="Workspace Preferences">
                <div className="divide-y divide-neutral-800/40">
                  <ToggleRow label="Show completed tasks" description="Display completed tasks in all task lists" />
                  <ToggleRow label="Compact view" description="Reduce spacing in task and file lists" />
                  <ToggleRow label="Allow public project links" description="Members can share project links externally" defaultChecked />
                  <ToggleRow label="Require 2FA for all members" description="Enforce two-factor auth workspace-wide" />
                  <ToggleRow label="Guest access" description="Allow external collaborators with limited access" defaultChecked />
                </div>
              </Section>
              <SaveRow onSave={async () => {
                try { await api.saveSettings("workspace", { name: "", url: "", industry: "", teamSize: "", region: "", ...workspaceData }); toast.success("Workspace settings saved"); }
                catch (e) { console.log("Failed to save workspace:", e); toast.error("Failed to save"); }
              }} />
            </>
          )}

          {/* ── Appearance ── */}
          {activeNav === "Appearance" && (
            <>
              <Section title="Theme" description="Choose your preferred color scheme.">
                <div className="grid grid-cols-3 gap-3">
                  {(["dark", "light", "system"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTheme(t); toast.success(`Theme set to ${t}`); }}
                      className={`relative p-3 rounded-xl border transition-all text-left ${theme === t ? "border-indigo-500 bg-indigo-950/20" : "border-neutral-800 hover:border-neutral-700"}`}
                    >
                      <div className={`h-14 rounded-lg mb-2.5 overflow-hidden ${t === "dark" ? "bg-neutral-900" : t === "light" ? "bg-neutral-200" : "bg-gradient-to-br from-neutral-900 to-neutral-200"}`}>
                        <div className={`h-3 w-full ${t === "dark" ? "bg-neutral-800" : t === "light" ? "bg-neutral-300" : "bg-gradient-to-r from-neutral-800 to-neutral-300"}`} />
                        <div className="p-1.5 space-y-1">
                          {[1, 2].map((i) => (
                            <div key={i} className={`h-1.5 rounded-full ${t === "dark" ? "bg-neutral-700" : t === "light" ? "bg-neutral-400" : "bg-neutral-500"}`} style={{ width: i === 1 ? "80%" : "60%" }} />
                          ))}
                        </div>
                      </div>
                      <div className="text-neutral-200 text-[12px] capitalize">{t}</div>
                      {theme === t && <Check size={12} className="absolute top-2.5 right-2.5 text-indigo-400" />}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title="Accent Color" description="Used for buttons, highlights, and active states.">
                <div className="flex items-center gap-3">
                  {accentColors.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => { setAccentColor(c.value); toast.success(`Accent: ${c.label}`); }}
                      title={c.label}
                      className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${accentColor === c.value ? "ring-2 ring-offset-2 ring-offset-[#0f0f0f] ring-white/30 scale-110" : ""}`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </Section>
              <Section title="Font Size">
                <div className="flex items-center gap-2">
                  {(["small", "medium", "large"] as const).map((s) => (
                    <button key={s} onClick={() => setFontSize(s)}
                      className={`flex-1 py-2 rounded-lg text-[12px] capitalize border transition-colors ${fontSize === s ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title="Density" description="Controls spacing throughout the interface.">
                <div className="flex items-center gap-2">
                  {(["compact", "comfortable", "spacious"] as const).map((d) => (
                    <button key={d} onClick={() => setDensity(d)}
                      className={`flex-1 py-2 rounded-lg text-[12px] capitalize border transition-colors ${density === d ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title="Sidebar Position">
                <div className="flex items-center gap-2">
                  {["Left", "Right"].map((p, i) => (
                    <button key={p} onClick={() => toast.success(`Sidebar position: ${p}`)}
                      className={`flex-1 py-2 rounded-lg text-[12px] border transition-colors ${i === 0 ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title={t("settings.language")} description={t("settings.chooseLanguage")}>
                <div className="flex items-center gap-4">
                  <LangToggle lang={lang} onChange={setLang} />
                </div>
              </Section>
              <SaveRow onSave={saveAppearance} />
            </>
          )}

          {/* ── Timezone ── */}
          {activeNav === "Timezone" && (
            <>
              <Section title="Time Zone" description="Used for task deadlines, calendar events, and timestamps.">
                <div className="space-y-4">
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">Time zone</label>
                    <select className="w-full bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none appearance-none cursor-pointer">
                      <option>Asia/Jakarta (UTC+7)</option>
                      <option>Asia/Singapore (UTC+8)</option>
                      <option>Asia/Tokyo (UTC+9)</option>
                      <option>America/New_York (UTC-5)</option>
                      <option>America/Los_Angeles (UTC-8)</option>
                      <option>Europe/London (UTC+0)</option>
                      <option>Europe/Paris (UTC+1)</option>
                      <option>Australia/Sydney (UTC+11)</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-neutral-200 text-[13px]">Auto-detect timezone</div>
                      <div className="text-neutral-600 text-[12px] mt-0.5">Use your browser's timezone automatically</div>
                    </div>
                    <Toggle checked={false} onChange={() => toast.success("Auto-detect enabled")} />
                  </div>
                </div>
              </Section>
              <Section title="Date Format">
                <div className="space-y-1">
                  {[
                    { fmt: "MM/DD/YYYY", preview: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
                    { fmt: "DD/MM/YYYY", preview: `${new Date().getDate()} ${new Date().toLocaleDateString("en-US", { month: "short" })} ${new Date().getFullYear()}` },
                    { fmt: "YYYY-MM-DD", preview: new Date().toISOString().slice(0, 10) },
                  ].map(({ fmt, preview }) => (
                    <label key={fmt} className="flex items-center gap-3 py-2 cursor-pointer">
                      <div
                        onClick={() => setDateFormat(fmt)}
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer ${dateFormat === fmt ? "border-indigo-500" : "border-neutral-700"}`}
                      >
                        {dateFormat === fmt && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                      </div>
                      <span className="text-neutral-300 text-[13px]">{fmt}</span>
                      <span className="text-neutral-600 text-[12px] ml-auto">{preview}</span>
                    </label>
                  ))}
                </div>
              </Section>
              <Section title="Time Format">
                <div className="flex items-center gap-2">
                  {[{ val: "12h", label: "12-hour (3:00 PM)" }, { val: "24h", label: "24-hour (15:00)" }].map((f) => (
                    <button key={f.val} onClick={() => setTimeFormat(f.val)}
                      className={`flex-1 py-2.5 rounded-lg text-[12px] border transition-colors ${timeFormat === f.val ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title="First Day of Week">
                <div className="flex items-center gap-2">
                  {["Sunday", "Monday", "Saturday"].map((d) => (
                    <button key={d} onClick={() => setWeekStart(d)}
                      className={`flex-1 py-2 rounded-lg text-[12px] border transition-colors ${weekStart === d ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </Section>
              <SaveRow onSave={saveTimezone} />
            </>
          )}

          {/* ── Default Notifications ── */}
          {activeNav === "Default Notifications" && (
            <>
              <Section title="Workspace Defaults" description="These settings apply to all new workspace members. Members can override them individually.">
                <div className="mb-4 px-3 py-2.5 bg-neutral-800/40 rounded-lg text-neutral-500 text-[12px]">
                  Changes here apply to new members going forward, not existing ones.
                </div>
                <div className="divide-y divide-neutral-800/40">
                  <ToggleRow label="Task assigned" defaultChecked />
                  <ToggleRow label="Task due today" defaultChecked />
                  <ToggleRow label="Comments and mentions" defaultChecked />
                  <ToggleRow label="Project status changes" />
                  <ToggleRow label="New team member added" />
                  <ToggleRow label="Weekly digest email" defaultChecked />
                  <ToggleRow label="Product updates" />
                  <ToggleRow label="Security alerts" defaultChecked />
                </div>
              </Section>
              <div className="flex items-center justify-between">
                <button onClick={() => toast.success("Defaults reset to system values")} className="text-neutral-500 hover:text-neutral-300 text-[13px] flex items-center gap-1.5 transition-colors">
                  <RefreshCw size={13} /> Reset to system defaults
                </button>
                <button onClick={async () => {
                  try {
                    await api.saveSettings("default-notifications", {
                      taskAssigned: true, taskDue: true, comments: true, projectStatus: false,
                      newMember: false, digest: true, productUpdates: false, security: true,
                    });
                    toast.success("Default notification settings saved");
                  } catch (e) { console.log("Failed to save defaults:", e); toast.error("Failed to save"); }
                }} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-5 py-2 rounded-lg transition-colors">
                  Save defaults
                </button>
              </div>
            </>
          )}

          {/* ── Members ── */}
          {activeNav === "Members" && (
            <>
              <Section title="Members & Permissions" description={`${members.length} active members in this workspace.`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-neutral-500 text-[12px]">Manage roles and access levels</div>
                  <button onClick={() => setShowInvite(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                    <Plus size={13} /> Invite member
                  </button>
                </div>
                <div className="bg-[#141414] border border-neutral-800/60 rounded-xl overflow-hidden">
                  <div className="hidden md:grid grid-cols-[1fr_100px_80px_32px] gap-4 px-4 py-2.5 border-b border-neutral-800/40">
                    {["Member", "Role", "Status", ""].map((h) => (
                      <div key={h} className="text-neutral-600 text-[11px] uppercase tracking-wider">{h}</div>
                    ))}
                  </div>
                  <div className="divide-y divide-neutral-800/40">
                    {members.map((m) => (
                      <div key={m.initials} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_100px_80px_32px] gap-3 md:gap-4 px-4 py-3 items-center">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-indigo-900/60 flex items-center justify-center text-indigo-300 text-[11px] font-['Lexend:SemiBold',_sans-serif] shrink-0">{m.initials}</div>
                          <div className="min-w-0">
                            <div className="text-neutral-200 text-[13px] truncate">{m.name}</div>
                            <div className="text-neutral-600 text-[11px] truncate">{m.email}</div>
                          </div>
                        </div>
                        <select
                          value={memberRoles[m.initials]}
                          disabled={m.role === "Owner"}
                          onChange={async (e) => {
                            const newRole = e.target.value;
                            const updated = members.map((x) => x.initials === m.initials ? { ...x, role: newRole } : x);
                            setMemberRoles((prev) => ({ ...prev, [m.initials]: newRole }));
                            setMembers(updated);
                            toast.success(`${m.name} role updated to ${newRole}`);
                            await saveMembers(updated);
                          }}
                          className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-[12px] px-2 py-1.5 rounded-lg outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {["Owner", "Admin", "Member", "Viewer"].map((r) => <option key={r}>{r}</option>)}
                        </select>
                        <div className="hidden md:flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.status === "online" ? "#10b981" : m.status === "away" ? "#f59e0b" : "#404040" }} />
                          <span className="text-neutral-500 text-[12px] capitalize">{m.status}</span>
                        </div>
                        <button
                          disabled={m.role === "Owner"}
                          onClick={async () => { const updated = members.filter((x) => x.initials !== m.initials); setMembers(updated); toast.success(`${m.name} removed`); await saveMembers(updated); }}
                          className="text-neutral-600 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
              <Section title="Pending Invites" description="Awaiting acceptance.">
                <div className="space-y-2">
                  {pendingList.map((inv) => (
                    <div key={inv.email} className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl gap-3">
                      <div>
                        <div className="text-neutral-300 text-[13px]">{inv.email}</div>
                        <div className="text-neutral-600 text-[11px] mt-0.5">{inv.role} · Sent {inv.sent}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={async () => {
                          const updated = pendingList.map((p) => p.email === inv.email ? { ...p, sent: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) } : p);
                          setPendingList(updated);
                          toast.success(`Invite resent to ${inv.email}`);
                          await saveMembers(members, updated);
                        }} className="text-neutral-400 hover:text-neutral-200 text-[12px] px-2.5 py-1 rounded-lg border border-neutral-800 hover:bg-neutral-800 transition-colors">Resend</button>
                        <button onClick={async () => {
                          const updated = pendingList.filter((p) => p.email !== inv.email);
                          setPendingList(updated);
                          toast.success(`Invite to ${inv.email} cancelled`);
                          await saveMembers(members, updated);
                        }} className="text-red-400 hover:text-red-300 text-[12px] px-2.5 py-1 rounded-lg border border-red-900/40 hover:bg-red-950/30 transition-colors">Cancel</button>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}

          {/* ── Billing ── */}
          {activeNav === "Billing" && (
            <>
              <Section title="Current Plan" description={`Your workspace is on the ${billing?.plan ?? "—"} plan.`}>
                <div className="p-4 bg-indigo-950/20 border border-indigo-800/40 rounded-xl mb-3">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-neutral-50 text-[16px] font-['Lexend:SemiBold',_sans-serif] mb-0.5">{billing?.plan ?? "—"} Plan</div>
                      <div className="text-neutral-400 text-[13px]">${billing?.price ?? 0} per seat / month · {billing?.seats ?? 0} seats</div>
                    </div>
                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-indigo-900/60 text-indigo-300 shrink-0">Active</span>
                  </div>
                  <div className="text-neutral-500 text-[12px] mb-4">Next billing: <span className="text-neutral-300">{billing?.nextBilling ?? "—"}</span> · <span className="text-neutral-300">{billing ? `$${(billing.price * billing.seats).toFixed(2)}` : "—"}</span></div>
                  <button onClick={() => toast.success("Upgrade flow coming soon")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors">
                    Upgrade to Enterprise
                  </button>
                </div>
              </Section>
              <Section title="Usage" description="Current usage against your plan limits.">
                {(() => {
                  const usedGB = quota ? (quota.unlimited ? "∞" : (quota.used / (1024 * 1024 * 1024)).toFixed(2)) : "—";
                  const limitGB = quota ? (quota.unlimited ? "∞" : (quota.limit / (1024 * 1024 * 1024)).toFixed(0)) : "—";
                  const pct = quota && !quota.unlimited && quota.limit > 0 ? Math.round((quota.used / quota.limit) * 100) : 0;
                  return (
                    <div className="space-y-4">
                      {[
                        { label: "Members", used: billing?.usage?.members ?? 0, limit: billing?.usage?.memberLimit ?? 0, color: "#818cf8" },
                        { label: "Active projects", used: billing?.usage?.projects ?? 0, limit: billing?.usage?.projectLimit ?? 0, color: "#34d399" },
                        { label: "Storage", used: usedGB, limit: limitGB, unit: " GB", color: "#f59e0b", pct },
                      ].map((u: any) => (
                        <div key={u.label}>
                          <div className="flex justify-between text-[12px] mb-1.5">
                            <span className="text-neutral-400">{u.label}</span>
                            <span className="text-neutral-300">{u.used}{u.unit} <span className="text-neutral-600">/ {u.limit}{u.unit}</span></span>
                          </div>
                          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(typeof u.pct === 'number' ? u.pct : (u.used / Math.max(u.limit, 1)) * 100, 100)}%`, backgroundColor: u.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </Section>
              <Section title="Payment Method">
                <div className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400">
                      <CreditCard size={16} />
                    </div>
                    <div>
                      <div className="text-neutral-200 text-[13px]">{billing?.payment?.brand ?? "Card"} ending in {billing?.payment?.last4 ?? "····"}</div>
                      <div className="text-neutral-600 text-[11px]">Expires {billing?.payment?.expiry ?? "—"}</div>
                    </div>
                  </div>
                  <button onClick={() => toast.success("Payment method update coming soon")} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 text-[12px] px-3 py-1.5 rounded-lg transition-colors">Update</button>
                </div>
              </Section>
              <Section title="Billing History">
                <div className="bg-[#141414] border border-neutral-800/60 rounded-xl overflow-hidden">
                  <div className="divide-y divide-neutral-800/40">
                    {(billing?.invoices ?? []).map((inv: any) => (
                      <div key={inv.date} className="grid grid-cols-[1fr_80px_60px_32px] gap-4 px-4 py-3 items-center">
                        <div>
                          <div className="text-neutral-300 text-[13px]">{billing?.plan ?? "—"} · {billing?.seats ?? 0} seats</div>
                          <div className="text-neutral-600 text-[11px] mt-0.5">{inv.date}</div>
                        </div>
                        <div className="text-neutral-50 text-[13px] font-['Lexend:SemiBold',_sans-serif]">{inv.amount}</div>
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 text-center">{inv.status}</span>
                        <button onClick={() => toast.success("Invoice downloaded")} className="text-neutral-600 hover:text-neutral-400 transition-colors">
                          <Download size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            </>
          )}

          {/* ── Integrations ── */}
          {activeNav === "Integrations" && (
            <Section title="Integrations" description="Connect external tools and services to your workspace.">
              <div className="space-y-3">
                {integrations.map((integration) => (
                  <div key={integration.name} className="p-3 lg:p-4 bg-[#141414] border border-neutral-800/60 rounded-xl">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400 shrink-0">{integration.icon}</div>
                        <div className="min-w-0">
                          <div className="text-neutral-200 text-[13px]">{integration.name}</div>
                          <div className="text-neutral-600 text-[11px] mt-0.5">{integration.description}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {integration.connected && (
                          <button onClick={() => toast.success(`${integration.name} configure`)} className="text-neutral-600 hover:text-neutral-400 transition-colors">
                            <ExternalLink size={13} />
                          </button>
                        )}
                        {integration.connected ? (
                          <button onClick={() => toggleIntegration(integration.name)} className="text-neutral-500 hover:text-neutral-300 text-[12px] px-2.5 py-1 rounded-lg border border-neutral-800 hover:bg-neutral-800 transition-colors">Disconnect</button>
                        ) : (
                          <button onClick={() => toggleIntegration(integration.name)} className="text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 transition-colors">Connect</button>
                        )}
                      </div>
                    </div>
                    {integration.connected && (
                      <div className="mt-2.5 pt-2.5 border-t border-neutral-800/40 flex items-center gap-4 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span className="text-emerald-400">Connected · synced {integration.lastSync}</span>
                        </div>
                        <span className="text-neutral-700">·</span>
                        <span className="text-neutral-600">Scopes: {integration.scopes}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── API Keys ── */}
          {activeNav === "API Keys" && (
            <>
              <Section title="API Keys" description="Use these keys to authenticate API requests from your applications.">
                <div className="bg-[#141414] border border-neutral-800/60 rounded-xl overflow-hidden mb-3">
                  <div className="hidden md:grid grid-cols-[1fr_100px_100px_auto] gap-4 px-4 py-2.5 border-b border-neutral-800/40">
                    {["Name", "Created", "Last used", ""].map((h) => (
                      <div key={h} className="text-neutral-600 text-[11px] uppercase tracking-wider">{h}</div>
                    ))}
                  </div>
                  {apiKeysList.map((k) => (
                    <div key={k.name} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_100px_100px_auto] gap-3 md:gap-4 px-4 py-3 border-b border-neutral-800/40 last:border-0 items-center">
                      <div>
                        <div className="text-neutral-200 text-[13px]">{k.name}</div>
                        <div className="text-neutral-600 text-[11px] mt-0.5 font-mono">{k.prefix}</div>
                      </div>
                      <div className="hidden md:block text-neutral-500 text-[12px]">{k.created}</div>
                      <div className="hidden md:block text-neutral-500 text-[12px]">{k.lastUsed}</div>
                      <button onClick={() => revokeKey(k.name)} className="text-red-400 hover:text-red-300 text-[12px] px-2.5 py-1 rounded-lg border border-red-900/40 hover:bg-red-950/30 transition-colors whitespace-nowrap">Revoke</button>
                    </div>
                  ))}
                  {apiKeysList.length === 0 && (
                    <div className="px-4 py-6 text-center text-neutral-600 text-[13px]">No active API keys</div>
                  )}
                </div>

                {!showNewKey ? (
                  <button onClick={() => setShowNewKey(true)} className="flex items-center gap-2 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[13px] px-4 py-2 rounded-lg transition-colors">
                    <Plus size={14} /> Generate new key
                  </button>
                ) : generatedKey ? (
                  <div className="p-4 bg-emerald-950/20 border border-emerald-800/40 rounded-xl space-y-3">
                    <div className="text-emerald-300 text-[13px] font-['Lexend:SemiBold',_sans-serif]">Key generated — copy it now</div>
                    <p className="text-neutral-500 text-[12px]">This key will not be shown again. Store it securely.</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2 text-emerald-300 text-[12px] font-mono truncate">{generatedKey}</code>
                      <button onClick={copyKey} className="shrink-0 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 px-2.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 text-[12px]">
                        {keyCopied ? <><Check size={13} className="text-emerald-400" /> Copied</> : <><Copy size={13} /> Copy</>}
                      </button>
                    </div>
                    <button onClick={() => { setShowNewKey(false); setGeneratedKey(null); setNewKeyName(""); }} className="text-neutral-500 hover:text-neutral-300 text-[12px] transition-colors">Done</button>
                  </div>
                ) : (
                  <div className="p-4 bg-neutral-800/30 border border-neutral-800 rounded-xl space-y-3">
                    <div>
                      <label className="block text-neutral-300 text-[13px] mb-1.5">Key name</label>
                      <input
                        type="text"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="e.g. Production, CI/CD pipeline"
                        className="w-full bg-[#0f0f0f] border border-neutral-800 hover:border-neutral-700 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-600 font-['Lexend:Regular',_sans-serif]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={generateApiKey} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors">Generate</button>
                      <button onClick={() => { setShowNewKey(false); setNewKeyName(""); }} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 text-[13px] px-4 py-2 rounded-lg transition-colors">Cancel</button>
                    </div>
                  </div>
                )}
              </Section>

              <Section title="Webhooks" description="Receive HTTP POST requests when events occur in your workspace.">
                <div className="space-y-2 mb-3">
                  {webhooksList.map((w, i) => (
                    <div key={i} className="p-3 bg-[#141414] border border-neutral-800/60 rounded-xl">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-neutral-200 text-[12px] font-mono truncate">{w.url}</div>
                          <div className="text-neutral-600 text-[11px] mt-1">Events: {w.events}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Toggle checked={w.active} onChange={() => toggleWebhook(i)} />
                          <button onClick={() => deleteWebhook(i)} className="text-neutral-600 hover:text-red-400 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {!showWebhookForm ? (
                  <button onClick={() => setShowWebhookForm(true)} className="flex items-center gap-2 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[13px] px-4 py-2 rounded-lg transition-colors">
                    <Plus size={14} /> Add webhook
                  </button>
                ) : (
                  <div className="p-4 bg-neutral-800/30 border border-neutral-800 rounded-xl space-y-3">
                    <div>
                      <label className="block text-neutral-300 text-[13px] mb-1.5">Endpoint URL</label>
                      <input
                        type="url"
                        value={newWebhookUrl}
                        onChange={(e) => setNewWebhookUrl(e.target.value)}
                        placeholder="https://example.com/webhook"
                        className="w-full bg-[#0f0f0f] border border-neutral-800 hover:border-neutral-700 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-600 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-neutral-300 text-[13px] mb-1.5">Events (comma-separated)</label>
                      <input
                        type="text"
                        value={newWebhookEvents}
                        onChange={(e) => setNewWebhookEvents(e.target.value)}
                        placeholder="task.created, task.completed"
                        className="w-full bg-[#0f0f0f] border border-neutral-800 hover:border-neutral-700 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-600 font-['Lexend:Regular',_sans-serif]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addWebhook} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors">Add webhook</button>
                      <button onClick={() => { setShowWebhookForm(false); setNewWebhookUrl(""); setNewWebhookEvents(""); }} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 text-[13px] px-4 py-2 rounded-lg transition-colors">Cancel</button>
                    </div>
                  </div>
                )}
              </Section>
            </>
          )}

          {/* ── Audit Log ── */}
          {activeNav === "Audit Log" && (
            <Section title="Audit Log" description="All security and administrative actions in your workspace.">
              <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-0.5">
                {["All", "Security", "Members", "Integrations", "API", "Settings"].map((f) => (
                  <button key={f} onClick={() => setAuditFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] whitespace-nowrap transition-colors ${auditFilter === f ? "bg-neutral-800 text-neutral-50" : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/40"}`}>
                    {f}
                  </button>
                ))}
              </div>
              <div className="bg-[#141414] border border-neutral-800/60 rounded-xl overflow-hidden">
                <div className="divide-y divide-neutral-800/40">
                  {filteredLogs.map((log, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-neutral-800/10 transition-colors">
                      <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-400 shrink-0 mt-0.5">{log.actor}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <span className="text-neutral-300 text-[12px]">{log.name}</span>
                            <span className="text-neutral-600 text-[12px]"> · {log.action}</span>
                            {log.target && <span className="text-neutral-500 text-[12px]"> → <span className="text-neutral-400">{log.target}</span></span>}
                          </div>
                          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${
                            log.category === "Security" ? "bg-red-900/30 text-red-400" :
                            log.category === "Members" ? "bg-blue-900/30 text-blue-400" :
                            log.category === "API" ? "bg-amber-900/30 text-amber-400" :
                            log.category === "Integrations" ? "bg-purple-900/30 text-purple-400" :
                            "bg-neutral-800 text-neutral-500"
                          }`}>{log.category}</span>
                        </div>
                        <div className="text-neutral-700 text-[11px] mt-0.5">{log.ip} · {log.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => toast.success("No older entries available")} className="w-full mt-3 py-2 text-neutral-600 hover:text-neutral-400 text-[12px] transition-colors">
                Load more
              </button>
            </Section>
          )}

          {/* ── Data & Export ── */}
          {activeNav === "Data & Export" && (
            <>
              <Section title="Export Data" description="Download your workspace data in CSV or JSON format.">
                <div className="space-y-3">
                  {[
                    { label: "All tasks", description: "Titles, assignees, statuses, due dates" },
                    { label: "All projects", description: "Project details, milestones, team members" },
                    { label: "Team data", description: "Member list, roles, activity summary" },
                    { label: "Files & attachments", description: "Metadata and download links" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl gap-3 flex-wrap">
                      <div>
                        <div className="text-neutral-200 text-[13px]">{item.label}</div>
                        <div className="text-neutral-600 text-[11px] mt-0.5">{item.description}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={exportFormats[item.label]}
                          onChange={(e) => setExportFormats((prev) => ({ ...prev, [item.label]: e.target.value }))}
                          className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-[12px] px-2 py-1 rounded-lg outline-none cursor-pointer"
                        >
                          <option>CSV</option>
                          <option>JSON</option>
                        </select>
                        <button onClick={() => handleExport(item.label)} className="flex items-center gap-1.5 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors">
                          <Download size={13} /> Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title="Data Retention" description="Control how long data is kept in your workspace.">
                <div className="divide-y divide-neutral-800/40">
                  <ToggleRow label="Auto-archive completed tasks" description="Archive tasks after 90 days of completion" defaultChecked />
                  <ToggleRow label="Auto-delete archived files" description="Permanently remove archived files after 365 days" />
                  <ToggleRow label="Retain audit logs" description="Keep audit log history for 12 months" defaultChecked />
                </div>
              </Section>
              <Section title="Privacy & GDPR">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl gap-3">
                    <div>
                      <div className="text-neutral-200 text-[13px]">Download personal data</div>
                      <div className="text-neutral-600 text-[11px] mt-0.5">A copy of all data associated with your account</div>
                    </div>
                    <button onClick={() => toast.success("Data download requested — you'll receive an email within 24h")} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors shrink-0">Request download</button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl gap-3">
                    <div>
                      <div className="text-neutral-200 text-[13px]">Request data deletion</div>
                      <div className="text-neutral-600 text-[11px] mt-0.5">Permanently remove all your personal data</div>
                    </div>
                    <button onClick={() => toast.error("Contact support to initiate data deletion")} className="border border-red-900/40 hover:bg-red-950/30 text-red-400 hover:text-red-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors shrink-0">Request deletion</button>
                  </div>
                </div>
              </Section>
            </>
          )}

          {/* ── Danger Zone ── */}
          {activeNav === "Danger Zone" && (
            <div className="space-y-4">
              <div className="pb-4 border-b border-neutral-800/40">
                <h2 className="text-neutral-50 text-[14px] lg:text-[15px] font-['Lexend:SemiBold',_sans-serif] mb-1">Danger Zone</h2>
                <p className="text-neutral-500 text-[12px]">These actions are irreversible. Proceed with extreme caution.</p>
              </div>

              <div className="p-4 border border-neutral-800/60 rounded-xl space-y-4">
                <div>
                  <div className="text-neutral-200 text-[14px] font-['Lexend:SemiBold',_sans-serif] mb-1">Transfer Ownership</div>
                  <div className="text-neutral-500 text-[12px]">Transfer workspace ownership to another admin. You will lose owner privileges.</div>
                </div>
                <div>
                  <label className="block text-neutral-300 text-[13px] mb-1.5">New owner</label>
                  <select className="w-full bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none appearance-none cursor-pointer">
                    {members.filter((m) => m.role === "Admin").length > 0 ? (
                      members.filter((m) => m.role === "Admin").map((m) => (
                        <option key={m.initials}>{m.name} ({m.email})</option>
                      ))
                    ) : (
                      <option>No admins found</option>
                    )}
                  </select>
                </div>
                <button onClick={() => toast.success("Ownership transfer request sent — the new owner must accept via email")} className="border border-amber-800/60 hover:bg-amber-950/30 text-amber-400 hover:text-amber-300 text-[13px] px-4 py-2 rounded-lg transition-colors">
                  Transfer ownership
                </button>
              </div>

              <div className="p-4 border border-red-900/30 rounded-xl space-y-4">
                <div>
                  <div className="text-neutral-200 text-[14px] font-['Lexend:SemiBold',_sans-serif] mb-1">Reset Workspace Data</div>
                  <div className="text-neutral-500 text-[12px]">Permanently delete all tasks, projects, files, and settings. Members and billing are preserved.</div>
                </div>
                <div>
                  <label className="block text-neutral-500 text-[12px] mb-1.5">Type <span className="text-neutral-300 font-mono">RESET</span> to confirm</label>
                  <input
                    type="text"
                    value={dangerReset}
                    onChange={(e) => setDangerReset(e.target.value)}
                    placeholder="RESET"
                    className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-red-600/40 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-700 font-mono"
                  />
                </div>
                <button
                  disabled={dangerReset !== "RESET"}
                  onClick={async () => {
                    try {
                      await api.resetWorkspaceData();
                      toast.success("Workspace data has been reset. Refresh to see changes.");
                      setDangerReset("");
                    } catch (e) { console.log("Failed to reset workspace:", e); toast.error("Failed to reset workspace data"); }
                  }}
                  className="border border-red-800/60 hover:bg-red-950/30 text-red-400 hover:text-red-300 text-[13px] px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <AlertTriangle size={14} /> Reset workspace data
                </button>
              </div>

              <div className="p-4 border border-red-900/30 rounded-xl space-y-4">
                <div>
                  <div className="text-neutral-200 text-[14px] font-['Lexend:SemiBold',_sans-serif] mb-1">Delete Account</div>
                  <div className="text-neutral-500 text-[12px]">Permanently delete your account and all associated data. This cannot be undone.</div>
                </div>
                <div>
                  <label className="block text-neutral-500 text-[12px] mb-1.5">Type your email <span className="text-neutral-300 font-mono">{profileData.email ?? "your email"}</span> to confirm</label>
                  <input
                    type="email"
                    value={dangerEmail}
                    onChange={(e) => setDangerEmail(e.target.value)}
                    placeholder={profileData.email ?? "your email"}
                    className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-red-600/40 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-700 font-['Lexend:Regular',_sans-serif]"
                  />
                </div>
                <button
                  disabled={!profileData.email || dangerEmail !== profileData.email}
                  onClick={() => toast.error("Account deletion is disabled in this demo")}
                  className="bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 size={14} /> Delete my account
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      <InviteMemberModal open={showInvite} onClose={() => setShowInvite(false)} onInvite={async (teamName, member) => {
        const newMember = { initials: member.initials, name: member.name, email: "", role: "Member", status: "online", joined: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) };
        const updated = [...members, newMember];
        setMembers(updated);
        setMemberRoles((prev) => ({ ...prev, [member.initials]: "Member" }));
        toast.success(`${member.name} added`);
        await saveMembers(updated);
      }} />
    </div>
  );
}
