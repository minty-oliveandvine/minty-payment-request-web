"use client";

/**
 * Record payment - the Part 15.17 Drawer (D15-11), opened from a list row or the request's page.
 *
 * 480 wide over the Part 13 scrim; a full-screen sheet on a phone (components/ui/Overlay.tsx).
 * Top to bottom: what is owed (Invoice amount, Paid so far, Unpaid) → the payments already
 * recorded → [Pay in full | Part payment] → Amount (helper "Unpaid: …", live "Unpaid after this
 * payment") → Payment date → bank slips → the Primary "Record HKD …" in the footer.
 *
 * Rules kept from the old dialog, unchanged:
 * - once a part payment exists (or the bill is Partially Paid) only part payments are offered;
 * - the amount can never exceed what is unpaid - the browser says so as you type, the server
 *   refuses it anyway;
 * - a non-draft bill needs a bank slip before its PENDING payments are finalised;
 * - deleting the last payment rolls the bill back to Payment Requested.
 *
 * Part 15.2: the Record button is the double-submit guard ("Recording…", disabled while in
 * flight). On success a toast says what happened and the list's row updates; nothing navigates.
 * Escape / the scrim with an amount typed and not recorded asks first.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DateTextField } from "@/components/DateTextField";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { Field, inputClass } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Drawer } from "@/components/ui/Overlay";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  acceptAmountInput,
  formatAmount,
  formatMoney,
  parseAmount,
  toAmountEditString,
} from "@minty/shared/money";
import {
  ApiError,
  createPayment,
  deletePayment,
  fetchBill,
  fetchPayments,
  updateBill,
  updatePayment,
  type PaymentItem,
} from "@/lib/api";
import { buildBankSlipDetailsFromPaymentList } from "@/lib/bankSlipEnrichment";
import {
  billHasRemainingCountablePayments,
  billStatusShouldRollbackWhenNoPayments,
  normalizeBillStatusKey,
} from "@/lib/billStatusRollback";
import { formatDay } from "@minty/shared/dates";
import { useEntityCurrency } from "@/lib/entityCurrency";
import { shouldShowPaymentInHistory } from "@/lib/paymentHistoryDisplay";
import { useUserRole } from "@/lib/useUserRole";

import { BankSlipDetailsModal, type BankSlipDetails } from "./BankSlipDetailsModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { PaymentDeleteConfirmModal } from "./PaymentDeleteConfirmModal";

export type RecordPaymentDrawerProps = {
  open: boolean;
  onClose: () => void;
  billId: string;
  billStatus?: string | null;
  invoiceAmount?: number;
  description?: string;
  contactTitle?: string;
  onPaymentSaved?: () => void;
  /** View payments only - nothing can be recorded. */
  readOnly?: boolean;
};

type PayMode = "full" | "partial";

function formatPaymentDateLabel(dateStr: string | null) {
  if (!dateStr) return "—";
  const head = dateStr.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    return formatDay(head) || dateStr;
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return formatDay(`${y}-${m}-${day}`) || dateStr;
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
  return normalizeBillStatusKey(status ?? "") === "draft";
}

function isPartiallyPaidBillStatus(status: string | null | undefined): boolean {
  return normalizeBillStatusKey(status ?? "") === "partially_paid";
}

