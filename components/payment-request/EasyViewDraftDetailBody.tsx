"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ThemedSelectOption } from "@/components/ThemedSelect";
import {
  ApiError,
  dedupeEntityBillContactsForPicker,
  fetchBill,
  fetchEntityBillAccounts,
  fetchEntityBillContacts,
  isDuplicateBillReferenceError,
  isXeroAuthError,
  publishBill,
  updateBill,
  XERO_RECONNECT_MESSAGE,
  type BillDetail,
  type EntityBillContact,
} from "@/lib/api";
import { enrichAccountCodeWithOptions } from "@/lib/billFormSelectOptions";
import { billToDetailedInfo, buildBillUpdatePayload } from "@/lib/paymentRequestBillMap";
import { BillActionBar } from "./BillActionBar";
import { useToast } from "@/components/Toast";
import {
  EasyViewDetailedInformationSkeleton,
  EasyViewDraftBillActionsRow,
  EasyViewDraftDetailedInformation,
  EasyViewDraftDetailedInformationEdit,
  type EasyViewDraftDetailActions,
} from "./EasyViewDraftDetailedInformation";
import type { PaymentRequestDetailedInfoData } from "./PaymentRequestDetailedInfo";
import type { PaymentRequestRow } from "./PaymentRequestTable";

type FieldErrors = Partial<
  Record<"invoiceDate" | "dueDate" | "amount" | "contact" | "accountCode", string>
>;

function validateDraftDetail(d: PaymentRequestDetailedInfoData): FieldErrors | null {
  const errors: FieldErrors = {};
  if (!d.accountCode.trim()) errors.accountCode = "We'll need an account code here.";
  if (!d.contact.trim()) errors.contact = "We'll need a supplier here.";
  if (!d.invoiceDate.trim()) errors.invoiceDate = "We'll need an invoice date here.";
  if (!d.dueDate.trim()) errors.dueDate = "We'll need a due date here.";
  const amt = Number.parseFloat((d.amount ?? "").replace(/,/g, ""));
  if (!(d.amount ?? "").trim() || !Number.isFinite(amt) || amt <= 0) {
    errors.amount = "That amount doesn't look quite right.";
  }
  return Object.keys(errors).length ? errors : null;
}

