/**
 * Payment requests per state, shared by Vitest and Playwright's `page.route` stubs.
 *
 * A fixture module exports typed data and builders ONLY: it never calls `page.route`, never
 * imports from `@playwright/test`, and never carries a CORS header. The Playwright side keeps
 * `cors(route)` and `route.fulfill` in `e2e/helpers.ts` and takes only the BODY from here - so
 * when the API's shape changes, one file changes and both layers fail together.
 *
 * Builders are typed against the app's own response types, so an API-shape change breaks the
 * fixture at compile time instead of silently rendering an empty list.
 */

import type { PaymentRequestRow } from "../../components/payment-request/PaymentRequestTable";
import type { AuditItem, BillAttachment, BillDetail, BillListItem, PaymentItem } from "../api";

export const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
export const ENTITY_NAME = "E2E Petty Cash Shop";

/** An ISO timestamp `days` from now, so a fixture's dates never drift into the past. */
export function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

let seq = 0;
const nextId = () => `bill-${(seq += 1)}`;

export function bill(overrides: Partial<BillDetail> = {}): BillDetail {
  const id = overrides.id ?? nextId();
  return {
    id,
    entity_id: ENTITY_ID,
    contact: "Young Bros Transport",
    status: "submitted",
    amount: "6000.00",
    amount_due: "6000.00",
    description: "Corporate stationery and printer supplies",
    due_date: "2026-03-31",
    invoice_date: "2026-03-03",
    reference: `PR-${id}`,
    currency_code: "HKD",
    xero_account_code: "429",
    published: "",
    created_at: "2026-03-03T02:00:00Z",
    uploaded_by: "Olive Vine",
    paid_at: null,
    xero_contact_id: "xero-contact-1",
    updated_at: "2026-03-03T02:00:00Z",
    attachments: [],
    line_items: [],
    ...overrides,
  };
}

/** The list endpoint's narrower row: the detail's own fields, minus the four it does not send. */
export function billListItem(overrides: Partial<BillListItem> = {}): BillListItem {
  const full = bill(overrides as Partial<BillDetail>);
  const LIST_FIELDS: (keyof BillListItem)[] = [
    "id", "entity_id", "contact", "status", "amount", "amount_due", "description",
    "due_date", "invoice_date", "reference", "currency_code", "xero_account_code",
    "published", "created_at", "uploaded_by", "paid_at",
  ];
  const row = {} as Record<string, unknown>;
  for (const field of LIST_FIELDS) row[field] = full[field];
  return row as BillListItem;
}

/**
 * `count` rows with distinct ids. `startAt` matters more than it looks: the list screen walks
 * the endpoint page by page and DEDUPES by id, stopping when a page adds nothing new - so two
 * pages built with the same ids read as "the backend is ignoring ?page" and end the walk.
 */
export function billList(
  count: number,
  overrides: Partial<BillListItem> = {},
  startAt = 1,
): BillListItem[] {
  return Array.from({ length: count }, (_, i) => {
    const n = startAt + i;
    return billListItem({
      id: `bill-list-${n}`,
      reference: `PR-${String(n).padStart(4, "0")}`,
      ...overrides,
    });
  });
}

/** One bill per status the API sends, in the order the status tabs show them. */
export const BY_STATUS: Record<string, BillListItem> = {
  submitted: billListItem({
    id: "bill-requested",
    reference: "PR-0001",
    status: "submitted",
    contact: "Young Bros Transport",
    amount: "6000.00",
    amount_due: "6000.00",
  }),
  partially_paid: billListItem({
    id: "bill-partial",
    reference: "PR-0002",
    status: "partially_paid",
    contact: "ABC Furniture",
    amount: "13000.50",
    amount_due: "1500.00",
  }),
  returned: billListItem({
    id: "bill-returned",
    reference: "PR-0003",
    status: "returned",
    contact: "Returned Supplies Ltd",
    amount: "300.00",
    amount_due: "300.00",
  }),
  paid: billListItem({
    id: "bill-paid",
    reference: "PR-0004",
    status: "paid",
    contact: "Paid In Full Co",
    amount: "3000.00",
    amount_due: "0.00",
    paid_at: "2026-03-10T02:00:00Z",
  }),
  draft: billListItem({
    id: "bill-draft",
    reference: "PR-0005",
    status: "draft",
    contact: "Draft Supplier",
    amount: "450.25",
    amount_due: "450.25",
  }),
  void: billListItem({
    id: "bill-void",
    reference: "PR-0006",
    status: "void",
    contact: "Cancelled Order Inc",
    amount: "800.00",
    amount_due: "800.00",
  }),
};

