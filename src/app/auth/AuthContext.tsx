import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "../utils/supabase";
import { useLang } from "../i18n";
import {
  getProfile,
  setApiAccessToken,
  verify2FALogin,
  sendEmailOTPLogin,
  verifyEmailOTPLogin,
  type Profile,
} from "../utils/api";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** KV-stored profile — source of truth for billing data. */
  profile: Profile | null;
  /** True while the signed-in user's profile is still being fetched. */
  profileLoading: boolean;
  /** Last profile fetch failure message, if any (null when no error). */
  profileError: string | null;
  /** Replace the cached profile (e.g. right after saveProfile). */
  setProfile: (profile: Profile | null) => void;
  /** Re-fetch the profile from the server. */
  refreshProfile: () => Promise<void>;
  /** True when the signed-in user has 2FA enabled and must verify a code. */
  needs2FA: boolean;
  /** Submit a TOTP/email-OTP code (or backup code) to complete login. */
  submit2FA: (code: string, backupCode?: string) => Promise<void>;
  /** Switch the pending second factor (TOTP ↔ email OTP). */
  twoFAMethod: "totp" | "email";
  setTwoFAMethod: (m: "totp" | "email") => void;
  /** Sign out and reset all 2FA/profile state so the next session starts clean. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  profile: null,
  profileLoading: false,
  profileError: null,
  setProfile: () => {},
  refreshProfile: async () => {},
  needs2FA: false,
  submit2FA: async () => {},
  twoFAMethod: "totp",
  setTwoFAMethod: () => {},
  signOut: async () => {},
});

/** True when the account demands a second factor before entering the app. */
const wants2FA = (s: Session | null) =>
  !!(s?.user?.user_metadata?.totp_enabled || s?.user?.user_metadata?.email_otp_enabled);

