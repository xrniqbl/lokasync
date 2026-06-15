import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { CheckCircle2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/cossui/button";
import { useAuth } from "../../auth/AuthContext";
import { resendVerification } from "../../utils/supabase";
import { AuthShell } from "./AuthShell";
import { useLang } from "../../LangContext";

export function VerifyEmailPage() {
  const { t } = useLang();
  const { user } = useAuth();
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email ?? "";
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const tmr = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(tmr);
  }, [cooldown]);

  if (user) {
    return (
      <AuthShell
        title={t("auth.emailVerified")}
        description={t("auth.accountReady")}
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <CheckCircle2 className="size-10 text-emerald-500" aria-hidden="true" />
          <p className="text-sm text-neutral-400">
            {t("auth.thanksForConfirming")}
          </p>
          <Button
            render={<Link to="/app/dashboard" />}
            className="w-full"
          >
            {t("auth.goToDashboard")}
          </Button>
        </div>
      </AuthShell>
    );
  }

  const handleResend = async () => {
    if (!email) {
      toast.error(t("auth.noEmailFound"));
      return;
    }
    setSending(true);
    const { error } = await resendVerification(email);
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("auth.verificationEmailSent"));
    setCooldown(30);
  };

  return (
    <AuthShell
      title={t("auth.checkYourInbox")}
      description={t("auth.weSentVerificationLink")}
      footer={
        <span>
          {t("auth.wrongAccount")}{" "}
          <Link to="/register" className="text-[#fafafa] hover:underline">
            {t("auth.registerAgain")}
          </Link>{" "}
          or{" "}
          <Link to="/login" className="text-[#fafafa] hover:underline">
            {t("auth.signIn")}
          </Link>
        </span>
      }
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <MailCheck className="size-10 text-neutral-400" aria-hidden="true" />
        <p className="text-sm text-neutral-400">
          {t("auth.verificationLinkSent").replace("{email}", email || t("settings.email"))}
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          loading={sending}
          disabled={cooldown > 0}
          onClick={handleResend}
        >
          {cooldown > 0
            ? t("auth.resendIn").replace("{seconds}", String(cooldown))
            : t("auth.resendEmail")}
        </Button>
      </div>
    </AuthShell>
  );
}