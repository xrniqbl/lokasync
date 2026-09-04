import { useState, useEffect } from "react";
import { CheckCircle, Plus, ArrowUpRight, Upload, MessageSquare, ListTodo, UserPlus, Edit3 } from "lucide-react";
import type { LocalActivity } from "./types";

const iconMap: Record<string, typeof CheckCircle> = {
  status: ArrowUpRight,
  priority: ArrowUpRight,
  comment: MessageSquare,
  file: Upload,
  checklist: ListTodo,
  created: Plus,
  updated: Edit3,
  assignee: UserPlus,
};

const colorMap: Record<string, string> = {
  status: "bg-amber-900/40 text-amber-400",
  priority: "bg-amber-900/40 text-amber-400",
  comment: "bg-indigo-900/40 text-indigo-400",
  file: "bg-emerald-900/40 text-emerald-400",
  checklist: "bg-indigo-900/40 text-indigo-400",
  created: "bg-emerald-900/40 text-emerald-400",
  updated: "bg-blue-900/40 text-blue-400",
  assignee: "bg-purple-900/40 text-purple-400",
};

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function ActivityTab({ activities }: { activities: LocalActivity[] }) {
  // Re-render every 60s to keep relative timestamps fresh (Issue #26)
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  if (activities.length === 0) {
    return <p className="text-neutral-600 text-[12px] text-center py-12">No activity yet.</p>;
  }

  return (
    <div className="space-y-0">
      {activities.map((a, i) => {
        const Icon = iconMap[a.type] ?? Edit3;
        const colors = colorMap[a.type] ?? "bg-neutral-800 text-neutral-400";
        return (
          <div key={a.id} className="flex items-start gap-3 py-2.5 relative">
            {/* Timeline line */}
            {i < activities.length - 1 && (
              <div className="absolute left-[13px] top-9 bottom-0 w-px bg-neutral-800" />
            )}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${colors}`}>
              <Icon size={13} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-neutral-300 text-[12px] leading-snug">{a.description}</p>
              <span className="text-neutral-600 text-[10px] mt-0.5 block">{formatRelative(a.timestamp)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
