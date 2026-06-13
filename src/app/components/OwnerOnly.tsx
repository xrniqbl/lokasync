import { useWorkspace } from "../workspace/WorkspaceContext";
import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useLang } from "../i18n";

export function OwnerOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { isOwner, activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const { t } = useLang();

  useEffect(() => {
    if (activeWorkspace && !isOwner) {
      toast.error(t("memberHome.ownerOnlyAccess"));
      navigate("/app/dashboard", { replace: true });
    }
  }, [isOwner, activeWorkspace, navigate, t]);

  if (!isOwner) return fallback ?? null;
  return <>{children}</>;
}
