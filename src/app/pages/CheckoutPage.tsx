import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
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
import { useSubscription } from "../subscription/SubscriptionContext";
import {
  createCheckout,
  getPlans,
  validateVoucher,
  type BillingInterval,
  type Plan,
  type VoucherValidation,
} from "../utils/api";

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        callbacks: {
          onSuccess?: (result: unknown) => void;
          onPending?: (result: unknown) => void;
          onError?: (result: unknown) => void;
          onClose?: () => void;
        },
      ) => void;
    };
  }
}

// Loads Midtrans snap.js once; resolves when window.snap is available
function loadSnap(clientKey: string, isProduction: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.snap) return resolve();
    const script = document.createElement("script");
    script.src = isProduction
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js";
    script.setAttribute("data-client-key", clientKey);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Midtrans Snap"));
    document.head.appendChild(script);
  });
}

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function CheckoutPage() {
  const { planId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const interval: BillingInterval =
    searchParams.get("interval") === "yearly" ? "yearly" : "monthly";
  const { session, profile } = useAuth();
  const { subscription } = useSubscription();
  const navigate = useNavigate();

  // Buying the plan you already have extends the current period (server rule)
  const isRenewal =
    subscription?.status === "active" &&
    subscription.plan_id === planId &&
    !!subscription.current_period_end &&
    new Date(subscription.current_period_end) > new Date();

  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [plansError, setPlansError] = useState(false);

  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [voucher, setVoucher] = useState<VoucherValidation | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    getPlans()
      .then(setPlans)
      .catch((e) => {
        console.error("Failed to load plans:", e);
        setPlansError(true);
      });
  }, []);

  const plan = plans?.find((p) => p.id === planId);

  // Recompute the applied voucher's discount when the interval changes
  useEffect(() => {
    if (!voucher?.code || !session || !plan) return;
    validateVoucher(session.access_token, {
      code: voucher.code,
      plan_id: plan.id,
      interval,
    })
      .then((result) => {
        if (!result.valid) {
          toast.error(result.reason ?? "Voucher no longer applies");
        }
        setVoucher(result.valid ? result : null);
      })
      .catch(() => setVoucher(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  if (plansError) {
    return (
      <CheckoutShell>
        <p className="mt-16 text-[14px] text-neutral-500">
          Couldn't load your order. Please try again later.
        </p>
      </CheckoutShell>
    );
  }
  if (!plans) {
    return (
      <CheckoutShell>
        <Spinner className="mt-16 size-6 text-neutral-400" />
      </CheckoutShell>
    );
  }
  if (!plan || plan.monthly === 0) {
    return <Navigate to="/pricing" replace />;
  }

  const base = interval === "yearly" ? plan.yearly : plan.monthly;
  const discount = voucher?.valid ? (voucher.discount ?? 0) : 0;
  const total = voucher?.valid ? (voucher.total ?? base) : base;

  const setInterval = (next: BillingInterval) =>
    setSearchParams({ interval: next }, { replace: true });

  const applyVoucher = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || !session) return;
    setApplying(true);
    try {
      const result = await validateVoucher(session.access_token, {
        code: trimmed,
        plan_id: plan.id,
        interval,
      });
      if (result.valid) {
        setVoucher(result);
        setCode("");
        toast.success(`Voucher ${result.code} applied`);
      } else {
        setVoucher(null);
        toast.error(result.reason ?? "This voucher code is not valid");
      }
    } catch (err) {
      console.error("Voucher validation failed:", err);
      toast.error("Could not validate the voucher. Please try again.");
    } finally {
      setApplying(false);
    }
  };

  const pay = async () => {
    if (!session) return;
    setPaying(true);
    try {
      const checkout = await createCheckout(session.access_token, {
        plan_id: plan.id,
        interval,
        ...(voucher?.valid && voucher.code
          ? { voucher_code: voucher.code }
          : {}),
      });
      await loadSnap(checkout.client_key, checkout.is_production);
      window.snap!.pay(checkout.token, {
        onSuccess: () =>
          navigate(`/payment/finish?order_id=${checkout.order_id}`),
        onPending: () =>
          navigate(`/payment/pending?order_id=${checkout.order_id}`),
        onError: () =>
          navigate(`/payment/error?order_id=${checkout.order_id}`),
        onClose: () => setPaying(false),
      });
    } catch (err) {
      console.error("Checkout failed:", err);
      const message = String(err);
      toast.error(
        message.includes("503")
          ? "Payments are not configured yet. Please try again later."
          : "Could not start the payment. Please try again.",
      );
      setPaying(false);
    }
  };

  return (
    <CheckoutShell>
      <div className="mt-10 grid w-full max-w-3xl gap-5 md:grid-cols-[1fr_320px]">
        {/* Left column — order configuration */}
        <div className="flex flex-col gap-5">
          <Card className="border-neutral-800 bg-[#1a1a1a]">
            <CardHeader>
              <CardTitle className="text-neutral-50">
                {plan.name} plan
              </CardTitle>
              <CardDescription className="text-neutral-400">
                {plan.description}
              </CardDescription>
            </CardHeader>
            <CardPanel className="flex flex-col gap-3">
              {(["monthly", "yearly"] as const).map((option) => {
                const amount = option === "yearly" ? plan.yearly : plan.monthly;
                const selected = interval === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setInterval(option)}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                      selected
                        ? "border-indigo-500/60 bg-indigo-950/30"
                        : "border-neutral-800 hover:border-neutral-700"
                    }`}
                  >
                    <span className="flex flex-col">
                      <span className="text-[14px] text-neutral-50">
                        {option === "monthly" ? "Monthly" : "Yearly"}
                        {option === "yearly" && (
                          <span className="ml-2 rounded-full bg-indigo-900/60 px-2 py-0.5 text-[11px] text-indigo-300">
                            2 months free
                          </span>
                        )}
                      </span>
                      <span className="text-[12px] text-neutral-500">
                        {option === "monthly"
                          ? `${idr.format(plan.monthly)} per month`
                          : `${idr.format(plan.yearly)} per year`}
                      </span>
                    </span>
                    <span
                      className={`flex size-4 items-center justify-center rounded-full border ${
                        selected
                          ? "border-indigo-400 bg-indigo-400"
                          : "border-neutral-600"
                      }`}
                    >
                      {selected && <Check className="size-3 text-[#0f0f0f]" />}
                    </span>
                  </button>
                );
              })}
            </CardPanel>
          </Card>

          <Card className="border-neutral-800 bg-[#1a1a1a]">
            <CardHeader>
              <CardTitle className="text-neutral-50">Billing details</CardTitle>
              <CardDescription className="text-neutral-400">
                Taken from your profile and used for the payment receipt.{" "}
                <Link
                  to="/app/profile"
                  className="text-neutral-300 underline-offset-4 hover:underline"
                >
                  Edit
                </Link>
              </CardDescription>
            </CardHeader>
            <CardPanel className="flex flex-col gap-1.5 text-[13px]">
              <p className="text-neutral-50">{profile?.full_name}</p>
              <p className="text-neutral-400">{profile?.email}</p>
              <p className="text-neutral-400">{profile?.phone}</p>
              {profile?.company && (
                <p className="text-neutral-400">{profile.company}</p>
              )}
            </CardPanel>
          </Card>
        </div>

        {/* Right column — order summary */}
        <Card className="h-fit border-neutral-800 bg-[#1a1a1a]">
          <CardHeader>
            <CardTitle className="text-neutral-50">Order summary</CardTitle>
          </CardHeader>
          <CardPanel className="flex flex-col gap-4">
            <form onSubmit={applyVoucher} className="flex flex-col gap-2">
              <Field>
                <FieldLabel>Voucher code</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="LOKA20"
                    className="uppercase"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    loading={applying}
                    disabled={!code.trim()}
                  >
                    Apply
                  </Button>
                </div>
              </Field>
              {voucher?.valid && (
                <div className="flex items-center justify-between rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2">
                  <span className="text-[12px] text-emerald-300">
                    {voucher.code} —{" "}
                    {voucher.type === "percent"
                      ? `${voucher.value}% off`
                      : `${idr.format(voucher.value ?? 0)} off`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setVoucher(null)}
                    aria-label="Remove voucher"
                    className="text-emerald-400 hover:text-emerald-200"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
            </form>

            <Separator className="bg-neutral-800" />

            <div className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between text-neutral-400">
                <span>
                  {plan.name} · {interval === "yearly" ? "yearly" : "monthly"}
                </span>
                <span>{idr.format(base)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Voucher discount</span>
                  <span>-{idr.format(discount)}</span>
                </div>
              )}
              <Separator className="bg-neutral-800" />
              <div className="flex justify-between text-[14px] text-neutral-50">
                <span>Total due today</span>
                <span>{idr.format(total)}</span>
              </div>
            </div>
          </CardPanel>
          <CardFooter className="flex-col gap-3">
            <Button className="w-full" loading={paying} onClick={pay}>
              Pay {idr.format(total)}
            </Button>
            {isRenewal && subscription && (
              <p className="text-center text-[11px] text-indigo-300">
                Renewal: your new period starts after{" "}
                {new Intl.DateTimeFormat("en-US", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(new Date(subscription.current_period_end))}
                , so no days are lost.
              </p>
            )}
            <p className="text-center text-[11px] text-neutral-500">
              Payments are processed securely by Midtrans.
            </p>
          </CardFooter>
        </Card>
      </div>
    </CheckoutShell>
  );
}

function CheckoutShell({ children }: { children: React.ReactNode }) {
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
      <h1 className="mt-8 text-center text-[24px] text-neutral-50">Checkout</h1>
      <p className="mt-1 text-[13px] text-neutral-500">
        <Link
          to="/pricing"
          className="underline-offset-4 hover:text-neutral-300 hover:underline"
        >
          ← Back to plans
        </Link>
      </p>
      {children}
    </div>
  );
}
