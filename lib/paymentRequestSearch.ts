import type { PaymentRequestRow } from "@/components/payment-request/PaymentRequestTable";
import { parseRowAmount } from "@/lib/paymentRequestRowSort";

/**
 * `"contains"` is what typing gives you; `"exact"` is what submitting the search
 * box (Enter, or the Search key on a phone keyboard) switches to.
 */
export type SearchMode = "contains" | "exact";

/**
 * Digits and the decimal point only — thousands separators and currency codes (or symbols) dropped.
 * `"6,000.00"` → `"6000.00"`, `"HKD 1,500.00"` → `"1500.00"`, `"3,000"` → `"3000"`.
 *
 * The decimal point is deliberately kept: stripping to bare digits would turn
 * `"3,000.00"` into `"300000"` and `"300.00"` into `"30000"`, so a query of `3000`
 * would falsely match a 300.00 row.
 */
export function normalizeAmountForSearch(s: string): string {
  return s.replace(/[^0-9.]/g, "");
}

/** The query as a number, or null when it isn't one. `"3,000"` → 3000. */
function queryAsAmount(q: string): number | null {
  const normalized = normalizeAmountForSearch(q);
  // Guard the empty/"." cases: Number("") is 0, which would match every 0.00 row.
  if (!normalized || normalized === ".") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Whether a row survives the current search.
 *
 * `"contains"` — supplier, description, or a substring match on the invoice total's
 * digits: `3000` matches 3,000.00 and 13,000.50 but not 300.00.
 *
 * `"exact"` — supplier or description equal to the query, or an invoice total whose
 * *value* equals it: `3000` matches only 3,000.00. Amounts are compared numerically
 * rather than as normalized strings, because `"3000"` and `"3000.00"` are the same
 * number but different text.
 *
 * The unpaid amount is not searched in either mode; only the invoice total is.
 */
export function rowMatchesSearch(
  row: PaymentRequestRow,
  rawQuery: string,
  mode: SearchMode = "contains",
): boolean {
  const q = rawQuery.trim();
  if (!q) return true;
  const lower = q.toLowerCase();

  if (mode === "exact") {
    // Text still counts, so a supplier literally named "3000" is still reachable.
    if (row.contactTitle.trim().toLowerCase() === lower) return true;
    if (row.contactCaption?.trim().toLowerCase() === lower) return true;
    const qAmount = queryAsAmount(q);
    if (qAmount === null) return false;
    return parseRowAmount(row.invoiceTotal ?? "") === qAmount;
  }

  if (row.contactTitle.toLowerCase().includes(lower)) return true;
  if (row.contactCaption?.toLowerCase().includes(lower)) return true;
  const qNum = normalizeAmountForSearch(q);
  if (!qNum || qNum === ".") return false;
  return normalizeAmountForSearch(row.invoiceTotal ?? "").includes(qNum);
}
