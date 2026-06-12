import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../utils/supabase";
import { getProfile, setApiAccessToken, type Profile } from "../utils/api";

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
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  profile: null,
  profileLoading: false,
  setProfile: () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      // Set the API token before re-rendering so child fetch effects use it
      setApiAccessToken(data.session?.access_token ?? null);
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setApiAccessToken(nextSession?.access_token ?? null);
      setSession(nextSession);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
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
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    setProfile(await getProfile(data.session.access_token));
    setProfileReady(true);
  }, []);

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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
