"use client";

/**
 * Add payment request - a page of its own (Part 15.16 / 15.3; it was a modal until the Part 15
 * migration: "substantial work never goes in a modal").
 *
 * Screen order, the order the paper invoice is read in: [Add invoice photo or PDF] → Supplier →
 * Invoice amount → Invoice date · Due date → Description → Account code → More details
 * (Payment No.) → [Save as draft] [Submit for payment]. At most 720 wide.
 *
 * Validation (CLAUDE.md "Validation while typing", owner 2026-10-13; Part 11 wording):
 * - range/format messages (too many digits, a file too big or of the wrong type) appear AS YOU
 *   TYPE / pick, and clear the moment the value is fine;
 * - an EMPTY required field turns red only after a refused submit, with the reason under it;
 * - more than one problem → an error summary at the top that takes focus and links to each
 *   field; exactly one → focus moves to that field;
 * - Save as draft is never disabled (a draft is always allowed); only Submit checks everything;
 * - the server checks again - this is a convenience, never the gate.
 */

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { BillContactPicker } from "@/components/BillContactPicker";
import { DateTextField } from "@/components/DateTextField";
import {
  AttachmentFullScreenViewer,
  fileToPreviewItem,
  PreviewBlock,
  ViewFullButton,
} from "@/components/payment-request/AttachmentFullScreenViewer";
import { integrationTabUrl } from "@/components/settings/SettingsPills";
import { ThemedSelect, type ThemedSelectOption } from "@/components/ThemedSelect";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { ErrorSummary, type SummaryItem } from "@/components/ui/ErrorSummary";
import { Field, inputClass } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { InlineAlert } from "@/components/ui/InlineAlert";
import {
  MAX_AMOUNT_INT_DIGITS,
  acceptAmountInput,
  amountIntegerDigits,
  cleanAmountString,
  formatAmount,
  toAmountEditString,
  toAmountString,
} from "@minty/shared/money";
import {
  ApiError,
  dedupeEntityBillContactsForPicker,
  fetchEntityBillAccounts,
  fetchEntityBillContacts,
  fetchSuggestedBillReference,
  isDuplicateBillReferenceError,
  saveBillDraft,
  submitBill,
  type EntityBillContact,
} from "@/lib/api";
import { joinFileNames, uploadEachAttachment } from "@/lib/attachmentUploads";
import { getEntityIdSnapshot } from "@/lib/auth";
import { useEntityCurrencyState } from "@/lib/entityCurrency";
import {
  ATTACHMENT_ACCEPT,
  formatFileSize,
  isAllowedAttachment,
} from "@/lib/fileAttachmentPreview";
import { MINTY_MODULE_URL } from "@/lib/mintyUrls";
import { saveAttachmentBlobs } from "@/lib/paymentRequestAttachmentStore";
import { useClientValue } from "@minty/shared/clientValue";
import { useCompanyPages } from "@/lib/useCompanyPages";

type UploadedEntry = { id: string; file: File };

type ValidatedField =
  "billNo" | "amount" | "contact" | "accountCode" | "invoiceDate" | "dueDate" | "attachments";

/** The order fields are checked and listed in the error summary - the screen's order. */
const FIELD_ORDER: ValidatedField[] = [
  "attachments",
  "contact",
  "amount",
  "invoiceDate",
  "dueDate",
  "accountCode",
  "billNo",
];

