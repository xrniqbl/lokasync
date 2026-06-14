import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Copy, Check, X } from "lucide-react";
import { NewEventModal } from "./modals/NewEventModal";
import { useNavigation } from "./NavigationContext";
import * as api from "../utils/api";
import { useLang } from "../i18n";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useRealtimeWorkspace } from "../realtime";

type CalendarEvent = { title: string; tag: string; color: string };

// Convert server date key "2026-6-8" → numeric day (for current month display)
function serverKeyToDay(key: string): number {
  const parts = key.split("-");
  return parseInt(parts[parts.length - 1]);
}

function dayToServerKey(monthKey: string, day: number): string {
  const [year, month] = monthKey.split("-");
  return `${year}-${month}-${day}`;
}

// Convert server Record<"2026-6-8", events[]> → local Record<day, events[]>
function serverEventsToLocal(serverEvents: Record<string, CalendarEvent[]>, monthKey: string): Record<number, CalendarEvent[]> {
  const [year, month] = monthKey.split("-");
  const prefix = `${year}-${month}-`;
  const result: Record<number, CalendarEvent[]> = {};
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
const [PREV_Y, PREV_M1] = CUR_M1 === 1 ? [CUR_Y - 1, 12] : [CUR_Y, CUR_M1 - 1];
const [NEXT_Y, NEXT_M1] = CUR_M1 === 12 ? [CUR_Y + 1, 1] : [CUR_Y, CUR_M1 + 1];
const PREV_KEY = `${PREV_Y}-${PREV_M1}`;
const CUR_KEY = `${CUR_Y}-${CUR_M1}`;
const NEXT_KEY = `${NEXT_Y}-${NEXT_M1}`;
const MONTH_ORDER = [PREV_KEY, CUR_KEY, NEXT_KEY];

const monthMeta: Record<string, [number, number, number, number, string]> = {
  [PREV_KEY]: buildMeta(PREV_Y, PREV_M1),
  [CUR_KEY]: buildMeta(CUR_Y, CUR_M1),
  [NEXT_KEY]: buildMeta(NEXT_Y, NEXT_M1),
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Current week (Monday-first), derived from today's date
const { weekDays, WEEK_LABEL } = (() => {
  const monday = new Date(NOW);
  monday.setDate(NOW.getDate() - ((NOW.getDay() + 6) % 7));
  const days = weekdays.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { label, date: d.getDate() };
  });
  return {
    weekDays: days,
    WEEK_LABEL: `Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
  };
})();

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const timeSlots = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"];

function tagToHour(tag: string): number {
  if (tag === "All day") return -1;
  const m = tag.match(/(\d+):(\d+)\s*(AM|PM)/i);
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
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/?view=calendar`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        {[t("calendarPage.viewOnly"), t("calendarPage.viewAndComment"), t("calendarPage.fullAccess")].map((level) => (
          <label key={level} className="flex items-center gap-2.5 cursor-pointer">
            <input type="radio" name="access" defaultChecked={level === t("calendarPage.viewOnly")} className="accent-indigo-500" />
            <span className="text-neutral-400 text-[12px]">{level}</span>
          </label>
        ))}
      </div>
      <button className="mt-3 w-full bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] py-2 rounded-lg transition-colors">
        {t("calendarPage.sendInvite")}
      </button>
    </div>
  );
}

export function CalendarPage() {
  const { t } = useLang();
  const { subSection } = useNavigation();
  const { activeWorkspace } = useWorkspace();
  const [view, setView] = useState<CalendarView>("month");
  const [monthKey, setMonthKey] = useState(CUR_KEY);
  const [selectedDay, setSelectedDay] = useState(TODAY_DAY);
  const [serverEvents, setServerEvents] = useState<Record<string, CalendarEvent[]>>({});
  const [events, setEvents] = useState<Record<number, CalendarEvent[]>>({});
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [highlightedEvent, setHighlightedEvent] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.getCalendarEvents().then((data) => {
      setServerEvents(data);
      setEvents(serverEventsToLocal(data, monthKey));
    }).catch((e) => {
      console.log("Failed to load calendar events:", e);
      toast.error("Failed to load calendar events");
    });
  }, []);

  useRealtimeWorkspace(activeWorkspace?.id ?? null, (table) => {
    if (table === "calendar_events") {
      api.getCalendarEvents().then((data) => {
        setServerEvents(data);
        setEvents(serverEventsToLocal(data, monthKey));
      }).catch((e) => console.log("Realtime calendar refresh error:", e));
    }
  });

  useEffect(() => {
    if (subSection === "month") { setView("month"); setHighlightedEvent(null); }
    else if (subSection === "week") { setView("week"); setHighlightedEvent(null); }
    else if (subSection === "day") { setView("day"); setHighlightedEvent(null); }
    else if (subSection === "today") { setView("day"); setSelectedDay(TODAY_DAY); setMonthKey(CUR_KEY); setHighlightedEvent(null); }
    else if (subSection === "upcoming") { setView("month"); setMonthKey(CUR_KEY); setHighlightedEvent(null); }
    else if (subSection === "new-event") { setShowNewEvent(true); }
    else if (subSection === "share-calendar") { setShowShare(true); setView("month"); }
    else if (subSection.startsWith("event-")) {
      const slug = subSection.slice("event-".length);
      const todayEvts = serverEvents[`${CUR_KEY}-${TODAY_DAY}`] ?? [];
      const match = todayEvts.find((ev) => slugify(ev.title) === slug);
      if (match) {
        setView("day");
        setSelectedDay(TODAY_DAY);
        setMonthKey(CUR_KEY);
        setHighlightedEvent(match.title);
        if (highlightTimer.current) clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => setHighlightedEvent(null), 3000);
      }
    }
  }, [subSection, serverEvents]);

  const meta = monthMeta[monthKey] ?? monthMeta[CUR_KEY];
  const [, , daysInMonth, startDay, monthLabel] = meta;
  const isCurrentMonth = monthKey === CUR_KEY;
  const monthShort = monthLabel.split(" ")[0];
  const monthYear = monthLabel.split(" ")[1];

  const shiftMonth = (delta: number) => {
    const idx = MONTH_ORDER.indexOf(monthKey);
    const newKey = MONTH_ORDER[Math.min(MONTH_ORDER.length - 1, Math.max(0, idx + delta))];
    setMonthKey(newKey);
    setEvents(serverEventsToLocal(serverEvents, newKey));
  };
  const prevMonth = () => shiftMonth(-1);
  const nextMonth = () => shiftMonth(1);

  const handleAddEvent = async (day: number, event: CalendarEvent) => {
    const dateKey = dayToServerKey(monthKey, day);
    setEvents((prev) => ({ ...prev, [day]: [...(prev[day] || []), event] }));
    setServerEvents((prev) => ({ ...prev, [dateKey]: [...(prev[dateKey] || []), event] }));
    setSelectedDay(day);
    try {
      await api.createCalendarEvent(dateKey, event);
    } catch (e) {
      console.log("Failed to save event:", e);
      toast.error("Failed to save event");
    }
  };

  const calendarCells: (number | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const totalCells = Math.ceil(calendarCells.length / 7) * 7;
  const paddedCells = [...calendarCells, ...Array(totalCells - calendarCells.length).fill(null)];

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
                <button onClick={prevMonth} disabled={monthKey === PREV_KEY} className="border border-neutral-800 hover:bg-neutral-800 disabled:opacity-30 text-neutral-400 hover:text-neutral-200 w-8 h-8 rounded-lg transition-colors flex items-center justify-center">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => { setMonthKey(CUR_KEY); setSelectedDay(TODAY_DAY); setEvents(serverEventsToLocal(serverEvents, CUR_KEY)); }} className="border border-neutral-800 bg-neutral-800/40 text-neutral-200 text-[12px] px-3 py-1.5 rounded-lg hover:bg-neutral-700/40 transition-colors">{t("calendarPage.today")}</button>
                <button onClick={nextMonth} disabled={monthKey === NEXT_KEY} className="border border-neutral-800 hover:bg-neutral-800 disabled:opacity-30 text-neutral-400 hover:text-neutral-200 w-8 h-8 rounded-lg transition-colors flex items-center justify-center">
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
                          {dayEvents?.slice(0, 2).map((ev, j) => (
                            <div key={j} className="rounded px-1 py-0.5 text-[9px] lg:text-[10px] truncate" style={{ backgroundColor: `${ev.color}22`, color: ev.color }}>
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
                <div key={d.label} onClick={() => { setSelectedDay(d.date); setView("day"); }}
                  className={`text-center py-2.5 cursor-pointer hover:bg-neutral-800/20 transition-colors ${d.date === TODAY_DAY ? "text-indigo-400" : "text-neutral-400"}`}>
                  <div className="text-[11px] mb-0.5">{d.label}</div>
                  <div className={`text-[15px] font-['Lexend:SemiBold',_sans-serif] w-8 h-8 rounded-full flex items-center justify-center mx-auto ${d.date === TODAY_DAY ? "bg-indigo-500 text-white" : "text-neutral-200"}`}>{d.date}</div>
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
                      const dayEvts = (events[d.date] || []).filter((ev) => tagToHour(ev.tag) === hour);
                      return (
                        <div key={d.label} className={`border-l border-neutral-800/20 p-0.5 hover:bg-neutral-800/10 transition-colors ${d.date === TODAY_DAY ? "bg-neutral-800/5" : ""}`}>
                          {dayEvts.map((ev, j) => (
                            <div key={j} className="rounded px-1.5 py-1 text-[10px] mb-0.5 truncate cursor-pointer" style={{ backgroundColor: `${ev.color}22`, color: ev.color, borderLeft: `2px solid ${ev.color}` }}>
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
                  <button key={wd} onClick={() => setSelectedDay(d.date)}
                    className={`flex flex-col items-center px-2.5 py-2 rounded-lg transition-colors shrink-0 ${d.date === selectedDay ? "bg-indigo-600 text-white" : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/40"}`}>
                    <span className="text-[10px] mb-0.5">{wd}</span>
                    <span className="text-[13px] font-['Lexend:SemiBold',_sans-serif]">{d.date}</span>
                  </button>
                );
              })}
            </div>
            {/* Time slots */}
            <div className="flex-1 overflow-y-auto space-y-0">
              {timeSlots.map((slot) => {
                const hour = slotHour(slot);
                const slotEvts = (events[selectedDay] || []).filter((ev) => tagToHour(ev.tag) === hour);
                const allDayEvts = hour === 8 ? (events[selectedDay] || []).filter((ev) => ev.tag === "All day") : [];
                const display = hour === 8 ? [...allDayEvts, ...slotEvts] : slotEvts;
                return (
                  <div key={slot} className="flex gap-3 border-b border-neutral-800/20 min-h-[56px] py-1">
                    <div className="w-16 shrink-0 text-neutral-600 text-[11px] pt-1">{slot}</div>
                    <div className="flex-1 space-y-1">
                      {display.map((ev, j) => {
                        const isHighlighted = highlightedEvent === ev.title;
                        return (
                          <div key={j}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all ${isHighlighted ? "ring-2 scale-[1.01]" : "hover:opacity-90"}`}
                            style={{
                              backgroundColor: isHighlighted ? `${ev.color}30` : `${ev.color}18`,
                              borderLeft: `3px solid ${ev.color}`,
                              ringColor: isHighlighted ? ev.color : undefined,
                              boxShadow: isHighlighted ? `0 0 0 2px ${ev.color}60` : undefined,
                            }}>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] truncate" style={{ color: ev.color }}>{ev.title}</div>
                              <div className="text-neutral-600 text-[11px] mt-0.5">{ev.tag}</div>
                            </div>
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
            {(events[selectedDay] || []).length > 0 ? (
              (events[selectedDay] || []).map((ev, j) => {
                const isHighlighted = highlightedEvent === ev.title;
                return (
                  <div key={j}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg transition-all cursor-pointer ${isHighlighted ? "bg-neutral-700/50" : "bg-neutral-800/20 hover:bg-neutral-800/40"}`}
                    style={{ boxShadow: isHighlighted ? `0 0 0 1px ${ev.color}50` : undefined }}>
                    <div className="w-1 min-h-[28px] rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-neutral-200 text-[12px] truncate">{ev.title}</div>
                      <div className="text-neutral-600 text-[11px] mt-0.5">{ev.tag}</div>
                    </div>
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
              <div key={group.day}>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-neutral-500 text-[11px]">{monthShort}</span>
                  <span className="text-neutral-400 text-[12px]">{group.day}</span>
                  {group.day === TODAY_DAY && isCurrentMonth && <span className="text-indigo-400 text-[11px]">{t("calendarPage.today")}</span>}
                </div>
                <div className="space-y-1.5">
                  {group.evts.map((ev, j) => (
                    <div key={j} onClick={() => { setSelectedDay(group.day); setView("day"); }}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg bg-neutral-800/20 hover:bg-neutral-800/40 transition-colors cursor-pointer">
                      <div className="w-1 min-h-[28px] rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                      <div>
                        <div className="text-neutral-200 text-[12px]">{ev.title}</div>
                        <div className="text-neutral-600 text-[11px] mt-0.5">{ev.tag}</div>
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
        onAdd={handleAddEvent}
      />
    </div>
  );
}