"use client";

import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorSummary, type SummaryItem } from "@/components/ui/ErrorSummary";
import { Icon } from "@/components/ui/Icon";
import { InlineAlert, PageBanner } from "@/components/ui/InlineAlert";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { useUserRole } from "@/lib/useUserRole";
import {
  ApiError,
  deleteBill,
  deleteBillAttachment,
  fetchBill,
  fetchEntityBillAccounts,
  dedupeEntityBillContactsForPicker,
  fetchEntityBillContacts,
  fetchPayments,
  isDuplicateBillReferenceError,
  isXeroAuthError,
  publishBill,
  returnBill as returnBillApi,
  updateBill,
  XERO_RECONNECT_MESSAGE,
  type BillAttachment,
  type BillDetail,
  type EntityBillContact,
  type PaymentItem,
} from "@/lib/api";
import type { ThemedSelectOption } from "@/components/ThemedSelect";
import { joinFileNames, uploadEachAttachment } from "@/lib/attachmentUploads";
import { useEntityCurrency } from "@/lib/entityCurrency";
import {
  MAX_AMOUNT_INT_DIGITS,
  formatAmount,
  formatMoney,
  isWithinAmountLimits,
  parseAmount,
} from "@minty/shared/money";
import { billStatusToDisplayLabel } from "@/lib/billStatusDisplay";
import {
  billHasRemainingCountablePayments,
  billStatusShouldRollbackWhenNoPayments,
} from "@/lib/billStatusRollback";
import { enrichAccountCodeWithOptions } from "@/lib/billFormSelectOptions";
import { billToDetailedInfo, buildBillUpdatePayload } from "@/lib/paymentRequestBillMap";
import { formatDay } from "@minty/shared/dates";
import { shouldShowPaymentInHistory } from "@/lib/paymentHistoryDisplay";
import {
  loadAttachmentBlobs,
  replaceAttachmentBlobsFromPreviewItems,
  uniquifyFileName,
} from "@/lib/paymentRequestAttachmentStore";
import { ActivityHistoryAccordion } from "./ActivityHistoryAccordion";
import { BillActionBar } from "./BillActionBar";
import { BillDraftSubmitButton } from "./BillDraftSubmitButton";
import {
  InvoiceAttachmentPreview,
  type InvoiceAttachmentPreviewItem,
} from "./InvoiceAttachmentPreview";
import { InvoiceAttachmentToolbar } from "./InvoiceAttachmentToolbar";
import { OverpaymentWarningModal } from "./OverpaymentWarningModal";
import { PaymentHistoryListPanel, type PaymentHistoryRow } from "./PaymentHistoryCard";
import { ConfirmDialog } from "./ConfirmDialog";
import { RecordPaymentDrawer } from "./RecordPaymentDrawer";
import { RowDeleteConfirmModal } from "./RowDeleteConfirmModal";
import { AttachmentDeleteConfirmModal } from "./AttachmentDeleteConfirmModal";
import { UploadInvoiceAttachmentModal } from "./UploadInvoiceAttachmentModal";
import {
  PaymentRequestDetailedInfo,
  type PaymentRequestDetailedInfoData,
} from "./PaymentRequestDetailedInfo";
import { useToast } from "@/components/Toast";
import { useCompanyPages } from "@/lib/useCompanyPages";
import { forgetRequest, rememberRequest, useRequestId } from "@/lib/useRequestId";
export type PaymentRequestDetailBodyProps = {
  /** Called after the bill is refreshed from the server so the header status badge can update. */
  onBillUpdated?: () => void;
};

type DetailSubmitFieldErrors = Partial<
  Record<"invoiceDate" | "dueDate" | "amount" | "contact" | "accountCode", string>
>;

/**
 * What a submit needs. Part 11 §11.18 wording: the issue, then the action - never "Invalid" or
 * "Mandatory". These are the EMPTY-field messages, so (CLAUDE.md "Validation while typing") they
 * appear only after a refused submit; nothing paints an untouched field red.
 */
function validateDetailRequiredForSubmit(
  d: PaymentRequestDetailedInfoData,
): DetailSubmitFieldErrors | null {
  const errors: DetailSubmitFieldErrors = {};
  if (!d.contact.trim()) errors.contact = "The supplier is still empty. Choose one to continue.";
  const amt = parseAmount(d.amount);
  if (amt === null || amt <= 0) {
    errors.amount = "The amount is still empty. Add the invoice amount to continue.";
  } else if (!isWithinAmountLimits(d.amount ?? "")) {
    errors.amount = `Use up to ${MAX_AMOUNT_INT_DIGITS} digits before the decimal point.`;
  }
  if (!d.invoiceDate.trim())
    errors.invoiceDate = "The invoice date is still empty. Add it to continue.";
  if (!d.dueDate.trim()) errors.dueDate = "The due date is still empty. Add it to continue.";
  if (!d.accountCode.trim())
    errors.accountCode = "The account code is still empty. Choose one to continue.";
  return Object.keys(errors).length ? errors : null;
}

/** The detail fields' ids, so the error summary can link to each one (Part 15.3). */
const DETAIL_FIELD_IDS = {
  contact: "detail-contact",
  amount: "detail-amount",
  invoiceDate: "detail-invoice-date",
  dueDate: "detail-due-date",
  accountCode: "detail-account-code",
  billNo: "detail-bill-no",
} as const;

/** Part 14 skeleton for the description rows while the request loads. */
function PaymentRequestDetailCardSkeleton() {
  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-card p-4"
      role="status"
      aria-busy="true"
      aria-label="Loading the payment request"
    >
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="grid grid-cols-[160px_1fr] gap-4" aria-hidden>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-48 max-w-full" />
        </div>
      ))}
    </section>
  );
}

function serverBillAttachmentsFingerprint(rows: BillAttachment[]): string {
  return [...rows]
    .filter((ba) => ba.attachment?.download_url)
    .map((ba) => `${ba.id}:${ba.attachment.download_url}`)
    .sort()
    .join("\0");
}

