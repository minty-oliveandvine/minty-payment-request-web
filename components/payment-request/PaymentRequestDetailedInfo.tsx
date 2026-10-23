"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { BillContactPicker } from "@/components/BillContactPicker";
import { DateTextField } from "@/components/DateTextField";
import { ThemedSelect } from "@/components/ThemedSelect";
import { useEntityCurrency } from "@/lib/entityCurrency";
import { formatIsoDateForDisplay } from "@/lib/dateDisplayFormat";
import type { ThemedSelectOption } from "@/components/ThemedSelect";
import { mergeSelectOption } from "@/lib/billFormSelectOptions";
import type { EntityBillContact } from "@/lib/api";
import { acceptAmountInput, formatAmount, toAmountEditString } from "@/lib/amountFormat";

/** Bill / request fields shown in the “Detailed Information” card. */
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
  /** Inline error under Bill No. (e.g. duplicate invoice number from API). */
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
  onEdit?: () => void;
  onCancel?: () => void;
  onSave?: () => void;
  className?: string;
  editInCardHeader?: boolean;
  /** Renders to the right of the Contact control (same row as the picker / read-only value). */
  contactHeaderEnd?: ReactNode;
  /** Static-view-only outstanding balance. Hidden when editing. */
  unpaidAmount?: string;
};

/** Shared with easy-view draft detailed card so labels match the detail page. */
export const paymentRequestDetailFieldLabelClass =
  "mb-1.5 block text-[11px] font-semibold tracking-wide text-gray-700 sm:text-xs";

/** Same as modal text inputs (Bill No., Description, etc.) — shared with easy-view draft inline edit. */
export const paymentRequestDetailModalTextInputClass =
  "box-border h-11 min-h-[44px] w-full rounded-2xl border border-gray-300 bg-white px-3 text-base text-black placeholder:text-gray-700 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25 sm:min-h-11 sm:text-sm";

export const paymentRequestDetailAmountValueInputClass =
  "box-border h-11 min-h-[44px] min-w-0 w-full rounded-2xl border border-gray-300 bg-white px-3 text-base text-black placeholder:text-gray-700 focus:outline-none focus:ring-2 sm:min-h-11 sm:flex-1 sm:rounded-l-none sm:rounded-r-2xl sm:border-l-0 sm:text-sm focus:border-secondary focus:ring-secondary/25";

/** Static currency cell left of the amount input — mirrors the amount input's border/size. */
export const paymentRequestDetailCurrencyCellClass =
  "box-border flex h-11 min-h-[44px] w-full shrink-0 items-center justify-center rounded-2xl border bg-white px-2 text-base text-black sm:min-h-11 sm:w-24 sm:rounded-l-2xl sm:rounded-r-none sm:border-r-0 sm:px-3 sm:text-sm";

export const paymentRequestDetailDateTextInputClass =
  "relative z-[1] box-border h-11 min-h-[44px] w-full rounded-2xl border border-gray-300 bg-white py-0 pl-3 pr-3 text-base text-black placeholder:text-gray-700 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25 [color-scheme:light] sm:min-h-11 sm:text-sm";

export const paymentRequestDetailDateTextInputClassError =
  "relative z-[1] box-border h-11 min-h-[44px] w-full rounded-2xl border border-red-500 bg-white py-0 pl-3 pr-3 text-base text-black placeholder:text-gray-700 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200/50 [color-scheme:light] sm:min-h-11 sm:text-sm";

const cancelButtonClass =
  "box-border h-11 min-h-[44px] shrink-0 cursor-pointer rounded-lg border-2 border-secondary bg-white px-4 text-sm font-semibold text-secondary transition-colors hover:bg-secondary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[44px] sm:px-5";

const saveButtonClass =
  "box-border h-11 min-h-[44px] shrink-0 cursor-pointer rounded-lg border border-transparent bg-secondary px-5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[44px] sm:px-6";

/** Matches card header actions; use in BillActionBar when `editInCardHeader` is false. */
export {
  cancelButtonClass as paymentRequestDetailCancelButtonClass,
  saveButtonClass as paymentRequestDetailSaveButtonClass,
};

