"use client";

/**
 * A payment request's details on its page (Part 15.17, D15-12).
 *
 * - **View:** Part 14 Description rows (`dl`), not disabled inputs - Supplier, Description,
 *   Invoice amount, Paid so far, Unpaid, Invoice date, Due date, Account code, Payment No. An
 *   empty value reads "Not set yet". Amounts are text/primary, tabular, `translate="no"`.
 *   The old "Detailed Information" title is retired.
 * - **Edit:** the same fields in the Part 14 Field anatomy, in the order they appear on the paper
 *   invoice (15.3) - the same order as Add payment request. Required fields carry the red `*`
 *   from the start and "required" for assistive technology; an error replaces the helper.
 */

import type { ReactNode } from "react";
import { useId } from "react";

import { BillContactPicker } from "@/components/BillContactPicker";
import { DateTextField } from "@/components/DateTextField";
import { ThemedSelect, type ThemedSelectOption } from "@/components/ThemedSelect";
import { Field, inputClass } from "@/components/ui/Field";
import {
  acceptAmountInput,
  formatAmount,
  formatMoney,
  parseAmount,
  toAmountEditString,
} from "@minty/shared/money";
import type { EntityBillContact } from "@/lib/api";
import { mergeSelectOption } from "@/lib/billFormSelectOptions";
import { formatDay } from "@minty/shared/dates";
import { useEntityCurrency } from "@/lib/entityCurrency";

/** Bill / request fields shown on the request's page. */
export type PaymentRequestDetailedInfoData = {
  billNo: string;
  amount: string;
  /** ISO 4217 (e.g. HKD). */
  currencyCode: string;
  description: string;
  contact: string;
  /** Xero ContactID when supplier is chosen from synced contacts; empty if unknown. */
  xero_contact_id: string;
  accountCode: string;
  /** ISO date YYYY-MM-DD */
  invoiceDate: string;
  /** ISO date YYYY-MM-DD */
  dueDate: string;
};

export type PaymentRequestDetailedInfoProps = {
  data: PaymentRequestDetailedInfoData;
  isEditing?: boolean;
  isSaving?: boolean;
  disabled?: boolean;
  /** Inline error under Payment No. (e.g. duplicate invoice number from API). */
  billNoError?: string | null;
  accountCodeError?: string | null;
  invoiceDateError?: string | null;
  dueDateError?: string | null;
  amountError?: string | null;
  contactError?: string | null;
  accountOptions?: ThemedSelectOption[];
  /** Contacts for typeahead / create-in-Xero (edit mode). */
  entityBillContacts?: EntityBillContact[];
  onRefetchEntityBillContacts?: (ensureMerged?: EntityBillContact) => Promise<void>;
  onPatchChange?: (patch: Partial<PaymentRequestDetailedInfoData>) => void;
  className?: string;
  /** View only: what is still owed (formatted, no currency). */
  unpaidAmount?: string;
  /** Element ids for the error summary to link to, keyed by field. */
  fieldIds?: Partial<
    Record<"amount" | "contact" | "accountCode" | "invoiceDate" | "dueDate" | "billNo", string>
  >;
};

export function formatPaymentRequestDetailLongDate(iso: string): string {
  if (!iso) return "";
  return formatDay(iso) || iso;
}

/** `noTranslate`: a code or a number the browser must not translate - put on the row, never as a
 *  wrapper around the value, or an empty value stops reading as empty. */
function Row({
  term,
  children,
  amount = false,
  noTranslate = false,
}: {
  term: string;
  children: ReactNode;
  amount?: boolean;
  noTranslate?: boolean;
}) {
  const empty = children == null || children === "" || children === "—";
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-b border-border-subtle py-3 last:border-b-0 sm:grid sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-body-s text-text-secondary">{term}</dt>
      <dd
        className={`min-w-0 break-words text-body-m ${empty ? "text-text-muted" : "text-text-primary"} ${amount ? "tabular-nums" : ""}`}
        {...(amount || noTranslate ? { translate: "no" as const } : {})}
      >
        {empty ? "Not set yet" : children}
      </dd>
    </div>
  );
}

