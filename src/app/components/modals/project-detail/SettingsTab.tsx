import { useState } from "react";
import { Globe, Lock, Archive, Trash2, ArrowRight } from "lucide-react";

interface SettingsTabProps {
  visibility: "public" | "private";
  onVisibilityChange: (v: "public" | "private") => void;
  onArchive: () => void;
  onDelete: () => void;
  onTransfer: (email: string) => void;
  isAdmin: boolean;
}

export function SettingsTab({ visibility, onVisibilityChange, onArchive, onDelete, onTransfer, isAdmin }: SettingsTabProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");

  if (!isAdmin) {
    return (
      <div className="text-center py-16">
        <Lock size={24} className="mx-auto text-neutral-600 mb-3" />
        <p className="text-neutral-400 text-[13px]">Only owners and admins can access project settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-md">
      {/* Visibility */}
      <div>
        <h4 className="text-neutral-200 text-[13px] font-['Lexend:SemiBold',_sans-serif] mb-3">Project Visibility</h4>
        <div className="space-y-2">
          {[
            { value: "public" as const, icon: Globe, label: "Public", desc: "All workspace members can view this project" },
            { value: "private" as const, icon: Lock, label: "Private", desc: "Only invited collaborators can view" },
          ].map(({ value, icon: Icon, label, desc }) => (
            <button
              key={value}
              onClick={() => onVisibilityChange(value)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                visibility === value
                  ? "bg-indigo-950/20 border-indigo-500/40"
                  : "bg-neutral-800/20 border-neutral-800 hover:border-neutral-700"
              }`}
            >
              <Icon size={16} className={visibility === value ? "text-indigo-400" : "text-neutral-500"} strokeWidth={1.8} />
              <div>
                <div className="text-neutral-200 text-[12px]">{label}</div>
                <div className="text-neutral-500 text-[10px] mt-0.5">{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Archive */}
      <div className="border-t border-neutral-800/60 pt-5">
        <h4 className="text-neutral-200 text-[13px] font-['Lexend:SemiBold',_sans-serif] mb-2">Archive Project</h4>
        <p className="text-neutral-500 text-[11px] mb-3">Archived projects are hidden from the active view but can be restored later.</p>
        {confirmArchive ? (
          <div className="flex items-center gap-2">
            <button onClick={onArchive} className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[12px] transition-colors">
              Confirm Archive
            </button>
            <button onClick={() => setConfirmArchive(false)} className="px-3 py-2 rounded-lg text-neutral-400 text-[12px] hover:text-neutral-200 transition-colors">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmArchive(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-800 text-neutral-300 hover:bg-neutral-800 text-[12px] transition-colors"
          >
            <Archive size={14} strokeWidth={1.8} /> Archive Project
          </button>
        )}
      </div>

      {/* Transfer Ownership */}
      <div className="border-t border-neutral-800/60 pt-5">
        <h4 className="text-neutral-200 text-[13px] font-['Lexend:SemiBold',_sans-serif] mb-2">Transfer Ownership</h4>
        <p className="text-neutral-500 text-[11px] mb-3">Transfer this project to another workspace member.</p>
        <div className="flex items-center gap-2">
          <input
            type="email"
            value={transferEmail}
            onChange={(e) => setTransferEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && transferEmail.trim()) {
                onTransfer(transferEmail.trim());
                setTransferEmail("");
              }
            }}
            placeholder="Enter email address"
            className="flex-1 bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-3 py-2 text-neutral-200 text-[12px] outline-none transition-colors"
          />
          <button
            onClick={() => {
              if (transferEmail.trim()) {
                onTransfer(transferEmail.trim());
                setTransferEmail("");
              }
            }}
            disabled={!transferEmail.trim()}
            className="p-2 rounded-lg border border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowRight size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="border-t border-red-900/40 pt-5">
        <h4 className="text-red-400 text-[13px] font-['Lexend:SemiBold',_sans-serif] mb-2">Danger Zone</h4>
        <p className="text-neutral-500 text-[11px] mb-3">Permanently delete this project and all associated data. This action cannot be undone.</p>
        {confirmDelete ? (
          <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-lg space-y-3">
            <p className="text-red-300 text-[12px]">Are you sure? This is permanent and cannot be reversed.</p>
            <div className="flex gap-2">
              <button onClick={onDelete} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[12px] transition-colors">
                Delete Forever
              </button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-2 rounded-lg text-neutral-400 text-[12px] hover:text-neutral-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-900/40 text-red-400 hover:bg-red-950/20 text-[12px] transition-colors"
          >
            <Trash2 size={14} strokeWidth={1.8} /> Delete Project
          </button>
        )}
      </div>
    </div>
  );
}
