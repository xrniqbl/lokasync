import { logger } from "../utils/logger";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { CheckCircle2, Clock, CreditCard, XCircle } from "lucide-react";
import { LokaLogo } from "../components/LokaLogo";
import { useLang } from "../LangContext";
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
import { getPaymentStatus, type PaymentStatusResult } from "../utils/api";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const BASE_POLL_MS = 4000;
const MAX_RETRIES = 30; // ~2 minutes at base interval with backoff

/** Load Midtrans Snap.js dynamically. */
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

export function PaymentStatusPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order_id");
  const { session } = useAuth();
  const { t } = useLang();
  const { refresh: refreshSubscription } = useSubscription();
  const navigate = useNavigate();

  const [result, setResult] = useState<PaymentStatusResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [openingSnap, setOpeningSnap] = useState(false);
  const [takingTooLong, setTakingTooLong] = useState(false);
  const timer = useRef<number>();

  const handleCompletePayment = async () => {
    if (!result?.snap_token || !result?.client_key) {
      toast.error(t("checkout.paymentExpired"));
      navigate(`/checkout/${result?.plan_id}?interval=${result?.interval}`);
      return;
    }
    setOpeningSnap(true);
    try {
      await loadSnap(result.client_key, result.is_production ?? false);
      window.snap!.pay(result.snap_token, {
        onSuccess: () => {
          toast.success(t("checkout.paymentSuccess"));
          refreshSubscription();
          setResult((prev) => prev ? { ...prev, status: "paid" } : prev);
        },
        onPending: () => toast.info(t("payment.processingToast")),
        onError: () => toast.error(t("checkout.paymentFailed")),
        onClose: () => {},
      });
    } catch (e) {
      logger.error("app", "Failed to open Snap:", e);
      toast.error(t("checkout.couldNotOpen"));
    } finally {
      setOpeningSnap(false);
    }
  };

  useEffect(() => {
    if (!orderId || !session) return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      try {
        const status = await getPaymentStatus(session.access_token, orderId);
        if (cancelled) return;
        setResult(status);
        if (status.status === "pending") {
          attempts++;
          if (attempts >= MAX_RETRIES) {
            setTakingTooLong(true);
            return;
          }
          const delay = Math.min(BASE_POLL_MS * Math.pow(1.5, attempts), 30000);
          timer.current = window.setTimeout(poll, delay);
        } else if (status.status === "paid") {
          void refreshSubscription();
        }
      } catch (err) {
        if (cancelled) return;
        if (String(err).includes("404")) { setNotFound(true); return; }
        attempts++;
        if (attempts >= MAX_RETRIES) {
          setTakingTooLong(true);
          return;
        }
        const delay = Math.min(BASE_POLL_MS * Math.pow(1.5, attempts), 30000);
        timer.current = window.setTimeout(poll, delay);
      }
    };
    poll();

    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [orderId, session]);

  if (!orderId || notFound) {
    return (
      <Shell>
        <Card className="mt-10 w-full max-w-md border-neutral-800 bg-[#1a1a1a]">
          <CardHeader className="items-center text-center">
            <XCircle className="size-10 text-neutral-500" />
            <CardTitle className="text-neutral-50">{t("payment.orderNotFoundTitle")}</CardTitle>
            <CardDescription className="text-neutral-400">
              {t("payment.orderNotFoundDesc")}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" onClick={() => navigate("/pricing")}>
              {t("payment.backToPlans")}
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
      title: t("payment.paidTitle"),
      description: t("payment.paidDesc").replace("{plan}", result.plan_name),
    },
    pending: {
      icon: <Clock className="size-10 text-amber-400" />,
      title: t("payment.pendingTitle"),
      description: t("payment.pendingDesc"),
    },
    failed: {
      icon: <XCircle className="size-10 text-red-400" />,
      title: t("payment.failedTitle"),
      description: t("payment.failedDesc"),
    },
  } as const;
  const preset = presets[result.status];

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
            <span>{t("payment.order")}</span>
            <span className="text-neutral-300">{result.order_id}</span>
          </div>
          <div className="flex justify-between text-neutral-400">
            <span>{t("payment.plan")}</span>
            <span className="text-neutral-300">
              {result.plan_name} · {result.interval}
            </span>
          </div>
          {result.payment_type && (
            <div className="flex justify-between text-neutral-400">
              <span>{t("payment.method")}</span>
              <span className="text-neutral-300">
                {result.payment_type.replaceAll("_", " ")}
              </span>
            </div>
          )}
          <Separator className="my-1 bg-neutral-800" />
          <div className="flex justify-between text-[14px] text-neutral-50">
            <span>{t("payment.total")}</span>
            <span>{idr.format(result.gross_amount)}</span>
          </div>
          {result.status === "pending" && !takingTooLong && (
            <p className="mt-2 flex items-center gap-2 text-[12px] text-neutral-500">
              <Spinner className="size-3.5" /> {t("payment.checkingStatus")}
            </p>
          )}
          {result.status === "pending" && takingTooLong && (
            <p className="mt-2 text-[12px] text-amber-400">
              {t("payment.takingTooLong")}
            </p>
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
              {t("payment.tryAgain")}
            </Button>
          ) : result.status === "pending" && result.snap_token ? (
            <>
              <Button
                className="w-full"
                loading={openingSnap}
                onClick={handleCompletePayment}
              >
                <CreditCard className="mr-1.5 size-4" />
                {t("payment.completePayment")}
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => navigate("/app/dashboard")}
              >
                {t("auth.goToDashboard")}
              </Button>
            </>
          ) : (
            <Button
              className="w-full"
              onClick={() => navigate("/app/dashboard")}
            >
              {t("auth.goToDashboard")}
            </Button>
          )}
          {result.status === "pending" && (
            <Link
              to="/app/dashboard"
              className="text-[12px] text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline"
            >
              {t("payment.finishLater")}
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
      <LokaLogo size="md" />
      {children}
    </div>
  );
}
