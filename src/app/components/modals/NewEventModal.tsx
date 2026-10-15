import { useEffect, useRef, useState } from "react";
import { BaseModal, ModalInput, ModalSelect, ModalFooter } from "./BaseModal";

interface NewEventModalProps {
  open: boolean;
  onClose: () => void;
  defaultDay?: number;
  daysInMonth?: number;
  monthLabel?: string;
  onAdd?: (day: number, event: { title: string; tag: string; color: string }) => void | Promise<void>;
}

const tagColors: Record<string, string> = {
  meeting: "#3b82f6",
  planning: "#8b5cf6",
  recurring: "#6366f1",
  deadline: "#ef4444",
  review: "#f59e0b",
  social: "#ec4899",
};

export function NewEventModal({ open, onClose, defaultDay = 8, daysInMonth = 31, monthLabel, onAdd }: NewEventModalProps) {
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(defaultDay.toString());
  const [time, setTime] = useState("");
  const [tag, setTag] = useState("meeting");
  const [titleError, setTitleError] = useState("");
  const [dayError, setDayError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Keep the day field in sync when the modal opens for a different day.
  useEffect(() => {
    if (open) setDay(defaultDay.toString());
  }, [open, defaultDay]);

  const reset = () => {
    setTitle("");
    setDay(defaultDay.toString());
    setTime("");
    setTag("meeting");
    setTitleError("");
    setDayError("");
    setSubmitError("");
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    let valid = true;
    if (!title.trim()) {
      setTitleError("Event title is required");
      valid = false;
    } else {
      setTitleError("");
    }
    const dayNum = parseInt(day, 10);
    const maxDay = Number.isInteger(daysInMonth) && daysInMonth >= 28 && daysInMonth <= 31 ? daysInMonth : 31;
    if (!dayNum || dayNum < 1 || dayNum > maxDay) {
      setDayError(`Enter a valid day (1–${maxDay})`);
      valid = false;
    } else {
      setDayError("");
    }
    if (!valid) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      await onAdd?.(dayNum, {
        title: title.trim(),
        tag: time.trim() || "All day",
        color: tagColors[tag] || "#6366f1",
      });
      reset();
      onClose();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to add event");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <BaseModal open={open} onClose={() => { reset(); onClose(); }} title="New Event" description="Schedule a new event on the calendar">
      <div className="space-y-4">
        <div>
          <ModalInput label="Event title *" placeholder="e.g. Sprint Planning" value={title} onChange={(v) => { setTitle(v); if (titleError) setTitleError(""); }} />
          {titleError && <p className="text-red-400 text-[11px] mt-1">{titleError}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <ModalSelect
              label={`Day${monthLabel ? ` (${monthLabel})` : ""} *`}
              value={day}
              onChange={(v) => { setDay(v); if (dayError) setDayError(""); }}
              options={Array.from(
                { length: Number.isInteger(daysInMonth) && daysInMonth >= 28 && daysInMonth <= 31 ? daysInMonth : 31 },
                (_, i) => ({ value: String(i + 1), label: String(i + 1) }),
              )}
            />
            {dayError && <p className="text-red-400 text-[11px] mt-1">{dayError}</p>}
          </div>
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
        {submitError && (
          <p role="alert" className="text-red-400 text-[12px] bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{submitError}</p>
        )}
      </div>
      <ModalFooter onCancel={() => { reset(); onClose(); }} onConfirm={handleSubmit} confirmLabel={submitting ? "Adding…" : "Add event"} confirmDisabled={!title.trim() || submitting} />
    </BaseModal>
  );
}
