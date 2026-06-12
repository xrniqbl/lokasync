import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
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
import { Spinner } from "@/components/cossui/spinner";
import { useAuth } from "../auth/AuthContext";
import { useSubscription } from "../subscription/SubscriptionContext";
import { getPlans, type Plan } from "../utils/api";

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

  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState(false);
  const [interval, setInterval] = useState<Interval>("monthly");

  useEffect(() => {
    getPlans()
      .then(setPlans)
      .catch((e) => {
        console.error("Failed to load plans:", e);
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
      <Link to="/" aria-label="LokaSync home">
        <span className="text-lg font-bold tracking-[0.08em] text-[#fafafa]">
          LOKASYNC
        </span>
      </Link>

      <h1 className="mt-8 text-center text-[28px] text-neutral-50">
        Simple, transparent pricing
      </h1>
      <p className="mt-2 max-w-md text-center text-[14px] text-neutral-400">
        Start free, upgrade when your team grows. All prices in Indonesian
        Rupiah.
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
            {option === "monthly" ? "Monthly" : "Yearly"}
            {option === "yearly" && (
              <span
                className={`ml-1.5 text-[11px] ${
                  interval === "yearly" ? "text-indigo-600" : "text-indigo-400"
                }`}
              >
                2 months free
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
                        Most popular
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="text-neutral-400">
                    {plan.description}
                  </CardDescription>
                </CardHeader>
                <CardPanel className="flex flex-1 flex-col gap-5">
                  <div>
                    <span className="text-[26px] text-neutral-50">
                      {amount === 0 ? "Rp 0" : idr.format(amount)}
                    </span>
                    <span className="text-[13px] text-neutral-500"> /month</span>
                    {interval === "yearly" && plan.yearly > 0 && (
                      <p className="mt-1 text-[12px] text-neutral-500">
                        {idr.format(plan.yearly)} billed yearly
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
                      Current plan
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
                          ? "Go to dashboard"
                          : "Get started"
                        : `Choose ${plan.name}`}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-10 text-[13px] text-neutral-500">
        {user ? (
          <Link
            to="/app/dashboard"
            className="text-neutral-300 underline-offset-4 hover:underline"
          >
            Back to dashboard
          </Link>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-neutral-300 underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
