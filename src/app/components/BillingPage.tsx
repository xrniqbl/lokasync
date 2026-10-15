import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { Field, FieldLabel } from "@/components/cossui/field";
import { Input } from "@/components/cossui/input";
import { Separator } from "@/components/cossui/separator";
import { Spinner } from "@/components/cossui/spinner";
import { useAuth } from "../auth/AuthContext";
import { useNavigation } from "./NavigationContext";
import { useSubscription } from "../subscription/SubscriptionContext";
import {
  validateVoucher,
  type TransactionSummary,
  type VoucherValidation,
} from "../utils/api";
import { useLang } from "../i18n";

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

/** Never throw on invalid dates — fall back to "—". */
function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return dateFmt.format(d);
}

const STATUS_BADGES: Record<string, { labelKey: string; className: string }> = {
  paid: { labelKey: "billingPage.paid", className: "bg-emerald-950/60 text-emerald-400" },
  pending: { labelKey: "billingPage.pending", className: "bg-amber-950/60 text-amber-400" },
  failed: { labelKey: "billingPage.failed", className: "bg-red-950/60 text-red-400" },
};

function TransactionRow({ tx }: { tx: TransactionSummary }) {
  const { t } = useLang();
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
            {t(badge.labelKey as any)}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11px] text-neutral-500">
          {formatDate(tx.created_at)} · {tx.order_id}
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
            {t("billingPage.continuePayment")}
          </Link>
        )}
      </div>
    </div>
  );
}

