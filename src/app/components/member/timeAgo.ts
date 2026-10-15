import type { DictPath } from "../../i18n";

type TFn = (path: DictPath, params?: Record<string, string | number>) => string;

/**
 * Single shared relative-time formatter for the member feeds.
 * Returns "—" for missing/invalid dates instead of "NaNd ago".
 */
export function timeAgo(isoString: string | null | undefined, t: TFn): string {
  if (!isoString) return "—";
  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) return "—";
  const diff = Date.now() - time;
  if (diff < 0) return t("memberHome.timeNow");
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("memberHome.timeNow");
  if (mins < 60) return t("memberHome.timeMinutesAgo", { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("memberHome.timeHoursAgo", { n: hrs });
  const days = Math.floor(hrs / 24);
  if (days === 1) return t("memberHome.timeYesterday");
  return t("memberHome.timeDaysAgo", { n: days });
}
