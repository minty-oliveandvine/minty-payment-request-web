/**
 * What needs attention on the Payment Request list (Part 15.4a Operational, Work Coordination:
 * "What needs my attention next?"): the Overdue, Due in 7 days and Returned figures in the strip
 * above the list, the client-side due filter its tiles apply, and the row meta line.
 *
 * Everything is worked out from rows already loaded - no request of its own. Dates are calendar
 * dates (`yyyy-mm-dd`) in the billing timezone, the same date the columns show and the date
 * filters compare (`lib/dateDisplayFormat.ts`).
 */

import type { PaymentRequestRow } from "@/components/payment-request/PaymentRequestTable";
import { HK_TIME_ZONE, isoDateInTimeZone } from "@minty/shared/dates";
import { parseRowAmount } from "@/lib/paymentRequestRowSort";

/** "Due soon" = due today up to this many days ahead. */
export const DUE_SOON_DAYS = 7;

/** Nothing is left to pay (Paid), or it never entered the queue (Draft) or left it (Voided). */
const NOT_DUE_STATUSES = new Set(["Paid", "Voided", "Draft"]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type DueFilter = "overdue" | "dueSoon";

export type CurrencyAmount = { code: string; amount: number };

export type AttentionGroup = { count: number; unpaid: CurrencyAmount[] };

export type PaymentRequestAttention = {
  overdue: AttentionGroup;
  dueSoon: AttentionGroup;
  returned: { count: number };
  /** Nothing overdue, due this week or returned: the strip collapses to one line. */
  isQuiet: boolean;
};

/** Today's calendar date in the billing timezone, as `yyyy-mm-dd`. */
export function billingToday(now: Date = new Date()): string {
  return isoDateInTimeZone(HK_TIME_ZONE, now);
}

function isoToUtcDay(iso: string): number | null {
  if (!ISO_DATE_RE.test(iso)) return null;
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Number.isNaN(t) ? null : t / 86_400_000;
}

/**
 * Whole days from `todayIso` to the row's due date: 0 = due today, negative = overdue.
 * `null` when the row is Paid, Voided or Draft, or has no (valid) due date.
 */
export function dueInDays(row: PaymentRequestRow, todayIso: string): number | null {
  if (NOT_DUE_STATUSES.has(row.status)) return null;
  const due = isoToUtcDay((row.dueDateIso ?? "").trim());
  const today = isoToUtcDay(todayIso);
  if (due === null || today === null) return null;
  return Math.round(due - today);
}

/** "Overdue 3 days", "Due today", "Due in 2 days" (up to a week ahead), otherwise `null`. */
export function dueMetaLabel(row: PaymentRequestRow, todayIso: string): string | null {
  const days = dueInDays(row, todayIso);
  if (days === null || days > DUE_SOON_DAYS) return null;
  if (days < 0) return `Overdue ${-days} ${-days === 1 ? "day" : "days"}`;
  if (days === 0) return "Due today";
  return `Due in ${days} ${days === 1 ? "day" : "days"}`;
}

export function rowMatchesDueFilter(row: PaymentRequestRow, filter: DueFilter, todayIso: string): boolean {
  const days = dueInDays(row, todayIso);
  if (days === null) return false;
  return filter === "overdue" ? days < 0 : days >= 0 && days <= DUE_SOON_DAYS;
}

function addUnpaid(group: AttentionGroup, row: PaymentRequestRow) {
  group.count += 1;
  const code = row.currencyCode?.trim() || "HKD";
  const amount = parseRowAmount(row.unpaidAmount ?? "") ?? 0;
  const entry = group.unpaid.find((g) => g.code === code);
  if (entry) entry.amount += amount;
  else group.unpaid.push({ code, amount });
}

/** The strip's three figures. Unpaid totals are per currency, the largest first. */
export function computeAttention(rows: PaymentRequestRow[], todayIso: string): PaymentRequestAttention {
  const overdue: AttentionGroup = { count: 0, unpaid: [] };
  const dueSoon: AttentionGroup = { count: 0, unpaid: [] };
  let returned = 0;
  for (const row of rows) {
    if (row.status === "Returned") returned += 1;
    const days = dueInDays(row, todayIso);
    if (days === null) continue;
    if (days < 0) addUnpaid(overdue, row);
    else if (days <= DUE_SOON_DAYS) addUnpaid(dueSoon, row);
  }
  for (const g of [overdue, dueSoon]) g.unpaid.sort((a, b) => b.amount - a.amount);
  return {
    overdue,
    dueSoon,
    returned: { count: returned },
    isQuiet: overdue.count === 0 && dueSoon.count === 0 && returned === 0,
  };
}
