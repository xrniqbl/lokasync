import { useLang } from "../../i18n";
import { AtSign } from "lucide-react";

interface Mention {
  id: string;
  type: string;
  actor: string;
  text: string;
  time: string;
}

interface MentionsFeedProps {
  mentions: Mention[];
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function AvatarInitial({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  // Pick a deterministic muted hue per initial
  const colors = [
    "bg-indigo-900 text-indigo-300",
    "bg-neutral-800 text-neutral-300",
    "bg-amber-950 text-amber-300",
    "bg-emerald-950 text-emerald-300",
    "bg-red-950 text-red-300",
  ];
  const idx = initial.charCodeAt(0) % colors.length;
  return (
    <div
      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-['Lexend:Medium',_sans-serif] shrink-0 ${colors[idx]}`}
    >
      {initial}
    </div>
  );
}

export function MentionsFeed({ mentions }: MentionsFeedProps) {
  const { t } = useLang();
  const visible = mentions.slice(0, 5);

  return (
    <div className="rounded-xl border border-neutral-800 bg-[#1a1a1a]/80 overflow-hidden h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <AtSign size={13} className="text-indigo-400" />
          <span className="text-neutral-200 text-xs font-['Lexend:SemiBold',_sans-serif]">
            {t("memberHome.mentions")}
          </span>
          {mentions.length > 0 && (
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
          )}
        </div>
      </div>

      {/* List */}
      <div className="px-4 pb-4 flex flex-col gap-3">
        {visible.length === 0 ? (
          <p className="text-neutral-600 text-xs">{t("memberHome.noMentions")}</p>
        ) : (
          visible.map((m) => (
            <div key={m.id} className="flex items-start gap-2.5">
              <AvatarInitial name={m.actor} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-neutral-200 text-[11px] font-['Lexend:Medium',_sans-serif] shrink-0">
                    {m.actor}
                  </span>
                  <span className="text-neutral-400 text-[11px] leading-tight break-words">
                    {m.text}
                  </span>
                </div>
                <span className="text-neutral-600 text-[10px] mt-0.5 block">
                  {timeAgo(m.time)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}