/** Every status, as the list endpoint would answer with no status filter. */
export const ALL_STATUSES: BillListItem[] = Object.values(BY_STATUS);

/**
 * An invoice attachment on a request. Worth having in the fixtures rather than inline: a payment
 * request must keep at least ONE attachment, so a detail screen served with none cannot be
 * saved - it opens the "this one has to stay" dialog instead.
 */
export function billAttachment(overrides: Partial<BillAttachment> = {}): BillAttachment {
  return {
    id: "bill-attachment-1",
    attachment_role: "invoice",
    sort_order: 0,
    note: "",
    created_at: "2026-03-03T02:00:00Z",
    attachment: {
      id: "attachment-1",
      original_name: "invoice.pdf",
      mime_type: "application/pdf",
      file_size: 20_480,
      file_extension: "pdf",
      storage_provider: "b2",
      created_at: "2026-03-03T02:00:00Z",
      download_url: "https://files.test/invoice.pdf",
    },
    ...overrides,
  };
}

export function payment(overrides: Partial<PaymentItem> = {}): PaymentItem {
  return {
    id: "payment-1",
    bill_id: "bill-requested",
    payment_date: "2026-03-10",
    amount: "1500.00",
    currency_code: "HKD",
    payment_method: "bank_transfer",
    payment_status: "settled",
    reference_no: "TRX-1",
    note: "",
    xero_payment_id: "",
    created_by: "user-1",
    created_by_name: "Olive Vine",
    created_at: "2026-03-10T02:00:00Z",
    updated_at: "2026-03-10T02:00:00Z",
    ...overrides,
  };
}

export function audit(overrides: Partial<AuditItem> = {}): AuditItem {
  return {
    id: "audit-1",
    bill_id: "bill-requested",
    action: "created",
    detail: "Payment request created",
    date: "2026-03-03T02:00:00Z",
    user_id: "user-1",
    user_name: "Olive Vine",
    user_email: "olive@minty.test",
    ...overrides,
  };
}

/**
 * A table row as the list screen builds it. The amounts are the ones the search and sort tests
 * reason about: `invoiceTotal` carries no currency symbol, `unpaidAmount` does.
 */
export function billRow(overrides: Partial<PaymentRequestRow> = {}): PaymentRequestRow {
  return {
    id: "row-1",
    reference: "PR-0001",
    contactTitle: "Young Bros Transport",
    contactCaption: "Corporate stationery and printer supplies",
    invoiceDate: "03 Mar 2026",
    invoiceDateIso: "2026-03-03",
    submittedDate: "04 Mar 2026",
    submittedDateIso: "2026-03-04",
    status: "Payment Requested",
    unpaidAmount: "HK$ 6,000.00",
    invoiceTotal: "6,000.00",
    payment: "",
    paidDate: "-",
    bankslip: "",
    currencyCode: "HKD",
    ...overrides,
  };
}

/** The four amounts the search tests turn on: 3,000.00 · 13,000.50 · 300.00 · 1,500.00. */
export const SEARCH_ROWS: PaymentRequestRow[] = [
  billRow({ id: "r-3000", contactTitle: "Exact Three Thousand", invoiceTotal: "3,000.00", unpaidAmount: "HK$ 3,000.00" }),
  billRow({ id: "r-13000", contactTitle: "Thirteen Thousand Fifty", invoiceTotal: "13,000.50", unpaidAmount: "HK$ 13,000.50" }),
  billRow({ id: "r-300", contactTitle: "Three Hundred", invoiceTotal: "300.00", unpaidAmount: "HK$ 300.00" }),
  billRow({ id: "r-1500", contactTitle: "3000", contactCaption: "A supplier literally named 3000", invoiceTotal: "1,500.00", unpaidAmount: "HK$ 1,500.00" }),
];
