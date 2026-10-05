"use client";

import { useParams } from "next/navigation";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  uploadBillAttachments,
  XERO_RECONNECT_MESSAGE,
  type BillAttachment,
  type BillDetail,
  type EntityBillContact,
  type PaymentItem,
} from "@/lib/api";
import type { ThemedSelectOption } from "@/components/ThemedSelect";
import { useEntityCurrency } from "@/lib/entityCurrency";
import {
  MAX_AMOUNT_INT_DIGITS,
  formatAmount,
  formatMoney,
  isWithinAmountLimits,
  parseAmount,
} from "@/lib/amountFormat";
import { billStatusToDisplayLabel } from "@/lib/billStatusDisplay";
import { billHasRemainingCountablePayments, billStatusShouldRollbackWhenNoPayments } from "@/lib/billStatusRollback";
import { enrichAccountCodeWithOptions } from "@/lib/billFormSelectOptions";
import { billToDetailedInfo, buildBillUpdatePayload } from "@/lib/paymentRequestBillMap";
import { formatIsoDateForDisplay } from "@/lib/dateDisplayFormat";
import { shouldShowPaymentInHistory } from "@/lib/paymentHistoryDisplay";
import {
  loadAttachmentBlobs,
  replaceAttachmentBlobsFromPreviewItems,
  uniquifyFileName,
} from "@/lib/paymentRequestAttachmentStore";
import { ActivityHistoryAccordion } from "./ActivityHistoryAccordion";
import { BillActionBar } from "./BillActionBar";
import { BillDraftSubmitButton } from "./BillDraftSubmitButton";
import { InvoiceAttachmentPreview, type InvoiceAttachmentPreviewItem } from "./InvoiceAttachmentPreview";
import { InvoiceAttachmentToolbar } from "./InvoiceAttachmentToolbar";
import { OverpaymentWarningModal } from "./OverpaymentWarningModal";
import { PaymentHistoryListPanel, type PaymentHistoryRow } from "./PaymentHistoryCard";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { RowDeleteConfirmModal } from "./RowDeleteConfirmModal";
import { AttachmentDeleteConfirmModal } from "./AttachmentDeleteConfirmModal";
import { UploadInvoiceAttachmentModal } from "./UploadInvoiceAttachmentModal";
import {
  PaymentRequestDetailedInfo,
  paymentRequestDetailCancelButtonClass,
  paymentRequestDetailSaveButtonClass,
  type PaymentRequestDetailedInfoData,
} from "./PaymentRequestDetailedInfo";
import { recordPaymentDetailButtonClass, returnPaymentRequestButtonClass } from "./paymentRequestButtonClasses";
import { useToast } from "@/components/Toast";
import { useCompanyPages } from "@/lib/useCompanyPages";
export type PaymentRequestDetailBodyProps = {
  /** Called after the bill is refreshed from the server so the header status badge can update. */
  onBillUpdated?: () => void;
};

type DetailSubmitFieldErrors = Partial<
  Record<"invoiceDate" | "dueDate" | "amount" | "contact" | "accountCode", string>
>;

function validateDetailRequiredForSubmit(d: PaymentRequestDetailedInfoData): DetailSubmitFieldErrors | null {
  const errors: DetailSubmitFieldErrors = {};
  if (!d.accountCode.trim()) errors.accountCode = "We'll need an account code here.";
  if (!d.contact.trim()) errors.contact = "We'll need a supplier here.";
  if (!d.invoiceDate.trim()) errors.invoiceDate = "We'll need an invoice date here.";
  if (!d.dueDate.trim()) errors.dueDate = "We'll need a due date here.";
  const amt = parseAmount(d.amount);
  if (amt === null || amt <= 0) {
    errors.amount = "That amount doesn't look quite right.";
  } else if (!isWithinAmountLimits(d.amount ?? "")) {
    errors.amount = `That's a few too many digits - up to ${MAX_AMOUNT_INT_DIGITS} before the decimal point.`;
  }
  return Object.keys(errors).length ? errors : null;
}

