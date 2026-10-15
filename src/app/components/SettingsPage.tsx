import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
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
import { OwnerOnly } from "./OwnerOnly";
import { useLang, LangToggle } from "../i18n";
import * as api from "../utils/api";
import { supabase, signInWithEmail, updatePassword as updateAuthPassword } from "../utils/supabase";
import { useAuth } from "../auth/AuthContext";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useRealtimeWorkspace } from "../realtime";

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

function ToggleRow({ label, description, defaultChecked = false, checked, onChange }: { label: string; description?: string; defaultChecked?: boolean; checked?: boolean; onChange?: () => void }) {
  const [internal, setInternal] = useState(defaultChecked);
  const isControlled = checked !== undefined;
  const value = isControlled ? checked : internal;
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="min-w-0">
        <div className="text-neutral-200 text-[13px]">{label}</div>
        {description && <div className="text-neutral-600 text-[12px] mt-0.5">{description}</div>}
      </div>
      <Toggle checked={value} onChange={isControlled ? onChange ?? (() => {}) : () => setInternal(!internal)} />
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
  const routerNavigate = useNavigate();
  const { lang, setLang, t } = useLang();
  const { user } = useAuth();
  const [activeNav, setActiveNav] = useState("Profile");
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [sessions, setSessions] = useState<{ device: string; location: string; ip: string; lastActive: string; current: boolean }[]>([]);
  const [loginHistory, setLoginHistory] = useState<{ date: string; ip: string; device: string; status: string }[]>([]);
  const [members, setMembers] = useState<api.WorkspaceMember[]>([]);
  const [invitesList, setInvitesList] = useState<api.WorkspaceInvitation[]>([]);
  const [billing, setBilling] = useState<any | null>(null);
  const [quota, setQuota] = useState<api.QuotaInfo | null>(null);
  const [profileData, setProfileData] = useState<any>({});
  const [workspaceData, setWorkspaceData] = useState<any>({});
  const [showInvite, setShowInvite] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState("");
  const [twoFASetup, setTwoFASetup] = useState<{ secret: string; otpauthUrl: string; backupCodes: string[] } | null>(null);
  const [loading2FA, setLoading2FA] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disable2FACode, setDisable2FACode] = useState("");
  useEffect(() => {
    setIs2FAEnabled(!!(user?.user_metadata?.totp_enabled || user?.user_metadata?.email_otp_enabled));
  }, [user]);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [updatingPw, setUpdatingPw] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState<string | null>(null);
  const [autoDetectTz, setAutoDetectTz] = useState(false);
  const [accentColor, setAccentColor] = useState("#6366f1");
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">("medium");
  const [density, setDensity] = useState<"compact" | "comfortable" | "spacious">("comfortable");
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY");
  const [timeFormat, setTimeFormat] = useState("12h");
  const [weekStart, setWeekStart] = useState("Monday");
  const [auditFilter, setAuditFilter] = useState("All");
  const [auditVisible, setAuditVisible] = useState(20);
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
    tasks: "CSV", projects: "CSV", team: "CSV", files: "CSV",
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
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [transferCandidates, setTransferCandidates] = useState<api.WorkspaceMember[]>([]);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [confirmingTransfer, setConfirmingTransfer] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [sidebarPosition, setSidebarPosition] = useState<"left" | "right">("left");
  const [workspacePrefs, setWorkspacePrefs] = useState({
    showCompleted: false, compactView: false, publicLinks: true, require2FA: false, guestAccess: true,
  });
  const [securityPrefs, setSecurityPrefs] = useState({
    trustedDevices: true, loginNotifications: true, sessionTimeout: false,
  });
  const [defaultNotifs, setDefaultNotifs] = useState({
    taskAssigned: true, taskDue: true, comments: true, projectStatus: false,
    newMember: false, digest: true, productUpdates: false, security: true,
  });
  const [retention, setRetention] = useState({
    autoArchive: true, autoDelete: false, retainAudit: true,
  });

  const { activeWorkspace, isOwner } = useWorkspace();
  useRealtimeWorkspace(activeWorkspace?.id ?? null, (table) => {
    if (table === "workspace_settings") {
      api.getSettings("appearance").then((data) => {
        if (data) {
          if (data.theme) setTheme(data.theme);
          if (data.accent) setAccentColor(accentColors.find((a) => a.label.toLowerCase() === data.accent)?.value ?? "#6366f1");
          if (data.fontSize) setFontSize(data.fontSize);
          if (data.density) setDensity(data.density);
        }
      }).catch(() => {});
    }
  });

  // Load settings sections from Supabase
  useEffect(() => {
    const loads: Promise<unknown>[] = [];
    loads.push(
      api.getSettings("workspace-prefs").then((data) => {
        if (data && typeof data === "object") setWorkspacePrefs((prev) => ({ ...prev, ...data }));
      }).catch((e) => console.error("Failed to load workspace-prefs:", e)),
    );
    loads.push(
      api.getSettings("default-notifications").then((data) => {
        if (data && typeof data === "object") setDefaultNotifs((prev) => ({ ...prev, ...data }));
      }).catch((e) => console.error("Failed to load default-notifications:", e)),
    );
    loads.push(
      api.getSettings("security-prefs").then((data) => {
        if (data && typeof data === "object") setSecurityPrefs((prev) => ({ ...prev, ...data }));
      }).catch((e) => console.error("Failed to load security-prefs:", e)),
    );
    loads.push(
      api.getSettings("retention").then((data) => {
        if (data && typeof data === "object") setRetention((prev) => ({ ...prev, ...data }));
      }).catch((e) => console.error("Failed to load retention:", e)),
    );
    loads.push(
      api.getSettings("api-keys").then((data) => {
        if (Array.isArray(data)) setApiKeysList(data);
      }).catch((e) => console.error("Failed to load api-keys:", e)),
    );

    loads.push(api.getSettings("webhooks").then((data) => {
      if (Array.isArray(data)) setWebhooksList(data);
    }).catch((e) => console.error("Failed to load webhooks:", e)));

    loads.push(api.getSettings("audit-log").then((data) => {
      if (Array.isArray(data)) setAuditLogData(data.map((e: any) => ({
        actor: e.actor, name: e.actorName, action: e.action, target: e.target,
        ip: e.ip, time: e.timestamp, category: e.category,
      })));
    }).catch((e) => console.error("Failed to load audit-log:", e)));

    loads.push(api.getSettings("appearance").then((data) => {
      if (data) {
        if (data.theme) setTheme(data.theme);
        if (data.accent) setAccentColor(accentColors.find((a) => a.label.toLowerCase() === data.accent)?.value ?? "#6366f1");
        if (data.fontSize) setFontSize(data.fontSize);
        if (data.density) setDensity(data.density);
        if (data.sidebarPosition === "left" || data.sidebarPosition === "right") setSidebarPosition(data.sidebarPosition);
      }
    }).catch((e) => console.error("Failed to load appearance:", e)));

    loads.push(api.getSettings("timezone").then((data) => {
      if (data) {
        if (data.dateFormat) setDateFormat(data.dateFormat);
        if (data.timeFormat) setTimeFormat(data.timeFormat);
        if (data.firstDay) setWeekStart(data.firstDay);
        if (data.timezone) setSelectedTimezone(data.timezone);
        else {
          try {
            const guessed = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (guessed) setSelectedTimezone(guessed);
          } catch { /* Intl unavailable — keep null so the select falls back */ }
        }
        if (typeof data.autoDetect === "boolean") setAutoDetectTz(data.autoDetect);
      }
    }).catch((e) => console.error("Failed to load timezone:", e)));

    loads.push(api.getSettings("notifications").then((data) => {
      if (data && typeof data === "object") setNotifState((prev) => ({ ...prev, ...data }));
    }).catch((e) => console.error("Failed to load notifications:", e)));

    // Fetch integrations from Supabase
    loads.push(api.getIntegrations().then((data) => {
      if (Array.isArray(data)) {
        setIntegrations(data.map((d: any) => ({ ...d, icon: integrationIcons[d.name] ?? <Zap size={16} /> })));
      }
    }).catch((e) => console.error("Failed to load integrations:", e)));

    loads.push(api.getSettings("billing").then((data) => {
      if (data) setBilling(data);
    }).catch((e) => console.error("Failed to load billing:", e)));

    loads.push(api.getSettings("profile").then((data) => {
      if (data) setProfileData(data);
    }).catch((e) => console.error("Failed to load profile:", e)));

    loads.push(api.getSettings("workspace").then((data) => {
      if (data) setWorkspaceData(data);
    }).catch((e) => console.error("Failed to load workspace:", e)));

    // Fetch sessions from Supabase
    loads.push(api.getSessions().then((data) => {
      if (data?.active) setSessions(data.active);
      if (data?.loginHistory) setLoginHistory(data.loginHistory);
    }).catch((e) => console.error("Failed to load sessions:", e)));

    Promise.allSettled(loads).then(() => setSettingsLoading(false));
  }, [activeWorkspace?.id]);

  // Canonical members list: same workspace_members API as WorkspaceMembersModal.
  useEffect(() => {
    if (activeNav !== "Members" || !activeWorkspace) return;
    api.getWorkspaceMembers(activeWorkspace.id)
      .then((list) => {
        setMembers(list);
        setMemberRoles(Object.fromEntries(list.map((m) => [m.user_id, m.role])));
      })
      .catch((e) => console.error("Failed to load workspace members:", e));
    api.getWorkspaceInvites(activeWorkspace.id)
      .then((list) => setInvitesList(list.filter((i) => i.status === "pending")))
      .catch((e) => console.error("Failed to load workspace invites:", e));
  }, [activeNav, activeWorkspace?.id]);

  // Ownership-transfer candidates: workspace members excluding self.
  // Loaded lazily when the Danger Zone opens so non-owners pay no extra fetch.
  useEffect(() => {
    if (activeNav !== "Danger Zone" || !activeWorkspace) return;
    api.getWorkspaceMembers(activeWorkspace.id)
      .then((list) => {
        const mine = user?.id;
        const others = list.filter((m) => m.user_id !== mine);
        setTransferCandidates(others);
        setTransferTarget((prev) => (others.some((m) => m.user_id === prev) ? prev : ""));
      })
      .catch((e) => console.error("Failed to load transfer candidates:", e));
  }, [activeNav, activeWorkspace, user?.id]);

  const handleTransferOwnership = async () => {
    if (!activeWorkspace || !transferTarget) return;
    const target = transferCandidates.find((m) => m.user_id === transferTarget);
    const myId = user?.id;
    // Demote self to member after the promotion succeeds so there is never
    // more than one owner. Snapshot the target's previous role for rollback.
    const targetPrevRole = (target?.role ?? "member") as api.WorkspaceRole;
    setTransferring(true);
    try {
      await api.updateWorkspaceMemberRole(activeWorkspace.id, transferTarget, "owner");
      if (myId && myId !== transferTarget) {
        try {
          await api.updateWorkspaceMemberRole(activeWorkspace.id, myId, "member");
        } catch (demoteErr) {
          // Roll the promotion back — two owners is worse than a failed transfer.
          await api.updateWorkspaceMemberRole(activeWorkspace.id, transferTarget, targetPrevRole).catch(() => {});
          throw demoteErr;
        }
      }
      toast.success(
        target ? `Ownership transferred to ${target.name}` : "Ownership transferred",
      );
      setTransferCandidates((prev) => prev.filter((m) => m.user_id !== transferTarget));
      setTransferTarget("");
      setConfirmingTransfer(false);
    } catch (e) {
      console.error("Failed to transfer ownership:", e);
      toast.error(e instanceof Error ? e.message : "Failed to transfer ownership");
    } finally {
      setTransferring(false);
    }
  };

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

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (JPG or PNG)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB");
      return;
    }
    // Instant local preview while the real upload runs.
    const objectUrl = URL.createObjectURL(file);
    setAvatarSrc(objectUrl);
    setUploadingAvatar(true);
    try {
      const uploaded = await api.uploadAvatar(file);
      setAvatarSrc(uploaded.url);
      URL.revokeObjectURL(objectUrl);
      toast.success("Profile photo updated");
    } catch (err) {
      URL.revokeObjectURL(objectUrl);
      setAvatarSrc(null);
      toast.error(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  // Workspace logo uses the same avatar pipeline (server validates type/size).
  // Kept in a SEPARATE logoSrc state so it never overwrites the profile avatar.
  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (PNG or SVG)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB");
      return;
    }
    setUploadingLogo(true);
    try {
      const uploaded = await api.uploadAvatar(file);
      setLogoSrc(uploaded.url);
      toast.success("Workspace logo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  };

  const updatePassword = async () => {
    if (!pw.current) return toast.error("Enter your current password");
    if (pw.next.length < 12) return toast.error("New password must be at least 12 characters");
    if (pw.next !== pw.confirm) return toast.error("Passwords do not match");
    // Supabase has no "change password with current password" endpoint, so
    // re-authenticate with the current password first, then update.
    if (!user?.email) return toast.error("Session expired — please sign in again");
    setUpdatingPw(true);
    try {
      const { error: signInError } = await signInWithEmail(user.email, pw.current);
      if (signInError) {
        toast.error("Current password is incorrect");
        return;
      }
      const { error: updateError } = await updateAuthPassword(pw.next);
      if (updateError) {
        toast.error(updateError.message);
        return;
      }
      toast.success("Password updated successfully");
      setPw({ current: "", next: "", confirm: "" });
    } finally {
      setUpdatingPw(false);
    }
  };

  const start2FASetup = async () => {
    setLoading2FA(true);
    try {
      setTwoFASetup(await api.setup2FA());
      setShow2FA(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start 2FA setup");
    } finally {
      setLoading2FA(false);
    }
  };

  const verify2FA = async () => {
    if (twoFACode.length !== 6 || !twoFASetup) return toast.error(t("auth.invalidCode"));
    setLoading2FA(true);
    try {
      await api.verify2FA(twoFACode);
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      const meta = (data.session?.user?.user_metadata ?? {}) as Record<string, unknown>;
      setIs2FAEnabled(!!(meta.totp_enabled || meta.email_otp_enabled));
      toast.success(t("settings.twoFAEnabledToast"));
      setShow2FA(false);
      setTwoFASetup(null);
      setTwoFACode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("auth.invalidCode"));
    } finally {
      setLoading2FA(false);
    }
  };

  const disable2FA = async () => {
    if (!disable2FACode) return toast.error(t("settings.enterCodeToDisable"));
    setLoading2FA(true);
    try {
      const code = disable2FACode.replace(/\s/g, "");
      const payload = code.length === 6 && /^\d+$/.test(code)
        ? { code }
        : { backupCode: code.toUpperCase() };
      await api.disable2FA(payload.code, payload.backupCode);
      await supabase.auth.refreshSession();
      setIs2FAEnabled(false);
      toast.success(t("settings.twoFADisabledToast"));
      setShowDisable2FA(false);
      setDisable2FACode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("settings.twoFADisabledToastFail"));
    } finally {
      setLoading2FA(false);
    }
  };

  const generateApiKey = async () => {
    // Client-minted secrets removed: API keys are server-managed.
    // Key creation is disabled here until the server issuance endpoint lands.
    toast.error("Server-managed API keys — coming soon");
  };

  const copyKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey).catch(() => {});
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const revokeKey = async (id: number) => {
    const revoked = apiKeysList.find((k) => k.id === id);
    const updated = apiKeysList.filter((k) => k.id !== id);
    setApiKeysList(updated);
    toast.success(revoked ? `API key "${revoked.name}" revoked` : "API key revoked");
    try { await api.saveSettings("api-keys", updated); } catch (e) { console.error("Failed to save api keys:", e); }
  };

  const toggleWebhook = async (idx: number) => {
    const updated = webhooksList.map((w, i) => i === idx ? { ...w, active: !w.active } : w);
    setWebhooksList(updated);
    try { await api.saveSettings("webhooks", updated); } catch (e) { console.error("Failed to save webhooks:", e); }
  };

  const deleteWebhook = async (idx: number) => {
    const updated = webhooksList.filter((_, i) => i !== idx);
    setWebhooksList(updated);
    toast.success("Webhook deleted");
    try { await api.saveSettings("webhooks", updated); } catch (e) { console.error("Failed to save webhooks:", e); }
  };

  const saveWorkspacePrefs = async () => {
    try {
      await api.saveSettings("workspace-prefs", workspacePrefs);
      toast.success("Workspace settings saved");
    } catch (e) { console.error("Failed to save workspace prefs:", e); toast.error("Failed to save"); }
  };

  const saveSecurityPrefs = async () => {
    try {
      await api.saveSettings("security-prefs", securityPrefs);
      toast.success("Security settings saved");
    } catch (e) { console.error("Failed to save security prefs:", e); toast.error("Failed to save"); }
  };

  const saveRetention = async () => {
    try {
      await api.saveSettings("retention", retention);
      toast.success("Retention settings saved");
    } catch (e) { console.error("Failed to save retention:", e); toast.error("Failed to save"); }
  };

  // Never reuse projects-CSV for invoices: build a receipt Blob instead.
  const handleInvoiceDownload = (inv: { date: string; amount: string; status: string }) => {
    const lines = [
      `Invoice — ${billing?.plan ?? "Workspace"} plan`,
      `Invoice ID: INV-${String(inv.date).replace(/[^0-9]/g, "").slice(0, 8) || "00000000"}-${String(billing?.seats ?? 0).padStart(2, "0")}`,
      `Date: ${inv.date}`,
      `Plan: ${billing?.plan ?? "—"} (${billing?.seats ?? 0} seats)`,
      `Amount: ${inv.amount}`,
      `Status: ${inv.status}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${String(inv.date).replace(/[^0-9]/g, "").slice(0, 8) || "receipt"}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Invoice downloaded");
  };

  const saveAppearance = async () => {
    const accentLabel = accentColors.find((a) => a.value === accentColor)?.label.toLowerCase() ?? "indigo";
    try {
      await api.saveSettings("appearance", { theme, accent: accentLabel, fontSize, density, sidebarPosition });
      toast.success("Appearance settings saved");
    } catch (e) { console.error("Failed to save appearance:", e); toast.error("Failed to save"); }
  };

  const saveTimezone = async () => {
    let tz = selectedTimezone;
    if (autoDetectTz || !tz) {
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch { /* fall through to guard below */ }
    }
    if (!tz) return toast.error("Select a timezone first");
    try {
      await api.saveSettings("timezone", { timezone: tz, dateFormat, timeFormat, firstDay: weekStart, autoDetect: autoDetectTz });
      setSelectedTimezone(tz);
      toast.success("Timezone settings saved");
    } catch (e) { console.error("Failed to save timezone:", e); toast.error("Failed to save"); }
  };

  const saveProfile = async () => {
    try {
      // Email changes go through Supabase Auth (may require re-verification);
      // everything else persists to the settings store.
      const currentEmail = user?.email ?? "";
      const nextEmail = (profileData.email ?? "").trim();
      if (nextEmail && nextEmail !== currentEmail) {
        const { error } = await supabase.auth.updateUser({ email: nextEmail });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Verification email sent — confirm your new address to finish changing email");
      }
      const { email: _email, ...rest } = profileData;
      void _email;
      await api.saveSettings("profile", { firstName: "", lastName: "", phone: "", title: "", department: "Engineering", bio: "", github: "", linkedin: "", ...rest });
      toast.success("Profile saved");
    } catch (e) { console.error("Failed to save profile:", e); toast.error("Failed to save"); }
  };

  const saveNotifications = async () => {
    try {
      await api.saveSettings("notifications", notifState);
      toast.success("Notification settings saved");
    } catch (e) { console.error("Failed to save notifications:", e); toast.error("Failed to save"); }
  };

  const handleExport = async (key: string, downloadName?: string) => {
    const label = downloadName ?? key;
    const format = exportFormats[key] ?? "CSV";
    try {
      let data: any;
      if (key === "tasks") data = await api.getTasks();
      else if (key === "projects") data = await api.getProjects();
      else if (key === "team") data = await api.getTeams();
      else if (key === "files") { const res = await api.getFiles(); data = res.files; }
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
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${label} exported as ${format}`);
    } catch (e) { console.error("Export failed:", e); toast.error("Export failed"); }
  };

  const addWebhook = async () => {
    const url = newWebhookUrl.trim();
    const events = newWebhookEvents.split(",").map((e) => e.trim()).filter(Boolean);
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("bad-protocol");
    } catch {
      return toast.error("Enter a valid webhook URL (http(s)://…)");
    }
    if (events.length === 0) return toast.error("Enter at least one event");
    const newHook = { url, events: events.join(", "), active: true };
    const updated = [...webhooksList, newHook];
    setWebhooksList(updated);
    setShowWebhookForm(false);
    setNewWebhookUrl("");
    setNewWebhookEvents("");
    toast.success("Webhook added");
    try { await api.saveSettings("webhooks", updated); } catch (e) { console.error("Failed to save webhooks:", e); }
  };

  const AUDIT_CATEGORIES = ["All", "Security", "Members", "Integrations", "API", "Settings"] as const;
  const filteredLogs = auditFilter === "All" ? auditLogData : auditLogData.filter((l) => l.category === auditFilter);
  const visibleLogs = filteredLogs.slice(0, auditVisible);

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
        {settingsLoading ? (
          <div className="max-w-2xl space-y-7 lg:space-y-8" aria-label="Loading settings">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-3">
                <div className="h-5 w-48 animate-pulse rounded bg-neutral-800" />
                <div className="h-3 w-72 animate-pulse rounded bg-neutral-800/70" />
                <div className="h-24 animate-pulse rounded-xl bg-neutral-800/40" />
              </div>
            ))}
          </div>
        ) : (
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
                    <button onClick={updatePassword} disabled={updatingPw} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[13px] px-5 py-2 rounded-lg transition-colors">{updatingPw ? "Updating…" : t("settings.updatePassword")}</button>
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
                      <div className="text-neutral-200 text-[13px]">
                        {t("settings.authenticatorApp")}
                        {is2FAEnabled && (
                          <span className="ml-2 rounded-full bg-emerald-950/60 px-2 py-0.5 text-[10px] text-emerald-400">
                            {t("settings.twoFAEnabledBadge")}
                          </span>
                        )}
                      </div>
                      <div className="text-neutral-600 text-[12px]">
                        {is2FAEnabled ? t("settings.twoFAEnabledDesc") : t("settings.authenticatorAppDesc")}
                      </div>
                    </div>
                  </div>
                  {is2FAEnabled ? (
                    <button
                      onClick={() => { setShowDisable2FA(!showDisable2FA); setShow2FA(false); }}
                      className="border border-neutral-800 hover:border-red-900 hover:text-red-400 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors shrink-0"
                    >
                      {t("settings.disable2FA")}
                    </button>
                  ) : (
                    <button
                      onClick={() => (show2FA ? setShow2FA(false) : start2FASetup())}
                      disabled={loading2FA}
                      className="border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50"
                    >
                      {show2FA ? t("common.cancel") : t("settings.setup2FA")}
                    </button>
                  )}
                </div>
                {showDisable2FA && is2FAEnabled && (
                  <div className="p-4 bg-neutral-800/30 rounded-xl space-y-3">
                    <p className="text-neutral-400 text-[12px]">{t("settings.enterCodeToDisable")}</p>
                    <div className="flex gap-2">
                      <input
                        type="text" maxLength={8} placeholder="000000" value={disable2FACode}
                        onChange={(e) => setDisable2FACode(e.target.value.replace(/\s/g, ""))}
                        className="flex-1 bg-[#0f0f0f] border border-neutral-800 focus:border-red-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[14px] text-center tracking-widest outline-none transition-colors font-['Lexend:Regular',_sans-serif]"
                      />
                      <button onClick={disable2FA} disabled={loading2FA} className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-[13px] px-4 py-2 rounded-lg transition-colors">{t("settings.disable2FA")}</button>
                    </div>
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
                    <p className="text-neutral-400 text-[12px] text-center">{t("settings.enter6Digit")}</p>
                    <div className="flex gap-2">
                      <input
                        type="text" maxLength={6} placeholder="000000" value={twoFACode}
                        onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, ""))}
                        className="flex-1 bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[14px] text-center tracking-widest outline-none transition-colors font-['Lexend:Regular',_sans-serif]"
                      />
                      <button onClick={verify2FA} disabled={loading2FA} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[13px] px-4 py-2 rounded-lg transition-colors">{t("settings.verify")}</button>
                    </div>
                  </div>
                )}
              </Section>

              <Section title={t("settings.activeSessions")} description={t("settings.activeSessionsDesc")}>
                <p className="text-neutral-500 text-[12px] mb-3">Revoking signs out all sessions server-side.</p>
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
                          try { await api.revokeSession(s.device); } catch (e) { console.error("Revoke failed:", e); }
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
                  <ToggleRow label={t("settings.trustedDevices")} description={t("settings.trustedDevicesDesc")} checked={securityPrefs.trustedDevices} onChange={() => setSecurityPrefs((p) => ({ ...p, trustedDevices: !p.trustedDevices }))} />
                  <ToggleRow label={t("settings.loginNotifications")} description={t("settings.loginNotificationsDesc")} checked={securityPrefs.loginNotifications} onChange={() => setSecurityPrefs((p) => ({ ...p, loginNotifications: !p.loginNotifications }))} />
                  <ToggleRow label={t("settings.sessionTimeout")} description={t("settings.sessionTimeoutDesc")} checked={securityPrefs.sessionTimeout} onChange={() => setSecurityPrefs((p) => ({ ...p, sessionTimeout: !p.sessionTimeout }))} />
                </div>
              </Section>
              <SaveRow onSave={saveSecurityPrefs} label={t("settings.saveChanges")} />
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
                    <Section title={t("settings.notificationChannels")} description={t("settings.notificationChannelsDesc")}>
                      <div className="divide-y divide-neutral-800/40">
                        {n("inApp", t("settings.inApp"), t("settings.inAppDesc"))}
                        {n("email", t("settings.emailNotifs"), t("settings.emailNotifsDesc"))}
                        {n("slack", t("settings.slackNotifs"), t("settings.slackNotifsDesc"))}
                        {n("browser", t("settings.browserNotifs"), t("settings.browserNotifsDesc"))}
                      </div>
                    </Section>
                    <Section title={t("settings.tasks")}>
                      <div className="divide-y divide-neutral-800/40">
                        {n("taskAssigned", t("settings.taskAssigned"))}
                        {n("taskDue", t("settings.taskDue"))}
                        {n("taskStatus", t("settings.taskStatus"), t("settings.taskStatusDesc"))}
                        {n("comments", t("settings.commentsOnTasks"))}
                        {n("mentions", t("settings.mentionsInComments"))}
                      </div>
                    </Section>
                    <Section title={t("settings.projects")}>
                      <div className="divide-y divide-neutral-800/40">
                        {n("projectStatus", t("settings.projectStatusChanges"))}
                        {n("newMember", t("settings.newMemberProject"))}
                        {n("milestone", t("settings.milestoneApproaching"), t("settings.milestoneApproachingDesc"))}
                      </div>
                    </Section>
                    <Section title={t("settings.teamWorkspace")}>
                      <div className="divide-y divide-neutral-800/40">
                        {n("teamMember", t("settings.newTeamMemberJoined"), t("settings.newTeamMemberJoinedDesc"))}
                        {n("announcements", t("settings.teamAnnouncements"))}
                      </div>
                    </Section>
                    <Section title={t("settings.digestUpdates")}>
                      <div className="divide-y divide-neutral-800/40">
                        {n("digest", t("settings.weeklyDigest"), t("settings.weeklyDigestDesc"))}
                        {n("productUpdates", t("settings.productUpdates"))}
                        {n("security", t("settings.securityAlerts"))}
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
                    {logoSrc ? (
                      <img src={logoSrc} alt="workspace logo" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-indigo-900/60 flex items-center justify-center text-indigo-300 text-[20px] font-['Lexend:SemiBold',_sans-serif] shrink-0">{workspaceData.name?.[0]?.toUpperCase() ?? "?"}</div>
                    )}
                    <div>
                      <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="border border-neutral-800 hover:bg-neutral-800 disabled:opacity-50 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors">{uploadingLogo ? t("settings.uploading") : t("settings.uploadLogo")}</button>
                      <p className="text-neutral-600 text-[11px] mt-1">{t("settings.pngOrSvg")}</p>
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                    </div>
                  </div>
                  <InputField label={t("settings.workspaceName")} value={workspaceData.name ?? ""} onChange={(v) => setWorkspaceData((p: any) => ({ ...p, name: v }))} />
                  <InputField label={t("settings.workspaceUrl")} value={workspaceData.url ?? ""} onChange={(v) => setWorkspaceData((p: any) => ({ ...p, url: v }))} hint={t("settings.workspaceUrlHint")} />
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.industry")}</label>
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
              <Section title={t("settings.workspacePreferences")}>
                <div className="divide-y divide-neutral-800/40">
                  <ToggleRow label={t("settings.showCompletedTasks")} description={t("settings.showCompletedTasksDesc")} checked={workspacePrefs.showCompleted} onChange={() => setWorkspacePrefs((p) => ({ ...p, showCompleted: !p.showCompleted }))} />
                  <ToggleRow label={t("settings.compactView")} description={t("settings.compactViewDesc")} checked={workspacePrefs.compactView} onChange={() => setWorkspacePrefs((p) => ({ ...p, compactView: !p.compactView }))} />
                  <ToggleRow label={t("settings.publicProjectLinks")} description={t("settings.publicProjectLinksDesc")} checked={workspacePrefs.publicLinks} onChange={() => setWorkspacePrefs((p) => ({ ...p, publicLinks: !p.publicLinks }))} />
                  <ToggleRow label={t("settings.require2FA")} description={t("settings.require2FADesc")} checked={workspacePrefs.require2FA} onChange={() => setWorkspacePrefs((p) => ({ ...p, require2FA: !p.require2FA }))} />
                  <ToggleRow label={t("settings.guestAccess")} description={t("settings.guestAccessDesc")} checked={workspacePrefs.guestAccess} onChange={() => setWorkspacePrefs((p) => ({ ...p, guestAccess: !p.guestAccess }))} />
                </div>
              </Section>
              <SaveRow onSave={async () => {
                try {
                  await api.saveSettings("workspace", { name: "", url: "", industry: "", teamSize: "", region: "", ...workspaceData });
                  await saveWorkspacePrefs();
                }
                catch (e) { console.error("Failed to save workspace:", e); toast.error("Failed to save"); }
              }} />
            </>
          )}

          {/* ── Appearance ── */}
          {activeNav === "Appearance" && (
            <>
              <Section title={t("settings.theme")} description={t("settings.themeDesc")}>
                <div className="grid grid-cols-3 gap-3">
                  {(["dark", "light", "system"] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setTheme(opt)}
                      className={`relative p-3 rounded-xl border transition-all text-left ${theme === opt ? "border-indigo-500 bg-indigo-950/20" : "border-neutral-800 hover:border-neutral-700"}`}
                    >
                      <div className={`h-14 rounded-lg mb-2.5 overflow-hidden ${opt === "dark" ? "bg-neutral-900" : opt === "light" ? "bg-neutral-200" : "bg-gradient-to-br from-neutral-900 to-neutral-200"}`}>
                        <div className={`h-3 w-full ${opt === "dark" ? "bg-neutral-800" : opt === "light" ? "bg-neutral-300" : "bg-gradient-to-r from-neutral-800 to-neutral-300"}`} />
                        <div className="p-1.5 space-y-1">
                          {[1, 2].map((i) => (
                            <div key={i} className={`h-1.5 rounded-full ${opt === "dark" ? "bg-neutral-700" : opt === "light" ? "bg-neutral-400" : "bg-neutral-500"}`} style={{ width: i === 1 ? "80%" : "60%" }} />
                          ))}
                        </div>
                      </div>
                      <div className="text-neutral-200 text-[12px] capitalize">{opt}</div>
                      {theme === opt && <Check size={12} className="absolute top-2.5 right-2.5 text-indigo-400" />}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title={t("settings.accentColor")} description={t("settings.accentColorDesc")}>
                <div className="flex items-center gap-3">
                  {accentColors.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setAccentColor(c.value)}
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
                    <button key={s} onClick={() => setFontSize(s)}
                      className={`flex-1 py-2 rounded-lg text-[12px] capitalize border transition-colors ${fontSize === s ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title={t("settings.density")} description={t("settings.densityDesc")}>
                <div className="flex items-center gap-2">
                  {(["compact", "comfortable", "spacious"] as const).map((d) => (
                    <button key={d} onClick={() => setDensity(d)}
                      className={`flex-1 py-2 rounded-lg text-[12px] capitalize border transition-colors ${density === d ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title={t("settings.sidebarPosition")}>
                <div className="flex items-center gap-2">
                  {(["left", "right"] as const).map((p) => (
                    <button key={p} onClick={() => setSidebarPosition(p)}
                      className={`flex-1 py-2 rounded-lg text-[12px] capitalize border transition-colors ${sidebarPosition === p ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {p === "left" ? t("settings.left") : t("settings.right")}
                    </button>
                  ))}
                </div>
              </Section>
              <SaveRow onSave={saveAppearance} />
            </>
          )}

          {/* ── Language ── */}
          {activeNav === "Language" && (
            <Section title={t("settings.language")} description={t("settings.chooseLanguage")}>
              <div className="flex items-center gap-4">
                <LangToggle lang={lang} onChange={setLang} />
              </div>
            </Section>
          )}

          {/* ── Timezone ── */}
          {activeNav === "Timezone" && (
            <>
              <Section title={t("settings.timeZone")} description={t("settings.timeZoneDesc")}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.timezoneLabel")}</label>
                    <select
                      value={selectedTimezone ?? ""}
                      onChange={(e) => setSelectedTimezone(e.target.value || null)}
                      className="w-full bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Select timezone…</option>
                      {Array.from(new Set([
                        selectedTimezone,
                        "Asia/Jakarta",
                        "Asia/Singapore",
                        "Asia/Tokyo",
                        "America/New_York",
                        "America/Los_Angeles",
                        "Europe/London",
                        "Europe/Paris",
                        "Australia/Sydney",
                      ].filter(Boolean) as string[])).map((tz) => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-neutral-200 text-[13px]">{t("settings.autoDetectTimezone")}</div>
                      <div className="text-neutral-600 text-[12px] mt-0.5">{t("settings.autoDetectTimezoneDesc")}</div>
                    </div>
                    <Toggle checked={autoDetectTz} onChange={() => setAutoDetectTz((v) => !v)} />
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
                  {[{ val: "12h", label: "12-hour (3:00 PM)" }, { val: "24h", label: "24-hour (15:00)" }].map((f) => (
                    <button key={f.val} onClick={() => setTimeFormat(f.val)}
                      className={`flex-1 py-2.5 rounded-lg text-[12px] border transition-colors ${timeFormat === f.val ? "border-indigo-500 bg-indigo-950/20 text-neutral-50" : "border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title={t("settings.firstDayOfWeek")}>
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
              <Section title={t("settings.workspaceDefaults")} description={t("settings.workspaceDefaultsDesc")}>
                <div className="mb-4 px-3 py-2.5 bg-neutral-800/40 rounded-lg text-neutral-500 text-[12px]">
                  {t("settings.changesApplyToNewMembers")}
                </div>
                <div className="divide-y divide-neutral-800/40">
                  <ToggleRow label={t("settings.taskAssigned")} checked={defaultNotifs.taskAssigned} onChange={() => setDefaultNotifs((p) => ({ ...p, taskAssigned: !p.taskAssigned }))} />
                  <ToggleRow label={t("settings.taskDue")} checked={defaultNotifs.taskDue} onChange={() => setDefaultNotifs((p) => ({ ...p, taskDue: !p.taskDue }))} />
                  <ToggleRow label={t("settings.commentsAndMentions")} checked={defaultNotifs.comments} onChange={() => setDefaultNotifs((p) => ({ ...p, comments: !p.comments }))} />
                  <ToggleRow label={t("settings.projectStatusChangesDefault")} checked={defaultNotifs.projectStatus} onChange={() => setDefaultNotifs((p) => ({ ...p, projectStatus: !p.projectStatus }))} />
                  <ToggleRow label={t("settings.newTeamMemberDefault")} checked={defaultNotifs.newMember} onChange={() => setDefaultNotifs((p) => ({ ...p, newMember: !p.newMember }))} />
                  <ToggleRow label={t("settings.weeklyDigestEmail")} checked={defaultNotifs.digest} onChange={() => setDefaultNotifs((p) => ({ ...p, digest: !p.digest }))} />
                  <ToggleRow label={t("settings.productUpdatesDefault")} checked={defaultNotifs.productUpdates} onChange={() => setDefaultNotifs((p) => ({ ...p, productUpdates: !p.productUpdates }))} />
                  <ToggleRow label={t("settings.securityAlertsDefault")} checked={defaultNotifs.security} onChange={() => setDefaultNotifs((p) => ({ ...p, security: !p.security }))} />
                </div>
              </Section>
              <div className="flex items-center justify-between">
                <button onClick={async () => {
                  const sysDefaults = { taskAssigned: true, taskDue: true, comments: true, projectStatus: false, newMember: false, digest: true, productUpdates: false, security: true };
                  setDefaultNotifs(sysDefaults);
                  try { await api.saveSettings("default-notifications", sysDefaults); toast.success("Defaults reset to system values"); }
                  catch (e) { console.error("Failed to reset defaults:", e); toast.error("Failed to save"); }
                }} className="text-neutral-500 hover:text-neutral-300 text-[13px] flex items-center gap-1.5 transition-colors">
                  <RefreshCw size={13} /> {t("settings.resetToSystemDefaults")}
                </button>
                <button onClick={async () => {
                  try {
                    await api.saveSettings("default-notifications", defaultNotifs);
                    toast.success("Default notification settings saved");
                  } catch (e) { console.error("Failed to save defaults:", e); toast.error("Failed to save"); }
                }} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-5 py-2 rounded-lg transition-colors">
                  {t("settings.saveDefaults")}
                </button>
              </div>
            </>
          )}

          {/* ── Members ── */}
          {activeNav === "Members" && (
            <>
              <Section title={t("settings.membersPermissions")} description={`${members.length} ${t("settings.membersPermissionsDesc")}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-neutral-500 text-[12px]">{t("settings.manageRoles")}</div>
                  <button onClick={() => setShowInvite(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                    <Plus size={13} /> {t("settings.inviteMember")}
                  </button>
                </div>
                <div className="bg-[#141414] border border-neutral-800/60 rounded-xl overflow-hidden">
                  <div className="hidden md:grid grid-cols-[1fr_100px_80px_32px] gap-4 px-4 py-2.5 border-b border-neutral-800/40">
                    {[t("settings.member"), t("settings.role"), t("settings.status"), ""].map((h) => (
                      <div key={h} className="text-neutral-600 text-[11px] uppercase tracking-wider">{h}</div>
                    ))}
                  </div>
                  <div className="divide-y divide-neutral-800/40">
                    {members.map((m) => {
                      const isSelf = m.user_id === user?.id;
                      const isRowOwner = m.role === "owner";
                      return (
                      <div key={m.user_id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_100px_80px_32px] gap-3 md:gap-4 px-4 py-3 items-center">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-indigo-900/60 flex items-center justify-center text-indigo-300 text-[11px] font-['Lexend:SemiBold',_sans-serif] shrink-0">{(m.name || m.email).slice(0, 2).toUpperCase()}</div>
                          <div className="min-w-0">
                            <div className="text-neutral-200 text-[13px] truncate">{m.name}{isSelf ? " (you)" : ""}</div>
                            <div className="text-neutral-600 text-[11px] truncate">{m.email}</div>
                          </div>
                        </div>
                        {isOwner && !isRowOwner && !isSelf ? (
                        <select
                          value={memberRoles[m.user_id] ?? m.role}
                          onChange={async (e) => {
                            const newRole = e.target.value as api.WorkspaceRole;
                            const prevRole = m.role;
                            setMemberRoles((prev) => ({ ...prev, [m.user_id]: newRole }));
                            setMembers((prev) => prev.map((x) => x.user_id === m.user_id ? { ...x, role: newRole } : x));
                            try {
                              if (!activeWorkspace) throw new Error("No active workspace");
                              await api.updateWorkspaceMemberRole(activeWorkspace.id, m.user_id, newRole);
                              toast.success(`${m.name} role updated to ${newRole}`);
                            } catch (err) {
                              setMemberRoles((prev) => ({ ...prev, [m.user_id]: prevRole }));
                              setMembers((prev) => prev.map((x) => x.user_id === m.user_id ? { ...x, role: prevRole } : x));
                              toast.error(err instanceof Error ? err.message : "Failed to update role");
                            }
                          }}
                          className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-[12px] px-2 py-1.5 rounded-lg outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="owner">{t("settings.owner")}</option>
                          <option value="member">{t("settings.member")}</option>
                        </select>
                        ) : (
                        <span className="text-neutral-500 text-[12px] capitalize">
                          {m.role === "owner" ? t("settings.owner") : m.role === "member" ? t("settings.member") : m.role}
                        </span>
                        )}
                        <div className="hidden md:flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                          <span className="text-neutral-500 text-[12px] capitalize">{t("settings.active")}</span>
                        </div>
                        <button
                          disabled={!isOwner || isRowOwner || isSelf}
                          onClick={async () => {
                            if (!activeWorkspace) return;
                            const snapshot = members;
                            setMembers((prev) => prev.filter((x) => x.user_id !== m.user_id));
                            try {
                              await api.removeWorkspaceMember(activeWorkspace.id, m.user_id);
                              toast.success(`${m.name} removed`);
                            } catch (err) {
                              setMembers(snapshot);
                              toast.error(err instanceof Error ? err.message : "Failed to remove member");
                            }
                          }}
                          className="text-neutral-600 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </Section>
              <Section title={t("settings.pendingInvites")} description={t("settings.pendingInvitesDesc")}>
                <div className="space-y-2">
                  {invitesList.map((inv) => (
                    <div key={inv.token ?? inv.email} className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl gap-3">
                      <div>
                        <div className="text-neutral-300 text-[13px]">{inv.email}</div>
                        <div className="text-neutral-600 text-[11px] mt-0.5">{inv.role} · {t("settings.expires")} {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "—"}</div>
                      </div>
                      {isOwner && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={async () => {
                          if (!activeWorkspace || !inv.token) return;
                          try {
                            await api.revokeWorkspaceInvite(activeWorkspace.id, inv.token);
                            setInvitesList((prev) => prev.filter((p) => p.token !== inv.token));
                            toast.success(`Invite to ${inv.email} cancelled`);
                          } catch (err) { toast.error(err instanceof Error ? err.message : "Failed to revoke invite"); }
                        }} className="text-red-400 hover:text-red-300 text-[12px] px-2.5 py-1 rounded-lg border border-red-900/40 hover:bg-red-950/30 transition-colors">{t("common.cancel")}</button>
                      </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}

          {/* ── Billing ── */}
          {activeNav === "Billing" && (
            <>
              <Section title={t("settings.currentPlan")} description={`${t("settings.currentPlanDesc")} ${billing?.plan ?? "—"}.`}>
                <div className="p-4 bg-indigo-950/20 border border-indigo-800/40 rounded-xl mb-3">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-neutral-50 text-[16px] font-['Lexend:SemiBold',_sans-serif] mb-0.5">{billing?.plan ?? "—"} Plan</div>
                      <div className="text-neutral-400 text-[13px]">${billing?.price ?? 0} per seat / month · {billing?.seats ?? 0} seats</div>
                    </div>
                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-indigo-900/60 text-indigo-300 shrink-0">{t("settings.active")}</span>
                  </div>
                  <div className="text-neutral-500 text-[12px] mb-4">Next billing: <span className="text-neutral-300">{billing?.nextBilling ?? "—"}</span> · <span className="text-neutral-300">{billing ? `$${(billing.price * billing.seats).toFixed(2)}` : "—"}</span></div>
                  <button onClick={() => routerNavigate("/pricing")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors">
                    {t("settings.upgradeToEnterprise")}
                  </button>
                </div>
              </Section>
              <Section title={t("settings.usage")} description={t("settings.usageDesc")}>
                {(() => {
                  const usedGB = quota ? (quota.unlimited ? "∞" : (quota.used / (1024 * 1024 * 1024)).toFixed(2)) : "—";
                  const limitGB = quota ? (quota.unlimited ? "∞" : (quota.limit / (1024 * 1024 * 1024)).toFixed(0)) : "—";
                  const pct = quota && !quota.unlimited && quota.limit > 0 ? Math.round((quota.used / quota.limit) * 100) : 0;
                  return (
                    <div className="space-y-4">
                      {[
                        { label: t("settings.membersUsage"), used: billing?.usage?.members ?? 0, limit: billing?.usage?.memberLimit ?? 0, color: "#818cf8" },
                        { label: t("settings.activeProjectsUsage"), used: billing?.usage?.projects ?? 0, limit: billing?.usage?.projectLimit ?? 0, color: "#34d399" },
                        { label: t("settings.storage"), used: usedGB, limit: limitGB, unit: " GB", color: "#f59e0b", pct },
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
              <Section title={t("settings.paymentMethod")}>
                <div className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400">
                      <CreditCard size={16} />
                    </div>
                    <div>
                      <div className="text-neutral-200 text-[13px]">{billing?.payment?.brand ?? "Card"} ending in {billing?.payment?.last4 ?? "····"}</div>
                      <div className="text-neutral-600 text-[11px]">{t("settings.expires")} {billing?.payment?.expiry ?? "—"}</div>
                    </div>
                  </div>
                  <button onClick={() => routerNavigate("/app/billing")} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 text-[12px] px-3 py-1.5 rounded-lg transition-colors">{t("settings.update")}</button>
                </div>
              </Section>
              <Section title={t("settings.billingHistory")}>
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
                        <button onClick={() => handleInvoiceDownload(inv)} className="text-neutral-600 hover:text-neutral-400 transition-colors" title="Download invoice">
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
                          <button onClick={() => toggleIntegration(integration.name)} className="text-neutral-500 hover:text-neutral-300 text-[12px] px-2.5 py-1 rounded-lg border border-neutral-800 hover:bg-neutral-800 transition-colors">{t("settings.disconnect")}</button>
                        ) : (
                          <button onClick={() => toggleIntegration(integration.name)} className="text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 transition-colors">{t("settings.connect")}</button>
                        )}
                      </div>
                    </div>
                    {integration.connected && (
                      <div className="mt-2.5 pt-2.5 border-t border-neutral-800/40 flex items-center gap-4 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span className="text-emerald-400">{t("settings.connectedSynced")} {integration.lastSync}</span>
                        </div>
                        <span className="text-neutral-700">·</span>
                        <span className="text-neutral-600">{t("settings.scopes")}: {integration.scopes}</span>
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
                    {[t("settings.name"), t("settings.created"), t("settings.lastUsed"), ""].map((h) => (
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
                      <button onClick={() => revokeKey(k.id)} className="text-red-400 hover:text-red-300 text-[12px] px-2.5 py-1 rounded-lg border border-red-900/40 hover:bg-red-950/30 transition-colors whitespace-nowrap">{t("settings.revokeKey")}</button>
                    </div>
                  ))}
                  {apiKeysList.length === 0 && (
                    <div className="px-4 py-6 text-center text-neutral-600 text-[13px]">{t("settings.noActiveApiKeys")}</div>
                  )}
                </div>

                {!showNewKey ? (
                  <div className="space-y-2">
                    <button disabled className="flex cursor-not-allowed items-center gap-2 border border-neutral-800 text-neutral-600 text-[13px] px-4 py-2 rounded-lg opacity-50">
                      <Plus size={14} /> {t("settings.generateNewKey")}
                    </button>
                    <p className="text-neutral-500 text-[12px]">Server-managed API keys — coming soon. Existing entries below are read-only.</p>
                  </div>
                ) : generatedKey ? (
                  <div className="p-4 bg-emerald-950/20 border border-emerald-800/40 rounded-xl space-y-3">
                    <div className="text-emerald-300 text-[13px] font-['Lexend:SemiBold',_sans-serif]">{t("settings.keyGenerated")}</div>
                    <p className="text-neutral-500 text-[12px]">{t("settings.keyGeneratedDesc")}</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2 text-emerald-300 text-[12px] font-mono truncate">{generatedKey}</code>
                      <button onClick={copyKey} className="shrink-0 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 px-2.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 text-[12px]">
                        {keyCopied ? <><Check size={13} className="text-emerald-400" /> {t("settings.copied")}</> : <><Copy size={13} /> {t("settings.copy")}</>}
                      </button>
                    </div>
                    <button onClick={() => { setShowNewKey(false); setGeneratedKey(null); setNewKeyName(""); }} className="text-neutral-500 hover:text-neutral-300 text-[12px] transition-colors">{t("common.done")}</button>
                  </div>
                ) : (
                  <div className="p-4 bg-neutral-800/30 border border-neutral-800 rounded-xl space-y-3">
                    <div>
                      <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.keyName")}</label>
                      <input
                        type="text"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="e.g. Production, CI/CD pipeline"
                        className="w-full bg-[#0f0f0f] border border-neutral-800 hover:border-neutral-700 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-600 font-['Lexend:Regular',_sans-serif]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={generateApiKey} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors">{t("settings.generate")}</button>
                      <button onClick={() => { setShowNewKey(false); setNewKeyName(""); }} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 text-[13px] px-4 py-2 rounded-lg transition-colors">{t("common.cancel")}</button>
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
                          <div className="text-neutral-600 text-[11px] mt-1">{t("settings.events")}: {w.events}</div>
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
                    <Plus size={14} /> {t("settings.addWebhook")}
                  </button>
                ) : (
                  <div className="p-4 bg-neutral-800/30 border border-neutral-800 rounded-xl space-y-3">
                    <div>
                      <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.endpointUrl")}</label>
                      <input
                        type="url"
                        value={newWebhookUrl}
                        onChange={(e) => setNewWebhookUrl(e.target.value)}
                        placeholder="https://example.com/webhook"
                        className="w-full bg-[#0f0f0f] border border-neutral-800 hover:border-neutral-700 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-600 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.eventsCommaSeparated")}</label>
                      <input
                        type="text"
                        value={newWebhookEvents}
                        onChange={(e) => setNewWebhookEvents(e.target.value)}
                        placeholder="task.created, task.completed"
                        className="w-full bg-[#0f0f0f] border border-neutral-800 hover:border-neutral-700 focus:border-indigo-600/60 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-600 font-['Lexend:Regular',_sans-serif]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addWebhook} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors">{t("settings.addWebhook")}</button>
                      <button onClick={() => { setShowWebhookForm(false); setNewWebhookUrl(""); setNewWebhookEvents(""); }} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 text-[13px] px-4 py-2 rounded-lg transition-colors">{t("common.cancel")}</button>
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
                {AUDIT_CATEGORIES.map((cat) => {
                  const label = cat === "All" ? t("settings.all")
                    : cat === "Security" ? t("settings.security")
                    : cat === "Members" ? t("sidebar.members")
                    : cat === "Integrations" ? t("settings.integrations")
                    : cat === "API" ? t("settings.api")
                    : t("settings.settings");
                  return (
                  <button key={cat} onClick={() => { setAuditFilter(cat); setAuditVisible(20); }}
                    className={`px-3 py-1.5 rounded-lg text-[12px] whitespace-nowrap transition-colors ${auditFilter === cat ? "bg-neutral-800 text-neutral-50" : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/40"}`}>
                    {label}
                  </button>
                  );
                })}
              </div>
              <div className="bg-[#141414] border border-neutral-800/60 rounded-xl overflow-hidden">
                <div className="divide-y divide-neutral-800/40">
                  {visibleLogs.map((log, i) => (
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
              {filteredLogs.length > auditVisible ? (
              <button onClick={() => setAuditVisible((v) => v + 20)} className="w-full mt-3 py-2 text-neutral-600 hover:text-neutral-400 text-[12px] transition-colors">
                {t("settings.loadMore")}
              </button>
              ) : null}
            </Section>
          )}

          {/* ── Data & Export ── */}
          {activeNav === "Data & Export" && (
            <>
              <Section title={t("settings.exportData")} description={t("settings.exportDataDesc")}>
                <div className="space-y-3">
                  {[
                    { key: "tasks", label: t("settings.allTasks"), description: t("settings.allTasksDesc") },
                    { key: "projects", label: t("settings.allProjects"), description: t("settings.allProjectsDesc") },
                    { key: "team", label: t("settings.teamData"), description: t("settings.teamDataDesc") },
                    { key: "files", label: t("settings.filesAttachments"), description: t("settings.filesAttachmentsDesc") },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl gap-3 flex-wrap">
                      <div>
                        <div className="text-neutral-200 text-[13px]">{item.label}</div>
                        <div className="text-neutral-600 text-[11px] mt-0.5">{item.description}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={exportFormats[item.key] ?? "CSV"}
                          onChange={(e) => setExportFormats((prev) => ({ ...prev, [item.key]: e.target.value }))}
                          className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-[12px] px-2 py-1 rounded-lg outline-none cursor-pointer"
                        >
                          <option>CSV</option>
                          <option>JSON</option>
                        </select>
                        <button onClick={() => handleExport(item.key, item.label)} className="flex items-center gap-1.5 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors">
                          <Download size={13} /> {t("settings.download")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title={t("settings.dataRetention")} description={t("settings.dataRetentionDesc")}>
                <div className="divide-y divide-neutral-800/40">
                  <ToggleRow label={t("settings.autoArchiveCompletedTasks")} description={t("settings.autoArchiveCompletedTasksDesc")} checked={retention.autoArchive} onChange={() => setRetention((p) => ({ ...p, autoArchive: !p.autoArchive }))} />
                  <ToggleRow label={t("settings.autoDeleteArchivedFiles")} description={t("settings.autoDeleteArchivedFilesDesc")} checked={retention.autoDelete} onChange={() => setRetention((p) => ({ ...p, autoDelete: !p.autoDelete }))} />
                  <ToggleRow label={t("settings.retainAuditLogs")} description={t("settings.retainAuditLogsDesc")} checked={retention.retainAudit} onChange={() => setRetention((p) => ({ ...p, retainAudit: !p.retainAudit }))} />
                </div>
              </Section>
              <SaveRow onSave={saveRetention} label={t("settings.saveChanges")} />
              <Section title={t("settings.privacyGdpr")}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl gap-3">
                    <div>
                      <div className="text-neutral-200 text-[13px]">{t("settings.downloadPersonalData")}</div>
                      <div className="text-neutral-600 text-[11px] mt-0.5">{t("settings.downloadPersonalDataDesc")}</div>
                    </div>
                    <button onClick={() => handleExport("tasks")} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors shrink-0">{t("settings.requestDownload")}</button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-[#141414] border border-neutral-800/60 rounded-xl gap-3">
                    <div>
                      <div className="text-neutral-200 text-[13px]">{t("settings.requestDataDeletion")}</div>
                      <div className="text-neutral-600 text-[11px] mt-0.5">{t("settings.requestDataDeletionDesc")}</div>
                    </div>
                    <button onClick={() => setActiveNav("Danger Zone")} className="border border-red-900/40 hover:bg-red-950/30 text-red-400 hover:text-red-300 text-[12px] px-3 py-1.5 rounded-lg transition-colors shrink-0">{t("settings.requestDeletion")}</button>
                  </div>
                </div>
              </Section>
            </>
          )}

          {/* ── Danger Zone ── */}
          {activeNav === "Danger Zone" && (
            <OwnerOnly fallback={<p className="text-neutral-500 text-[13px]">Only workspace owners can access the Danger Zone.</p>}>
            <div className="space-y-4">
              <div className="pb-4 border-b border-neutral-800/40">
                <h2 className="text-neutral-50 text-[14px] lg:text-[15px] font-['Lexend:SemiBold',_sans-serif] mb-1">{t("settings.dangerZone")}</h2>
                <p className="text-neutral-500 text-[12px]">{t("settings.dangerZoneDesc")}</p>
              </div>

              <div className="p-4 border border-neutral-800/60 rounded-xl space-y-4">
                <div>
                  <div className="text-neutral-200 text-[14px] font-['Lexend:SemiBold',_sans-serif] mb-1">{t("settings.transferOwnership")}</div>
                  <div className="text-neutral-500 text-[12px]">{t("settings.transferOwnershipDesc")}</div>
                </div>
                <div>
                  <label className="block text-neutral-300 text-[13px] mb-1.5">{t("settings.newOwner")}</label>
                  <select
                    value={transferTarget}
                    onChange={(e) => { setTransferTarget(e.target.value); setConfirmingTransfer(false); }}
                    className="w-full bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none appearance-none cursor-pointer"
                  >
                    <option value="">{transferCandidates.length === 0 ? t("settings.noAdminsFound") : "Select a member…"}</option>
                    {transferCandidates.map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.name} ({m.email})</option>
                    ))}
                  </select>
                </div>
                {!confirmingTransfer ? (
                <button onClick={() => transferTarget && setConfirmingTransfer(true)} disabled={transferring || !transferTarget} className="border border-amber-800/60 hover:bg-amber-950/30 disabled:opacity-40 disabled:cursor-not-allowed text-amber-400 hover:text-amber-300 text-[13px] px-4 py-2 rounded-lg transition-colors">
                  {t("settings.transfer")}
                </button>
                ) : (
                <div className="space-y-3">
                  <p className="text-amber-300/90 text-[12px]">Transfer ownership to {transferCandidates.find((m) => m.user_id === transferTarget)?.name ?? "this member"}? You will be demoted to member.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmingTransfer(false)} disabled={transferring} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 text-[13px] px-4 py-2 rounded-lg transition-colors">{t("common.cancel")}</button>
                    <button onClick={handleTransferOwnership} disabled={transferring} className="border border-amber-800/60 hover:bg-amber-950/30 disabled:opacity-40 disabled:cursor-not-allowed text-amber-400 hover:text-amber-300 text-[13px] px-4 py-2 rounded-lg transition-colors">
                      {transferring ? t("settings.transferring") : t("settings.transfer")}
                    </button>
                  </div>
                </div>
                )}
              </div>

              <div className="p-4 border border-red-900/30 rounded-xl space-y-4">
                <div>
                  <div className="text-neutral-200 text-[14px] font-['Lexend:SemiBold',_sans-serif] mb-1">{t("settings.resetWorkspaceData")}</div>
                  <div className="text-neutral-500 text-[12px]">{t("settings.resetWorkspaceDataDesc")}</div>
                </div>
                <div>
                  <label className="block text-neutral-500 text-[12px] mb-1.5">{t("settings.typeResetToConfirm")}</label>
                  <input
                    type="text"
                    value={dangerReset}
                    onChange={(e) => setDangerReset(e.target.value)}
                    placeholder={t("settings.reset")}
                    className="w-full bg-[#0f0f0f] border border-neutral-800 focus:border-red-600/40 rounded-lg px-3 py-2.5 text-neutral-200 text-[13px] outline-none transition-colors placeholder:text-neutral-700 font-mono"
                  />
                </div>
                <button
                  disabled={dangerReset !== "RESET"}
                  onClick={async () => {
                    // Typed confirm + fresh member fetch before the destructive call.
                    const typed = window.prompt('Type RESET to confirm wiping all workspace data:');
                    if (typed !== "RESET") {
                      if (typed !== null) toast.error('Type RESET exactly to confirm');
                      return;
                    }
                    try {
                      if (activeWorkspace) {
                        await api.getWorkspaceMembers(activeWorkspace.id);
                      }
                      await api.resetWorkspaceData();
                      toast.success("Workspace data has been reset. Refresh to see changes.");
                      setDangerReset("");
                    } catch (e) { console.error("Failed to reset workspace:", e); toast.error("Failed to reset workspace data"); }
                  }}
                  className="border border-red-800/60 hover:bg-red-950/30 text-red-400 hover:text-red-300 text-[13px] px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <AlertTriangle size={14} /> {t("settings.resetWorkspaceDataBtn")}
                </button>
              </div>

              <div className="p-4 border border-red-900/30 rounded-xl space-y-4">
                <div>
                  <div className="text-neutral-200 text-[14px] font-['Lexend:SemiBold',_sans-serif] mb-1">{t("settings.deleteAccountDanger")}</div>
                  <div className="text-neutral-500 text-[12px]">{t("settings.deleteAccountDangerDesc")}</div>
                </div>
                <div>
                  <label className="block text-neutral-500 text-[12px] mb-1.5">{t("settings.typeEmailToConfirm")} <span className="text-neutral-300 font-mono">{profileData.email ?? "your email"}</span></label>
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
                  onClick={async () => {
                    // Typed email confirm + fresh profile fetch before anything destructive.
                    const typed = window.prompt(`Type your email (${profileData.email}) to confirm account deletion:`);
                    if (typed !== profileData.email) {
                      if (typed !== null) toast.error("Email does not match");
                      return;
                    }
                    try {
                      const fresh = await api.getSettings("profile").catch(() => null);
                      if (fresh && (fresh as { email?: string }).email && (fresh as { email?: string }).email !== profileData.email) {
                        toast.error("Profile changed — refresh before deleting");
                        return;
                      }
                    } catch { /* fall through to the disabled demo path */ }
                    toast.error("Account deletion is disabled in this demo");
                  }}
                  className="bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 size={14} /> {t("settings.deleteMyAccount")}
                </button>
              </div>
            </div>
            </OwnerOnly>
          )}

        </div>
        )}
      </div>

      <InviteMemberModal open={showInvite} onClose={() => setShowInvite(false)} onInvite={async (_teamName, member) => {
        if (!activeWorkspace) throw new Error("No active workspace");
        // Canonical flow: real workspace-members API, same as WorkspaceMembersModal.
        const created = await api.createWorkspaceInvite(activeWorkspace.id, {
          email: member.email,
          role: "member",
        });
        setInvitesList((prev) => [created, ...prev]);
        toast.success(`Invitation sent to ${member.email}`);
      }} />
    </div>
  );
}
