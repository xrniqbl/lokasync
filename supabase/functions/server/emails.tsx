// supabase/functions/server/emails.tsx
// Centralised transactional email helpers via Resend.

const RESEND_API_KEY = () => Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = () =>
  Deno.env.get("INVITE_FROM_EMAIL") ?? "LokaSync <onboarding@resend.dev>";

// ── Generic sender ─────────────────────────────────────────────────────────────

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const key = RESEND_API_KEY();
  if (!key) {
    console.log("RESEND_API_KEY not set — email skipped:", subject, "to:", to);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL(),
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    console.log("Resend error:", res.status, await res.text());
    return false;
  }
  return true;
}

// ── HTML templates ─────────────────────────────────────────────────────────────

export function receiptHtml(params: {
  userName: string;
  planName: string;
  interval: string;
  amount: number;
  currency: string;
  orderId: string;
  periodEnd: string;
  paymentType?: string | null;
}): string {
  const {
    userName, planName, interval, amount, currency, orderId, periodEnd,
    paymentType,
  } = params;
  const periodLabel = interval === "yearly" ? "Yearly" : "Monthly";
  const formattedAmount = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
  }).format(amount);

  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="color:#111">Payment confirmed — thank you, ${escapeHtml(userName)}!</h2>
    <p>Your <strong>${escapeHtml(planName)}</strong> (${periodLabel}) subscription is now active.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:6px 0;color:#666">Order ID</td><td style="padding:6px 0;text-align:right;font-weight:600">${escapeHtml(orderId)}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600">${formattedAmount}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Payment method</td><td style="padding:6px 0;text-align:right;font-weight:600">${escapeHtml(paymentType ?? "—")}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Valid until</td><td style="padding:6px 0;text-align:right;font-weight:600">${new Date(periodEnd).toLocaleDateString("id-ID")}</td></tr>
    </table>
    <p style="color:#888;font-size:13px">You can view your invoices anytime in Settings → Billing.</p>
  </div>`;
}

export function reminderHtml(params: {
  userName: string;
  planName: string;
  expiryDate: string;
  daysLeft: number;
}): string {
  const { userName, planName, expiryDate, daysLeft } = params;
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="color:#111">Your subscription expires soon</h2>
    <p>Hi ${escapeHtml(userName)},</p>
    <p>Your <strong>${escapeHtml(planName)}</strong> plan will expire on <strong>${new Date(expiryDate).toLocaleDateString("id-ID")}</strong> (${daysLeft} day${daysLeft === 1 ? "" : "s"} left).</p>
    <p><a href="https://lokasync.app/settings/billing" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none">Renew subscription</a></p>
    <p style="color:#888;font-size:13px">If you don't renew, your workspace will be downgraded to the Free plan. Files over quota will remain accessible but new uploads will be blocked.</p>
  </div>`;
}

// ── Utility ─────────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}