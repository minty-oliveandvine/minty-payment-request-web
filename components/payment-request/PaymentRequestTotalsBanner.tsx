"use client";

import { useMemo } from "react";
import type { PaymentRequestRow } from "./PaymentRequestTable";
import { currencyLabelForCode } from "@/lib/currencyDisplay";
import { formatIsoDateForDisplay } from "@/lib/dateDisplayFormat";
import { parseRowAmount } from "@/lib/paymentRequestRowSort";

/** Currency groups rendered in full before the rest collapse into a "+N more" line. */
export const MAX_CURRENCY_GROUPS = 2;

export type PaymentRequestTotalsBannerProps = {
  /** Every row matching the current filters + search — NOT just the current page. */
  allRows: PaymentRequestRow[];
  /** Checked rows, already intersected with `allRows`. */
  selectedRows: PaymentRequestRow[];
  /** Applied filter dates, ISO `yyyy-mm-dd`; empty when unset. */
  startDate?: string;
  endDate?: string;
  className?: string;
};

type CurrencyTotals = { code: string; invoice: number; unpaid: number };

export function formatTotal(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Sums both figures per currency so HKD is never silently added to USD.
 * `invoiceTotal` carries no symbol ("6,000.00"), `unpaidAmount` does ("HK$ 1,500.00") —
 * `parseRowAmount` handles both. Largest unpaid total leads, matching the headline figure.
 */
function sumByCurrency(rows: PaymentRequestRow[]): CurrencyTotals[] {
  const byCode = new Map<string, CurrencyTotals>();
  for (const row of rows) {
    const code = row.currencyCode?.trim() || "HKD";
    const entry = byCode.get(code) ?? { code, invoice: 0, unpaid: 0 };
    entry.invoice += parseRowAmount(row.invoiceTotal ?? "") ?? 0;
    entry.unpaid += parseRowAmount(row.unpaidAmount ?? "") ?? 0;
    byCode.set(code, entry);
  }
  return [...byCode.values()].sort((a, b) => b.unpaid - a.unpaid);
}

/** `10 Aug 2026 - 17 Aug 2026`, or just the one side that is set. */
function formatDateRange(startDate: string, endDate: string): string {
  const from = startDate ? formatIsoDateForDisplay(startDate) || startDate : "";
  const to = endDate ? formatIsoDateForDisplay(endDate) || endDate : "";
  if (from && to) return `${from} - ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return "";
}

/**
 * Totals summary shown above the list: unpaid amount as the headline figure with the
 * invoice total beneath it. When rows are checked both switch to the selection.
 *
 * Visibility is the caller's call — `PaymentRequestView` renders this only when there
 * is a selection or an active filter.
 */
export function PaymentRequestTotalsBanner({
  allRows,
  selectedRows,
  startDate = "",
  endDate = "",
  className = "",
}: PaymentRequestTotalsBannerProps) {
  const hasSelection = selectedRows.length > 0;
  const rows = hasSelection ? selectedRows : allRows;
  const totals = useMemo(() => sumByCurrency(rows), [rows]);

  const subtitle = hasSelection ? "" : formatDateRange(startDate, endDate);
  const unpaidLabel = hasSelection ? "Selected total unpaid amount" : "Total unpaid amount";
  const invoiceLabel = hasSelection ? "Selected total invoice amount" : "Total invoice amount";

  // An empty result set still renders a zeroed box rather than collapsing to nothing.
  const groups =
    totals.length > 0 ? totals.slice(0, MAX_CURRENCY_GROUPS) : [{ code: "HKD", invoice: 0, unpaid: 0 }];
  const hiddenCount = Math.max(0, totals.length - MAX_CURRENCY_GROUPS);
  const mixed = totals.length > 1;

  return (
    <div
      className={`inline-flex max-w-full flex-col rounded-lg border border-action-secondary-border bg-surface-card px-4 py-2.5 ${className}`}
      role="status"
      aria-live="polite"
    >
      {subtitle ? <span className="text-caption text-text-muted tabular-nums">{subtitle}</span> : null}
      {groups.map((g) => (
        <div key={g.code} className="flex flex-col">
          {mixed ? (
            <span className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              {currencyLabelForCode(g.code)}
            </span>
          ) : null}
          {/* Grid, not flex — keeps both figures right-aligned to the same edge. */}
          <div className="grid grid-cols-[auto_auto] items-baseline gap-x-6">
            <span className="text-[15px] font-medium text-text-primary">{unpaidLabel}</span>
            <span className="whitespace-nowrap text-right text-2xl font-bold tabular-nums text-text-link">
              {formatTotal(g.unpaid)}
            </span>
            <span className="text-sm text-text-muted">{invoiceLabel}</span>
            <span className="whitespace-nowrap text-right text-base tabular-nums text-text-muted">
              {formatTotal(g.invoice)}
            </span>
          </div>
        </div>
      ))}
      {hiddenCount > 0 ? (
        <span className="text-xs text-text-muted">
          +{hiddenCount} more {hiddenCount === 1 ? "currency" : "currencies"}
        </span>
      ) : null}
    </div>
  );
}
