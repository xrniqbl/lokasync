import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/cossui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/cossui/card";
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
import { Separator } from "@/components/cossui/separator";
import { useAuth } from "../auth/AuthContext";
import { useSubscription } from "../subscription/SubscriptionContext";
import { useNavigation } from "./NavigationContext";
import { supabase, updatePassword } from "../utils/supabase";
import * as api from "../utils/api";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useRealtimeWorkspace } from "../realtime";
import { PasswordInput } from "../pages/auth/PasswordInput";
import { useLang } from "../i18n";

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "·"
  );
}

export function ProfilePage() {
  const { t } = useLang();
  const { user, session, profile, setProfile } = useAuth();
  const { plan } = useSubscription();
  const { subSection, navigate } = useNavigation();
  const securityRef = useRef<HTMLDivElement>(null);

  const meta = (user?.user_metadata ?? {}) as Record<string, string>;
  const [fullName, setFullName] = useState(
    profile?.full_name ?? meta.full_name ?? "",
  );
  const [phone, setPhone] = useState(
    (profile?.phone ?? meta.phone ?? "").replace(/^\+62/, ""),
  );
  const [jobTitle, setJobTitle] = useState(
    profile?.job_title ?? meta.job_title ?? "",
  );
  const [company, setCompany] = useState(
    profile?.company ?? meta.company ?? "",
  );
  const [saving, setSaving] = useState(false);

  const { activeWorkspace } = useWorkspace();
  useRealtimeWorkspace(activeWorkspace?.id ?? null, (table) => {
    if (table === "profiles") {
      api.getSettings("profile").then((data) => {
        if (data) setProfile(data);
      }).catch((e) => console.log("Realtime profile refresh error:", e));
    }
  });

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    if (subSection === "security") {
      securityRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [subSection]);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error(t("profile.fullNameRequired"));
      return;
    }
    if (!phone.trim()) {
      toast.error(t("profile.phoneRequired"));
      return;
    }
    if (!session) return;
    setSaving(true);

    let saved: api.Profile;
    try {
      saved = await api.saveProfile(session.access_token, {
        full_name: fullName.trim(),
        phone: `+62${phone.trim()}`,
        job_title: jobTitle.trim(),
        company: company.trim(),
      });
    } catch (err) {
      setSaving(false);
      toast.error(err instanceof Error ? err.message : t("profile.failedToSaveProfile"));
      return;
    }
    setProfile(saved);

    // Best-effort mirrors: auth metadata (sidebar display) + legacy settings store
    void supabase.auth.updateUser({
      data: {
        full_name: saved.full_name,
        phone: saved.phone,
        job_title: saved.job_title,
        company: saved.company,
      },
    });
    try {
      const [firstName, ...rest] = saved.full_name.split(/\s+/);
      const existing = await api.getSettings("profile").catch(() => ({}));
      await api.saveSettings("profile", {
        ...existing,
        firstName,
        lastName: rest.join(" "),
        email: user?.email ?? "",
        phone: saved.phone,
        jobTitle: saved.job_title,
        company: saved.company,
      });
    } catch {
      // best-effort mirror; the KV profile is the source of truth
    }
    setSaving(false);
    toast.success(t("profile.profileUpdated"));
  };

  const handleUpdatePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error(t("profile.passwordMin8"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("profile.passwordsDoNotMatch"));
      return;
    }
    setUpdatingPassword(true);
    const { error } = await updatePassword(newPassword);
    setUpdatingPassword(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    toast.success(t("profile.passwordUpdated"));
  };

  return (
    <div
      className="dark h-full overflow-y-auto bg-[#0f0f0f]"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8 lg:px-10">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-indigo-900/60 text-[18px] text-indigo-300">
            {initialsOf(fullName || meta.full_name || "")}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[18px] text-neutral-50">
              {fullName || t("profile.yourProfile")}
            </h1>
            <p className="truncate text-[13px] text-neutral-500">
              {user?.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/app/billing")}
            className="shrink-0 rounded-full border border-neutral-700 px-3 py-1 text-[11px] text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-100"
          >
            {t("profile.planLabel").replace("{plan}", plan.name)}
          </button>
        </div>

        <Separator className="bg-neutral-800" />

        {/* Profile details */}
        <Card className="border-neutral-800 bg-[#1a1a1a]" id="details">
          <CardHeader>
            <CardTitle className="text-neutral-50">{t("profile.profileDetails")}</CardTitle>
            <CardDescription className="text-neutral-400">
              {t("profile.profileDetailsDesc")}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSaveProfile}>
            <CardPanel className="flex flex-col gap-4">
              <Field>
                <FieldLabel>{t("profile.fullName")}</FieldLabel>
                <Input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </Field>
              <Field>
                <FieldLabel>{t("profile.email")}</FieldLabel>
                <Input type="email" value={user?.email ?? ""} disabled />
                <FieldDescription>
                  {t("profile.emailCannotChange")}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{t("profile.phoneNumber")}</FieldLabel>
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
                    pattern="[0-9]{7,13}"
                    title="7-13 digits, without the leading 0"
                    required
                  />
                </InputGroup>
                <FieldDescription>
                  {t("profile.usedForBilling")}
                </FieldDescription>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>
                    {t("profile.jobTitle")}{" "}
                    <span className="font-normal text-neutral-500">
                      {t("profile.optional")}
                    </span>
                  </FieldLabel>
                  <Input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Product Manager"
                  />
                </Field>
                <Field>
                  <FieldLabel>
                    {t("profile.companyOrTeam")}{" "}
                    <span className="font-normal text-neutral-500">
                      {t("profile.optional")}
                    </span>
                  </FieldLabel>
                  <Input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Inc."
                  />
                </Field>
              </div>
            </CardPanel>
            <CardFooter className="justify-end">
              <Button type="submit" loading={saving}>
                {t("profile.saveChanges")}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Security */}
        <div ref={securityRef}>
          <Card className="border-neutral-800 bg-[#1a1a1a]">
            <CardHeader>
              <CardTitle className="text-neutral-50">{t("profile.security")}</CardTitle>
              <CardDescription className="text-neutral-400">
                {t("profile.securityDesc")}
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleUpdatePassword}>
              <CardPanel className="flex flex-col gap-4">
                <Field>
                  <FieldLabel>{t("profile.newPassword")}</FieldLabel>
                  <PasswordInput
                    value={newPassword}
                    onChange={setNewPassword}
                    autoComplete="new-password"
                    required
                  />
                  <FieldDescription>{t("profile.min8Chars")}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>{t("profile.confirmNewPassword")}</FieldLabel>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                    required
                  />
                </Field>
              </CardPanel>
              <CardFooter className="justify-end">
                <Button
                  type="submit"
                  variant="outline"
                  loading={updatingPassword}
                >
                  {t("profile.updatePassword")}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
