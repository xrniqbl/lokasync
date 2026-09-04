import { logger } from "../utils/logger";
﻿import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import {
  Github, Figma, MessageSquare, CalendarDays,
  Download, Shield, Mail,
  Eye, EyeOff, Copy, Check, Trash2, RefreshCw,
  X, Plus, Zap, BookOpen, Video, Layers, ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router";
import { useNavigation } from "./NavigationContext";
import { InviteMemberModal } from "./modals/InviteMemberModal";
import { detectLang, persistLang, type Lang } from "../i18n";
import { useLang } from "../LangContext";
import { useAppearance, ACCENT_FAMILY_TO_LABEL, type AccentFamily, type FontSize } from "../AppearanceContext";
import { useSubscription } from "../subscription/SubscriptionContext";

const idrFmt = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const billingDateFmt = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
import * as api from "../utils/api";
import { supabase, updatePassword as updateSupabasePassword } from "../utils/supabase";

// Parse a human-readable "Browser on OS" label from the current user agent.
// Best-effort: Supabase doesn't expose per-device sessions, so this only ever
// describes the browser the user is currently signed in from.
function parseCurrentDevice(ua: string): string {
  const browser =
    /edg\//i.test(ua) ? "Edge" :
    /opr\/|opera/i.test(ua) ? "Opera" :
    /chrome|crios/i.test(ua) ? "Chrome" :
    /firefox|fxios/i.test(ua) ? "Firefox" :
    /safari/i.test(ua) ? "Safari" :
    "Browser";
  const os =
    /windows/i.test(ua) ? "Windows" :
    /iphone|ipad|ipod/i.test(ua) ? "iOS" :
    /mac os x/i.test(ua) ? "macOS" :
    /android/i.test(ua) ? "Android" :
    /linux/i.test(ua) ? "Linux" :
    "Unknown OS";
  return `${browser} on ${os}`;
}

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

function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange?: () => void }) {
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="min-w-0">
        <div className="text-neutral-200 text-[13px]">{label}</div>
        {description && <div className="text-neutral-600 text-[12px] mt-0.5">{description}</div>}
      </div>
      <Toggle checked={checked} onChange={() => onChange?.()} />
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


const accentColors: { value: string; label: string; family: AccentFamily }[] = [
  { value: "#6366f1", label: "Indigo", family: "indigo" },
  { value: "#8b5cf6", label: "Violet", family: "violet" },
  { value: "#3b82f6", label: "Blue", family: "blue" },
  { value: "#10b981", label: "Emerald", family: "emerald" },
  { value: "#f59e0b", label: "Amber", family: "amber" },
  { value: "#ef4444", label: "Rose", family: "red" },
];

const getNavGroups = (t: (k: any) => string) => [
  { label: t("settings.account"), items: [
    { key: "Profile", label: t("settings.profile") },
    { key: "Security", label: t("settings.security") },
    { key: "Notifications", label: t("settings.notifications") },
  ]},
  { label: t("settings.workspace"), items: [
    { key: "Workspace", label: t("settings.workspace") },
    { key: "Appearance", label: t("settings.appearance") },
    { key: "Language", label: t("settings.language") },
    { key: "Timezone", label: t("settings.timezone") },
    { key: "Default Notifications", label: t("settings.defaultNotif") },
    { key: "Members", label: t("settings.members") },
    { key: "Billing", label: t("settings.billing") },
    { key: "Integrations", label: t("settings.integrations") },
  ]},
  { label: t("settings.advanced"), items: [
    { key: "API Keys", label: t("settings.apiKeys") },
    { key: "Audit Log", label: t("settings.auditLog") },
    { key: "Data & Export", label: t("settings.dataExport") },
    { key: "Danger Zone", label: t("settings.dangerZone") },
  ]},
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
  const { t, lang: globalLang, setLang: setGlobalLang } = useLang();
  const { applyAppearance } = useAppearance();
  const { plan, subscription, transactions, loading: billingLoading } = useSubscription();
  const [activeNav, setActiveNav] = useState("Profile");
  const navGroups = getNavGroups(t);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [currentSession, setCurrentSession] = useState<{ device: string; signedInAt: string } | null>(null);
  const [signingOutOthers, setSigningOutOthers] = useState(false);
  const [members, setMembers] = useState<api.WorkspaceMember[]>([]);
  const [pendingList, setPendingList] = useState<api.Invitation[]>([]);
  const [myRole, setMyRole] = useState<string>("member");
  const [profileData, setProfileData] = useState<Record<string, string>>({});
  const [workspaceData, setWorkspaceData] = useState<Record<string, string>>({});
  const [showInvite, setShowInvite] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [show2FA, setShow2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState("");
  const [twoFASetup, setTwoFASetup] = useState<{ secret: string; otpauthUrl: string; backupCodes: string[] } | null>(null);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [loading2FA, setLoading2FA] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [accentColor, setAccentColor] = useState("#6366f1");
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">("medium");
  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">("comfortable");
  const [sidebarPosition, setSidebarPosition] = useState<"left" | "right">("left");
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY");
  const [timeFormat, setTimeFormat] = useState("12h");
  const [weekStart, setWeekStart] = useState("Monday");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [auditFilter, setAuditFilter] = useState("All");
  const [auditLogData, setAuditLogData] = useState<any[]>([]);
  const [systemLang, setSystemLang] = useState<Lang>(globalLang);
  useEffect(() => {
    setSystemLang(globalLang);
  }, [globalLang]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.user_metadata?.totp_enabled) setIs2FAEnabled(true);
    }).catch(() => {});
  }, []);
  const [apiKeysList, setApiKeysList] = useState<any[]>([]);
  const [webhooksList, setWebhooksList] = useState<any[]>([]);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [dangerEmail, setDangerEmail] = useState("");
  const [dangerPassword, setDangerPassword] = useState("");
  const [dangerReset, setDangerReset] = useState("");
  const [transferTargetEmail, setTransferTargetEmail] = useState("");
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
  const [securityPrefs, setSecurityPrefs] = useState({
    trustedDevices: true, loginNotifications: true, sessionTimeout: false,
  });
  const [workspacePrefs, setWorkspacePrefs] = useState({
    showCompletedTasks: false, compactView: false, publicProjectLinks: true, require2FA: false, guestAccess: true,
  });
  const [dataPrefs, setDataPrefs] = useState({
    autoArchiveCompleted: false, autoDeleteArchived: false, retainAuditLogs: true,
  });
  const [defaultNotif, setDefaultNotif] = useState({
    taskAssigned: true, taskDue: true, comments: true, projectStatus: false,
    newMember: false, digest: true, productUpdates: false, security: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load settings sections from Supabase
  useEffect(() => {
    loadMembersAndInvites();

    api.getSettings("api-keys").then((data) => {
      if (Array.isArray(data)) setApiKeysList(data);
    }).catch((e) => logger.error("app", "Failed to load api-keys:", e));

    api.getSettings("webhooks").then((data) => {
      if (Array.isArray(data)) setWebhooksList(data);
    }).catch((e) => logger.error("app", "Failed to load webhooks:", e));

    api.getSettings("audit-log").then((data) => {
      if (Array.isArray(data)) setAuditLogData(data.map((e: any) => ({
        actor: e.actor, name: e.actorName, action: e.action, target: e.target,
        ip: e.ip, time: e.timestamp, category: e.category,
      })));
    }).catch((e) => logger.error("app", "Failed to load audit-log:", e));

    api.getSettings("appearance").then((data) => {
      if (data) {
        if (data.theme) setTheme(data.theme);
        if (data.accent) setAccentColor(accentColors.find((a) => a.label.toLowerCase() === data.accent)?.value ?? "#6366f1");
        if (data.fontSize) setFontSize(data.fontSize);
        if (data.density) setDensity(data.density);
        if (data.sidebarPosition) setSidebarPosition(data.sidebarPosition);
      }
    }).catch((e) => logger.error("app", "Failed to load appearance:", e));

    api.getSettings("timezone").then((data) => {
      if (data) {
        if (data.timezone) setTimezone(data.timezone);
        if (data.dateFormat) setDateFormat(data.dateFormat);
        if (data.timeFormat) setTimeFormat(data.timeFormat);
        if (data.firstDay) setWeekStart(data.firstDay);
      }
    }).catch((e) => logger.error("app", "Failed to load timezone:", e));

    api.getSettings("notifications").then((data) => {
      if (data && typeof data === "object") {
        setNotifState((prev) => ({ ...prev, ...data }));
        if (data.defaults) setDefaultNotif(data.defaults);
      }
    }).catch((e) => logger.error("app", "Failed to load notifications:", e));

    api.getSettings("profile").then((data) => {
      if (data) {
        if (data.securityPrefs) setSecurityPrefs(data.securityPrefs);
        setProfileData(data);
        if (data.avatarBase64) setAvatarSrc(data.avatarBase64);
      }
    }).catch((e) => logger.error("app", "Failed to load profile:", e));

    api.getSettings("workspace").then((data) => {
      if (data) {
        if (data.workspacePrefs) setWorkspacePrefs(data.workspacePrefs);
        if (data.dataPrefs) setDataPrefs(data.dataPrefs);
        if (data.logoBase64) setLogoSrc(data.logoBase64);
        setWorkspaceData(data);
      }
    }).catch((e) => logger.error("app", "Failed to load workspace:", e));

    // Fetch integrations from Supabase
    api.getIntegrations().then((data) => {
      if (Array.isArray(data)) {
        setIntegrations(data.map((d: any) => ({ ...d, icon: integrationIcons[d.name] ?? <Zap size={16} /> })));
      }
    }).catch((e) => logger.error("app", "Failed to load integrations:", e));

    // Current session — Supabase only exposes the session for this device, not
    // a per-user device list, so we describe just the active one.
    supabase.auth.getSession().then(({ data }) => {
      const sess = data.session;
      if (!sess) return;
      const issuedMs = (sess.expires_at ? sess.expires_at * 1000 - 3600 * 1000 : Date.now());
      setCurrentSession({
        device: parseCurrentDevice(navigator.userAgent),
        signedInAt: new Date(issuedMs).toLocaleString("en-US", {
          month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
        }),
      });
    }).catch((e) => logger.error("app", "Failed to load current session:", e));
  }, []);

  useEffect(() => {
    if (subSectionMap[subSection]) setActiveNav(subSectionMap[subSection]);
  }, [subSection]);

  const toggleIntegration = async (name: string) => {
    const prevIntegrations = [...integrations];
    const target = integrations.find((i) => i.name === name);
    if (!target) return;
    const newConnected = !target.connected;
    const newLastSync = newConnected ? "just now" : null;
    // Optimistic update
    setIntegrations((prev) =>
      prev.map((i) => i.name === name ? { ...i, connected: newConnected, lastSync: newLastSync } : i)
    );
    try {
      await api.updateIntegration(name, { connected: newConnected, lastSync: newLastSync });
      toast.success(newConnected ? t("settings.connectedTo").replace("{name}", name) : t("settings.disconnectedFrom").replace("{name}", name));
    } catch (e) {
      // Rollback on failure
      setIntegrations(prevIntegrations);
      toast.error(t("settings.failedToUpdate").replace("{name}", name));
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("settings.imageUnder2MB"));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setAvatarSrc(base64);
      try {
        await api.saveSettings("profile", { firstName: "", lastName: "", email: "", phone: "", title: "", department: "Engineering", bio: "", github: "", linkedin: "", ...profileData, avatarBase64: base64, securityPrefs });
        toast.success(t("settings.profilePhotoUpdated"));
      } catch (e) {
        logger.error("app", "Failed to save avatar:", e);
        toast.error(t("settings.failedToSavePhoto"));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("settings.logoUnder2MB"));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setLogoSrc(base64);
      try {
        await api.saveSettings("workspace", { name: "", url: "", industry: "", teamSize: "", region: "", ...workspaceData, workspacePrefs, dataPrefs, logoBase64: base64 });
        toast.success(t("settings.workspaceLogoUpdated"));
      } catch (e) {
        logger.error("app", "Failed to save logo:", e);
        toast.error(t("settings.failedToSaveLogo"));
      }
    };
    reader.readAsDataURL(file);
  };

  const updatePassword = async () => {
    if (!pw.current) return toast.error(t("settings.enterCurrentPassword"));
    if (pw.next.length < 12) return toast.error(t("settings.passwordMin12"));
    if (pw.next !== pw.confirm) return toast.error(t("settings.passwordsDoNotMatch"));
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user?.email) throw new Error("Unable to verify your session");
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: pw.current });
      if (signInError) throw new Error("Current password is incorrect");
      const { error } = await updateSupabasePassword(pw.next);
      if (error) throw error;
      toast.success(t("settings.passwordUpdated"));
      setPw({ current: "", next: "", confirm: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("settings.failedToUpdatePassword"));
    }
  };

  const verify2FA = async () => {
    if (twoFACode.length < 6) return toast.error(t("settings.enter6digitCode"));
    setLoading2FA(true);
    try {
      await api.verify2FA(twoFACode);
      toast.success(t("settings.twoFactorEnabled"));
      setIs2FAEnabled(true);
      setShow2FA(false);
      setTwoFACode("");
      setTwoFASetup(null);
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : undefined) || t("settings.invalidCode"));
    } finally {
      setLoading2FA(false);
    }
  };

  const start2FASetup = async () => {
    setLoading2FA(true);
    try {
      const data = await api.setup2FA();
      setTwoFASetup(data);
      setShow2FA(true);
    } catch (e) {
      toast.error(t("settings.failedToStart2FA"));
    } finally {
      setLoading2FA(false);
    }
  };

  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disable2FACode, setDisable2FACode] = useState("");
  const [emailOTPSent, setEmailOTPSent] = useState(false);
  const [emailOTPCode, setEmailOTPCode] = useState("");
  const [sendingEmailOTP, setSendingEmailOTP] = useState(false);

  const disable2FA = async () => {
    if (!showDisable2FA) {
      setShowDisable2FA(true);
      return;
    }
    if (!disable2FACode || disable2FACode.length < 6) {
      toast.error(t("settings.enter2FACode"));
      return;
    }
    setLoading2FA(true);
    try {
      const isBackupCode = disable2FACode.length > 6;
      await api.disable2FA(isBackupCode ? undefined : disable2FACode, isBackupCode ? disable2FACode : undefined);
      setIs2FAEnabled(false);
      setShowDisable2FA(false);
      setDisable2FACode("");
      toast.success(t("settings.twoFactorDisabled"));
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : undefined) || t("settings.failedToDisable2FA"));
    } finally {
      setLoading2FA(false);
    }
  };

  const generateApiKey = async () => {
    if (!newKeyName.trim()) return toast.error(t("settings.enterKeyName"));
    // Use cryptographically secure random for key generation
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const key = `sk-${hex.slice(0, 8)}-${hex.slice(8, 24)}`;
    setGeneratedKey(key);
    const newEntry = { id: Date.now(), name: newKeyName.trim(), prefix: `sk_${key.slice(3, 7)}`, created: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), lastUsed: "Never" };
    const updated = [...apiKeysList, newEntry];
    setApiKeysList(updated);
    setNewKeyName("");
    toast.success(t("settings.apiKeyGenerated"));
    try { await api.saveSettings("api-keys", updated); } catch (e) { logger.error("app", "Failed to save api keys:", e); toast.error(t("settings.failedToSaveApiKeys")); }
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
    toast.success(t("settings.apiKeyRevoked").replace("{name}", name));
    try { await api.saveSettings("api-keys", updated); } catch (e) { logger.error("app", "Failed to save api keys:", e); toast.error(t("settings.failedToSaveApiKeys")); }
  };

  const toggleWebhook = async (idx: number) => {
    const updated = webhooksList.map((w, i) => i === idx ? { ...w, active: !w.active } : w);
    setWebhooksList(updated);
    try { await api.saveSettings("webhooks", updated); } catch (e) { logger.error("app", "Failed to save webhooks:", e); toast.error(t("settings.failedToSaveWebhooks")); }
  };

  const deleteWebhook = async (idx: number) => {
    const updated = webhooksList.filter((_, i) => i !== idx);
    setWebhooksList(updated);
    toast.success(t("settings.webhookDeleted"));
    try { await api.saveSettings("webhooks", updated); } catch (e) { logger.error("app", "Failed to save webhooks:", e); toast.error(t("settings.failedToSaveWebhooks")); }
  };

  const loadMembersAndInvites = async () => {
    try {
      const { members: rows, my_role } = await api.getWorkspaceMembers();
      setMembers(rows);
      setMyRole(my_role);
    } catch (e) { logger.error("app", "Failed to load members:", e); }
    try {
      const invites = await api.getInvitations();
      setPendingList(invites);
    } catch (e) {
      // Non-admins can't list invitations (403) — that's expected, leave empty.
      setPendingList([]);
    }
  };

  // Live-sync members & invitations across tabs / team members
  useRealtimeSync(["workspace_members", "invitations"], loadMembersAndInvites);

  const changeMemberRole = async (m: { name: string; role: string; user_id: string | null }, newRole: string) => {
    if (!m.user_id) return;
    const prev = members;
    setMembers((list) => list.map((x) => x.user_id === m.user_id ? { ...x, role: newRole } : x));
    try {
      await api.updateWorkspaceMemberRole(m.user_id, newRole);
      toast.success(t("settings.roleChanged").replace("{name}", m.name).replace("{role}", newRole));
    } catch (e: unknown) {
      setMembers(prev);
      toast.error((e instanceof Error ? e.message : undefined) || t("settings.failedToChangeRole"));
    }
  };

  const removeMember = async (m: { name: string; user_id: string | null }) => {
    if (!m.user_id) return;
    const prev = members;
    setMembers((list) => list.filter((x) => x.user_id !== m.user_id));
    try {
      await api.removeWorkspaceMember(m.user_id);
      toast.success(t("settings.memberRemoved").replace("{name}", m.name));
    } catch (e: unknown) {
      setMembers(prev);
      toast.error((e instanceof Error ? e.message : undefined) || t("settings.failedToRemoveMember"));
    }
  };

  const cancelInvite = async (inv: { email: string; id: string }) => {
    const prev = pendingList;
    setPendingList((list) => list.filter((p) => p.id !== inv.id));
    try {
      await api.revokeInvitation(inv.id);
      toast.success(t("settings.invitationCancelled").replace("{email}", inv.email));
    } catch (e: unknown) {
      setPendingList(prev);
      toast.error((e instanceof Error ? e.message : undefined) || t("settings.failedToCancelInvite"));
    }
  };

  const saveAppearance = async () => {
    const family = accentColors.find((a) => a.value === accentColor)?.family ?? "indigo";
    const accentLabel = ACCENT_FAMILY_TO_LABEL[family];
    // Apply live so the whole app re-themes immediately, then persist.
    applyAppearance({ accent: family, fontSize: fontSize as FontSize, density, sidebarPosition });
    try {
      await api.saveSettings("appearance", { theme, accent: accentLabel, fontSize, density, sidebarPosition });
      toast.success(t("settings.appearanceSaved"));
    } catch (e) { logger.error("app", "Failed to save appearance:", e); toast.error(t("settings.failedToSave")); }
  };

  const saveTimezone = async () => {
    try {
      await api.saveSettings("timezone", { timezone, dateFormat, timeFormat, firstDay: weekStart, autoDetect: false });
      toast.success(t("settings.timezoneSaved"));
    } catch (e) { logger.error("app", "Failed to save timezone:", e); toast.error(t("settings.failedToSave")); }
  };

  const saveProfile = async () => {
    try {
      await api.saveSettings("profile", { firstName: "", lastName: "", email: "", phone: "", title: "", department: "Engineering", bio: "", github: "", linkedin: "", ...profileData, avatarBase64: avatarSrc ?? profileData.avatarBase64, securityPrefs });
      toast.success(t("settings.profileSaved"));
    } catch (e) { logger.error("app", "Failed to save profile:", e); toast.error(t("settings.failedToSave")); }
  };

  const saveNotifications = async () => {
    try {
      await api.saveSettings("notifications", { ...notifState, defaults: defaultNotif });
      toast.success(t("settings.notifSettingsSaved"));
    } catch (e) { logger.error("app", "Failed to save notifications:", e); toast.error(t("settings.failedToSave")); }
  };

  const handleExport = async (label: string) => {
    const format = exportFormats[label] ?? "CSV";
    try {
      let data: any;
      if (label === "All tasks") data = await api.getTasks();
      else if (label === "All projects") data = await api.getProjects();
      else if (label === "Team data") data = await api.getTeams();
      else if (label === "Files & attachments") { const res = await api.getFiles(); data = res.files; }
      if (!data) { toast.error(t("settings.noDataToExport")); return; }
      let content: string;
      if (format === "JSON") {
        content = JSON.stringify(data, null, 2);
      } else {
        const flat = Array.isArray(data) ? data : [data];
        if (flat.length === 0) { toast.error(t("settings.noDataToExport")); return; }
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
    } catch (e) { logger.error("app", "Export failed:", e); toast.error(t("settings.exportFailed")); }
  };

  const addWebhook = async () => {
    if (!newWebhookUrl.trim()) return toast.error(t("settings.enterWebhookUrl"));
    if (!newWebhookEvents.trim()) return toast.error(t("settings.enterWebhookEvents"));
    const newHook = { url: newWebhookUrl.trim(), events: newWebhookEvents.trim(), active: true };
    const updated = [...webhooksList, newHook];
    setWebhooksList(updated);
    setShowWebhookForm(false);
    setNewWebhookUrl("");
    setNewWebhookEvents("");
    toast.success(t("settings.webhookAdded"));
    try { await api.saveSettings("webhooks", updated); } catch (e) { logger.error("app", "Failed to save webhooks:", e); toast.error(t("settings.failedToSaveWebhooks")); }
  };

  const filteredLogs = auditFilter === "All" ? auditLogData : auditLogData.filter((l) => l.category === auditFilter);

  return (
    <div className="flex flex-col lg:flex-row h-full font-['Lexend:Regular',_sans-serif]">
      {/* Left nav */}
      <div className="w-full lg:w-56 shrink-0 px-4 lg:px-6 pt-6 lg:pt-8 pb-2 lg:pb-8 border-b lg:border-b-0 lg:border-r border-neutral-800/40 overflow-x-auto lg:overflow-y-auto">
        <div className="hidden lg:block text-neutral-50 text-[13px] lg:text-[14px] font-['Lexend:SemiBold',_sans-serif] mb-4">Settings</div>
        <nav className="flex lg:flex-col gap-x-1 lg:gap-x-0 overflow-x-auto lg:overflow-x-visible">
          {navGroups.map((group) => (
            <div key={group.label} className="flex lg:flex-col gap-x-1 lg:gap-x-0 lg:mb-4 last:mb-0">
              <div className="hidden lg:block text-neutral-600 text-[10px] uppercase tracking-wider px-3 mb-1">{group.label}</div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActiveNav(item.key)}
                  className={`shrink-0 lg:w-full text-left px-3 py-2 rounded-lg text-[12px] lg:text-[13px] transition-colors whitespace-nowrap ${activeNav === item.key ? "bg-neutral-800 text-neutral-50" : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/30"}`}
                >
                  {item.label}
                </button>
              ))}
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
              <Section title={t("settings.profile")} description={t("settings.profileDesc")}>
                <div className="flex items-center gap-4 mb-6">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden shrink-0 cursor-pointer ring-2 ring-neutral-800 hover:ring-indigo-600/40 transition-all"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {avatarSrc ? (
                      <img src={avatarSrc} alt="avatar" loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-indigo-900/60 flex items-center justify-center text-indigo-300 text-[20px] font-['Lexend:SemiBold',_sans-serif]">{((profileData.firstName?.[0] ?? "") + (profileData.lastName?.[0] ?? "")) || "?"}</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button onClick={() => fileInputRef.current?.click()} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[12px] lg:text-[13px] px-3 py-1.5 rounded-lg transition-colors w-fit">
                      Change photo
                    </button>
                    <span className="text-neutral-600 text-[11px]">JPG or PNG · Max 2 MB</span>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 lg:gap-4">
                    <InputField label={t("settings.firstName")} value={profileData.firstName ?? ""} onChange={(v) => setProfileData((p: Record<string, unknown>) => ({ ...p, firstName: v }))} />
                    <InputField label={t("settings.lastName")} value={profileData.lastName ?? ""} onChange={(v) => setProfileData((p: Record<string, unknown>) => ({ ...p, lastName: v }))} />
                  </div>
                  <InputField label={t("settings.email")} value={profileData.email ?? ""} onChange={(v) => setProfileData((p: Record<string, unknown>) => ({ ...p, email: v }))} type="email" hint={t("settings.emailHint")} />
                  <InputField label={t("settings.phoneNumber")} value={profileData.phone ?? ""} onChange={(v) => setProfileData((p: Record<string, unknown>) => ({ ...p, phone: v }))} type="tel" />
                  <InputField label={t("settings.jobTitle")} value={profileData.title ?? ""} onChange={(v) => setProfileData((p: Record<string, unknown>) => ({ ...p, title: v }))} />
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.department")}</label>
                    <select
                      value={profileData.department ?? "Engineering"}
                      onChange={(e) => setProfileData((p: Record<string, unknown>) => ({ ...p, department: e.target.value }))}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 hover:border-neutral-700 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none select-arrow cursor-pointer transition-colors"
                    >
                      {profileData.department && !["Engineering", "Design", "Product", "QA", "Marketing", "Sales", "Customer Success", "Data & Analytics", "Human Resources", "Finance & Operations"].includes(profileData.department) && (
                        <option>{profileData.department}</option>
                      )}
                      <option>Engineering</option>
                      <option>Design</option>
                      <option>Product</option>
                      <option>QA</option>
                      <option>Marketing</option>
                      <option>Sales</option>
                      <option>Customer Success</option>
                      <option>Data & Analytics</option>
                      <option>Human Resources</option>
                      <option>Finance & Operations</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.bio")}</label>
                    <textarea
                      rows={3}
                      value={profileData.bio ?? ""}
                      onChange={(e) => setProfileData((p: Record<string, unknown>) => ({ ...p, bio: e.target.value }))}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 hover:border-neutral-700 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors resize-none placeholder:text-neutral-600 font-['Lexend:Regular',_sans-serif]"
                    />
                    <p className="text-neutral-600 text-[11px] mt-1">Visible to teammates on your profile card.</p>
                  </div>
                </div>
              </Section>
              <Section title={t("settings.socialLinks")} description={t("settings.socialLinksDesc")}>
                <div className="space-y-3">
                  <InputField label={t("settings.github")} value={profileData.github ?? ""} onChange={(v) => setProfileData((p: Record<string, unknown>) => ({ ...p, github: v }))} placeholder="https://github.com/username" />
                  <InputField label={t("settings.linkedin")} value={profileData.linkedin ?? ""} onChange={(v) => setProfileData((p: Record<string, unknown>) => ({ ...p, linkedin: v }))} placeholder="https://linkedin.com/in/username" />
                </div>
              </Section>
              <SaveRow onSave={saveProfile} />
            </>
          )}

          {/* ── Security ── */}
          {activeNav === "Security" && (
            <>
              <Section title={t("settings.changePassword")} description={t("settings.changePasswordDesc")}>
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
                    <label className="block text-neutral-300 text-[13px] mb-1.5">New password</label>
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
                    <p className="text-neutral-600 text-[11px] mt-1">Min. 12 characters · uppercase · numbers · symbols</p>
                  </div>
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">Confirm new password</label>
                    <input
                      type="password"
                      value={pw.confirm}
                      onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors font-['Lexend:Regular',_sans-serif]"
                    />
                    {pw.confirm && pw.next !== pw.confirm && (
                      <p className="text-red-400 text-[11px] mt-1">Passwords do not match</p>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <button onClick={updatePassword} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-5 py-2 rounded-lg transition-colors">Update password</button>
                  </div>
                </div>
              </Section>

              <Section title={t("settings.twoFactor")} description={t("settings.twoFactorDesc")}>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400 shrink-0">
                      <Shield size={15} />
                    </div>
                    <div>
                      <div className="text-neutral-200 text-[13px]">{t("settings.authenticatorApp")}</div>
                      <div className="text-neutral-600 text-[12px]">{is2FAEnabled ? t("settings.twoFAEnabled") : t("settings.useGoogleAuthy")}</div>
                    </div>
                  </div>
                  {is2FAEnabled ? (
                    <button onClick={disable2FA} disabled={loading2FA} className="border border-red-800/60 hover:bg-red-950/30 text-red-400 hover:text-red-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50">
                      {showDisable2FA ? t("common.confirm") : t("settings.disable2FA")}
                    </button>
                  ) : (
                    <button onClick={() => is2FAEnabled ? setShow2FA(!show2FA) : start2FASetup()} disabled={loading2FA} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50">
                      {show2FA ? t("common.cancel") : t("settings.setup2FA")}
                    </button>
                  )}
                </div>
                {showDisable2FA && is2FAEnabled && (
                  <div className="p-3 bg-neutral-800/30 rounded-xl space-y-2">
                    <p className="text-neutral-400 text-[12px]">Enter your current 2FA code or backup code to disable:</p>
                    <input
                      type="text"
                      maxLength={8}
                      placeholder="000000"
                      value={disable2FACode}
                      onChange={(e) => setDisable2FACode(e.target.value.replace(/\s/g, ""))}
                      className="w-full rounded-lg border border-neutral-800 bg-[#0f0f0f] px-3 py-2 text-center text-[14px] tracking-[0.2em] text-neutral-200 outline-none focus:border-red-600/60"
                    />
                    <button onClick={() => { setShowDisable2FA(false); setDisable2FACode(""); }} className="text-neutral-500 text-[11px] hover:text-neutral-300">Cancel</button>
                  </div>
                )}
                {show2FA && twoFASetup && !is2FAEnabled && (
                  <div className="p-4 bg-neutral-800/30 rounded-xl space-y-3">
                    <div className="text-center">
                      <p className="text-neutral-400 text-[12px] mb-2">{t("settings.scanQR")}</p>
                      <code className="block bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2 text-emerald-300 text-[11px] font-mono break-all">{twoFASetup.secret}</code>
                      <a href={twoFASetup.otpauthUrl} className="text-indigo-400 text-[11px] hover:underline mt-1 inline-block">{t("settings.openInAuthenticator")}</a>
                    </div>
                    {twoFASetup.backupCodes.length > 0 && (
                      <div className="bg-[#0f0f0f] border border-neutral-800 rounded-lg p-3">
                        <p className="text-neutral-500 text-[11px] mb-1">{t("settings.backupCodes")}</p>
                        <div className="grid grid-cols-2 gap-1">
                          {twoFASetup.backupCodes.map((c, i) => <code key={i} className="text-neutral-300 text-[10px] font-mono">{c}</code>)}
                        </div>
                      </div>
                    )}
                    <p className="text-neutral-400 text-[12px] text-center">Enter the 6-digit code from your authenticator app.</p>
                    <div className="flex gap-2">
                      <input
                        type="text" maxLength={6} placeholder="000000" value={twoFACode}
                        onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, ""))}
                        className="flex-1 bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[14px] text-center tracking-widest outline-none transition-colors font-['Lexend:Regular',_sans-serif]"
                      />
                      <button onClick={verify2FA} disabled={loading2FA} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[13px] px-4 py-2 rounded-lg transition-colors">Verify</button>
                    </div>
                  </div>
                )}

                {/* Email OTP 2FA option */}
                <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-neutral-800/60">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400 shrink-0">
                      <Mail size={15} />
                    </div>
                    <div>
                      <div className="text-neutral-200 text-[13px]">{t("auth.emailOTP")}</div>
                      <div className="text-neutral-600 text-[12px]">{t("auth.emailOTPDesc")}</div>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (emailOTPSent) {
                        setEmailOTPSent(false);
                        setEmailOTPCode("");
                        return;
                      }
                      try {
                        setSendingEmailOTP(true);
                        await api.sendEmailOTP();
                        setEmailOTPSent(true);
                        toast.success(t("auth.emailOTPSent"));
                      } catch (e: unknown) {
                        toast.error((e instanceof Error ? e.message : undefined) || "Failed to send code");
                      } finally {
                        setSendingEmailOTP(false);
                      }
                    }}
                    disabled={sendingEmailOTP || is2FAEnabled}
                    className="border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50"
                  >
                    {is2FAEnabled ? "Enabled" : emailOTPSent ? "Cancel" : sendingEmailOTP ? "Sending..." : "Set up"}
                  </button>
                </div>
                {emailOTPSent && !is2FAEnabled && (
                  <div className="p-4 bg-neutral-800/30 rounded-xl space-y-3 mt-3">
                    <p className="text-neutral-400 text-[12px] text-center">{t("auth.enterEmailCode")}</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        value={emailOTPCode}
                        onChange={(e) => setEmailOTPCode(e.target.value.replace(/\D/g, ""))}
                        className="flex-1 bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[14px] text-center tracking-widest outline-none transition-colors"
                      />
                      <button
                        onClick={async () => {
                          if (emailOTPCode.length !== 6) return;
                          try {
                            await api.verifyEmailOTP(emailOTPCode);
                            setIs2FAEnabled(true);
                            setEmailOTPSent(false);
                            setEmailOTPCode("");
                            toast.success(t("settings.emailOTPEnabled"));
                          } catch (e: unknown) {
                            toast.error((e instanceof Error ? e.message : undefined) || t("settings.invalidCode"));
                          }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors"
                      >
                        Verify
                      </button>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await api.sendEmailOTP();
                          toast.success(t("settings.newCodeSent"));
                        } catch (e: unknown) {
                          toast.error((e instanceof Error ? e.message : undefined) || "Failed to resend");
                        }
                      }}
                      className="w-full text-[12px] text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      {t("auth.resendCode")}
                    </button>
                  </div>
                )}
              </Section>

              <Section title={t("settings.activeSessions")} description={t("settings.activeSessionsDesc")}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-neutral-200 text-[13px]">{currentSession?.device ?? t("settings.thisDevice")}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400">{t("settings.current")}</span>
                      </div>
                      <div className="text-neutral-600 text-[11px] mt-0.5">
                        {currentSession ? t("settings.signedInAgo").replace("{time}", currentSession.signedInAt) : t("common.loading")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-neutral-600 text-[11px] max-w-sm">
                      Sign out everywhere else — this ends all other sessions on other browsers and devices. Your current session stays active.
                    </p>
                    <button
                      disabled={signingOutOthers}
                      onClick={async () => {
                        setSigningOutOthers(true);
                        try {
                          const { error } = await supabase.auth.signOut({ scope: "others" });
                          if (error) throw error;
                          toast.success(t("settings.signedOutOtherSessions"));
                        } catch (e: unknown) {
                          toast.error((e instanceof Error ? e.message : undefined) || "Failed to sign out other sessions");
                        } finally {
                          setSigningOutOthers(false);
                        }
                      }}
                      className="border border-red-900/40 hover:bg-red-950/30 text-red-400 hover:text-red-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50"
                    >
                      {signingOutOthers ? t("settings.signingOut") : t("settings.signOutOtherSessions")}
                    </button>
                  </div>
                  <p className="text-neutral-700 text-[11px]">
                    Note: a detailed per-device session list and login history aren't available — the authentication provider doesn't expose them.
                  </p>
                </div>
              </Section>

              <Section title={t("settings.securityPreferences")}>
                <div className="divide-y divide-neutral-800/40">
                  <ToggleRow label={t("settings.trustedDevices")} description={t("settings.trustedDevicesDesc")} checked={securityPrefs.trustedDevices} onChange={() => setSecurityPrefs(p => ({ ...p, trustedDevices: !p.trustedDevices }))} />
                  <ToggleRow label={t("settings.loginNotifications")} description={t("settings.loginNotificationsDesc")} checked={securityPrefs.loginNotifications} onChange={() => setSecurityPrefs(p => ({ ...p, loginNotifications: !p.loginNotifications }))} />
                  <ToggleRow label={t("settings.sessionTimeout")} description={t("settings.sessionTimeoutDesc")} checked={securityPrefs.sessionTimeout} onChange={() => setSecurityPrefs(p => ({ ...p, sessionTimeout: !p.sessionTimeout }))} />
                </div>
              </Section>
              <SaveRow onSave={async () => {
                try { await api.saveSettings("profile", { firstName: "", lastName: "", email: "", phone: "", title: "", department: "Engineering", bio: "", github: "", linkedin: "", ...profileData, securityPrefs }); toast.success(t("settings.securityPrefsSaved")); }
                catch (e) { logger.error("app", "Failed to save security preferences:", e); toast.error(t("settings.failedToSave")); }
              }} />
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
                    <Section title={t("settings.notifChannels")} description={t("settings.notifChannelsDesc")}>
                      <div className="divide-y divide-neutral-800/40">
                        {n("inApp", t("settings.notifInApp"), t("settings.notifInAppDesc"))}
                        {n("email", t("settings.notifEmailChannel"), t("settings.notifEmailChannelDesc"))}
                        {n("slack", t("settings.notifSlack"), t("settings.notifSlackDesc"))}
                        {n("browser", t("settings.notifBrowser"), t("settings.notifBrowserDesc"))}
                      </div>
                    </Section>
                    <Section title={t("settings.notifTasks")}>
                      <div className="divide-y divide-neutral-800/40">
                        {n("taskAssigned", t("settings.notifItemTaskAssigned"))}
                        {n("taskDue", t("settings.notifItemTaskDue"))}
                        {n("taskStatus", t("settings.notifItemTaskStatus"))}
                        {n("comments", t("settings.notifItemComments"))}
                        {n("mentions", t("settings.notifItemMentions"))}
                      </div>
                    </Section>
                    <Section title={t("settings.notifProjects")}>
                      <div className="divide-y divide-neutral-800/40">
                        {n("projectStatus", t("settings.notifItemProjectStatus"))}
                        {n("newMember", t("settings.notifItemNewMember"))}
                        {n("milestone", t("settings.notifItemMilestone"))}
                      </div>
                    </Section>
                    <Section title={t("settings.notifTeam")}>
                      <div className="divide-y divide-neutral-800/40">
                        {n("teamMember", t("settings.notifItemTeamJoined"))}
                        {n("announcements", t("settings.notifItemAnnouncements"))}
                      </div>
                    </Section>
                    <Section title={t("settings.notifDigest")}>
                      <div className="divide-y divide-neutral-800/40">
                        {n("digest", t("settings.notifItemWeeklyDigest"))}
                        {n("productUpdates", t("settings.notifItemProductUpdates"))}
                        {n("security", t("settings.notifItemSecurityAlerts"))}
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
              <Section title={t("settings.workspaceIdentity")} description={t("settings.workspaceIdentityDesc")}>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-indigo-900/60 flex items-center justify-center text-indigo-300 text-[20px] font-['Lexend:SemiBold',_sans-serif] shrink-0 overflow-hidden">
                      {logoSrc ? <img src={logoSrc} alt="logo" loading="lazy" className="w-full h-full object-cover" /> : workspaceData.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <button onClick={() => logoInputRef.current?.click()} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors">{t("settings.uploadLogo")}</button>
                      <p className="text-neutral-600 text-[11px] mt-1">{t("settings.logoHint")}</p>
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                    </div>
                  </div>
                  <InputField label={t("settings.workspaceName")} value={workspaceData.name ?? ""} onChange={(v) => setWorkspaceData((p: Record<string, unknown>) => ({ ...p, name: v }))} />
                  <InputField label={t("settings.workspaceUrl")} value={workspaceData.url ?? ""} onChange={(v) => setWorkspaceData((p: Record<string, unknown>) => ({ ...p, url: v }))} hint={t("settings.workspaceUrlHint")} />
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.industry")}</label>
                    <select
                      value={workspaceData.industry ?? "Software / Technology"}
                      onChange={(e) => setWorkspaceData((p: Record<string, unknown>) => ({ ...p, industry: e.target.value }))}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none select-arrow cursor-pointer"
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
                    <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.teamSize")}</label>
                    <select
                      value={workspaceData.teamSize ?? "1–10"}
                      onChange={(e) => setWorkspaceData((p: Record<string, unknown>) => ({ ...p, teamSize: e.target.value }))}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none select-arrow cursor-pointer"
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
                    <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.dataRegion")}</label>
                    <select
                      value={workspaceData.region ?? "United States (US-East)"}
                      onChange={(e) => setWorkspaceData((p: Record<string, unknown>) => ({ ...p, region: e.target.value }))}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none select-arrow cursor-pointer"
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
              <Section title={t("settings.workspacePreferences")}>
                <div className="divide-y divide-neutral-800/40">
                  <ToggleRow label={t("settings.showCompletedTasks")} description={t("settings.showCompletedTasksDesc")} checked={workspacePrefs.showCompletedTasks} onChange={() => setWorkspacePrefs(p => ({ ...p, showCompletedTasks: !p.showCompletedTasks }))} />
                  <ToggleRow label={t("settings.compactView")} description={t("settings.compactViewDesc")} checked={workspacePrefs.compactView} onChange={() => setWorkspacePrefs(p => ({ ...p, compactView: !p.compactView }))} />
                  <ToggleRow label={t("settings.publicProjectLinks")} description={t("settings.publicProjectLinksDesc")} checked={workspacePrefs.publicProjectLinks} onChange={() => setWorkspacePrefs(p => ({ ...p, publicProjectLinks: !p.publicProjectLinks }))} />
                  <ToggleRow label={t("settings.require2FA")} description={t("settings.require2FADesc")} checked={workspacePrefs.require2FA} onChange={() => setWorkspacePrefs(p => ({ ...p, require2FA: !p.require2FA }))} />
                  <ToggleRow label={t("settings.guestAccess")} description={t("settings.guestAccessDesc")} checked={workspacePrefs.guestAccess} onChange={() => setWorkspacePrefs(p => ({ ...p, guestAccess: !p.guestAccess }))} />
                </div>
              </Section>
              <SaveRow onSave={async () => {
                try { await api.saveSettings("workspace", { name: "", url: "", industry: "", teamSize: "", region: "", ...workspaceData, workspacePrefs, logoBase64: logoSrc ?? workspaceData.logoBase64 }); toast.success(t("settings.workspaceSettingsSaved")); }
                catch (e) { logger.error("app", "Failed to save workspace:", e); toast.error(t("settings.failedToSave")); }
              }} />
            </>
          )}

          {/* ── Appearance ── */}
          {activeNav === "Appearance" && (
            <>
              <Section title={t("settings.theme")} description={t("settings.themeDesc")}>
                <div className="grid grid-cols-3 gap-3">
                  {(["dark", "light", "system"] as const).map((th) => {
                    const available = th === "dark";
                    return (
                    <button
                      key={th}
                      disabled={!available}
                      onClick={() => available && setTheme(th)}
                      className={`relative p-3 rounded-xl border transition-all text-left ${theme === th ? "border-indigo-500 bg-indigo-950/20" : "border-neutral-800 hover:border-neutral-700"} ${!available ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      <div className={`h-14 rounded-lg mb-2.5 overflow-hidden ${th === "dark" ? "bg-neutral-900" : th === "light" ? "bg-neutral-200" : "bg-gradient-to-br from-neutral-900 to-neutral-200"}`}>
                        <div className={`h-3 w-full ${th === "dark" ? "bg-neutral-800" : th === "light" ? "bg-neutral-300" : "bg-gradient-to-r from-neutral-800 to-neutral-300"}`} />
                        <div className="p-1.5 space-y-1">
                          {[1, 2].map((i) => (
                            <div key={i} className={`h-1.5 rounded-full ${th === "dark" ? "bg-neutral-700" : th === "light" ? "bg-neutral-400" : "bg-neutral-500"}`} style={{ width: i === 1 ? "80%" : "60%" }} />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-200 text-[12px] capitalize">{th}</span>
                        {!available && <span className="text-[9px] px-1 py-0.5 rounded bg-neutral-800 text-neutral-500">{t("settings.soon")}</span>}
                      </div>
                      {theme === th && available && <Check size={12} className="absolute top-2.5 right-2.5 text-indigo-400" />}
                    </button>
                    );
                  })}
                </div>
              </Section>
              <Section title={t("settings.accentColor")} description={t("settings.accentColorDesc")}>
                <div className="flex items-center gap-3">
                  {accentColors.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => { setAccentColor(c.value); applyAppearance({ accent: c.family }); }}
                      title={c.label}
                      className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${accentColor === c.value ? "ring-2 ring-offset-2 ring-offset-[#0f0f0f] ring-white/30 scale-110" : ""}`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </Section>
              <Section title={t("settings.fontSize")}>
                <div className="flex items-center gap-2">
                  {(["small", "medium", "large"] as const).map((s) => (
                    <button key={s} onClick={() => { setFontSize(s); applyAppearance({ fontSize: s }); }}
                      className={`flex-1 py-2 rounded-lg text-[12px] capitalize border transition-colors ${fontSize === s ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title={t("settings.density")} description={t("settings.densityDesc")}>
                <div className="flex items-center gap-2">
                  {(["compact", "comfortable", "spacious"] as const).map((d) => (
                    <button key={d}
                      onClick={() => { setDensity(d); applyAppearance({ density: d }); }}
                      className={`flex-1 py-2 rounded-lg text-[12px] capitalize border transition-colors ${density === d ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title={t("settings.sidebarPosition")}>
                <div className="flex items-center gap-2">
                  {(["left", "right"] as const).map((p) => (
                    <button key={p}
                      onClick={() => { setSidebarPosition(p); applyAppearance({ sidebarPosition: p }); }}
                      className={`flex-1 py-2 rounded-lg text-[12px] border transition-colors ${sidebarPosition === p ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </Section>
              <SaveRow onSave={saveAppearance} />
            </>
          )}

          {/* ── Language ── */}
          {activeNav === "Language" && (
            <>
              <Section title={t("settings.language")} description={t("settings.chooseLanguage")}>
                <div className="space-y-2">
                  {[
                    { value: "en" as Lang, label: "English", description: "Use English for all interface labels and system text." },
                    { value: "id" as Lang, label: "Bahasa Indonesia", description: "Gunakan Bahasa Indonesia untuk semua label antarmuka dan teks sistem." },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSystemLang(option.value);
                        setGlobalLang(option.value);
                      }}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        systemLang === option.value
                          ? "border-indigo-500 bg-indigo-950/20"
                          : "border-neutral-800 hover:border-neutral-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-neutral-200 text-[13px]">{option.label}</div>
                          <div className="text-neutral-600 text-[12px] mt-0.5">{option.description}</div>
                        </div>
                        {systemLang === option.value && <Check size={14} className="text-indigo-400 shrink-0 ml-3" />}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-neutral-600 text-[11px] mt-3">{t("settings.changesApply")}</p>
              </Section>
              <SaveRow onSave={() => {
                setGlobalLang(systemLang);
                toast.success(systemLang === "id" ? "Bahasa diubah ke Bahasa Indonesia" : "Language changed to English");
              }} label={t("settings.saveLanguage")} />
            </>
          )}

          {/* ── Timezone ── */}
          {activeNav === "Timezone" && (
            <>
              <Section title={t("settings.timeZone")} description={t("settings.timeZoneDesc")}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">Time zone</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none select-arrow cursor-pointer"
                    >
                      <option value="Asia/Jakarta">Asia/Jakarta (UTC+7)</option>
                      <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
                      <option value="America/New_York">America/New_York (UTC-5)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (UTC-8)</option>
                      <option value="Europe/London">Europe/London (UTC+0)</option>
                      <option value="Europe/Paris">Europe/Paris (UTC+1)</option>
                      <option value="Australia/Sydney">Australia/Sydney (UTC+11)</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-neutral-200 text-[13px]">{t("settings.autoDetectTimezone")}</div>
                      <div className="text-neutral-600 text-[12px] mt-0.5">{t("settings.autoDetectTimezoneDesc")}</div>
                    </div>
                    <Toggle checked={false} onChange={() => toast.success(t("settings.autoDetectEnabled"))} />
                  </div>
                </div>
              </Section>
              <Section title={t("settings.dateFormat")}>
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
              <Section title={t("settings.timeFormat")}>
                <div className="flex items-center gap-2">
                  {[{ val: "12h", label: t("settings.format12h") }, { val: "24h", label: t("settings.format24h") }].map((f) => (
                    <button key={f.val} onClick={() => setTimeFormat(f.val)}
                      className={`flex-1 py-2.5 rounded-lg text-[12px] border transition-colors ${timeFormat === f.val ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title={t("settings.firstDayOfWeek")}>
                <div className="flex items-center gap-2">
                  {[{ val: "Sunday", label: t("settings.sunday") }, { val: "Monday", label: t("settings.monday") }, { val: "Saturday", label: t("settings.saturday") }].map((d) => (
                    <button key={d.val} onClick={() => setWeekStart(d.val)}
                      className={`flex-1 py-2 rounded-lg text-[12px] border transition-colors ${weekStart === d.val ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {d.label}
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
              <Section title={t("settings.workspaceDefaults")} description={t("settings.workspaceDefaultsDesc")}>
                <div className="mb-4 px-3 py-2.5 bg-neutral-800/40 rounded-lg text-neutral-500 text-[12px]">
                  {t("settings.defaultNotifApply")}
                </div>
                <div className="divide-y divide-neutral-800/40">
                  <ToggleRow label={t("settings.taskAssigned")} checked={defaultNotif.taskAssigned} onChange={() => setDefaultNotif(p => ({ ...p, taskAssigned: !p.taskAssigned }))} />
                  <ToggleRow label={t("settings.taskDueToday")} checked={defaultNotif.taskDue} onChange={() => setDefaultNotif(p => ({ ...p, taskDue: !p.taskDue }))} />
                  <ToggleRow label={t("settings.commentsAndMentions")} checked={defaultNotif.comments} onChange={() => setDefaultNotif(p => ({ ...p, comments: !p.comments }))} />
                  <ToggleRow label={t("settings.projectStatusChanges")} checked={defaultNotif.projectStatus} onChange={() => setDefaultNotif(p => ({ ...p, projectStatus: !p.projectStatus }))} />
                  <ToggleRow label={t("settings.newTeamMember")} checked={defaultNotif.newMember} onChange={() => setDefaultNotif(p => ({ ...p, newMember: !p.newMember }))} />
                  <ToggleRow label={t("settings.weeklyDigest")} checked={defaultNotif.digest} onChange={() => setDefaultNotif(p => ({ ...p, digest: !p.digest }))} />
                  <ToggleRow label={t("settings.productUpdates")} checked={defaultNotif.productUpdates} onChange={() => setDefaultNotif(p => ({ ...p, productUpdates: !p.productUpdates }))} />
                  <ToggleRow label={t("settings.securityAlerts")} checked={defaultNotif.security} onChange={() => setDefaultNotif(p => ({ ...p, security: !p.security }))} />
                </div>
              </Section>
              <div className="flex items-center justify-between">
                <button onClick={() => { setDefaultNotif({ taskAssigned: true, taskDue: true, comments: true, projectStatus: false, newMember: false, digest: true, productUpdates: false, security: true }); toast.success(t("settings.resetDefaults")); }} className="text-neutral-500 hover:text-neutral-300 text-[13px] flex items-center gap-1.5 transition-colors">
                  <RefreshCw size={13} /> {t("settings.resetToDefaults")}
                </button>
                <button onClick={async () => {
                  try {
                    await api.saveSettings("notifications", { ...notifState, defaults: defaultNotif });
                    toast.success(t("settings.defaultNotifSaved"));
                  } catch (e) { logger.error("app", "Failed to save defaults:", e); toast.error(t("settings.failedToSave")); }
                }} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-5 py-2 rounded-lg transition-colors">
                  {t("settings.saveDefaults")}
                </button>
              </div>
            </>
          )}

          {/* ── Members ── */}
          {activeNav === "Members" && (() => {
            const isAdmin = myRole === "owner" || myRole === "admin";
            const statusDot = (s: string) => s === "active" ? "#10b981" : "#404040";
            return (
            <>
              <Section title={t("settings.membersPermissions")} description={`${members.length} ${t("settings.activeMembersIn")}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-neutral-500 text-[12px]">{isAdmin ? t("settings.manageRoles") : t("settings.peopleInWorkspace")}</div>
                  {isAdmin && (
                    <button onClick={() => setShowInvite(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                      <Plus size={13} /> {t("settings.inviteMember")}
                    </button>
                  )}
                </div>
                <div className="bg-[#141414] border border-neutral-800/60 rounded-xl overflow-hidden">
                  <div className="hidden md:grid grid-cols-[1fr_120px_80px_32px] gap-4 px-4 py-2.5 border-b border-neutral-800/40">
                    {[t("settings.memberHeader"), t("settings.roleLabel"), t("settings.statusHeader"), ""].map((h) => (
                      <div key={h} className="text-neutral-600 text-[11px] uppercase tracking-wider">{h}</div>
                    ))}
                  </div>
                  <div className="divide-y divide-neutral-800/40">
                    {members.length === 0 && (
                      <div className="px-4 py-8 text-center text-neutral-600 text-[12px]">{t("settings.noMembersYet")}</div>
                    )}
                    {members.map((m) => {
                      const isOwner = m.role === "owner";
                      return (
                      <div key={m.user_id ?? m.email} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_120px_80px_32px] gap-3 md:gap-4 px-4 py-3 items-center">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-indigo-900/60 flex items-center justify-center text-indigo-300 text-[11px] font-['Lexend:SemiBold',_sans-serif] shrink-0">{m.initials}</div>
                          <div className="min-w-0">
                            <div className="text-neutral-200 text-[13px] truncate">{m.name}</div>
                            <div className="text-neutral-600 text-[11px] truncate">{m.email}</div>
                          </div>
                        </div>
                        {isAdmin && !isOwner ? (
                          <select
                            value={m.role}
                            onChange={(e) => changeMemberRole(m, e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-[12px] px-2 py-1.5 rounded-lg outline-none cursor-pointer"
                          >
                            {["admin", "member", "viewer"].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                          </select>
                        ) : (
                          <span className="text-neutral-400 text-[12px] capitalize">{m.role}</span>
                        )}
                        <div className="hidden md:flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusDot(m.status) }} />
                          <span className="text-neutral-500 text-[12px] capitalize">{m.status}</span>
                        </div>
                        {isAdmin && !isOwner ? (
                          <button
                            onClick={() => removeMember(m)}
                            className="text-neutral-600 hover:text-red-400 transition-colors"
                            aria-label={`Remove ${m.name}`}
                          >
                            <X size={14} />
                          </button>
                        ) : <span />}
                      </div>
                      );
                    })}
                  </div>
                </div>
              </Section>
              {isAdmin && (
                <Section title={t("settings.pendingInvites")} description={t("settings.pendingInvitesDesc")}>
                  <div className="space-y-2">
                    {pendingList.length === 0 && (
                      <div className="text-neutral-600 text-[12px] py-2">No pending invitations.</div>
                    )}
                    {pendingList.map((inv) => {
                      const link = `${window.location.origin}/join/${inv.token}`;
                      return (
                      <div key={inv.id} className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl gap-3">
                        <div className="min-w-0">
                          <div className="text-neutral-300 text-[13px] truncate">{inv.email}</div>
                          <div className="text-neutral-600 text-[11px] mt-0.5 capitalize">{inv.role} · pending</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => { navigator.clipboard.writeText(link).catch(() => {}); toast.success(t("settings.inviteLinkCopied")); }} className="text-neutral-400 hover:text-neutral-200 text-[12px] px-2.5 py-1 rounded-lg border border-neutral-800 hover:bg-neutral-800 transition-colors">Copy link</button>
                          <button onClick={() => cancelInvite(inv)} className="text-red-400 hover:text-red-300 text-[12px] px-2.5 py-1 rounded-lg border border-red-900/40 hover:bg-red-950/30 transition-colors">Cancel</button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </Section>
              )}
            </>
            );
          })()}

          {/* ── Billing ── */}
          {activeNav === "Billing" && (() => {
            const planActive = subscription?.status === "active";
            const planExpired = subscription?.status === "expired";
            const isPaid = plan.monthly > 0;
            const intervalYearly = subscription?.interval === "yearly";
            const priceLabel = isPaid
              ? `${idrFmt.format(intervalYearly ? plan.yearly : plan.monthly)} ${intervalYearly ? "/ year" : "/ month"}`
              : `${idrFmt.format(0)} / month`;
            const statusBadge: Record<string, { label: string; cls: string }> = {
              paid: { label: "Paid", cls: "bg-emerald-900/40 text-emerald-400" },
              pending: { label: "Pending", cls: "bg-amber-900/40 text-amber-400" },
              failed: { label: "Failed", cls: "bg-red-900/40 text-red-400" },
            };
            return (
            <>
              <Section title={t("settings.currentPlan")} description={`${t("settings.workspaceOnPlan")} ${plan.name}.`}>
                {billingLoading ? (
                  <div className="p-6 text-center text-neutral-600 text-[13px]">Loading…</div>
                ) : (
                <div className="p-4 bg-indigo-950/20 border border-indigo-800/40 rounded-xl mb-3">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-neutral-50 text-[16px] font-['Lexend:SemiBold',_sans-serif] mb-0.5">{plan.name} Plan</div>
                      <div className="text-neutral-400 text-[13px]">{priceLabel}</div>
                    </div>
                    {planActive ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-900/40 text-emerald-400 shrink-0">Active</span>
                    ) : planExpired ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-red-900/40 text-red-400 shrink-0">Expired</span>
                    ) : (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-400 shrink-0">Free</span>
                    )}
                  </div>
                  <div className="text-neutral-500 text-[12px] mb-4">
                    {planActive && subscription
                      ? <>Renews on <span className="text-neutral-300">{billingDateFmt.format(new Date(subscription.current_period_end))}</span></>
                      : planExpired && subscription
                        ? <>Expired on <span className="text-neutral-300">{billingDateFmt.format(new Date(subscription.current_period_end))}</span></>
                        : "No active paid subscription."}
                  </div>
                  <div className="flex gap-2">
                    <Link to="/pricing" className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors">
                      {isPaid ? "Change plan" : "Upgrade plan"}
                    </Link>
                    {(planActive || planExpired) && subscription && (
                      <Link to={`/checkout/${subscription.plan_id}?interval=${subscription.interval}`} className="inline-block border border-neutral-700 hover:bg-neutral-800 text-neutral-300 text-[13px] px-4 py-2 rounded-lg transition-colors">
                        {planExpired ? "Renew plan" : "Renew now"}
                      </Link>
                    )}
                  </div>
                </div>
                )}
                <div className="flex items-start gap-2 text-neutral-300 text-[12px] mt-1">
                  {plan.features?.length > 0 && (
                    <ul className="space-y-1.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check size={13} className="mt-0.5 shrink-0 text-indigo-400" /> {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Section>
              <Section title={t("settings.billingHistory")}>
                <div className="bg-[#141414] border border-neutral-800/60 rounded-xl overflow-hidden">
                  {transactions.length === 0 ? (
                    <div className="px-4 py-8 text-center text-neutral-600 text-[12px]">
                      No payments yet. Transactions from checkout will appear here.
                    </div>
                  ) : (
                  <div className="divide-y divide-neutral-800/40">
                    {transactions.map((tx) => {
                      const badge = statusBadge[tx.status] ?? statusBadge.pending;
                      return (
                      <div key={tx.order_id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-neutral-300 text-[13px]">{tx.plan_name} · {tx.interval}</div>
                          <div className="text-neutral-600 text-[11px] mt-0.5 truncate">
                            {billingDateFmt.format(new Date(tx.created_at))} · {tx.order_id}
                            {tx.voucher_code ? ` · voucher ${tx.voucher_code}` : ""}
                          </div>
                        </div>
                        <div className="text-neutral-50 text-[13px] font-['Lexend:SemiBold',_sans-serif] shrink-0">{idrFmt.format(tx.gross_amount)}</div>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${badge.cls}`}>{badge.label}</span>
                        {tx.status === "pending" ? (
                          <Link to={`/payment/finish?order_id=${encodeURIComponent(tx.order_id)}`} className="text-indigo-400 hover:text-indigo-300 text-[11px] shrink-0">Continue</Link>
                        ) : (
                          <button onClick={() => {
                            const blob = new Blob([JSON.stringify(tx, null, 2)], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `invoice-${tx.order_id}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                            toast.success(t("settings.invoiceDownloaded"));
                          }} className="text-neutral-600 hover:text-neutral-400 transition-colors shrink-0">
                            <Download size={14} />
                          </button>
                        )}
                      </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              </Section>
            </>
            );
          })()}

          {/* ── Integrations ── */}
          {activeNav === "Integrations" && (
            <Section title={t("settings.integrations")} description={t("settings.integrationsDesc")}>
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
              <Section title={t("settings.apiKeys")} description={t("settings.apiKeysDesc")}>
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

              <Section title={t("settings.webhooks")} description={t("settings.webhooksDesc")}>
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
            <Section title={t("settings.auditLog")} description={t("settings.auditLogDesc")}>
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
                  {filteredLogs.length === 0 && (
                    <div className="px-4 py-8 text-center text-neutral-600 text-[12px]">
                      No activity recorded yet. Actions like role changes, integrations, and security updates will appear here.
                    </div>
                  )}
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
              {filteredLogs.length > 0 && (
                <button disabled className="w-full mt-3 py-2 text-neutral-700 text-[12px] transition-colors cursor-not-allowed">
                  End of log
                </button>
              )}
            </Section>
          )}

          {/* ── Data & Export ── */}
          {activeNav === "Data & Export" && (
            <>
              <Section title={t("settings.exportData")} description={t("settings.exportDataDesc")}>
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
              <Section title={t("settings.dataRetention")} description={t("settings.dataRetentionDesc")}>
                <div className="divide-y divide-neutral-800/40">
                  <ToggleRow label={t("settings.autoArchiveCompleted")} description={t("settings.autoArchiveCompletedDesc")} checked={dataPrefs.autoArchiveCompleted} onChange={() => setDataPrefs(p => ({ ...p, autoArchiveCompleted: !p.autoArchiveCompleted }))} />
                  <ToggleRow label={t("settings.autoDeleteArchived")} description={t("settings.autoDeleteArchivedDesc")} checked={dataPrefs.autoDeleteArchived} onChange={() => setDataPrefs(p => ({ ...p, autoDeleteArchived: !p.autoDeleteArchived }))} />
                  <ToggleRow label={t("settings.retainAuditLogs")} description={t("settings.retainAuditLogsDesc")} checked={dataPrefs.retainAuditLogs} onChange={() => setDataPrefs(p => ({ ...p, retainAuditLogs: !p.retainAuditLogs }))} />
                </div>
              </Section>
              <SaveRow onSave={async () => {
                try { await api.saveSettings("workspace", { name: "", url: "", industry: "", teamSize: "", region: "", ...workspaceData, workspacePrefs, dataPrefs, logoBase64: logoSrc ?? workspaceData.logoBase64 }); toast.success(t("settings.dataRetentionSaved")); }
                catch (e) { logger.error("app", "Failed to save data retention:", e); toast.error(t("settings.failedToSave")); }
              }} />
              <Section title={t("settings.privacyGdpr")}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl gap-3">
                    <div>
                      <div className="text-neutral-200 text-[13px]">Download personal data</div>
                      <div className="text-neutral-600 text-[11px] mt-0.5">A copy of all data associated with your account</div>
                    </div>
                    <button onClick={async () => {
                      try {
                        const profile = await api.getSettings("profile");
                        const payload = {
                          profile,
                          billing: { plan: plan.name, subscription, transactions },
                          exportedAt: new Date().toISOString(),
                        };
                        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `personal-data-${new Date().toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success(t("settings.personalDataDownloaded"));
                      } catch (e) { logger.error("app", "Failed to download personal data:", e); toast.error(t("settings.downloadFailed")); }
                    }} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors shrink-0">Download</button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl gap-3">
                    <div>
                      <div className="text-neutral-200 text-[13px]">Request data deletion</div>
                      <div className="text-neutral-600 text-[11px] mt-0.5">Permanently remove all your personal data</div>
                    </div>
                    <button onClick={() => toast.error(t("settings.contactSupportDeletion"))} className="border border-red-900/40 hover:bg-red-950/30 text-red-400 hover:text-red-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors shrink-0">Request deletion</button>
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
                  <select
                    value={transferTargetEmail}
                    onChange={(e) => setTransferTargetEmail(e.target.value)}
                    className="w-full bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none select-arrow cursor-pointer"
                  >
                    <option value="">Select an admin</option>
                    {members.filter((m) => m.role === "Admin").map((m) => (
                      <option key={m.initials} value={m.email}>{m.name} ({m.email})</option>
                    ))}
                  </select>
                </div>
                <button
                  disabled={!transferTargetEmail}
                  onClick={async () => {
                    try {
                      await api.transferOwnership(transferTargetEmail);
                      toast.success(t("settings.ownershipTransferred"));
                      await supabase.auth.signOut();
                      window.location.href = "/";
                    } catch (e: unknown) {
                      toast.error((e instanceof Error ? e.message : undefined) || "Failed to transfer ownership");
                    }
                  }}
                  className="border border-amber-800/60 hover:bg-amber-950/30 text-amber-400 hover:text-amber-300 text-[13px] px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
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
                      toast.success(t("settings.workspaceReset"));
                      setDangerReset("");
                    } catch (e) { logger.error("app", "Failed to reset workspace:", e); toast.error(t("settings.failedToResetWorkspace")); }
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
                <div>
                  <label className="block text-neutral-500 text-[12px] mb-1.5">Enter your password to confirm deletion</label>
                  <input
                    type="password"
                    value={dangerPassword}
                    onChange={(e) => setDangerPassword(e.target.value)}
                    placeholder="Your account password"
                    className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-red-600/40 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-700"
                  />
                </div>
                <button
                  disabled={!profileData.email || dangerEmail !== profileData.email || !dangerPassword}
                  onClick={async () => {
                    try {
                      await api.deleteAccount(dangerPassword);
                      toast.success(t("settings.accountDeleted"));
                      await supabase.auth.signOut();
                      window.location.href = "/";
                    } catch (e: unknown) {
                      toast.error((e instanceof Error ? e.message : undefined) || "Failed to delete account");
                    }
                  }}
                  className="bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 size={14} /> Delete my account
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      <InviteMemberModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        onInvited={() => { void loadMembersAndInvites(); }}
      />
    </div>
  );
}
