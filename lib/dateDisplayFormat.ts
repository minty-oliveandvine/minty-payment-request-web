const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function tryIsoYmdToCalendarParts(iso: string): { y: number; m: number; d: number } | null {
  const s = iso.trim();
  if (!s) return null;
  const ymd = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return { y, m, d };
}

export function formatIsoDateForDisplay(iso: string): string {
  const p = tryIsoYmdToCalendarParts(iso);
  if (!p) return "";
  const mon = MONTHS_SHORT[p.m - 1];
  return `${String(p.d).padStart(2, "0")} ${mon} ${p.y}`;
}

export function formatIsoDateAsDdMmmYyyy(iso: string): string {
  return formatIsoDateForDisplay(iso);
}

export function formatLocalDateForDisplay(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return formatIsoDateForDisplay(
    `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  );
}

/** Today on the person's own clock, as `yyyy-mm-dd` - never `toISOString()`, which is UTC's day. */
export function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The timezone bills are reckoned in — display and date filtering must agree on it. */
export const BILLING_TIME_ZONE = "Asia/Hong_Kong";

/**
 * The calendar date an instant falls on in `timeZone`, as `yyyy-mm-dd`.
 *
 * Needed because API timestamps are UTC: 2026-08-31T18:00:00Z is 1 Sep in Hong Kong.
 * Taking the first 10 characters of the raw string would call that 31 Aug, which is
 * what made the submitted-date column and its filter disagree. The ISO shape also
 * compares correctly with plain `<`/`>` against the filter's date inputs.
 */
export function isoDateInTimeZone(d: Date, timeZone: string): string {
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) return "";
  return `${y}-${m}-${day}`;
}

export function formatDateInTimeZoneForDisplay(d: Date, timeZone: string): string {
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).formatToParts(d);
  const dayRaw = parts.find((p) => p.type === "day")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const year = parts.find((p) => p.type === "year")?.value;
  if (!dayRaw || !month || !year) return "";
  const dNum = Number.parseInt(dayRaw, 10);
  if (!Number.isFinite(dNum)) return "";
  const mon = month.replace(/\.$/, "");
  return `${String(dNum).padStart(2, "0")} ${mon} ${year}`;
}

export function parseDdMmmYyyyToIso(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "";
  const maybeIso = t.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(maybeIso)) {
    return formatIsoDateForDisplay(maybeIso) ? maybeIso : null;
  }
  const space = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(t);
  if (space) {
    const d = Number.parseInt(space[1], 10);
    const monToken = space[2];
    const y = Number.parseInt(space[3], 10);
    const monthIdx = MONTHS_SHORT.findIndex((mo) => mo.toLowerCase() === monToken.toLowerCase());
    if (monthIdx < 0 || !Number.isFinite(d) || !Number.isFinite(y)) return null;
    const dt = new Date(y, monthIdx, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== monthIdx || dt.getDate() !== d) return null;
    return `${y}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const slash = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/.exec(t);
  if (!slash) return null;
  const d = Number.parseInt(slash[1], 10);
  const monToken = slash[2];
  const y = Number.parseInt(slash[3], 10);
  const monthIdx = MONTHS_SHORT.findIndex((mo) => mo.toLowerCase() === monToken.toLowerCase());
  if (monthIdx < 0 || !Number.isFinite(d) || !Number.isFinite(y)) return null;
  const dt = new Date(y, monthIdx, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== monthIdx || dt.getDate() !== d) return null;
  return `${y}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