export function EasyViewDraftDetailBody({
  billId,
  actions,
  isElevated,
  isViewOnly,
  onBillSaved,
}: {
  billId: string;
  actions: EasyViewDraftDetailActions;
  isElevated: boolean;
  isViewOnly: boolean;
  onBillSaved?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [detail, setDetail] = useState<PaymentRequestDetailedInfoData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [accountOptions, setAccountOptions] = useState<ThemedSelectOption[]>([]);
  const [entityBillContacts, setEntityBillContacts] = useState<EntityBillContact[]>([]);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<PaymentRequestDetailedInfoData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [billNoError, setBillNoError] = useState<string | null>(null);
  const [accountCodeError, setAccountCodeError] = useState<string | null>(null);
  const [submitAttemptFieldErrors, setSubmitAttemptFieldErrors] = useState<FieldErrors | null>(
    null,
  );
  const { showToast } = useToast();

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
    setLoading(true);
    setBill(null);
    setDetail(null);
    setLoadErr(null);
    setIsEditing(false);
    setDraft(null);
    setBillNoError(null);
    setAccountCodeError(null);
    setSubmitAttemptFieldErrors(null);

    Promise.all([
      fetchBill(billId),
      fetchEntityBillAccounts({ billDropdown: true }),
      fetchEntityBillContacts(),
    ])
      .then(([b, accounts, contactList]) => {
        if (cancelled) return;
        const opts: ThemedSelectOption[] = accounts
          .filter((a) => a.is_active)
          .map((a) => ({
            value: `${a.account_code} - ${a.account_name}`,
            label: `${a.account_code} - ${a.account_name}`,
          }));
        setAccountOptions(opts);
        applyEntityBillContacts(contactList);
        const d = billToDetailedInfo(b);
        setBill(b);
        setDetail({
          ...d,
          accountCode: enrichAccountCodeWithOptions(d.accountCode, opts),
        });
      })
      .catch((e) => {
        if (!cancelled)
          setLoadErr(
            e instanceof ApiError
              ? e.message
              : "This payment didn't come through. Mind trying again?",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [billId, applyEntityBillContacts]);

  const handlePatch = useCallback((patch: Partial<PaymentRequestDetailedInfoData>) => {
    if (Object.prototype.hasOwnProperty.call(patch, "billNo")) setBillNoError(null);
    if (Object.prototype.hasOwnProperty.call(patch, "accountCode")) setAccountCodeError(null);
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

  const handleCancel = useCallback(async () => {
    setBillNoError(null);
    setAccountCodeError(null);
    setSubmitAttemptFieldErrors(null);
    try {
      const fresh = await fetchBill(billId);
      const d = billToDetailedInfo(fresh);
      setBill(fresh);
      setDetail({
        ...d,
        accountCode: enrichAccountCodeWithOptions(d.accountCode, accountOptions),
      });
      setDraft(null);
      setIsEditing(false);
    } catch {
      setDraft(null);
      setIsEditing(false);
    }
  }, [billId, accountOptions]);

  const handleSave = useCallback(async () => {
    if (!bill || !draft) return;
    setBillNoError(null);
    setAccountCodeError(null);
    const fieldErr = validateDraftDetail(draft);
    if (fieldErr) {
      setSubmitAttemptFieldErrors(fieldErr);
      return;
    }
    setSubmitAttemptFieldErrors(null);
    setIsSaving(true);
    try {
      const payload = buildBillUpdatePayload(bill, draft);
      const updated = await updateBill(billId, payload);
      const d = billToDetailedInfo(updated);
      setBill(updated);
      setDetail({
        ...d,
        accountCode: enrichAccountCodeWithOptions(d.accountCode, accountOptions),
      });
      setDraft(null);
      setIsEditing(false);
      onBillSaved?.();
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
  }, [bill, draft, billId, accountOptions, onBillSaved]);

  if (loading) {
    return <EasyViewDetailedInformationSkeleton mode="draftCard" />;
  }
  if (loadErr) {
    return (
      <div className="text-sm text-red-600" role="alert">
        {loadErr}
      </div>
    );
  }
  if (!bill || !detail) return null;

  const detailDisabled =
    isViewOnly ||
    !isElevated ||
    (bill.status ?? "").trim().toLowerCase().replace(/-/g, "_") === "void";

  if (isEditing && draft) {
    return (
      <div className="w-full min-w-0 max-w-full space-y-4">
        <EasyViewDraftDetailedInformationEdit
          actions={actions}
          data={draft}
          isSaving={isSaving}
          disabled={detailDisabled}
          billNoError={billNoError}
          accountCodeError={accountCodeError ?? submitAttemptFieldErrors?.accountCode ?? null}
          invoiceDateError={submitAttemptFieldErrors?.invoiceDate ?? null}
          dueDateError={submitAttemptFieldErrors?.dueDate ?? null}
          amountError={submitAttemptFieldErrors?.amount ?? null}
          contactError={submitAttemptFieldErrors?.contact ?? null}
          accountOptions={accountOptions}
          entityBillContacts={entityBillContacts}
          onRefetchEntityBillContacts={refetchEntityBillContacts}
          onPatchChange={handlePatch}
          onCancel={() => {
            void handleCancel();
          }}
          onSave={() => {
            void handleSave();
          }}
        />
      </div>
    );
  }

  return (
    <EasyViewDraftDetailedInformation
      data={detail}
      actions={actions}
      onEdit={handleEdit}
      editDisabled={detailDisabled}
    />
  );
}

/** Easy-view inline panel: fetch bill and show the same detailed information layout read-only (paid / voided / returned). */
export function EasyViewReadonlyBillDetailBody({
  billId,
  listStatus,
  isElevated,
  isViewOnly,
  onRequestVoidBill,
  onBillUpdated,
  voidBillPending = false,
}: {
  billId: string;
  listStatus: PaymentRequestRow["status"];
  isElevated: boolean;
  isViewOnly: boolean;
  onRequestVoidBill: () => void;
  onBillUpdated?: () => void;
  voidBillPending?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<PaymentRequestDetailedInfoData | null>(null);
  const [fullBill, setFullBill] = useState<BillDetail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setFullBill(null);
    setLoadErr(null);
    void fetchBill(billId)
      .then((b) => {
        if (cancelled) return;
        const d = billToDetailedInfo(b);
        setDetail({ ...d, accountCode: enrichAccountCodeWithOptions(d.accountCode, []) });
        setFullBill(b);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadErr(
          e instanceof ApiError
            ? e.message
            : "This payment didn't come through. Mind trying again?",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [billId]);

  const showPaidReturnedBar = listStatus === "Paid" || listStatus === "Returned";

  const billStatusNorm = useMemo(
    () => (fullBill?.status ?? "").trim().toLowerCase().replace(/-/g, "_"),
    [fullBill?.status],
  );

  const publishStatus = useMemo((): "draft" | "published" | "failed" => {
    const pub = (fullBill?.published ?? "").trim();
    if (pub === "published" || billStatusNorm === "authorised" || billStatusNorm === "authorized") {
      return "published";
    }
    if (pub === "failed") return "failed";
    return "draft";
  }, [fullBill?.published, billStatusNorm]);

  const voidDisabled = useMemo(() => {
    if (!fullBill || isPublishing || voidBillPending) return true;
    if (isViewOnly) return true;
    if (billStatusNorm === "void") return true;
    if ((billStatusNorm === "paid" || billStatusNorm === "authorised") && !isElevated) return true;
    if (billStatusNorm === "returned" && !isElevated) return true;
    return false;
  }, [fullBill, isPublishing, voidBillPending, isViewOnly, billStatusNorm, isElevated]);

  const publishDisabled = useMemo(() => {
    if (!fullBill || isPublishing || voidBillPending) return true;
    if (isViewOnly) return true;
    if (billStatusNorm === "void") return true;
    if (!isElevated) return true;
    return false;
  }, [fullBill, isPublishing, voidBillPending, isViewOnly, billStatusNorm, isElevated]);

  const handlePublishToXero = useCallback(async () => {
    setIsPublishing(true);
    try {
      const updated = await publishBill(billId);
      setFullBill(updated);
      const d = billToDetailedInfo(updated);
      setDetail({ ...d, accountCode: enrichAccountCodeWithOptions(d.accountCode, []) });
      onBillUpdated?.();
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
  }, [billId, onBillUpdated]);

  if (loading) {
    return (
      <EasyViewDetailedInformationSkeleton
        mode="readOnly"
        showFooterActionsSkeleton={showPaidReturnedBar}
      />
    );
  }
  if (loadErr) {
    return (
      <div className="text-sm text-red-600" role="alert">
        {loadErr}
      </div>
    );
  }
  if (!detail) return null;

  return (
    <EasyViewDraftDetailedInformation
      readOnly
      data={detail}
      readOnlyFooter={
        showPaidReturnedBar && fullBill ? (
          <>
            <BillActionBar
              onDeleteBill={onRequestVoidBill}
              onPublishToXero={() => {
                void handlePublishToXero();
              }}
              deleteDisabled={voidDisabled}
              publishDisabled={publishDisabled}
              publishStatus={publishStatus}
              publishPending={isPublishing}
              isDraftBill={false}
              voidButtonTrailing
            />
          </>
        ) : null
      }
    />
  );
}