export function BillingPage() {
  const { t } = useLang();
  const { session } = useAuth();
  const { subSection } = useNavigation();
  const { plan, subscription, transactions, loading, refresh } =
    useSubscription();
  const historyRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Voucher redeem UI — validates a code against the current plan/interval.
  const [voucherCode, setVoucherCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState<VoucherValidation | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  // Depend on a stable key, not the `refresh` function identity — an
  // unstable context memo would otherwise re-run this effect in a loop.
  // Fetch on user (id) / mount only — never on token rotation, or every
  // background refresh would re-trigger a billing fetch.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    setLoadError(false);
    void refresh().catch(() => {
      if (mounted) setLoadError(true);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshKey]);

  const retryLoad = () => {
    setLoadError(false);
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    if (subSection === "history") {
      historyRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [subSection]);

  const isPaidPlan = plan.monthly > 0;
  const active = subscription?.status === "active";
  const expired = subscription?.status === "expired";

  // Prefer the price actually paid on the subscription's own order — plan
  // prices may have changed since the purchase. Fall back to the current
  // plan price when no matching transaction is available.
  const subscriptionTx = subscription
    ? transactions.find((tx) => tx.order_id === subscription.order_id)
    : undefined;
  const paidAmount =
    subscriptionTx?.gross_amount ??
    (subscription?.interval === "yearly" ? plan.yearly : plan.monthly);

  const applyRedeem = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = voucherCode.trim().toUpperCase();
    if (!trimmed || !session) return;
    setRedeeming(true);
    setRedeemError(null);
    try {
      const result = await validateVoucher(session.access_token, {
        code: trimmed,
        plan_id: plan.id,
        interval: subscription?.interval ?? "monthly",
      });
      setRedeemResult(result);
      if (!result.valid) {
        setRedeemError(result.reason ?? "This voucher code is not valid");
      }
    } catch (err) {
      console.error("Voucher redeem failed:", err);
      setRedeemResult(null);
      setRedeemError("Could not validate the voucher. Please try again.");
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div
      className="dark h-full overflow-y-auto bg-[#0f0f0f]"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8 lg:px-10">
        <div>
          <h1 className="text-[18px] text-neutral-50">{t("billingPage.billingTitle")}</h1>
          <p className="text-[13px] text-neutral-500">
            {t("billingPage.billingSubtitle")}
          </p>
        </div>

        <Separator className="bg-neutral-800" />

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="size-6 text-neutral-400" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-[13px] text-neutral-500">
              Couldn't load your billing info. Please try again.
            </p>
            <Button variant="outline" onClick={retryLoad}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {/* Current plan */}
            <Card className="border-neutral-800 bg-[#1a1a1a]" id="plan">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-neutral-50">
                  <span>
                    {t("billingPage.billingPlanTitle").replace("{planName}", plan.name)}
                    {active && (
                      <span className="ml-2 rounded-full bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-normal text-emerald-400">
                        {t("billingPage.activeBadge")}
                      </span>
                    )}
                    {expired && (
                      <span className="ml-2 rounded-full bg-red-950/60 px-2.5 py-0.5 text-[11px] font-normal text-red-400">
                        {t("billingPage.subscriptionExpired").split("—")[0]?.trim() ||
                          t("billingPage.subscriptionExpired")}
                      </span>
                    )}
                  </span>
                  <span className="text-[14px] font-normal text-neutral-300">
                    {isPaidPlan
                      ? `${idr.format(paidAmount)} ${
                          subscription?.interval === "yearly"
                            ? t("billingPage.perYear")
                            : t("billingPage.perMonth")
                        }`
                      : `${idr.format(0)}${t("billingPage.perMonth")}`}
                  </span>
                </CardTitle>
                <CardDescription className="text-neutral-400">
                  {active && subscription
                    ? t("billingPage.activeUntil").replace("{date}", formatDate(subscription.current_period_end))
                    : expired
                      ? t("billingPage.subscriptionExpired")
                      : t("billingPage.freePlanDesc")}
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
                      {t("billingPage.changePlan")}
                    </Button>
                    <Button
                      render={
                        <Link
                          to={`/checkout/${subscription.plan_id}?interval=${subscription.interval}`}
                        />
                      }
                    >
                      {t("billingPage.renewNow")}
                    </Button>
                  </>
                ) : expired && subscription ? (
                  <>
                    <Button variant="outline" render={<Link to="/pricing" />}>
                      {t("billingPage.comparePlans")}
                    </Button>
                    <Button
                      render={
                        <Link
                          to={`/checkout/${subscription.plan_id}?interval=${subscription.interval}`}
                        />
                      }
                    >
                      {t("billingPage.renewPlan").replace("{planName}", subscription.plan_id === "business" ? "Business" : "Pro")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" render={<Link to="/pricing" />}>
                      {t("billingPage.comparePlans")}
                    </Button>
                    <Button
                      render={<Link to="/checkout/pro?interval=monthly" />}
                    >
                      {t("billingPage.upgradeToPro")}
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>

            {/* Voucher redeem */}
            <Card className="border-neutral-800 bg-[#1a1a1a]">
              <CardHeader>
                <CardTitle className="text-neutral-50">Voucher</CardTitle>
                <CardDescription className="text-neutral-400">
                  Have a voucher code? Validate it against your current plan.
                </CardDescription>
              </CardHeader>
              <CardPanel>
                <form onSubmit={applyRedeem} className="flex flex-col gap-2">
                  <Field>
                    <FieldLabel>Voucher code</FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={voucherCode}
                        onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                        placeholder="LOKA20"
                        className="uppercase"
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        loading={redeeming}
                        disabled={!voucherCode.trim() || !session}
                      >
                        Apply
                      </Button>
                    </div>
                  </Field>
                  {redeemResult?.valid && (
                    <p className="text-[12px] text-emerald-400">
                      {redeemResult.code} —{" "}
                      {redeemResult.type === "percent"
                        ? `${redeemResult.value}% off`
                        : `${idr.format(redeemResult.value ?? 0)} off`}
                      {redeemResult.total != null
                        ? ` · total ${idr.format(redeemResult.total)}`
                        : ""}
                    </p>
                  )}
                  {redeemError && (
                    <p className="text-[12px] text-red-400">{redeemError}</p>
                  )}
                </form>
              </CardPanel>
            </Card>

            {/* Payment history */}
            <div ref={historyRef}>
              <Card className="border-neutral-800 bg-[#1a1a1a]">
                <CardHeader>
                  <CardTitle className="text-neutral-50">
                    {t("billingPage.paymentHistoryTitle")}
                  </CardTitle>
                  <CardDescription className="text-neutral-400">
                    {t("billingPage.paymentHistoryDesc")}
                  </CardDescription>
                </CardHeader>
                <CardPanel>
                  {transactions.length === 0 ? (
                    <p className="py-4 text-center text-[13px] text-neutral-500">
                      {t("billingPage.noPaymentsYet")}
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