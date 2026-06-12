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

export function LoginPage() {
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
        setError("Incorrect email or password. Please try again.");
      } else {
        setError(signInError.message);
      }
      return;
    }
    navigate(from ?? "/app/dashboard", { replace: true });
  };

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to your workspace"
      footer={
        <span>
          Don&apos;t have an account?{" "}
          <Link to="/register" className="text-[#fafafa] hover:underline">
            Sign up
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <Alert variant="error">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Sign in failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {unconfirmed && (
          <Alert variant="warning">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Email not verified</AlertTitle>
            <AlertDescription>
              Please verify your email first.{" "}
              <Link
                to="/verify-email"
                state={{ email }}
                className="underline"
              >
                Resend verification
              </Link>
            </AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel>Email</FieldLabel>
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
            <FieldLabel>Password</FieldLabel>
            <Link
              to="/forgot-password"
              className="text-xs text-neutral-400 hover:text-[#fafafa] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput value={password} onChange={setPassword} required />
        </Field>
        <Button type="submit" loading={submitting} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
