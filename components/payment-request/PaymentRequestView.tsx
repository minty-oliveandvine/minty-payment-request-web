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
import { PaymentRequestAttentionStrip, type AttentionTile } from "./PaymentRequestAttentionStrip";
import { BulkDeleteConfirmModal } from "./BulkDeleteConfirmModal";
import { RecordPaymentDrawer } from "./RecordPaymentDrawer";
import { billStatusToDisplayLabel } from "@/lib/billStatusDisplay";
import {
  deleteBill,
  fetchBills,
  isXeroAuthError,
  ApiError,
  publishBill,
  XERO_RECONNECT_MESSAGE,
  type BillListItem,
} from "@/lib/api";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Button } from "@/components/ui/Button";
import { useEntityCurrency } from "@/lib/entityCurrency";
import { formatAmount, formatMoney, parseAmount } from "@minty/shared/money";
import { fetchBillBankSlipEnrichment, type BankSlipEnrichment } from "@/lib/bankSlipEnrichment";
import { HK_TIME_ZONE, formatDay, isoDateInTimeZone } from "@minty/shared/dates";
import { getAuth } from "@/lib/auth";
import { compareRows, type SortKey } from "@/lib/paymentRequestRowSort";
import { rowMatchesSearch, type SearchMode } from "@/lib/paymentRequestSearch";
import {
  billingToday,
  computeAttention,
  rowMatchesDueFilter,
  type DueFilter,
  type PaymentRequestAttention,
} from "@/lib/paymentRequestAttention";
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
  return isoDateInTimeZone(HK_TIME_ZONE, d);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const iso = toBillingIsoDate(dateStr);
  return iso ? formatDay(iso) || dateStr : dateStr;
}

