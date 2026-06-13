import { useNavigate } from "react-router";
import { useLang } from "../../i18n";
import { Plus, Clock, Video, Upload } from "lucide-react";
import { toast } from "sonner";

export function QuickActionsGrid() {
  const { t } = useLang();
  const navigate = useNavigate();

  const actions = [
    {
      icon: Plus,
      label: t("memberHome.newTask"),
      href: "/app/tasks",
      onClick: () => navigate("/app/tasks"),
    },
    {
      icon: Clock,
      label: t("memberHome.logTime"),
      // Placeholder — opens toast
      onClick: () => toast.info("Coming soon"),
    },
    {
      icon: Video,
      label: t("memberHome.joinStandup"),
      href: "/app/calendar",
      onClick: () => navigate("/app/calendar"),
    },
    {
      icon: Upload,
      label: t("memberHome.uploadFile"),
      href: "/app/files",
      onClick: () => navigate("/app/files"),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={action.onClick}
          className="group flex flex-col items-start gap-2 p-4 rounded-xl border border-neutral-800 bg-[#1a1a1a]/80 text-left cursor-pointer
            hover:-translate-y-0.5 hover:border-indigo-500/30 transition-all duration-200
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          <action.icon
            size={16}
            className="text-neutral-400 group-hover:text-indigo-400 transition-colors duration-200"
          />
          <span className="text-neutral-200 text-xs font-['Lexend:Medium',_sans-serif] leading-tight">
            {action.label}
          </span>
        </button>
      ))}
    </div>
  );
}