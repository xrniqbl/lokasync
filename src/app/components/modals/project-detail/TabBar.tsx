import { FileText, MessageSquare, Activity, FolderOpen, CheckSquare, Settings } from "lucide-react";
import type { TabId } from "./types";

const tabs: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: "description", label: "Description", icon: FileText },
  { id: "comments", label: "Comments", icon: MessageSquare },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "checklist", label: "Checklist", icon: CheckSquare },
  { id: "settings", label: "Settings", icon: Settings },
];

export function TabBar({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  return (
    <div className="flex items-center gap-0.5 px-5 border-b border-neutral-800/60 overflow-x-auto">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-[12px] border-b-2 transition-colors whitespace-nowrap ${
              isActive
                ? "border-indigo-500 text-neutral-50"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <Icon size={14} strokeWidth={1.8} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
