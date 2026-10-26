"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { pushAppScrollLock } from "@/lib/appScrollRoot";
import {
  fetchPayments,
  ApiError,
  fetchBill,
  createPayment,
  updatePayment,
  deletePayment,
  updateBill,
  type PaymentItem,
} from "@/lib/api";
import {
  billHasRemainingCountablePayments,
  billStatusShouldRollbackWhenNoPayments,
  normalizeBillStatusKey,
} from "@/lib/billStatusRollback";
import { DateTextField } from "@/components/DateTextField";
import { useToast } from "@/components/Toast";
import { useUserRole } from "@/lib/useUserRole";
import { PaymentDeleteConfirmModal } from "./PaymentDeleteConfirmModal";
import { BankSlipDetailsModal, type BankSlipDetails } from "./BankSlipDetailsModal";
import { buildBankSlipDetailsFromPaymentList } from "@/lib/bankSlipEnrichment";
import { useEntityCurrency } from "@/lib/entityCurrency";
import { shouldShowPaymentInHistory } from "@/lib/paymentHistoryDisplay";
import { formatIsoDateForDisplay } from "@/lib/dateDisplayFormat";
import { formatAmount, formatMoney, parseAmount } from "@minty/shared/money";
import { useAmountInput } from "@minty/shared/amountInput";

export type RecordPaymentModalProps = {
  open: boolean;
  onClose: () => void;
  billId: string;
  billStatus?: string | null;
  invoiceAmount?: number;
  description?: string;
  currencyCode?: string;
  contactTitle?: string;
  onPaymentSaved?: () => void;
  readOnly?: boolean;
  /** Inline panel (e.g. Easy View) — no overlay, no body scroll lock. `easyInline` uses the easy-view-specific layout; behavior is the same. */
  presentation?: "modal" | "inline" | "easyInline";
};

type PayMode = "full" | "partial";

