import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Spinner } from "@/components/cossui/spinner";
import { useAuth } from "./AuthContext";

export function FullScreenLoader() {
  return (
    <div className="dark flex h-screen w-screen items-center justify-center bg-[#0f0f0f]">
      <Spinner className="size-6 text-neutral-400" />
    </div>
  );
}

function FullScreenError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="dark flex h-screen w-screen items-center justify-center bg-[#0f0f0f] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-[#1a1a1a] p-6 text-center">
        <p className="mb-1 text-[14px] text-neutral-50">Something went wrong</p>
        <p className="mb-4 text-[13px] text-neutral-500">{message}</p>
        <button
          onClick={onRetry}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] text-white transition-colors hover:bg-indigo-500"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

/** Blocks unauthenticated users; remembers where they came from. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, needs2FA } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  // 2FA-pending users never reach app content: the AuthProvider renders the
  // 2FA wall globally. If that wall is somehow bypassed, send them to /login.
  if (needs2FA) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

/** Keeps already-authenticated users out of login/register pages. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading, needs2FA } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  // Let 2FA-pending users stay: the AuthProvider's 2FA wall (with its own
  // sign-out affordance) renders above these pages, and redirecting them to
  // /app/dashboard would loop them back here.
  // After 2FA success, return to the deep link that triggered the login gate.
  if (user && !needs2FA) {
    const state = location.state as { from?: { pathname?: string; search?: string; hash?: string } | string } | null;
    const from =
      typeof state?.from === "string"
        ? state.from
        : state?.from?.pathname
          ? `${state.from.pathname}${state.from.search ?? ""}${state.from.hash ?? ""}`
          : "/app/dashboard";
    return <Navigate to={from} replace />;
  }
  return <>{children}</>;
}

/** Sends users with an incomplete profile to onboarding first. */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { profile, profileLoading, profileError, refreshProfile } = useAuth();

  if (profileLoading) return <FullScreenLoader />;
  // A failed fetch is not "no profile": show a retry screen instead of
  // routing an onboarded user to /onboarding, where saving could overwrite
  // good data with a blank form.
  if (profileError && !profile) {
    return <FullScreenError message={profileError} onRetry={() => void refreshProfile()} />;
  }
  if (!profile) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
