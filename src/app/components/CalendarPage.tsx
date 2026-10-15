import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Copy, Check, X, Trash2 } from "lucide-react";
import { NewEventModal } from "./modals/NewEventModal";
import { useNavigation } from "./NavigationContext";
import * as api from "../utils/api";
import { useLang } from "../i18n";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useRealtimeWorkspace } from "../realtime";

// New api contract: CalendarEvent is { id, title, time, color }. The server
// list shape still carries the legacy `tag` field (CalendarEventItem), so
// reads tolerate both and all new writes use `time`.
type CalEvent = api.CalendarEventItem;

const eventTime = (ev: CalEvent): string => ev.time ?? ev.tag ?? "";
const eventId = (ev: CalEvent): string => ev.id ?? ev.title;

// Convert server date key "2026-6-8" → numeric day (for current month display)
function serverKeyToDay(key: string): number {
  const parts = key.split("-");
  return parseInt(parts[parts.length - 1]);
}

function daysInMonthFor(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}

function dayToServerKey(monthKey: string, day: number): string | null {
  const [year, month] = monthKey.split("-");
  const dim = daysInMonthFor(monthKey);
  if (!Number.isInteger(day) || day < 1 || day > dim) return null;
  return `${year}-${month}-${day}`;
}

// Convert server Record<"2026-6-8", events[]> → local Record<day, events[]>
function serverEventsToLocal(serverEvents: Record<string, CalEvent[]>, monthKey: string): Record<number, CalEvent[]> {
  const [year, month] = monthKey.split("-");
  const prefix = `${year}-${month}-`;
  const result: Record<number, CalEvent[]> = {};
  for (const [key, evts] of Object.entries(serverEvents)) {
    if (key.startsWith(prefix)) {
      const day = parseInt(key.slice(prefix.length));
      if (!isNaN(day)) result[day] = evts;
    }
  }
  return result;
}

// Month metadata derived from the real current date (prev / current / next month).
// monthKey format "YYYY-M" uses a 1-based month to match the server event keys ("2026-6-8").
function buildMeta(y: number, m1: number): [number, number, number, number, string] {
  const first = new Date(y, m1 - 1, 1);
  const daysInMonth = new Date(y, m1, 0).getDate();
  const startDay = (first.getDay() + 6) % 7; // Monday-first offset
  const label = first.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return [y, m1, daysInMonth, startDay, label];
}

