import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AlertCircle, MailCheck } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/cossui/alert";
import { Button } from "@/components/cossui/button";
import { Field, FieldLabel } from "@/components/cossui/field";
import { Input } from "@/components/cossui/input";
import { resetPassword } from "../../utils/supabase";
import { AuthShell } from "./AuthShell";
import { useLang } from "../../LangContext";

export function ForgotPasswordPage() {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error: resetError } = await resetPassword(email);
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell
        title={t("auth.checkYourInbox")}
        description={t("auth.passwordResetLinkSent")}
        footer={
          <Link to="/login" className="text-[#fafafa] hover:underline">
            {t("auth.backToSignIn")}
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <MailCheck className="size-10 text-neutral-400" aria-hidden="true" />
          <p className="text-sm text-neutral-400">
            {t("auth.resetLinkInstructions").replace("{email}", email)}
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth.forgotYourPassword")}
      description={t("auth.enterEmailResetLink")}
      footer={
        <Link to="/login" className="text-[#fafafa] hover:underline">
          {t("auth.backToSignIn")}
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <Alert variant="error">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{t("auth.somethingWentWrong")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel>{t("settings.email")}</FieldLabel>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            autoComplete="email"
            required
          />
        </Field>
        <Button type="submit" loading={submitting} className="w-full">
          {t("auth.sendResetLink")}
        </Button>
      </form>
    </AuthShell>
  );
}