function formatPaymentDateLabel(dateStr: string | null) {
  if (!dateStr) return "—";
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_BANK_SLIP_DETAILS: BankSlipDetails = {
  createdBy: "—",
  createdAt: "—",
  toName: "",
  amount: "—",
  fromName: "—",
  when: "—",
  files: [],
};

const MIN_BANK_SLIP_ROW = {
  contactTitle: "",
  submittedDate: "",
  invoiceDate: "",
  paidDate: "",
  unpaidAmount: "",
};

function isDraftBillStatus(status: string | null | undefined): boolean {
  const n = (status ?? "").trim().toLowerCase().replace(/-/g, "_");
  return n === "draft";
}

function isPartiallyPaidBillStatus(status: string | null | undefined): boolean {
  return normalizeBillStatusKey(status ?? "") === "partially_paid";
}

export function RecordPaymentModal({
  open,
  onClose,
  billId,
  billStatus,
  invoiceAmount = 0,
  description,
  contactTitle,
  onPaymentSaved,
  readOnly = false,
  presentation = "modal",
}: RecordPaymentModalProps) {
  // Currency ALWAYS comes from the entity's selected currency
  // (entities.currency_id -> iso_code) — display and payloads alike; no
  // per-bill or hardcoded fallback. Blank until the lookup resolves.
  const entityCurrency = useEntityCurrency();
  const currencyLabel = entityCurrency;
  const iso = entityCurrency;
  const { isElevated, isViewOnly } = useUserRole();
  // Delete payments requires elevated role AND the user must not be in
  // read-only mode (system superuser without entity membership).
  const canDeletePayments = isElevated && !isViewOnly;
  const titleId = useId();
  const dateFieldId = useId();
  const amountFieldId = useId();

  const [payMode, setPayMode] = useState<PayMode>("full");
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentsFetchedBillId, setPaymentsFetchedBillId] = useState<string | null>(null);
  const billIdRef = useRef(billId);
  billIdRef.current = billId;
  const paymentsLoadGenerationRef = useRef(0);
  const [draftDate, setDraftDate] = useState(todayISO);
  const [draftAmount, setDraftAmount] = useState("");
  const amountInput = useAmountInput({ value: draftAmount ?? "", onValue: setDraftAmount });
  /** Inline validation shown next to the payment form. Action failures
   *  (save/delete) surface as toasts instead. */
  const [formError, setFormError] = useState<string | null>(null);
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [finalizingPending, setFinalizingPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [paymentPendingDelete, setPaymentPendingDelete] = useState<PaymentItem | null>(null);
  const [bankSlipPreviewOpen, setBankSlipPreviewOpen] = useState(false);
  const [bankSlipFileCount, setBankSlipFileCount] = useState(0);
  const [bankSlipDetails, setBankSlipDetails] = useState<BankSlipDetails>(EMPTY_BANK_SLIP_DETAILS);

  const bankSlipRowForEnrichment = useMemo(
    () => ({ ...MIN_BANK_SLIP_ROW, contactTitle: (contactTitle ?? "").trim() }),
    [contactTitle],
  );

  const bankSlipDetailsForModal = useMemo((): BankSlipDetails => {
    const hint = (contactTitle ?? "").trim();
    if (!hint || bankSlipDetails.toName.trim()) return bankSlipDetails;
    return { ...bankSlipDetails, toName: hint };
  }, [bankSlipDetails, contactTitle]);

  const paymentsForBill = useMemo(
    () => payments.filter((p) => p.bill_id === billId),
    [payments, billId],
  );

  const paymentsForHistoryList = useMemo(
    () => paymentsForBill.filter(shouldShowPaymentInHistory),
    [paymentsForBill],
  );

  const totalPaid = useMemo(
    () => paymentsForBill.reduce((s, p) => s + parseFloat(p.amount || "0"), 0),
    [paymentsForBill],
  );
  const remaining = Math.max(0, Math.round((invoiceAmount - totalPaid) * 100) / 100);

  /** Bill is settled in full — once the balance hits 0 we drop into the read-only "View payments" presentation. */
  const isFullyPaid = invoiceAmount > 1e-9 && totalPaid > 1e-9 && remaining <= 1e-9;
  /** Presentation-only read-only flag: the `readOnly` prop OR a fully-paid bill. Effects/logic still key off `readOnly`. */
  const effectiveReadOnly = readOnly || isFullyPaid;

  /** Additional payments after an installment must use Partial Pay (Full Pay only when nothing paid yet or bill fully open). */
  const hasPartialPaymentTowardsInvoice = useMemo(
    () => totalPaid > 1e-9 && remaining > 1e-9,
    [totalPaid, remaining],
  );

  /** Full Pay is locked when the bill is in Partially Paid status (API `partially_paid`). */
  const billIsPartiallyPaid = useMemo(() => isPartiallyPaidBillStatus(billStatus), [billStatus]);

  const fullPayLocked = hasPartialPaymentTowardsInvoice || billIsPartiallyPaid;

  const pendingPayments = useMemo(
    () => paymentsForBill.filter((p) => p.payment_status === "pending"),
    [paymentsForBill],
  );

  const draftBill = isDraftBillStatus(billStatus);
  /** Non-draft bills need at least one bank slip file before pending rows can be finalized (edit mode). */
  const bankSlipRequiredForPending =
    !readOnly && !draftBill && pendingPayments.length > 0 && bankSlipFileCount < 1;

  const pendingIdsKey = useMemo(
    () =>
      pendingPayments
        .map((p) => p.id)
        .sort()
        .join(","),
    [pendingPayments],
  );

  const paymentHistoryReadyForBill = !!(billId && paymentsFetchedBillId === billId);
  const showPaymentHistoryPlaceholder =
    loadingPayments || (open && !!billId && !paymentHistoryReadyForBill);

  const syncSubmittedIfNoPaymentsLeft = useCallback(
    async (paymentsList: PaymentItem[]): Promise<boolean> => {
      if (!billId) return false;
      if (billHasRemainingCountablePayments(billId, paymentsList)) return false;
      const b = await fetchBill(billId);
      if (!billStatusShouldRollbackWhenNoPayments(b.status ?? "")) return false;
      await updateBill(billId, { status: "submitted" });
      return true;
    },
    [billId],
  );

  const loadPayments = useCallback(async () => {
    if (!billId) return;
    const requestBillId = billId;
    const loadGen = ++paymentsLoadGenerationRef.current;
    setLoadingPayments(true);
    try {
      const data = await fetchPayments(requestBillId);
      if (requestBillId !== billIdRef.current || loadGen !== paymentsLoadGenerationRef.current)
        return;
      setPayments(data.payments);
      try {
        const built = await buildBankSlipDetailsFromPaymentList(
          requestBillId,
          data.payments,
          bankSlipRowForEnrichment,
        );
        setBankSlipFileCount(built.count);
        setBankSlipDetails(built.bankSlipDetails ?? EMPTY_BANK_SLIP_DETAILS);
      } catch {
        setBankSlipFileCount(0);
        setBankSlipDetails(EMPTY_BANK_SLIP_DETAILS);
      }
      const rolled = await syncSubmittedIfNoPaymentsLeft(data.payments);
      if (rolled) onPaymentSaved?.();
    } catch {
      if (requestBillId !== billIdRef.current || loadGen !== paymentsLoadGenerationRef.current)
        return;
      setPayments([]);
      setBankSlipFileCount(0);
      setBankSlipDetails(EMPTY_BANK_SLIP_DETAILS);
    } finally {
      if (loadGen === paymentsLoadGenerationRef.current) {
        setLoadingPayments(false);
        if (requestBillId === billIdRef.current) {
          setPaymentsFetchedBillId(requestBillId);
        }
      }
    }
  }, [billId, bankSlipRowForEnrichment, syncSubmittedIfNoPaymentsLeft, onPaymentSaved]);

  useEffect(() => {
    if (open && billId) {
      loadPayments();
      setPayMode("full");
      setDraftDate(todayISO());
      setDraftAmount("");
      setFormError(null);
    }
    if (!open) {
      paymentsLoadGenerationRef.current += 1;
      setLoadingPayments(false);
      setPayments([]);
      setPaymentsFetchedBillId(null);
      setPaymentPendingDelete(null);
      setBankSlipPreviewOpen(false);
      setBankSlipFileCount(0);
      setBankSlipDetails(EMPTY_BANK_SLIP_DETAILS);
    }
  }, [open, billId, loadPayments]);

  useEffect(() => {
    if (!open || presentation !== "modal") return;
    return pushAppScrollLock();
  }, [open, presentation]);

  useEffect(() => {
    if (!open || presentation !== "modal") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, presentation]);

  useEffect(() => {
    if (!open || payMode !== "full") return;
    setDraftAmount(remaining > 0 ? formatAmount(remaining) : "");
  }, [open, payMode, remaining]);
  //
  //
  //test3

  useEffect(() => {
    if (!open || !fullPayLocked || payMode !== "full") return;
    setPayMode("partial");
    setDraftAmount("");
  }, [open, fullPayLocked, payMode]);

  useEffect(() => {
    if (!open || readOnly || !billId || !pendingIdsKey || bankSlipRequiredForPending) return;

    let cancelled = false;
    (async () => {
      setFinalizingPending(true);
      setFormError(null);
      try {
        const ids = new Set(pendingIdsKey.split(",").filter(Boolean));
        const data = await fetchPayments(billId);
        if (cancelled) return;
        const toComplete = data.payments.filter(
          (p) => p.bill_id === billId && p.payment_status === "pending" && ids.has(p.id),
        );
        if (toComplete.length === 0) return;
        await Promise.all(
          toComplete.map((p) => updatePayment(p.bill_id, p.id, { payment_status: "completed" })),
        );
        if (cancelled) return;
        await loadPayments();
        onPaymentSaved?.();
      } catch (err) {
        if (!cancelled) {
          showToast(
            err instanceof ApiError
              ? err.message
              : "Those payments didn't quite update. Mind trying again?",
            "error",
          );
        }
      } finally {
        if (!cancelled) setFinalizingPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    readOnly,
    billId,
    pendingIdsKey,
    bankSlipRequiredForPending,
    loadPayments,
    onPaymentSaved,
    showToast,
  ]);

  const handleAddPayment = async () => {
    setFormError(null);
    if (payMode === "full" && fullPayLocked) {
      setFormError(
        billIsPartiallyPaid
          ? "This payment's partially paid already - Partial Pay will handle anything extra."
          : "There's already a payment on this invoice, so Partial Pay is the one you want.",
      );
      return;
    }
    const amount = payMode === "full" ? remaining : parseAmount(draftAmount);
    if (amount === null || amount <= 0) {
      setFormError("That amount doesn't look quite right.");
      return;
    }
    if (amount > remaining + 1e-9) {
      setFormError(
        `That's a bit more than what's left - ${formatMoney(remaining, currencyLabel)} is the max.`,
      );
      return;
    }
    if (!draftDate.trim()) {
      setFormError("We'll need a payment date here.");
      return;
    }

    setAdding(true);
    try {
      await createPayment(billId, {
        payment_date: draftDate,
        amount,
        currency_code: iso,
        payment_status: "completed",
      });
      await loadPayments();
      onPaymentSaved?.();
      if (payMode === "partial") setDraftAmount("");
    } catch (err) {
      showToast(
        err instanceof ApiError
          ? err.message
          : "That payment didn't quite go through. Mind trying again?",
        "error",
      );
    } finally {
      setAdding(false);
    }
  };

  const deleteConfirmSummary = useMemo(() => {
    const p = paymentPendingDelete;
    if (!p) return "";
    const amt = parseFloat(p.amount || "0");
    const isPending = p.payment_status === "pending";
    const isPartialPayment = amt > 0 && amt + 1e-9 < invoiceAmount;
    const dateBit = formatPaymentDateLabel(p.payment_date);
    const kind = isPending
      ? `Pending on ${dateBit}`
      : isPartialPayment
        ? `Partial pay on ${dateBit}`
        : `Paid on ${dateBit}`;
    return `${kind} · ${formatMoney(amt, currencyLabel)}`;
  }, [paymentPendingDelete, invoiceAmount, currencyLabel]);

  const handleDeletePayment = async (p: PaymentItem) => {
    setDeletingId(p.id);
    try {
      await deletePayment(p.bill_id, p.id);
      const data = await fetchPayments(billId);
      const pruned = data.payments.filter((x) => x.id !== p.id);
      setPayments(pruned);
      try {
        const built = await buildBankSlipDetailsFromPaymentList(
          billId,
          pruned,
          bankSlipRowForEnrichment,
        );
        setBankSlipFileCount(built.count);
        setBankSlipDetails(built.bankSlipDetails ?? EMPTY_BANK_SLIP_DETAILS);
      } catch {
        setBankSlipFileCount(0);
        setBankSlipDetails(EMPTY_BANK_SLIP_DETAILS);
      }
      await syncSubmittedIfNoPaymentsLeft(pruned);

      onPaymentSaved?.();
    } catch (err) {
      showToast(
        err instanceof ApiError
          ? err.message
          : "That payment's being a bit stubborn. Mind trying again?",
        "error",
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (!open) return null;

  const isEasyInline = presentation === "easyInline";

  const paymentDateTextClass =
    "relative z-[1] box-border h-11 min-h-[44px] w-full rounded-2xl border border-gray-300 bg-white py-0 pl-3 pr-11 text-base text-black placeholder:text-gray-700 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25 [color-scheme:light] sm:min-h-11 sm:text-sm";
  /** Light grey fill, full `border-gray-300`, primary icon — shared by modal, inline, and easy-inline. */
  const paymentDateCalendarBtnClass =
    "absolute right-0 top-0 z-[3] box-border flex h-11 min-h-[44px] w-11 min-w-[44px] cursor-pointer items-center justify-center rounded-r-2xl border border-gray-300 bg-gray-100 text-primary transition-colors hover:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:min-h-11";

  const addPaymentButtonClass =
    "inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#00C896]/10 px-4 py-2.5 text-sm font-semibold text-[#00C896] transition-colors hover:bg-[#00C896]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C896] disabled:cursor-not-allowed disabled:opacity-50";

  const dialogShellClassName =
    presentation === "modal"
      ? "relative z-[1] flex max-h-[min(100dvh-1rem,880px)] w-full min-w-0 max-w-[480px] flex-col rounded-2xl bg-white shadow-xl ring-1 ring-black/5 sm:max-h-[min(92dvh,880px)] sm:rounded-2xl"
      : presentation === "easyInline"
        ? "relative flex max-h-[min(72vh,880px)] w-full min-w-0 max-w-[min(100%,720px)] flex-col overflow-hidden rounded-lg border border-secondary/50 bg-white sm:max-h-[min(80vh,880px)]"
        : "relative flex max-h-[min(72vh,880px)] w-full min-w-0 max-w-[480px] flex-col rounded-2xl bg-white shadow-lg ring-1 ring-secondary/25 sm:max-h-[min(80vh,880px)]";

  const bankSlipOpenLabel =
    bankSlipFileCount > 0
      ? `Payment attachments — ${bankSlipFileCount} file${bankSlipFileCount === 1 ? "" : "s"}; open to view or add bank slips`
      : "Payment attachments — open to view or add bank slips";

  const paymentDialog = (
    <div
      role="dialog"
      aria-modal={presentation === "modal"}
      aria-labelledby={titleId}
      className={dialogShellClassName}
      onClick={(e) => {
        if (presentation === "modal") e.stopPropagation();
      }}
    >
      <div className="shrink-0">
        {isEasyInline ? (
          <h2 id={titleId} className="sr-only">
            {effectiveReadOnly ? "View payments" : "Payment history"}
          </h2>
        ) : (
          <>
            <div className="px-4 pt-4 sm:px-6 sm:pt-6">
              <div className="flex items-start justify-between gap-3">
                <h2
                  id={titleId}
                  className="text-sm font-semibold uppercase tracking-[0.12em] text-secondary sm:text-base"
                >
                  {effectiveReadOnly ? "View payments" : "Payment history"}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-primary transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
                    close
                  </span>
                </button>
              </div>
            </div>
            <div className="mt-3 w-full border-b border-dotted border-gray-300" aria-hidden />
          </>
        )}
      </div>

      <div
        className={
          isEasyInline
            ? "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5"
            : "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-5 sm:px-6 sm:pb-6 sm:pt-6"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="text-sm font-medium text-primary">INVOICE AMOUNT</p>
              <div className="relative group inline-block">
                <span className="material-symbols-outlined text-[16px] cursor-pointer text-black hover:text-stone-800 block">
                  info
                </span>
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover:block bg-gray-950 text-white text-xs rounded-md py-1 px-3 whitespace-nowrap shadow-lg z-20 pointer-events-none">
                  {description?.trim() ? description : "No description added"}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-950"></div>
                </div>
              </div>
            </div>
            <p
              className={`mt-1 font-bold text-primary ${isEasyInline ? "text-lg sm:text-xl" : "text-xl sm:text-2xl"}`}
            >
              {formatMoney(invoiceAmount, currencyLabel)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBankSlipPreviewOpen(true)}
            className="relative flex h-11 min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-white px-3 text-sm text-primary/55 transition-colors hover:border-secondary/35 hover:bg-gray-50/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:min-h-11"
            aria-label={bankSlipOpenLabel}
          >
            <span className="whitespace-nowrap">Upload Bank Slip</span>
            <span
              className="material-symbols-outlined shrink-0 text-[22px] text-gray-400"
              aria-hidden
            >
              upload_file
            </span>
            {bankSlipFileCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold leading-none text-white">
                {bankSlipFileCount > 99 ? "99+" : bankSlipFileCount}
              </span>
            ) : null}
          </button>
        </div>

        {!effectiveReadOnly ? (
          <div className="mt-4 flex gap-2 sm:mt-5">
            <button
              type="button"
              disabled={fullPayLocked}
              title={
                fullPayLocked
                  ? billIsPartiallyPaid
                    ? "Full Pay isn't available once a payment's Partially Paid - Partial Pay will cover the rest."
                    : "Full Pay only works before any partial payment is recorded - Partial Pay will cover the rest."
                  : undefined
              }
              onClick={() => {
                if (fullPayLocked) return;
                setFormError(null);
                setPayMode("full");
              }}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors sm:py-2 ${
                fullPayLocked
                  ? "cursor-not-allowed border-2 border-gray-200 bg-gray-100 text-primary/45"
                  : payMode === "full"
                    ? "cursor-pointer bg-secondary text-white shadow-sm"
                    : "cursor-pointer border-2 border-secondary/40 bg-white text-secondary hover:bg-secondary/5"
              }`}
              aria-disabled={fullPayLocked}
            >
              Full Pay
            </button>
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setPayMode("partial");
                setDraftAmount("");
              }}
              className={`flex-1 cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors sm:py-2 ${payMode === "partial" ? "bg-secondary text-white shadow-sm" : "border-2 border-secondary/40 bg-white text-secondary hover:bg-secondary/5"}`}
            >
              Partial Pay
            </button>
          </div>
        ) : null}

        <div
          className={`relative flex items-center gap-3 ${effectiveReadOnly ? "mt-2" : isEasyInline ? "my-5" : "my-6"}`}
        >
          <div className="h-px flex-1 bg-gray-200" aria-hidden />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-primary/50">
            {isEasyInline ? "LESS : PAYMENTS" : "Less : payments"}
          </span>
          <div className="h-px flex-1 bg-gray-200" aria-hidden />
        </div>

        {showPaymentHistoryPlaceholder ? (
          <ul
            className="flex flex-col gap-2.5"
            role="status"
            aria-busy="true"
            aria-label="Loading payments"
          >
            {Array.from({ length: 1 }, (_, i) => (
              <li
                key={`pay-sk-${i}`}
                className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-3 sm:gap-3 sm:px-4"
                aria-hidden
              >
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary/15"
                  aria-hidden
                >
                  <span className="block h-[20px] w-[20px] animate-pulse rounded-sm bg-secondary/25" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="h-4 max-w-[min(100%,18rem)] animate-pulse rounded-sm bg-gray-200" />
                </div>
                <span
                  className="inline-block h-5 w-[7.25rem] shrink-0 animate-pulse rounded-sm bg-gray-200 tabular-nums"
                  aria-hidden
                />
                {!effectiveReadOnly || canDeletePayments ? (
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
                    <span
                      className="block h-[22px] w-[22px] animate-pulse rounded bg-gray-200"
                      aria-hidden
                    />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : paymentsForHistoryList.length === 0 ? (
          <p className="py-4 text-center text-sm text-primary/50">No payments recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {paymentsForHistoryList.map((p) => {
              const amt = parseFloat(p.amount || "0");
              const isPending = p.payment_status === "pending";
              const isPartialPayment = amt > 0 && amt + 1e-9 < invoiceAmount;
              const dateLabel = formatPaymentDateLabel(p.payment_date);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-3 sm:gap-3 sm:px-4"
                >
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isPending ? "bg-amber-100 text-amber-600" : "bg-secondary/15 text-secondary"}`}
                    aria-hidden
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {isPending ? "schedule" : "history"}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-primary">
                      {effectiveReadOnly
                        ? dateLabel
                        : isPending
                          ? `Pending on ${dateLabel}`
                          : isPartialPayment
                            ? `Partial Pay on ${dateLabel}`
                            : `Paid on ${dateLabel}`}
                    </p>
                    {isPending && !effectiveReadOnly ? (
                      <p className="text-[11px] text-amber-600">Pending</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-sm font-bold text-primary tabular-nums">
                    ({formatMoney(amt, currencyLabel)})
                  </span>
                  {!effectiveReadOnly || canDeletePayments ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!canDeletePayments) return;
                        setPaymentPendingDelete(p);
                      }}
                      disabled={!canDeletePayments || deletingId === p.id}
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${canDeletePayments ? "cursor-pointer text-rose-500 hover:bg-rose-100 hover:text-rose-600" : "cursor-not-allowed text-gray-400"}`}
                      aria-label={
                        canDeletePayments
                          ? "Remove this payment"
                          : "You do not have permission to delete payments."
                      }
                      title={
                        !canDeletePayments
                          ? "You do not have permission to delete payments."
                          : undefined
                      }
                    >
                      <span className="material-symbols-outlined text-[22px]">
                        {deletingId === p.id ? "progress_activity" : "delete"}
                      </span>
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {!effectiveReadOnly ? (
          isEasyInline ? (
            <>
              <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
                <div className="relative w-full min-w-0">
                  <label htmlFor={dateFieldId} className="sr-only">
                    Payment date
                  </label>
                  <DateTextField
                    id={dateFieldId}
                    value={draftDate ?? ""}
                    onChange={setDraftDate}
                    calendarAriaLabel="Open calendar for payment date"
                    textInputClassName={paymentDateTextClass}
                    calendarButtonClassName={paymentDateCalendarBtnClass}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor={amountFieldId} className="sr-only">
                    Payment amount
                  </label>
                  <div
                    className={
                      payMode === "full"
                        ? "flex min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)] focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-300/50"
                        : "flex min-w-0 overflow-hidden rounded-2xl border border-gray-300 bg-white focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/25"
                    }
                  >
                    <span
                      className={
                        payMode === "full"
                          ? "flex shrink-0 items-center border-r border-gray-200 bg-gray-200/70 px-3 text-sm font-medium text-gray-600"
                          : "flex shrink-0 items-center border-r border-gray-300 bg-gray-100 px-3 text-sm font-medium text-primary"
                      }
                    >
                      {currencyLabel}
                    </span>
                    <input
                      id={amountFieldId}
                      placeholder="0.00"
                      {...amountInput}
                      readOnly={payMode === "full"}
                      className="box-border min-h-[44px] min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-base text-black placeholder:text-gray-700 read-only:cursor-default read-only:text-gray-700 read-only:placeholder:text-gray-500 focus:outline-none focus:ring-0 sm:min-h-11 sm:text-sm"
                    />
                  </div>
                </div>
              </div>

              {formError ? (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {formError}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3">
                <div className="relative w-full min-w-0">
                  <label htmlFor={dateFieldId} className="sr-only">
                    Payment date
                  </label>
                  <DateTextField
                    id={dateFieldId}
                    value={draftDate ?? ""}
                    onChange={setDraftDate}
                    calendarAriaLabel="Open calendar for payment date"
                    textInputClassName={paymentDateTextClass}
                    calendarButtonClassName={paymentDateCalendarBtnClass}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor={amountFieldId} className="sr-only">
                    Payment amount
                  </label>
                  <input
                    id={amountFieldId}
                    placeholder="0.00"
                    {...amountInput}
                    readOnly={payMode === "full"}
                    className="box-border h-11 min-h-[44px] w-full rounded-2xl border border-gray-300 bg-white px-3 text-base text-black placeholder:text-gray-700 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25 sm:min-h-11 sm:text-sm read-only:cursor-default read-only:border-gray-200 read-only:bg-gray-100 read-only:text-gray-700 read-only:shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)] read-only:placeholder:text-gray-500 read-only:focus:border-gray-300 read-only:focus:ring-1 read-only:focus:ring-gray-300/50"
                  />
                </div>
              </div>

              {formError ? (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {formError}
                </p>
              ) : null}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleAddPayment}
                  disabled={remaining <= 0 || adding}
                  className={addPaymentButtonClass}
                >
                  {adding ? "Adding…" : "Add Payment"}
                  <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>
                    {adding ? "progress_activity" : "add"}
                  </span>
                </button>
              </div>
            </>
          )
        ) : null}
      </div>

      {!effectiveReadOnly ? (
        <div className="shrink-0 border-t border-gray-200 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4">
            {isEasyInline ? (
              <>
                <div
                  className="flex items-center justify-between gap-3"
                  role={showPaymentHistoryPlaceholder ? "status" : undefined}
                  aria-busy={showPaymentHistoryPlaceholder ? true : undefined}
                  aria-label={
                    showPaymentHistoryPlaceholder ? "Loading amount to be paid" : undefined
                  }
                >
                  <span className="text-sm font-medium text-primary/75">Amount to be Paid</span>
                  {showPaymentHistoryPlaceholder ? (
                    <span
                      className="inline-block h-7 w-[min(100%,9.5rem)] max-w-full animate-pulse rounded-md bg-gray-200 tabular-nums"
                      aria-hidden
                    />
                  ) : (
                    <span className="text-xl font-bold text-secondary sm:text-2xl">
                      {formatMoney(remaining, currencyLabel)}
                    </span>
                  )}
                </div>
                {bankSlipRequiredForPending ? (
                  <p
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                    role="status"
                  >
                    I need at least one bank slip to finalise pending payments - draft bills
                    don&apos;t need one.
                  </p>
                ) : null}
                {finalizingPending ? (
                  <div
                    className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="sr-only">Updating payments…</span>
                    <div className="h-3 w-40 animate-pulse rounded bg-gray-200" aria-hidden />
                    <div
                      className="h-3 w-full max-w-[16rem] animate-pulse rounded bg-gray-100"
                      aria-hidden
                    />
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAddPayment}
                    disabled={remaining <= 0 || adding}
                    className={addPaymentButtonClass}
                  >
                    {adding ? "Adding…" : "Add Payment"}
                    <span
                      className="material-symbols-outlined text-[18px] leading-none"
                      aria-hidden
                    >
                      {adding ? "progress_activity" : "add"}
                    </span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div
                  className="flex flex-col items-end gap-1"
                  role={showPaymentHistoryPlaceholder ? "status" : undefined}
                  aria-busy={showPaymentHistoryPlaceholder ? true : undefined}
                  aria-label={
                    showPaymentHistoryPlaceholder ? "Loading amount to be paid" : undefined
                  }
                >
                  <span className="text-sm font-medium text-primary">Amount to be Paid</span>
                  {showPaymentHistoryPlaceholder ? (
                    <span
                      className="inline-block h-6 w-[min(100%,9.5rem)] max-w-full animate-pulse rounded-md bg-gray-200 tabular-nums sm:h-7 sm:w-[10.5rem]"
                      aria-hidden
                    />
                  ) : (
                    <span className="text-2xl font-bold text-secondary sm:text-3xl">
                      {formatMoney(remaining, currencyLabel)}
                    </span>
                  )}
                </div>
                {bankSlipRequiredForPending ? (
                  <p
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                    role="status"
                  >
                    I need at least one bank slip to finalise pending payments - draft bills
                    don&apos;t need one.
                  </p>
                ) : null}
                {finalizingPending ? (
                  <div
                    className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="sr-only">Updating payments…</span>
                    <div className="h-3 w-40 animate-pulse rounded bg-gray-200" aria-hidden />
                    <div
                      className="h-3 w-full max-w-[16rem] animate-pulse rounded bg-gray-100"
                      aria-hidden
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {presentation === "modal"
        ? createPortal(
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center overflow-x-hidden overscroll-x-none p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:p-4 md:p-6"
              role="presentation"
            >
              <button
                type="button"
                aria-label="Close dialog"
                className="absolute inset-0 cursor-pointer bg-black/35 backdrop-blur-[1px]"
                onClick={onClose}
              />
              {paymentDialog}
            </div>,
            document.body,
          )
        : paymentDialog}
      <BankSlipDetailsModal
        open={bankSlipPreviewOpen}
        onClose={() => setBankSlipPreviewOpen(false)}
        details={bankSlipDetailsForModal}
        allowRemoveFiles={canDeletePayments}
        inlineUploadBillContext={{ billId, currencyCode: iso }}
        onInlineUploadSuccess={async () => {
          await loadPayments();
          onPaymentSaved?.();
        }}
        onBankSlipFileDeleted={async () => {
          await loadPayments();
          onPaymentSaved?.();
        }}
      />
      <PaymentDeleteConfirmModal
        open={paymentPendingDelete != null}
        summary={deleteConfirmSummary}
        pending={paymentPendingDelete != null && deletingId === paymentPendingDelete.id}
        onClose={() => {
          if (deletingId) return;
          setPaymentPendingDelete(null);
        }}
        onConfirm={async () => {
          const p = paymentPendingDelete;
          if (!p) return;
          await handleDeletePayment(p);
          setPaymentPendingDelete(null);
        }}
      />
    </>
  );
}
