import { logger } from "../utils/logger";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Check, Minus, HelpCircle } from "lucide-react";
import { LokaLogo } from "../components/LokaLogo";
import { Button } from "@/components/cossui/button";
import { useLang } from "../LangContext";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/cossui/card";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/cossui/accordion";
import { Spinner } from "@/components/cossui/spinner";
import { useAuth } from "../auth/AuthContext";
import { useSubscription } from "../subscription/SubscriptionContext";
import { getPlans, type Plan } from "../utils/api";
import { SEOHead } from "../components/SEOHead";

type Interval = "monthly" | "yearly";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function PricingPage() {
  const { user } = useAuth();
  const { plan: currentPlan, subscription } = useSubscription();
  const navigate = useNavigate();
  const { t } = useLang();

  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState(false);
  const [interval, setInterval] = useState<Interval>("monthly");

  useEffect(() => {
    getPlans()
      .then(setPlans)
      .catch((e) => {
        logger.error("app", "Failed to load plans:", e);
        setError(true);
      });
  }, []);

  const choosePlan = (plan: Plan) => {
    if (!user) {
      navigate("/register");
      return;
    }
    if (plan.monthly === 0) {
      navigate("/app/dashboard");
      return;
    }
    navigate(`/checkout/${plan.id}?interval=${interval}`);
  };

  return (
    <div
      className="dark flex min-h-screen w-full flex-col items-center bg-[#0f0f0f] px-4 py-12"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <SEOHead
        title="Pricing — LokaSync"
        description="LokaSync pricing: Free for up to 3 projects. Pro and Business plans available. All prices in Indonesian Rupiah (IDR). Pay via bank transfer."
        canonical="https://lokasync.app/pricing"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "LokaSync Pricing",
          description: "Simple, transparent pricing for LokaSync project management workspace.",
          url: "https://lokasync.app/pricing",
        }}
      />
      <LokaLogo size="md" />

      <h1 className="mt-8 text-center text-[28px] text-neutral-50">
        {t("pricing.title")}
      </h1>
      <p className="mt-2 max-w-md text-center text-[14px] text-neutral-400">
        {t("pricing.subtitle")}
      </p>

      {/* Billing interval toggle */}
      <div className="mt-8 flex items-center rounded-full border border-neutral-800 bg-[#1a1a1a] p-1">
        {(["monthly", "yearly"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setInterval(option)}
            className={`rounded-full px-4 py-1.5 text-[13px] transition-colors ${
              interval === option
                ? "bg-neutral-50 text-neutral-900"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {option === "monthly" ? t("pricing.monthly") : t("pricing.yearly")}
            {option === "yearly" && (
              <span
                className={`ml-1.5 text-[11px] font-medium ${
                  interval === "yearly" ? "text-emerald-600" : "text-indigo-400"
                }`}
              >
                {t("pricing.monthsFree")}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-16 text-[14px] text-neutral-500">
          Couldn't load plans. Please try again later.
        </p>
      )}
      {!plans && !error && (
        <Spinner className="mt-16 size-6 text-neutral-400" />
      )}

      {plans && (
        <div className="mt-10 grid w-full max-w-4xl gap-5 md:grid-cols-3">
          {plans.map((plan) => {
            const amount =
              interval === "monthly"
                ? plan.monthly
                : Math.round(plan.yearly / 12);
            return (
              <Card
                key={plan.id}
                className={`flex flex-col bg-[#1a1a1a] ${
                  plan.highlighted
                    ? "border-indigo-500/60"
                    : "border-neutral-800"
                }`}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-neutral-50">
                    {plan.name}
                    {plan.highlighted && (
                      <span className="rounded-full bg-indigo-900/60 px-2.5 py-0.5 text-[11px] font-normal text-indigo-300">
                        {t("pricing.mostPopular")}
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="text-neutral-400">
                    {t(`pricing.desc.${plan.id}`)}
                  </CardDescription>
                </CardHeader>
                <CardPanel className="flex flex-1 flex-col gap-5">
                  <div>
                    <span className="text-[26px] text-neutral-50">
                      {amount === 0 ? "Rp 0" : idr.format(amount)}
                    </span>
                    <span className="text-[13px] text-neutral-500"> {t("pricing.perMonth")}</span>
                    {interval === "yearly" && plan.yearly > 0 && (
                      <p className="mt-1 text-[12px] text-neutral-500">
                        {idr.format(plan.yearly)} {t("pricing.billedYearly")}
                      </p>
                    )}
                  </div>
                  <ul className="flex flex-col gap-2.5">
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
                <CardFooter>
                  {user && currentPlan.id === plan.id ? (
                    <Button className="w-full" variant="outline" disabled>
                      {t("pricing.currentPlan")}
                      {subscription?.status === "active" &&
                      subscription.interval !== interval &&
                      plan.monthly > 0
                        ? ` (${subscription.interval})`
                        : ""}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant={plan.highlighted ? "default" : "outline"}
                      onClick={() => choosePlan(plan)}
                    >
                      {plan.monthly === 0
                        ? user
                          ? t("pricing.goToDashboard")
                          : t("pricing.getStarted")
                        : `${t("pricing.choose")} ${plan.name}`}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Feature Comparison Table ── */}
      <div className="mt-20 w-full max-w-4xl">
        <h2 className="text-[24px] font-semibold text-neutral-50 text-center mb-2">
          {t("pricing.compareTitle")}
        </h2>
        <p className="text-[14px] text-neutral-400 text-center mb-8">
          {t("pricing.compareSubtitle")}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="py-3 pr-4 text-left text-neutral-400 font-normal">{t("pricing.feature")}</th>
                <th className="py-3 px-4 text-center text-neutral-400 font-normal">Free</th>
                <th className="py-3 px-4 text-center text-indigo-400 font-semibold">Pro</th>
                <th className="py-3 pl-4 text-center text-neutral-400 font-normal">Business</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const featureLabels: string[] = (() => {
                  try { return JSON.parse(t("pricing.compare.features")); } catch { return ["Projects","Tasks per project","Team members","Calendar view","File storage","Real-time sync","Kanban & list views","Analytics dashboard","Team management","Priority support","Custom workspace settings","API access","Audit log"]; }
                })();
                return [
                  { feature: featureLabels[0], free: "3", pro: "Unlimited", biz: "Unlimited" },
                  { feature: featureLabels[1], free: "Unlimited", pro: "Unlimited", biz: "Unlimited" },
                  { feature: featureLabels[2], free: "Up to 3", pro: "Up to 20", biz: "Unlimited" },
                  { feature: featureLabels[3], free: true, pro: true, biz: true },
                  { feature: featureLabels[4], free: "1 GB", pro: "25 GB", biz: "Unlimited" },
                  { feature: featureLabels[5], free: true, pro: true, biz: true },
                  { feature: featureLabels[6], free: true, pro: true, biz: true },
                  { feature: featureLabels[7], free: false, pro: true, biz: true },
                  { feature: featureLabels[8], free: false, pro: true, biz: true },
                  { feature: featureLabels[9], free: false, pro: true, biz: true },
                  { feature: featureLabels[10], free: false, pro: true, biz: true },
                  { feature: featureLabels[11], free: false, pro: false, biz: true },
                  { feature: featureLabels[12], free: false, pro: false, biz: true },
                ].map((row, i) => (
                <tr key={i} className={`border-b border-neutral-800/50 ${i % 2 === 0 ? "bg-neutral-800/10" : ""}`}>
                  <td className="py-3 pr-4 text-neutral-300">{row.feature}</td>
                  {["free", "pro", "biz"].map((tier) => {
                    const val = row[tier as keyof typeof row];
                    return (
                      <td key={tier} className="py-3 px-4 text-center">
                        {typeof val === "boolean" ? (
                          val ? (
                            <Check className="inline size-4 text-indigo-400" />
                          ) : (
                            <Minus className="inline size-4 text-neutral-500" />
                          )
                        ) : (
                          <span className="text-neutral-300">{val}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))})()}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pricing FAQ ── */}
      <div className="mt-20 w-full max-w-2xl">
        <h2 className="text-[24px] font-semibold text-neutral-50 text-center mb-2">
          {t("pricing.faqTitle")}
        </h2>
        <p className="text-[14px] text-neutral-400 text-center mb-8">
          {t("pricing.faqSubtitle")}
        </p>

        <Accordion>
          {[1,2,3,4,5,6,7].map((i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-[14px] text-neutral-200 hover:text-neutral-50 text-left">
                {t(`pricing.faq.q${i}`)}
              </AccordionTrigger>
              <AccordionPanel className="text-[13px] text-neutral-400 leading-relaxed">
                {t(`pricing.faq.a${i}`)}
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* ── Bottom CTA ── */}
      <div className="mt-16 mb-8 text-center">
        <p className="text-[14px] text-neutral-400 mb-4">
          {t("pricing.contactSupport")}
        </p>
        <a
          href="mailto:support@lokasync.com"
          className="text-[13px] text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          support@lokasync.com
        </a>
      </div>

      <p className="mt-4 mb-8 text-[13px] text-neutral-500">
        {user ? (
          <Link
            to="/app/dashboard"
            className="text-neutral-300 underline-offset-4 hover:underline"
          >
            {t("pricing.backToDashboard")}
          </Link>
        ) : (
          <>
            {t("pricing.alreadyHaveAccount")}{" "}
            <Link
              to="/login"
              className="text-neutral-300 underline-offset-4 hover:underline"
            >
              {t("pricing.signIn")}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