const NOW = new Date();
const TODAY_DAY = NOW.getDate();
const CUR_Y = NOW.getFullYear();
const CUR_M1 = NOW.getMonth() + 1;
const CUR_KEY = `${CUR_Y}-${CUR_M1}`;

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Current week (Monday-first), derived from today's date. Each day carries its
// full server key so lookups never collide across months (Sep 1 vs Aug 1).
const { weekDays, WEEK_LABEL } = (() => {
  const monday = new Date(NOW);
  monday.setDate(NOW.getDate() - ((NOW.getDay() + 6) % 7));
  const days = weekdays.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const date = d.getDate();
    return { label, date, key: `${y}-${m}-${date}` };
  });
  return {
    weekDays: days,
    WEEK_LABEL: `Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
  };
})();

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const timeSlots = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"];

const isAllDay = (ev: CalEvent): boolean => {
  const tm = eventTime(ev).trim();
  return tm === "" || tm.toLowerCase() === "all day";
};

function timeToHour(time: string): number {
  if (!time || time.toLowerCase() === "all day") return -1;
  const m = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return -1;
  let h = parseInt(m[1]);
  if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
  if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
  return h;
}

function slotHour(slot: string): number {
  const m = slot.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return -1;
  let h = parseInt(m[1]);
  if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
  if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
  return h;
}


type CalendarView = "month" | "week" | "day";

function SharePanel({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const { activeWorkspace } = useWorkspace();
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<api.WorkspaceRole>("member");
  const [accessLevel, setAccessLevel] = useState<string>("view");
  const [sending, setSending] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shareUrl = inviteUrl ?? `${window.location.origin}/?view=calendar`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Wired to the real workspace-invite API — no dead buttons.
  const handleSendInvite = async () => {
    if (!activeWorkspace) {
      setError("No active workspace selected");
      return;
    }
    if (!email.trim()) {
      setError("Enter an email address");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const created = await api.createWorkspaceInvite(activeWorkspace.id, {
        email: email.trim(),
        role,
      });
      setInviteUrl(created.invite_url);
      toast.success(`Invite sent to ${email.trim()}`);
      setEmail("");
    } catch (e) {
      console.error("Failed to send calendar invite:", e);
      setError(e instanceof Error ? e.message : "Failed to send invite");
      toast.error("Failed to send invite");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-neutral-100 text-[13px] font-['Lexend:SemiBold',_sans-serif]">{t("calendarPage.shareCalendar")}</span>
        <button onClick={onClose} className="text-neutral-600 hover:text-neutral-300 transition-colors">
          <X size={14} />
        </button>
      </div>
      <p className="text-neutral-500 text-[12px] mb-3 leading-relaxed">{t("calendarPage.shareCalendarDesc")}</p>
      <div className="flex items-center gap-2 p-2.5 bg-neutral-800/40 rounded-lg mb-3">
        <span className="text-neutral-400 text-[11px] flex-1 truncate">{shareUrl}</span>
        <button onClick={handleCopy} className="shrink-0 text-indigo-400 hover:text-indigo-300 transition-colors">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <div className="space-y-2">
        <div className="text-neutral-600 text-[11px] mb-1">{t("calendarPage.accessLevel")}</div>
        {[
          { value: "view", label: t("calendarPage.viewOnly") },
          { value: "comment", label: t("calendarPage.viewAndComment") },
          { value: "edit", label: t("calendarPage.fullAccess") },
        ].map((level) => (
          <label key={level.value} className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="radio"
              name="access"
              checked={accessLevel === level.value}
              onChange={() => setAccessLevel(level.value)}
              className="accent-indigo-500"
            />
            <span className="text-neutral-400 text-[12px]">{level.label}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@company.com"
          className="flex-1 min-w-0 bg-neutral-800/40 border border-neutral-800 rounded-lg px-3 py-2 text-[12px] text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-indigo-500/60"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as api.WorkspaceRole)}
          className="bg-neutral-800/40 border border-neutral-800 rounded-lg px-2 py-2 text-[12px] text-neutral-200 outline-none"
        >
          <option value="member">Member</option>
          <option value="owner">Owner</option>
        </select>
      </div>
      {error && <p role="alert" className="text-red-400 text-[11px] mt-2">{error}</p>}
      <button
        onClick={handleSendInvite}
        disabled={sending || !email.trim()}
        className="mt-3 w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[12px] py-2 rounded-lg transition-colors"
      >
        {sending ? "Sending…" : t("calendarPage.sendInvite")}
      </button>
    </div>
  );
}

export function CalendarPage() {
  const { t } = useLang();
  const { subSection } = useNavigation();
  const { activeWorkspace } = useWorkspace();
  const [view, setView] = useState<CalendarView>("month");
  // Integer month offset from the current month — prev/next are always enabled.
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(TODAY_DAY);
  const [serverEvents, setServerEvents] = useState<Record<string, CalEvent[]>>({});
  const [events, setEvents] = useState<Record<number, CalEvent[]>>({});
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [highlightedEvent, setHighlightedEvent] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Race guard: only the latest calendar fetch may write state.
  const requestSeqRef = useRef(0);
  // Temp ids of optimistic events with no server record yet (delete skips API).
  const tempIdsRef = useRef<Set<string>>(new Set());

  // Month derived from the offset — unbounded navigation.
  const baseDate = new Date(CUR_Y, CUR_M1 - 1 + monthOffset, 1);
  const curY = baseDate.getFullYear();
  const curM1 = baseDate.getMonth() + 1;
  const monthKey = `${curY}-${curM1}`;
  const meta = buildMeta(curY, curM1);
  const [, , daysInMonth, startDay, monthLabel] = meta;
  const isCurrentMonth = monthKey === CUR_KEY;
  const monthShort = monthLabel.split(" ")[0];
  const monthYear = monthLabel.split(" ")[1];

  // Ref mirror so the realtime callback always refreshes the current month.
  const monthKeyRef = useRef(monthKey);
  monthKeyRef.current = monthKey;

  useEffect(() => {
    const seq = ++requestSeqRef.current;
    api.getCalendarEvents().then((data) => {
      if (seq !== requestSeqRef.current) return;
      setServerEvents(data as Record<string, CalEvent[]>);
      setEvents(serverEventsToLocal(data as Record<string, CalEvent[]>, monthKeyRef.current));
    }).catch((e) => {
      if (seq !== requestSeqRef.current) return;
      console.error("Failed to load calendar events:", e);
      toast.error("Failed to load calendar events");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtimeWorkspace(activeWorkspace?.id ?? null, (table) => {
    if (table === "calendar_events") {
      const targetKey = monthKeyRef.current;
      const seq = ++requestSeqRef.current;
      api.getCalendarEvents().then((data) => {
        if (seq !== requestSeqRef.current) return;
        setServerEvents(data as Record<string, CalEvent[]>);
        setEvents(serverEventsToLocal(data as Record<string, CalEvent[]>, targetKey));
      }).catch((e) => console.error("Realtime calendar refresh error:", e));
    }
  });

  // Clear the highlight timer on unmount so no setState fires after unload.
  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  // Clamp the selected day whenever the visible month changes so we never
  // hold (or emit) an invalid key like 2026-2-31.
  useEffect(() => {
    setSelectedDay((d) => Math.min(d, daysInMonthFor(monthKeyRef.current)));
  }, [monthKey]);

  const flashHighlight = (id: string) => {
    setHighlightedEvent(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedEvent(null), 3000);
  };

  useEffect(() => {
    if (subSection === "month") { setView("month"); setHighlightedEvent(null); }
    else if (subSection === "week") { setView("week"); setHighlightedEvent(null); }
    else if (subSection === "day") { setView("day"); setHighlightedEvent(null); }
    else if (subSection === "today") { setView("day"); setSelectedDay(TODAY_DAY); setMonthOffset(0); setHighlightedEvent(null); }
    else if (subSection === "upcoming") { setView("month"); setMonthOffset(0); setHighlightedEvent(null); }
    else if (subSection === "new-event") { setShowNewEvent(true); }
    else if (subSection === "share-calendar") { setShowShare(true); setView("month"); }
    else if (subSection.startsWith("event-")) {
      const slug = subSection.slice("event-".length);
      // Resolve against ALL loaded events, not just today's.
      let foundKey: string | null = null;
      let found: CalEvent | null = null;
      for (const [key, evts] of Object.entries(serverEvents)) {
        const match = evts.find((ev) => slugify(ev.title) === slug);
        if (match) { foundKey = key; found = match; break; }
      }
      if (foundKey && found) {
        const day = serverKeyToDay(foundKey);
        const [fy, fm] = foundKey.split("-").map(Number);
        setMonthOffset((fy - CUR_Y) * 12 + (fm - CUR_M1));
        setView("day");
        setSelectedDay(day);
        flashHighlight(eventId(found));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subSection, serverEvents]);

  const shiftMonth = (delta: number) => {
    const nextOffset = monthOffset + delta;
    const d = new Date(CUR_Y, CUR_M1 - 1 + nextOffset, 1);
    const nextKey = `${d.getFullYear()}-${d.getMonth() + 1}`;
    setMonthOffset(nextOffset);
    setSelectedDay((prev) => Math.min(prev, daysInMonthFor(nextKey)));
    setEvents(serverEventsToLocal(serverEvents, nextKey));
  };
  const prevMonth = () => shiftMonth(-1);
  const nextMonth = () => shiftMonth(1);

  // Select a full "Y-M-D" date key (e.g. from a week/day cell): syncs the
  // month offset to the clicked date's month and clamps the day, so the
  // month grid, selectedKey, and day view never disagree. Invalid keys are
  // ignored.
  const selectFullDateKey = (key: string) => {
    const parts = key.split("-").map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) return;
    const [y, m, d] = parts;
    if (m < 1 || m > 12) return;
    const dim = daysInMonthFor(`${y}-${m}`);
    if (d < 1 || d > dim) return;
    setMonthOffset((y - CUR_Y) * 12 + (m - CUR_M1));
    setSelectedDay(Math.min(d, dim));
  };

  // NewEventModal still emits the legacy { title, tag, color } shape; map
  // `tag` → `time` here so all stored + transmitted events use the contract.
  const handleAddEvent = async (day: number, event: { title: string; tag: string; color: string; time?: string }) => {
    const dim = daysInMonthFor(monthKey);
    if (!Number.isInteger(day) || day < 1 || day > dim) {
      toast.error(`Enter a valid day (1–${dim})`);
      throw new Error(`Invalid day ${day} for ${monthKey}`);
    }
    const dateKey = dayToServerKey(monthKey, day);
    if (!dateKey) {
      toast.error(`Enter a valid day (1–${dim})`);
      throw new Error(`Invalid day ${day} for ${monthKey}`);
    }
    const time = (event.time ?? event.tag ?? "").trim();
    const color = event.color ?? "";
    // Temp id so optimistic rows key by id (never title) and can be replaced
    // by reference once the server responds.
    const tempId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const localEvent = { id: tempId, title: event.title, time, color } as CalEvent;
    tempIdsRef.current.add(tempId);
    // Optimistic insert with rollback on failure.
    const prevEvents = events;
    const prevServer = serverEvents;
    setEvents((prev) => ({ ...prev, [day]: [...(prev[day] || []), localEvent] }));
    setServerEvents((prev) => ({ ...prev, [dateKey]: [...(prev[dateKey] || []), localEvent] }));
    setSelectedDay(day);
    try {
      const created = await api.createCalendarEvent(dateKey, { title: event.title, time, color });
      // Replace the optimistic placeholder with the single object returned.
      if (created && (created as CalEvent).id) {
        const saved = created as CalEvent;
        tempIdsRef.current.delete(tempId);
        setEvents((prev) => ({
          ...prev,
          [day]: (prev[day] || []).map((ev) => (ev === localEvent ? saved : ev)),
        }));
        setServerEvents((prev) => ({
          ...prev,
          [dateKey]: (prev[dateKey] || []).map((ev) => (ev === localEvent ? saved : ev)),
        }));
      }
    } catch (e) {
      tempIdsRef.current.delete(tempId);
      setEvents(prevEvents);
      setServerEvents(prevServer);
      console.error("Failed to save event:", e);
      toast.error("Failed to save event");
      throw e;
    }
  };

  // Delete is the only mutation the api layer offers (no update endpoint),
  // so edit is not wired — deletes are fully supported with rollback.
  // Matches server events by id only (never title): two events may share a
  // title. Temp-id rows have no server record yet, so deleting them skips
  // the API call.
  const handleDeleteEvent = async (dateKey: string, id: string) => {
    const day = serverKeyToDay(dateKey);
    const prevEvents = events;
    const prevServer = serverEvents;
    const isTemp = tempIdsRef.current.has(id);
    setEvents((prev) => ({ ...prev, [day]: (prev[day] || []).filter((ev) => ev.id !== id) }));
    setServerEvents((prev) => ({ ...prev, [dateKey]: (prev[dateKey] || []).filter((ev) => ev.id !== id) }));
    if (isTemp) {
      tempIdsRef.current.delete(id);
      return;
    }
    try {
      await api.deleteCalendarEvent(id);
      toast.success("Event deleted");
    } catch (e) {
      setEvents(prevEvents);
      setServerEvents(prevServer);
      console.error("Failed to delete event:", e);
      toast.error("Failed to delete event");
    }
  };

  const calendarCells: (number | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const totalCells = Math.ceil(calendarCells.length / 7) * 7;
  const paddedCells = [...calendarCells, ...Array(totalCells - calendarCells.length).fill(null)];

  // Full-date key for the selected day — never a bare day-of-month.
  // Validated against the visible month length (clamped upstream); guards
  // against emitting keys like 2026-2-31 when the month changes.
  const safeSelectedDay = Number.isInteger(selectedDay) ? Math.min(Math.max(selectedDay, 1), daysInMonth) : 1;
  const selectedKey = `${monthKey}-${safeSelectedDay}`;
  const selectedDayEvents = serverEvents[selectedKey] ?? events[safeSelectedDay] ?? [];
  const selectedAllDay = selectedDayEvents.filter(isAllDay);

  // All-day events across the visible week (keyed by full date).
  const weekAllDayByKey: Record<string, CalEvent[]> = {};
  for (const d of weekDays) {
    weekAllDayByKey[d.key] = (serverEvents[d.key] ?? []).filter(isAllDay);
  }
  const weekHasAllDay = Object.values(weekAllDayByKey).some((l) => l.length > 0);

  const upcomingDays = Object.keys(events)
    .map(Number)
    .sort((a, b) => a - b)
    .filter((d) => !isCurrentMonth || d >= TODAY_DAY)
    .map((d) => ({ day: d, evts: events[d] || [] }))
    .filter((g) => g.evts.length > 0);

  const viewTabs: { key: CalendarView; label: string }[] = [
    { key: "month", label: t("calendarPage.month") },
    { key: "week", label: t("calendarPage.week") },
    { key: "day", label: t("calendarPage.day") },
  ];

  return (
    <div className="flex flex-col lg:flex-row h-full font-['Lexend:Regular',_sans-serif]">
      {/* Main area */}
      <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 overflow-y-auto min-w-0">
        {showShare && <SharePanel onClose={() => setShowShare(false)} />}

        {/* Header */}
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div>
            <h1 className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif] text-[18px] lg:text-[22px] leading-tight mb-1">
              {view === "month" ? monthLabel : view === "week" ? WEEK_LABEL : `${monthShort} ${selectedDay}, ${monthYear}`}
            </h1>
            <p className="text-neutral-500 text-[12px] lg:text-[13px]">
              {t("calendarPage.eventsThisMonth").replace("{count}", String(Object.values(events).flat().length))}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View switcher */}
            <div className="flex items-center bg-neutral-800/60 rounded-lg p-0.5">
              {viewTabs.map((v) => (
                <button key={v.key} onClick={() => { setView(v.key); setHighlightedEvent(null); }}
                  className={`px-2.5 py-1.5 rounded-md text-[12px] transition-colors ${view === v.key ? "bg-neutral-700 text-neutral-200" : "text-neutral-500 hover:text-neutral-300"}`}>
                  {v.label}
                </button>
              ))}
            </div>
            {view === "month" && (
              <>
                <button onClick={prevMonth} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 w-8 h-8 rounded-lg transition-colors flex items-center justify-center">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => { setMonthOffset(0); setSelectedDay(TODAY_DAY); setEvents(serverEventsToLocal(serverEvents, CUR_KEY)); }} className="border border-neutral-800 bg-neutral-800/40 text-neutral-200 text-[12px] px-3 py-1.5 rounded-lg hover:bg-neutral-700/40 transition-colors">{t("calendarPage.today")}</button>
                <button onClick={nextMonth} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 w-8 h-8 rounded-lg transition-colors flex items-center justify-center">
                  <ChevronRight size={14} />
                </button>
              </>
            )}
            {view === "day" && (
              <>
                <button onClick={() => setSelectedDay((d) => Math.max(1, d - 1))} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 w-8 h-8 rounded-lg transition-colors flex items-center justify-center">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setSelectedDay(TODAY_DAY)} className="border border-neutral-800 bg-neutral-800/40 text-neutral-200 text-[12px] px-3 py-1.5 rounded-lg hover:bg-neutral-700/40 transition-colors">{t("calendarPage.today")}</button>
                <button onClick={() => setSelectedDay((d) => Math.min(daysInMonth, d + 1))} className="border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 w-8 h-8 rounded-lg transition-colors flex items-center justify-center">
                  <ChevronRight size={14} />
                </button>
              </>
            )}
            <button onClick={() => setShowNewEvent(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] lg:text-[13px] px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5">
              <Plus size={13} /> {t("calendarPage.event")}
            </button>
          </div>
        </div>

        {/* Month View */}
        {view === "month" && (
          <>
            <div className="grid grid-cols-7 mb-2">
              {weekdays.map((d) => (
                <div key={d} className="text-center text-neutral-600 text-[11px] py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-neutral-800/30 rounded-xl overflow-hidden border border-neutral-800/30 flex-1">
              {paddedCells.map((day, i) => {
                const isToday = day === TODAY_DAY && isCurrentMonth;
                const isSelected = day === selectedDay;
                const dayEvents = day ? events[day] : [];
                return (
                  <div
                    key={i}
                    onClick={() => day && setSelectedDay(day)}
                    className={`bg-[#0f0f0f] p-1.5 lg:p-2 min-h-[60px] lg:min-h-[80px] flex flex-col transition-colors ${day ? "cursor-pointer hover:bg-neutral-800/20" : ""} ${isSelected && !isToday ? "bg-neutral-800/30" : ""}`}
                  >
                    {day && (
                      <>
                        <div className="flex items-center justify-start mb-1">
                          <span className={`text-[11px] lg:text-[12px] w-5 h-5 lg:w-6 lg:h-6 flex items-center justify-center rounded-full ${isToday ? "bg-indigo-500 text-white font-['Lexend:SemiBold',_sans-serif]" : "text-neutral-400"}`}>
                            {day}
                          </span>
                        </div>
                        <div className="space-y-0.5 flex-1">
                          {dayEvents?.slice(0, 2).map((ev) => (
                            <div key={ev.id ?? ev.title} className="rounded px-1 py-0.5 text-[9px] lg:text-[10px] truncate" style={{ backgroundColor: `${ev.color}22`, color: ev.color }}>
                              {ev.title}
                            </div>
                          ))}
                          {dayEvents && dayEvents.length > 2 && (
                            <div className="text-neutral-600 text-[9px] lg:text-[10px] px-1">+{dayEvents.length - 2}</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Week View */}
        {view === "week" && (
          <div className="flex flex-col flex-1 overflow-auto">
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-neutral-800/40 mb-0">
              <div />
              {weekDays.map((d) => (
                <div key={d.key} onClick={() => { selectFullDateKey(d.key); setView("day"); }}
                  className={`text-center py-2.5 cursor-pointer hover:bg-neutral-800/20 transition-colors ${d.date === TODAY_DAY ? "text-indigo-400" : "text-neutral-400"}`}>
                  <div className="text-[11px] mb-0.5">{d.label}</div>
                  <div className={`text-[15px] font-['Lexend:SemiBold',_sans-serif] w-8 h-8 rounded-full flex items-center justify-center mx-auto ${d.date === TODAY_DAY ? "bg-indigo-500 text-white" : "text-neutral-200"}`}>{d.date}</div>
                </div>
              ))}
            </div>
            {/* Dedicated all-day row so all-day events are visible */}
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-neutral-800/40 bg-neutral-800/10 min-h-[40px]">
              <div className="text-neutral-600 text-[10px] pt-2 px-1 shrink-0">All day</div>
              {weekDays.map((d) => (
                <div key={d.key} className="border-l border-neutral-800/20 p-1 space-y-0.5">
                  {(weekAllDayByKey[d.key] ?? []).map((ev) => (
                    <div key={ev.id ?? ev.title} className="rounded px-1.5 py-1 text-[10px] truncate" style={{ backgroundColor: `${ev.color}22`, color: ev.color, borderLeft: `2px solid ${ev.color}` }}>
                      {ev.title}
                    </div>
                  ))}
                  {(!weekAllDayByKey[d.key] || weekAllDayByKey[d.key].length === 0) && weekHasAllDay && (
                    <div className="text-neutral-800 text-[10px] px-1.5 select-none">–</div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {timeSlots.map((slot) => {
                const hour = slotHour(slot);
                return (
                  <div key={slot} className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-neutral-800/20 min-h-[52px]">
                    <div className="text-neutral-700 text-[10px] pt-1 px-1 shrink-0">{slot}</div>
                    {weekDays.map((d) => {
                      // Full-date lookup — no day-of-month collisions.
                      const dayEvts = (serverEvents[d.key] || []).filter((ev) => !isAllDay(ev) && timeToHour(eventTime(ev)) === hour);
                      return (
                        <div key={d.key} className={`border-l border-neutral-800/20 p-0.5 hover:bg-neutral-800/10 transition-colors ${d.date === TODAY_DAY ? "bg-neutral-800/5" : ""}`}>
                          {dayEvts.map((ev) => (
                            <div key={ev.id ?? ev.title} className="rounded px-1.5 py-1 text-[10px] mb-0.5 truncate cursor-pointer" style={{ backgroundColor: `${ev.color}22`, color: ev.color, borderLeft: `2px solid ${ev.color}` }}>
                              {ev.title}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Day View */}
        {view === "day" && (
          <div className="flex flex-col flex-1">
            {/* Day header */}
            <div className="flex items-center gap-2 mb-4 overflow-x-auto">
              {weekdays.map((wd, i) => {
                const d = weekDays[i];
                return (
                  <button key={wd} onClick={() => selectFullDateKey(d.key)}
                    className={`flex flex-col items-center px-2.5 py-2 rounded-lg transition-colors shrink-0 ${d.date === selectedDay ? "bg-indigo-600 text-white" : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/40"}`}>
                    <span className="text-[10px] mb-0.5">{wd}</span>
                    <span className="text-[13px] font-['Lexend:SemiBold',_sans-serif]">{d.date}</span>
                  </button>
                );
              })}
            </div>
            {/* Dedicated all-day row */}
            <div className="flex gap-3 border border-neutral-800/40 bg-neutral-800/10 rounded-lg px-3 py-2 mb-3">
              <div className="w-16 shrink-0 text-neutral-500 text-[11px] pt-1">All day</div>
              <div className="flex-1 flex flex-wrap gap-1.5">
                {selectedAllDay.length > 0 ? selectedAllDay.map((ev) => {
                  const id = ev.id ?? ev.title;
                  const isHighlighted = highlightedEvent === id;
                  return (
                    <div key={id}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] ${isHighlighted ? "ring-2" : ""}`}
                      style={{ backgroundColor: `${ev.color}22`, color: ev.color, borderLeft: `2px solid ${ev.color}` }}>
                      <span className="truncate max-w-[180px]">{ev.title}</span>
                      {ev.id && (
                        <button
                          onClick={() => void handleDeleteEvent(selectedKey, ev.id as string)}
                          aria-label={`Delete ${ev.title}`}
                          className="opacity-70 hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  );
                }) : (
                  <span className="text-neutral-700 text-[11px] py-1">No all-day events</span>
                )}
              </div>
            </div>
            {/* Time slots */}
            <div className="flex-1 overflow-y-auto space-y-0">
              {timeSlots.map((slot) => {
                const hour = slotHour(slot);
                const slotEvts = selectedDayEvents.filter((ev) => !isAllDay(ev) && timeToHour(eventTime(ev)) === hour);
                return (
                  <div key={slot} className="flex gap-3 border-b border-neutral-800/20 min-h-[56px] py-1">
                    <div className="w-16 shrink-0 text-neutral-600 text-[11px] pt-1">{slot}</div>
                    <div className="flex-1 space-y-1">
                      {slotEvts.map((ev) => {
                        const id = ev.id ?? ev.title;
                        const isHighlighted = highlightedEvent === id;
                        return (
                          <div key={id}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all ${isHighlighted ? "ring-2 scale-[1.01]" : "hover:opacity-90"}`}
                            style={{
                              backgroundColor: isHighlighted ? `${ev.color}30` : `${ev.color}18`,
                              borderLeft: `3px solid ${ev.color}`,
                              boxShadow: isHighlighted ? `0 0 0 2px ${ev.color}60` : undefined,
                            }}>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] truncate" style={{ color: ev.color }}>{ev.title}</div>
                              <div className="text-neutral-600 text-[11px] mt-0.5">{eventTime(ev)}</div>
                            </div>
                            {ev.id && (
                              <button
                                onClick={() => void handleDeleteEvent(selectedKey, ev.id as string)}
                                aria-label={`Delete ${ev.title}`}
                                className="text-neutral-500 hover:text-red-400 transition-colors shrink-0"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                            {isHighlighted && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${ev.color}30`, color: ev.color }}>
                                {t("calendarPage.selected")}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right mini-sidebar */}
      <div className="w-full lg:w-60 xl:w-64 border-t lg:border-t-0 lg:border-l border-neutral-800/40 p-4 lg:p-5 overflow-y-auto shrink-0">
        <div className="text-neutral-50 text-[13px] font-['Lexend:SemiBold',_sans-serif] mb-4">
          {view === "day" ? `${monthShort} ${selectedDay}` : t("calendarPage.upcoming")}
        </div>
        {view === "day" ? (
          <div className="space-y-2">
            {selectedDayEvents.length > 0 ? (
              selectedDayEvents.map((ev) => {
                const id = ev.id ?? ev.title;
                const isHighlighted = highlightedEvent === id;
                return (
                  <div key={id}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg transition-all cursor-pointer ${isHighlighted ? "bg-neutral-700/50" : "bg-neutral-800/20 hover:bg-neutral-800/40"}`}
                    style={{ boxShadow: isHighlighted ? `0 0 0 1px ${ev.color}50` : undefined }}>
                    <div className="w-1 min-h-[28px] rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-neutral-200 text-[12px] truncate">{ev.title}</div>
                      <div className="text-neutral-600 text-[11px] mt-0.5">{eventTime(ev)}</div>
                    </div>
                    {ev.id && (
                      <button
                        onClick={() => void handleDeleteEvent(selectedKey, ev.id as string)}
                        aria-label={`Delete ${ev.title}`}
                        className="text-neutral-600 hover:text-red-400 transition-colors shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                    {isHighlighted && <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />}
                  </div>
                );
              })
            ) : (
              <div className="text-neutral-600 text-[12px]">{t("calendarPage.noEventsOnDay")}</div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {upcomingDays.length > 0 ? upcomingDays.map((group) => (
              <div key={`${monthKey}-${group.day}`}>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-neutral-500 text-[11px]">{monthShort}</span>
                  <span className="text-neutral-400 text-[12px]">{group.day}</span>
                  {group.day === TODAY_DAY && isCurrentMonth && <span className="text-indigo-400 text-[11px]">{t("calendarPage.today")}</span>}
                </div>
                <div className="space-y-1.5">
                  {group.evts.map((ev) => (
                    <div key={ev.id ?? ev.title} onClick={() => { setSelectedDay(group.day); setView("day"); }}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg bg-neutral-800/20 hover:bg-neutral-800/40 transition-colors cursor-pointer">
                      <div className="w-1 min-h-[28px] rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                      <div>
                        <div className="text-neutral-200 text-[12px]">{ev.title}</div>
                        <div className="text-neutral-600 text-[11px] mt-0.5">{eventTime(ev)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )) : (
              <div className="text-neutral-600 text-[12px]">{t("calendarPage.noUpcomingEvents")}</div>
            )}
          </div>
        )}
      </div>

      <NewEventModal
        open={showNewEvent}
        onClose={() => setShowNewEvent(false)}
        defaultDay={selectedDay}
        daysInMonth={daysInMonth}
        monthLabel={monthLabel}
        onAdd={handleAddEvent}
      />
    </div>
  );
}
