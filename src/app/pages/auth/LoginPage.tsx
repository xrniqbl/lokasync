import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AlertCircle } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/cossui/alert";
import { Button } from "@/components/cossui/button";
import { Field, FieldLabel } from "@/components/cossui/field";
import { Input } from "@/components/cossui/input";
import { signInWithEmail } from "../../utils/supabase";
import { AuthShell } from "./AuthShell";
import { PasswordInput } from "./PasswordInput";
import { useLang } from "../../LangContext";

export function LoginPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from
    ?.pathname;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setUnconfirmed(false);
    setSubmitting(true);
    const { error: signInError } = await signInWithEmail(email, password);
    setSubmitting(false);

    if (signInError) {
      if (/email not confirmed/i.test(signInError.message)) {
        setUnconfirmed(true);
      } else if (/invalid login credentials/i.test(signInError.message)) {
        setError(t("auth.incorrectCredentials"));
      } else {
        setError(signInError.message);
      }
      return;
    }
    navigate(from ?? "/app/dashboard", { replace: true });
  };

  return (
    <AuthShell
      title={t("auth.welcomeBack")}
      description={t("auth.signInDescription")}
      footer={
        <span>
          {t("auth.dontHaveAccount")}{" "}
          <Link to="/register" className="text-[#fafafa] hover:underline">
            {t("auth.signUp")}
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <Alert variant="error">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{t("auth.signInFailed")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {unconfirmed && (
          <Alert variant="warning">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{t("auth.emailNotVerified")}</AlertTitle>
            <AlertDescription>
              {t("auth.pleaseVerifyEmail")}{" "}
              <Link
                to="/verify-email"
                state={{ email }}
                className="underline"
              >
                {t("auth.resendVerification")}
              </Link>
            </AlertDescription>
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
        <Field>
          <div className="flex w-full items-center justify-between">
            <FieldLabel>{t("settings.newPassword")}</FieldLabel>
            <Link
              to="/forgot-password"
              className="text-xs text-neutral-400 hover:text-[#fafafa] hover:underline"
            >
              {t("auth.forgotYourPassword")}
            </Link>
          </div>
          <PasswordInput value={password} onChange={setPassword} required />
        </Field>
        <Button type="submit" loading={submitting} className="w-full">
          {t("auth.signIn")}
        </Button>
      </form>
    </AuthShell>
  );
}