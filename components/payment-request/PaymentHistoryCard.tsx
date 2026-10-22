"use client";

import Link from "next/link";

import { StatusPill } from "@/components/ui/StatusPill";

export type PaymentHistoryRow = {
  id: string;
  billId: string;
  /** Status of the bill that owns this payment (for display / future use). */
  billStatus?: string;
  date: string;
  amountLabel: string;
  /** Bill settlement label (e.g. Paid, Partially Paid). */
  statusLabel: string;
  invoiceNo: string;
  /** Link target for invoice ref; omit or "#" for current bill. */
  invoiceHref?: string;
  /** Payment applies to a different bill than the page context.   */
  isOtherBill?: boolean;
};

type PaymentHistoryListPanelProps = {
  rows: PaymentHistoryRow[];
};

/**
 * The request's payments (Part 15.17 detail "Payments"): a real table on a computer - date,
 * status, amount (right-aligned, tabular), Payment No. - and stacked rows on a phone. Amounts
 * are text/primary; the status is a pill.
 */
export function PaymentHistoryListPanel({ rows }: PaymentHistoryListPanelProps) {
  if (rows.length === 0) {
    return <p className="text-body-m text-text-secondary">No payments recorded yet.</p>;
  }
  return (
    <div
      className="overflow-x-auto rounded-lg border border-border-subtle"
      role="region"
      aria-label="Payment history list"
    >
      <table className="w-full min-w-0 border-collapse text-body-m">
        <thead className="hidden bg-surface-sunk sm:table-header-group">
          <tr className="h-10 text-left text-label text-text-secondary">
            <th scope="col" className="px-4 font-semibold">
              Payment date
            </th>
            <th scope="col" className="px-4 font-semibold">
              Status
            </th>
            <th scope="col" className="px-4 text-right font-semibold">
              Amount
            </th>
            <th scope="col" className="px-4 font-semibold">
              Payment No.
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border-subtle px-4 py-3 first:border-t-0 sm:table-row sm:h-14 sm:px-0 sm:py-0 sm:first:border-t"
            >
              <td className="text-text-primary sm:px-4">{row.date}</td>
              <td className="justify-self-end sm:px-4">
                <StatusPill label={row.statusLabel} />
              </td>
              <td className="tabular-nums text-text-primary sm:px-4 sm:text-right" translate="no">
                {row.amountLabel}
              </td>
              <td className="min-w-0 justify-self-end truncate sm:px-4" translate="no">
                <Link
                  href={row.invoiceHref ?? "#"}
                  className="text-text-link underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                >
                  {row.invoiceNo}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
