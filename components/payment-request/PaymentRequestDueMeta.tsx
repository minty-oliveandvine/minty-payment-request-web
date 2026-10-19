/**
 * The row meta's due line - "Overdue 3 days", "Due today", "Due in 2 days" - for a request that
 * still has something to pay and is due within a week (`lib/paymentRequestAttention.ts`). Text
 * with a small icon; the Status pill stays the status signal. Nothing otherwise.
 */

import { Icon } from "@/components/ui/Icon";
import { dueMetaLabel } from "@/lib/paymentRequestAttention";

import type { PaymentRequestRow } from "./PaymentRequestTable";

export function PaymentRequestDueMeta({
  row,
  todayIso,
  className = "",
}: {
  row: PaymentRequestRow;
  /** Today in the billing timezone (`billingToday()`), passed in so every row agrees. */
  todayIso: string;
  className?: string;
}) {
  const label = dueMetaLabel(row, todayIso);
  if (!label) return null;
  const overdue = label.startsWith("Overdue");
  return (
    <span
      data-due-meta
      className={`inline-flex items-center gap-1 whitespace-nowrap text-body-s ${
        overdue ? "font-medium text-status-warning-ink" : "text-text-secondary"
      }${className ? ` ${className}` : ""}`}
    >
      <Icon name={overdue ? "event_busy" : "event_upcoming"} size="sm" />
      {label}
    </span>
  );
}
