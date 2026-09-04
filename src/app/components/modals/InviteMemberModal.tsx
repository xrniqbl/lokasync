import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { BaseModal, ModalInput, ModalSelect, ModalFooter } from "./BaseModal";
import { CreatableSelect } from "../cossui/creatable-select";
import { useLang } from "../../LangContext";
import { createInvitation, getTeams, ApiError } from "../../utils/api";

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful invite so the parent can refresh its lists. */
  onInvited?: () => void;
}

const DEFAULT_TEAM_SUGGESTIONS = [
  "Development",
  "Design",
  "Quality Assurance",
  "Product Management",
  "Marketing",
  "Sales",
  "Customer Success",
  "Data & Analytics",
  "Human Resources",
  "Finance & Operations",
];

export function InviteMemberModal({ open, onClose, onInvited }: InviteMemberModalProps) {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [team, setTeam] = useState("");
  const [teamOptions, setTeamOptions] = useState<string[]>(DEFAULT_TEAM_SUGGESTIONS);
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch existing teams when modal opens so the dropdown shows current data.
  useEffect(() => {
    if (!open) return;
    getTeams()
      .then((teams) => {
        const names = teams.map((t) => t.name);
        // Merge with defaults, dedupe.
        const merged = [...new Set([...names, ...DEFAULT_TEAM_SUGGESTIONS])];
        setTeamOptions(merged);
      })
      .catch(() => {});
  }, [open]);

  const reset = () => {
    setEmail("");
    setRole("member");
    setTeam("");
    setInviteLink(null);
    setCopied(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!email.trim() || !email.includes("@")) {
      toast.error(t("invite.invalidEmail"));
      return;
    }
    setLoading(true);
    try {
      const invite = await createInvitation({ email: email.trim().toLowerCase(), role, team: team.trim() || undefined });
      const link = `${window.location.origin}/join/${invite.token}`;
      setInviteLink(link);
      onInvited?.();
      toast.success(t("invite.created"));
    } catch (e) {
      const msg =
        e instanceof ApiError && e.code === "plan_required"
          ? "Inviting members requires a Pro plan"
          : e instanceof Error
            ? e.message
            : "Failed to create invitation";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <BaseModal
      open={open}
      onClose={close}
      title="Invite Member"
      description="Invite someone to join this workspace"
    >
      {inviteLink ? (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-950/20 border border-emerald-800/40 rounded-xl space-y-3">
            <div className="text-emerald-300 text-[13px] font-['Lexend:SemiBold',_sans-serif]">
              Invitation ready
            </div>
            <p className="text-neutral-400 text-[12px]">
              Share this link with <span className="text-neutral-200">{email}</span>. They'll join as
              {" "}<span className="text-neutral-200">{role}</span>
              {team.trim() && <> in <span className="text-neutral-200">{team.trim()}</span></>}
              {" "}after signing in with that email. The link expires in 7 days.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-[#0f0f0f] border border-neutral-800 rounded-lg px-3 py-2 text-indigo-300 text-[12px] font-mono truncate">
                {inviteLink}
              </code>
              <button
                onClick={copyLink}
                className="shrink-0 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 px-2.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 text-[12px]"
              >
                {copied ? <><Check size={13} className="text-emerald-400" /> Copied</> : <><Copy size={13} /> Copy</>}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg text-neutral-400 hover:text-neutral-200 text-[13px] transition-colors border border-neutral-800 hover:bg-neutral-800"
            >
              Invite another
            </button>
            <button
              onClick={close}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <ModalInput
              label="Email address *"
              placeholder="colleague@company.com"
              value={email}
              onChange={setEmail}
              type="email"
            />
            <ModalSelect
              label="Role"
              value={role}
              onChange={setRole}
              options={[
                { value: "admin", label: "Admin — manage members & settings" },
                { value: "member", label: "Member — create & edit work" },
                { value: "viewer", label: "Viewer — read-only" },
              ]}
            />
            <CreatableSelect
              label="Team"
              placeholder="Search or create a team…"
              value={team}
              onChange={setTeam}
              options={teamOptions}
              hint="Select an existing team or type a new name"
            />
          </div>
          <ModalFooter
            onCancel={close}
            onConfirm={handleSubmit}
            confirmLabel={loading ? "Creating..." : "Create invite link"}
            confirmDisabled={!email.trim() || loading}
          />
        </>
      )}
    </BaseModal>
  );
}
