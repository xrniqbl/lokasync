import { useEffect, useRef, useState } from "react";
import { BaseModal, ModalInput, ModalSelect, ModalFooter } from "./BaseModal";

interface Member {
  initials: string;
  name: string;
  email: string;
  role: string;
  status: string;
  tasks: number;
}

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  onInvite?: (teamName: string, member: Member) => Promise<void> | void;
  // Team names from live state; falls back to the legacy static list.
  teams?: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FALLBACK_TEAMS = ["Development", "Design", "Quality Assurance", "Product Management"];

export function InviteMemberModal({ open, onClose, onInvite, teams }: InviteMemberModalProps) {
  const teamOptions = teams && teams.length > 0 ? teams : FALLBACK_TEAMS;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [team, setTeam] = useState(teamOptions[0]);
  const [role, setRole] = useState("Engineer");
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const submittingRef = useRef(false);

  const reset = () => {
    setName("");
    setEmail("");
    setTeam(teamOptions[0]);
    setRole("Engineer");
    setNameError("");
    setEmailError("");
    setSubmitError("");
  };

  // Keep the selected team valid when the team list resolves after open.
  useEffect(() => {
    if (!teamOptions.includes(team)) setTeam(teamOptions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teams?.join("|")]);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    let valid = true;
    if (!name.trim()) {
      setNameError("Enter a name");
      valid = false;
    } else {
      setNameError("");
    }
    if (!email.trim()) {
      setEmailError("Email address is required");
      valid = false;
    } else if (!EMAIL_RE.test(email.trim())) {
      setEmailError("Enter a valid email address (e.g. name@company.com)");
      valid = false;
    } else {
      setEmailError("");
    }
    if (!role) {
      setSubmitError("Select a role");
      valid = false;
    }
    if (!valid) return;
    const initials = name.trim().split(" ").map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2);
    const member: Member = { initials, name: name.trim(), email: email.trim(), role, status: "online", tasks: 0 };
    submittingRef.current = true;
    setLoading(true);
    setSubmitError("");
    try {
      await onInvite?.(team, member);
      reset();
      onClose();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to send invitation");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <BaseModal open={open} onClose={() => { reset(); onClose(); }} title="Invite Member" description="Add a new member to your workspace">
      <div className="space-y-4">
        <div>
          <ModalInput label="Full name *" placeholder="Jane Smith" value={name} onChange={(v) => { setName(v); if (nameError) setNameError(""); }} />
          {nameError && <p className="text-red-400 text-[11px] mt-1">{nameError}</p>}
        </div>
        <div>
          <ModalInput label="Email address *" placeholder="colleague@company.com" value={email} onChange={(v) => { setEmail(v); if (emailError) setEmailError(""); }} type="email" />
          {emailError && <p className="text-red-400 text-[11px] mt-1">{emailError}</p>}
        </div>
        <ModalSelect
          label="Team"
          value={team}
          onChange={setTeam}
          options={teamOptions.map((tn) => ({ value: tn, label: tn }))}
        />
        <ModalSelect
          label="Role"
          value={role}
          onChange={setRole}
          options={[
            { value: "Engineer", label: "Engineer" },
            { value: "Designer", label: "Designer" },
            { value: "Manager", label: "Manager" },
            { value: "Analyst", label: "Analyst" },
            { value: "Viewer", label: "Viewer (read-only)" },
          ]}
        />
        {submitError && (
          <p role="alert" className="text-red-400 text-[12px] bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{submitError}</p>
        )}
      </div>
      <ModalFooter
        onCancel={() => { reset(); onClose(); }}
        onConfirm={handleSubmit}
        confirmLabel={loading ? "Adding..." : "Add member"}
        confirmDisabled={!email.trim() || !name.trim() || loading}
      />
    </BaseModal>
  );
}
