import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CheckCircle2, Clock, HelpCircle, XCircle } from "lucide-react";
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
import { useAuth } from "../auth/AuthContext";
import { useSubscription } from "../subscription/SubscriptionContext";
import { getPaymentStatus, type ApiError, type PaymentStatusResult } from "../utils/api";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const BASE_POLL_MS = 4000;
const MAX_POLL_MS = 15000;
const MAX_POLLS = 30;

export function PaymentStatusPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order_id");
  const { session } = useAuth();
  const { refresh: refreshSubscription } = useSubscription();
  const navigate = useNavigate();

  const [result, setResult] = useState<PaymentStatusResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [pollCapped, setPollCapped] = useState(false);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const timer = useRef<number>();
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!orderId || !session) return;
    let cancelled = false;
    attemptsRef.current = 0;
    setPollCapped(false);
    setNotFound(false);
    setNeedsLogin(false);

    const delayForAttempt = (attempt: number) =>
      Math.min(MAX_POLL_MS, BASE_POLL_MS * 2 ** Math.max(0, attempt - 1));

    const schedule = () => {
      if (cancelled || document.hidden) return;
      if (attemptsRef.current >= MAX_POLLS) {
        setPollCapped(true);
        return;
      }
      timer.current = window.setTimeout(poll, delayForAttempt(attemptsRef.current));
    };

    const poll = async () => {
      if (cancelled) return;
      attemptsRef.current += 1;
      try {
        const status = await getPaymentStatus(session.access_token, orderId);
        if (cancelled) return;
        setResult(status);
        if (status.status === "pending") {
          if (attemptsRef.current >= MAX_POLLS) setPollCapped(true);
          else schedule();
        } else if (status.status === "paid") {
          // Plan changed — make gated pages pick it up without a reload
          void refreshSubscription();
        }
      } catch (err) {
        if (cancelled) return;
        const status = (err as ApiError)?.status;
        if (status === 404 || status === 403) setNotFound(true);
        else if (status === 401) setNeedsLogin(true);
        else if (attemptsRef.current >= MAX_POLLS) setPollCapped(true);
        else schedule();
      }
    };
    poll();

    const onVisibilityChange = () => {
      if (!document.hidden) {
        // Resume polling when the tab becomes visible again.
        window.clearTimeout(timer.current);
        schedule();
      } else {
        window.clearTimeout(timer.current);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, session, manualRefreshKey]);

  if (needsLogin) {
    return (
      <Shell>
        <Card className="mt-10 w-full max-w-md border-neutral-800 bg-[#1a1a1a]">
          <CardHeader className="items-center text-center">
            <XCircle className="size-10 text-neutral-500" />
            <CardTitle className="text-neutral-50">Please sign in again</CardTitle>
            <CardDescription className="text-neutral-400">
              Your session expired. Please re-login to check this payment.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" onClick={() => navigate("/login")}>
              Back to login
            </Button>
          </CardFooter>
        </Card>
      </Shell>
    );
  }

  if (!orderId || notFound) {
    return (
      <Shell>
        <Card className="mt-10 w-full max-w-md border-neutral-800 bg-[#1a1a1a]">
          <CardHeader className="items-center text-center">
            <XCircle className="size-10 text-neutral-500" />
            <CardTitle className="text-neutral-50">Order not found</CardTitle>
            <CardDescription className="text-neutral-400">
              We couldn't find this payment. It may belong to another account.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" onClick={() => navigate("/pricing")}>
              Back to plans
            </Button>
          </CardFooter>
        </Card>
      </Shell>
    );
  }

  if (!result) {
    return (
      <Shell>
        <Spinner className="mt-16 size-6 text-neutral-400" />
      </Shell>
    );
  }

  const presets = {
    paid: {
      icon: <CheckCircle2 className="size-10 text-emerald-400" />,
      title: "Payment successful",
      description: `Your ${result.plan_name} plan is now active. Welcome aboard!`,
    },
    pending: {
      icon: <Clock className="size-10 text-amber-400" />,
      title: "Waiting for your payment",
      description:
        "Complete the payment with your chosen method. This page updates automatically once the payment is confirmed.",
    },
    failed: {
      icon: <XCircle className="size-10 text-red-400" />,
      title: "Payment unsuccessful",
      description:
        "The payment was cancelled, declined, or expired. No charge was made — you can try again.",
    },
    unknown: {
      icon: <HelpCircle className="size-10 text-neutral-400" />,
      title: "Unknown status",
      description: "Unknown status — refresh to check the latest payment status.",
    },
  } as const;
  const preset = (presets as Record<string, { icon: React.ReactNode; title: string; description: string }>)[result.status] ?? presets.unknown;

  return (
    <Shell>
      <Card className="mt-10 w-full max-w-md border-neutral-800 bg-[#1a1a1a]">
        <CardHeader className="items-center text-center">
          {preset.icon}
          <CardTitle className="text-neutral-50">{preset.title}</CardTitle>
          <CardDescription className="text-neutral-400">
            {preset.description}
          </CardDescription>
        </CardHeader>
        <CardPanel className="flex flex-col gap-2 text-[13px]">
          <div className="flex justify-between text-neutral-400">
            <span>Order</span>
            <span className="text-neutral-300">{result.order_id}</span>
          </div>
          <div className="flex justify-between text-neutral-400">
            <span>Plan</span>
            <span className="text-neutral-300">
              {result.plan_name} · {result.interval}
            </span>
          </div>
          {result.payment_type && (
            <div className="flex justify-between text-neutral-400">
              <span>Method</span>
              <span className="text-neutral-300">
                {result.payment_type.replaceAll("_", " ")}
              </span>
            </div>
          )}
          <Separator className="my-1 bg-neutral-800" />
          <div className="flex justify-between text-[14px] text-neutral-50">
            <span>Total</span>
            <span>{idr.format(result.gross_amount)}</span>
          </div>
          {result.status === "pending" && !pollCapped && (
            <p className="mt-2 flex items-center gap-2 text-[12px] text-neutral-500">
              <Spinner className="size-3.5" /> Checking payment status…
            </p>
          )}
          {result.status === "pending" && pollCapped && (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-[12px] text-neutral-500">
                Still processing — check back in a bit. You can also refresh manually.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  attemptsRef.current = 0;
                  setPollCapped(false);
                  setManualRefreshKey((k) => k + 1);
                }}
              >
                Refresh
              </Button>
            </div>
          )}
        </CardPanel>
        <CardFooter className="flex-col gap-2">
          {result.status === "failed" ? (
            <Button
              className="w-full"
              onClick={() =>
                navigate(
                  `/checkout/${result.plan_id}?interval=${result.interval}`,
                )
              }
            >
              Try again
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={() => navigate("/app/dashboard")}
            >
              Go to dashboard
            </Button>
          )}
          {result.status === "pending" && (
            <Link
              to="/app/dashboard"
              className="text-[12px] text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline"
            >
              I'll finish this later
            </Link>
          )}
        </CardFooter>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="dark flex min-h-screen w-full flex-col items-center bg-[#0f0f0f] px-4 py-12"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <Link to="/" aria-label="Indologic home">
        <span className="text-lg font-bold tracking-[0.08em] text-[#fafafa]">
          INDOLOGIC
        </span>
      </Link>
      {children}
    </div>
  );
}
