"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Overlay";
import type { PaymentItem } from "@/lib/api";
import { HK_TIME_ZONE, formatDay, formatInstantDay } from "@minty/shared/dates";
import { formatMoney } from "@minty/shared/money";
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

function formatPaymentDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const head = dateStr.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    return formatDay(head) || dateStr;
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return formatInstantDay(d, HK_TIME_ZONE) || dateStr;
}

function formatCreatedAt(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "";
  const datePart = formatInstantDay(d, HK_TIME_ZONE);
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

  return (
    <Modal
      open={open}
      role="alertdialog"
      zIndex={440}
      onRequestClose={onCancel}
      title="The amount is lower than what's been paid"
      description={
        <>
          This request already has {payments.length === 1 ? "a payment" : "payments"} totalling{" "}
          <span className="font-semibold tabular-nums text-text-primary" translate="no">
            {formatMoney(totalPaid, currencyLabel)}
          </span>
          , so its amount can&apos;t go below that.
        </>
      }
      footer={
        <>
          <Button kind="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            kind="primary"
            onClick={() => {
              if (onOpenPaymentHistory) {
                onCancel();
                onOpenPaymentHistory();
              } else {
                goToPaymentHistory();
              }
            }}
          >
            Open payments
          </Button>
        </>
      }
    >
      <ul className="flex max-h-60 flex-col divide-y divide-border-subtle overflow-y-auto rounded-lg border border-border-subtle">
        {payments.map((p) => {
          const amt = parseFloat(p.amount || "0");
          const createdAtFormatted = formatCreatedAt(p.created_at);
          const paymentDateFormatted = formatPaymentDateTime(p.payment_date);
          const payerName = p.created_by_name?.trim() || p.created_by?.trim() || "Unknown";
          return (
            <li key={p.id} className="flex items-start gap-3 px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-body-m font-semibold text-text-primary">{payerName}</p>
                <p className="mt-0.5 text-body-s text-text-secondary">
                  Paid {paymentDateFormatted}
                  {createdAtFormatted ? <span className="text-text-muted"> · Recorded {createdAtFormatted}</span> : null}
                </p>
              </div>
              <span className="shrink-0 text-body-m font-semibold tabular-nums text-text-primary" translate="no">
                {formatMoney(amt, currencyLabel)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-body-m text-text-secondary">
        To lower the amount, remove those payments first. If it was overpaid, your accountant can help sort it out.
      </p>
    </Modal>
  );
}