export function RecordPaymentDrawer({
  open,
  onClose,
  billId,
  billStatus,
  invoiceAmount = 0,
  description,
  contactTitle,
  onPaymentSaved,
  readOnly = false,
}: RecordPaymentDrawerProps) {
  // Currency ALWAYS comes from the entity's selected currency (entities.currency_id -> iso_code)
  // - display and payloads alike; no per-bill or hardcoded fallback. Blank until it resolves.
  const iso = useEntityCurrency();
  const { isElevated, isViewOnly } = useUserRole();
  // Deleting payments needs an elevated role AND a member's access.
  const canDeletePayments = isElevated && !isViewOnly;
  const amountRef = useRef<HTMLInputElement>(null);

  const [payMode, setPayMode] = useState<PayMode>("full");
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentsFetchedBillId, setPaymentsFetchedBillId] = useState<string | null>(null);
  const billIdRef = useRef(billId);
  billIdRef.current = billId;
  const paymentsLoadGenerationRef = useRef(0);
  const [draftDate, setDraftDate] = useState(todayISO);
  const [draftAmount, setDraftAmount] = useState("");
  /** A refused submit's message for the amount (the empty / zero case waits for the submit). */
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** A server refusal or a failed request, shown in the drawer - never a toast (Part 14). */
  const [actionError, setActionError] = useState<string | null>(null);
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [finalizingPending, setFinalizingPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [paymentPendingDelete, setPaymentPendingDelete] = useState<PaymentItem | null>(null);
  const [bankSlipPreviewOpen, setBankSlipPreviewOpen] = useState(false);
  const [bankSlipFileCount, setBankSlipFileCount] = useState(0);
  const [bankSlipDetails, setBankSlipDetails] = useState<BankSlipDetails>(EMPTY_BANK_SLIP_DETAILS);
  const [askDiscard, setAskDiscard] = useState(false);

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

  /** Settled in full: the drawer becomes the read-only "Payments" view. */
  const isFullyPaid = invoiceAmount > 1e-9 && totalPaid > 1e-9 && remaining <= 1e-9;
  const effectiveReadOnly = readOnly || isFullyPaid;

  /** After an instalment only part payments are offered (Full only when nothing is paid yet). */
  const hasPartialPaymentTowardsInvoice = totalPaid > 1e-9 && remaining > 1e-9;
  const billIsPartiallyPaid = isPartiallyPaidBillStatus(billStatus);
  const fullPayLocked = hasPartialPaymentTowardsInvoice || billIsPartiallyPaid;

  const pendingPayments = useMemo(
    () => paymentsForBill.filter((p) => p.payment_status === "pending"),
    [paymentsForBill],
  );
  const draftBill = isDraftBillStatus(billStatus);
  /** Non-draft bills need a bank slip before pending payments can be finalised. */
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
        if (requestBillId === billIdRef.current) setPaymentsFetchedBillId(requestBillId);
      }
    }
  }, [billId, bankSlipRowForEnrichment, syncSubmittedIfNoPaymentsLeft, onPaymentSaved]);

  useEffect(() => {
    if (open && billId) {
      loadPayments();
      setPayMode("full");
      setDraftDate(todayISO());
      setDraftAmount("");
      setSubmitError(null);
      setActionError(null);
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
      setAskDiscard(false);
    }
  }, [open, billId, loadPayments]);

  useEffect(() => {
    if (!open || payMode !== "full") return;
    setDraftAmount(remaining > 0 ? formatAmount(remaining) : "");
  }, [open, payMode, remaining]);

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
          setActionError(
            err instanceof ApiError
              ? err.message
              : "Those payments didn't finish updating. Try again in a moment.",
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
  ]);

  // As-you-type range check (CLAUDE.md "Validation while typing"; Part 11 wording): over the
  // unpaid amount says the allowed value at once, and clears the moment it fits again.
  const typedAmount = parseAmount(draftAmount);
  const overLimit = payMode === "partial" && typedAmount !== null && typedAmount > remaining + 1e-9;
  const amountError = overLimit
    ? `Enter ${formatMoney(remaining, iso)} or less - that is what is unpaid.`
    : submitError;
  const recordAmount = payMode === "full" ? remaining : (typedAmount ?? 0);
  const unpaidAfter = Math.max(
    0,
    Math.round((remaining - (payMode === "full" ? remaining : (typedAmount ?? 0))) * 100) / 100,
  );
  const dirty = !effectiveReadOnly && payMode === "partial" && draftAmount.trim() !== "";

  const requestClose = () => {
    if (adding) return;
    if (dirty) setAskDiscard(true);
    else onClose();
  };

  const handleAddPayment = async () => {
    setSubmitError(null);
    setActionError(null);
    if (payMode === "full" && fullPayLocked) return;
    const amount = payMode === "full" ? remaining : typedAmount;
    if (amount === null || amount <= 0) {
      setSubmitError("The amount is still empty. Add the amount you paid to continue.");
      amountRef.current?.focus();
      return;
    }
    if (amount > remaining + 1e-9) {
      amountRef.current?.focus();
      return;
    }
    if (!draftDate.trim()) {
      setActionError("Add the payment date to continue.");
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
      showToast(
        `Payment of ${formatMoney(amount, iso)} recorded${contactTitle ? ` for ${contactTitle}` : ""}.`,
        "success",
      );
      if (payMode === "partial") setDraftAmount("");
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "That payment didn't go through. Try recording it again.",
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
    return `${kind} · ${formatMoney(amt, iso)}`;
  }, [paymentPendingDelete, invoiceAmount, iso]);

  const handleDeletePayment = async (p: PaymentItem) => {
    setDeletingId(p.id);
    setActionError(null);
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
      setActionError(
        err instanceof ApiError ? err.message : "That payment wasn't removed. Try again.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const money = (n: number) => formatMoney(n, iso);
  const title = effectiveReadOnly ? "Payments" : "Record payment";
  const bankSlipLabel =
    bankSlipFileCount > 0
      ? `Bank slips (${bankSlipFileCount})`
      : effectiveReadOnly
        ? "Bank slips"
        : "Add bank slip";

  return (
    <>
      <Drawer
        open={open}
        onRequestClose={requestClose}
        title={title}
        description={
          <span translate="no">
            {contactTitle || "Payment request"}
            {description?.trim() ? ` · ${description}` : ""}
          </span>
        }
        footer={
          effectiveReadOnly ? (
            <Button kind="secondary" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button kind="secondary" onClick={requestClose} disabled={adding}>
                Cancel
              </Button>
              <Button
                kind="primary"
                onClick={() => void handleAddPayment()}
                disabled={remaining <= 0 || overLimit}
                processing={adding}
                processingLabel="Recording…"
              >
                {recordAmount > 0 ? `Record ${money(recordAmount)}` : "Record payment"}
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-6">
          {/* What is owed - Part 14 Description rows; amounts in text/primary, tabular. */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body-m" translate="no">
            <dt className="text-text-secondary">Invoice amount</dt>
            <dd className="text-right tabular-nums text-text-primary">{money(invoiceAmount)}</dd>
            <dt className="text-text-secondary">Paid so far</dt>
            <dd className="text-right tabular-nums text-text-primary">
              {showPaymentHistoryPlaceholder ? (
                <Skeleton className="ml-auto h-4 w-24" />
              ) : (
                money(totalPaid)
              )}
            </dd>
            <dt className="font-semibold text-text-primary">Unpaid</dt>
            <dd className="text-right text-title-m tabular-nums text-text-primary">
              {showPaymentHistoryPlaceholder ? (
                <Skeleton className="ml-auto h-5 w-28" />
              ) : (
                money(remaining)
              )}
            </dd>
          </dl>

          {actionError ? <InlineAlert tone="danger">{actionError}</InlineAlert> : null}
          {bankSlipRequiredForPending ? (
            <InlineAlert tone="warning" title="A bank slip is needed.">
              Add at least one bank slip to finish the pending payments. Draft requests don&apos;t
              need one.
            </InlineAlert>
          ) : null}
          {finalizingPending ? (
            <p className="text-body-s text-text-secondary" role="status" aria-live="polite">
              Updating payments…
            </p>
          ) : null}

          {!effectiveReadOnly ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <SegmentedControl
                  label="How much is being paid"
                  value={payMode}
                  onChange={(v) => {
                    setSubmitError(null);
                    setPayMode(v);
                    if (v === "partial") setDraftAmount("");
                  }}
                  options={[
                    {
                      value: "full",
                      label: "Pay in full",
                      disabled: fullPayLocked,
                      title: fullPayLocked
                        ? "Part of this is paid already, so record the rest as a part payment."
                        : undefined,
                    },
                    { value: "partial", label: "Part payment" },
                  ]}
                />
                {fullPayLocked ? (
                  <p className="text-caption text-text-muted">
                    Part of this is paid already, so record the rest as a part payment.
                  </p>
                ) : null}
              </div>

              <Field
                label={`Payment amount (${iso || "—"})`}
                required
                helper={`Unpaid: ${money(remaining)}`}
                error={amountError ?? undefined}
              >
                {(a11y) => (
                  <input
                    {...a11y}
                    ref={amountRef}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    translate="no"
                    value={draftAmount ?? ""}
                    readOnly={payMode === "full"}
                    onChange={(e) => {
                      const value = acceptAmountInput(e.target.value);
                      if (value === null) return;
                      setSubmitError(null);
                      setDraftAmount(value);
                    }}
                    onFocus={() => setDraftAmount((prev) => toAmountEditString(prev))}
                    onBlur={(e) => setDraftAmount(formatAmount(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddPayment();
                    }}
                    className={`${inputClass(!!amountError, { readOnly: payMode === "full" })} text-right tabular-nums`}
                  />
                )}
              </Field>
              <p
                className="-mt-2 text-body-s text-text-secondary"
                aria-live="polite"
                translate="no"
              >
                Unpaid after this payment:{" "}
                <span className="tabular-nums text-text-primary">{money(unpaidAfter)}</span>
              </p>

              <Field label="Payment date" required>
                {(a11y) => (
                  <DateTextField
                    id={a11y.id}
                    ariaDescribedBy={a11y["aria-describedby"]}
                    required
                    value={draftDate ?? ""}
                    onChange={setDraftDate}
                    calendarAriaLabel="Payment date"
                    textInputClassName={inputClass()}
                    calendarButtonClassName="hidden"
                  />
                )}
              </Field>
            </div>
          ) : null}

          <Button
            kind="secondary"
            onClick={() => setBankSlipPreviewOpen(true)}
            icon={<Icon name="upload_file" size="md" />}
            className="self-start"
            aria-label={
              bankSlipFileCount > 0
                ? `Payment attachments — ${bankSlipFileCount} file${bankSlipFileCount === 1 ? "" : "s"}; open to view or add bank slips`
                : "Payment attachments — open to view or add bank slips"
            }
          >
            {bankSlipLabel}
          </Button>

          {/* The payments already recorded. */}
          <section aria-labelledby="record-payment-history" className="flex flex-col gap-2">
            <h3 id="record-payment-history" className="text-label text-text-secondary">
              Payments recorded
            </h3>
            {showPaymentHistoryPlaceholder ? (
              <div
                role="status"
                aria-busy="true"
                aria-label="Loading payments"
                className="flex flex-col gap-2"
              >
                <Skeleton className="h-12" />
              </div>
            ) : paymentsForHistoryList.length === 0 ? (
              <p className="text-body-m text-text-secondary">No payments recorded yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
                {paymentsForHistoryList.map((p) => {
                  const amt = parseFloat(p.amount || "0");
                  const isPending = p.payment_status === "pending";
                  const isPartialPayment = amt > 0 && amt + 1e-9 < invoiceAmount;
                  const dateLabel = formatPaymentDateLabel(p.payment_date);
                  return (
                    <li key={p.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                      <Icon
                        name={isPending ? "schedule" : "check_circle"}
                        size="md"
                        className="text-text-muted"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-m text-text-primary">
                          {isPending
                            ? `Pending on ${dateLabel}`
                            : isPartialPayment
                              ? `Partial Pay on ${dateLabel}`
                              : `Paid on ${dateLabel}`}
                        </p>
                        {isPending ? (
                          <p className="text-caption text-status-warning-ink">Pending</p>
                        ) : null}
                      </div>
                      <span
                        className="shrink-0 text-body-m font-semibold tabular-nums text-text-primary"
                        translate="no"
                      >
                        {money(amt)}
                      </span>
                      {canDeletePayments ? (
                        <button
                          type="button"
                          onClick={() => setPaymentPendingDelete(p)}
                          disabled={deletingId === p.id}
                          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary hover:bg-state-hover hover:text-action-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Remove this payment"
                        >
                          <Icon
                            name={deletingId === p.id ? "progress_activity" : "delete"}
                            size="md"
                          />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </Drawer>

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
      <ConfirmDialog
        open={askDiscard}
        zIndex={320}
        title="Discard this payment?"
        confirmLabel="Discard payment"
        onClose={() => setAskDiscard(false)}
        onConfirm={() => {
          setAskDiscard(false);
          onClose();
        }}
      >
        The amount you typed has not been recorded. Nothing is saved if you leave.
      </ConfirmDialog>
    </>
  );
}