/** Seconds a user must wait before requesting another email OTP. */
const EMAIL_OTP_COOLDOWN_S = 30;

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [twoFAMethod, setTwoFAMethod] = useState<"totp" | "email">("totp");
  const [twoFACode, setTwoFACode] = useState("");
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [emailOTPSent, setEmailOTPSent] = useState(false);
  const [emailOTPSending, setEmailOTPSending] = useState(false);
  const [emailOTPCooldown, setEmailOTPCooldown] = useState(0);
  const [showBackupCode, setShowBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Countdown for the email-OTP resend cooldown.
  useEffect(() => {
    if (emailOTPCooldown <= 0) return;
    const timer = setInterval(() => {
      setEmailOTPCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [emailOTPCooldown]);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mountedRef.current) return;
        // Set the API token before re-rendering so child fetch effects use it
        setApiAccessToken(data.session?.access_token ?? null);
        setSession(data.session);
        setNeeds2FA(wants2FA(data.session));
        setLoading(false);
      })
      .catch((e) => {
        console.error("Failed to restore session:", e);
        if (mountedRef.current) setLoading(false);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setApiAccessToken(nextSession?.access_token ?? null);
      setSession(nextSession);
      setNeeds2FA(wants2FA(nextSession));
      setLoading(false);
      if (!nextSession) {
        // Signed out — reset 2FA + profile state so the next session starts clean.
        setTwoFACode("");
        setEmailOTPSent(false);
        setEmailOTPSending(false);
        setEmailOTPCooldown(0);
        setVerifying2FA(false);
        setProfile(null);
        setProfileReady(false);
        setProfileError(null);
      }
    });
    // Proactive refresh keeps the token valid in background tabs — the 2FA
    // verification call relies on it being fresh.
    const refreshInterval = setInterval(() => {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (s) {
          setApiAccessToken(s.access_token);
          setSession(s);
          setNeeds2FA(wants2FA(s));
        }
      }).catch(() => { /* retried next tick */ });
    }, 4 * 60 * 1000);
    return () => {
      subscription.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId || needs2FA) {
      // Clear any previous user's profile — including across the 2FA gate —
      // so a pending 2FA session never sees a stale profile.
      setProfile(null);
      setProfileReady(false);
      setProfileError(null);
      return;
    }
    let cancelled = false;
    setProfileReady(false);
    setProfileError(null);
    (async () => {
      try {
        const { data: { session: fresh } } = await supabase.auth.getSession();
        if (cancelled || !fresh) {
          if (!cancelled) setProfileReady(true);
          return;
        }
        const p = await getProfile(fresh.access_token);
        if (!cancelled) {
          setProfile(p);
          setProfileError(null);
        }
      } catch (e) {
        console.error("Failed to load profile:", e);
        if (!cancelled) {
          setProfile(null);
          setProfileError(e instanceof Error ? e.message : "Failed to load profile");
        }
      } finally {
        if (!cancelled) setProfileReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Refetch only when the signed-in user changes, not on token refresh
  }, [userId, needs2FA]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshProfile = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!mountedRef.current) return;
      if (!data.session) return;
      const p = await getProfile(data.session.access_token);
      if (!mountedRef.current) return;
      setProfile(p);
      setProfileError(null);
      setProfileReady(true);
    } catch (e) {
      if (!mountedRef.current) return;
      console.error("Failed to refresh profile:", e);
      setProfileError(e instanceof Error ? e.message : "Failed to load profile");
      setProfileReady(true);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      // Belt-and-suspenders: onAuthStateChange(null) also resets this state,
      // but clear synchronously so the 2FA wall exits immediately.
      setApiAccessToken(null);
      setSession(null);
      setNeeds2FA(false);
      setTwoFACode("");
      setEmailOTPSent(false);
      setEmailOTPSending(false);
      setEmailOTPCooldown(0);
      setVerifying2FA(false);
      setProfile(null);
      setProfileReady(false);
      setProfileError(null);
      setShowBackupCode(false);
      setBackupCode("");
    }
  }, []);

  const submit2FA = useCallback(async (code: string, backupCode?: string) => {
    if (!session?.access_token) throw new Error(t("auth.sessionExpired"));
    setVerifying2FA(true);
    try {
      if (backupCode) {
        const { ok } = await verify2FALogin(code || "", backupCode);
        if (!ok) throw new Error(t("auth.invalidCode"));
      } else if (twoFAMethod === "email") {
        const { ok } = await verifyEmailOTPLogin(code);
        if (!ok) throw new Error(t("auth.invalidCode"));
      } else {
        const { ok } = await verify2FALogin(code);
        if (!ok) throw new Error(t("auth.invalidAuthCode"));
      }
      // Refresh the session so the latest user_metadata is in place, then
      // release the 2FA gate.
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      setSession(data.session);
      setApiAccessToken(data.session?.access_token ?? null);
      setNeeds2FA(wants2FA(data.session));
      setTwoFACode("");
      setBackupCode("");
      setShowBackupCode(false);
      setEmailOTPSent(false);
    } finally {
      setVerifying2FA(false);
    }
  }, [session, twoFAMethod, t]);

  const handleSendEmailOTP = async () => {
    if (emailOTPSending || emailOTPCooldown > 0) return;
    setEmailOTPSending(true);
    try {
      await sendEmailOTPLogin();
      setEmailOTPSent(true);
      setEmailOTPCooldown(EMAIL_OTP_COOLDOWN_S);
      toast.success(t("auth.verificationCodeSent"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("auth.failedToSendCode"));
    } finally {
      setEmailOTPSending(false);
    }
  };

  if (needs2FA && session) {
    const meta = session.user?.user_metadata;
    const hasBothMethods = meta?.totp_enabled && meta?.email_otp_enabled;
    const isEmail = twoFAMethod === "email";
    const otpBusy = emailOTPSending || emailOTPCooldown > 0;

    return (
      <div className="dark flex min-h-screen w-screen items-center justify-center bg-[#0f0f0f] px-4" style={{ fontFamily: "Lexend, sans-serif" }}>
        <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-[#1a1a1a] p-6">
          <h1 className="mb-1 text-[16px] text-neutral-50">{t("auth.twoFactorTitle")}</h1>
          <p className="mb-4 text-[13px] text-neutral-500">
            {isEmail ? t("auth.twoFactorEmailDesc") : t("auth.twoFactorTotpDesc")}
          </p>
          <input
            type="text"
            maxLength={6}
            placeholder="000000"
            value={twoFACode}
            onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, ""))}
            className="mb-4 w-full rounded-lg border border-neutral-800 bg-[#0f0f0f] px-4 py-3 text-center text-[16px] tracking-[0.3em] text-neutral-200 outline-none transition-colors focus:border-indigo-600/60"
          />
          {isEmail && !emailOTPSent && (
            <button
              onClick={handleSendEmailOTP}
              disabled={otpBusy}
              className="mb-3 w-full rounded-lg border border-neutral-700 px-4 py-2.5 text-[13px] text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-50"
            >
              {emailOTPSending
                ? t("auth.verifying")
                : emailOTPCooldown > 0
                  ? `${t("auth.resendCode")} (${emailOTPCooldown}s)`
                  : t("auth.sendCode")}
            </button>
          )}
          {isEmail && emailOTPSent && (
            <button
              onClick={handleSendEmailOTP}
              disabled={otpBusy}
              className="mb-3 w-full text-[12px] text-indigo-400 transition-colors hover:text-indigo-300 disabled:opacity-50"
            >
              {emailOTPSending
                ? t("auth.verifying")
                : emailOTPCooldown > 0
                  ? `${t("auth.resendCode")} (${emailOTPCooldown}s)`
                  : t("auth.resendCode")}
            </button>
          )}
          <button
            onClick={() => submit2FA(twoFACode, showBackupCode ? backupCode : undefined).catch((e) => {
              console.error("2FA verification failed:", e);
              toast.error(e instanceof Error ? e.message : t("auth.invalidCode"));
            })}
            disabled={verifying2FA || (!showBackupCode && twoFACode.length !== 6) || (showBackupCode && !backupCode.trim())}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {verifying2FA ? t("auth.verifying") : t("settings.verify")}
          </button>
          <button
            onClick={() => {
              setShowBackupCode((v) => !v);
              setTwoFACode("");
              setBackupCode("");
            }}
            className="mt-3 w-full text-[12px] text-neutral-500 transition-colors hover:text-neutral-300"
          >
            {showBackupCode ? t("auth.useAuthenticatorInstead") : "Use backup code"}
          </button>
          {showBackupCode && (
            <input
              type="text"
              placeholder="Backup code"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value.trim())}
              className="mt-3 w-full rounded-lg border border-neutral-800 bg-[#0f0f0f] px-4 py-3 text-center text-[13px] tracking-[0.15em] text-neutral-200 outline-none transition-colors focus:border-indigo-600/60"
            />
          )}
          {hasBothMethods && (
            <button
              onClick={() => {
                setTwoFAMethod(isEmail ? "totp" : "email");
                setTwoFACode("");
                setEmailOTPSent(false);
              }}
              className="mt-3 w-full text-[12px] text-neutral-500 transition-colors hover:text-neutral-300"
            >
              {isEmail ? t("auth.useAuthenticatorInstead") : t("auth.useEmailCodeInstead")}
            </button>
          )}
          <button
            onClick={() => signOut().catch((e) => console.error("Sign out failed:", e))}
            className="mt-3 w-full text-[12px] text-neutral-500 transition-colors hover:text-neutral-300"
          >
            Sign out / use another account
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        profile,
        profileLoading: !!session && !profileReady,
        profileError,
        setProfile,
        refreshProfile,
        needs2FA,
        submit2FA,
        twoFAMethod,
        setTwoFAMethod,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
