"use client";

import { createPortal } from "react-dom";
import { useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { pushAppScrollLock } from "@/lib/appScrollRoot";
import type { PaymentItem } from "@/lib/api";
import { formatDateInTimeZoneForDisplay, formatIsoDateForDisplay } from "@/lib/dateDisplayFormat";
import { formatMoney } from "@/lib/amountFormat";
import { useCompanyPages } from "@/lib/useCompanyPages";

export type OverpaymentWarningModalProps = {
  open: boolean;
  billId: string;
  payments: PaymentItem[];
  totalPaid: number;
  currencyLabel: string;
  onCancel: () => void;
  onOpenPaymentHistory?: () => void;
};

const overlayClass =
  "fixed inset-0 z-[440] flex items-center justify-center overflow-x-hidden overscroll-x-none bg-black/45 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:p-4";

const shellClass =
  "relative z-[1] w-full min-w-0 max-w-[440px] rounded-xl bg-white p-5 shadow-xl ring-1 ring-black/5 sm:rounded-2xl sm:p-6";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary";

const cancelClass = `box-border h-12 min-h-[48px] w-full cursor-pointer rounded-lg border-2 border-secondary bg-white px-4 text-sm font-semibold text-secondary transition-colors hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing} sm:h-11 sm:min-h-[44px] sm:w-auto`;

const primaryClass = `box-border h-12 min-h-[48px] w-full cursor-pointer rounded-lg border border-transparent bg-secondary px-4 text-sm font-semibold text-white shadow-sm transition-opacity duration-200 ease-out hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:opacity-60 ${focusRing} sm:h-11 sm:min-h-[44px] sm:w-auto`;

function formatPaymentDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const head = dateStr.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    return formatIsoDateForDisplay(head) || dateStr;
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return formatDateInTimeZoneForDisplay(d, "Asia/Hong_Kong") || dateStr;
}

function formatCreatedAt(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "";
  const datePart = formatDateInTimeZoneForDisplay(d, "Asia/Hong_Kong");
  const timePart = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Hong_Kong",
  });
  return datePart ? `${datePart}, ${timePart}` : "";
}

export function OverpaymentWarningModal({
  open,
  billId,
  payments,
  totalPaid,
  currencyLabel,
  onCancel,
  onOpenPaymentHistory,
}: OverpaymentWarningModalProps) {
  const router = useRouter();
  const pages = useCompanyPages();
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    return pushAppScrollLock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  const paymentHistoryHref = `${pages.request(billId)}#payment-history`;

  const goToPaymentHistory = () => {
    onCancel();
    router.push(paymentHistoryHref);
    window.requestAnimationFrame(() => {
      document.getElementById("payment-history")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  return createPortal(
    <div
      className={overlayClass}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className={shellClass}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-secondary"
            aria-hidden
          >
            <span className="material-symbols-outlined text-[20px] leading-none">info</span>
          </span>
          <h2 id={titleId} className="text-lg font-semibold text-primary sm:text-xl">
            Overpayment
          </h2>
        </div>

        <p id={descId} className="mt-3 text-sm leading-relaxed text-primary/80">
          The bill already has{" "}
          {payments.length === 1 ? "a payment" : "payments"} recorded totalling{" "}
          <span className="font-semibold text-primary">
            {formatMoney(totalPaid, currencyLabel)}
          </span>
          . Bill amount cannot be lower than recorded payments.
        </p>

        <ul className="mt-4 flex max-h-60 flex-col gap-2 overflow-y-auto">
          {payments.map((p) => {
            const amt = parseFloat(p.amount || "0");
            const createdAtFormatted = formatCreatedAt(p.created_at);
            const paymentDateFormatted = formatPaymentDateTime(p.payment_date);
            const payerName = p.created_by_name?.trim() || p.created_by?.trim() || "Unknown";
            return (
              <li
                key={p.id}
                className="flex items-start gap-3 rounded-xl bg-secondary/8 px-3 py-3 ring-1 ring-secondary/20"
              >
                <span
                  className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-secondary"
                  aria-hidden
                >
                  <span className="material-symbols-outlined text-[18px] leading-none">
                    payments
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary">{payerName}</p>
                  <p className="mt-0.5 text-xs text-primary/70">
                    Payment date: {paymentDateFormatted}
                    {createdAtFormatted ? (
                      <span className="ml-2 text-primary/50">· Recorded {createdAtFormatted}</span>
                    ) : null}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-primary tabular-nums">
                  ({formatMoney(amt, currencyLabel)})
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 text-sm leading-relaxed text-primary/70">
          To edit this payment, you&apos;ll need to clear its payment history first. If it&apos;s been
          overpaid, your accountant can help sort it out.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" className={cancelClass} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={primaryClass}
            onClick={() => {
              if (onOpenPaymentHistory) {
                onCancel();
                onOpenPaymentHistory();
              } else {
                goToPaymentHistory();
              }
            }}
          >
            Payment history
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
