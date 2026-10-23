import type { BillCreatePayload, BillDetail } from "./api";
import type { PaymentRequestDetailedInfoData } from "@/components/payment-request/PaymentRequestDetailedInfo";
import { formatAmount, parseAmount } from "./amountFormat";

function toIsoDateOnly(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function billToDetailedInfo(bill: BillDetail): PaymentRequestDetailedInfoData {
  const line0 = bill.line_items?.[0];
  const code = (line0?.account_code ?? bill.xero_account_code ?? "").trim();
  const name = (line0?.account_name ?? "").trim();
  const accountCode = code && name ? `${code} - ${name}` : code;
  return {
    billNo: bill.reference,
    amount: formatAmount(bill.amount),
    currencyCode: bill.currency_code,
    description: bill.description ?? "",
    contact: bill.contact,
    xero_contact_id: bill.xero_contact_id ?? "",
    accountCode,
    invoiceDate: toIsoDateOnly(bill.invoice_date),
    dueDate: toIsoDateOnly(bill.due_date),
  };
}

function parseAccountField(raw: string): { account_code: string; account_name: string } {
  const s = raw.trim();
  const idx = s.indexOf(" - ");
  if (idx === -1) return { account_code: s, account_name: s };
  return {
    account_code: s.slice(0, idx).trim(),
    account_name: s.slice(idx + 3).trim(),
  };
}

/**
 * Builds the PUT body for `updateBill`, merging account/amount into the first line item when present.
 */
export function buildBillUpdatePayload(
  bill: BillDetail,
  draft: PaymentRequestDetailedInfoData,
): Partial<BillCreatePayload> & { status?: string } {
  const amount = parseAmount(draft.amount) ?? NaN;
  const { account_code, account_name } = parseAccountField(draft.accountCode);

  const payload: Partial<BillCreatePayload> = {
    contact: draft.contact,
    xero_contact_id: draft.xero_contact_id ?? "",
    description: draft.description,
    reference: draft.billNo,
    amount: Number.isFinite(amount) ? amount : undefined,
    currency_code: draft.currencyCode,
    invoice_date: draft.invoiceDate || null,
    due_date: draft.dueDate || null,
    xero_account_code: account_code || undefined,
  };

  const line0 = bill.line_items?.[0];
  if (line0) {
    const ua = Number.isFinite(amount) ? amount : Number(line0.unit_amount);
    payload.line_items = [
      {
        description: line0.description,
        quantity: Number(line0.quantity),
        unit_amount: ua,
        line_amount: ua,
        account_code,
        account_name: account_name || line0.account_name,
      },
    ];
  } else if (account_code) {
    const ua = Number.isFinite(amount) ? amount : 0;
    payload.line_items = [
      {
        description: draft.description || "",
        quantity: 1,
        unit_amount: ua,
        line_amount: ua,
        account_code,
        account_name: account_name || account_code,
      },
    ];
  }

  return payload;
}
