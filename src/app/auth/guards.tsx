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

/** Blocks unauthenticated users; remembers where they came from. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

/** Keeps already-authenticated users out of login/register pages. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/app/dashboard" replace />;
  return <>{children}</>;
}

/** Sends users with an incomplete profile to onboarding first. */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { profile, profileLoading } = useAuth();

  if (profileLoading) return <FullScreenLoader />;
  if (!profile) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