const FIELD_ID: Record<ValidatedField, string> = {
  attachments: "pr-attachments",
  contact: "pr-contact",
  amount: "pr-amount",
  invoiceDate: "pr-invoice-date",
  dueDate: "pr-due-date",
  accountCode: "pr-account",
  billNo: "pr-bill-no",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Material Symbols icon for an uploaded file row, coloured by the text role only. */
function fileIcon(filename: string): string {
  const ext = filename.trim().split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "picture_as_pdf";
  if (["jpg", "jpeg", "png", "heic", "heif", "webp", "gif"].includes(ext)) return "image";
  return "draft";
}

/** As-you-type range check for the amount (12 digits before the point). */
function amountLimitError(raw: string): string | null {
  if (amountIntegerDigits(cleanAmountString(raw)) > MAX_AMOUNT_INT_DIGITS) {
    return `Use up to ${MAX_AMOUNT_INT_DIGITS} digits before the decimal point.`;
  }
  return null;
}

function isBlankAmount(raw: string): boolean {
  return cleanAmountString(raw) === "";
}

function isPositiveAmount(raw: string): boolean {
  const cleaned = cleanAmountString(raw);
  if (!cleaned || cleaned === ".") return false;
  return /[1-9]/.test(cleaned);
}

/** What Submit needs (Part 11 §11.18: the issue, then the action). */
function validatePaymentRequestForm(values: {
  amount: string;
  contact: string;
  accountCode: string;
  invoiceDate: string;
  dueDate: string;
  attachmentCount: number;
}): Partial<Record<ValidatedField, string>> {
  const e: Partial<Record<ValidatedField, string>> = {};
  if (values.attachmentCount < 1)
    e.attachments = "The invoice is still missing. Add a photo or PDF of it to continue.";
  if (!values.contact.trim()) e.contact = "The supplier is still empty. Choose one to continue.";
  if (isBlankAmount(values.amount))
    e.amount = "The amount is still empty. Add the invoice amount to continue.";
  else if (amountLimitError(values.amount)) e.amount = amountLimitError(values.amount) ?? undefined;
  else if (!isPositiveAmount(values.amount)) e.amount = "Enter an amount above zero.";
  if (!values.invoiceDate.trim())
    e.invoiceDate = "The invoice date is still empty. Add it to continue.";
  if (!values.dueDate.trim()) e.dueDate = "The due date is still empty. Add it to continue.";
  if (!values.accountCode.trim())
    e.accountCode = "The account code is still empty. Choose one to continue.";
  return e;
}

function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PaymentRequestForm() {
  const router = useRouter();
  const pages = useCompanyPages();
  const { showToast } = useToast();
  // The bill's currency is the company's; with none set (or unreadable) the form can't be sent.
  const currency = useEntityCurrencyState();
  const entityCurrency = currency.code;
  const currencyBlocked = currency.status !== "ready";
  const entityId = useClientValue(getEntityIdSnapshot, () => "");
  const previewSubtitleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadedFiles, setUploadedFiles] = useState<UploadedEntry[]>([]);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const previewFile = previewFileId
    ? (uploadedFiles.find((x) => x.id === previewFileId)?.file ?? null)
    : null;
  const [billNo, setBillNo] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  /** Xero ContactID (empty while the person is typing a new name). */
  const [contact, setContact] = useState("");
  const [contactInput, setContactInput] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayLocalISODate);
  const [dueDate, setDueDate] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ValidatedField, string>>>({});
  const [submitAttempt, setSubmitAttempt] = useState(0);
  /** A non-field server message (e.g. another 422). */
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [draftSubmitting, setDraftSubmitting] = useState(false);
  const [accountOptions, setAccountOptions] = useState<ThemedSelectOption[]>([]);
  const [contactsList, setContactsList] = useState<EntityBillContact[]>([]);
  const [contactsMap, setContactsMap] = useState<Map<string, EntityBillContact>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetchEntityBillAccounts({ billDropdown: true })
      .then((accounts) => {
        if (cancelled) return;
        setAccountOptions(
          accounts
            .filter((a) => a.is_active)
            .map((a) => ({
              value: `${a.account_code} - ${a.account_name}`,
              label: `${a.account_code} - ${a.account_name}`,
            })),
        );
        const defaultAcct = accounts.find((a) => a.is_default && a.is_active);
        if (defaultAcct) {
          const defaultVal = `${defaultAcct.account_code} - ${defaultAcct.account_name}`;
          setAccountCode((prev) => prev || defaultVal);
        }
      })
      .catch((err: unknown) =>
        console.error("[add payment request] the account codes did not load", err),
      );
    fetchEntityBillContacts()
      .then((contacts) => {
        if (cancelled) return;
        const deduped = dedupeEntityBillContactsForPicker(contacts);
        setContactsMap(new Map(deduped.map((c) => [c.xero_contact_id, c])));
        setContactsList(deduped);
      })
      .catch((err: unknown) =>
        console.error("[add payment request] the suppliers did not load", err),
      );
    fetchSuggestedBillReference()
      .then((r) => {
        if (!cancelled) setBillNo(r.reference);
      })
      .catch(() => {
        if (!cancelled) setBillNo("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!previewFile) {
      setPreviewObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(previewFile);
    setPreviewObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewFile]);

  useEffect(() => {
    if (previewFileId && !uploadedFiles.some((x) => x.id === previewFileId)) setPreviewFileId(null);
  }, [uploadedFiles, previewFileId]);

  const clearFieldError = (key: ValidatedField) => {
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    // A file's size and type are range/format checks: said at once, as the files are picked.
    const oversized = Array.from(list).filter((file) => file.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setFieldErrors((prev) => ({
        ...prev,
        attachments: `${oversized.map((f) => f.name).join(", ")} ${oversized.length > 1 ? "are" : "is"} over 10 MB. Files up to 10 MB can be added.`,
      }));
      e.target.value = "";
      return;
    }
    const disallowed = Array.from(list).filter((file) => !isAllowedAttachment(file));
    if (disallowed.length > 0) {
      setFieldErrors((prev) => ({
        ...prev,
        attachments: `${disallowed.map((f) => f.name).join(", ")} can't be added. Use a PDF, JPEG, PNG or HTML file.`,
      }));
      e.target.value = "";
      return;
    }
    // Images are converted/compressed to JPEG at upload time (compressImage); stage the raw file here.
    const added: UploadedEntry[] = Array.from(list).map((file) => ({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
    }));
    setUploadedFiles((prev) => [...prev, ...added]);
    setPreviewFileId(added[added.length - 1]?.id ?? null);
    clearFieldError("attachments");
    e.target.value = "";
  };

  const removeFile = (entryId: string) =>
    setUploadedFiles((prev) => prev.filter((x) => x.id !== entryId));

  const refetchEntityBillContacts = async (ensureMerged?: EntityBillContact) => {
    const list = await fetchEntityBillContacts();
    const mergedId = (ensureMerged?.xero_contact_id || "").trim().toUpperCase();
    let merged =
      ensureMerged &&
      mergedId &&
      !list.some((c) => (c.xero_contact_id || "").trim().toUpperCase() === mergedId)
        ? [...list, ensureMerged]
        : list;
    merged = dedupeEntityBillContactsForPicker(
      [...merged].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    );
    setContactsMap(new Map(merged.map((c) => [c.xero_contact_id, c])));
    setContactsList(merged);
  };

  /** Uploads the staged files to the new request; returns the names of any that did not upload. */
  const storeAttachments = async (billId: string): Promise<string[]> => {
    const failed = await uploadEachAttachment(
      billId,
      uploadedFiles.map((x) => x.file),
    );
    try {
      await saveAttachmentBlobs(
        billId,
        uploadedFiles.map((x) => x.file),
      );
    } catch (err) {
      console.error("[add payment request] the attachments were not kept for preview", err);
    }
    return failed;
  };

  const failWith = (err: unknown, fallback: string) => {
    if (isDuplicateBillReferenceError(err)) {
      setMoreOpen(true);
      setFieldErrors({ billNo: err.message });
      requestAnimationFrame(() => document.getElementById(FIELD_ID.billNo)?.focus());
    } else {
      setFormError(err instanceof ApiError ? err.message : fallback);
    }
  };

  // Save as draft: never disabled, never validated beyond what the server refuses (Part 15.3).
  const handleSaveDraft = async () => {
    if (draftSubmitting || currencyBlocked) return;
    setFieldErrors({});
    setFormError(null);
    setDraftSubmitting(true);
    try {
      const amountStr = toAmountString(amount);
      const acctCode = accountCode.split(" - ")[0]?.trim() ?? "";
      const selectedContact = contactsMap.get(contact);
      const contactName = selectedContact?.name ?? (contact || contactInput);
      const bill = await saveBillDraft({
        contact: contactName || undefined,
        xero_contact_id: selectedContact?.xero_contact_id || undefined,
        description: description || undefined,
        amount: amountStr,
        currency_code: entityCurrency,
        invoice_date: invoiceDate || undefined,
        due_date: dueDate || undefined,
        reference: billNo || undefined,
        xero_account_code: acctCode || undefined,
        line_items:
          acctCode || description || isPositiveAmount(amount)
            ? [
                {
                  description: description || undefined,
                  quantity: 1,
                  unit_amount: amountStr,
                  line_amount: amountStr,
                  account_code: acctCode || undefined,
                },
              ]
            : undefined,
      });
      const failed = await storeAttachments(bill.id);
      if (failed.length > 0) {
        // The draft exists but a file does not: open it, where the file can be added again.
        showToast(
          `Draft saved, but ${joinFileNames(failed)} didn't upload. Edit the draft and add it again.`,
          "warning",
        );
        router.push(pages.request(bill.id, bill.reference, bill.status));
        return;
      }
      showToast("Draft saved. Continue it from the list whenever you're ready.", "success");
      router.push(pages.list);
    } catch (err) {
      console.error("[add payment request] the draft did not save", err);
      failWith(err, "That draft didn't save. Try saving it again.");
    } finally {
      setDraftSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (currencyBlocked || confirmSubmitting) return;
    const next = validatePaymentRequestForm({
      amount,
      contact: contact || contactInput,
      accountCode,
      invoiceDate,
      dueDate,
      attachmentCount: uploadedFiles.length,
    });
    const keys = FIELD_ORDER.filter((k) => next[k]);
    if (keys.length > 0) {
      setFieldErrors(next);
      setSubmitAttempt((n) => n + 1);
      // One problem: put the person on it. Two or more: the summary takes focus (ErrorSummary).
      if (keys.length === 1)
        requestAnimationFrame(() => document.getElementById(FIELD_ID[keys[0]])?.focus());
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setConfirmSubmitting(true);
    try {
      const amountStr = toAmountString(amount) ?? "0";
      const acctCode = accountCode.split(" - ")[0]?.trim() ?? "";
      const selectedContact = contactsMap.get(contact);
      const contactName = selectedContact?.name ?? (contact || contactInput);
      const bill = await submitBill({
        contact: contactName,
        xero_contact_id: selectedContact?.xero_contact_id || undefined,
        description,
        amount: amountStr,
        currency_code: entityCurrency,
        invoice_date: invoiceDate || null,
        due_date: dueDate || null,
        reference: billNo,
        xero_account_code: acctCode || undefined,
        line_items: [
          {
            description,
            quantity: 1,
            unit_amount: amountStr,
            line_amount: amountStr,
            account_code: acctCode,
          },
        ],
      });
      const failed = await storeAttachments(bill.id);
      if (failed.length > 0) {
        showToast(
          `Payment request for ${contactName} sent to Treasury, but ${joinFileNames(failed)} didn't upload. Edit the request and add it again.`,
          "warning",
        );
      } else {
        showToast(`Payment request for ${contactName} sent to Treasury.`, "success");
      }
      router.push(pages.request(bill.id, bill.reference, bill.status));
    } catch (err) {
      console.error("[add payment request] the request did not submit", err);
      failWith(err, "That payment request didn't go through. Try submitting it again.");
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const summaryItems: SummaryItem[] = FIELD_ORDER.filter((k) => fieldErrors[k]).map((k) => ({
    fieldId: FIELD_ID[k],
    message: fieldErrors[k] as string,
  }));

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8">
      <ErrorSummary items={summaryItems} attempt={submitAttempt} />
      {formError ? <InlineAlert tone="danger">{formError}</InlineAlert> : null}

      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        {/* 1. The invoice - the entry point (Part 15.13). */}
        <section aria-labelledby="pr-invoice-heading" className="flex flex-col gap-3">
          <h2 id="pr-invoice-heading" className="text-label text-text-secondary">
            Invoice
            <span className="text-action-danger" aria-hidden>
              {" *"}
            </span>
            <span className="sr-only"> (required)</span>
            <span className="ml-1 font-normal text-text-muted">({uploadedFiles.length})</span>
          </h2>

          {previewFile && previewObjectUrl ? (
            <div className="flex flex-col gap-2">
              <p id={previewSubtitleId} className="text-body-s text-text-secondary">
                {previewFile.name} · {formatFileSize(previewFile.size)}
              </p>
              <div className="relative min-h-[min(50dvh,360px)] overflow-auto rounded-lg bg-surface-document p-2 sm:p-3">
                <ViewFullButton name={previewFile.name} onClick={() => setViewerOpen(true)} />
                <PreviewBlock {...fileToPreviewItem(previewFile, previewObjectUrl)} />
              </div>
            </div>
          ) : null}

          {uploadedFiles.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-label="Files added">
              {uploadedFiles.map(({ id, file }) => {
                const selected = previewFileId === id;
                return (
                  <li
                    key={id}
                    className={`flex min-h-12 items-center gap-2 rounded-lg border bg-surface-card px-3 ${selected ? "border-border-selected" : "border-border-default"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewFileId(id)}
                      className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                      aria-pressed={selected}
                      aria-label={`Preview ${file.name}`}
                    >
                      <Icon name={fileIcon(file.name)} size="md" className="text-text-secondary" />
                      <span className="min-w-0 truncate text-body-m text-text-primary">
                        {file.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFile(id)}
                      className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                      aria-label={`Remove ${file.name}`}
                    >
                      <Icon name="close" size="md" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {/* The upload control is a real button-like target over the whole drop zone. */}
          <div className="relative">
            <input
              ref={fileInputRef}
              id={FIELD_ID.attachments}
              type="file"
              className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
              multiple
              accept={ATTACHMENT_ACCEPT}
              onChange={handleFilesSelected}
              aria-label="Choose files to attach"
              aria-required="true"
              aria-invalid={fieldErrors.attachments ? true : undefined}
              aria-describedby="pr-attachments-note"
            />
            <div
              className={`pointer-events-none flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center ${
                fieldErrors.attachments
                  ? "border-action-danger bg-status-danger-bg"
                  : "border-border-input bg-surface-sunk"
              }`}
            >
              <Icon name="upload_file" size="lg" className="text-text-secondary" />
              <p className="text-body-m font-semibold text-text-primary">
                {uploadedFiles.length > 0 ? "Add another photo or PDF" : "Add invoice photo or PDF"}
              </p>
              <p className="text-caption text-text-muted">
                PDF, JPEG, PNG or HTML · files up to 10 MB
              </p>
            </div>
          </div>
          <p
            id="pr-attachments-note"
            className={`text-caption ${fieldErrors.attachments ? "text-status-danger-ink" : "sr-only"}`}
            {...(fieldErrors.attachments ? { role: "alert" } : {})}
          >
            {fieldErrors.attachments ?? "PDF, JPEG, PNG or HTML, files up to 10 MB."}
          </p>
        </section>

        {/* 2. Supplier */}
        <Field label="Supplier" required id={FIELD_ID.contact} error={fieldErrors.contact}>
          {(a11y) => (
            <BillContactPicker
              id={a11y.id}
              ariaDescribedBy={a11y["aria-describedby"]}
              required
              contacts={contactsList}
              xeroContactId={contact}
              contactName={contactInput}
              onChange={({ xero_contact_id, contact: nm }) => {
                setContact(xero_contact_id);
                setContactInput(nm);
                clearFieldError("contact");
              }}
              refetchContacts={refetchEntityBillContacts}
              error={!!fieldErrors.contact}
            />
          )}
        </Field>

        {/* 3. Amount - the label announces the currency (Part 14 Amount input). */}
        <div className="flex flex-col gap-1.5">
          <Field
            label={`Invoice amount (${currency.status === "ready" ? entityCurrency : "—"})`}
            required
            id={FIELD_ID.amount}
            error={fieldErrors.amount}
          >
            {(a11y) => (
              <input
                {...a11y}
                type="text"
                inputMode="decimal"
                translate="no"
                value={amount ?? ""}
                onChange={(e) => {
                  const value = acceptAmountInput(e.target.value);
                  if (value === null) return;
                  setAmount(value);
                  // As you type: the digit limit shows the moment it is crossed and clears the
                  // moment the amount fits; an empty-field message only clears here.
                  const err = amountLimitError(value);
                  if (err) setFieldErrors((prev) => ({ ...prev, amount: err }));
                  else clearFieldError("amount");
                }}
                onFocus={() => setAmount((prev) => toAmountEditString(prev))}
                onBlur={(e) => setAmount(formatAmount(e.target.value))}
                placeholder="0.00"
                className={`${inputClass(!!fieldErrors.amount)} text-right tabular-nums`}
              />
            )}
          </Field>
          {currency.status === "unset" ? (
            <InlineAlert
              tone="warning"
              title="Your company has no currency yet."
              action={
                <a
                  href={integrationTabUrl(MINTY_MODULE_URL, entityId)}
                  className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2"
                >
                  Choose one in Entity &amp; Integration settings
                </a>
              }
            />
          ) : currency.status === "error" ? (
            <InlineAlert
              tone="danger"
              title="Your company's currency didn't load."
              action={
                <Button kind="link" onClick={currency.retry}>
                  Try again
                </Button>
              }
            />
          ) : null}
        </div>

        {/* 4. Dates */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4">
          <Field
            label="Invoice date"
            required
            id={FIELD_ID.invoiceDate}
            error={fieldErrors.invoiceDate}
          >
            {(a11y) => (
              <DateTextField
                id={a11y.id}
                ariaDescribedBy={a11y["aria-describedby"]}
                required
                value={invoiceDate ?? ""}
                onChange={(iso) => {
                  setInvoiceDate(iso);
                  clearFieldError("invoiceDate");
                }}
                invalid={!!fieldErrors.invoiceDate}
                calendarAriaLabel="Invoice date"
                textInputClassName={inputClass(!!fieldErrors.invoiceDate)}
                calendarButtonClassName="hidden"
              />
            )}
          </Field>
          <Field label="Due date" required id={FIELD_ID.dueDate} error={fieldErrors.dueDate}>
            {(a11y) => (
              <DateTextField
                id={a11y.id}
                ariaDescribedBy={a11y["aria-describedby"]}
                required
                value={dueDate ?? ""}
                onChange={(iso) => {
                  setDueDate(iso);
                  clearFieldError("dueDate");
                }}
                invalid={!!fieldErrors.dueDate}
                calendarAriaLabel="Due date"
                textInputClassName={inputClass(!!fieldErrors.dueDate)}
                calendarButtonClassName="hidden"
              />
            )}
          </Field>
        </div>

        {/* 5. Description (optional - placeholders are examples, not labels). */}
        <Field label="Description" id="pr-description">
          {(a11y) => (
            <input
              {...a11y}
              type="text"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Monthly delivery retainer"
              className={inputClass()}
            />
          )}
        </Field>

        {/* 6. Account code - required, so never hidden behind More details. */}
        <Field
          label="Account code"
          required
          id={FIELD_ID.accountCode}
          error={fieldErrors.accountCode}
        >
          {(a11y) => (
            <ThemedSelect
              id={a11y.id}
              ariaDescribedBy={a11y["aria-describedby"]}
              required
              value={accountCode ?? ""}
              onChange={(v) => {
                setAccountCode(v);
                clearFieldError("accountCode");
              }}
              options={accountOptions}
              placeholder="Select an account code"
              error={!!fieldErrors.accountCode}
              plainChevron
              searchable
            />
          )}
        </Field>

        {/* 7. More details - the optional fields (Part 15.3). */}
        <div className="flex flex-col gap-4">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="pr-more-details"
            onClick={() => setMoreOpen((o) => !o)}
            className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-1 rounded-lg px-1 text-body-m font-semibold text-text-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            <Icon name={moreOpen ? "expand_less" : "expand_more"} size="md" />
            More details
          </button>
          <div id="pr-more-details" hidden={!moreOpen}>
            <Field
              label="Payment No."
              id={FIELD_ID.billNo}
              helper="Filled in for you - change it to match your own numbering."
              error={fieldErrors.billNo}
            >
              {(a11y) => (
                <input
                  {...a11y}
                  type="text"
                  translate="no"
                  value={billNo ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    clearFieldError("billNo");
                    setFormError(null);
                    if (v.trim() === "") {
                      setBillNo("");
                      void fetchSuggestedBillReference()
                        .then((r) => setBillNo(r.reference))
                        .catch(() => {});
                      return;
                    }
                    setBillNo(v);
                  }}
                  placeholder="e.g. MBIOVI-115803031626"
                  className={inputClass(!!fieldErrors.billNo)}
                />
              )}
            </Field>
          </div>
        </div>

        {/* Actions: [Save as draft] [Submit for payment] - Primary right on a computer, first and
            full width on a phone (Part 15.2). */}
        <div className="flex flex-col-reverse gap-2 border-t border-border-subtle pt-5 sm:flex-row sm:justify-end sm:gap-3">
          <Button
            kind="secondary"
            onClick={() => void handleSaveDraft()}
            processing={draftSubmitting}
            processingLabel="Saving…"
            disabled={currencyBlocked}
            title={currencyBlocked ? "The company's currency is needed first" : undefined}
          >
            Save as draft
          </Button>
          <Button
            kind="primary"
            type="submit"
            processing={confirmSubmitting}
            processingLabel="Submitting…"
            disabled={currencyBlocked}
            title={currencyBlocked ? "The company's currency is needed first" : undefined}
          >
            Submit for payment
          </Button>
        </div>
      </form>

      {/* Guarded on the live object URL: removing the file being viewed revokes it, and this
          unmounts the viewer in the same commit rather than drawing a dead blob. */}
      {viewerOpen && previewFile && previewObjectUrl ? (
        <AttachmentFullScreenViewer
          item={fileToPreviewItem(previewFile, previewObjectUrl)}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </div>
  );
}
