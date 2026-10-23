import type { PaymentItem } from "@/lib/api";
import { shouldShowPaymentInHistory } from "@/lib/paymentHistoryDisplay";

export function normalizeBillStatusKey(status: string): string {
  return (status ?? "").trim().toLowerCase().replace(/-/g, "_");
}
export function billStatusShouldRollbackWhenNoPayments(status: string): boolean {
  const k = normalizeBillStatusKey(status);
  return k === "paid" || k === "partially_paid";
}

/** True if this bill still has at least one payment that counts toward balance / history (positive amount). */
export function billHasRemainingCountablePayments(
  billId: string,
  payments: PaymentItem[],
): boolean {
  return payments.some((p) => p.bill_id === billId && shouldShowPaymentInHistory(p));
}