export function PaymentRequestDetailBody({ onBillUpdated }: PaymentRequestDetailBodyProps) {
  const entityCurrency = useEntityCurrency();
  const params = useParams<{ ref?: string }>();
  const router = useRouter();
  const { requestId, pending: lookupPending, error: lookupError } = useRequestId();
  const pages = useCompanyPages();
  const { isElevated, isViewOnly } = useUserRole();

  const [bill, setBill] = useState<BillDetail | null>(null);
  const [loadingBill, setLoadingBill] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<PaymentRequestDetailedInfoData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmittingDraft, setIsSubmittingDraft] = useState(false);
  const { showToast } = useToast();
  const [billNoError, setBillNoError] = useState<string | null>(null);
  const [accountCodeError, setAccountCodeError] = useState<string | null>(null);
  const [submitAttemptFieldErrors, setSubmitAttemptFieldErrors] =
    useState<DetailSubmitFieldErrors | null>(null);

  const [isPublishing, setIsPublishing] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [recordPaymentReadOnly, setRecordPaymentReadOnly] = useState(false);
  const [deleteBillConfirmOpen, setDeleteBillConfirmOpen] = useState(false);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [overpaymentWarningOpen, setOverpaymentWarningOpen] = useState(false);
  const [auditRefresh, setAuditRefresh] = useState(0);
  const bumpAudit = useCallback(() => setAuditRefresh((n) => n + 1), []);
  /** A failed action (submit, publish, return, void), shown on the page - never a toast (Part 14). */
  const [actionError, setActionError] = useState<string | null>(null);
  /** A save/submit that went through while a staged file did not upload: names it, on the page. */
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);
  /** Bumped on every refused save/submit so the error summary takes focus again (Part 15.3). */
  const [submitAttempt, setSubmitAttempt] = useState(0);

  const [accountOptions, setAccountOptions] = useState<ThemedSelectOption[]>([]);
  const [entityBillContacts, setEntityBillContacts] = useState<EntityBillContact[]>([]);

  const applyEntityBillContacts = useCallback((contacts: EntityBillContact[]) => {
    setEntityBillContacts(dedupeEntityBillContactsForPicker(contacts));
  }, []);

  const refetchEntityBillContacts = useCallback(
    async (ensureMerged?: EntityBillContact) => {
      const list = await fetchEntityBillContacts();
      const mergedId = (ensureMerged?.xero_contact_id || "").trim().toUpperCase();
      let merged =
        ensureMerged &&
        mergedId &&
        !list.some((c) => (c.xero_contact_id || "").trim().toUpperCase() === mergedId)
          ? [...list, ensureMerged]
          : list;
      merged = [...merged].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
      applyEntityBillContacts(merged);
    },
    [applyEntityBillContacts],
  );

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
      })
      .catch(() => {});
    fetchEntityBillContacts()
      .then((contacts: EntityBillContact[]) => {
        if (cancelled) return;
        applyEntityBillContacts(contacts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [applyEntityBillContacts]);

  const rollbackToPaymentRequestedIfNoPayments = useCallback(
    async (nextPayments: PaymentItem[]): Promise<boolean> => {
      if (!requestId) return false;
      if (billHasRemainingCountablePayments(requestId, nextPayments)) return false;

      const b = await fetchBill(requestId);
      if (!billStatusShouldRollbackWhenNoPayments(b.status ?? "")) return false;

      await updateBill(requestId, { status: "submitted" });
      return true;
    },
    [requestId],
  );

  const reloadBill = useCallback(async () => {
    if (!requestId) return;
    try {
      const b = await fetchBill(requestId);
      setBill(b);
      onBillUpdated?.();
    } catch {
      /* ignore */
    }
  }, [requestId, onBillUpdated]);

  const loadPayments = useCallback(async () => {
    if (!requestId) return;
    try {
      const data = await fetchPayments(requestId);
      setPayments(data.payments);
      const rolled = await rollbackToPaymentRequestedIfNoPayments(data.payments);
      if (rolled) await reloadBill();
    } catch {
      setPayments([]);
    }
  }, [requestId, rollbackToPaymentRequestedIfNoPayments, reloadBill]);

  useEffect(() => {
    if (requestId) loadPayments();
  }, [requestId, loadPayments]);

  const [attachments, setAttachments] = useState<InvoiceAttachmentPreviewItem[]>([]);
  const [attachmentsReady, setAttachmentsReady] = useState(false);
  const attachmentUrlsRef = useRef<string[]>([]);
  const attachmentHydrationEpochRef = useRef(0);
  const pendingBillAttachmentDeletesRef = useRef<Set<string>>(new Set());
  const attachmentsRef = useRef<InvoiceAttachmentPreviewItem[]>([]);
  const [selectedAttachmentIndices, setSelectedAttachmentIndices] = useState<number[]>([]);
  const [uploadAttachmentOpen, setUploadAttachmentOpen] = useState(false);
  const [deleteAttachmentConfirmOpen, setDeleteAttachmentConfirmOpen] = useState(false);
  const [minimumAttachmentModalOpen, setMinimumAttachmentModalOpen] = useState(false);
  const [deleteAttachmentPending, setDeleteAttachmentPending] = useState(false);
  const lastSyncedServerAttachmentsKeyRef = useRef<string | null>(null);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    if (!requestId) {
      // a Payment No. still being looked up, or one this company does not have
      setBill(null);
      setLoadingBill(lookupPending);
      setLoadError(lookupError);
      attachmentUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      attachmentUrlsRef.current = [];
      setAttachments([]);
      setAttachmentsReady(true);
      return;
    }
    let cancelled = false;
    attachmentUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    attachmentUrlsRef.current = [];
    setAttachments([]);
    setAttachmentsReady(false);
    lastSyncedServerAttachmentsKeyRef.current = null;
    setLoadingBill(true);
    setLoadError(null);
    fetchBill(requestId)
      .then((b) => {
        if (!cancelled) setBill(b);
      })
      .catch((e) => {
        if (!cancelled) {
          setBill(null);
          setLoadError(
            e instanceof ApiError
              ? e.message
              : "This payment didn't come through. Mind trying again?",
          );
          attachmentUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
          attachmentUrlsRef.current = [];
          setAttachments([]);
          setAttachmentsReady(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBill(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId, lookupPending, lookupError]);

  useEffect(() => {
    setDeleteBillConfirmOpen(false);
  }, [requestId]);

  // The address names the request by its Payment No. (2026-10-05): an id address (Flask's
  // hand-off, an old link) becomes the Payment No. one once the request has loaded, and an edit
  // that changes the Payment No. moves the address with it - replace, so Back is unchanged.
  // A void request keeps (or moves to) its id address: its Payment No. may be a live request's
  // too, and the by-reference lookup prefers the live one - so that pairing is forgotten.
  useEffect(() => {
    if (!bill || bill.id !== requestId) return;
    const company = (params?.ref ?? "").toLowerCase();
    const wanted = pages.request(bill.id, bill.reference, bill.status);
    const byReference = wanted !== pages.request(bill.id);
    if (!byReference && bill.reference) forgetRequest(company, bill.reference);
    if (window.location.pathname === wanted) return;
    if (byReference) rememberRequest(company, bill.reference ?? "", bill.id);
    router.replace(`${wanted}${window.location.search}${window.location.hash}`, { scroll: false });
  }, [bill, requestId, pages, params?.ref, router]);

  useEffect(() => {
    if (typeof window === "undefined" || loadingBill || loadError) return;
    const scrollToPaymentHistory = () => {
      if (window.location.hash !== "#payment-history") return;
      window.requestAnimationFrame(() => {
        document.getElementById("payment-history")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    };
    scrollToPaymentHistory();
    const t = window.setTimeout(scrollToPaymentHistory, 200);
    window.addEventListener("hashchange", scrollToPaymentHistory);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", scrollToPaymentHistory);
    };
  }, [loadingBill, loadError, requestId]);

  useEffect(() => {
    if (!isEditing) {
      setSelectedAttachmentIndices([]);
      setDeleteAttachmentConfirmOpen(false);
    } else {
      lastSyncedServerAttachmentsKeyRef.current = null;
    }
  }, [isEditing]);

  const loadAttachmentsFromIndexedDb = useCallback(
    async (opts?: { abandoned?: () => boolean }) => {
      const abandoned = opts?.abandoned;
      const epochAtStart = attachmentHydrationEpochRef.current;
      if (!requestId) {
        attachmentUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
        attachmentUrlsRef.current = [];
        if (!abandoned?.()) setAttachments([]);
        if (!abandoned?.()) setAttachmentsReady(true);
        return;
      }
      try {
        const blobs = await loadAttachmentBlobs(requestId);
        if (abandoned?.() || epochAtStart !== attachmentHydrationEpochRef.current) return;
        attachmentUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
        attachmentUrlsRef.current = [];

        /** Local blob cache fallback (e.g. after save when server list is still empty). */
        const next: InvoiceAttachmentPreviewItem[] = blobs.map((b) => {
          const url = URL.createObjectURL(b.blob);
          attachmentUrlsRef.current.push(url);
          return { url, name: b.name, mime: b.type };
        });
        if (epochAtStart !== attachmentHydrationEpochRef.current) return;
        setAttachments(next);
      } catch {
        if (abandoned?.() || epochAtStart !== attachmentHydrationEpochRef.current) return;
        attachmentUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
        attachmentUrlsRef.current = [];
        setAttachments([]);
      } finally {
        if (!abandoned?.() && epochAtStart === attachmentHydrationEpochRef.current) {
          setAttachmentsReady(true);
        }
      }
    },
    [requestId],
  );

  const mapServerAttachmentsToPreviewItems = useCallback(
    (serverAttachments: BillAttachment[]): InvoiceAttachmentPreviewItem[] =>
      serverAttachments
        .filter((ba) => ba.attachment?.download_url)
        .map((ba) => ({
          url: ba.attachment.download_url,
          name: ba.attachment.original_name,
          mime: ba.attachment.mime_type || "application/octet-stream",
          previewApiPath:
            (ba.attachment.mime_type || "").toLowerCase() === "application/pdf"
              ? `/api/v1/bills/${requestId}/attachments/${ba.id}/preview/`
              : undefined,
          billAttachmentId: ba.id,
        })),
    [requestId],
  );

  const commitPendingAttachmentDeletes = useCallback(async (rid: string) => {
    const pending = [...pendingBillAttachmentDeletesRef.current];
    if (pending.length === 0) return;
    await Promise.all(pending.map((id) => deleteBillAttachment(rid, id)));
    pendingBillAttachmentDeletesRef.current.clear();
  }, []);

  useEffect(() => {
    pendingBillAttachmentDeletesRef.current.clear();
    attachmentsRef.current.forEach((a) => {
      if (a.pendingUploadKey && a.url.startsWith("blob:")) URL.revokeObjectURL(a.url);
    });
    attachmentHydrationEpochRef.current += 1;
    lastSyncedServerAttachmentsKeyRef.current = null;
  }, [requestId]);

  useEffect(() => {
    if (!bill) return;
    const serverAttachments = bill.attachments ?? [];

    if (!isEditing) {
      const fp = serverBillAttachmentsFingerprint(serverAttachments);
      if (
        lastSyncedServerAttachmentsKeyRef.current !== null &&
        fp === lastSyncedServerAttachmentsKeyRef.current
      ) {
        setAttachmentsReady(true);
        return;
      }
      lastSyncedServerAttachmentsKeyRef.current = fp;
      attachmentHydrationEpochRef.current += 1;
      attachmentUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      attachmentUrlsRef.current = [];
      if (serverAttachments.length > 0) {
        setAttachments(mapServerAttachmentsToPreviewItems(serverAttachments));
      } else {
        setAttachments([]);
      }
      setAttachmentsReady(true);
      return;
    }

    if (serverAttachments.length === 0) return;
    setAttachments((prev) => {
      if (prev.length > 0) return prev;
      return mapServerAttachmentsToPreviewItems(serverAttachments);
    });
    setAttachmentsReady(true);
  }, [bill, isEditing, mapServerAttachmentsToPreviewItems]);

  const viewData = useMemo(() => {
    if (!bill) return null;
    const base = billToDetailedInfo(bill);
    return {
      ...base,
      accountCode: enrichAccountCodeWithOptions(base.accountCode, accountOptions),
    };
  }, [bill, accountOptions]);

  const formData = isEditing && draft ? draft : viewData;

  const invoiceTotalMajor = useMemo(() => {
    return parseAmount(formData?.amount) ?? 0;
  }, [formData?.amount]);

  const unpaidAmountDisplay = useMemo(() => {
    return formatAmount(bill?.amount_due) || undefined;
  }, [bill?.amount_due]);

  const handleEdit = useCallback(() => {
    if (!bill) return;
    const base = billToDetailedInfo(bill);
    setDraft({
      ...base,
      accountCode: enrichAccountCodeWithOptions(base.accountCode, accountOptions),
    });
    setIsEditing(true);
    setBillNoError(null);
    setAccountCodeError(null);
    setSubmitAttemptFieldErrors(null);
    setUploadWarning(null);
  }, [bill, accountOptions]);

  const handleCancel = useCallback(() => {
    setBillNoError(null);
    setAccountCodeError(null);
    setSubmitAttemptFieldErrors(null);
    pendingBillAttachmentDeletesRef.current.clear();

    const applyAttachmentsFromServerBill = (b: BillDetail) => {
      attachmentHydrationEpochRef.current += 1;
      const serverAttachments = b.attachments ?? [];
      attachmentUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      attachmentUrlsRef.current = [];
      if (serverAttachments.length > 0) {
        setAttachments(mapServerAttachmentsToPreviewItems(serverAttachments));
      } else {
        setAttachments([]);
      }
      setAttachmentsReady(true);
    };

    if (!requestId) {
      attachmentsRef.current.forEach((a) => {
        if (a.pendingUploadKey && a.url.startsWith("blob:")) URL.revokeObjectURL(a.url);
      });
      setDraft(null);
      setIsEditing(false);
      return;
    }
    void (async () => {
      try {
        const fresh = await fetchBill(requestId);
        attachmentsRef.current.forEach((a) => {
          if (a.pendingUploadKey && a.url.startsWith("blob:")) URL.revokeObjectURL(a.url);
        });
        setBill(fresh);
        onBillUpdated?.();
        setDraft(null);
        setIsEditing(false);
      } catch {
        attachmentsRef.current.forEach((a) => {
          if (a.pendingUploadKey && a.url.startsWith("blob:")) URL.revokeObjectURL(a.url);
        });
        setDraft(null);
        setIsEditing(false);
        if (bill) applyAttachmentsFromServerBill(bill);
        else {
          attachmentHydrationEpochRef.current += 1;
          attachmentUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
          attachmentUrlsRef.current = [];
          setAttachments([]);
          setAttachmentsReady(true);
        }
      }
    })();
  }, [requestId, bill, mapServerAttachmentsToPreviewItems, onBillUpdated]);

  const handlePatch = useCallback((patch: Partial<PaymentRequestDetailedInfoData>) => {
    if (Object.prototype.hasOwnProperty.call(patch, "billNo")) {
      setBillNoError(null);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "accountCode")) {
      setAccountCodeError(null);
    }
    setSubmitAttemptFieldErrors((prev) => {
      if (!prev) return null;
      const next = { ...prev };
      if (Object.prototype.hasOwnProperty.call(patch, "invoiceDate")) delete next.invoiceDate;
      if (Object.prototype.hasOwnProperty.call(patch, "dueDate")) delete next.dueDate;
      if (Object.prototype.hasOwnProperty.call(patch, "amount")) delete next.amount;
      if (Object.prototype.hasOwnProperty.call(patch, "currencyCode")) delete next.amount;
      if (
        Object.prototype.hasOwnProperty.call(patch, "contact") ||
        Object.prototype.hasOwnProperty.call(patch, "xero_contact_id")
      ) {
        delete next.contact;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "accountCode")) delete next.accountCode;
      return Object.keys(next).length ? next : null;
    });
    setDraft((d) => (d ? { ...d, ...patch } : null));
  }, []);

  const executeSave = useCallback(
    async (overrideStatus?: string) => {
      if (!requestId || !bill || !draft) return;
      setIsSaving(true);
      try {
        const payload = buildBillUpdatePayload(bill, draft);
        if (overrideStatus) {
          (payload as typeof payload & { status?: string }).status = overrideStatus;
        }
        // When saving a returned bill, fold the status transition into the
        // updateBill call so ALL roles (not just elevated) can save and move
        // the bill back to "submitted" (Payment Requested).
        if (!overrideStatus && bill.status === "returned") {
          (payload as typeof payload & { status?: string }).status = "submitted";
        }
        const updated = await updateBill(requestId, payload);
        setUploadWarning(null);
        await commitPendingAttachmentDeletes(requestId);

        const stagedForApi = attachments.filter(
          (a): a is InvoiceAttachmentPreviewItem & { pendingFile: File } =>
            Boolean(a.pendingUploadKey && a.pendingFile),
        );
        if (stagedForApi.length > 0) {
          // The changes are saved by now: a file that does not upload is said on its own, never
          // as "didn't save" (each file goes up on its own - the batch is not all-or-nothing).
          const failed = await uploadEachAttachment(
            requestId,
            stagedForApi.map((a) => a.pendingFile),
          );
          for (const a of stagedForApi) {
            if (a.url.startsWith("blob:")) URL.revokeObjectURL(a.url);
          }
          if (failed.length > 0) {
            setUploadWarning(
              `Your changes are saved, but ${joinFileNames(failed)} didn't upload. Edit the request and add it again.`,
            );
          }
        }

        const blobsForIndexedDb = attachments.filter(
          (a) => a.url.startsWith("blob:") && !a.pendingUploadKey,
        );

        let nextBill: BillDetail = updated;
        try {
          nextBill = await fetchBill(requestId);
        } catch {
          /* keep `updated` if refetch fails */
        }
        setBill(nextBill);
        onBillUpdated?.();

        if (blobsForIndexedDb.length > 0) {
          try {
            await replaceAttachmentBlobsFromPreviewItems(requestId, blobsForIndexedDb);
          } catch {
            await loadAttachmentsFromIndexedDb();
            // Details saved; only the attachment cache write failed.
            showToast(
              "I saved your payment details, but the attachments didn't update. Mind editing them again?",
              "warning",
            );
          }
        }

        attachmentHydrationEpochRef.current += 1;
        attachmentUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
        attachmentUrlsRef.current = [];
        const serverAttachments = nextBill.attachments ?? [];
        if (serverAttachments.length > 0) {
          setAttachments(mapServerAttachmentsToPreviewItems(serverAttachments));
        } else if (blobsForIndexedDb.length > 0) {
          await loadAttachmentsFromIndexedDb();
        } else {
          setAttachments([]);
        }
        setAttachmentsReady(true);

        await loadPayments();
        setIsEditing(false);
        setDraft(null);
        setBillNoError(null);
        setAccountCodeError(null);
        setSubmitAttemptFieldErrors(null);
        bumpAudit();
      } catch (e) {
        if (isDuplicateBillReferenceError(e)) {
          setBillNoError(e.message);
        } else {
          setActionError(
            e instanceof ApiError ? e.message : "Your changes didn't save. Try saving again.",
          );
        }
      } finally {
        setIsSaving(false);
      }
    },
    [
      requestId,
      bill,
      draft,
      attachments,
      bumpAudit,
      loadPayments,
      loadAttachmentsFromIndexedDb,
      onBillUpdated,
      commitPendingAttachmentDeletes,
      mapServerAttachmentsToPreviewItems,
      showToast,
    ],
  );

  const handleSave = useCallback(async () => {
    if (!requestId || !bill || !draft) return;
    setBillNoError(null);
    setAccountCodeError(null);

    const detailErrors = validateDetailRequiredForSubmit(draft);
    if (detailErrors) {
      setSubmitAttemptFieldErrors(detailErrors);
      setSubmitAttempt((n) => n + 1);
      return;
    }
    setSubmitAttemptFieldErrors(null);

    if (attachmentsReady && attachments.length === 0) {
      setMinimumAttachmentModalOpen(true);
      return;
    }

    // Overpayment check: warn if new amount is less than what has already been paid.
    const completedPayments = payments.filter(
      (p) => p.bill_id === requestId && p.payment_status !== "pending",
    );
    if (completedPayments.length > 0) {
      const totalPaid = completedPayments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
      const newAmount = parseAmount(draft.amount) ?? NaN;
      if (Number.isFinite(newAmount) && newAmount < totalPaid - 1e-9) {
        setOverpaymentWarningOpen(true);
        return;
      }
    }

    await executeSave();
  }, [requestId, bill, draft, payments, attachmentsReady, attachments.length, executeSave]);

  const handleRequestDeleteBill = useCallback(() => {
    setDeleteBillConfirmOpen(true);
  }, []);

  const executeDeleteBill = useCallback(async () => {
    if (!requestId) return;
    setIsDeleting(true);
    pendingBillAttachmentDeletesRef.current.clear();
    attachmentsRef.current.forEach((a) => {
      if (a.pendingUploadKey && a.url.startsWith("blob:")) URL.revokeObjectURL(a.url);
    });
    try {
      if (bill?.status === "returned") {
        await returnBillApi(requestId, "void");
      } else {
        await deleteBill(requestId);
      }
      setDeleteBillConfirmOpen(false);
      setIsEditing(false);
      setDraft(null);
      await reloadBill();
      await loadPayments();
      bumpAudit();
    } catch (e) {
      setActionError(
        e instanceof ApiError ? e.message : "This payment request wasn't voided. Try again.",
      );
    } finally {
      setIsDeleting(false);
    }
  }, [requestId, bill, reloadBill, bumpAudit, loadPayments]);

  const handleSubmitDraft = useCallback(async () => {
    if (!requestId || !bill) return;
    const info = isEditing && draft ? draft : viewData;
    if (!info) return;
    setBillNoError(null);
    setAccountCodeError(null);

    const detailErrors = validateDetailRequiredForSubmit(info);
    if (detailErrors) {
      setSubmitAttemptFieldErrors(detailErrors);
      setSubmitAttempt((n) => n + 1);
      if (!isEditing && viewData) {
        setDraft({
          ...viewData,
          accountCode: enrichAccountCodeWithOptions(viewData.accountCode, accountOptions),
        });
        setIsEditing(true);
      }
      return;
    }
    setSubmitAttemptFieldErrors(null);

    if (attachmentsReady && attachments.length === 0) {
      setMinimumAttachmentModalOpen(true);
      return;
    }

    const completedPayments = payments.filter(
      (p) => p.bill_id === requestId && p.payment_status !== "pending",
    );
    if (completedPayments.length > 0) {
      const totalPaid = completedPayments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
      const newAmount = parseAmount(info.amount) ?? NaN;
      if (Number.isFinite(newAmount) && newAmount < totalPaid - 1e-9) {
        setOverpaymentWarningOpen(true);
        return;
      }
    }

    setIsSubmittingDraft(true);
    try {
      const payload = buildBillUpdatePayload(bill, info);
      const updated = await updateBill(requestId, { ...payload, status: "submitted" });
      setUploadWarning(null);
      await commitPendingAttachmentDeletes(requestId);

      const stagedForApi = attachments.filter(
        (a): a is InvoiceAttachmentPreviewItem & { pendingFile: File } =>
          Boolean(a.pendingUploadKey && a.pendingFile),
      );
      if (stagedForApi.length > 0) {
        // Submitted by now: a file that does not upload is said on its own (see executeSave).
        const failed = await uploadEachAttachment(
          requestId,
          stagedForApi.map((a) => a.pendingFile),
        );
        for (const a of stagedForApi) {
          if (a.url.startsWith("blob:")) URL.revokeObjectURL(a.url);
        }
        if (failed.length > 0) {
          setUploadWarning(
            `This payment request was submitted, but ${joinFileNames(failed)} didn't upload. Edit the request and add it again.`,
          );
        }
      }

      const blobsForIndexedDb = attachments.filter(
        (a) => a.url.startsWith("blob:") && !a.pendingUploadKey,
      );

      let nextBill: BillDetail = updated;
      try {
        nextBill = await fetchBill(requestId);
      } catch {
        /* keep `updated` if refetch fails */
      }
      setBill(nextBill);
      onBillUpdated?.();

      if (blobsForIndexedDb.length > 0) {
        try {
          await replaceAttachmentBlobsFromPreviewItems(requestId, blobsForIndexedDb);
        } catch {
          await loadAttachmentsFromIndexedDb();
          // Submit succeeded; only the attachment cache write failed.
          showToast(
            "Your payment went through, but the attachments didn't update. Mind editing them again?",
            "warning",
          );
        }
      }

      attachmentHydrationEpochRef.current += 1;
      attachmentUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      attachmentUrlsRef.current = [];
      const serverAttachments = nextBill.attachments ?? [];
      if (serverAttachments.length > 0) {
        setAttachments(mapServerAttachmentsToPreviewItems(serverAttachments));
      } else if (blobsForIndexedDb.length > 0) {
        await loadAttachmentsFromIndexedDb();
      } else {
        setAttachments([]);
      }
      setAttachmentsReady(true);

      setIsEditing(false);
      setDraft(null);
      setAccountCodeError(null);
      setSubmitAttemptFieldErrors(null);
      await loadPayments();
      bumpAudit();
    } catch (e) {
      if (isDuplicateBillReferenceError(e)) {
        // Surfaced inline under Bill No. — a toast would just repeat it.
        setBillNoError(e.message);
        setSubmitAttemptFieldErrors(null);
      } else {
        setActionError(
          e instanceof ApiError
            ? e.message
            : "This payment request wasn't submitted. Try submitting it again.",
        );
      }
    } finally {
      setIsSubmittingDraft(false);
    }
  }, [
    requestId,
    bill,
    isEditing,
    draft,
    viewData,
    accountOptions,
    attachments,
    attachmentsReady,
    attachments.length,
    payments,
    loadPayments,
    loadAttachmentsFromIndexedDb,
    bumpAudit,
    onBillUpdated,
    commitPendingAttachmentDeletes,
    mapServerAttachmentsToPreviewItems,
    showToast,
  ]);

  const handlePublishToXero = useCallback(async () => {
    if (!requestId || !bill || isPublishing) return;
    setIsPublishing(true);
    setActionError(null);
    try {
      const updated = await publishBill(requestId);
      setBill(updated);
      onBillUpdated?.();
      bumpAudit();
      showToast("Published to Xero.", "success");
    } catch (e) {
      setActionError(
        isXeroAuthError(e)
          ? XERO_RECONNECT_MESSAGE
          : e instanceof ApiError
            ? e.message
            : "This payment request didn't reach Xero. Try publishing again.",
      );
    } finally {
      setIsPublishing(false);
    }
  }, [requestId, bill, isPublishing, bumpAudit, onBillUpdated, showToast]);

  const handleReturn = useCallback(async () => {
    if (!requestId || !bill || isReturning) return;
    setIsReturning(true);
    setActionError(null);
    try {
      const updated = await returnBillApi(requestId, "payment_requested");
      setBill(updated);
      onBillUpdated?.();
      bumpAudit();
      setReturnConfirmOpen(false);
      showToast(`Returned to the requester${bill.contact ? ` - ${bill.contact}` : ""}.`, "success");
    } catch (e) {
      setReturnConfirmOpen(false);
      setActionError(
        e instanceof ApiError ? e.message : "This payment request wasn't returned. Try again.",
      );
    } finally {
      setIsReturning(false);
    }
  }, [requestId, bill, isReturning, bumpAudit, onBillUpdated, showToast]);

  // Always the entity's selected currency (entities.currency_id -> iso_code).
  const currencyLabel = entityCurrency;

  const paymentHistoryRows = useMemo((): PaymentHistoryRow[] => {
    if (!requestId) return [];
    return payments.filter(shouldShowPaymentInHistory).map((p): PaymentHistoryRow => {
      const shortDate = p.payment_date ? formatDay(p.payment_date.trim().slice(0, 10)) || "—" : "—";
      const forThisBill = p.bill_id === requestId;
      const dateLabel = shortDate;
      const isPending = (p.payment_status ?? "").trim().toLowerCase() === "pending";
      const rawBillStatus =
        (p.bill_status && p.bill_status.trim()) || (forThisBill ? bill?.status : undefined) || "";
      const statusLabel = isPending
        ? "Pending"
        : rawBillStatus
          ? billStatusToDisplayLabel(rawBillStatus)
          : "—";
      const ref =
        (p.bill_reference && p.bill_reference.trim()) ||
        (p.reference_no && p.reference_no.trim()) ||
        p.bill_id.slice(0, 13).toUpperCase();
      return {
        id: p.id,
        billId: p.bill_id,
        billStatus: p.bill_status,
        date: dateLabel,
        amountLabel: `(${formatMoney(p.amount || "0", currencyLabel)})`,
        statusLabel,
        invoiceNo: ref,
        invoiceHref: forThisBill ? "#" : pages.request(p.bill_id, p.bill_reference, p.bill_status),
        isOtherBill: !forThisBill,
      };
    });
  }, [payments, requestId, currencyLabel, bill, pages]);

  const billIsDraft = useMemo(
    () => (bill?.status ?? "").trim().toLowerCase().replace(/-/g, "_") === "draft",
    [bill?.status],
  );

  const billDisplayStatus = useMemo(
    () => (bill ? billStatusToDisplayLabel(bill.status) : ""),
    [bill],
  );
  const billStatusNormalized = useMemo(
    () => (bill?.status ?? "").trim().toLowerCase().replace(/-/g, "_"),
    [bill?.status],
  );
  const billIsReturned = billStatusNormalized === "returned";
  const xeroPublishedToMenu = useMemo(() => {
    if (!bill) return false;
    if ((bill.published ?? "").trim() === "published") return true;
    return billStatusNormalized === "authorised" || billStatusNormalized === "authorized";
  }, [bill, billStatusNormalized]);
  const actionOverflowShowPublish = useMemo(
    () =>
      !xeroPublishedToMenu &&
      isElevated &&
      !isViewOnly &&
      !!bill &&
      billDisplayStatus !== "Draft" &&
      billDisplayStatus !== "Voided",
    [isElevated, isViewOnly, bill, billDisplayStatus, xeroPublishedToMenu],
  );
  const actionOverflowShowRepublish = useMemo(
    () =>
      xeroPublishedToMenu &&
      isElevated &&
      !isViewOnly &&
      !!bill &&
      billDisplayStatus !== "Draft" &&
      billDisplayStatus !== "Voided",
    [isElevated, isViewOnly, bill, billDisplayStatus, xeroPublishedToMenu],
  );
  const actionOverflowVoidDisabled = useMemo(
    () =>
      loadingBill ||
      !bill ||
      isDeleting ||
      isPublishing ||
      isViewOnly ||
      billDisplayStatus === "Voided" ||
      ((billDisplayStatus === "Paid" || billDisplayStatus === "Partially Paid") && !isElevated) ||
      (billDisplayStatus === "Returned" && !isElevated),
    [loadingBill, bill, isDeleting, isPublishing, isViewOnly, billDisplayStatus, isElevated],
  );
  const actionOverflowTriggerDisabled = loadingBill || !bill || bill?.status === "void";

  const detailToolbarActionsDisabled = useMemo(
    () =>
      loadingBill ||
      !bill ||
      isViewOnly ||
      bill.status === "void" ||
      ((bill.status === "paid" || bill.status === "authorised") && !isElevated),
    [loadingBill, bill, isViewOnly, isElevated],
  );

  // A request left with no invoice (a file that failed to upload after it was made): said on
  // the page for as long as it lasts, to whoever can fix it.
  const showNoInvoiceBanner =
    !!bill &&
    attachmentsReady &&
    attachments.length === 0 &&
    !isEditing &&
    !detailToolbarActionsDisabled &&
    billStatusNormalized !== "void" &&
    billStatusNormalized !== "voided";

  const handleOpenUploadAttachment = useCallback(() => {
    setUploadAttachmentOpen(true);
  }, []);

  const handleConfirmDeleteAttachments = useCallback(() => {
    if (selectedAttachmentIndices.length === 0) return;
    setDeleteAttachmentConfirmOpen(true);
  }, [selectedAttachmentIndices]);

  const executeDeleteSelectedAttachments = useCallback(() => {
    if (selectedAttachmentIndices.length === 0) return;
    const itemsToDelete = selectedAttachmentIndices
      .map((i) => attachments[i])
      .filter((x): x is InvoiceAttachmentPreviewItem => Boolean(x));
    if (itemsToDelete.length === 0) return;

    const removeSet = new Set(selectedAttachmentIndices);
    setAttachments((prev) => {
      const next = prev.filter((_, idx) => !removeSet.has(idx));
      for (let i = 0; i < prev.length; i++) {
        if (removeSet.has(i) && prev[i].url.startsWith("blob:")) {
          URL.revokeObjectURL(prev[i].url);
        }
      }
      return next;
    });
    setSelectedAttachmentIndices([]);

    const idsToStage = new Set<string>();
    for (const item of itemsToDelete) {
      if (item.pendingUploadKey) continue;
      if (item.billAttachmentId) {
        idsToStage.add(item.billAttachmentId);
        continue;
      }
      const match = bill?.attachments?.find(
        (ba) => (ba.attachment?.original_name ?? "").trim() === item.name.trim(),
      );
      if (match) idsToStage.add(match.id);
    }
    idsToStage.forEach((id) => pendingBillAttachmentDeletesRef.current.add(id));
  }, [attachments, selectedAttachmentIndices, bill]);

  // ---- Part 15.17 Record page: the header's actions, from the status × action matrix ----
  const canPay = isElevated && !isViewOnly;
  const statusNow = billDisplayStatus;
  const submittedOn = bill?.created_at ? formatDay(bill.created_at.slice(0, 10)) : "";
  const summaryItems: SummaryItem[] = submitAttemptFieldErrors
    ? (Object.keys(DETAIL_FIELD_IDS) as (keyof typeof DETAIL_FIELD_IDS)[])
        .filter(
          (k) => k !== "billNo" && submitAttemptFieldErrors[k as keyof DetailSubmitFieldErrors],
        )
        .map((k) => ({
          fieldId: DETAIL_FIELD_IDS[k],
          message: submitAttemptFieldErrors[k as keyof DetailSubmitFieldErrors] as string,
        }))
    : [];

  let primary: ReactNode = null;
  if (bill && !loadingBill) {
    if (isEditing) {
      primary = (
        <Button
          kind="primary"
          onClick={() => void handleSave()}
          processing={isSaving}
          processingLabel="Saving…"
          disabled={detailToolbarActionsDisabled}
        >
          Save Changes
        </Button>
      );
    } else if (billIsDraft || billIsReturned) {
      primary = !isViewOnly ? (
        <BillDraftSubmitButton
          onClick={() => void handleSubmitDraft()}
          disabled={loadingBill || isSaving || isDeleting}
          pending={isSubmittingDraft}
        />
      ) : null;
    } else if (statusNow === "Payment Requested" || statusNow === "Partially Paid") {
      primary = canPay ? (
        <Button
          kind="primary"
          onClick={() => {
            setRecordPaymentReadOnly(false);
            setRecordPaymentOpen(true);
          }}
          aria-label="Record payment"
        >
          Record payment
        </Button>
      ) : null;
    }
  }

  const headerActions =
    bill && !loadingBill ? (
      <>
        {isEditing ? (
          <Button kind="secondary" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </Button>
        ) : (
          <>
            {!detailToolbarActionsDisabled ? (
              <Button kind="secondary" onClick={handleEdit} icon={<Icon name="edit" size="md" />}>
                Edit
              </Button>
            ) : null}
            {statusNow === "Payment Requested" && canPay ? (
              <Button
                kind="secondary"
                onClick={() => setReturnConfirmOpen(true)}
                disabled={isReturning}
                aria-label="Return payment request"
              >
                Return to requester
              </Button>
            ) : null}
            {(statusNow === "Paid" || statusNow === "Partially Paid") && isElevated ? (
              <Button
                kind="secondary"
                onClick={() => {
                  setRecordPaymentReadOnly(true);
                  setRecordPaymentOpen(true);
                }}
              >
                View payments
              </Button>
            ) : null}
          </>
        )}
      </>
    ) : null;

  // More: Publish / Republish and Void - destructive only here, never beside the Primary.
  const headerMore =
    bill && !loadingBill && !isEditing ? (
      <BillActionBar
        onDeleteBill={handleRequestDeleteBill}
        onPublishToXero={handlePublishToXero}
        publishStatus={(bill?.published as "draft" | "published" | "failed") ?? "draft"}
        publishPending={isPublishing}
        showVoidBill={false}
        useActionsOverflowMenu
        overflowShowPublish={actionOverflowShowPublish}
        overflowShowRepublish={actionOverflowShowRepublish}
        overflowMenuTriggerDisabled={actionOverflowTriggerDisabled}
        overflowVoidDisabled={actionOverflowVoidDisabled}
        isDraftBill={billIsDraft}
      />
    ) : null;

  return (
    <>
      <PageHeader
        back={{ href: pages.list, label: "Payment Requests" }}
        title={bill?.contact?.trim() || (loadingBill ? "Loading…" : "Payment request")}
        status={statusNow && !loadingBill ? <StatusPill label={statusNow} /> : null}
        meta={
          bill ? (
            <span translate="no">
              {bill.reference ? `Payment No. ${bill.reference}` : null}
              {bill.reference && submittedOn ? " · " : null}
              {submittedOn ? `Submitted ${submittedOn}` : null}
            </span>
          ) : null
        }
        actions={headerActions}
        primary={primary}
        more={headerMore}
        below={
          <div className="flex flex-col gap-3 empty:hidden">
            {billIsReturned && !isEditing ? (
              <PageBanner
                tone="warning"
                title="This request was returned to the requester."
                action={
                  !isViewOnly ? (
                    <Button kind="link" onClick={handleEdit}>
                      Edit and resubmit
                    </Button>
                  ) : undefined
                }
              >
                Change what needs changing, then submit it for payment again.
              </PageBanner>
            ) : null}
            {/* One banner at a time: Returned wins; a named upload failure says it better. */}
            {showNoInvoiceBanner && !billIsReturned && !uploadWarning ? (
              <PageBanner
                tone="warning"
                title="This request has no invoice attached."
                action={
                  <Button kind="link" onClick={handleEdit}>
                    Edit and add the invoice
                  </Button>
                }
              >
                Add the invoice photo or PDF, then save.
              </PageBanner>
            ) : null}
            {isEditing && statusNow && !billIsDraft && !billIsReturned ? (
              <PageBanner tone="info" title="This request has already been submitted.">
                Saving changes updates it for Treasury - and in Xero once it is published.
              </PageBanner>
            ) : null}
            {uploadWarning && !isEditing ? (
              <InlineAlert tone="warning">{uploadWarning}</InlineAlert>
            ) : null}
            {actionError ? <InlineAlert tone="danger">{actionError}</InlineAlert> : null}
            <ErrorSummary items={summaryItems} attempt={submitAttempt} />
          </div>
        }
      />

      {/* Document-and-record, 1:1 on a computer (max 1440); stacked below lg (Part 15.17). */}
      <div className="mx-auto grid w-full min-w-0 max-w-[1440px] grid-cols-1 gap-6 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:grid-cols-2 lg:px-8">
        <section aria-label="Invoice" className="flex min-h-0 min-w-0 flex-col gap-3">
          <InvoiceAttachmentToolbar
            onDelete={isEditing ? handleConfirmDeleteAttachments : undefined}
            deleteReadOnly={selectedAttachmentIndices.length === 0 || deleteAttachmentPending}
            onUpload={isEditing ? handleOpenUploadAttachment : undefined}
            uploadReadOnly={false}
            showUpload={isEditing && attachmentsReady && attachments.length === 0}
            showAddMore={isEditing && attachmentsReady && attachments.length > 0}
          />
          <InvoiceAttachmentPreview
            attachments={attachments}
            isLoadingAttachments={!loadError && (loadingBill || !attachmentsReady)}
            editMode={isEditing}
            selectedIndices={selectedAttachmentIndices}
            onSelectedIndicesChange={setSelectedAttachmentIndices}
            showViewFullButton
            className="min-h-[min(45dvh,22rem)] sm:min-h-[min(55dvh,30rem)] lg:min-h-[min(70vh,40rem)]"
          />
          <AttachmentDeleteConfirmModal
            open={deleteAttachmentConfirmOpen}
            count={selectedAttachmentIndices.length}
            pending={deleteAttachmentPending}
            onClose={() => {
              if (!deleteAttachmentPending) setDeleteAttachmentConfirmOpen(false);
            }}
            onConfirm={() => {
              if (deleteAttachmentPending) return;
              setDeleteAttachmentPending(true);
              try {
                executeDeleteSelectedAttachments();
              } finally {
                setDeleteAttachmentPending(false);
                setDeleteAttachmentConfirmOpen(false);
              }
            }}
          />
          <AttachmentDeleteConfirmModal
            variant="minimumAttachment"
            open={minimumAttachmentModalOpen}
            count={0}
            onClose={() => setMinimumAttachmentModalOpen(false)}
          />
          <UploadInvoiceAttachmentModal
            open={uploadAttachmentOpen}
            onClose={() => setUploadAttachmentOpen(false)}
            onUpload={async (files) => {
              if (!requestId) return;
              setAttachments((prev) => {
                const usedNames = new Set(prev.map((x) => x.name));
                const added: InvoiceAttachmentPreviewItem[] = [];
                for (const file of files) {
                  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
                  const objectUrl = URL.createObjectURL(file);
                  const base = file.name.trim() || "attachment";
                  const name = uniquifyFileName(base, usedNames);
                  usedNames.add(name);
                  added.push({
                    url: objectUrl,
                    name,
                    mime: file.type || "application/octet-stream",
                    pendingUploadKey: key,
                    pendingFile: file,
                  });
                }
                return [...prev, ...added];
              });
              setAttachmentsReady(true);
            }}
          />
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          {loadingBill ? (
            <PaymentRequestDetailCardSkeleton />
          ) : loadError ? (
            <InlineAlert tone="danger">{loadError}</InlineAlert>
          ) : formData ? (
            <PaymentRequestDetailedInfo
              data={formData}
              isEditing={isEditing}
              isSaving={isSaving}
              unpaidAmount={unpaidAmountDisplay}
              disabled={
                !bill ||
                bill?.status === "void" ||
                ((bill?.status === "paid" || bill?.status === "authorised") && !isElevated)
              }
              billNoError={isEditing ? billNoError : null}
              accountCodeError={
                isEditing
                  ? (accountCodeError ?? submitAttemptFieldErrors?.accountCode ?? null)
                  : null
              }
              invoiceDateError={submitAttemptFieldErrors?.invoiceDate ?? null}
              dueDateError={submitAttemptFieldErrors?.dueDate ?? null}
              amountError={submitAttemptFieldErrors?.amount ?? null}
              contactError={submitAttemptFieldErrors?.contact ?? null}
              accountOptions={accountOptions}
              entityBillContacts={entityBillContacts}
              onRefetchEntityBillContacts={refetchEntityBillContacts}
              onPatchChange={isEditing ? handlePatch : undefined}
              fieldIds={DETAIL_FIELD_IDS}
            />
          ) : null}

          {!isEditing && !loadingBill && bill ? (
            <section
              id="payment-history"
              aria-labelledby="detail-payments"
              className="flex scroll-mt-4 flex-col gap-3"
            >
              <h2 id="detail-payments" className="text-title-l text-text-primary">
                Payments
              </h2>
              <PaymentHistoryListPanel rows={paymentHistoryRows} />
            </section>
          ) : null}

          <ActivityHistoryAccordion
            billId={requestId}
            billRef={bill?.reference ? `#${bill.reference}` : undefined}
            refreshSignal={auditRefresh}
          />
        </div>
      </div>
      <RowDeleteConfirmModal
        open={deleteBillConfirmOpen}
        contactTitle={bill?.contact ?? ""}
        isDraft={billIsDraft}
        pending={isDeleting}
        onClose={() => {
          if (!isDeleting) setDeleteBillConfirmOpen(false);
        }}
        onConfirm={executeDeleteBill}
      />
      <ConfirmDialog
        open={returnConfirmOpen}
        zIndex={310}
        title="Return this request to the requester?"
        confirmLabel="Return to requester"
        confirmVariant="primary"
        pending={isReturning}
        onClose={() => {
          if (!isReturning) setReturnConfirmOpen(false);
        }}
        onConfirm={() => void handleReturn()}
      >
        It goes back to whoever submitted it, to change and submit again. Nothing is paid or voided.
      </ConfirmDialog>
      <RecordPaymentDrawer
        open={recordPaymentOpen}
        onClose={() => {
          setRecordPaymentOpen(false);
          setRecordPaymentReadOnly(false);
        }}
        billId={requestId}
        billStatus={bill?.status}
        contactTitle={bill?.contact ?? ""}
        readOnly={recordPaymentReadOnly || !canPay}
        invoiceAmount={invoiceTotalMajor}
        description={bill?.description}
        onPaymentSaved={async () => {
          await loadPayments();
          await reloadBill();
          bumpAudit();
        }}
      />
      <OverpaymentWarningModal
        open={overpaymentWarningOpen}
        billId={requestId}
        payments={payments.filter(
          (p) =>
            p.bill_id === requestId &&
            p.payment_status !== "pending" &&
            shouldShowPaymentInHistory(p),
        )}
        totalPaid={payments
          .filter(
            (p) =>
              p.bill_id === requestId &&
              p.payment_status !== "pending" &&
              shouldShowPaymentInHistory(p),
          )
          .reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0)}
        currencyLabel={currencyLabel}
        onCancel={() => setOverpaymentWarningOpen(false)}
        onOpenPaymentHistory={() => {
          setRecordPaymentReadOnly(true);
          setRecordPaymentOpen(true);
        }}
      />
    </>
  );
}
