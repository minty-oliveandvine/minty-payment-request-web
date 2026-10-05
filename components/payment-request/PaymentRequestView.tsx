"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BankSlipDetailsModal } from "./BankSlipDetailsModal";
import { PaymentRequestEasyView, type EasyViewSortKey } from "./PaymentRequestEasyView";
import {
  getBankSlipDetailsForRow,
  PaymentRequestTable,
  type PaymentRequestRow,
} from "./PaymentRequestTable";
import {
  DEFAULT_FILTER_DATE_TYPE,
  PaymentRequestToolbar,
  type PaymentRequestStatusFilter,
} from "./PaymentRequestToolbar";
import { PaymentRequestPagination, PAGE_SIZE_OPTIONS } from "./PaymentRequestPagination";
import { PaymentRequestTotalsBanner } from "./PaymentRequestTotalsBanner";
import { BulkDeleteConfirmModal } from "./BulkDeleteConfirmModal";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { RowDeleteConfirmModal } from "./RowDeleteConfirmModal";
import type { EasyViewDraftDetailActions } from "./EasyViewDraftDetailedInformation";
import { billStatusToDisplayLabel } from "@/lib/billStatusDisplay";
import {
  deleteBill,
  fetchBill,
  fetchBills,
  isXeroAuthError,
  ApiError,
  publishBill,
  returnBill,
  XERO_RECONNECT_MESSAGE,
  type BillAttachment,
  type BillListItem,
  type BillDetail
} from "@/lib/api";
import type { InvoiceAttachmentPreviewItem } from "./InvoiceAttachmentPreview";
import { useEntityCurrency } from "@/lib/entityCurrency";
import { formatAmount, formatMoney, parseAmount } from "@/lib/amountFormat";
import { fetchBillBankSlipEnrichment, type BankSlipEnrichment } from "@/lib/bankSlipEnrichment";
import { BILLING_TIME_ZONE, formatIsoDateForDisplay, isoDateInTimeZone } from "@/lib/dateDisplayFormat";
import { getAuth } from "@/lib/auth";
import { compareRows, type SortKey } from "@/lib/paymentRequestRowSort";
import { rowMatchesSearch, type SearchMode } from "@/lib/paymentRequestSearch";
import { useUserRole } from "@/lib/useUserRole";
import { useToast } from "@/components/Toast";
import { useCompanyPages } from "@/lib/useCompanyPages";

/** Rows requested per `fetchBills` call while walking the whole list. */
const FETCH_PAGE_SIZE = 100;
/** Hard stop for the fetch-all loop so a huge entity can't hang the page. */
const MAX_FETCHED_ROWS = 2000;
/** Bank-slip enrichment requests issued in parallel. */
const ENRICH_BATCH = 5;

/** A date-only API value (`invoice_date`) — no instant, so no timezone to apply. */
const PLAIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Hong Kong calendar date an API value falls on, as `yyyy-mm-dd`.
 *
 * Timestamps (`created_at`, `paid_at`) are UTC, so the date has to be resolved in
 * Hong Kong rather than by slicing the string: 2026-08-31T18:00:00Z is 1 Sep locally.
 * Plain dates pass through untouched.
 */