export function PaymentRequestDetailedInfo({
  data,
  isEditing = false,
  disabled = false,
  billNoError = null,
  accountCodeError = null,
  invoiceDateError = null,
  dueDateError = null,
  amountError = null,
  contactError = null,
  onPatchChange,
  className = "",
  accountOptions: accountOptionsProp,
  entityBillContacts = [],
  onRefetchEntityBillContacts,
  unpaidAmount,
  fieldIds,
}: PaymentRequestDetailedInfoProps) {
  const {
    billNo,
    amount,
    description,
    contact,
    xero_contact_id,
    accountCode,
    invoiceDate,
    dueDate,
  } = data;
  const patch = onPatchChange ?? (() => {});
  const uid = useId();
  const currency = useEntityCurrency();
  const accountOptions = mergeSelectOption(accountOptionsProp ?? [], accountCode);
  const money = (v: string | number | undefined) => formatMoney(v, currency);

  if (!isEditing) {
    const invoice = parseAmount(amount);
    const unpaid = parseAmount(unpaidAmount);
    const paidSoFar = invoice !== null && unpaid !== null ? Math.max(0, invoice - unpaid) : null;
    return (
      <section className={className} aria-label="Payment request details">
        <dl className="rounded-lg border border-border-subtle bg-surface-card px-4">
          <Row term="Supplier">{contact}</Row>
          <Row term="Description">{description}</Row>
          <Row term="Invoice amount" amount>
            {money(amount)}
          </Row>
          {paidSoFar !== null ? (
            <Row term="Paid so far" amount>
              {money(paidSoFar)}
            </Row>
          ) : null}
          {unpaidAmount != null ? (
            <Row term="Unpaid" amount>
              <span className="font-semibold">{money(unpaidAmount)}</span>
            </Row>
          ) : null}
          <Row term="Invoice date">{formatPaymentRequestDetailLongDate(invoiceDate)}</Row>
          <Row term="Due date">{formatPaymentRequestDetailLongDate(dueDate)}</Row>
          <Row term="Account code" noTranslate>
            {accountCode}
          </Row>
          <Row term="Payment No." noTranslate>
            {billNo}
          </Row>
        </dl>
      </section>
    );
  }

  const ids = {
    contact: fieldIds?.contact ?? `detail-contact-${uid}`,
    amount: fieldIds?.amount ?? `detail-amount-${uid}`,
    invoiceDate: fieldIds?.invoiceDate ?? `detail-inv-date-${uid}`,
    dueDate: fieldIds?.dueDate ?? `detail-due-date-${uid}`,
    accountCode: fieldIds?.accountCode ?? `detail-account-${uid}`,
    billNo: fieldIds?.billNo ?? `detail-bill-no-${uid}`,
  };

  // Part 15.3: the paper invoice's order - supplier, amount, dates, description, then the rest.
  return (
    <section className={`flex flex-col gap-5 ${className}`} aria-label="Edit payment request">
      <Field label="Supplier" required id={ids.contact} error={contactError ?? undefined}>
        {(a11y) => (
          <BillContactPicker
            id={a11y.id}
            ariaDescribedBy={a11y["aria-describedby"]}
            required
            contacts={entityBillContacts}
            xeroContactId={xero_contact_id}
            contactName={contact}
            onChange={(next) =>
              patch({ contact: next.contact, xero_contact_id: next.xero_contact_id })
            }
            refetchContacts={onRefetchEntityBillContacts ?? (async () => {})}
            disabled={disabled}
            error={!!contactError}
          />
        )}
      </Field>

      <Field
        label={`Invoice amount (${currency || "—"})`}
        required
        id={ids.amount}
        error={amountError ?? undefined}
      >
        {(a11y) => (
          <input
            {...a11y}
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            translate="no"
            value={amount ?? ""}
            onChange={(e) => {
              const value = acceptAmountInput(e.target.value);
              if (value === null) return;
              patch({ amount: value });
            }}
            onFocus={() => patch({ amount: toAmountEditString(amount) })}
            onBlur={(e) => patch({ amount: formatAmount(e.target.value) })}
            disabled={disabled}
            className={`${inputClass(!!amountError)} text-right tabular-nums`}
          />
        )}
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
        <Field
          label="Invoice date"
          required
          id={ids.invoiceDate}
          error={invoiceDateError ?? undefined}
        >
          {(a11y) => (
            <DateTextField
              id={a11y.id}
              ariaDescribedBy={a11y["aria-describedby"]}
              required
              value={invoiceDate ?? ""}
              onChange={(iso) => patch({ invoiceDate: iso })}
              disabled={disabled}
              invalid={!!invoiceDateError}
              calendarAriaLabel="Invoice date"
              textInputClassName={inputClass(!!invoiceDateError)}
              calendarButtonClassName="hidden"
            />
          )}
        </Field>
        <Field label="Due date" required id={ids.dueDate} error={dueDateError ?? undefined}>
          {(a11y) => (
            <DateTextField
              id={a11y.id}
              ariaDescribedBy={a11y["aria-describedby"]}
              required
              value={dueDate ?? ""}
              onChange={(iso) => patch({ dueDate: iso })}
              disabled={disabled}
              invalid={!!dueDateError}
              calendarAriaLabel="Due date"
              textInputClassName={inputClass(!!dueDateError)}
              calendarButtonClassName="hidden"
            />
          )}
        </Field>
      </div>

      <Field label="Description" id={`detail-desc-${uid}`}>
        {(a11y) => (
          <input
            {...a11y}
            type="text"
            value={description ?? ""}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="e.g. Monthly delivery retainer"
            disabled={disabled}
            className={inputClass()}
          />
        )}
      </Field>

      <Field
        label="Account code"
        required
        id={ids.accountCode}
        error={accountCodeError ?? undefined}
      >
        {(a11y) => (
          <ThemedSelect
            id={a11y.id}
            ariaDescribedBy={a11y["aria-describedby"]}
            required
            value={accountCode ?? ""}
            onChange={(v) => patch({ accountCode: v })}
            options={accountOptions}
            placeholder="Select an account code"
            disabled={disabled}
            error={!!accountCodeError}
            plainChevron
            searchable
          />
        )}
      </Field>

      <Field label="Payment No." id={ids.billNo} error={billNoError ?? undefined}>
        {(a11y) => (
          <input
            {...a11y}
            type="text"
            translate="no"
            value={billNo ?? ""}
            onChange={(e) => patch({ billNo: e.target.value })}
            placeholder="e.g. MBIOVI-115803031626"
            disabled={disabled}
            className={inputClass(!!billNoError)}
          />
        )}
      </Field>
    </section>
  );
}
