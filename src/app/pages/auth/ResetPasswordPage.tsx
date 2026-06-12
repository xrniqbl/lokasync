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

export function ResetPasswordPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <FullScreenLoader />;

  // The recovery link signs the user in; without that session this page
  // cannot change a password.
  if (!user) {
    return (
      <AuthShell
        title="Link expired"
        description="This password reset link is invalid or has expired"
        footer={
          <Link to="/login" className="text-[#fafafa] hover:underline">
            Back to sign in
          </Link>
        }
      >
        <p className="text-center text-sm text-neutral-400">
          Request a new link from the{" "}
          <Link to="/forgot-password" className="text-[#fafafa] underline">
            forgot password
          </Link>{" "}
          page.
        </p>
      </AuthShell>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await updatePassword(password);
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    toast.success("Password updated successfully");
    navigate("/app/dashboard", { replace: true });
  };

  return (
    <AuthShell
      title="Set a new password"
      description={`Updating password for ${user.email ?? "your account"}`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <Alert variant="error">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Could not update password</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel>New password</FieldLabel>
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
          />
          <FieldDescription>Minimum 8 characters.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Confirm new password</FieldLabel>
          <PasswordInput
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            required
          />
        </Field>
        <Button type="submit" loading={submitting} className="w-full">
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
