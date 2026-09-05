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
  /** Replace the cached profile (e.g. right after saveProfile). */
  setProfile: (profile: Profile | null) => void;
  /** Re-fetch the profile from the server. */
  refreshProfile: () => Promise<void>;
  /** True when the signed-in user has 2FA enabled and must verify a code. */
  needs2FA: boolean;
  /** Submit a TOTP/email-OTP code to complete login. */
  submit2FA: (code: string) => Promise<void>;
  /** Switch the pending second factor (TOTP ↔ email OTP). */
  twoFAMethod: "totp" | "email";
  setTwoFAMethod: (m: "totp" | "email") => void;
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
  twoFAMethod: "totp",
  setTwoFAMethod: () => {},
});

/** True when the account demands a second factor before entering the app. */
const wants2FA = (s: Session | null) =>
  !!(s?.user?.user_metadata?.totp_enabled || s?.user?.user_metadata?.email_otp_enabled);

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      // Set the API token before re-rendering so child fetch effects use it
      setApiAccessToken(data.session?.access_token ?? null);
      setSession(data.session);
      setNeeds2FA(wants2FA(data.session));
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setApiAccessToken(nextSession?.access_token ?? null);
      setSession(nextSession);
      setNeeds2FA(wants2FA(nextSession));
      setLoading(false);
    });
    // Proactive refresh keeps the token valid in background tabs — the 2FA
    // verification call relies on it being fresh.
    const refreshInterval = setInterval(() => {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (s) setApiAccessToken(s.access_token);
      }).catch(() => { /* retried next tick */ });
    }, 4 * 60 * 1000);
    return () => {
      subscription.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, []);

  const userId = session?.user?.id;
  const accessToken = session?.access_token;

  useEffect(() => {
    if (!userId || !accessToken || needs2FA) {
      if (!needs2FA) {
        setProfile(null);
        setProfileReady(false);
      }
      return;
    }
    let cancelled = false;
    setProfileReady(false);
    getProfile(accessToken)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((e) => {
        console.error("Failed to load profile:", e);
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setProfileReady(true);
      });
    return () => {
      cancelled = true;
    };
    // Refetch only when the signed-in user changes, not on token refresh
  }, [userId, needs2FA]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    setProfile(await getProfile(data.session.access_token));
    setProfileReady(true);
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
      // Refresh the session so the latest user_metadata is in place, then
      // release the 2FA gate.
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      setSession(data.session);
      setApiAccessToken(data.session?.access_token ?? null);
      setNeeds2FA(wants2FA(data.session));
      setTwoFACode("");
      setEmailOTPSent(false);
    } finally {
      setVerifying2FA(false);
    }
  }, [session, twoFAMethod, t]);

  const handleSendEmailOTP = async () => {
    try {
      await sendEmailOTPLogin();
      setEmailOTPSent(true);
      toast.success(t("auth.verificationCodeSent"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("auth.failedToSendCode"));
    }
  };

  if (needs2FA && session) {
    const meta = session.user?.user_metadata;
    const hasBothMethods = meta?.totp_enabled && meta?.email_otp_enabled;
    const isEmail = twoFAMethod === "email";

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
              className="mb-3 w-full rounded-lg border border-neutral-700 px-4 py-2.5 text-[13px] text-neutral-300 transition-colors hover:bg-neutral-800"
            >
              {t("auth.sendCode")}
            </button>
          )}
          {isEmail && emailOTPSent && (
            <button
              onClick={handleSendEmailOTP}
              className="mb-3 w-full text-[12px] text-indigo-400 transition-colors hover:text-indigo-300"
            >
              {t("auth.resendCode")}
            </button>
          )}
          <button
            onClick={() => submit2FA(twoFACode).catch((e) => {
              console.error("2FA verification failed:", e);
              toast.error(e instanceof Error ? e.message : t("auth.invalidCode"));
            })}
            disabled={verifying2FA || twoFACode.length !== 6}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {verifying2FA ? t("auth.verifying") : t("settings.verify")}
          </button>
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
        twoFAMethod,
        setTwoFAMethod,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