/** Header actions row: same min-height in view (Edit) and edit (Cancel + Save) to avoid vertical jump. */
export const paymentRequestDetailHeaderActionsClass =
  "flex min-h-[44px] w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end";

export const paymentRequestDetailEditToggleButtonClass =
  "inline-flex h-11 min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-4 text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-95 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

function FieldLabel({
  htmlFor,
  editing,
  children,
}: {
  htmlFor?: string;
  editing: boolean;
  children: ReactNode;
}) {
  if (editing && htmlFor) {
    return (
      <label htmlFor={htmlFor} className={paymentRequestDetailFieldLabelClass}>
        {children}
      </label>
    );
  }
  return <div className={paymentRequestDetailFieldLabelClass}>{children}</div>;
}

export function formatPaymentRequestDetailLongDate(iso: string): string {
  if (!iso) return "—";
  const formatted = formatIsoDateForDisplay(iso);
  return formatted || iso;
}

/** Read-only text row: same outer box as modal `<input>`. */
export function PaymentRequestReadOnlyTextBox({
  children,
  emphasis = "normal",
  highlightError = false,
}: {
  children: React.ReactNode;
  emphasis?: "normal" | "semibold";
  highlightError?: boolean;
}) {
  return (
    <div
      className={`flex h-11 min-h-[44px] w-full items-center rounded-lg bg-transparent px-3 text-base text-black sm:min-h-11 sm:text-sm ${emphasis === "semibold" ? "font-semibold" : "font-normal"} ${highlightError ? "ring-2 ring-inset ring-red-500" : ""}`}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}

/** Matches ThemedSelect split trigger (contact / account) — non-interactive. */
export function PaymentRequestReadOnlySelectShell({
  value,
  highlightError = false,
}: {
  value?: string | null;
  highlightError?: boolean;
}) {
  const display = (value ?? "").trim() || "—";
  return (
    <div
      className={`box-border flex h-11 min-h-[44px] min-w-0 w-full cursor-default overflow-hidden rounded-lg bg-transparent p-0 text-left text-base font-normal text-black sm:min-h-11 sm:text-sm ${highlightError ? "ring-2 ring-inset ring-red-500" : ""}`}
      aria-readonly="true"
    >
      <span className="flex min-h-[44px] min-w-0 flex-1 items-center py-0 pl-3 pr-3 sm:min-h-11">
        <span className="min-w-0 flex-1 truncate">{display}</span>
      </span>
    </div>
  );
}

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Renders an amount on a single line, shrinking the font just enough to fit the
 * column width (never wraps, never clips). Scales back up as space allows.
 */
const FIT_AMOUNT_MAX_PX = 24;
const FIT_AMOUNT_MIN_PX = 11;

function FitAmountText({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState<number>(FIT_AMOUNT_MAX_PX);
  const fontSizeRef = useRef<number>(FIT_AMOUNT_MAX_PX);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;
    // Scale proportionally from the currently-rendered size: text width is
    // linear in font size, so `current * available / needed` fits in one step
    // and works both shrinking and growing — no imperative reset needed.
    const fit = () => {
      const available = container.clientWidth;
      const needed = text.scrollWidth;
      if (available === 0 || needed === 0) return;
      const current = fontSizeRef.current;
      const next = Math.max(
        FIT_AMOUNT_MIN_PX,
        Math.min(FIT_AMOUNT_MAX_PX, Math.floor((current * available) / needed)),
      );
      if (next !== current) {
        fontSizeRef.current = next;
        setFontSize(next);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [children]);

  return (
    <span ref={containerRef} className="block min-w-0 flex-1 overflow-hidden">
      <span
        ref={textRef}
        className="inline-block whitespace-nowrap leading-snug"
        style={{ fontSize }}
      >
        {children}
      </span>
    </span>
  );
}

/** Same layout as amount row in modal: gray #EDEDED currency cell + white amount cell. */
export function PaymentRequestReadOnlyAmountRow({
  currencyDisplayLabel,
  amount,
  highlightError = false,
  tone = "default",
}: {
  currencyDisplayLabel: string;
  amount: string;
  highlightError?: boolean;
  tone?: "default" | "secondary";
}) {
  const amountColorClass = tone === "secondary" ? "text-secondary" : "text-black";
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
      <div
        className="box-border flex h-11 min-h-[44px] w-full shrink-0 items-center justify-between gap-2 rounded-lg bg-transparent px-2 pl-3 pr-2 text-base font-semibold text-black sm:w-24 sm:rounded-l-lg sm:rounded-r-none sm:px-3 sm:text-sm"
        aria-label="Currency"
      >
        <span className="min-w-0 flex-1 truncate">{currencyDisplayLabel}</span>
      </div>
      <div
        className={`box-border flex min-h-[52px] min-w-0 w-full items-center rounded-lg bg-transparent px-3 py-1 font-semibold tabular-nums ${amountColorClass} sm:min-h-14 sm:flex-1 sm:rounded-l-none sm:rounded-r-lg sm:leading-snug ${highlightError ? "ring-2 ring-inset ring-red-500" : ""}`}
        aria-readonly="true"
      >
        <FitAmountText>{amount || "—"}</FitAmountText>
      </div>
    </div>
  );
}

export function PaymentRequestReadOnlyDateRow({
  display,
  highlightError = false,
}: {
  display: string;
  highlightError?: boolean;
}) {
  return (
    <div
      className={`flex h-11 min-h-[44px] w-full items-center rounded-lg bg-transparent px-3 text-base font-semibold text-black sm:min-h-11 sm:text-sm ${highlightError ? "ring-2 ring-inset ring-red-500" : ""}`}
    >
      <span className="min-w-0 flex-1 truncate">{display}</span>
    </div>
  );
}

export function PaymentRequestDetailedInfo({
  data,
  isEditing = false,
  isSaving = false,
  disabled = false,
  billNoError = null,
  accountCodeError = null,
  invoiceDateError = null,
  dueDateError = null,
  amountError = null,
  contactError = null,
  onPatchChange,
  onEdit,
  onCancel,
  onSave,
  className = "",
  accountOptions: accountOptionsProp,
  entityBillContacts = [],
  onRefetchEntityBillContacts,
  editInCardHeader = true,
  contactHeaderEnd,
  unpaidAmount,
}: PaymentRequestDetailedInfoProps) {
  const {
    billNo,
    amount,
    currencyCode,
    description,
    contact,
    xero_contact_id,
    accountCode,
    invoiceDate,
    dueDate,
  } = data;

  const patch = onPatchChange ?? (() => {});

  const uid = useId();

  const idBillNo = `detail-bill-no-${uid}`;
  const idAmount = `detail-amount-${uid}`;
  const idCurrency = `detail-currency-${uid}`;
  const idDescription = `detail-desc-${uid}`;
  const idContact = `detail-contact-${uid}`;
  const idAccount = `detail-account-${uid}`;
  const idInvoiceDate = `detail-inv-date-${uid}`;
  const idDueDate = `detail-due-date-${uid}`;
  const idBillNoError = `detail-bill-no-err-${uid}`;
  const idAccountError = `detail-account-err-${uid}`;
  const idInvoiceDateError = `detail-inv-date-err-${uid}`;
  const idDueDateError = `detail-due-date-err-${uid}`;
  const idAmountError = `detail-amount-err-${uid}`;
  const idContactError = `detail-contact-err-${uid}`;

  const entityCurrency = useEntityCurrency();
  const accountOptions = mergeSelectOption(accountOptionsProp ?? [], accountCode);
  const currencyDisplayLabel = entityCurrency;

  return (
    <section
      className={`rounded-xl border border-gray-200/90 bg-white p-4 sm:p-5 md:p-6 ${className}`}
    >
      <div
        className={`mb-4 flex flex-col gap-3 sm:mb-5 ${editInCardHeader ? "sm:flex-row sm:items-start sm:justify-between sm:gap-4" : ""}`}
      >
        <h2 className="min-w-0 text-base font-medium leading-snug text-primary sm:text-lg">
          Detailed Information
        </h2>
        {editInCardHeader ? (
          <div className={paymentRequestDetailHeaderActionsClass}>
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={onCancel}
                  className={cancelButtonClass}
                  disabled={disabled || isSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  className={saveButtonClass}
                  disabled={disabled || isSaving}
                >
                  {isSaving ? "Saving…" : "Save Changes"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onEdit}
                className={paymentRequestDetailEditToggleButtonClass}
                disabled={disabled}
              >
                Edit
                <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
                  edit_document
                </span>
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <FieldLabel htmlFor={idBillNo} editing={isEditing}>
            Payment No.
          </FieldLabel>
          {isEditing ? (
            <>
              <input
                id={idBillNo}
                type="text"
                value={billNo ?? ""}
                onChange={(e) => patch({ billNo: e.target.value })}
                aria-invalid={!!billNoError}
                aria-describedby={billNoError ? idBillNoError : undefined}
                className={
                  billNoError
                    ? "box-border h-11 min-h-[44px] w-full rounded-2xl border border-red-500 bg-white px-3 text-base text-black placeholder:text-gray-700 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200/50 sm:min-h-11 sm:text-sm"
                    : paymentRequestDetailModalTextInputClass
                }
                placeholder="MBIOVI-115803031626"
                disabled={disabled}
              />
              {billNoError ? (
                <p id={idBillNoError} className="mt-1 text-xs text-red-600" role="alert">
                  {billNoError}
                </p>
              ) : null}
            </>
          ) : (
            <PaymentRequestReadOnlyTextBox>{billNo}</PaymentRequestReadOnlyTextBox>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
          <div>
            <FieldLabel htmlFor={idInvoiceDate} editing={isEditing}>
              Invoice Date<span className="text-red-500"> *</span>
            </FieldLabel>
            {isEditing ? (
              <>
                <DateTextField
                  id={idInvoiceDate}
                  value={invoiceDate ?? ""}
                  onChange={(iso) => patch({ invoiceDate: iso })}
                  disabled={disabled}
                  invalid={!!invoiceDateError}
                  calendarAriaLabel="Open calendar for invoice date"
                  textInputClassName={
                    invoiceDateError
                      ? paymentRequestDetailDateTextInputClassError
                      : paymentRequestDetailDateTextInputClass
                  }
                  calendarButtonClassName="hidden"
                />
                {invoiceDateError ? (
                  <p id={idInvoiceDateError} className="mt-1 text-xs text-red-600" role="alert">
                    {invoiceDateError}
                  </p>
                ) : null}
              </>
            ) : (
              <PaymentRequestReadOnlyDateRow
                display={formatPaymentRequestDetailLongDate(invoiceDate)}
                highlightError={!!invoiceDateError}
              />
            )}
          </div>
          <div>
            <FieldLabel htmlFor={idDueDate} editing={isEditing}>
              Due Date<span className="text-red-500"> *</span>
            </FieldLabel>
            {isEditing ? (
              <>
                <DateTextField
                  id={idDueDate}
                  value={dueDate ?? ""}
                  onChange={(iso) => patch({ dueDate: iso })}
                  disabled={disabled}
                  invalid={!!dueDateError}
                  calendarAriaLabel="Open calendar for due date"
                  textInputClassName={
                    dueDateError
                      ? paymentRequestDetailDateTextInputClassError
                      : paymentRequestDetailDateTextInputClass
                  }
                  calendarButtonClassName="hidden"
                />
                {dueDateError ? (
                  <p id={idDueDateError} className="mt-1 text-xs text-red-600" role="alert">
                    {dueDateError}
                  </p>
                ) : null}
              </>
            ) : (
              <PaymentRequestReadOnlyDateRow
                display={formatPaymentRequestDetailLongDate(dueDate)}
                highlightError={!!dueDateError}
              />
            )}
          </div>
        </div>

        <div
          className={
            !isEditing && unpaidAmount != null
              ? "grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4"
              : undefined
          }
        >
          <div>
            <FieldLabel htmlFor={idAmount} editing={isEditing}>
              Amount<span className="text-red-500"> *</span>
            </FieldLabel>
            {isEditing ? (
              <>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:gap-0">
                  <div
                    id={idCurrency}
                    aria-label="Currency"
                    className={
                      `${paymentRequestDetailCurrencyCellClass} ` +
                      (amountError ? "border-red-500" : "border-gray-300")
                    }
                  >
                    {currencyDisplayLabel}
                  </div>
                  <input
                    id={idAmount}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount ?? ""}
                    onChange={(e) => {
                      const value = acceptAmountInput(e.target.value);
                      if (value === null) return;
                      patch({ amount: value });
                    }}
                    onFocus={() => patch({ amount: toAmountEditString(amount) })}
                    onBlur={(e) => {
                      patch({ amount: formatAmount(e.target.value) });
                    }}
                    aria-invalid={!!amountError}
                    aria-describedby={amountError ? idAmountError : undefined}
                    className={
                      amountError
                        ? `${paymentRequestDetailAmountValueInputClass} placeholder:text-gray-400 placeholder:opacity-60 border-red-500 focus:border-red-500 focus:ring-red-200/50`
                        : `${paymentRequestDetailAmountValueInputClass} placeholder:text-gray-400 placeholder:opacity-60`
                    }

                    disabled={disabled}
                  />
                </div>
                {amountError ? (
                  <p id={idAmountError} className="mt-1 text-xs text-red-600" role="alert">
                    {amountError}
                  </p>
                ) : null}
              </>
            ) : (
              <PaymentRequestReadOnlyAmountRow
                currencyDisplayLabel={currencyDisplayLabel}
                amount={amount}
                highlightError={!!amountError}
              />
            )}
          </div>

          {!isEditing && unpaidAmount != null ? (
            <div>
              <FieldLabel editing={false}>Unpaid Amount</FieldLabel>
              <PaymentRequestReadOnlyAmountRow
                currencyDisplayLabel={currencyDisplayLabel}
                amount={unpaidAmount}
                tone="secondary"
              />
            </div>
          ) : null}
        </div>

        <div>
          <FieldLabel htmlFor={idDescription} editing={isEditing}>
            Description
          </FieldLabel>
          {isEditing ? (
            <input
              id={idDescription}
              type="text"
              value={description ?? ""}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Description (Optional)"
              className={paymentRequestDetailModalTextInputClass}
              disabled={disabled}
            />
          ) : (
            <PaymentRequestReadOnlyTextBox>{description}</PaymentRequestReadOnlyTextBox>
          )}
        </div>

        <div>
          <FieldLabel htmlFor={idContact} editing={isEditing}>
            Supplier<span className="text-red-500"> *</span>
          </FieldLabel>
          <div className={contactHeaderEnd ? "flex items-center gap-2 sm:gap-3" : undefined}>
            <div className={contactHeaderEnd ? "min-w-0 flex-1" : undefined}>
              {isEditing ? (
                <>
                  <BillContactPicker
                    id={idContact}
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
                  {contactError ? (
                    <p id={idContactError} className="mt-1 text-xs text-red-600" role="alert">
                      {contactError}
                    </p>
                  ) : null}
                </>
              ) : (
                <PaymentRequestReadOnlySelectShell
                  value={contact}
                  highlightError={!!contactError}
                />
              )}
            </div>
            {contactHeaderEnd ? <div className="shrink-0">{contactHeaderEnd}</div> : null}
          </div>
        </div>

        <div>
          <FieldLabel htmlFor={idAccount} editing={isEditing}>
            Account Code<span className="text-red-500"> *</span>
          </FieldLabel>
          {isEditing ? (
            <>
              <ThemedSelect
                id={idAccount}
                value={accountCode ?? ""}
                onChange={(v) => patch({ accountCode: v })}
                options={accountOptions}
                placeholder="Select an account code"
                disabled={disabled}
                error={!!accountCodeError}
                triggerClassName="!rounded-2xl"
                plainChevron
                searchable
              />
              {accountCodeError ? (
                <p id={idAccountError} className="mt-1 text-xs text-red-600" role="alert">
                  {accountCodeError}
                </p>
              ) : null}
            </>
          ) : (
            <PaymentRequestReadOnlySelectShell value={accountCode} />
          )}
        </div>
      </div>
    </section>
  );
}
