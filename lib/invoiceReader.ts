/**
 * The invoice reader in the new-bill form (owner, 2026-11-04): what `POST /bills/extract/` answers
 * and how its suggestions land in PaymentRequestModal's fields - pure functions over the form's
 * values, on `@minty/shared/reader` (the rules shared with Petty Cash's receipt reader).
 *
 * A suggestion fills a field only when it is EMPTY - or still at the form's own default that the
 * person has not touched (today's invoice date, the company's default account; re-picking the same
 * value counts as touching it). A field holding the person's value keeps it, and the invoice's
 * different reading is offered in a note ("Use the value from the invoice"). The low band only
 * ever offers. Nothing is saved until Confirm or Save as Draft. The supplier and the account are
 * chosen only from the company's own lists; a supplier name that matches none goes into the
 * supplier box as typed text, so the picker's own "+ Add ... as a new supplier" offers it -
 * creating it stays the person's press. The bill number is never read (it is Minty's reference).
 */

import { formatAmount, parseAmount } from "@minty/shared/money";
import {
  createReaderLatch,
  edited as sharedEdited,
  fillable,
  readerState,
  type Band,
  type ReaderSpec,
  type ReaderState,
  type ReadField,
} from "@minty/shared/reader";

import { formatIsoDateAsDdMmmYyyy as formatDisplayDate } from "@/lib/dateDisplayFormat";

export type InvoiceSuggestions = {
  supplier?: ReadField & { contact_id?: string; detected_name?: string };
  account?: ReadField & { code?: string; name?: string };
  amount?: ReadField;
  description?: ReadField;
  invoice_date?: ReadField;
  due_date?: ReadField;
  currency?: string;
  entity_currency?: string | null;
};

/** The form's values the reader may fill (the modal keeps each in its own state). */
export type InvoiceValues = {
  /** Xero ContactID ("" while a name is only typed). */
  contact: string;
  contactInput: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
  description: string;
  /** "code - name", as the account select holds it. */
  accountCode: string;
};

export type InvoiceField =
  "supplier" | "invoiceDate" | "dueDate" | "amount" | "description" | "account";

export type InvoiceState = ReaderState<InvoiceValues, InvoiceField>;

/** The form's own defaults: what Clear puts back, and what counts as empty until touched. */
export type InvoiceDefaults = { invoiceDate: string; accountCode: string };

export const INVOICE_LATCH = createReaderLatch("minty.prw.invoice-reader");

// The words (Part 10 §10.25, Part 11 §11.22-11.25, Part 15 §15.14: no "AI", no confidence numbers).
export const READING_TITLE = "Minty is reading the invoice details.";
export const READING_DETAIL = "This can take a few seconds. You can keep filling in the form.";
export const READ_FAILED = "I couldn't read this invoice. Enter the details yourself.";
export const CLEAR_LABEL = "Clear the suggested value for this field";
export const USE_LABEL = "Use the value from the invoice";

/** The line under a suggested field: the medium band asks for the check more plainly. */
export function suggestedText(band: Band): string {
  return band === "medium"
    ? "Suggested from the invoice. Check it before you submit."
    : "Suggested from the invoice.";
}

export const EMPTY_INVOICE: InvoiceValues = {
  contact: "",
  contactInput: "",
  invoiceDate: "",
  dueDate: "",
  amount: "",
  description: "",
  accountCode: "",
};

export function invoiceState(values: InvoiceValues = EMPTY_INVOICE): InvoiceState {
  return readerState<InvoiceValues, InvoiceField>(values);
}

const blank = (text: string) => text.trim() === "";
const sameAmount = (a: string, b: string) =>
  Math.abs((parseAmount(a) ?? 0) - (parseAmount(b) ?? 0)) < 0.005;

/** The rules' view of the form: Clear puts a default back; the amount grouped on blur is no change. */
export function invoiceSpec(defaults: InvoiceDefaults): ReaderSpec<InvoiceValues, InvoiceField> {
  const CLEARED: Record<InvoiceField, Partial<InvoiceValues>> = {
    supplier: { contact: "", contactInput: "" },
    invoiceDate: { invoiceDate: defaults.invoiceDate },
    dueDate: { dueDate: "" },
    amount: { amount: "" },
    description: { description: "" },
    account: { accountCode: defaults.accountCode },
  };
  return {
    touchOnSame: true,
    cleared: (field) => CLEARED[field],
    same: (field, before, after) =>
      field === "amount" &&
      !blank(before.amount) &&
      !blank(after.amount) &&
      sameAmount(before.amount, after.amount),
  };
}

/** The person changed a field: it is theirs now. */
export const edited = (
  state: InvoiceState,
  field: InvoiceField,
  patch: Partial<InvoiceValues>,
  defaults: InvoiceDefaults,
) => sharedEdited(state, field, patch, invoiceSpec(defaults), "supplier");

const hedge = (band: Band) => (band === "low" ? "might read" : "reads");

const FIELD_NAMES: Record<InvoiceField, string> = {
  supplier: "supplier",
  invoiceDate: "invoice date",
  dueDate: "due date",
  amount: "amount",
  description: "description",
  account: "account code",
};

/**
 * The form after an answer: each applied suggestion fills its field when the field is empty or at
 * an untouched default (and marks it); a reading that differs from what is there - or a low-band
 * one - becomes a note offering it; an unmatched supplier name goes in as typed text. Previous
 * suggestions are expected to be gone already (`withoutSuggestions`).
 */
