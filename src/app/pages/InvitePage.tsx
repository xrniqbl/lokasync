import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Spinner } from "@/components/cossui/spinner";
import { useAuth } from "../auth/AuthContext";
import { persistActiveWorkspace } from "../workspace/WorkspaceContext";
import * as api from "../utils/api";

// Fase 14.5 — public landing page for workspace invitation links
// (/invite/:token). Shows a preview of the invitation; signed-out users are
// sent to login/register first, signed-in users can accept directly.

const statusMessages: Record<string, string> = {
  accepted: "This invitation has already been used.",
  revoked: "This invitation has been revoked by the workspace owner.",
  expired: "This invitation has expired. Ask the owner to send a new one.",
};

export function InvitePage() {
  const { token = "" } = useParams();
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<api.InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .getInvitePreview(token)
      .then(setPreview)
      .catch((e) =>
        setError(
          e instanceof api.ApiError && e.status === 404
            ? "This invitation link is invalid."
            : "Could not load the invitation. Please try again.",
        ),
      );
  }, [token]);

  const handleAccept = async () => {
    if (!user) return;
    setAccepting(true);
    try {
      const result = await api.acceptInvite(token);
      persistActiveWorkspace(user.id, result.workspace.id);
      api.setApiWorkspaceId(result.workspace.id);
      toast.success(
        result.already_member
          ? `You're already a member of ${result.workspace.name}`
          : `Welcome to ${result.workspace.name}!`,
      );
      navigate("/app/dashboard", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept the invitation");
      setAccepting(false);
    }
  };

  const emailMismatch =
    !!user && !!preview && (user.email ?? "").toLowerCase() !== preview.email.toLowerCase();
  const blockedMessage = preview ? statusMessages[preview.status] : undefined;

  return (
    <div
      className="dark flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4"
      style={{ fontFamily: "Lexend, sans-serif" }}
    >
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-[#141414] p-8 text-center shadow-2xl">
        {error ? (
          <>
            <h1 className="text-[18px] text-neutral-50 mb-2">Invitation not found</h1>
            <p className="text-[13px] text-neutral-500 mb-6">{error}</p>
            <Link
              to="/"
              className="inline-block rounded-lg border border-neutral-800 px-4 py-2 text-[13px] text-neutral-300 transition-colors hover:bg-neutral-800"
            >
              Back to home
            </Link>
          </>
        ) : !preview || authLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-6 text-neutral-400" />
          </div>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-900/60 text-[18px] text-indigo-300">
              {preview.workspace_name.slice(0, 1).toUpperCase()}
            </div>
            <h1 className="text-[18px] text-neutral-50 mb-1.5">
              Join {preview.workspace_name}
            </h1>
            <p className="text-[13px] text-neutral-500 mb-6">
              <span className="text-neutral-300">{preview.invited_by}</span> invited{" "}
              <span className="text-neutral-300">{preview.email}</span> to join as a{" "}
              <span className="capitalize text-neutral-300">{preview.role}</span>.
            </p>

            {blockedMessage ? (
              <p className="rounded-lg border border-amber-500/20 bg-amber-950/30 px-4 py-3 text-[12.5px] text-amber-200">
                {blockedMessage}
              </p>
            ) : !user ? (
              <div className="space-y-2">
                <p className="text-[12px] text-neutral-500 mb-3">
                  Sign in with <span className="text-neutral-300">{preview.email}</span> to
                  accept this invitation.
                </p>
                <Link
                  to="/login"
                  state={{ from: location }}
                  className="block w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] text-white transition-colors hover:bg-indigo-500"
                >
                  Sign in to accept
                </Link>
                <Link
                  to="/register"
                  state={{ from: location }}
                  className="block w-full rounded-lg border border-neutral-800 px-4 py-2.5 text-[13px] text-neutral-300 transition-colors hover:bg-neutral-800"
                >
                  Create an account
                </Link>
              </div>
            ) : emailMismatch ? (
              <p className="rounded-lg border border-amber-500/20 bg-amber-950/30 px-4 py-3 text-[12.5px] text-amber-200">
                You are signed in as {user.email}, but this invitation was sent to{" "}
                {preview.email}. Sign in with the invited email to accept.
              </p>
            ) : (
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {accepting ? "Joining…" : "Accept invitation"}
              </button>
            )}

            <p className="mt-5 text-[11px] text-neutral-600">
              Invitation expires {new Date(preview.expires_at).toLocaleDateString()}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
