import { useState } from "react";
import { toast } from "sonner";
import { useLang } from "../../LangContext";
import { BaseModal, ModalInput, ModalSelect, ModalFooter } from "./BaseModal";

interface NewEventModalProps {
  open: boolean;
  onClose: () => void;
  defaultDay?: number;
  onAdd?: (day: number, event: { title: string; tag: string; color: string }) => Promise<void>;
}

const tagColors: Record<string, string> = {
  meeting: "#3b82f6",
  planning: "#8b5cf6",
  recurring: "#6366f1",
  deadline: "#ef4444",
  review: "#f59e0b",
  social: "#ec4899",
};

export function NewEventModal({ open, onClose, defaultDay = 8, onAdd }: NewEventModalProps) {
  const { t } = useLang();
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(defaultDay.toString());
  const [time, setTime] = useState("");
  const [tag, setTag] = useState("meeting");

  const reset = () => {
    setTitle("");
    setDay(defaultDay.toString());
    setTime("");
    setTag("meeting");
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error(t("events.titleRequired"));
      return;
    }
    const dayNum = parseInt(day, 10);
    if (!dayNum || dayNum < 1 || dayNum > 30) {
      toast.error(t("events.invalidDay"));
      return;
    }
    setSubmitting(true);
    try {
      await onAdd?.(dayNum, {
        title: title.trim(),
        tag: time || "All day",
        color: tagColors[tag] || "#6366f1",
      });
      toast.success(t("events.added"));
      reset();
      onClose();
    } catch {
      // Parent shows error toast — modal stays open
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BaseModal open={open} onClose={() => { reset(); onClose(); }} title="New Event" description="Schedule a new event on the calendar">
      <div className="space-y-4">
        <ModalInput label="Event title *" placeholder="e.g. Sprint Planning" value={title} onChange={setTitle} />
        <div className="grid grid-cols-2 gap-3">
          <ModalInput label="Day (Jun 2026)" placeholder="8" value={day} onChange={setDay} type="number" />
          <ModalInput label="Time" placeholder="9:00 AM" value={time} onChange={setTime} />
        </div>
        <ModalSelect
          label="Category"
          value={tag}
          onChange={setTag}
          options={[
            { value: "meeting", label: "Meeting" },
            { value: "planning", label: "Planning" },
            { value: "recurring", label: "Recurring" },
            { value: "deadline", label: "Deadline" },
            { value: "review", label: "Review" },
            { value: "social", label: "Social" },
          ]}
        />
      </div>
      <ModalFooter onCancel={() => { reset(); onClose(); }} onConfirm={handleSubmit} confirmLabel={submitting ? "Adding..." : "Add event"} confirmDisabled={!title.trim() || submitting} />
    </BaseModal>
  );
}
