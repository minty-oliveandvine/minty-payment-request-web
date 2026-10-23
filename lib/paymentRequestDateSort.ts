/** Shared date parsing for payment request list sorting (matches table behavior). */

const SHORT_MONTH_TO_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function dateSortValue(s: string): number | null {
  const t = s.trim();
  if (!t || t === "-" || t === "—") return null;
  const parsed = Date.parse(t);
  if (!Number.isNaN(parsed)) return parsed;
  const slash = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/.exec(t);
  if (slash) {
    const day = Number.parseInt(slash[1], 10);
    const year = Number.parseInt(slash[3], 10);
    const monKey = slash[2].slice(0, 3).toLowerCase();
    const month = SHORT_MONTH_TO_INDEX[monKey];
    if (Number.isFinite(day) && Number.isFinite(year) && month !== undefined) {
      const utc = Date.UTC(year, month, day);
      return Number.isNaN(utc) ? null : utc;
    }
  }
  const m = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(t);
  if (m) {
    const day = Number.parseInt(m[1], 10);
    const year = Number.parseInt(m[3], 10);
    const monKey = m[2].slice(0, 3).toLowerCase();
    const month = SHORT_MONTH_TO_INDEX[monKey];
    if (Number.isFinite(day) && Number.isFinite(year) && month !== undefined) {
      const utc = Date.UTC(year, month, day);
      return Number.isNaN(utc) ? null : utc;
    }
  }
  return null;
}

export function compareNullableNumber(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a < b) return -dir;
  if (a > b) return dir;
  return 0;
}

export function compareBySubmittedDate(
  a: { id: string; submittedDate: string },
  b: { id: string; submittedDate: string },
  dir: "asc" | "desc",
): number {
  const d = dir === "asc" ? 1 : -1;
  const byDate = compareNullableNumber(
    dateSortValue(a.submittedDate),
    dateSortValue(b.submittedDate),
    d,
  );
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}
