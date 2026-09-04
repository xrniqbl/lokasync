import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/cossui/button";
import { Spinner } from "@/components/cossui/spinner";
import { useAuth } from "../auth/AuthContext";
import {
  acceptInvitation,
  getInvitationByToken,
  type InvitationPreview,
} from "../utils/api";
import { AuthShell } from "./auth/AuthShell";

export function JoinWorkspacePage() {
  const { token = "" } = useParams();
  const { user } = useAuth();

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
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Invitation not found");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const emailMismatch =
    preview && user?.email && user.email.toLowerCase() !== preview.email.toLowerCase();

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const res = await acceptInvitation(token);
      toast.success(`Joined ${res.workspace_name || "the workspace"}`);
      // Full reload so every context (profile, subscription, workspace) re-reads
      // against the newly joined workspace from a clean slate.
      window.location.assign("/app/dashboard");
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : null) || "Could not accept invitation");
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <AuthShell title="Workspace invitation" description="Checking your invitation…">
        <div className="flex justify-center py-6">
          <Spinner className="size-6 text-neutral-400" />
        </div>
      </AuthShell>
    );
  }

  if (loadError || !preview) {
    return (
      <AuthShell title="Invitation not found" description="This link may be invalid.">
        <p className="text-sm text-neutral-400">{loadError ?? "We couldn't find this invitation."}</p>
        <Button render={<Link to="/app/dashboard" />} className="mt-4 w-full">
          Go to dashboard
        </Button>
      </AuthShell>
    );
  }

  if (preview.status !== "pending") {
    const label =
      preview.status === "accepted" ? "already been accepted" :
      preview.status === "expired" ? "expired" : "been revoked";
    return (
      <AuthShell title="Invitation unavailable" description={`This invitation has ${label}.`}>
        <Button render={<Link to="/app/dashboard" />} className="w-full">
          Go to dashboard
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Join ${preview.workspace_name}`}
      description={`${preview.inviter_name} invited you to collaborate.`}
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-neutral-800 bg-[#0f0f0f] p-4 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-neutral-500">Workspace</span>
            <span className="text-neutral-200">{preview.workspace_name}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-neutral-500">Invited email</span>
            <span className="text-neutral-200">{preview.email}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-neutral-500">Role</span>
            <span className="text-neutral-200 capitalize">{preview.role}</span>
          </div>
        </div>

        {emailMismatch ? (
          <>
            <p className="text-sm text-amber-400">
              This invitation was sent to <span className="font-medium">{preview.email}</span>, but
              you're signed in as <span className="font-medium">{user?.email}</span>. Sign in with the
              invited email to accept.
            </p>
            <Button render={<Link to="/login" state={{ from: { pathname: `/join/${token}` } }} />} variant="outline" className="w-full">
              Switch account
            </Button>
          </>
        ) : (
          <Button onClick={handleAccept} loading={accepting} className="w-full">
            Accept invitation
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
