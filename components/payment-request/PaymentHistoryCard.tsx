"use client";

import Link from "next/link";

export type PaymentHistoryRow = {
  id: string;
  billId: string;
  /** Status of the bill that owns this payment (for display / future use). */
  billStatus?: string;
  date: string;
  amountLabel: string;
  /** Bill settlement label (e.g. Paid, Partially Paid) for View Payment History. */
  statusLabel: string;
  invoiceNo: string;
  /** Link target for invoice ref; omit or "#" for current bill. */
  invoiceHref?: string;
  /** Payment applies to a different bill than the page context.   */
  isOtherBill?: boolean;
};

type PaymentHistoryListPanelProps = {
  rows?: PaymentHistoryRow[];
};

const defaultRows: PaymentHistoryRow[] = [
  {
    id: "1",
    billId: "demo-1",
    date: "03 Mar 2026",
    amountLabel: "(500.00)",
    statusLabel: "Paid",
    invoiceNo: "MBIDAN-115803031626",
  },
  {
    id: "2",
    billId: "demo-2",
    date: "03 Mar 2026",
    amountLabel: "(500.00)",
    statusLabel: "Partially Paid",
    invoiceNo: "MBIDAN-115803031627",
  },
  {
    id: "3",
    billId: "demo-3",
    date: "03 Mar 2026",
    amountLabel: "(500.00)",
    statusLabel: "Paid",
    invoiceNo: "MBIDAN-115803031628",
  },
  {
    id: "4",
    billId: "demo-4",
    date: "03 Mar 2026",
    amountLabel: "(500.00)",
    statusLabel: "Paid",
    invoiceNo: "MBIDAN-115803031629",
  },
  {
    id: "5",
    billId: "demo-5",
    date: "03 Mar 2026",
    amountLabel: "(500.00)",
    statusLabel: "Partially Paid",
    invoiceNo: "MBIDAN-115803031630",
  },
  {
    id: "6",
    billId: "demo-6",
    date: "03 Mar 2026",
    amountLabel: "(500.00)",
    statusLabel: "Paid",
    invoiceNo: "MBIDAN-115803031631",
  },
];

export function PaymentHistoryListPanel({ rows = defaultRows }: PaymentHistoryListPanelProps) {
  return (
    <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
      <div className="mb-4 hidden grid-cols-[2rem_minmax(9rem,1fr)_minmax(6.5rem,9rem)_minmax(8rem,10rem)_minmax(11rem,1fr)] gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-primary/55 sm:grid sm:gap-4 sm:px-4">
        <span aria-hidden />
        <span className="block w-full text-left">Payment Date</span>
        <span className="block w-full text-left">Status</span>
        <span className="block w-full text-left">Amount</span>
        <span className="block w-full text-left">Invoice No.</span>
      </div>
      <div
        className="min-h-0 max-h-[min(14rem,38dvh)] overflow-y-auto overscroll-y-contain [-ms-overflow-style:auto] sm:max-h-[min(17.5rem,45vh)]"
        role="region"
        aria-label="Payment history list"
      >
        <ul className="flex flex-col gap-2 pb-0.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-1 items-center gap-2 rounded-lg bg-gray-50 px-3 py-3 sm:grid-cols-[2rem_minmax(9rem,1fr)_minmax(6.5rem,9rem)_minmax(8rem,10rem)_minmax(11rem,1fr)] sm:gap-4 sm:px-4"
            >
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#54D3DA]/15 text-[#54D3DA]"
                aria-hidden
              >
                <span className="material-symbols-outlined text-[20px]">history</span>
              </span>
              <span className="text-sm font-medium text-primary sm:min-w-[7rem]">{row.date}</span>
              <span className="block w-full text-left text-sm font-medium text-primary sm:min-w-[5.5rem]">
                {row.statusLabel}
              </span>
              <span className="block w-full text-left text-sm font-semibold text-primary">
                {row.amountLabel}
              </span>
              <Link
                href={row.invoiceHref ?? "#"}
                className="block w-full min-w-0 truncate text-left text-sm font-medium text-[#54d3da] underline underline-offset-2 hover:text-[#54d3da]"
              >
                {row.invoiceNo}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
