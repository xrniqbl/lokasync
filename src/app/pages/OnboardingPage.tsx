import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/cossui/button";
import { useLang } from "../LangContext";
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
import { useAuth } from "../auth/AuthContext";
import { FullScreenLoader } from "../auth/guards";
import { ensureWorkspace, saveProfile } from "../utils/api";
import { supabase } from "../utils/supabase";
import { AuthShell } from "./auth/AuthShell";

export function OnboardingPage() {
  const { session, profile, profileLoading, setProfile } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (profileLoading) return <FullScreenLoader />;

  // Profile already complete — nothing to onboard
  if (profile) {
    return <Navigate to="/app/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setSubmitting(true);
    try {
      const saved = await saveProfile(session.access_token, {
        full_name: fullName.trim(),
        phone: `+62${phone.trim()}`,
        job_title: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
      });
      // Best-effort mirror so auth metadata (used for sidebar display) matches
      void supabase.auth.updateUser({
        data: {
          full_name: saved.full_name,
          phone: saved.phone,
          job_title: saved.job_title,
          company: saved.company,
        },
      });
      // Provision the user's workspace now so it has a meaningful name on
      // first entry instead of the server-side default. Best-effort: if this
      // fails, AppLayout's mount guard will retry provision with a fallback.
      try {
        await ensureWorkspace({
          name: (company.trim() || `${saved.full_name}'s Workspace`).slice(0, 80),
        });
      } catch (wsErr: unknown) {
        // An invited user has no workspace of their own — send them to accept
        // the invitation instead of provisioning a stray solo workspace.
        if (wsErr && typeof wsErr === "object" && "code" in wsErr && wsErr.code === "pending_invite" && "token" in wsErr) {
          setProfile(saved);
          navigate(`/join/${wsErr.token as string}`, { replace: true });
          return;
        }
        // Otherwise non-fatal — Layer 2 in AppLayout retries with a server default.
      }
      setProfile(saved);
      toast.success(t("onboarding.welcome"));
      navigate("/app/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Complete your profile"
      description="One last step before you enter your workspace"
    >
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
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="81234567890"
              autoComplete="tel-national"
              pattern="[0-9]{7,13}"
              title="7-13 digits, without the leading 0"
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
        <Button type="submit" loading={submitting} className="w-full">
          Continue to dashboard
        </Button>
      </form>
    </AuthShell>
  );
}
