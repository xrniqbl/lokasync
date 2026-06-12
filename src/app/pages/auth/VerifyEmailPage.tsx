import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { CheckCircle2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/cossui/button";
import { useAuth } from "../../auth/AuthContext";
import { resendVerification } from "../../utils/supabase";
import { AuthShell } from "./AuthShell";

export function VerifyEmailPage() {
  const { user } = useAuth();
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email ?? "";
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // The confirmation link redirects back here; once Supabase picks up the
  // session from the URL, the account is verified.
  if (user) {
    return (
      <AuthShell
        title="Email verified"
        description="Your account is ready to use"
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <CheckCircle2 className="size-10 text-emerald-500" aria-hidden="true" />
          <p className="text-sm text-neutral-400">
            Thanks for confirming your email. You can now start using your
            workspace.
          </p>
          <Button
            render={<Link to="/app/dashboard" />}
            className="w-full"
          >
            Go to dashboard
          </Button>
        </div>
      </AuthShell>
    );
  }

  const handleResend = async () => {
    if (!email) {
      toast.error("No email address found. Please sign in or register again.");
      return;
    }
    setSending(true);
    const { error } = await resendVerification(email);
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Verification email sent");
    setCooldown(30);
  };

  return (
    <AuthShell
      title="Check your inbox"
      description="We sent you a verification link"
      footer={
        <span>
          Wrong account?{" "}
          <Link to="/register" className="text-[#fafafa] hover:underline">
            Register again
          </Link>{" "}
          or{" "}
          <Link to="/login" className="text-[#fafafa] hover:underline">
            sign in
          </Link>
        </span>
      }
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <MailCheck className="size-10 text-neutral-400" aria-hidden="true" />
        <p className="text-sm text-neutral-400">
          We sent a verification link to{" "}
          <span className="text-[#fafafa]">{email || "your email"}</span>.
          Click the link in the email to activate your account.
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          loading={sending}
          disabled={cooldown > 0}
          onClick={handleResend}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
        </Button>
      </div>
    </AuthShell>
  );
}
