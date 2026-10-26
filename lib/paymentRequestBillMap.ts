import type { BillCreatePayload, BillDetail } from "./api";
import type { PaymentRequestDetailedInfoData } from "@/components/payment-request/PaymentRequestDetailedInfo";
import { formatAmount, toAmountString } from "@minty/shared/money";

function toIsoDateOnly(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function billToDetailedInfo(
  bill: BillDetail,
  decimals?: number,
): PaymentRequestDetailedInfoData {
  const line0 = bill.line_items?.[0];
  const code = (line0?.account_code ?? bill.xero_account_code ?? "").trim();
  const name = (line0?.account_name ?? "").trim();
  const accountCode = code && name ? `${code} - ${name}` : code;
  return {
    billNo: bill.reference,
    amount: formatAmount(bill.amount, decimals),
    currencyCode: bill.currency_code,
    description: bill.description ?? "",
    contact: bill.contact,
    xero_contact_id: bill.xero_contact_id ?? "",
    accountCode,
    invoiceDate: toIsoDateOnly(bill.invoice_date),
    dueDate: toIsoDateOnly(bill.due_date),
  };
}

export const PICK_SUPPLIER_MESSAGE =
  "Pick the supplier from the list, or add them as a new supplier.";

/**
 * Owner's decision: an edited supplier must be picked from the list (or added) only when its text
 * changed from the saved one, so an untouched older request with no Xero contact still saves.
 */
export function supplierNeedsPick(
  draft: Pick<PaymentRequestDetailedInfoData, "contact" | "xero_contact_id">,
  savedContact: string | null | undefined,
): boolean {
  const contact = draft.contact.trim();
  return (
    contact !== "" && contact !== (savedContact ?? "").trim() && !(draft.xero_contact_id ?? "")
  );
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
 * `decimals` is the company currency's places (JPY 0 sends "1234").
 */
export function buildBillUpdatePayload(
  bill: BillDetail,
  draft: PaymentRequestDetailedInfoData,
  decimals?: number,
): Partial<BillCreatePayload> & { status?: string } {
  // "1234.50", the same shape a new request sends (owner, 2026-10-26).
  const amount = toAmountString(draft.amount ?? "", decimals);
  const { account_code, account_name } = parseAccountField(draft.accountCode);

  const payload: Partial<BillCreatePayload> = {
    contact: draft.contact,
    xero_contact_id: draft.xero_contact_id ?? "",
    description: draft.description,
    reference: draft.billNo,
    amount,
    currency_code: draft.currencyCode,
    invoice_date: draft.invoiceDate || null,
    due_date: draft.dueDate || null,
    xero_account_code: account_code || undefined,
  };

  const line0 = bill.line_items?.[0];
  if (line0) {
    const ua = amount ?? toAmountString(line0.unit_amount ?? "", decimals) ?? "0.00";
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
    const ua = amount ?? "0.00";
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
