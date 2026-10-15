import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
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
import { useLang } from "../../i18n";

export function LoginPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // Preserve deep links: location.state.from is a Location (pathname+search+hash);
  // the api 401 redirect passes ?from=<encoded target> as a fallback.
  const stateFrom = (location.state as { from?: { pathname: string; search?: string; hash?: string } } | null)?.from;
  const from =
    (stateFrom
      ? `${stateFrom.pathname}${stateFrom.search ?? ""}${stateFrom.hash ?? ""}`
      : null) ?? searchParams.get("from") ?? undefined;

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
    try {
      const { error: signInError } = await signInWithEmail(email, password);

      if (signInError) {
        // Prefer structured code/status; fall back to message matching for
        // providers that only send human-readable errors.
        const code = (signInError as { code?: string; status?: number }).code ?? "";
        const status = (signInError as { status?: number }).status;
        const msg = signInError.message ?? "";
        if (
          code === "email_not_confirmed" ||
          status === 401 && /email not confirmed/i.test(msg) ||
          /email not confirmed/i.test(msg)
        ) {
          setUnconfirmed(true);
        } else if (
          code === "invalid_credentials" ||
          status === 400 && /invalid login credentials/i.test(msg) ||
          /invalid login credentials/i.test(msg)
        ) {
          setError(t("auth.incorrectCredentials"));
        } else {
          setError(msg);
        }
        return;
      }
      navigate(from ?? "/app/dashboard", { replace: true });
    } finally {
      setSubmitting(false);
    }
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