import { useState } from "react";
import { useLang } from "../../i18n";
import { Activity } from "lucide-react";

interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  target: string;
  time: string;
}

interface TeamActivityFeedProps {
  items: ActivityItem[];
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

function AvatarCircle({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
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

export function TeamActivityFeed({ items }: TeamActivityFeedProps) {
  const { t } = useLang();
  const [visibleCount, setVisibleCount] = useState(10);
  const visible = items.slice(0, visibleCount);

  return (
    <div className="rounded-xl border border-neutral-800 bg-[#1a1a1a]/80 overflow-hidden h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-indigo-400" />
          <span className="text-neutral-200 text-xs font-['Lexend:SemiBold',_sans-serif]">
            {t("memberHome.teamActivity")}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-4 pb-4">
        {visible.length === 0 ? (
          <p className="text-neutral-600 text-xs">{t("memberHome.noActivity")}</p>
        ) : (
          <div className="flex flex-col gap-0">
            {visible.map((item, i) => (
              <div key={item.id} className="flex items-start gap-2.5 relative">
                {/* Left border connector line */}
                {i < visible.length - 1 && (
                  <div className="absolute left-[11px] top-6 bottom-0 w-px bg-neutral-800/60" />
                )}

                <AvatarCircle name={item.actor} />

                <div className="flex-1 min-w-0 pb-3 last:pb-0">
                  <p className="text-neutral-300 text-[11px] leading-tight">
                    <span className="text-neutral-200 font-['Lexend:Medium',_sans-serif]">
                      {item.actor}
                    </span>{" "}
                    <span className="text-neutral-500">{item.action}</span>{" "}
                    <span className="text-neutral-300 italic">{item.target}</span>
                  </p>
                  <span className="text-neutral-600 text-[10px] mt-0.5 block">
                    {timeAgo(item.time)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {items.length > visibleCount && (
          <button
            onClick={() => setVisibleCount((c) => c + 10)}
            className="w-full py-2 text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            {t("memberHome.loadMore")}
          </button>
        )}
      </div>
    </div>
  );
}