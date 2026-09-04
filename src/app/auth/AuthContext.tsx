import { logger } from "../utils/logger";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { useLang } from "../LangContext";
import { supabase } from "../utils/supabase";
import { getProfile, setApiAccessToken, verify2FALogin, sendEmailOTPLogin, verifyEmailOTPLogin, type Profile } from "../utils/api";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** KV-stored profile (`profile:{userId}`) — source of truth for billing data. */
  profile: Profile | null;
  /** True while the signed-in user's profile is still being fetched. */
  profileLoading: boolean;
  /** Replace the cached profile (e.g. right after saveProfile). */
  setProfile: (profile: Profile | null) => void;
  /** Re-fetch the profile from the server. */
  refreshProfile: () => Promise<void>;
  /** True when the signed-in user has 2FA enabled and must verify a code. */
  needs2FA: boolean;
  /** Submit a 2FA code to complete login. */
  submit2FA: (code: string) => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  profile: null,
  profileLoading: false,
  setProfile: () => {},
  refreshProfile: async () => {},
  needs2FA: false,
  submit2FA: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [twoFAMethod, setTwoFAMethod] = useState<"totp" | "email">("totp");
  const [twoFACode, setTwoFACode] = useState("");
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [emailOTPSent, setEmailOTPSent] = useState(false);
  const [emailOTPExpiry, setEmailOTPExpiry] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        // Set the API token before re-rendering so child fetch effects use it
        setApiAccessToken(data.session?.access_token ?? null);
        setSession(data.session);
        const meta = data.session?.user?.user_metadata;
        const has2FA = !!(meta?.totp_enabled || meta?.email_otp_enabled);
        setNeeds2FA(has2FA);
        setTwoFAMethod(meta?.email_otp_enabled && !meta?.totp_enabled ? "email" : "totp");
      })
      .catch((e) => {
        // A failed initial session load (network down, Supabase outage) must
        // not hang the app on the FullScreenLoader forever — release the
        // loading gate so the user can reach the login screen and retry.
        logger.error("app", "Initial session load failed:", e);
        setApiAccessToken(null);
        setSession(null);
      })
      .finally(() => setLoading(false));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setApiAccessToken(nextSession?.access_token ?? null);
      setSession(nextSession);
      const meta = nextSession?.user?.user_metadata;
      const has2FA = !!(meta?.totp_enabled || meta?.email_otp_enabled);
      setNeeds2FA(has2FA);
      setTwoFAMethod(meta?.email_otp_enabled && !meta?.totp_enabled ? "email" : "totp");
      setLoading(false);
    });
    // Proactive session refresh: Supabase auto-refresh can be throttled by
    // browsers in background tabs. This interval ensures the token stays fresh
    // even when the tab is idle. The refresh is a no-op if the token is still
    // valid, so the 4-minute cadence is cheap.
    const refreshInterval = setInterval(() => {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (s) {
          setApiAccessToken(s.access_token);
          setSession(s);
        }
      }).catch(() => { /* network error — will retry next interval */ });
    }, 4 * 60 * 1000); // every 4 minutes

    return () => {
      subscription.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, []);

  const userId = session?.user?.id;
  const accessToken = session?.access_token;

  useEffect(() => {
    if (!userId || !accessToken) {
      setProfile(null);
      setProfileReady(false);
      return;
    }
    let cancelled = false;
    setProfileReady(false);
    getProfile(accessToken)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((e) => {
        logger.error("app", "Failed to load profile:", e);
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setProfileReady(true);
      });
    return () => {
      cancelled = true;
    };
    // Refetch only when the signed-in user changes, not on token refresh
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshProfile = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setProfile(null);
        setProfileReady(true);
        return;
      }
      setProfile(await getProfile(data.session.access_token));
      setProfileReady(true);
    } catch (e) {
      // Never let a failed profile fetch hang the app — release the gate so
      // RequireProfile can redirect to onboarding instead of spinning forever.
      logger.error("app", "refreshProfile failed:", e);
      setProfile(null);
      setProfileReady(true);
    }
  }, []);

  const submit2FA = useCallback(async (code: string) => {
    if (!session?.access_token) throw new Error(t("auth.sessionExpired"));
    setVerifying2FA(true);
    try {
      if (twoFAMethod === "email") {
        const { ok } = await verifyEmailOTPLogin(code);
        if (!ok) throw new Error(t("auth.invalidCode"));
      } else {
        const { ok } = await verify2FALogin(code);
        if (!ok) throw new Error(t("auth.invalidAuthCode"));
      }
      // Refresh the Supabase session so the post-2FA token (if any) and
      // user_metadata are current, then sync the API client token.
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      setSession(data.session);
      setApiAccessToken(data.session?.access_token ?? null);
      setNeeds2FA(false);
      setTwoFACode("");
      setEmailOTPSent(false);
    } finally {
      setVerifying2FA(false);
    }
  }, [session, twoFAMethod, t]);

  if (needs2FA && session) {
    const handleSendEmailOTP = async () => {
      try {
        await sendEmailOTPLogin();
        setEmailOTPSent(true);
        toast.success(t("auth.verificationCodeSent"));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("auth.failedToSendCode"));
      }
    };

    const isEmail = twoFAMethod === "email";
    const meta = session.user?.user_metadata;
    const hasBothMethods = meta?.totp_enabled && meta?.email_otp_enabled;

    return (
      <div className="dark flex h-screen w-screen items-center justify-center bg-[#0f0f0f]" style={{ fontFamily: "Lexend, sans-serif" }}>
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
              className="mb-3 w-full rounded-lg border border-neutral-700 px-4 py-2.5 text-[13px] text-neutral-300 transition-colors hover:bg-neutral-800"
            >
              {t("auth.sendCode")}
            </button>
          )}
          {isEmail && emailOTPSent && (
            <button
              onClick={handleSendEmailOTP}
              className="mb-3 w-full text-[12px] text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {t("auth.resendCode")}
            </button>
          )}
          <button
            onClick={() => submit2FA(twoFACode).catch((e) => {
              logger.error("app", "2FA verification failed:", e);
              toast.error(e instanceof Error ? e.message : t("auth.invalidCode"));
            })}
            disabled={verifying2FA || twoFACode.length !== 6}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {verifying2FA ? t("auth.verifying") : t("auth.verify")}
          </button>
          {hasBothMethods && (
            <button
              onClick={() => {
                setTwoFAMethod(isEmail ? "totp" : "email");
                setTwoFACode("");
                setEmailOTPSent(false);
              }}
              className="mt-3 w-full text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              {isEmail ? t("auth.useAuthenticatorInstead") : t("auth.useEmailCodeInstead")}
            </button>
          )}
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
        setProfile,
        refreshProfile,
        needs2FA,
        submit2FA,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
