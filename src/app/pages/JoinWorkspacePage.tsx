import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/cossui/button";
import { Spinner } from "@/components/cossui/spinner";
import { useAuth } from "../auth/AuthContext";
import { useLang } from "../LangContext";
import {
  acceptInvitation,
  getInvitationByToken,
  type InvitationPreview,
} from "../utils/api";
import { AuthShell } from "./auth/AuthShell";

export function JoinWorkspacePage() {
  const { token = "" } = useParams();
  const { user } = useAuth();
  const { t } = useLang();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInvitationByToken(token)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : t("join.notFoundTitle"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const emailMismatch =
    preview && user?.email && user.email.toLowerCase() !== preview.email.toLowerCase();

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const res = await acceptInvitation(token);
      toast.success(t("join.joined").replace("{name}", res.workspace_name || t("join.theWorkspace")));
      // Full reload so every context (profile, subscription, workspace) re-reads
      // against the newly joined workspace from a clean slate.
      window.location.assign("/app/dashboard");
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : null) || t("join.acceptFailed"));
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <AuthShell title={t("join.checkingTitle")} description={t("join.checkingDesc")}>
        <div className="flex justify-center py-6">
          <Spinner className="size-6 text-neutral-400" />
        </div>
      </AuthShell>
    );
  }

  if (loadError || !preview) {
    return (
      <AuthShell title={t("join.notFoundTitle")} description={t("join.notFoundDesc")}>
        <p className="text-sm text-neutral-400">{loadError ?? t("join.couldNotFind")}</p>
        <Button render={<Link to="/app/dashboard" />} className="mt-4 w-full">
          {t("auth.goToDashboard")}
        </Button>
      </AuthShell>
    );
  }

  if (preview.status !== "pending") {
    const statusDesc =
      preview.status === "accepted" ? t("join.statusAccepted") :
      preview.status === "expired" ? t("join.statusExpired") : t("join.statusRevoked");
    return (
      <AuthShell title={t("join.unavailableTitle")} description={statusDesc}>
        <Button render={<Link to="/app/dashboard" />} className="w-full">
          {t("auth.goToDashboard")}
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("join.joinWorkspace").replace("{name}", preview.workspace_name)}
      description={t("join.invitedBy").replace("{name}", preview.inviter_name)}
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-neutral-800 bg-[#0f0f0f] p-4 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-neutral-500">{t("join.workspace")}</span>
            <span className="text-neutral-200">{preview.workspace_name}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-neutral-500">{t("join.invitedEmail")}</span>
            <span className="text-neutral-200">{preview.email}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-neutral-500">{t("join.role")}</span>
            <span className="text-neutral-200 capitalize">{preview.role}</span>
          </div>
        </div>

        {emailMismatch ? (
          <>
            <p className="text-sm text-amber-400">
              {t("join.emailMismatch")
                .replace("{invited}", preview.email)
                .replace("{current}", user?.email ?? "")}
            </p>
            <Button render={<Link to="/login" state={{ from: { pathname: `/join/${token}` } }} />} variant="outline" className="w-full">
              {t("join.switchAccount")}
            </Button>
          </>
        ) : (
          <Button onClick={handleAccept} loading={accepting} className="w-full">
            {t("join.accept")}
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
