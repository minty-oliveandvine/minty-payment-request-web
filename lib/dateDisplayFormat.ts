/**
 * This app's own date helpers. Everything else about days - `formatDay` ("05 Sep 2026"),
 * `formatInstantDay`, `isoDateInTimeZone(timeZone, date)`, `HK_TIME_ZONE`, `MONTHS` - is
 * `@minty/shared/dates` (owner 2026-10-21: one shared module).
 */

import { MONTHS, formatDay } from "@minty/shared/dates";

/** A browser-local `Date` (a picker's, the activity log's) shown as its local calendar day. */
export function formatLocalDateForDisplay(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return formatDay(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

/** Today on the person's own clock, as `yyyy-mm-dd` - never `toISOString()`, which is UTC's day. */
export function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The month a three-letter token names (any case), as 0-11, or -1. */
function monthIndex(token: string): number {
  return MONTHS.findIndex((mo) => mo.toLowerCase() === token.toLowerCase());
}

/** `y-m-d` as `YYYY-MM-DD` when that day exists on the calendar, else null. */
function calendarIso(y: number, monthIdx: number, d: number): string | null {
  if (monthIdx < 0 || !Number.isFinite(d) || !Number.isFinite(y)) return null;
  const dt = new Date(y, monthIdx, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== monthIdx || dt.getDate() !== d) return null;
  return `${y}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * What a person typed back into `YYYY-MM-DD`: "05 Sep 2026", "05/Sep/2026" or an ISO day (a
 * datetime's day part counts). "" for blank, null for anything that is not a real day.
 */
export function parseDdMmmYyyyToIso(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "";
  const maybeIso = t.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(maybeIso)) {
    return formatDay(maybeIso) ? maybeIso : null;
  }
  const match =
    /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(t) ??
    /^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/.exec(t);
  if (!match) return null;
  return calendarIso(
    Number.parseInt(match[3], 10),
    monthIndex(match[2]),
    Number.parseInt(match[1], 10),
  );
}
