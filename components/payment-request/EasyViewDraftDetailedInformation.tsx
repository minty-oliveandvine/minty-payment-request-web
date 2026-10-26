"use client";

import { useId, type ReactNode } from "react";
import type { EntityBillContact } from "@/lib/api";
import { BillContactPicker } from "@/components/BillContactPicker";
import { DateTextField } from "@/components/DateTextField";
import { ThemedSelect, type ThemedSelectOption } from "@/components/ThemedSelect";
import { mergeSelectOption } from "@/lib/billFormSelectOptions";
import { useEntityCurrency } from "@/lib/entityCurrency";
import { useAmountInput } from "@minty/shared/amountInput";
import {
  formatPaymentRequestDetailLongDate,
  paymentRequestDetailAmountValueInputClass,
  paymentRequestDetailCancelButtonClass,
  paymentRequestDetailCurrencyCellClass,
  paymentRequestDetailDateTextInputClass,
  paymentRequestDetailDateTextInputClassError,
  paymentRequestDetailEditToggleButtonClass,
  paymentRequestDetailFieldLabelClass,
  paymentRequestDetailHeaderActionsClass,
  paymentRequestDetailModalTextInputClass,
  paymentRequestDetailSaveButtonClass,
  PaymentRequestReadOnlyAmountRow,
  PaymentRequestReadOnlyDateRow,
  PaymentRequestReadOnlySelectShell,
  PaymentRequestReadOnlyTextBox,
  type PaymentRequestDetailedInfoData,
} from "./PaymentRequestDetailedInfo";

export type EasyViewDraftDetailActions = {
  onRequestDelete: () => void;
  deleteDisabled: boolean;
};

/** Matches Record Payment easy-inline / modal accent (`border-secondary/50`). */
const easyViewDetailedInformationShellClass =
  "w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-secondary/50 bg-white";

const easyViewDetailSkeletonField = "h-11 min-h-[44px] w-full animate-pulse rounded-lg bg-gray-100";

function EasyViewDetailSkeletonLabel() {
  return (
    <div className={paymentRequestDetailFieldLabelClass}>
      <span
        className="inline-block h-2.5 w-16 max-w-full rounded bg-gray-200/90 animate-pulse"
        aria-hidden
      />
    </div>
  );
}

/**
 * Loading placeholder matching {@link EasyViewDraftDetailedInformation} grids, padding, and shell
 * (read-only vs draft card header + optional paid/returned action row).
 */
