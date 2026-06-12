import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "/utils/supabase/info";

export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "hris-loka-auth",
    },
  }
);

export type AuthUser = {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return {
    id: user.id,
    email: user.email ?? "",
    full_name: user.user_metadata?.full_name,
    avatar_url: user.user_metadata?.avatar_url,
  };
}

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export interface ProfileMetadata {
  full_name: string;
  phone: string;
  job_title?: string;
  company?: string;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  metadata: ProfileMetadata,
) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
      emailRedirectTo: `${window.location.origin}/verify-email`,
    },
  });
}

export async function resendVerification(email: string) {
  return supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${window.location.origin}/verify-email` },
  });
}

export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function resetPassword(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
}

export function getSession() {
  return supabase.auth.getSession();
}

export function onAuthStateChange(callback: (user: AuthUser | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      callback({
        id: session.user.id,
        email: session.user.email ?? "",
        full_name: session.user.user_metadata?.full_name,
        avatar_url: session.user.user_metadata?.avatar_url,
      });
    } else {
      callback(null);
    }
  });
}
