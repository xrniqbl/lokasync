/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project ref (subdomain of <ref>.supabase.co). */
  readonly VITE_SUPABASE_PROJECT_ID: string;
  /** Supabase anon public key — safe to expose, gated by RLS. */
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Midtrans Snap.js global type */
interface MidtransSnap {
  pay(snapToken: string, callbacks: {
    onSuccess?: (result: unknown) => void;
    onPending?: (result: unknown) => void;
    onError?: (result: unknown) => void;
    onClose?: () => void;
  }): void;
}

interface Window {
  snap?: MidtransSnap;
}
