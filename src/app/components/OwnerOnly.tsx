import { useWorkspace } from "../workspace/WorkspaceContext";
import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useLang } from "../i18n";
import { Spinner } from "@/components/cossui/spinner";

export function OwnerOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { isOwner, activeWorkspace, loading, workspaceError } = useWorkspace();
  const navigate = useNavigate();
  const { t } = useLang();
  // Tracks which workspace id we've already redirected for, so list refreshes
  // (new activeWorkspace object identity, same id) don't re-toast/navigate.
  const redirectedForRef = useRef<string | null>(null);

  const workspaceId = activeWorkspace?.id;
  // Keyed by workspace + role so a role change (owner ↔ member) re-arms the
  // redirect instead of staying suppressed by a stale workspace-only key.
  const redirectKey = workspaceId ? `${workspaceId}:${isOwner}` : null;

  useEffect(() => {
    if (loading || !workspaceId || isOwner) {
      // Reset when the role becomes owner so a later demotion redirects again.
      if (isOwner) redirectedForRef.current = null;
      return;
    }
    if (redirectedForRef.current === redirectKey) return;
    redirectedForRef.current = redirectKey;
    toast.error(t("memberHome.ownerOnlyAccess"));
    navigate("/app/dashboard", { replace: true });
  }, [loading, workspaceId, isOwner, redirectKey, navigate, t]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6 text-neutral-400" />
      </div>
    );
  }

  if (workspaceError && !activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="max-w-sm text-[13px] text-neutral-500">{workspaceError}</p>
      </div>
    );
  }

  if (!isOwner) {
    if (fallback) return <>{fallback}</>;
    // No redirect has fired yet (e.g. first paint before the effect runs):
    // explain instead of flashing a blank page.
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-[#1a1a1a] p-6 text-center">
          <p className="mb-1 text-[14px] text-neutral-50">Owners only</p>
          <p className="text-[13px] text-neutral-500">
            Only workspace owners can view this section. Ask an owner for access.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
