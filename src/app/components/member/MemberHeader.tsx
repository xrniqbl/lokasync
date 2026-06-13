import { useLang } from "../../i18n";
import { Briefcase, User } from "lucide-react";

interface MemberHeaderProps {
  workspaceName: string;
  ownerName: string;
  memberName?: string;
  totalMembers: number;
}

export function MemberHeader({
  workspaceName,
  ownerName,
  memberName,
  totalMembers,
}: MemberHeaderProps) {
  const { t } = useLang();

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-3">
      {/* Greeting */}
      <div>
        <h1 className="text-neutral-100 text-xl font-['Lexend:SemiBold',_sans-serif] leading-tight">
          {greeting}{memberName ? `, ${memberName}` : ""}
        </h1>
        <p className="text-neutral-500 text-sm mt-0.5">{dateStr}</p>
      </div>

      {/* Workspace badge + leader info */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Workspace badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1a1a1a] border border-white/[0.06]">
          <Briefcase size={12} className="text-indigo-400" />
          <span className="text-neutral-200 text-xs font-['Lexend:Medium',_sans-serif]">
            {workspaceName}
          </span>
        </div>

        {/* Divider dot */}
        <div className="w-1 h-1 rounded-full bg-neutral-700" />

        {/* Leader info */}
        <div className="flex items-center gap-1.5 text-neutral-500 text-xs">
          <User size={11} />
          <span>
            {t("memberHome.ledBy")} <span className="text-neutral-300">{ownerName}</span>
          </span>
        </div>

        {/* Divider dot */}
        <div className="w-1 h-1 rounded-full bg-neutral-700" />

        {/* Member count */}
        <div className="text-neutral-500 text-xs">
          <span className="text-neutral-300">{totalMembers}</span>{" "}
          {t("memberHome.members")}
        </div>
      </div>
    </div>
  );
}