function toBillingIsoDate(dateStr: string): string {
  const s = dateStr.trim();
  if (!s) return "";
  if (PLAIN_DATE_RE.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return isoDateInTimeZone(d, BILLING_TIME_ZONE);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const iso = toBillingIsoDate(dateStr);
  return iso ? formatIsoDateForDisplay(iso) || dateStr : dateStr;
}

function mapBillToRow(bill: BillListItem, entityCurrency = ""): PaymentRequestRow {
  const status = billStatusToDisplayLabel(bill.status);
  // Currency displays ALWAYS use the entity's selected currency
  // (entities.currency_id -> iso_code) — never the bill's stored code and
  // never a hardcoded default. Blank until the registry lookup resolves.
  const iso = entityCurrency;
  const symbol = iso;
  const statusNorm = (bill.status ?? "").trim().toLowerCase().replace(/-/g, "_");
  const xeroActive =
    (bill.published ?? "").trim() === "published" ||
    statusNorm === "authorised" ||
    statusNorm === "authorized";

  return {
    id: bill.id,
    contactTitle: bill.contact || "—",
    contactCaption: bill.description,
    currencyCode: iso,
    invoiceDate: bill.invoice_date ? formatDate(bill.invoice_date) : "",
    invoiceDateIso: bill.invoice_date ? toBillingIsoDate(bill.invoice_date) : "",
    status,
    submittedDate: formatDate(bill.created_at),
    submittedDateIso: toBillingIsoDate(bill.created_at),
    unpaidAmount: formatMoney(bill.amount_due, symbol) || (symbol ? `${symbol} 0.00` : "0.00"),
    invoiceTotal: formatAmount(bill.amount),
    payment: "",
    paidDate: bill.paid_at ? formatDate(bill.paid_at) : "",
    bankslip: "",
    xeroActive,
  };
}

const STATUS_LABEL_TO_API: Record<string, string> = {
  "Draft": "draft",
  "Payment Requested": "submitted",
  "Paid": "paid",
  "Partially Paid": "partially_paid",
  "Voided": "void",
  "Returned": "returned",
};

type EnrichmentEntry = { epoch: number; value: BankSlipEnrichment };

/** Same mapping as `PaymentRequestDetailBody.mapServerAttachmentsToPreviewItems`. */
function mapBillAttachmentsToPreviewItems(
  billId: string,
  serverAttachments: BillAttachment[],
): InvoiceAttachmentPreviewItem[] {
  return serverAttachments
    .filter((ba) => ba.attachment?.download_url)
    .map((ba) => ({
      url: ba.attachment.download_url,
      name: ba.attachment.original_name,
      mime: ba.attachment.mime_type || "application/octet-stream",
      previewApiPath:
        (ba.attachment.mime_type || "").toLowerCase() === "application/pdf"
          ? `/api/v1/bills/${billId}/attachments/${ba.id}/preview/`
          : undefined,
      billAttachmentId: ba.id,
    }));
}

export type PaymentRequestViewProps = {
  easyView: boolean;
};

export function PaymentRequestView({ easyView }: PaymentRequestViewProps) {
  const router = useRouter();
  const pages = useCompanyPages();
  const { isElevated, isViewOnly, isReadOnly } = useUserRole();
  const entityCurrency = useEntityCurrency();
  const [currentEntityId, setCurrentEntityId] = useState<string>("");

  useEffect(() => {
    const a = getAuth();
    setCurrentEntityId(a?.entityId ?? "");
  }, []);

  // True when a system superuser is viewing an entity they are not a member of.
  // In this case we show a prominent banner and all write controls are already
  // hidden/disabled by isViewOnly.
  const showReadOnlyBanner = isViewOnly && isReadOnly(currentEntityId);
  // Empty array = "All". One entry = single-status filter (kept server-side).
  // 2+ entries = stacked filter (server returns everything, client filters by union).
  const [statusFilters, setStatusFilters] = useState<PaymentRequestStatusFilter[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  /** Typing searches by "contains"; submitting the box narrows to an exact match. */
  const [searchMode, setSearchMode] = useState<SearchMode>("contains");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [dateType, setDateType] = useState<string>(DEFAULT_FILTER_DATE_TYPE);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [xeroStatus, setXeroStatus] = useState("");
  const [rawBills, setRawBills] = useState<BillListItem[]>([]);
  const [bills, setBills] = useState<PaymentRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  /** Blocking load failure — replaces the table with a retry prompt. Action
   *  failures (delete/publish) surface as toasts instead. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const { showToast } = useToast();
  const [datasetTruncated, setDatasetTruncated] = useState(false);
  /** False while the fetch-all loop is still committing pages. */
  const [datasetComplete, setDatasetComplete] = useState(false);
  const [recordPaymentTarget, setRecordPaymentTarget] = useState<{ billId: string; readOnly: boolean } | null>(null);
  const [easyViewPayBillId, setEasyViewPayBillId] = useState<string | null>(null);
  const [easyViewPayReadOnly, setEasyViewPayReadOnly] = useState(false);
  const [easyViewDraftBillId, setEasyViewDraftBillId] = useState<string | null>(null);
  const [easyViewDraftDeleteOpen, setEasyViewDraftDeleteOpen] = useState(false);
  const [easyViewDraftDeletePending, setEasyViewDraftDeletePending] = useState(false);
  const [easyViewSelectedBillId, setEasyViewSelectedBillId] = useState<string | null>(null);
  const [easyViewInvoiceAttachments, setEasyViewInvoiceAttachments] = useState<InvoiceAttachmentPreviewItem[]>([]);
  const [easyViewInvoiceLoading, setEasyViewInvoiceLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [easyViewBankSlipRowId, setEasyViewBankSlipRowId] = useState<string | null>(null);
  const [easyViewPayBill, setEasyViewPayBill] = useState<BillDetail | null>(null);
  // Each view keeps its own sort (the table exposes 6 keys, easy view 4), but both
  // live here because the page slice has to be taken *after* sorting.
  const [tableSort, setTableSort] = useState<{ key: SortKey | null; dir: "asc" | "desc" }>({ key: "status", dir: "asc" });
  const [easySort, setEasySort] = useState<{ key: EasyViewSortKey; dir: "asc" | "desc" }>({ key: "status", dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  // Bank-slip counts, keyed by bill id and stamped with the load that produced them.
  const [enrichmentById, setEnrichmentById] = useState<Map<string, EnrichmentEntry>>(() => new Map());
  const [enrichEpoch, setEnrichEpoch] = useState(0);

  const statusFilterKey = statusFilters.join("|");

  /** Bank-slip counts merged onto the rows, so every consumer sees enriched data. */
  const enrichedBills = useMemo(
    () =>
      bills.map((r) => {
        const e = enrichmentById.get(r.id)?.value;
        if (!e) return r;
        return {
          ...r,
          bankslipFileCount: e.bankslipFileCount,
          ...(e.bankSlipDetails ? { bankSlipDetails: e.bankSlipDetails } : {}),
        };
      }),
    [bills, enrichmentById],
  );

  /**
   * Everything the user should currently see, before paging: the Voided rule,
   * the Xero publish-state filter, the status pills and the search query.
   */
  const filteredBills = useMemo(() => {
    // Voided bills are hidden from every view unless the user explicitly selects the
    // "Voided" status filter. A shop manager can accidentally void a bill when adding
    // it, and surfacing those mistakes in the default list is confusing/irritating —
    // they stay reachable only through the dedicated Voided filter.
    const showVoided = statusFilters.includes("Voided");
    let result = showVoided ? enrichedBills : enrichedBills.filter((r) => r.status !== "Voided");
    if (xeroStatus === "published") result = result.filter((r) => r.xeroActive === true);
    else if (xeroStatus === "draft") result = result.filter((r) => r.xeroActive !== true);
    if (statusFilters.length > 0) result = result.filter((r) => statusFilters.some((s) => s === r.status));
    if (debouncedSearch) result = result.filter((r) => rowMatchesSearch(r, debouncedSearch, searchMode));
    // Dates are matched here rather than server-side so the comparison uses the same
    // Hong Kong calendar date the column shows. The API compares `created_at` (a UTC
    // timestamp) against a date coerced to midnight, which drops the whole end day —
    // a same-day range returned nothing at all.
    if (startDate || endDate) {
      const submitted = dateType === "Submitted Date";
      result = result.filter((r) => {
        const iso = submitted ? r.submittedDateIso : r.invoiceDateIso;
        if (!iso) return false;
        if (startDate && iso < startDate) return false;
        if (endDate && iso > endDate) return false;
        return true;
      });
    }
    return result;
  }, [enrichedBills, xeroStatus, statusFilters, debouncedSearch, searchMode, dateType, startDate, endDate]);

  const totalItems = filteredBills.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  // Slice with `safePage` so a shrinking result set never flashes an empty page.
  const safePage = Math.min(page, pageCount);

  const sortedForTable = useMemo(() => {
    if (!tableSort.key) return filteredBills;
    return [...filteredBills].sort((a, b) => compareRows(a, b, tableSort.key!, tableSort.dir));
  }, [filteredBills, tableSort]);

  const sortedForEasy = useMemo(
    () => [...filteredBills].sort((a, b) => compareRows(a, b, easySort.key, easySort.dir)),
    [filteredBills, easySort],
  );

  const tablePageRows = useMemo(
    () => sortedForTable.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sortedForTable, safePage, pageSize],
  );

  const easyPageRows = useMemo(
    () => sortedForEasy.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sortedForEasy, safePage, pageSize],
  );

  /** Only rows that survive the current filters count toward bulk actions and the banner. */
  const activeSelectedRows = useMemo(
    () => filteredBills.filter((r) => selectedIds.has(r.id)),
    [filteredBills, selectedIds],
  );
  const activeSelectedIds = useMemo(() => activeSelectedRows.map((r) => r.id), [activeSelectedRows]);
  const bulkActionsEnabled = activeSelectedIds.length >= 2;

  const onToggleRow = useCallback(
    (id: string) => {
      const row = bills.find((r) => r.id === id);
      if (row?.status === "Voided") return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [bills],
  );

  /** `ids` = the selectable rows on the caller's current page. */
  const onToggleAll = useCallback((ids: string[], next: boolean) => {
    setSelectedIds((prev) => {
      const updated = new Set(prev);
      for (const id of ids) {
        if (next) updated.add(id);
        else updated.delete(id);
      }
      return updated;
    });
  }, []);

  const easyViewBankSlipSourceRow = useMemo(() => {
    if (!easyViewBankSlipRowId) return undefined;
    return enrichedBills.find((x) => x.id === easyViewBankSlipRowId);
  }, [easyViewBankSlipRowId, enrichedBills]);

  const easyViewBankSlipPayload = useMemo(() => {
    if (!easyViewBankSlipSourceRow) return null;
    return getBankSlipDetailsForRow(easyViewBankSlipSourceRow);
  }, [easyViewBankSlipSourceRow]);

  const easyViewBankSlipReadOnly =
    easyViewBankSlipSourceRow != null &&
    (easyViewBankSlipSourceRow.status === "Voided" || easyViewBankSlipSourceRow.status === "Draft");

  const selectionContainsPaid = useMemo(
    () => activeSelectedRows.some((row) => row.status === "Paid" || row.status === "Partially Paid"),
    [activeSelectedRows],
  );

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed === "") {
      setDebouncedSearch("");
      return;
    }
    const id = window.setTimeout(() => setDebouncedSearch(trimmed), 300);
    return () => window.clearTimeout(id);
  }, [searchQuery]);

  /** Editing the query drops back to "contains" — including the native × clear, which fires onChange(""). */
  const onSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setSearchMode("contains");
  }, []);

  /**
   * Submitting the search box (Enter, or the Search key on a phone keyboard) narrows
   * to an exact match and commits the query straight away rather than waiting out the
   * 300 ms debounce. A timer already in flight writes the same trimmed value after,
   * so the two can't disagree.
   */
  const onSearchSubmit = useCallback(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    setDebouncedSearch(trimmed);
    setSearchMode("exact");
  }, [searchQuery]);

  /**
   * Monotonic token so only the most recent loadBills may commit state. An
   * older, slower call must not overwrite a fresher list — that race made voided
   * rows flicker out of the Voided filter when calls overlapped.
   */
  const loadSeqRef = useRef(0);

  const loadBills = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setLoadError(null);
    setDatasetComplete(false);
    // Invalidate cached bank-slip counts without clearing them, so the Bank Slip
    // column keeps showing stale-but-correct values while the list reloads.
    setEnrichEpoch((e) => e + 1);
    try {
      // Only push status to the server when exactly one is selected. For 0 or 2+
      // we omit the param and let the client-side filter narrow the rows.
      const apiStatus =
        statusFilters.length === 1 ? STATUS_LABEL_TO_API[statusFilters[0]!] : undefined;
      // Search and the date range are applied client-side — search because it also
      // matches invoice totals, which the server's `search` does not, and dates so the
      // comparison agrees with the Hong Kong date shown in the column.
      const baseParams = {
        ...(apiStatus ? { status: apiStatus } : {}),
        ...(parseAmount(minAmount) !== null ? { amount_min: parseAmount(minAmount)! } : {}),
        ...(parseAmount(maxAmount) !== null ? { amount_max: parseAmount(maxAmount)! } : {}),
      };

      const all: BillListItem[] = [];
      const seenIds = new Set<string>();
      let truncated = false;

      // The list endpoint returns a bare array with no count envelope, so the whole
      // set is walked here and paged/sorted/searched in the browser.
      for (let pageNum = 1; ; pageNum += 1) {
        const chunk = await fetchBills({ ...baseParams, page: pageNum, page_size: FETCH_PAGE_SIZE });
        // A newer loadBills started while we were fetching — discard this stale
        // response so it can't overwrite the fresher list.
        if (seq !== loadSeqRef.current) return;
        if (chunk.length === 0) break;

        let added = 0;
        for (const b of chunk) {
          if (seenIds.has(b.id)) continue;
          seenIds.add(b.id);
          all.push(b);
          added += 1;
        }

        // Commit progressively so the first page paints without waiting on the rest.
        setRawBills([...all]);
        setBills(all.map((b) => mapBillToRow(b, entityCurrency)));
        if (pageNum === 1) setLoading(false);

        // A backend that ignores `page` returns the same rows forever — stop rather
        // than looping to the cap.
        if (added === 0) break;
        if (chunk.length < FETCH_PAGE_SIZE) break;
        if (all.length >= MAX_FETCHED_ROWS) {
          truncated = true;
          break;
        }
      }

      if (seq !== loadSeqRef.current) return;
      setRawBills(all);
      setBills(all.map((b) => mapBillToRow(b, entityCurrency)));
      setDatasetTruncated(truncated);
      setDatasetComplete(true);
    } catch (err) {
      if (seq === loadSeqRef.current) {
        setLoadError(err instanceof ApiError ? err.message : "Your payments didn't come through. Mind trying again?");
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
    // No date deps: the range is applied client-side, so changing it filters the rows
    // already in memory instead of refetching the whole list.
  }, [statusFilters, minAmount, maxAmount, entityCurrency]);

  /** Rows on screen in either view — the only ones worth enriching. */
  const enrichTargets = useMemo(() => {
    const byId = new Map<string, PaymentRequestRow>();
    for (const r of [...tablePageRows, ...easyPageRows]) {
      if (!byId.has(r.id)) byId.set(r.id, r);
    }
    return [...byId.values()];
  }, [tablePageRows, easyPageRows]);

  const enrichTargetsKey = useMemo(
    () => enrichTargets.map((r) => r.id).sort().join(","),
    [enrichTargets],
  );

  const enrichTargetsRef = useRef<PaymentRequestRow[]>([]);
  const enrichmentRef = useRef(enrichmentById);
  useEffect(() => {
    enrichTargetsRef.current = enrichTargets;
  }, [enrichTargets]);
  useEffect(() => {
    enrichmentRef.current = enrichmentById;
  }, [enrichmentById]);

  const enrichSeqRef = useRef(0);

  /**
   * Bank-slip counts cost one request per bill, so only the visible page is
   * enriched. Results are cached by bill id, making a revisit free; `enrichEpoch`
   * is what forces a refetch after a mutation.
   */
  useEffect(() => {
    const pending = enrichTargetsRef.current.filter(
      (r) => (enrichmentRef.current.get(r.id)?.epoch ?? -1) < enrichEpoch,
    );
    if (pending.length === 0) return;
    const seq = ++enrichSeqRef.current;
    let cancelled = false;

    (async () => {
      for (let i = 0; i < pending.length; i += ENRICH_BATCH) {
        const batch = pending.slice(i, i + ENRICH_BATCH);
        const chunk = await Promise.all(
          batch.map(async (r) => ({
            id: r.id,
            value: await fetchBillBankSlipEnrichment(r.id, {
              contactTitle: r.contactTitle,
              submittedDate: r.submittedDate,
              invoiceDate: r.invoiceDate,
              paidDate: r.paidDate,
              unpaidAmount: r.unpaidAmount,
              currencyCode: r.currencyCode,
            }),
          })),
        );
        if (cancelled || seq !== enrichSeqRef.current) return;
        setEnrichmentById((prev) => {
          const next = new Map(prev);
          for (const { id, value } of chunk) next.set(id, { epoch: enrichEpoch, value });
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enrichTargetsKey, enrichEpoch]);

  /**
   * Optimistically drop bills from local state so a void/delete disappears
   * instantly, without waiting for the void call + full `loadBills` refetch
   * round trips. `loadBills` still runs afterwards to reconcile with the
   * server (and would restore a row if the void actually failed).
   */
  const removeBillsLocally = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setRawBills((prev) => prev.filter((b) => !idSet.has(b.id)));
    setBills((prev) => prev.filter((r) => !idSet.has(r.id)));
  }, []);

  const easyViewPaySource = useMemo(() => {
    if (!easyViewPayBillId) return null;
    return rawBills.find((b) => b.id === easyViewPayBillId) ?? null;
  }, [easyViewPayBillId, rawBills]);

  const easyViewPayPanel: ReactNode =
    easyViewPayBillId && easyViewPaySource ? (
      <RecordPaymentModal
        key={easyViewPayBillId}
        presentation="easyInline"
        open
        onClose={() => {
          setEasyViewPayBillId(null);
          setEasyViewPayReadOnly(false);
          setEasyViewSelectedBillId(null);
        }}
        billId={easyViewPayBillId}
        billStatus={easyViewPaySource.status}
        contactTitle={easyViewPaySource.contact?.trim() ?? ""}
        readOnly={isViewOnly || easyViewPayReadOnly}
        invoiceAmount={parseFloat(easyViewPaySource.amount ?? "0") || 0}
        description={easyViewPayBill?.description ?? ""}
        onPaymentSaved={loadBills}
      />
    ) : null;

  useEffect(() => {
    if (!easyViewPayBillId) return;
    if (!filteredBills.some((r) => r.id === easyViewPayBillId)) {
      setEasyViewPayBillId(null);
      setEasyViewPayReadOnly(false);
    }
  }, [filteredBills, easyViewPayBillId]);

  useEffect(() => {
    if (!easyViewDraftBillId) return;
    if (!filteredBills.some((r) => r.id === easyViewDraftBillId)) {
      setEasyViewDraftBillId(null);
    }
  }, [filteredBills, easyViewDraftBillId]);

  useEffect(() => {
    if (!easyViewDraftBillId) setEasyViewDraftDeleteOpen(false);
  }, [easyViewDraftBillId]);

  useEffect(() => {
    if (!easyViewPayBillId) {
      setEasyViewPayBill(null);
      return;
    }

    const fetchBillDetail = async () => {
    try {
      const bill = await fetchBill(easyViewPayBillId);
      setEasyViewPayBill(bill);
    } catch (e) {
      console.error("Failed to fetch bill for easy view modal:", e);
    }
  };

  fetchBillDetail();
}, [easyViewPayBillId]);


  const easyViewDraftDetailActions = useMemo<EasyViewDraftDetailActions>(
    () => ({
      onRequestDelete: () => setEasyViewDraftDeleteOpen(true),
      deleteDisabled: loading || isViewOnly || !isElevated || easyViewDraftDeletePending,
    }),
    [easyViewDraftDeletePending, loading, isViewOnly, isElevated],
  );

  useEffect(() => {
    if (!easyViewSelectedBillId) {
      setEasyViewInvoiceAttachments([]);
      setEasyViewInvoiceLoading(false);
      return;
    }
    let cancelled = false;
    setEasyViewInvoiceLoading(true);
    fetchBill(easyViewSelectedBillId)
      .then((detail) => {
        if (cancelled) return;
        setEasyViewInvoiceAttachments(mapBillAttachmentsToPreviewItems(detail.id, detail.attachments ?? []));
      })
      .catch(() => {
        if (!cancelled) setEasyViewInvoiceAttachments([]);
      })
      .finally(() => {
        if (!cancelled) setEasyViewInvoiceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [easyViewSelectedBillId]);

  useEffect(() => {
    if (!easyViewSelectedBillId) return;
    if (!filteredBills.some((r) => r.id === easyViewSelectedBillId)) {
      setEasyViewSelectedBillId(null);
    }
  }, [filteredBills, easyViewSelectedBillId]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  /**
   * Drop ids that vanished from the dataset or turned Voided. Keyed on the whole
   * list, never the page slice — selection has to survive paging — and skipped
   * until the fetch-all loop finishes, or a partial list would prune selections
   * whose rows simply have not been re-fetched yet.
   */
  useEffect(() => {
    if (!datasetComplete) return;
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(
        [...prev].filter((id) => {
          const r = bills.find((x) => x.id === id);
          return r != null && r.status !== "Voided";
        }),
      );
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [bills, datasetComplete]);

  /** Changing the status filter resets selection, both sorts and the page. */
  useEffect(() => {
    setSelectedIds(new Set());
    setTableSort({ key: "status", dir: "asc" });
    setEasySort({ key: "status", dir: "asc" });
  }, [statusFilterKey]);

  /** Any change to what the list contains sends the user back to page 1. */
  useEffect(() => {
    setPage(1);
  }, [statusFilterKey, debouncedSearch, searchMode, minAmount, maxAmount, dateType, startDate, endDate, xeroStatus]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const onTableSortColumn = useCallback((key: SortKey) => {
    setTableSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  }, []);

  const onEasySortChange = useCallback((key: EasyViewSortKey) => {
    setEasySort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  }, []);

  const onPageSizeChange = useCallback((next: number) => {
    setPageSize(next);
    setPage(1);
  }, []);

  useEffect(() => {
    if (bulkDeleteModalOpen && activeSelectedIds.length < 2 && !bulkDeletePending) {
      setBulkDeleteModalOpen(false);
    }
  }, [bulkDeleteModalOpen, bulkDeletePending, activeSelectedIds.length]);

  const openBulkDeleteModal = useCallback(() => {
    if (activeSelectedIds.length < 2) return;
    setBulkDeleteModalOpen(true);
  }, [activeSelectedIds.length]);

  const executeBulkDelete = useCallback(async () => {
    if (activeSelectedIds.length < 2) return;
    setBulkDeletePending(true);
    try {
      await Promise.all(activeSelectedIds.map((id) => deleteBill(id)));
      removeBillsLocally(activeSelectedIds);
      await loadBills();
      setSelectedIds(new Set());
      setBulkDeleteModalOpen(false);
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Those payments are being a bit stubborn. Mind trying again?",
        "error",
      );
    } finally {
      setBulkDeletePending(false);
    }
  }, [activeSelectedIds, loadBills, removeBillsLocally, showToast]);

  const runBulkPublishSelected = useCallback(async () => {
    if (activeSelectedIds.length < 2) return;
    try {
      await Promise.all(activeSelectedIds.map((id) => publishBill(id)));
      await loadBills();
      setSelectedIds(new Set());
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Those payments didn't quite make it over. Mind trying again?",
        "error",
      );
    }
  }, [activeSelectedIds, loadBills, showToast]);

  /** A deliberate narrowing of the list: search or the filter panel. */
  const hasActiveFilters =
    debouncedSearch !== "" ||
    minAmount !== "" ||
    maxAmount !== "" ||
    startDate !== "" ||
    endDate !== "" ||
    xeroStatus !== "";

  /**
   * Status pills that are worth totalling. All (no pill) is the default view and Draft
   * holds bills that were never submitted, so neither opens with a total; every other
   * status does. A mixed selection counts as soon as one non-Draft status is in it.
   */
  const statusWorthTotalling = statusFilters.some((s) => s !== "Draft");

  // Hidden on a plain, unfiltered list — it only earns its space once the user has
  // narrowed the list or picked rows. Built once and handed to both branches so the
  // two copies can never disagree.
  const totalsBanner =
    activeSelectedRows.length > 0 || hasActiveFilters || statusWorthTotalling ? (
      <PaymentRequestTotalsBanner
        allRows={filteredBills}
        selectedRows={activeSelectedRows}
        startDate={startDate}
        endDate={endDate}
      />
    ) : null;

  const pagination = (
    <PaymentRequestPagination
      page={safePage}
      pageSize={pageSize}
      totalItems={totalItems}
      onPageChange={setPage}
      onPageSizeChange={onPageSizeChange}
      truncated={datasetTruncated}
    />
  );

  return (
    <>
      <PaymentRequestToolbar
        activeStatuses={statusFilters}
        onActiveStatusesChange={setStatusFilters}
        onBillCreated={loadBills}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onSearchSubmit={onSearchSubmit}
        bulkActionsEnabled={bulkActionsEnabled}
        bulkSelectedCount={activeSelectedIds.length}
        onBulkDeleteSelected={openBulkDeleteModal}
        onBulkPublishSelected={runBulkPublishSelected}
        appliedMinAmount={minAmount}
        appliedMaxAmount={maxAmount}
        appliedDateType={dateType}
        appliedStartDate={startDate}
        appliedEndDate={endDate}
        appliedXeroStatus={xeroStatus}
        onApplyFilters={(f) => {
          setMinAmount(f.minAmount ?? "");
          setMaxAmount(f.maxAmount ?? "");
          setDateType(f.dateType || DEFAULT_FILTER_DATE_TYPE);
          setStartDate(f.startDate ?? "");
          setEndDate(f.endDate ?? "");
          setXeroStatus(f.xeroStatus ?? "");
        }}
        selectionContainsPaid={selectionContainsPaid}
        canVoidPaid={isElevated}
        canPublish={isElevated}
      />
      {showReadOnlyBanner ? (
        <div
          role="status"
          aria-live="polite"
          className="mx-auto flex w-full max-w-[1920px] items-center gap-2 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 sm:px-6"
        >
          <span className="material-symbols-outlined shrink-0 text-[18px] leading-none text-amber-600" aria-hidden>
            visibility
          </span>
          <span>Read-only access — you are not a member of this entity.</span>
        </div>
      ) : null}
      <main
        className="mx-auto flex min-h-0 min-w-0 w-full max-w-[1920px] flex-1 flex-col overflow-x-hidden pt-2 sm:pt-3"
        data-easy-view={easyView ? "true" : undefined}
      >
        {loadError ? (
          <div className="px-4 py-8 text-center sm:px-6">
            <p className="text-sm text-red-600">{loadError}</p>
            <button type="button" onClick={loadBills} className="mt-2 text-sm font-medium text-secondary hover:underline">
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className={easyView ? "hidden min-h-0 flex-1 flex-col lg:flex" : "hidden"}>
              <PaymentRequestEasyView
                rows={easyPageRows}
                loading={loading}
                activeStatuses={statusFilters}
                sort={easySort}
                onSortChange={onEasySortChange}
                selectedIds={selectedIds}
                onToggleRow={onToggleRow}
                onToggleAll={onToggleAll}
                totalsBanner={totalsBanner}
                pagination={pagination}
                payPanelBillId={easyViewPayBillId}
                payPanel={easyViewPayPanel}
                selectedBillId={easyViewSelectedBillId}
                invoiceAttachments={easyViewInvoiceAttachments}
                invoiceAttachmentsLoading={easyViewInvoiceLoading}
                onRowClick={(rowId) => router.push(pages.request(rowId))}
                onPaymentRequestedPay={(rowId) => {
                  const isClosing = easyViewPayBillId === rowId;
                  setEasyViewPayReadOnly(false);
                  setEasyViewSelectedBillId(isClosing ? null : rowId);
                  setRecordPaymentTarget(null);
                  setEasyViewDraftDeleteOpen(false);
                  setEasyViewDraftBillId(null);
                  setEasyViewPayBillId(isClosing ? null : rowId);
                }}
                onPaidStatusOpen={(rowId) => {
                  const isSameRow = easyViewPayBillId === rowId;
                  const isClosing = isSameRow && easyViewPayReadOnly;
                  setRecordPaymentTarget(null);
                  setEasyViewDraftDeleteOpen(false);
                  setEasyViewDraftBillId(null);
                  setEasyViewSelectedBillId(isClosing ? null : rowId);
                  setEasyViewPayReadOnly(!isClosing);
                  setEasyViewPayBillId(isClosing ? null : rowId);
                }}
                onOpenBankSlipUpload={(rowId) => setEasyViewBankSlipRowId(rowId)}
                draftDetailBillId={easyViewDraftBillId}
                onDraftBillOpen={(rowId) => {
                  const isClosing = easyViewDraftBillId === rowId;
                  setRecordPaymentTarget(null);
                  setEasyViewDraftDeleteOpen(false);
                  setEasyViewPayBillId(null);
                  setEasyViewPayReadOnly(false);
                  setEasyViewSelectedBillId(isClosing ? null : rowId);
                  setEasyViewDraftBillId(isClosing ? null : rowId);
                }}
                onOutsideCloseRequested={() => {
                  setRecordPaymentTarget(null);
                  setEasyViewDraftDeleteOpen(false);
                  setEasyViewPayBillId(null);
                  setEasyViewPayReadOnly(false);
                  setEasyViewDraftBillId(null);
                  setEasyViewSelectedBillId(null);
                }}
                draftDetailActions={easyViewDraftDetailActions}
                isElevated={isElevated}
                isViewOnly={isViewOnly}
                onDraftBillSaved={loadBills}
                easyViewBillMutatePending={easyViewDraftDeletePending}
                onRowDelete={(rowId) => {
                  setEasyViewDraftBillId(rowId);
                  setEasyViewDraftDeleteOpen(true);
                }}
                easyViewDraftDeleteOpen={easyViewDraftDeleteOpen}
              />
            </div>
            <div className={easyView ? "max-lg:block lg:hidden" : "block"}>
              <PaymentRequestTable
                rows={tablePageRows}
                statusFilters={statusFilters}
                loading={loading}
                sort={tableSort}
                onSortColumn={onTableSortColumn}
                selectedIds={selectedIds}
                onToggleRow={onToggleRow}
                onToggleAll={onToggleAll}
                headerSlot={totalsBanner}
                onRecordPayment={(rowId, readOnly) => setRecordPaymentTarget({ billId: rowId, readOnly: readOnly ?? false })}
                onRowClick={(rowId) => router.push(pages.request(rowId))}
                onRowDelete={async (rowId) => {
                  try {
                    await deleteBill(rowId);
                    removeBillsLocally([rowId]);
                    await loadBills();
                  } catch (err) {
                    showToast(
                      err instanceof ApiError ? err.message : "This payment's being a bit stubborn. Mind trying again?",
                      "error",
                    );
                    await loadBills();
                    throw err;
                  }
                }}
                onRowPublish={async (rowId) => {
                  try {
                    await publishBill(rowId);
                    await loadBills();
                  } catch (err) {
                    showToast(
                      err instanceof ApiError ? err.message : "This payment didn't quite make it over. Mind trying again?",
                      "error",
                    );
                  }
                }}
                onRowRepublish={async (rowId) => {
                  // Same endpoint as publish - there is no separate republish
                  // route. This prop was declared and called by the row menu
                  // but never passed, so the menu item did nothing at all.
                  try {
                    await publishBill(rowId);
                    await loadBills();
                  } catch (err) {
                    // Republish is the path taken right after reconnecting
                    // Xero, so surface the reconnect hint the detail page
                    // already gives rather than a raw API message.
                    showToast(
                      isXeroAuthError(err)
                        ? XERO_RECONNECT_MESSAGE
                        : err instanceof ApiError
                          ? err.message
                          : "This payment didn't quite make it over. Mind trying again?",
                      "error",
                    );
                  }
                }}
                onBankSlipUploaded={loadBills}
              />
              <div className="px-4 pb-6 sm:px-6">{pagination}</div>
            </div>
          </>
        )}
      </main>
      <BulkDeleteConfirmModal
        open={bulkDeleteModalOpen}
        selectedCount={activeSelectedIds.length}
        pending={bulkDeletePending}
        onClose={() => {
          if (!bulkDeletePending) setBulkDeleteModalOpen(false);
        }}
        onConfirm={executeBulkDelete}
      />
      <RecordPaymentModal
        open={recordPaymentTarget != null}
        onClose={() => setRecordPaymentTarget(null)}
        billId={recordPaymentTarget?.billId ?? ""}
        billStatus={
          recordPaymentTarget ? rawBills.find((b) => b.id === recordPaymentTarget.billId)?.status : undefined
        }
        contactTitle={
          recordPaymentTarget
            ? rawBills.find((b) => b.id === recordPaymentTarget.billId)?.contact?.trim() ?? ""
            : ""
        }
        readOnly={isViewOnly || (recordPaymentTarget?.readOnly ?? false)}
        invoiceAmount={
          recordPaymentTarget
            ? parseFloat(rawBills.find((b) => b.id === recordPaymentTarget.billId)?.amount ?? "0")
            : 0
        }
        onPaymentSaved={loadBills}
      />
      <RowDeleteConfirmModal
        open={easyViewDraftDeleteOpen}
        contactTitle={bills.find((r) => r.id === easyViewDraftBillId)?.contactTitle ?? ""}
        isDraft={bills.find((r) => r.id === easyViewDraftBillId)?.status === "Draft"}
        pending={easyViewDraftDeletePending}
        onClose={() => {
          if (!easyViewDraftDeletePending) {
            setEasyViewDraftDeleteOpen(false);
            setEasyViewDraftBillId(null);
          }
        }}
        onConfirm={async () => {
          if (!easyViewDraftBillId) return;
          const row = bills.find((r) => r.id === easyViewDraftBillId);
          setEasyViewDraftDeletePending(true);
          try {
            if (row?.status === "Draft") {
              await deleteBill(easyViewDraftBillId);
            } else if (row?.status === "Returned") {
              await returnBill(easyViewDraftBillId, "void");
            } else {
              await deleteBill(easyViewDraftBillId);
            }
            removeBillsLocally([easyViewDraftBillId]);
            setEasyViewDraftDeleteOpen(false);
            setEasyViewDraftBillId(null);
            await loadBills();
          } catch (err) {
            showToast(
              err instanceof ApiError ? err.message : "That didn't quite work. Mind trying again?",
              "error",
            );
          } finally {
            setEasyViewDraftDeletePending(false);
          }
        }}
      />
      {easyViewBankSlipRowId != null && easyViewBankSlipPayload ? (
        <BankSlipDetailsModal
          open
          onClose={() => setEasyViewBankSlipRowId(null)}
          details={easyViewBankSlipPayload}
          allowRemoveFiles={!easyViewBankSlipReadOnly}
          onBankSlipFileDeleted={loadBills}
          inlineUploadBillContext={
            !easyViewBankSlipReadOnly && easyViewBankSlipRowId
              ? { billId: easyViewBankSlipRowId }
              : undefined
          }
          onInlineUploadSuccess={loadBills}
        />
      ) : null}
    </>
  );
}