/** Mirrors `PaymentRequestDetailedInfo` layout (labels + Bill No → date grid → amount row → description → contact + action → account). */
function PaymentRequestDetailCardSkeleton() {
  return (
    <section
      className="rounded-xl border border-gray-200/90 bg-white p-4 sm:p-5 md:p-6"
      role="status"
      aria-busy="true"
      aria-label="Loading detailed information"
    >
      <div className="mb-4 sm:mb-5">
        <div className="h-6 w-48 max-w-[85%] animate-pulse rounded-md bg-gray-200" aria-hidden />
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <div className="mb-1.5 h-3 w-14 animate-pulse rounded bg-gray-200" aria-hidden />
          <div className="h-11 min-h-[44px] w-full animate-pulse rounded-2xl bg-gray-100" aria-hidden />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
          <div>
            <div className="mb-1.5 h-3 w-24 animate-pulse rounded bg-gray-200" aria-hidden />
            <div className="h-11 min-h-[44px] w-full animate-pulse rounded-2xl bg-gray-100" aria-hidden />
          </div>
          <div>
            <div className="mb-1.5 h-3 w-20 animate-pulse rounded bg-gray-200" aria-hidden />
            <div className="h-11 min-h-[44px] w-full animate-pulse rounded-2xl bg-gray-100" aria-hidden />
          </div>
        </div>

        <div>
          <div className="mb-1.5 h-3 w-16 animate-pulse rounded bg-gray-200" aria-hidden />
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
            <div
              className="h-11 min-h-[44px] w-full shrink-0 animate-pulse rounded-2xl bg-gray-100 sm:w-24 sm:rounded-r-none"
              aria-hidden
            />
            <div
              className="h-11 min-h-[44px] w-full flex-1 animate-pulse rounded-2xl bg-gray-100 sm:rounded-l-none sm:rounded-r-2xl"
              aria-hidden
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 h-3 w-24 animate-pulse rounded bg-gray-200" aria-hidden />
          <div className="h-11 min-h-[44px] w-full animate-pulse rounded-2xl bg-gray-100" aria-hidden />
        </div>

        <div>
          <div className="mb-1.5 h-3 w-16 animate-pulse rounded bg-gray-200" aria-hidden />
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-11 min-h-[44px] min-w-0 flex-1 animate-pulse rounded-lg bg-gray-100" aria-hidden />
            <div className="h-9 w-[8.5rem] shrink-0 animate-pulse rounded-lg bg-gray-200 sm:h-10 sm:w-[9.75rem]" aria-hidden />
          </div>
        </div>

        <div>
          <div className="mb-1.5 h-3 w-28 animate-pulse rounded bg-gray-200" aria-hidden />
          <div className="h-11 min-h-[44px] w-full animate-pulse rounded-2xl bg-gray-100" aria-hidden />
        </div>
      </div>
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

function computePaymentHistoryPanelStyle(anchorRoot: HTMLDivElement | null): CSSProperties | null {
  if (typeof window === "undefined" || !anchorRoot) return null;
  const btn = anchorRoot.querySelector("button");
  if (!btn) return null;
  const pad = 12;
  const gap = 6;
  const rect = btn.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const remPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const maxPreferredW = 48 * remPx;
  const maxByViewport = vw - 2 * pad;
  const maxByAlignRight = Math.max(0, rect.right - pad);
  let width = Math.min(maxPreferredW, maxByViewport, maxByAlignRight);
  let left = rect.right - width;
  if (width < 1 || left < pad) {
    width = Math.min(maxPreferredW, maxByViewport);
    left = rect.right - width;
    if (left < pad) {
      left = pad;
      width = maxByViewport;
    }
  }
  const top = rect.bottom + gap;
  const maxHeight = Math.max(160, vh - top - pad);
  return {
    position: "fixed",
    left,
    top,
    width,
    maxHeight,
    zIndex: 300,
  };
}

export function PaymentRequestDetailBody({ onBillUpdated }: PaymentRequestDetailBodyProps) {
  const entityCurrency = useEntityCurrency();
  const params = useParams();
  const requestId = typeof params?.id === "string" ? params.id : "";
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
  const [submitAttemptFieldErrors, setSubmitAttemptFieldErrors] = useState<DetailSubmitFieldErrors | null>(null);

  const [isPublishing, setIsPublishing] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [recordPaymentReadOnly, setRecordPaymentReadOnly] = useState(false);
  const [deleteBillConfirmOpen, setDeleteBillConfirmOpen] = useState(false);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [overpaymentWarningOpen, setOverpaymentWarningOpen] = useState(false);
  const [auditRefresh, setAuditRefresh] = useState(0);
  const bumpAudit = useCallback(() => setAuditRefresh((n) => n + 1), []);
  const [paymentHistoryMenuOpen, setPaymentHistoryMenuOpen] = useState(false);
  const [paymentHistoryPanelStyle, setPaymentHistoryPanelStyle] = useState<CSSProperties | null>(null);
  const paymentHistoryDropdownRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!paymentHistoryMenuOpen) {
      setPaymentHistoryPanelStyle(null);
      return;
    }
    const run = () => {
      const next = computePaymentHistoryPanelStyle(paymentHistoryDropdownRef.current);
      if (next) setPaymentHistoryPanelStyle(next);
    };
    run();
    window.addEventListener("resize", run);
    window.addEventListener("scroll", run);
    const appScrollRoot = document.getElementById("app-scroll-root");
    if (appScrollRoot) appScrollRoot.addEventListener("scroll", run, { passive: true });
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", run);
      vv.addEventListener("scroll", run);
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(run) : null;
    if (ro && paymentHistoryDropdownRef.current) ro.observe(paymentHistoryDropdownRef.current);
    return () => {
      window.removeEventListener("resize", run);
      window.removeEventListener("scroll", run);
      if (appScrollRoot) appScrollRoot.removeEventListener("scroll", run);
      if (vv) {
        vv.removeEventListener("resize", run);
        vv.removeEventListener("scroll", run);
      }
      ro?.disconnect();
    };
  }, [paymentHistoryMenuOpen]);

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
        !list.some(
          (c) => (c.xero_contact_id || "").trim().toUpperCase() === mergedId,
        )
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
    return () => { cancelled = true; };
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
    } catch { /* ignore */ }
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
      setBill(null);
      setLoadingBill(false);
      setLoadError(null);
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
          setLoadError(e instanceof ApiError ? e.message : "This payment didn't come through. Mind trying again?");
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
  }, [requestId]);

  useEffect(() => {
    setDeleteBillConfirmOpen(false);
  }, [requestId]);

  useEffect(() => {
    if (typeof window === "undefined" || loadingBill || loadError) return;
    const scrollToPaymentHistory = () => {
      if (window.location.hash !== "#payment-history") return;
      setPaymentHistoryMenuOpen(true);
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
    if (!paymentHistoryMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = paymentHistoryDropdownRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setPaymentHistoryMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [paymentHistoryMenuOpen]);

  useEffect(() => {
    if (!isEditing) {
      setSelectedAttachmentIndices([]);
      setDeleteAttachmentConfirmOpen(false);
    } else {
      setPaymentHistoryMenuOpen(false);
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
      if (Object.prototype.hasOwnProperty.call(patch, "contact") || Object.prototype.hasOwnProperty.call(patch, "xero_contact_id")) {
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
        await commitPendingAttachmentDeletes(requestId);

        const stagedForApi = attachments.filter(
          (a): a is InvoiceAttachmentPreviewItem & { pendingFile: File } =>
            Boolean(a.pendingUploadKey && a.pendingFile),
        );
        if (stagedForApi.length > 0) {
          await uploadBillAttachments(
            requestId,
            stagedForApi.map((a) => a.pendingFile),
          );
          for (const a of stagedForApi) {
            if (a.url.startsWith("blob:")) URL.revokeObjectURL(a.url);
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
          showToast(
            e instanceof ApiError ? e.message : "That didn't quite save. Mind trying again?",
            "error",
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
      const totalPaid = completedPayments.reduce(
        (sum, p) => sum + parseFloat(p.amount || "0"),
        0,
      );
      const newAmount = parseAmount(draft.amount) ?? NaN;
      if (Number.isFinite(newAmount) && newAmount < totalPaid - 1e-9) {
        setOverpaymentWarningOpen(true);
        return;
      }
    }

    await executeSave();
  }, [
    requestId,
    bill,
    draft,
    payments,
    attachmentsReady,
    attachments.length,
    executeSave,
  ]);

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
      showToast(
        e instanceof ApiError ? e.message : "This payment's being a bit stubborn. Mind trying again?",
        "error",
      );
    } finally {
      setIsDeleting(false);
    }
  }, [requestId, bill, reloadBill, bumpAudit, loadPayments, showToast]);

  const handleSubmitDraft = useCallback(async () => {
    if (!requestId || !bill) return;
    const info = isEditing && draft ? draft : viewData;
    if (!info) return;
    setBillNoError(null);
    setAccountCodeError(null);

    const detailErrors = validateDetailRequiredForSubmit(info);
    if (detailErrors) {
      setSubmitAttemptFieldErrors(detailErrors);
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
      await commitPendingAttachmentDeletes(requestId);

      const stagedForApi = attachments.filter(
        (a): a is InvoiceAttachmentPreviewItem & { pendingFile: File } =>
          Boolean(a.pendingUploadKey && a.pendingFile),
      );
      if (stagedForApi.length > 0) {
        await uploadBillAttachments(
          requestId,
          stagedForApi.map((a) => a.pendingFile),
        );
        for (const a of stagedForApi) {
          if (a.url.startsWith("blob:")) URL.revokeObjectURL(a.url);
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
        showToast(
          e instanceof ApiError ? e.message : "This payment didn't quite make it through. Mind trying again?",
          "error",
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
    try {
      const updated = await publishBill(requestId);
      setBill(updated);
      onBillUpdated?.();
      bumpAudit();
    } catch (e) {
      showToast(
        isXeroAuthError(e)
          ? XERO_RECONNECT_MESSAGE
          : e instanceof ApiError
            ? e.message
            : "This payment didn't quite make it over to Xero. Mind trying again?",
        "error",
      );
    } finally {
      setIsPublishing(false);
    }
  }, [requestId, bill, isPublishing, bumpAudit, onBillUpdated, showToast]);

  const handleReturn = useCallback(async () => {
    if (!requestId || !bill || isReturning) return;
    setIsReturning(true);
    try {
      const updated = await returnBillApi(requestId, "payment_requested");
      setBill(updated);
      onBillUpdated?.();
      bumpAudit();
    } catch (e) {
      showToast(
        e instanceof ApiError ? e.message : "I couldn't send that back. Mind trying again?",
        "error",
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
      const shortDate = p.payment_date
        ? formatIsoDateForDisplay(p.payment_date.trim().slice(0, 10)) || "—"
        : "—";
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
        invoiceHref: forThisBill ? "#" : pages.request(p.bill_id),
        isOtherBill: !forThisBill,
      };
    });
  }, [payments, requestId, currencyLabel, bill, pages]);

  const billIsDraft = useMemo(
    () => (bill?.status ?? "").trim().toLowerCase().replace(/-/g, "_") === "draft",
    [bill?.status],
  );

  const billDisplayStatus = useMemo(() => (bill ? billStatusToDisplayLabel(bill.status) : ""), [bill]);
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
        (ba) =>
          (ba.attachment?.original_name ?? "").trim() === item.name.trim(),
      );
      if (match) idsToStage.add(match.id);
    }
    idsToStage.forEach((id) => pendingBillAttachmentDeletesRef.current.add(id));
  }, [attachments, selectedAttachmentIndices, bill]);

  return (
    <>
      <div className="mx-auto grid w-full min-w-0 max-w-[1920px] grid-cols-1 gap-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-1 sm:gap-5 sm:px-6 lg:grid-cols-2 lg:grid-rows-[auto_minmax(20rem,1fr)] lg:gap-x-6 lg:gap-y-4 lg:px-8 xl:gap-x-8 2xl:gap-x-10">
        <div className="min-w-0 max-lg:order-2 lg:order-none lg:col-start-1 lg:row-start-1">
          <InvoiceAttachmentToolbar
            onDelete={isEditing ? handleConfirmDeleteAttachments : undefined}
            deleteReadOnly={selectedAttachmentIndices.length === 0 || deleteAttachmentPending}
            onUpload={isEditing ? handleOpenUploadAttachment : undefined}
            uploadReadOnly={false}
            showUpload={isEditing && attachmentsReady && attachments.length === 0}
            showAddMore={isEditing && attachmentsReady && attachments.length > 0}
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
        </div>
        <div className="min-w-0 w-full max-w-full max-lg:order-1 lg:order-none lg:col-start-2 lg:row-start-1 lg:self-center">
          <BillActionBar
            onDeleteBill={handleRequestDeleteBill}
            onPublishToXero={handlePublishToXero}
            deleteDisabled={loadingBill || !bill || isDeleting || isPublishing || isViewOnly || bill?.status === "void" || ((bill?.status === "paid" || bill?.status === "authorised") && !isElevated)}
            publishDisabled={loadingBill || !bill || isViewOnly || bill?.status === "void" || !isElevated}
            publishStatus={(bill?.published as "draft" | "published" | "failed") ?? "draft"}
            publishPending={isPublishing}
            showVoidBill={false}
            endRowPrefix={
              !isEditing ? (
                <button
                  type="button"
                  onClick={handleEdit}
                  disabled={detailToolbarActionsDisabled}
                  className="inline-flex h-10 min-h-[44px] w-auto max-w-full shrink-0 cursor-pointer items-center justify-center rounded-full border border-primary/25 bg-white px-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
                >
                  Edit
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={detailToolbarActionsDisabled || isSaving}
                    className={paymentRequestDetailCancelButtonClass}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={detailToolbarActionsDisabled || isSaving}
                    className={paymentRequestDetailSaveButtonClass}
                  >
                    {isSaving ? "Saving…" : "Save Changes"}
                  </button>
                </>
              )
            }
            useActionsOverflowMenu
            overflowShowPublish={actionOverflowShowPublish}
            overflowShowRepublish={actionOverflowShowRepublish}
            overflowMenuTriggerDisabled={actionOverflowTriggerDisabled}
            overflowVoidDisabled={actionOverflowVoidDisabled}
            isDraftBill={billIsDraft}
          />
        </div>
        <div className="flex h-full min-h-0 min-w-0 max-lg:order-3 flex-col lg:order-none lg:col-start-1 lg:row-start-2">
          <InvoiceAttachmentPreview
            attachments={attachments}
            isLoadingAttachments={!loadError && (loadingBill || !attachmentsReady)}
            editMode={isEditing}
            selectedIndices={selectedAttachmentIndices}
            onSelectedIndicesChange={setSelectedAttachmentIndices}
            showViewFullButton
            className="h-full min-h-[min(45dvh,22rem)] sm:min-h-[min(55dvh,30rem)] lg:min-h-[min(70vh,40rem)]"
          />
        </div>
        <div className="flex min-w-0 max-lg:order-4 flex-col gap-4 sm:gap-5 lg:order-none lg:col-start-2 lg:row-start-2">
          {loadingBill ? (
            <PaymentRequestDetailCardSkeleton />
          ) : loadError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
              {loadError}
            </div>
          ) : formData ? (
            <PaymentRequestDetailedInfo
              data={formData}
              isEditing={isEditing}
              isSaving={isSaving}
              unpaidAmount={unpaidAmountDisplay}
              disabled={!bill || bill?.status === "void" || ((bill?.status === "paid" || bill?.status === "authorised") && !isElevated)}
              billNoError={isEditing ? billNoError : null}
              accountCodeError={
                isEditing ? (accountCodeError ?? submitAttemptFieldErrors?.accountCode ?? null) : null
              }
              invoiceDateError={submitAttemptFieldErrors?.invoiceDate ?? null}
              dueDateError={submitAttemptFieldErrors?.dueDate ?? null}
              amountError={submitAttemptFieldErrors?.amount ?? null}
              contactError={submitAttemptFieldErrors?.contact ?? null}
              accountOptions={accountOptions}
              entityBillContacts={entityBillContacts}
              onRefetchEntityBillContacts={refetchEntityBillContacts}
              onPatchChange={isEditing ? handlePatch : undefined}
              onEdit={handleEdit}
              onCancel={handleCancel}
              onSave={handleSave}
              editInCardHeader={false}
              contactHeaderEnd={
                !isEditing ? (
                  <div id="payment-history" ref={paymentHistoryDropdownRef} className="relative shrink-0 scroll-mt-4">
                    <button
                      type="button"
                      aria-expanded={paymentHistoryMenuOpen}
                      aria-controls="payment-history-dropdown-panel"
                      className="inline-flex h-9 max-w-full min-w-0 shrink-0 cursor-pointer items-center gap-1 rounded-lg border-0 bg-secondary/15 px-2.5 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-secondary/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:h-10 sm:gap-1.5 sm:px-3 sm:text-sm"
                      onClick={() => setPaymentHistoryMenuOpen((v) => !v)}
                    >
                      <span className="whitespace-nowrap">View Payment History</span>
                      <span className="material-symbols-outlined shrink-0 text-[20px] leading-none" aria-hidden>
                        {paymentHistoryMenuOpen ? "expand_less" : "expand_more"}
                      </span>
                    </button>
                    {paymentHistoryMenuOpen && paymentHistoryPanelStyle ? (
                      <div
                        id="payment-history-dropdown-panel"
                        role="dialog"
                        aria-labelledby="payment-history-dropdown-heading"
                        style={paymentHistoryPanelStyle}
                        className="overflow-y-auto overscroll-y-contain rounded-lg border border-gray-200 bg-white shadow-lg"
                      >
                        <div className="border-b border-gray-100 px-4 py-3 sm:px-5 sm:py-3.5">
                          <h2 id="payment-history-dropdown-heading" className="text-base font-semibold text-primary sm:text-lg">
                            Payment History
                          </h2>
                        </div>
                        <PaymentHistoryListPanel rows={paymentHistoryRows} />
                      </div>
                    ) : null}
                  </div>
                ) : undefined
              }
            />
          ) : null}

          <div className="flex w-full items-center justify-end gap-2">
            {bill?.status === "submitted" && isElevated && !isViewOnly && (
              <div
                className={isEditing ? "invisible pointer-events-none" : undefined}
                aria-hidden={isEditing || undefined}
              >
                <button
                  type="button"
                  aria-label="Return payment request"
                  disabled={isReturning || loadingBill || isEditing}
                  onClick={() => void handleReturn()}
                  className={returnPaymentRequestButtonClass}
                >
                  <span className="material-symbols-outlined shrink-0 text-[18px] leading-none" aria-hidden>
                    undo
                  </span>
                  {isReturning ? "Returning…" : "Return"}
                </button>
              </div>
            )}
            {loadingBill || !bill ? null : billIsDraft || billIsReturned ? (
              <div
                className={`sm:self-start${isEditing ? " invisible pointer-events-none" : ""}`}
                aria-hidden={isEditing || undefined}
              >
                <BillDraftSubmitButton
                  onClick={() => void handleSubmitDraft()}
                  disabled={
                    loadingBill ||
                    !bill ||
                    isViewOnly ||
                    isSubmittingDraft ||
                    isSaving ||
                    isDeleting ||
                    isEditing
                  }
                  pending={isSubmittingDraft}
                />
              </div>
            ) : bill?.status === "void" ? (
              <div
                className={isEditing ? "invisible pointer-events-none sm:self-start" : "sm:self-start"}
                aria-hidden={isEditing || undefined}
              >
                <button
                  type="button"
                  disabled
                  aria-label="Voided — record payment not available"
                  className={recordPaymentDetailButtonClass}
                >
                  <span className="whitespace-nowrap">Record Payment</span>
                  <span className="material-symbols-outlined shrink-0 text-[20px] leading-none" aria-hidden>
                    add
                  </span>
                </button>
              </div>
            ) : bill?.status === "paid" || bill?.status === "authorised" ? (
              <div
                className={isEditing ? "invisible pointer-events-none sm:self-start" : "sm:self-start"}
                aria-hidden={isEditing || undefined}
              >
                <button
                  type="button"
                  disabled={!isElevated || isEditing}
                  onClick={() => {
                    setRecordPaymentReadOnly(true);
                    setRecordPaymentOpen(true);
                  }}
                  aria-label={
                    isElevated ? "View payments" : "Insufficient permissions — view payments not available"
                  }
                  className="box-border inline-flex h-12 w-fit max-w-full min-w-0 shrink-0 cursor-pointer items-center justify-start gap-1.5 rounded-lg border-0 bg-secondary/15 px-3 text-left text-base font-medium text-secondary transition-colors hover:bg-secondary/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-primary/40 disabled:hover:bg-[#F5F5F5] sm:h-[46px] sm:px-3.5"
                >
                  View payments
                </button>
              </div>
            ) : (
              <div
                className={isEditing ? "invisible pointer-events-none sm:self-start" : "sm:self-start"}
                aria-hidden={isEditing || undefined}
              >
                <button
                  type="button"
                  disabled={!isElevated || isViewOnly || isEditing}
                  title={isViewOnly ? "Hmm, I can't let you in there. You have view-only access." : undefined}
                  onClick={() => {
                    if (!isViewOnly) {
                      setRecordPaymentReadOnly(false);
                      setRecordPaymentOpen(true);
                    }
                  }}
                  aria-label={isViewOnly ? "Record payment - unavailable with view-only access" : "Record payment"}
                  className={recordPaymentDetailButtonClass}
                >
                  <span className="whitespace-nowrap">Record Payment</span>
                  <span className="material-symbols-outlined shrink-0 text-[20px] leading-none" aria-hidden>
                    add
                  </span>
                </button>
              </div>
            )}
          </div>
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
      <RecordPaymentModal
        open={recordPaymentOpen}
        onClose={() => {
          setRecordPaymentOpen(false);
          setRecordPaymentReadOnly(false);
        }}
        billId={requestId}
        billStatus={bill?.status}
        contactTitle={bill?.contact ?? ""}
        readOnly={recordPaymentReadOnly}
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
