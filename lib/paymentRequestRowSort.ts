import type { PaymentRequestRow } from "@/components/payment-request/PaymentRequestTable";
import { compareNullableNumber, dateSortValue } from "@/lib/paymentRequestDateSort";

export type SortKey =
  "contact" | "invoiceDate" | "status" | "submittedDate" | "unpaidAmount" | "paidDate";

/**
 * Parses a display amount to a number. Handles both row shapes: `invoiceTotal`
 * carries no currency code (`"6,000.00"`), `unpaidAmount` does (`"HKD 1,500.00"`,
 * `"-HKD 120.00"`). Any non-numeric prefix is dropped, so an older symbol shape
 * (`"HK$ 1,500.00"`) still reads. Returns null for blank/unparseable values.
 */
export function parseRowAmount(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number.parseFloat(t.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

const STATUS_TABLE_ORDER = [
  "Payment Requested",
  "Returned",
  "Paid",
  "Partially Paid",
  "Draft",
  "Voided",
] as const;

function statusSortRank(label: string): number {
  const i = (STATUS_TABLE_ORDER as readonly string[]).indexOf(label);
  return i >= 0 ? i : STATUS_TABLE_ORDER.length;
}

/** Same ordering rules as the main payment request table. */
export function compareRows(
  a: PaymentRequestRow,
  b: PaymentRequestRow,
  key: SortKey,
  dir: "asc" | "desc",
): number {
  const d = dir === "asc" ? 1 : -1;
  switch (key) {
    case "contact": {
      const t = a.contactTitle.localeCompare(b.contactTitle, undefined, { sensitivity: "base" });
      if (t !== 0) return t * d;
      return (
        a.contactCaption.localeCompare(b.contactCaption, undefined, { sensitivity: "base" }) * d
      );
    }
    case "invoiceDate": {
      const byDate = compareNullableNumber(
        dateSortValue(a.invoiceDate),
        dateSortValue(b.invoiceDate),
        d,
      );
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    }
    case "submittedDate": {
      const byDate = compareNullableNumber(
        dateSortValue(a.submittedDate),
        dateSortValue(b.submittedDate),
        d,
      );
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    }
    case "paidDate": {
      const byDate = compareNullableNumber(dateSortValue(a.paidDate), dateSortValue(b.paidDate), d);
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    }
    case "status": {
      const ra = statusSortRank(a.status);
      const rb = statusSortRank(b.status);
      if (ra !== rb) return (ra - rb) * d;
      return a.status.localeCompare(b.status, undefined, { sensitivity: "base" }) * d;
    }
    case "unpaidAmount":
      return compareNullableNumber(
        parseRowAmount(a.unpaidAmount),
        parseRowAmount(b.unpaidAmount),
        d,
      );
    default:
      return 0;
  }
}
