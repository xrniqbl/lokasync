/**
 * Structured logger for LokaSync.
 * In development: logs to console.
 * In production: logs to console.warn/error (visible in browser devtools and
 * hosting logs). Swap the body with Sentry/LogRocket when ready.
 */

const IS_DEV = import.meta.env.DEV;

/** Build a safe metadata object from an unknown error. */
function serialize(err: unknown): Record<string, string> {
  if (err instanceof Error) return { message: err.message, stack: err.stack ?? "" };
  if (typeof err === "string") return { message: err };
  try { return { message: JSON.stringify(err) }; } catch { return { message: String(err) }; }
}

export const logger = {
  error: (context: string, err: unknown, extra?: Record<string, unknown>) => {
    const meta = { context, ...serialize(err), ...extra };
    if (IS_DEV) {
      console.error(`[${context}]`, err, extra ?? "");
    } else {
      // Visible in browser console + hosting log streams (Vercel, Netlify, Supabase)
      console.error(`[LokaSync][${context}]`, meta);
    }
    // TODO: Replace with Sentry.captureException(err, { extra: { context, ...extra } });
  },

  warn: (context: string, message: string, extra?: Record<string, unknown>) => {
    if (IS_DEV) {
      console.warn(`[${context}]`, message, extra ?? "");
    } else {
      console.warn(`[LokaSync][${context}]`, message, extra ?? "");
    }
  },

  info: (context: string, message: string) => {
    if (IS_DEV) {
      console.info(`[${context}]`, message);
    }
  },
};
