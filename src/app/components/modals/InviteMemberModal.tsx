import { useState } from "react";
import { toast } from "sonner";
import { BaseModal, ModalInput, ModalSelect, ModalFooter } from "./BaseModal";

interface Member {
  initials: string;
  name: string;
  role: string;
  status: string;
  tasks: number;
}

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  onInvite?: (teamName: string, member: Member) => Promise<void>;
}

export function InviteMemberModal({ open, onClose, onInvite }: InviteMemberModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [team, setTeam] = useState("Development");
  const [role, setRole] = useState("Engineer");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setName("");
    setEmail("");
    setTeam("Development");
    setRole("Engineer");
  };

  const handleSubmit = async () => {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    if (!name.trim()) {
      toast.error("Enter a name");
      return;
    }
    const initials = name.trim().split(" ").map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2);
    const member: Member = { initials, name: name.trim(), role, status: "online", tasks: 0 };
    setLoading(true);
    try {
      if (onInvite) await onInvite(team, member);
      else toast.success(`Invitation sent to ${email}`);
    } finally {
      setLoading(false);
      reset();
      onClose();
    }
  };

  return (
    <BaseModal open={open} onClose={() => { reset(); onClose(); }} title="Invite Member" description="Add a new member to your workspace">
      <div className="space-y-4">
        <ModalInput label="Full name *" placeholder="Jane Smith" value={name} onChange={setName} />
        <ModalInput label="Email address *" placeholder="colleague@company.com" value={email} onChange={setEmail} type="email" />
        <ModalSelect
          label="Team"
          value={team}
          onChange={setTeam}
          options={[
            { value: "Development", label: "Development" },
            { value: "Design", label: "Design" },
            { value: "Quality Assurance", label: "Quality Assurance" },
            { value: "Product Management", label: "Product Management" },
          ]}
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
