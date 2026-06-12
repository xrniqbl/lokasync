import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { AlertCircle, ArrowLeft } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/cossui/alert";
import { Button } from "@/components/cossui/button";
import { Checkbox } from "@/components/cossui/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/cossui/field";
import { Input } from "@/components/cossui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/cossui/input-group";
import { Label } from "@/components/cossui/label";
import { signUpWithEmail } from "../../utils/supabase";
import { AuthShell } from "./AuthShell";
import { PasswordInput } from "./PasswordInput";

function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++;
  return score as 0 | 1 | 2 | 3;
}

const strengthMeta = [
  { label: "", color: "" },
  { label: "Weak", color: "#ef4444" },
  { label: "Fair", color: "#f59e0b" },
  { label: "Strong", color: "#10b981" },
];

function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500">
      {[1, 2].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`flex size-5 items-center justify-center rounded-full text-[10px] ${
              step >= s
                ? "bg-[#fafafa] text-[#0f0f0f]"
                : "border border-neutral-700 text-neutral-500"
            }`}
          >
            {s}
          </div>
          <span className={step === s ? "text-neutral-300" : ""}>
            {s === 1 ? "Account" : "Your details"}
          </span>
          {s === 1 && <div className="h-px w-6 bg-neutral-800" />}
        </div>
      ))}
    </div>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);

  // Step 2
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const strength = passwordStrength(password);

  const handleStepOne = (e: FormEvent) => {
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
    if (!agreed) {
      setError("You must agree to the Terms of Service to continue.");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { data, error: signUpError } = await signUpWithEmail(
      email,
      password,
      {
        full_name: fullName.trim(),
        phone: phone.trim() ? `+62${phone.trim()}` : "",
        job_title: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
      },
    );
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    // Supabase returns a user with no identities when the email is already registered
    if (data.user && data.user.identities?.length === 0) {
      setError("This email is already registered. Try signing in instead.");
      return;
    }
    if (data.session) {
      navigate("/app/dashboard", { replace: true });
    } else {
      navigate("/verify-email", { state: { email }, replace: true });
    }
  };

  return (
    <AuthShell
      title="Create your account"
      description={
        step === 1
          ? "Start managing your projects in minutes"
          : "Tell us a bit about yourself"
      }
      footer={
        <span>
          Already have an account?{" "}
          <Link to="/login" className="text-[#fafafa] hover:underline">
            Sign in
          </Link>
        </span>
      }
    >
      <StepIndicator step={step} />

      {error && (
        <Alert variant="error">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Could not continue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === 1 ? (
        <form onSubmit={handleStepOne} className="flex flex-col gap-4">
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
            <FieldLabel>Password</FieldLabel>
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              required
            />
            {password && (
              <div className="flex w-full items-center gap-2">
                <div className="flex h-1 flex-1 gap-1">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full"
                      style={{
                        backgroundColor:
                          strength >= i ? strengthMeta[strength].color : "#262626",
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs text-neutral-500">
                  {strengthMeta[strength].label}
                </span>
              </div>
            )}
            <FieldDescription>Minimum 8 characters.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Confirm password</FieldLabel>
            <PasswordInput
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              required
            />
          </Field>
          <div className="flex items-start gap-2">
            <Checkbox
              id="terms"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
            />
            <Label htmlFor="terms" className="text-xs text-neutral-400">
              <span>
                I agree to the{" "}
                <Link
                  to="/terms"
                  target="_blank"
                  className="text-neutral-200 underline underline-offset-2 hover:text-white"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  to="/privacy"
                  target="_blank"
                  className="text-neutral-200 underline underline-offset-2 hover:text-white"
                >
                  Privacy Policy
                </Link>
              </span>
            </Label>
          </div>
          <Button type="submit" className="w-full">
            Continue
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Full name</FieldLabel>
            <Input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              autoComplete="name"
              required
            />
          </Field>
          <Field>
            <FieldLabel>Phone number</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>+62</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                type="tel"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="81234567890"
                autoComplete="tel-national"
                required
              />
            </InputGroup>
            <FieldDescription>
              Used for billing and payment receipts.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>
              Job title{" "}
              <span className="font-normal text-neutral-500">(optional)</span>
            </FieldLabel>
            <Input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Product Manager"
              autoComplete="organization-title"
            />
          </Field>
          <Field>
            <FieldLabel>
              Company or team{" "}
              <span className="font-normal text-neutral-500">(optional)</span>
            </FieldLabel>
            <Input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Inc."
              autoComplete="organization"
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              aria-label="Back to previous step"
            >
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
            <Button type="submit" loading={submitting} className="flex-1">
              Create account
            </Button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
