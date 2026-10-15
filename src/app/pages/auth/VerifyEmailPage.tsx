import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { CheckCircle2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/cossui/button";
import { Input } from "@/components/cossui/input";
import { useAuth } from "../../auth/AuthContext";
import { resendVerification } from "../../utils/supabase";
import { AuthShell } from "./AuthShell";
import { useLang } from "../../i18n";

export function VerifyEmailPage() {
  const { t } = useLang();
  const { user } = useAuth();
  const location = useLocation();
  const stateEmail = (location.state as { email?: string } | null)?.email ?? "";
  // Prefill from navigation state, but allow typing so a refresh or direct
  // open doesn't strand the user with no resend address.
  const [email, setEmail] = useState(stateEmail);
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const tmr = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(tmr);
  }, [cooldown]);

  // Only a confirmed email counts as verified — a mere session (e.g. an
  // unconfirmed sign-in) must not show the success screen.
  if (user?.email_confirmed_at) {
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
    if (!email.trim()) {
      toast.error(t("auth.noEmailFound"));
      return;
    }
    setSending(true);
    try {
      const { error } = await resendVerification(email.trim());
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(t("auth.verificationEmailSent"));
      setCooldown(30);
    } finally {
      setSending(false);
    }
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
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          autoComplete="email"
          className="w-full"
        />
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