function mapBillToRow(bill: BillListItem, entityCurrency = ""): PaymentRequestRow {
  const status = billStatusToDisplayLabel(bill.status);
  // Currency displays ALWAYS use the entity's selected currency
  // (entities.currency_id -> iso_code) — never the bill's stored code and
  // never a hardcoded default. Blank until the registry lookup resolves.
  const iso = entityCurrency;
  const statusNorm = (bill.status ?? "").trim().toLowerCase().replace(/-/g, "_");
  const xeroActive =
    (bill.published ?? "").trim() === "published" ||
    statusNorm === "authorised" ||
    statusNorm === "authorized";

  return {
    id: bill.id,
    reference: bill.reference,
    contactTitle: bill.contact || "—",
    contactCaption: bill.description,
    currencyCode: iso,
    invoiceDate: bill.invoice_date ? formatDate(bill.invoice_date) : "",
    invoiceDateIso: bill.invoice_date ? toBillingIsoDate(bill.invoice_date) : "",
    dueDateIso: bill.due_date ? toBillingIsoDate(bill.due_date) : "",
    status,
    submittedDate: formatDate(bill.created_at),
    submittedDateIso: toBillingIsoDate(bill.created_at),
    // No usable amount_due reads as nothing owed: "HKD 0.00", or "0.00" with no currency yet.
    unpaidAmount: formatMoney(bill.amount_due, iso) || formatMoney(0, iso),
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

export type PaymentRequestViewProps = {
  /** Easy view (record rows) or Table view - the choice applies from 768px; a phone always gets rows. */
  easyView: boolean;
  onEasyViewChange?: (next: boolean) => void;
  /** First use's one action (the page header's "Add payment request"), repeated in the empty state. */
  createAction?: ReactNode;
};

export function PaymentRequestView({ easyView, onEasyViewChange, createAction }: PaymentRequestViewProps) {
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
  /** The Overdue / Due in 7 days tiles' filter - client-side, like search and dates. */
  const [dueFilter, setDueFilter] = useState<DueFilter | null>(null);
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
  /** The Record payment Drawer's request (D15-11), from either view; `readOnly` = View payments. */
  const [recordPaymentTarget, setRecordPaymentTarget] = useState<{ billId: string; readOnly: boolean } | null>(null);
  /** An action that failed (void, publish), shown above the list - never a toast (Part 14). */
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [easyViewBankSlipRowId, setEasyViewBankSlipRowId] = useState<string | null>(null);
  // Each view keeps its own sort (the table exposes 6 keys, easy view 4), but both
  // live here because the page slice has to be taken *after* sorting.
  const [tableSort, setTableSort] = useState<{ key: SortKey | null; dir: "asc" | "desc" }>({ key: "status", dir: "asc" });
  const [easySort, setEasySort] = useState<{ key: EasyViewSortKey; dir: "asc" | "desc" }>({ key: "status", dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  // Bank-slip counts, keyed by bill id and stamped with the load that produced them.
  const [enrichmentById, setEnrichmentById] = useState<Map<string, EnrichmentEntry>>(() => new Map());
  const [enrichEpoch, setEnrichEpoch] = useState(0);
  /** A failed bank slip lookup's Retry: re-reads the counts of the rows on screen. */
  const retryBankSlips = useCallback(() => setEnrichEpoch((e) => e + 1), []);

  const statusFilterKey = statusFilters.join("|");
  /** Today in the billing timezone, re-read with every load so a page left open rolls over. */
  const [todayIso, setTodayIso] = useState(billingToday);

  /** Bank-slip counts merged onto the rows, so every consumer sees enriched data. */
  const enrichedBills = useMemo(
    () =>
      bills.map((r) => {
        const entry = enrichmentById.get(r.id);
        const e = entry?.value;
        // No count yet, or the lookup failed: unknown is not zero, so the row offers no upload.
        if (!e) return { ...r, bankslipState: "loading" as const };
        if (e.failed) {
          return { ...r, bankslipState: entry.epoch < enrichEpoch ? ("loading" as const) : ("error" as const) };
        }
        return {
          ...r,
          bankslipFileCount: e.bankslipFileCount,
          ...(e.bankSlipDetails ? { bankSlipDetails: e.bankSlipDetails } : {}),
        };
      }),
    [bills, enrichmentById, enrichEpoch],
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
    if (dueFilter) result = result.filter((r) => rowMatchesDueFilter(r, dueFilter, todayIso));
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
  }, [enrichedBills, xeroStatus, statusFilters, debouncedSearch, searchMode, dueFilter, todayIso, dateType, startDate, endDate]);

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
    setTodayIso(billingToday());
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

  const recordPaymentSource = useMemo(
    () => (recordPaymentTarget ? rawBills.find((b) => b.id === recordPaymentTarget.billId) ?? null : null),
    [recordPaymentTarget, rawBills],
  );

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
  }, [statusFilterKey, debouncedSearch, searchMode, dueFilter, minAmount, maxAmount, dateType, startDate, endDate, xeroStatus]);

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
      setActionError(
        err instanceof ApiError ? err.message : "Those payment requests weren't voided. Try again.",
      );
    } finally {
      setBulkDeletePending(false);
    }
  }, [activeSelectedIds, loadBills, removeBillsLocally]);

  const runBulkPublishSelected = useCallback(async () => {
    if (activeSelectedIds.length < 2) return;
    setActionError(null);
    try {
      await Promise.all(activeSelectedIds.map((id) => publishBill(id)));
      await loadBills();
      setSelectedIds(new Set());
      showToast(`${activeSelectedIds.length} payment requests published to Xero.`, "success");
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Those payment requests didn't reach Xero. Try publishing again.",
      );
    }
  }, [activeSelectedIds, loadBills, showToast]);

  /** Each status's live count, for its filter chip (Part 15.17: chips with live counts). */
  const statusCounts = useMemo(() => {
    const counts: Partial<Record<string, number>> = { All: 0 };
    for (const r of enrichedBills) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      if (r.status !== "Voided") counts.All = (counts.All ?? 0) + 1;
    }
    return counts;
  }, [enrichedBills]);
  /** What needs attention (the strip above the list), from the same rows as the chip counts. */
  const liveAttention = useMemo(() => computeAttention(bills, todayIso), [bills, todayIso]);
  // One chip on its own is fetched server-side (only that status comes back), so its counts would
  // read 0 for every other chip: keep the counts from the last whole-list load instead. The
  // attention figures follow the same rule.
  const [chipCounts, setChipCounts] = useState<Partial<Record<string, number>> | null>(null);
  const [attention, setAttention] = useState<PaymentRequestAttention | null>(null);
  useEffect(() => {
    if (statusFilters.length !== 1 && datasetComplete) {
      setChipCounts(statusCounts);
      setAttention(liveAttention);
    }
  }, [statusFilters.length, datasetComplete, statusCounts, liveAttention]);

  /** The tile whose filter is on: a due filter, or Returned as the only status chip. */
  const activeTile: AttentionTile | null = dueFilter
    ? dueFilter
    : statusFilters.length === 1 && statusFilters[0] === "Returned"
      ? "returned"
      : null;

  /** A tile toggles its own filter, replacing the other tiles' (the chips stay usable as ever). */
  const onAttentionSelect = useCallback(
    (tile: AttentionTile) => {
      if (tile === activeTile) {
        if (tile === "returned") setStatusFilters([]);
        else setDueFilter(null);
        return;
      }
      if (tile === "returned") {
        setDueFilter(null);
        setStatusFilters(["Returned"]);
      } else {
        setDueFilter(tile);
        // Keep the same array when no chip is on: a new one would refetch the whole list.
        setStatusFilters((prev) => (prev.length > 0 ? [] : prev));
      }
    },
    [activeTile],
  );

  const clearFilters = useCallback(() => {
    setStatusFilters([]);
    setSearchQuery("");
    setDebouncedSearch("");
    setSearchMode("contains");
    setMinAmount("");
    setMaxAmount("");
    setDateType(DEFAULT_FILTER_DATE_TYPE);
    setStartDate("");
    setEndDate("");
    setXeroStatus("");
    setDueFilter(null);
  }, []);

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
  // narrowed the list or picked rows. It sits under the attention strip, once for both views.
  // A due tile on its own does not open it: the tile already shows that unpaid total.
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

  const recordPayment = useCallback(
    (rowId: string, readOnly?: boolean) => setRecordPaymentTarget({ billId: rowId, readOnly: readOnly ?? false }),
    [],
  );

  return (
    <>
      {loadError ? null : (
        <div className="mx-auto mb-4 w-full min-w-0 max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <PaymentRequestAttentionStrip
            attention={attention}
            active={activeTile}
            onSelect={onAttentionSelect}
            supporting={totalsBanner}
          />
        </div>
      )}
      <PaymentRequestToolbar
        activeStatuses={statusFilters}
        onActiveStatusesChange={setStatusFilters}
        statusCounts={chipCounts ?? undefined}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onSearchSubmit={onSearchSubmit}
        easyView={easyView}
        onEasyViewChange={onEasyViewChange}
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
      <main
        className="mx-auto flex min-h-0 min-w-0 w-full max-w-[1200px] flex-1 flex-col overflow-x-hidden pt-4"
        data-easy-view={easyView ? "true" : undefined}
      >
        {showReadOnlyBanner || actionError ? (
          <div className="mx-auto mb-4 flex w-full max-w-[1200px] flex-col gap-2 px-4 sm:px-6 lg:px-8">
            {showReadOnlyBanner ? (
              <InlineAlert tone="info">Read-only access — you are not a member of this entity.</InlineAlert>
            ) : null}
            {actionError ? <InlineAlert tone="danger">{actionError}</InlineAlert> : null}
          </div>
        ) : null}
        {loadError ? (
          // Part 15.17: a load error is an Inline alert in place of the rows, with Retry.
          <div className="mx-auto w-full max-w-[960px] px-4 sm:px-6 lg:px-8">
            <InlineAlert
              tone="danger"
              title={loadError}
              action={
                <Button kind="link" onClick={loadBills}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {/* Easy view on a computer by choice; a phone ALWAYS gets the rows - Table view is
                hidden below 768px (Part 15.17, D15-18). */}
            <div className={easyView ? "flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-1 flex-col md:hidden"}>
              <PaymentRequestEasyView
                rows={easyPageRows}
                loading={loading}
                sort={easySort}
                onSortChange={onEasySortChange}
                selectedIds={selectedIds}
                onToggleRow={onToggleRow}
                onToggleAll={onToggleAll}
                todayIso={todayIso}
                pagination={pagination}
                onRecordPayment={recordPayment}
                onOpenBankSlipUpload={(rowId) => setEasyViewBankSlipRowId(rowId)}
                onRetryBankSlips={retryBankSlips}
                isElevated={isElevated}
                isViewOnly={isViewOnly}
                filtered={hasActiveFilters || statusFilters.length > 0 || dueFilter !== null}
                onClearFilters={clearFilters}
                createAction={createAction}
              />
            </div>
            <div className={easyView ? "hidden" : "hidden md:block"}>
              <PaymentRequestTable
                rows={tablePageRows}
                statusFilters={statusFilters}
                loading={loading}
                sort={tableSort}
                onSortColumn={onTableSortColumn}
                selectedIds={selectedIds}
                onToggleRow={onToggleRow}
                onToggleAll={onToggleAll}
                todayIso={todayIso}
                onRecordPayment={recordPayment}
                onRowClick={(rowId, reference, status) => router.push(pages.request(rowId, reference, status))}
                onRowDelete={async (rowId) => {
                  setActionError(null);
                  try {
                    await deleteBill(rowId);
                    removeBillsLocally([rowId]);
                    await loadBills();
                  } catch (err) {
                    setActionError(err instanceof ApiError ? err.message : "That payment request wasn't voided. Try again.");
                    await loadBills();
                    throw err;
                  }
                }}
                onRowPublish={async (rowId) => {
                  setActionError(null);
                  try {
                    await publishBill(rowId);
                    await loadBills();
                  } catch (err) {
                    setActionError(
                      err instanceof ApiError ? err.message : "That payment request didn't reach Xero. Try publishing again.",
                    );
                  }
                }}
                onRowRepublish={async (rowId) => {
                  // Same endpoint as publish - there is no separate republish route.
                  setActionError(null);
                  try {
                    await publishBill(rowId);
                    await loadBills();
                  } catch (err) {
                    // Republish is the path taken right after reconnecting Xero, so surface the
                    // reconnect hint the detail page already gives rather than a raw API message.
                    setActionError(
                      isXeroAuthError(err)
                        ? XERO_RECONNECT_MESSAGE
                        : err instanceof ApiError
                          ? err.message
                          : "That payment request didn't reach Xero. Try publishing again.",
                    );
                  }
                }}
                onBankSlipUploaded={loadBills}
                onRetryBankSlips={retryBankSlips}
              />
              <div className="px-4 pb-6 sm:px-6 lg:px-8">{pagination}</div>
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
      <RecordPaymentDrawer
        key={recordPaymentTarget?.billId ?? "none"}
        open={recordPaymentTarget != null}
        onClose={() => setRecordPaymentTarget(null)}
        billId={recordPaymentTarget?.billId ?? ""}
        billStatus={recordPaymentSource?.status}
        contactTitle={recordPaymentSource?.contact?.trim() ?? ""}
        description={recordPaymentSource?.description ?? ""}
        readOnly={isViewOnly || (recordPaymentTarget?.readOnly ?? false)}
        invoiceAmount={parseFloat(recordPaymentSource?.amount ?? "0") || 0}
        onPaymentSaved={loadBills}
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