export function withInvoiceSuggestions(
  state: InvoiceState,
  s: InvoiceSuggestions,
  {
    contacts,
    accountOptions,
    decimals,
    defaults,
  }: {
    contacts: Map<string, { xero_contact_id: string; name: string }>;
    /** The account select's values ("code - name"). */
    accountOptions: string[];
    decimals: number;
    defaults: InvoiceDefaults;
  },
): InvoiceState {
  const values = { ...state.values };
  const marks = { ...state.marks };
  const notes = { ...state.notes };
  const filled: InvoiceField[] = [];
  const noted: InvoiceField[] = [];
  const currency = (s.entity_currency ?? "").trim();
  const foreign = !!s.currency && !!currency && s.currency !== currency;

  const offer = (
    field: InvoiceField,
    read: ReadField,
    patch: Partial<InvoiceValues>,
    shown: string,
    current: string,
    isBlank: boolean,
    atDefault: boolean,
    canFill = true,
  ) => {
    if (canFill && read.applied && fillable(state, field, isBlank, atDefault)) {
      Object.assign(values, patch);
      marks[field] = read.band;
      delete notes[field];
      filled.push(field);
    } else if (
      isBlank ||
      atDefault ||
      current.trim().toLowerCase() !== shown.trim().toLowerCase()
    ) {
      notes[field] = {
        text: isBlank
          ? `The invoice ${hedge(read.band)} ${shown}.`
          : `The invoice ${hedge(read.band)} ${shown}, not ${current}.`,
        fill: patch,
        band: read.band,
      };
      noted.push(field);
    }
  };

  // The dates (shown as the form shows them).
  for (const [field, key, read] of [
    ["invoiceDate", "invoiceDate", s.invoice_date],
    ["dueDate", "dueDate", s.due_date],
  ] as const) {
    if (!read?.value) continue;
    const current = values[key];
    const atDefault = field === "invoiceDate" && current === defaults.invoiceDate;
    if (current === read.value) continue;
    offer(
      field,
      read,
      { [key]: read.value },
      formatDisplayDate(read.value),
      current ? formatDisplayDate(current) : "",
      blank(current),
      atDefault,
    );
  }

  // The amount, in the company currency's places. One read in another currency is only offered.
  const amount = s.amount;
  const read = amount?.value ? amount.value.replace(/[^\d.-]/g, "") : "";
  const readValue = parseAmount(read) ?? 0;
  if (amount && readValue > 0 && !sameAmount(values.amount, read)) {
    const shown = formatAmount(read, decimals);
    offer(
      "amount",
      amount,
      { amount: shown },
      foreign ? `${s.currency} ${shown} (this bill is in ${currency})` : shown,
      values.amount,
      blank(values.amount),
      false,
      !foreign,
    );
  }

  // The description: filled only, never argued with (as for receipts).
  const description = s.description;
  if (description?.applied && description.value && blank(values.description)) {
    values.description = description.value;
    marks.description = description.band;
    filled.push("description");
  }

  // The supplier: by its id from the company's list only; an unknown name as typed text.
  const supplier = s.supplier;
  const supplierBlank = blank(values.contact) && blank(values.contactInput);
  const known = supplier?.contact_id ? contacts.get(supplier.contact_id) : undefined;
  let detectedName: string | null = null;
  if (supplier && known) {
    const current = values.contactInput || contacts.get(values.contact)?.name || "";
    if (values.contact !== known.xero_contact_id)
      offer(
        "supplier",
        supplier,
        { contact: known.xero_contact_id, contactInput: known.name },
        `"${known.name}"`,
        `"${current}"`,
        supplierBlank,
        false,
      );
  } else if (supplier?.detected_name?.trim() && supplierBlank) {
    detectedName = supplier.detected_name.trim();
    values.contactInput = detectedName;
  }

  // The account: by its code from the select's own options only.
  const account = s.account;
  const option = account?.code
    ? accountOptions.find((o) => o.split(" - ")[0] === account.code)
    : undefined;
  if (account && option && values.accountCode !== option)
    offer(
      "account",
      account,
      { accountCode: option },
      `"${option}"`,
      `"${values.accountCode}"`,
      blank(values.accountCode),
      values.accountCode === defaults.accountCode,
    );

  // One announcement, not several: a live region written twice quickly may be read once.
  const parts: string[] = [];
  if (filled.length)
    parts.push(
      `Minty read the invoice and filled ${filled.length} ${filled.length === 1 ? "field" : "fields"}: ${filled.map((f) => FIELD_NAMES[f]).join(", ")}. Check them before you submit.`,
    );
  if (noted.length)
    parts.push(
      `The invoice reads differently for: ${noted.map((f) => FIELD_NAMES[f]).join(", ")}. Nothing has been changed.`,
    );
  if (detectedName)
    parts.push(
      `The invoice names a supplier that is not in your list: ${detectedName}. You can add it as a new supplier.`,
    );

  return { ...state, values, marks, notes, detectedName, announcement: parts.join(" ") };
}

/** Whether an answer showed the person anything (a filled field, a note, an offered supplier). */
export const showedAnything = (state: InvoiceState) =>
  Object.keys(state.marks).length > 0 ||
  Object.keys(state.notes).length > 0 ||
  state.detectedName !== null;
