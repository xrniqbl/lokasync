import { useState } from "react";
import { Link } from "react-router";
import { Clock, X } from "lucide-react";
import { useSubscription } from "../subscription/SubscriptionContext";

const REMIND_DAYS = 7;

/**
 * Slim top-of-app banner shown while an active subscription is within
 * REMIND_DAYS of its period end. Dismissing it hides it for the rest of the
 * browser session (per order, so a renewal re-arms it).
 */
export function RenewalBanner() {
  const { plan, subscription } = useSubscription();
  const [, forceRender] = useState(0);

  if (subscription?.status !== "active" || !subscription.current_period_end) {
    return null;
  }

  const msLeft =
    new Date(subscription.current_period_end).getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / 86_400_000);
  if (daysLeft < 0 || daysLeft > REMIND_DAYS) return null;

  const dismissKey = `loka-renew-dismissed:${subscription.order_id}`;
  try {
    if (sessionStorage.getItem(dismissKey)) return null;
  } catch {
    /* storage unavailable — just show the banner */
  }

  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissKey, "1");
    } catch {
      /* storage unavailable */
    }
    forceRender((n) => n + 1);
  };

  const when =
    daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;

  return (
    <div
      className="dark flex items-center justify-center gap-3 border-b border-amber-500/20 bg-amber-950/40 px-4 py-2 text-[12.5px] text-amber-200"
      style={{ fontFamily: "Lexend, sans-serif" }}
      role="status"
    >
      <Clock className="size-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <span>
        Your {plan.name} plan ends {when}. Renew to keep your paid features.
      </span>
      <Link
        to="/app/billing"
        className="shrink-0 rounded-full border border-amber-400/40 px-3 py-0.5 text-amber-100 transition-colors hover:bg-amber-400/10"
      >
        Renew
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss reminder"
        className="ml-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-amber-400/70 transition-colors hover:bg-amber-400/10 hover:text-amber-200"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
