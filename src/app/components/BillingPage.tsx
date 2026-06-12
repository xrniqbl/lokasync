import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/cossui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/cossui/card";
import { Separator } from "@/components/cossui/separator";
import { Spinner } from "@/components/cossui/spinner";
import { useNavigation } from "./NavigationContext";
import { useSubscription } from "../subscription/SubscriptionContext";
import type { TransactionSummary } from "../utils/api";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-950/60 text-emerald-400" },
  pending: { label: "Pending", className: "bg-amber-950/60 text-amber-400" },
  failed: { label: "Failed", className: "bg-red-950/60 text-red-400" },
};

function TransactionRow({ tx }: { tx: TransactionSummary }) {
  const badge = STATUS_BADGES[tx.status] ?? STATUS_BADGES.pending;
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-neutral-200">
            {tx.plan_name} · {tx.interval}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11px] text-neutral-500">
          {dateFmt.format(new Date(tx.created_at))} · {tx.order_id}
          {tx.voucher_code ? ` · voucher ${tx.voucher_code}` : ""}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[13px] text-neutral-100">
          {idr.format(tx.gross_amount)}
        </div>
        {tx.status === "pending" && (
          <Link
            to={`/payment/finish?order_id=${encodeURIComponent(tx.order_id)}`}
            className="text-[11px] text-indigo-400 underline-offset-4 hover:underline"
          >
            Continue payment
          </Link>
        )}
      </div>
    </div>
  );
}

export function BillingPage() {
  const { subSection } = useNavigation();
  const { plan, subscription, transactions, loading, refresh } =
    useSubscription();
  const historyRef = useRef<HTMLDivElement>(null);

  // Billing data changes outside the app (webhook/settlement) — refetch on open
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (subSection === "history") {
      historyRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [subSection]);

  const isPaidPlan = plan.monthly > 0;
  const active = subscription?.status === "active";
  const expired = subscription?.status === "expired";

  return (
    <div
      className="dark h-full overflow-y-auto bg-[#0f0f0f]"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8 lg:px-10">
        <div>
          <h1 className="text-[18px] text-neutral-50">Billing</h1>
          <p className="text-[13px] text-neutral-500">
            Manage your subscription and view your payment history.
          </p>
        </div>

        <Separator className="bg-neutral-800" />

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="size-6 text-neutral-400" />
          </div>
        ) : (
          <>
            {/* Current plan */}
            <Card className="border-neutral-800 bg-[#1a1a1a]" id="plan">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-neutral-50">
                  <span>
                    {plan.name} plan
                    {active && (
                      <span className="ml-2 rounded-full bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-normal text-emerald-400">
                        Active
                      </span>
                    )}
                    {expired && (
                      <span className="ml-2 rounded-full bg-red-950/60 px-2.5 py-0.5 text-[11px] font-normal text-red-400">
                        Expired
                      </span>
                    )}
                  </span>
                  <span className="text-[14px] font-normal text-neutral-300">
                    {isPaidPlan
                      ? `${idr.format(
                          subscription?.interval === "yearly"
                            ? plan.yearly
                            : plan.monthly,
                        )} / ${
                          subscription?.interval === "yearly" ? "year" : "month"
                        }`
                      : "Rp 0"}
                  </span>
                </CardTitle>
                <CardDescription className="text-neutral-400">
                  {active && subscription
                    ? `Active until ${dateFmt.format(
                        new Date(subscription.current_period_end),
                      )}. Renewing now adds another period on top of that date.`
                    : expired
                      ? "Your subscription has ended — you are back on the Free plan. Renew to regain access to paid features."
                      : "You are on the Free plan. Upgrade to unlock analytics, team management, and unlimited projects."}
                </CardDescription>
              </CardHeader>
              <CardPanel>
                <ul className="flex flex-col gap-2">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-[13px] text-neutral-300"
                    >
                      <Check className="mt-0.5 size-3.5 shrink-0 text-indigo-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardPanel>
              <CardFooter className="justify-end gap-2">
                {isPaidPlan && active && subscription ? (
                  <>
                    <Button variant="outline" render={<Link to="/pricing" />}>
                      Change plan
                    </Button>
                    {/* Paying for the same plan extends the current period */}
                    <Button
                      render={
                        <Link
                          to={`/checkout/${subscription.plan_id}?interval=${subscription.interval}`}
                        />
                      }
                    >
                      Renew now
                    </Button>
                  </>
                ) : expired && subscription ? (
                  <>
                    <Button variant="outline" render={<Link to="/pricing" />}>
                      Compare plans
                    </Button>
                    <Button
                      render={
                        <Link
                          to={`/checkout/${subscription.plan_id}?interval=${subscription.interval}`}
                        />
                      }
                    >
                      Renew {subscription.plan_id === "business" ? "Business" : "Pro"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" render={<Link to="/pricing" />}>
                      Compare plans
                    </Button>
                    <Button
                      render={<Link to="/checkout/pro?interval=monthly" />}
                    >
                      Upgrade to Pro
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>

            {/* Payment history */}
            <div ref={historyRef}>
              <Card className="border-neutral-800 bg-[#1a1a1a]">
                <CardHeader>
                  <CardTitle className="text-neutral-50">
                    Payment history
                  </CardTitle>
                  <CardDescription className="text-neutral-400">
                    Orders made with this account, newest first.
                  </CardDescription>
                </CardHeader>
                <CardPanel>
                  {transactions.length === 0 ? (
                    <p className="py-4 text-center text-[13px] text-neutral-500">
                      No payments yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-neutral-800/70">
                      {transactions.map((tx) => (
                        <TransactionRow key={tx.order_id} tx={tx} />
                      ))}
                    </div>
                  )}
                </CardPanel>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