export function EasyViewDetailedInformationSkeleton({
  mode = "readOnly",
  showFooterActionsSkeleton = false,
}: {
  mode?: "readOnly" | "draftCard";
  /** Paid / returned: stub row where Void + Publish load. */
  showFooterActionsSkeleton?: boolean;
}) {
  const header =
    mode === "draftCard" ? (
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="h-6 w-[min(100%,12rem)] max-w-full animate-pulse rounded-md bg-gray-200 sm:h-7" />
        <div className={paymentRequestDetailHeaderActionsClass}>
          <div className="h-11 min-h-[44px] w-[7.5rem] max-w-full shrink-0 animate-pulse rounded-lg bg-gray-100" />
        </div>
      </div>
    ) : (
      <div className="mb-4 sm:mb-5">
        <div className="h-6 w-[min(100%,12rem)] max-w-full animate-pulse rounded-md bg-gray-200 sm:h-7" />
      </div>
    );

  return (
    <div className={easyViewDetailedInformationShellClass} aria-hidden>
      <section className="w-full min-w-0 max-w-full border-0 bg-transparent p-4 sm:p-5 md:p-6 lg:p-7">
        {header}

        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-4">
          <div className="min-w-0">
            <EasyViewDetailSkeletonLabel />
            <div className={easyViewDetailSkeletonField} />
          </div>
          <div className="min-w-0">
            <EasyViewDetailSkeletonLabel />
            <div className={easyViewDetailSkeletonField} />
          </div>
          <div className="min-w-0">
            <EasyViewDetailSkeletonLabel />
            <div className={easyViewDetailSkeletonField} />
          </div>
          <div className="min-w-0">
            <EasyViewDetailSkeletonLabel />
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
              <div className="h-11 min-h-[44px] w-full shrink-0 animate-pulse rounded-lg bg-gray-100 sm:w-24 sm:rounded-l-lg sm:rounded-r-none" />
              <div className="h-11 min-h-[44px] w-full flex-1 animate-pulse rounded-lg bg-gray-100 sm:rounded-l-none sm:rounded-r-lg" />
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-4">
          <div className="min-w-0 lg:col-span-1">
            <EasyViewDetailSkeletonLabel />
            <div className={easyViewDetailSkeletonField} />
          </div>
          <div className="min-w-0 lg:col-span-1">
            <EasyViewDetailSkeletonLabel />
            <div className={easyViewDetailSkeletonField} />
          </div>
          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <EasyViewDetailSkeletonLabel />
            <div className={easyViewDetailSkeletonField} />
          </div>
        </div>

        {mode === "draftCard" ? (
          <div className="mt-8 flex w-full min-w-0 flex-row flex-wrap items-center justify-end gap-2 sm:gap-3">
            <div className="h-10 min-h-[44px] w-[8.5rem] max-w-full shrink-0 animate-pulse rounded-md bg-gray-100" />
          </div>
        ) : null}
        {showFooterActionsSkeleton ? (
          <div className="mt-8 flex w-full min-w-0 flex-row flex-wrap items-center justify-end gap-2 sm:gap-3">
            <div className="h-10 min-h-[44px] w-[6.5rem] shrink-0 animate-pulse rounded-md bg-gray-100" />
            <div className="h-10 min-h-[44px] w-[10rem] max-w-full shrink-0 animate-pulse rounded-full bg-gray-100" />
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** Delete row for easy-view draft detail (paid/returned use BillActionBar in EasyViewReadonlyBillDetailBody). */
export function EasyViewDraftBillActionsRow({
  actions,
  className = "mt-8",
}: {
  actions: EasyViewDraftDetailActions;
  /** Outer margin / layout (default matches read-only card spacing). */
  className?: string;
}) {
  return (
    <div
      className={`${className} flex w-full min-w-0 flex-row flex-wrap items-center justify-end gap-2 sm:gap-3`}
    >
      <button
        type="button"
        onClick={actions.onRequestDelete}
        disabled={actions.deleteDisabled}
        className="inline-flex h-10 min-h-[44px] w-auto shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-rose-50 px-3 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
      >
        Delete Payment
        <span className="material-symbols-outlined text-[20px] leading-none" aria-hidden>
          delete
        </span>
      </button>
    </div>
  );
}

export function EasyViewDraftDetailedInformation({
  data,
  actions,
  onEdit,
  editDisabled = false,
  readOnly = false,
  readOnlyFooter,
}: {
  data: PaymentRequestDetailedInfoData;
  actions?: EasyViewDraftDetailActions;
  onEdit?: () => void;
  editDisabled?: boolean;
  /** Paid / voided / returned: same horizontal layout, no edit and no actions row. */
  readOnly?: boolean;
  /** Paid / returned: void + publish bar inside the same shell as the detail page. */
  readOnlyFooter?: ReactNode;
}) {
  const { billNo, amount, currencyCode, description, contact, accountCode, invoiceDate, dueDate } =
    data;
  const entityCurrency = useEntityCurrency();
  const currencyDisplayLabel = entityCurrency;

  return (
    <div className={easyViewDetailedInformationShellClass}>
      <section className="w-full min-w-0 max-w-full border-0 bg-transparent p-4 sm:p-5 md:p-6 lg:p-7">
        <div
          className={
            readOnly
              ? "mb-4 sm:mb-5"
              : "mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
          }
        >
          <h2 className="min-w-0 text-base font-medium leading-snug text-primary sm:text-lg">
            Detailed Information
          </h2>
          {!readOnly && onEdit ? (
            <div className={paymentRequestDetailHeaderActionsClass}>
              <button
                type="button"
                onClick={onEdit}
                disabled={editDisabled}
                className={paymentRequestDetailEditToggleButtonClass}
              >
                Edit
                <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
                  edit_document
                </span>
              </button>
            </div>
          ) : null}
        </div>

        {/* Same read-only controls as main Detailed Information, in a horizontal grid */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-4">
          <div className="min-w-0">
            <div className={paymentRequestDetailFieldLabelClass}>Payment No.</div>
            <PaymentRequestReadOnlyTextBox>{billNo}</PaymentRequestReadOnlyTextBox>
          </div>
          <div className="min-w-0">
            <div className={paymentRequestDetailFieldLabelClass}>
              Due Date<span className="text-red-500"> *</span>
            </div>
            <PaymentRequestReadOnlyDateRow display={formatPaymentRequestDetailLongDate(dueDate)} />
          </div>
          <div className="min-w-0">
            <div className={paymentRequestDetailFieldLabelClass}>
              Invoice Date<span className="text-red-500"> *</span>
            </div>
            <PaymentRequestReadOnlyDateRow
              display={formatPaymentRequestDetailLongDate(invoiceDate)}
            />
          </div>
          <div className="min-w-0">
            <div className={paymentRequestDetailFieldLabelClass}>
              Amount<span className="text-red-500"> *</span>
            </div>
            <PaymentRequestReadOnlyAmountRow
              currencyDisplayLabel={currencyDisplayLabel}
              amount={amount}
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-4">
          <div className="min-w-0 lg:col-span-1">
            <div className={paymentRequestDetailFieldLabelClass}>
              Supplier<span className="text-red-500"> *</span>
            </div>
            <PaymentRequestReadOnlySelectShell value={contact} />
          </div>
          <div className="min-w-0 lg:col-span-1">
            <div className={paymentRequestDetailFieldLabelClass}>Description</div>
            <PaymentRequestReadOnlyTextBox>{description}</PaymentRequestReadOnlyTextBox>
          </div>
          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <div className={paymentRequestDetailFieldLabelClass}>
              Account Code<span className="text-red-500"> *</span>
            </div>
            <PaymentRequestReadOnlySelectShell value={accountCode} />
          </div>
        </div>

        {readOnly && readOnlyFooter ? (
          <div className="mt-8 w-full min-w-0 max-w-full">{readOnlyFooter}</div>
        ) : null}
        {!readOnly && actions ? <EasyViewDraftBillActionsRow actions={actions} /> : null}
      </section>
    </div>
  );
}

const easyDraftHeaderActionsClass =
  "flex min-h-[44px] w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end";

/** Edit form using the same grid and chrome as {@link EasyViewDraftDetailedInformation}. */
export function EasyViewDraftDetailedInformationEdit({
  actions,
  data,
  disabled,
  isSaving,
  billNoError,
  accountCodeError,
  invoiceDateError,
  dueDateError,
  amountError,
  contactError,
  accountOptions,
  entityBillContacts,
  onRefetchEntityBillContacts,
  onPatchChange,
  onCancel,
  onSave,
}: {
  actions: EasyViewDraftDetailActions;
  data: PaymentRequestDetailedInfoData;
  disabled: boolean;
  isSaving: boolean;
  billNoError: string | null;
  accountCodeError: string | null;
  invoiceDateError: string | null;
  dueDateError: string | null;
  amountError: string | null;
  contactError: string | null;
  accountOptions: ThemedSelectOption[];
  entityBillContacts: EntityBillContact[];
  onRefetchEntityBillContacts: (ensureMerged?: EntityBillContact) => Promise<void>;
  onPatchChange: (patch: Partial<PaymentRequestDetailedInfoData>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const uid = useId();
  const entityCurrency = useEntityCurrency();
  const idBillNo = `ev-draft-bn-${uid}`;
  const idInv = `ev-draft-inv-${uid}`;
  const idDue = `ev-draft-due-${uid}`;
  const idAmt = `ev-draft-amt-${uid}`;
  const idCur = `ev-draft-cur-${uid}`;
  const idDesc = `ev-draft-desc-${uid}`;
  const idContact = `ev-draft-contact-${uid}`;
  const idAccount = `ev-draft-acct-${uid}`;

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

  const amountInput = useAmountInput({
    value: amount ?? "",
    onValue: (v) => onPatchChange({ amount: v }),
  });
  const mergedAccountOptions = mergeSelectOption(accountOptions, accountCode);

  return (
    <div className={easyViewDetailedInformationShellClass}>
      <section className="w-full min-w-0 max-w-full border-0 bg-transparent p-4 sm:p-5 md:p-6 lg:p-7">
        <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <h2 className="min-w-0 text-base font-medium leading-snug text-primary sm:text-lg">
            Detailed Information
          </h2>
          <div className={easyDraftHeaderActionsClass}>
            <button
              type="button"
              onClick={onCancel}
              className={paymentRequestDetailCancelButtonClass}
              disabled={disabled || isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              className={paymentRequestDetailSaveButtonClass}
              disabled={disabled || isSaving}
            >
              {isSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-4">
          <div className="min-w-0">
            <label htmlFor={idBillNo} className={paymentRequestDetailFieldLabelClass}>
              Payment No.
            </label>
            <input
              id={idBillNo}
              type="text"
              value={billNo ?? ""}
              onChange={(e) => onPatchChange({ billNo: e.target.value })}
              disabled={disabled}
              aria-invalid={!!billNoError}
              className={
                billNoError
                  ? "box-border h-11 min-h-[44px] w-full rounded-2xl border border-red-500 bg-white px-3 text-base text-black placeholder:text-gray-700 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200/50 sm:min-h-11 sm:text-sm"
                  : paymentRequestDetailModalTextInputClass
              }
            />
            {billNoError ? (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {billNoError}
              </p>
            ) : null}
          </div>

          <div className="min-w-0">
            <label htmlFor={idDue} className={paymentRequestDetailFieldLabelClass}>
              Due Date<span className="text-red-500"> *</span>
            </label>
            <DateTextField
              id={idDue}
              value={dueDate ?? ""}
              onChange={(iso) => onPatchChange({ dueDate: iso })}
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
              <p className="mt-1 text-xs text-red-600" role="alert">
                {dueDateError}
              </p>
            ) : null}
          </div>

          <div className="min-w-0">
            <label htmlFor={idInv} className={paymentRequestDetailFieldLabelClass}>
              Invoice Date<span className="text-red-500"> *</span>
            </label>
            <DateTextField
              id={idInv}
              value={invoiceDate ?? ""}
              onChange={(iso) => onPatchChange({ invoiceDate: iso })}
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
              <p className="mt-1 text-xs text-red-600" role="alert">
                {invoiceDateError}
              </p>
            ) : null}
          </div>

          <div className="min-w-0">
            <label htmlFor={idAmt} className={paymentRequestDetailFieldLabelClass}>
              Amount<span className="text-red-500"> *</span>
            </label>
            <div className="mt-0.5 flex min-w-0 flex-col gap-2 sm:flex-row sm:gap-0">
              <div
                id={idCur}
                aria-label="Currency"
                className={
                  `${paymentRequestDetailCurrencyCellClass} ` +
                  (amountError ? "border-red-500" : "border-gray-300")
                }
              >
                {entityCurrency}
              </div>
              <input
                id={idAmt}
                placeholder="0.00"
                {...amountInput}
                disabled={disabled}
                aria-invalid={!!amountError}
                className={
                  amountError
                    ? `${paymentRequestDetailAmountValueInputClass} border-red-500 focus:border-red-500 focus:ring-red-200/50`
                    : paymentRequestDetailAmountValueInputClass
                }
              />
            </div>
            {amountError ? (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {amountError}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-4">
          <div className="min-w-0 lg:col-span-1">
            <label htmlFor={idContact} className={paymentRequestDetailFieldLabelClass}>
              Supplier<span className="text-red-500"> *</span>
            </label>
            <BillContactPicker
              id={idContact}
              contacts={entityBillContacts}
              xeroContactId={xero_contact_id ?? ""}
              contactName={contact}
              onChange={(next) =>
                onPatchChange({ contact: next.contact, xero_contact_id: next.xero_contact_id })
              }
              refetchContacts={onRefetchEntityBillContacts}
              disabled={disabled}
              error={!!contactError}
            />
            {contactError ? (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {contactError}
              </p>
            ) : null}
          </div>

          <div className="min-w-0 lg:col-span-1">
            <label htmlFor={idDesc} className={paymentRequestDetailFieldLabelClass}>
              Description
            </label>
            <input
              id={idDesc}
              type="text"
              value={description ?? ""}
              onChange={(e) => onPatchChange({ description: e.target.value })}
              disabled={disabled}
              placeholder="Description (Optional)"
              className={paymentRequestDetailModalTextInputClass}
            />
          </div>

          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <label htmlFor={idAccount} className={paymentRequestDetailFieldLabelClass}>
              Account Code<span className="text-red-500"> *</span>
            </label>
            <ThemedSelect
              id={idAccount}
              value={accountCode ?? ""}
              onChange={(v) => onPatchChange({ accountCode: v })}
              options={mergedAccountOptions}
              placeholder="Select an account code"
              disabled={disabled}
              error={!!accountCodeError}
              triggerClassName="!rounded-2xl"
              plainChevron
              searchable
            />
            {accountCodeError ? (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {accountCodeError}
              </p>
            ) : null}
          </div>
        </div>

        <EasyViewDraftBillActionsRow actions={actions} />
      </section>
    </div>
  );
}
