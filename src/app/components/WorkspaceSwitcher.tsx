import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Briefcase } from "lucide-react";
import { ChevronDown, AddLarge, UserMultiple, Checkmark } from "@carbon/icons-react";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { WorkspaceMembersModal } from "./modals/WorkspaceMembersModal";
import * as api from "../utils/api";

// Fase 14.5 — workspace switcher shown at the top of the detail sidebar.

export function WorkspaceSwitcher({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const { workspaces, activeWorkspace, switchWorkspace, refreshWorkspaces } =
    useWorkspace();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (isCollapsed) return null;

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await api.createWorkspace(name);
      toast.success(`Workspace "${created.name}" created`);
      setNewName("");
      setCreating(false);
      setOpen(false);
      await refreshWorkspaces();
      switchWorkspace(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create workspace");
    }
  };

  return (
    <div className="relative w-full shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 rounded-lg border border-neutral-800 bg-[#0a0a0a] px-3 py-2 text-left transition-colors hover:bg-neutral-900"
      >
        <div className="w-6 h-6 rounded-md bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-300 shrink-0">
          {activeWorkspace?.name ? (
            <span className="text-[11px] font-medium">{activeWorkspace.name.slice(0, 1).toUpperCase()}</span>
          ) : (
            <Briefcase className="size-3.5" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-neutral-100 text-[12.5px] font-['Lexend:Regular',_sans-serif] truncate">
            {activeWorkspace?.name ?? "Workspace"}
          </div>
          <div className="text-neutral-600 text-[10px] capitalize">
            {activeWorkspace?.role ?? ""}
          </div>
        </div>
        <ChevronDown
          size={14}
          className={`text-neutral-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-xl border border-neutral-800 bg-[#1a1a1a] shadow-2xl overflow-hidden font-['Lexend:Regular',_sans-serif]">
          <div className="px-2 py-2 max-h-56 overflow-y-auto">
            <div className="text-neutral-600 text-[10px] uppercase tracking-wider px-2 mb-1.5">
              Workspaces
            </div>
            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  switchWorkspace(w.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[12px] transition-colors text-left ${
                  w.id === activeWorkspace?.id
                    ? "bg-neutral-800 text-neutral-50"
                    : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
                }`}
              >
                <div className="w-5 h-5 rounded bg-neutral-800 border border-neutral-700/50 flex items-center justify-center text-neutral-300 shrink-0">
                  <span className="text-[10px] font-medium">{w.name.slice(0, 1).toUpperCase()}</span>
                </div>
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                <span className="text-neutral-600 text-[10px] capitalize">{w.role}</span>
                {w.id === activeWorkspace?.id && (
                  <Checkmark size={12} className="text-neutral-300 shrink-0" />
                )}
              </button>
            ))}
          </div>

          <div className="border-t border-neutral-800/60 px-2 py-2 space-y-0.5">
            <button
              onClick={() => {
                setShowMembers(true);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50 rounded-lg transition-colors text-left"
            >
              <UserMultiple size={14} />
              Members &amp; invites
            </button>
            {creating ? (
              <div className="flex items-center gap-1.5 px-2 py-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setCreating(false);
                  }}
                  placeholder="Workspace name"
                  className="min-w-0 flex-1 bg-[#0f0f0f] border border-neutral-800 focus:border-indigo-600/60 rounded-lg px-2 py-1.5 text-neutral-200 text-[12px] outline-none placeholder:text-neutral-600"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] transition-colors disabled:opacity-40 shrink-0"
                >
                  Create
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50 rounded-lg transition-colors text-left"
              >
                <AddLarge size={14} />
                New workspace
              </button>
            )}
          </div>
        </div>
      )}

      <WorkspaceMembersModal open={showMembers} onClose={() => setShowMembers(false)} />
    </div>
  );
}
