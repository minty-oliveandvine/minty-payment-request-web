import { fetchPayments, listPaymentAttachments, type PaymentItem } from "./api";
import { currencyLabelForCode } from "./currencyDisplay";
import { formatMoney } from "@minty/shared/money";
import type {
  BankSlipDetails,
  BankSlipFileEntry,
} from "@/components/payment-request/BankSlipDetailsModal";
import { formatDateInTimeZoneForDisplay, formatIsoDateForDisplay } from "./dateDisplayFormat";

function formatApiDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const datePart = formatDateInTimeZoneForDisplay(d, "Asia/Hong_Kong");
    const timePart = d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Hong_Kong",
      timeZoneName: "short",
    });
    return datePart ? `${datePart}, ${timePart}` : iso;
  } catch {
    return iso;
  }
}

function formatBillDate(dateStr: string): string {
  if (!dateStr) return "";
  const head = dateStr.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    return formatIsoDateForDisplay(head) || dateStr;
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return formatIsoDateForDisplay(`${y}-${m}-${day}`) || dateStr;
}

function formatPaymentDisplayAmount(currencyCode: string | undefined, amount: string): string {
  const iso = currencyCode?.trim();
  const symbol = iso ? currencyLabelForCode(iso) : "";
  return formatMoney(amount, symbol) || amount.trim() || "—";
}

function directImagePreviewUrl(att: {
  download_url?: string;
  mime_type?: string;
  original_name: string;
}): string | undefined {
  const u = att.download_url?.trim();
  if (!u) return undefined;
  const mime = (att.mime_type || "").toLowerCase();
  const name = (att.original_name || "").trim();
  if (mime.startsWith("image/")) return u;
  if (/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name)) return u;
  return undefined;
}

function paymentToDetailsBase(
  row: {
    contactTitle: string;
    submittedDate: string;
    invoiceDate: string;
    paidDate: string;
    unpaidAmount: string;
    currencyCode?: string;
  },
  payment: PaymentItem,
): Omit<BankSlipDetails, "files"> {
  return {
    createdBy: payment.created_by?.trim() ? payment.created_by : "—",
    createdAt: formatApiDateTime(payment.created_at),
    toName: row.contactTitle,
    amount: formatPaymentDisplayAmount(payment.currency_code || row.currencyCode, payment.amount),
    fromName: "—",
    when: payment.payment_date
      ? formatBillDate(payment.payment_date)
      : row.paidDate.trim() || row.invoiceDate,
  };
}

export type BankSlipEnrichment = {
  bankslipFileCount: number;
  bankSlipDetails?: BankSlipDetails;
  /** The lookup failed: the count is unknown, NOT zero, so the row must not offer an upload. */
  failed?: boolean;
};

export type BankSlipRowLabels = {
  contactTitle: string;
  submittedDate: string;
  invoiceDate: string;
  paidDate: string;
  unpaidAmount: string;
  currencyCode?: string;
};

/**
 *   Uses an existing payment list (e.g. from `GET /bills/{id}/payments`) and loads
 * `GET /bills/{id}/payments/{paymentId}/attachments` per payment — same sources as the list view bank-slip flow.
 */
export async function buildBankSlipDetailsFromPaymentList(
  billId: string,
  payments: PaymentItem[],
  row: BankSlipRowLabels,
): Promise<{ count: number; bankSlipDetails: BankSlipDetails | null }> {
  const forBill = payments.filter((p) => p.bill_id === billId);
  if (forBill.length === 0) return { count: 0, bankSlipDetails: null };

  const files: BankSlipFileEntry[] = [];
  const seenAttachmentLinkIds = new Set<string>();
  for (const p of forBill) {
    const attachments = await listPaymentAttachments(billId, p.id);
    for (const a of attachments) {
      if (seenAttachmentLinkIds.has(a.id)) continue;
      seenAttachmentLinkIds.add(a.id);
      const uploadedAt = a.created_at?.trim() || a.attachment.created_at?.trim();
      const nestedId = a.attachment.id?.trim();
      const size = a.attachment.file_size;
      const fileSizeBytes =
        typeof size === "number" && Number.isFinite(size) && size >= 0
          ? Math.round(size)
          : undefined;
      const imagePreviewUrl = directImagePreviewUrl(a.attachment);
      files.push({
        id: a.id,
        name: a.attachment.original_name,
        ...(fileSizeBytes != null ? { fileSizeBytes } : {}),
        ...(imagePreviewUrl ? { previewUrl: imagePreviewUrl } : {}),
        fetchSource: {
          billId,
          paymentId: p.id,
          attachmentId: a.id,
          ...(nestedId ? { fileAttachmentId: nestedId } : {}),
        },
        ...(uploadedAt ? { details: { createdAt: formatApiDateTime(uploadedAt) } } : {}),
      });
    }
  }

  if (files.length === 0) return { count: 0, bankSlipDetails: null };

  const primary = forBill[0];
  const bankSlipDetails: BankSlipDetails = {
    ...paymentToDetailsBase(row, primary),
    files,
  };

  return { count: files.length, bankSlipDetails };
}

/**
 * Loads payment-attachment metadata for a bill so the table can show counts and the bank-slip details modal
 * can preview files via `fetchSource` + authenticated download.
 */
export async function fetchBillBankSlipEnrichment(
  billId: string,
  row: BankSlipRowLabels,
): Promise<BankSlipEnrichment> {
  try {
    const { payments } = await fetchPayments(billId);
    const built = await buildBankSlipDetailsFromPaymentList(billId, payments, row);
    if (built.count === 0) return { bankslipFileCount: 0 };
    return { bankslipFileCount: built.count, bankSlipDetails: built.bankSlipDetails! };
  } catch (err) {
    console.error(`Could not load the bank slips for bill ${billId}:`, err);
    return { bankslipFileCount: 0, failed: true };
  }
}
