import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/cossui/alert";
import { Button } from "@/components/cossui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/cossui/field";
import { useAuth } from "../../auth/AuthContext";
import { FullScreenLoader } from "../../auth/guards";
import { updatePassword } from "../../utils/supabase";
import { AuthShell } from "./AuthShell";
import { PasswordInput } from "./PasswordInput";
import { useLang } from "../../i18n";

export function ResetPasswordPage() {
  const { t } = useLang();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <FullScreenLoader />;

  if (!user) {
    return (
      <AuthShell
        title={t("auth.linkExpired")}
        description={t("auth.resetLinkInvalid")}
        footer={
          <Link to="/login" className="text-[#fafafa] hover:underline">
            {t("auth.backToSignIn")}
          </Link>
        }
      >
        <p className="text-center text-sm text-neutral-400">
          {t("auth.requestNewLink")}{" "}
          <Link to="/forgot-password" className="text-[#fafafa] underline">
            {t("auth.forgotPasswordPage")}
          </Link>{" "}
          {t("auth.pageNotFound")}.
        </p>
      </AuthShell>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError(t("auth.passwordMin8"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await updatePassword(password);
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    toast.success(t("auth.passwordUpdatedSuccess"));
    navigate("/app/dashboard", { replace: true });
  };

  return (
    <AuthShell
      title={t("auth.setNewPassword")}
      description={t("auth.updatingPasswordFor").replace("{email}", user.email ?? t("settings.account"))}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <Alert variant="error">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{t("auth.couldNotUpdatePassword")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel>{t("auth.newPassword")}</FieldLabel>
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
          />
          <FieldDescription>{t("auth.minimum8Chars")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>{t("auth.confirmNewPassword")}</FieldLabel>
          <PasswordInput
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            required
          />
        </Field>
        <Button type="submit" loading={submitting} className="w-full">
          {t("auth.updatePassword")}
        </Button>
      </form>
    </AuthShell>
  );
}