import { Link } from "react-router";
import { Locked } from "@carbon/icons-react";
import { Button } from "@/components/cossui/button";
import { Spinner } from "@/components/cossui/spinner";
import {
  useSubscription,
  type PlanId,
} from "../subscription/SubscriptionContext";

/**
 * Blocks the page behind it until the user's plan rank reaches `min`.
 * UI-level gating only — real entitlements (prices, subscription state) are
 * always resolved server-side.
 */
export function PlanGate({
  min,
  feature,
  children,
}: {
  min: PlanId;
  feature: string;
  children: React.ReactNode;
}) {
  const { hasPlan, loading, plan } = useSubscription();

  if (hasPlan(min)) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0f0f0f]">
        <Spinner className="size-6 text-neutral-400" />
      </div>
    );
  }

  const requiredName = min === "business" ? "Business" : "Pro";

  return (
    <div
      className="dark flex h-full flex-col items-center justify-center gap-4 bg-[#0f0f0f] px-6 text-center"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-neutral-800/80">
        <Locked size={20} className="text-neutral-400" />
      </div>
      <div>
        <h2 className="text-[16px] text-neutral-50">
          {feature} is a {requiredName} feature
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-neutral-500">
          You are on the {plan.name} plan. Upgrade to {requiredName} to unlock{" "}
          {feature.toLowerCase()} for your workspace.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" render={<Link to="/pricing" />}>
          Compare plans
        </Button>
        <Button
          render={
            <Link to={`/checkout/${min === "business" ? "business" : "pro"}?interval=monthly`} />
          }
        >
          Upgrade to {requiredName}
        </Button>
      </div>
    </div>
  );
}
