"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { InvoiceAttachmentPreview, type InvoiceAttachmentPreviewItem } from "./InvoiceAttachmentPreview";
import { type EasyViewDraftDetailActions } from "./EasyViewDraftDetailedInformation";
import { EasyViewDraftDetailBody, EasyViewReadonlyBillDetailBody } from "./EasyViewDraftDetailBody";
import { useEntityCurrency } from "@/lib/entityCurrency";
import { statusDisplayBadgeClass } from "@/lib/billStatusDisplay";
import { type SortKey } from "@/lib/paymentRequestRowSort";
import { HEADER_CHECKBOX_CLASS } from "./paymentRequestCheckboxClasses";
import type { PaymentRequestRow } from "./PaymentRequestTable";
import type { PaymentRequestStatusFilter } from "./PaymentRequestToolbar";
import { useCompanyPages } from "@/lib/useCompanyPages";

const EASY_VIEW_STATUS_CELL =
  "box-border inline-flex w-full min-w-0 max-w-full items-center justify-center rounded-lg px-2.5 py-1 text-sm font-semibold sm:px-3 sm:py-0 lg:h-[42px] lg:min-h-[42px] lg:text-sm";

const EASY_VIEW_TD_BASE = "px-4 py-3 text-sm text-primary sm:px-5 sm:py-3.5";

const easyViewContactTd = `${EASY_VIEW_TD_BASE} align-middle min-w-0`;
const easyViewSubmittedTd = `${EASY_VIEW_TD_BASE} align-middle whitespace-nowrap tabular-nums text-center`;
const easyViewUnpaidTd = `${EASY_VIEW_TD_BASE} align-middle tabular-nums min-w-0`;
const easyViewAttachmentTd = `${EASY_VIEW_TD_BASE} align-middle flex min-w-0 max-w-full flex-row flex-nowrap items-center justify-center gap-1.5 overflow-visible sm:gap-2`;
const easyViewStatusTd = `${EASY_VIEW_TD_BASE} align-middle min-w-0 max-w-full overflow-hidden`;
/**
 * Deliberately does NOT compose `EASY_VIEW_TD_BASE`: its `px-4 sm:px-5` would leave
 * no content width inside the 2.25rem checkbox track and collapse the input.
 */
const easyViewCheckboxTd = "flex items-center justify-center py-3 sm:py-3.5";
/**
 * Mirrors a header label cell’s box so the checkbox lands on their line: 28px of content
 * (their `size-7` sort chevrons) plus `py-3 sm:py-3.5`. That `sm:` variant is emitted after
 * `EASY_VIEW_HEADER_CELL`’s base `pt-0 pb-0` and outranks it, so those cells are 56px tall,
 * not 28px. `box-content` keeps `h-7` as the content height rather than the total.
 */
const easyViewHeaderCheckboxTd =
  "flex h-7 box-content items-center justify-center py-3 sm:py-3.5 translate-y-[15px]";

/** For the **first** visible bill only: list scrolled this far from top — default invoice aside (no offset). */
const EASY_VIEW_INVOICE_SCROLL_TOP_DEFAULT_PX = 32;
/**
 * For the **first** visible bill only: row top this far below the list viewport top still counts
 * as "upper list" — default invoice offset and gentler scroll (bills below use full alignment).
 */
const EASY_VIEW_INVOICE_ROW_TOP_DEFAULT_PX = 160;

const EASY_VIEW_GRID_COLS =
  "md:grid-cols-[2.25rem_minmax(10rem,1.32fr)_minmax(10.5rem,1.15fr)_minmax(11rem,0.52fr)_minmax(8.5rem,0.9fr)_minmax(10rem,0.82fr)]";

const EASY_VIEW_ROW_GRID = `grid w-full min-w-0 grid-cols-1 gap-4 ${EASY_VIEW_GRID_COLS} md:gap-x-3 md:gap-y-0 md:items-center`;

const EASY_VIEW_HEADER_GRID = `mb-3 hidden min-w-0 md:grid ${EASY_VIEW_GRID_COLS} md:gap-x-3 md:items-end md:px-0`;

const EASY_VIEW_HEADER_CELL = "text-left text-xs font-medium text-[#656565] sm:text-sm pt-0 pb-0 translate-y-[15px]";

const EASY_VIEW_BANKSLIP_VOIDED_BTN =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent text-primary/40 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:gap-2";

const EASY_VIEW_BANKSLIP_DEFAULT_BTN =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent text-primary transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:gap-2";

/** Fixed-width area so rows without files still reserve space; partial icon stays column-aligned with rows that have a slip. */
const EASY_VIEW_BANKSLIP_SLOT =
  "flex h-10 w-24 shrink-0 items-center justify-center sm:h-[42px] sm:w-[6.5rem]";

/** Sortable columns exposed in easy view (same `compareRows` as the main table). */
export type EasyViewSortKey = Extract<SortKey, "contact" | "submittedDate" | "unpaidAmount" | "status">;

function EasyViewBankSlipControl({
  row,
  onOpen,
}: {
  row: PaymentRequestRow;
  onOpen: (billId: string) => void;
}) {
  const isVoided = row.status === "Voided";
  const isDraft = row.status === "Draft";
  const n = row.bankslipFileCount;

  if (n == null || n < 1) return null;

  const btnClass = isVoided ? EASY_VIEW_BANKSLIP_VOIDED_BTN : EASY_VIEW_BANKSLIP_DEFAULT_BTN;

  return (
    <button
      type="button"
      className={btnClass}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(row.id);
      }}
      aria-label={
        isVoided
          ? `View bank slip — voided, ${n} file${n === 1 ? "" : "s"}`
          : isDraft
            ? `View bank slip — draft, ${n} file${n === 1 ? "" : "s"}`
            : `View bank slip — ${n} file${n === 1 ? "" : "s"} uploaded`
      }
    >
      <span className="text-sm font-semibold tabular-nums text-inherit sm:text-base">{n}</span>
      <span className="material-symbols-outlined shrink-0 text-[20px] leading-none text-inherit sm:text-[22px]" aria-hidden>
        draft
      </span>
    </button>
  );
}

function unpaidAmountClass(status: string): string {
  if (status === "Paid") return "text-[#656565]";
  if (status === "Payment Requested") return "text-secondary";
  if (status === "Partially Paid") return "text-[#70ebba]";
  if (status === "Voided") return "text-[#FF6B6B]";
  if (status === "Draft") return "text-[#656565]";
  if (status === "Returned") return "text-[#EA9713]";
  return "text-[#C0C0C0]";
}

/** Main easy-view shell: short status tint at top (stops ~15%), then white (toolbar filter or row status labels). */
function easyViewMainBackgroundClass(status: string): string {
  switch (status) {
    case "Payment Requested":
      return "bg-gradient-to-b from-secondary/10 from-[0%] to-white to-[15%]";
    case "Partially Paid":
      return "bg-gradient-to-b from-[#70ebba]/10 from-[0%] to-white to-[15%]";
    case "Returned":
      return "bg-gradient-to-b from-[#EA9713]/10 from-[0%] to-white to-[15%]";
    case "Paid":
      return "bg-gradient-to-b from-gray-300/10 from-[0%] to-white to-[15%]";
    case "Voided":
      return "bg-gradient-to-b from-[#FF6B6B]/10 from-[0%] to-white to-[15%]";
    case "Draft":
      return "bg-gradient-to-b from-[#656565]/10 from-[0%] to-white to-[15%]";
    case "All":
      return "bg-gradient-to-b from-gray-200/10 from-[0%] to-white to-[15%]";
    default:
      return "bg-gradient-to-b from-gray-200/10 from-[0%] to-white to-[15%]";
  }
}

export type PaymentRequestEasyViewProps = {
  /** The current page slice — already filtered and sorted by `PaymentRequestView`. */
  rows: PaymentRequestRow[];
  loading: boolean;
  /**  Empty array = "All" (no filter). Drives the heading, tint and aside image. */
  activeStatuses: PaymentRequestStatusFilter[];
  /** Sort is owned by the parent so the page slice is taken after sorting. */
  sort: { key: EasyViewSortKey; dir: "asc" | "desc" };
  onSortChange: (key: EasyViewSortKey) => void;
  /** Selection is shared with the table view and spans pages. */
  selectedIds: ReadonlySet<string>;
  onToggleRow: (rowId: string) => void;
  onToggleAll: (rowIds: string[], next: boolean) => void;
  /** Rendered top-right above the list (the totals banner). */
  totalsBanner?: ReactNode;
  /** Rendered below the list, outside its scroll container. */
  pagination?: ReactNode;
  payPanelBillId: string | null;
  payPanel: ReactNode;
  /** When set, the right column shows invoice attachments for this bill (same preview as details page). */
  selectedBillId: string | null;
  invoiceAttachments: InvoiceAttachmentPreviewItem[];
  invoiceAttachmentsLoading: boolean;
  onRowClick: (rowId: string) => void;
  /** Opens the inline pay panel (Payment Requested) instead of the floating record-payment modal. */
  onPaymentRequestedPay: (rowId: string) => void;
  /** Opens inline payment history (read-only) for paid bills. */
  onPaidStatusOpen: (rowId: string) => void;
  onOpenBankSlipUpload: (rowId: string) => void;
  /** Inline draft row: same expand pattern as pay panel, but only detailed information. */
  draftDetailBillId: string | null;
  onDraftBillOpen: (rowId: string) => void;
  onOutsideCloseRequested?: () => void;
  draftDetailActions: EasyViewDraftDetailActions;
  isElevated: boolean;
  isViewOnly: boolean;
  /** After inline draft save, refresh list row data. */
  onDraftBillSaved?: () => void;
  /** True while delete/void from easy view is executing (disables void on paid/returned panel). */
  easyViewBillMutatePending?: boolean;
  onRequestVoid?: () => void;
  voidDisabled?: boolean;
  onRowDelete?: (rowId: string) => void;
  easyViewDraftDeleteOpen?: boolean;
};

function EasyViewStatusCell({
  row,
  isElevated,
  onPaymentRequestedPay,
  onPaidStatusOpen,
  onDraftBillOpen,
}: {
  row: PaymentRequestRow;
  isElevated: boolean;
  onPaymentRequestedPay: (rowId: string) => void;
  onPaidStatusOpen: (rowId: string) => void;
  onDraftBillOpen: (rowId: string) => void;
}) {
  const stop = (e: ReactMouseEvent) => { e.stopPropagation(); e.preventDefault(); };
  const statusHoverClass =
    "transition-[filter,box-shadow] hover:brightness-95 hover:shadow-sm active:brightness-90";

  if (row.status === "Voided") {
    return (
      <button
        type="button"
        className={`${statusDisplayBadgeClass("Voided")} ${statusHoverClass} box-border w-full min-w-0 max-w-full shrink-0 cursor-pointer whitespace-nowrap border-0 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary`}
        onClick={(e) => {
          stop(e);
          onDraftBillOpen(row.id);
        }}
        aria-label="Voided — show payment details"
      >
        Voided
      </button>
    );
  }
  if (row.status === "Returned") {
    return (
      <button
        type="button"
        className={`${statusDisplayBadgeClass("Returned")} ${statusHoverClass} box-border w-full min-w-0 max-w-full shrink-0 cursor-pointer whitespace-nowrap border-0 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary`}
        onClick={(e) => {
          stop(e);
          onDraftBillOpen(row.id);
        }}
        aria-label="Returned — show payment details"
      >
        Returned
      </button>
    );
  }
  if (row.status === "Draft") {
    return (
      <button
        type="button"
        className={`${statusDisplayBadgeClass("Draft")} ${statusHoverClass} box-border w-full min-w-0 max-w-full shrink-0 cursor-pointer whitespace-nowrap border-0 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary`}
        onClick={(e) => {
          stop(e);
          onDraftBillOpen(row.id);
        }}
        aria-label="Draft — show payment details"
      >
        Draft
      </button>
    );
  }
  if (row.status === "Paid") {
    return (
      <button
        type="button"
        className={`${statusDisplayBadgeClass("Paid")} ${statusHoverClass} box-border w-full min-w-0 max-w-full shrink-0 cursor-pointer whitespace-nowrap text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary`}
        onClick={(e) => {
          stop(e);
          onPaidStatusOpen(row.id);
        }}
        aria-label="View payments"
      >
        View payments
      </button>
    );
  }
  if (row.status === "Partially Paid") {
    return (
      <button
        type="button"
        className={`${statusDisplayBadgeClass("Partially Paid")} ${statusHoverClass} box-border w-full min-w-0 max-w-full shrink-0 cursor-pointer whitespace-nowrap border-0 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:hover:shadow-none`}
        onClick={(e) => {
          stop(e);
          if (!isElevated) return;
          onPaymentRequestedPay(row.id);
        }}
        disabled={!isElevated}
      >
        Partial
      </button>
    );
  }
  if (row.status === "Payment Requested") {
    return (
      <button
        type="button"
        className={`${EASY_VIEW_STATUS_CELL} ${statusHoverClass} cursor-pointer border border-transparent bg-secondary text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 disabled:hover:shadow-none`}
        onClick={(e) => {
          stop(e);
          if (!isElevated) return;
          onPaymentRequestedPay(row.id);
        }}
        disabled={!isElevated}
      >
        Pay
      </button>
    );
  }
  return (
    <span
      className={`${EASY_VIEW_STATUS_CELL} truncate font-medium text-primary/80`}
      title={row.status}
      onClick={stop}
    >
      {row.status}
    </span>
  );
}

function EasyViewSortChevronButton({
  sortDir,
  onToggle,
  ariaLabel,
  title,
  active,
}: {
  sortDir: "asc" | "desc";
  onToggle: () => void;
  ariaLabel: string;
  title: string;
  active: boolean;
}) {
  return (
    <button
      type="button"
      className={`inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded outline-none hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${active ? "" : "opacity-60"}`}
      aria-label={ariaLabel}
      title={title}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <span className="inline-flex size-5 items-center justify-center" aria-hidden>
        <span className="material-symbols-outlined block text-[18px] leading-none text-primary">
          {!active ? "expand_more" : sortDir === "asc" ? "expand_less" : "expand_more"}
        </span>
      </span>
    </button>
  );
}

export function PaymentRequestEasyView({
  rows,
  loading,
  activeStatuses,
  sort,
  onSortChange,
  selectedIds,
  onToggleRow,
  onToggleAll,
  totalsBanner,
  pagination,
  payPanelBillId,
  payPanel,
  selectedBillId,
  invoiceAttachments,
  invoiceAttachmentsLoading,
  onRowClick,
  onPaymentRequestedPay,
  onPaidStatusOpen,
  onOpenBankSlipUpload,
  draftDetailBillId,
  onDraftBillOpen,
  onOutsideCloseRequested,
  draftDetailActions,
  isElevated,
  isViewOnly,
  onDraftBillSaved,
  easyViewBillMutatePending = false,
  easyViewDraftDeleteOpen = false,
}: PaymentRequestEasyViewProps) {
  const pages = useCompanyPages();
  const entityCurrency = useEntityCurrency();
  const listScrollRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const [invoiceAsideOffsetY, setInvoiceAsideOffsetY] = useState(0);

  const activeStatusKey = activeStatuses.join("|");

  /** "Select all" means everything selectable on this page — selection spans pages. */
  const selectableRows = useMemo(() => rows.filter((r) => r.status !== "Voided"), [rows]);
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selectedIds.has(r.id));
  const someSelected = selectableRows.some((r) => selectedIds.has(r.id)) && !allSelected;

  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (el) el.indeterminate = someSelected;
  }, [someSelected]);

  const updateInvoiceAsideAlign = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setInvoiceAsideOffsetY(0);
      return;
    }
    if (!selectedBillId || !listScrollRef.current || !asideRef.current) {
      setInvoiceAsideOffsetY(0);
      return;
    }
    const escaped =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(selectedBillId)
        : String(selectedBillId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const row = listScrollRef.current.querySelector(`[data-easy-view-row="${escaped}"]`) as HTMLElement | null;
    if (!row) {
      setInvoiceAsideOffsetY(0);
      return;
    }
    const listEl = listScrollRef.current;
    const listRect = listEl.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const rowDistanceBelowListTop = rowRect.top - listRect.top;
    const firstVisibleId = rows[0]?.id;
    const isFirstVisibleBill = firstVisibleId != null && selectedBillId === firstVisibleId;
    if (
      isFirstVisibleBill &&
      (listEl.scrollTop <= EASY_VIEW_INVOICE_SCROLL_TOP_DEFAULT_PX ||
        rowDistanceBelowListTop <= EASY_VIEW_INVOICE_ROW_TOP_DEFAULT_PX)
    ) {
      setInvoiceAsideOffsetY(0);
      return;
    }
    const asideRect = asideRef.current.getBoundingClientRect();
    const y = rowRect.top - asideRect.top;
    setInvoiceAsideOffsetY(Math.max(0, Math.round(y)));
  }, [selectedBillId, rows]);

  /** Dim other rows only while inline pay or detailed information is expanded (not when only the invoice aside is focused). */
  const opacityFocusBillId = useMemo(() => {
    if (payPanelBillId != null && payPanel != null && rows.some((r) => r.id === payPanelBillId)) {
      return payPanelBillId;
    }
    if (draftDetailBillId != null && rows.some((r) => r.id === draftDetailBillId)) {
      return draftDetailBillId;
    }
    return null;
  }, [payPanelBillId, payPanel, draftDetailBillId, rows]);

  /** After row selection or opening inline pay / detail, scroll that bill card into view (avoid centering top rows — clips against the list edge). */
  useEffect(() => {
    const rowId = payPanelBillId ?? draftDetailBillId ?? selectedBillId;
    if (!rowId) return;
    const id = requestAnimationFrame(() => {
      const listEl = listScrollRef.current;
      if (!listEl) return;
      const escaped =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(rowId)
          : String(rowId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const el = listEl.querySelector(`[data-easy-view-row="${escaped}"]`) as HTMLElement | null;
      if (!el) return;
      const listRect = listEl.getBoundingClientRect();
      const rowRect = el.getBoundingClientRect();
      const rowDistanceBelowListTop = rowRect.top - listRect.top;
      const firstVisibleId = rows[0]?.id;
      const isFirstVisibleBill = firstVisibleId != null && rowId === firstVisibleId;
      const treatAsUpperList =
        isFirstVisibleBill &&
        (listEl.scrollTop <= EASY_VIEW_INVOICE_SCROLL_TOP_DEFAULT_PX ||
          rowDistanceBelowListTop <= EASY_VIEW_INVOICE_ROW_TOP_DEFAULT_PX);
      el.scrollIntoView({
        block: treatAsUpperList ? "nearest" : "center",
        behavior: "smooth",
        inline: "nearest",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedBillId, draftDetailBillId, payPanelBillId, rows, sort]);

  /** Large screens: shift invoice aside with marginTop so its block lines up with the selected row (aside scrolls if needed). */
  useLayoutEffect(() => {
    updateInvoiceAsideAlign();
    const listEl = listScrollRef.current;
    const asideEl = asideRef.current;
    if (!listEl) return;
    listEl.addEventListener("scroll", updateInvoiceAsideAlign, { passive: true });
    window.addEventListener("resize", updateInvoiceAsideAlign);
    const ro = new ResizeObserver(() => {
      updateInvoiceAsideAlign();
    });
    ro.observe(listEl);
    if (asideEl) ro.observe(asideEl);
    return () => {
      listEl.removeEventListener("scroll", updateInvoiceAsideAlign);
      window.removeEventListener("resize", updateInvoiceAsideAlign);
      ro.disconnect();
    };
  }, [
    updateInvoiceAsideAlign,
    rows.length,
    sort,
    invoiceAttachmentsLoading,
    invoiceAttachments.length,
    payPanelBillId,
    draftDetailBillId,
  ]);

  /** Prefer selected / pay-panel row so "All" + Pay row still gets the teal gradient. */
  const mainBackgroundClass = useMemo(() => {
    if (selectedBillId) {
      const row = rows.find((r) => r.id === selectedBillId);
      if (row?.status) return easyViewMainBackgroundClass(row.status);
    }
    if (payPanelBillId) {
      const row = rows.find((r) => r.id === payPanelBillId);
      if (row?.status) return easyViewMainBackgroundClass(row.status);
    }
    if (draftDetailBillId) {
      const row = rows.find((r) => r.id === draftDetailBillId);
      if (row?.status) return easyViewMainBackgroundClass(row.status);
    }
    // 0 statuses → "All"; exactly one → use that for tinting; multiple → neutral.
    const tintingStatus =
      activeStatuses.length === 0 ? "All" : activeStatuses.length === 1 ? activeStatuses[0]! : "All";
    return easyViewMainBackgroundClass(tintingStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBillId, payPanelBillId, draftDetailBillId, rows, activeStatusKey]);

  const easyViewAsideImageSrc =
    activeStatuses.length === 1 && activeStatuses[0] === "Payment Requested"
      ? "/unpaid.png"
      : "/all-cat.png";
  // Header label: 0 → "All"; 1 → that label; 2+ → "Multiple".
  const headerStatusLabel =
    activeStatuses.length === 0
      ? "All"
      : activeStatuses.length === 1
        ? activeStatuses[0]!
        : "Multiple";

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-0 px-4 pb-0 pt-0 sm:px-6 lg:flex-row lg:items-stretch lg:gap-4 lg:pt-2 ${mainBackgroundClass}`}
      onClick={(e) => {
        if (!onOutsideCloseRequested) return;
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (target.closest("[data-easy-view-row]")) return;
        onOutsideCloseRequested();
      }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[18px] font-semibold text-black" title={headerStatusLabel}>
            {headerStatusLabel}
          </span>
          {totalsBanner}
        </div>

        <div ref={listScrollRef} className="min-h-0 flex-1 overflow-auto">
          <div className="mb-2 flex flex-col gap-2 md:hidden">
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-primary">Supplier</span>
              <EasyViewSortChevronButton
                sortDir={sort.dir}
                active={sort.key === "contact"}
                onToggle={() => onSortChange("contact")}
                ariaLabel={`Sort by supplier${sort.key === "contact" ? (sort.dir === "asc" ? ", ascending" : ", descending") : ""}`}
                title="Sort A-Z"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-primary">Submitted date</span>
              <EasyViewSortChevronButton
                sortDir={sort.dir}
                active={sort.key === "submittedDate"}
                onToggle={() => onSortChange("submittedDate")}
                ariaLabel={`Sort by submitted date${sort.key === "submittedDate" ? (sort.dir === "asc" ? ", ascending" : ", descending") : ""}`}
                title="Sort Newest - Oldest"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-primary">Status</span>
              <EasyViewSortChevronButton
                sortDir={sort.dir}
                active={sort.key === "status"}
                onToggle={() => onSortChange("status")}
                ariaLabel={`Sort by status${sort.key === "status" ? (sort.dir === "asc" ? ", ascending" : ", descending") : ""}`}
                title="Sort Status"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-primary">Unpaid amount</span>
              <EasyViewSortChevronButton
                sortDir={sort.dir}
                active={sort.key === "unpaidAmount"}
                onToggle={() => onSortChange("unpaidAmount")}
                ariaLabel={`Sort by unpaid amount${sort.key === "unpaidAmount" ? (sort.dir === "asc" ? ", ascending" : ", descending") : ""}`}
                title="Sort Highest - Lowest"
              />
            </div>
          </div>
          {loading ? (
            <div className={EASY_VIEW_HEADER_GRID} aria-hidden>
              <div className={easyViewHeaderCheckboxTd}>
                <div className="h-4 w-4 shrink-0 rounded bg-gray-200/90 animate-pulse" />
              </div>
              <div className={`${EASY_VIEW_HEADER_CELL} ${EASY_VIEW_TD_BASE} flex items-end justify-start gap-1 pb-1`}>
                <div className="h-3.5 w-[min(100%,11rem)] rounded-md bg-gray-200/90 animate-pulse" />
                <div className="size-7 shrink-0 rounded bg-gray-200/90 animate-pulse" />
              </div>
              <div className={`${EASY_VIEW_HEADER_CELL} ${EASY_VIEW_TD_BASE} flex items-end justify-start gap-1 pb-1`}>
                <div className="h-3.5 w-[min(100%,9.5rem)] rounded-md bg-gray-200/90 animate-pulse" />
                <div className="size-7 shrink-0 rounded bg-gray-200/90 animate-pulse" />
              </div>
              <div className={`${EASY_VIEW_HEADER_CELL} ${EASY_VIEW_TD_BASE} flex items-end justify-start gap-1 pb-1`}>
                <div className="h-3.5 w-[min(100%,6rem)] rounded-md bg-gray-200/90 animate-pulse" />
                <span className="size-7 shrink-0" aria-hidden />
              </div>
              <div className={`${EASY_VIEW_HEADER_CELL} ${EASY_VIEW_TD_BASE} flex items-end justify-start gap-1 pb-1`}>
                <div className="h-3.5 w-[min(100%,7.5rem)] rounded-md bg-gray-200/90 animate-pulse" />
                <div className="size-7 shrink-0 rounded bg-gray-200/90 animate-pulse" />
              </div>
              <div className={`${EASY_VIEW_HEADER_CELL} ${EASY_VIEW_TD_BASE} flex items-end justify-start gap-1 pb-1`}>
                <div className="h-3.5 w-[min(100%,5rem)] rounded-md bg-gray-200/90 animate-pulse" />
                <div className="size-7 shrink-0 rounded bg-gray-200/90 animate-pulse" />
              </div>
            </div>
          ) : (
            <div className={EASY_VIEW_HEADER_GRID}>
              <div className={easyViewHeaderCheckboxTd}>
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleAll(selectableRows.map((r) => r.id), !allSelected)}
                  disabled={selectableRows.length === 0}
                  className={`${HEADER_CHECKBOX_CLASS} shrink-0 disabled:cursor-not-allowed disabled:opacity-40`}
                  aria-label="Select all rows"
                  suppressHydrationWarning
                />
              </div>
              <div
                className={`${EASY_VIEW_HEADER_CELL} ${EASY_VIEW_TD_BASE} flex min-w-0 flex-row flex-nowrap items-end justify-start gap-1 -translate-x-[10px]`}
              >
                <span className="min-w-0 shrink truncate">Supplier</span>
                <EasyViewSortChevronButton
                  sortDir={sort.dir}
                  active={sort.key === "contact"}
                  onToggle={() => onSortChange("contact")}
                  ariaLabel={`Sort by supplier${sort.key === "contact" ? (sort.dir === "asc" ? ", ascending" : ", descending") : ""}`}
                  title="Sort A-Z"
                />
              </div>
              <div
                className={`${EASY_VIEW_HEADER_CELL} ${EASY_VIEW_TD_BASE} flex min-w-0 flex-row flex-nowrap items-end justify-center gap-1`}
              >
                {/* Invisible spacer balances the sort chevron on the right so the label centers over the centered content. */}
                <span className="size-7 shrink-0" aria-hidden />
                <span className="min-w-0 shrink truncate">Submitted Date</span>
                <EasyViewSortChevronButton
                  sortDir={sort.dir}
                  active={sort.key === "submittedDate"}
                  onToggle={() => onSortChange("submittedDate")}
                  ariaLabel={`Sort by submitted date${sort.key === "submittedDate" ? (sort.dir === "asc" ? ", ascending" : ", descending") : ""}`}
                  title="Sort Newest - Oldest"
                />
              </div>
              <div
                className={`${EASY_VIEW_HEADER_CELL} ${EASY_VIEW_TD_BASE} flex min-w-0 flex-row flex-nowrap items-end justify-center gap-1`}
              >
                {/* Left spacer balances the right one so the centered label aligns with the centered content. */}
                <span className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 shrink truncate">Bank Slip</span>
                {/* Invisible spacer matches the sort-chevron button height so the label aligns with the other columns. */}
                <span className="size-7 shrink-0" aria-hidden />
              </div>
              <div
                className={`${EASY_VIEW_HEADER_CELL} ${EASY_VIEW_TD_BASE} flex min-w-0 flex-row flex-nowrap items-end justify-start gap-1`}
              >
                <span className="min-w-0 shrink truncate">Unpaid Amount</span>
                <EasyViewSortChevronButton
                  sortDir={sort.dir}
                  active={sort.key === "unpaidAmount"}
                  onToggle={() => onSortChange("unpaidAmount")}
                  ariaLabel={`Sort by unpaid amount${sort.key === "unpaidAmount" ? (sort.dir === "asc" ? ", ascending" : ", descending") : ""}`}
                  title="Sort Highest - Lowest"
                />
              </div>
              <div
                className={`${EASY_VIEW_HEADER_CELL} ${EASY_VIEW_TD_BASE} flex min-w-0 flex-row flex-nowrap items-end justify-center gap-1`}
              >
                {/* Invisible spacer balances the sort chevron so the label centers over the centered status button. */}
                <span className="size-1 shrink-0" aria-hidden />
                <span className="min-w-0 shrink truncate">Status</span>
                <EasyViewSortChevronButton
                  sortDir={sort.dir}
                  active={sort.key === "status"}
                  onToggle={() => onSortChange("status")}
                  ariaLabel={`Sort by status${sort.key === "status" ? (sort.dir === "asc" ? ", ascending" : ", descending") : ""}`}
                  title="Sort Status"
                />
              </div>
            </div>
          )}

          {loading ? (
            <ul className="flex flex-col gap-3" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => (
                <li
                  key={`sk-${i}`}
                  className={`${EASY_VIEW_ROW_GRID} rounded-lg border border-gray-200 bg-white`}
                >
                  <div className={easyViewCheckboxTd}>
                    <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-gray-200" />
                  </div>
                  <div className={`${easyViewContactTd} space-y-2 py-0.5`}>
                    <div className="h-4 max-w-[14rem] animate-pulse rounded bg-gray-200" />
                    <div className="h-3 max-w-[min(100%,20rem)] animate-pulse rounded bg-gray-100" />
                  </div>
                  <div className={easyViewSubmittedTd}>
                    <div className="h-4 w-[9.5rem] max-w-full shrink-0 animate-pulse rounded-md bg-gray-200 tabular-nums" />
                  </div>
                  <div className={easyViewAttachmentTd}>
                    <div className="flex flex-row flex-nowrap items-center gap-1.5 sm:gap-2" aria-hidden>
                      <div className={EASY_VIEW_BANKSLIP_SLOT}>
                        <div className="h-9 w-14 max-w-full animate-pulse rounded-lg bg-gray-200" />
                      </div>
                      <div className="h-[18px] w-[18px] shrink-0 animate-pulse rounded bg-gray-200" />
                    </div>
                  </div>
                  <div className={easyViewUnpaidTd}>
                    <div className="flex min-w-0 flex-col gap-1.5 tabular-nums">
                      <div className="h-4 w-28 animate-pulse rounded bg-gray-200 sm:h-5" />
                      <div className="h-3 w-36 max-w-full animate-pulse rounded bg-gray-100" />
                    </div>
                  </div>
                  <div className={easyViewStatusTd}>
                    <div className="h-7 w-full min-h-[42px] max-w-full animate-pulse rounded-lg bg-gray-200 sm:h-[42px]" />
                  </div>
                </li>
              ))}
            </ul>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-4 py-12 text-center text-sm text-primary/60">
              Hmm, nothing here with this status just yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((row) => {
                const isPayPanelOpen = payPanelBillId === row.id && payPanel != null;
                const isDraftDetailOpen = draftDetailBillId === row.id && !easyViewDraftDeleteOpen;
                const isRowSelected = selectedBillId === row.id;
                const isFocusBill = opacityFocusBillId != null && row.id === opacityFocusBillId;
                const dimRow = opacityFocusBillId != null && !isFocusBill;
                return (
                  <li
                    key={row.id}
                    data-easy-view-row={row.id}
                    className={`flex flex-col overflow-visible rounded-lg border bg-white transition-[opacity,colors] duration-200 ${
                      isRowSelected ? "border-secondary/50" : "border-gray-200"
                    } ${dimRow ? "opacity-20" : "opacity-100"}`}
                  >
                    {/* The grid lives on this wrapper, not the anchor, so the checkbox can sit
                        outside the link: stopPropagation would not cancel the navigation and
                        preventDefault would cancel the checkbox's own toggle. */}
                    <div
                      className={`${EASY_VIEW_ROW_GRID} cursor-pointer transition-colors hover:border-primary/20 hover:bg-gray-50/80`}
                    >
                      <div className={easyViewCheckboxTd}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          disabled={row.status === "Voided"}
                          onChange={() => onToggleRow(row.id)}
                          className={`${HEADER_CHECKBOX_CLASS} shrink-0 disabled:cursor-not-allowed disabled:opacity-40`}
                          aria-label={
                            row.status === "Voided"
                              ? `Voided — cannot select ${row.contactTitle}`
                              : `Select row ${row.contactTitle}`
                          }
                          suppressHydrationWarning
                        />
                      </div>
                      <a
                        href={pages.request(row.id)}
                        onClick={(e) => {
                          if (dimRow) {
                            e.preventDefault();
                            onOutsideCloseRequested?.();
                          }
                        }}
                        className="contents"
                      >
                        <div className={easyViewContactTd}>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-semibold text-primary sm:text-base">{row.contactTitle}</span>
                          </div>
                        </div>
                        <div className={easyViewSubmittedTd}>{row.submittedDate}</div>
                        <div className={easyViewAttachmentTd}>
                          <div className="flex w-full min-w-0 max-w-full flex-row flex-nowrap items-center justify-center gap-1.5 sm:gap-2">
                            {/* Left spacer balances the right-side info icon so the slip slot centers in the column. */}
                            <span className="size-4 shrink-0" aria-hidden />
                            <div className={EASY_VIEW_BANKSLIP_SLOT}>
                              <EasyViewBankSlipControl row={row} onOpen={onOpenBankSlipUpload} />
                            </div>
                            <div className="relative group inline-block transform translate-y-[2px]">
                              <span className="material-symbols-outlined text-[16px] cursor-pointer text-black hover:text-stone-800 block">
                                info
                              </span>
                              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover:block bg-gray-950 text-white text-xs rounded-md py-2 px-3 whitespace-nowrap shadow-lg z-10 pointer-events-none">
                                {row.contactCaption?.trim() ? row.contactCaption : "No description added"}
                                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-950"></div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className={easyViewUnpaidTd}>
                          {row.unpaidAmount || row.invoiceTotal ? (
                            <div className="flex min-w-0 flex-col gap-0.5">
                              {row.unpaidAmount ? (
                                <span
                                  className={`whitespace-nowrap text-sm font-semibold sm:text-base ${unpaidAmountClass(row.status)}`}
                                >
                                  {row.unpaidAmount}
                                </span>
                              ) : null}
                              {row.invoiceTotal ? (
                                <span className="whitespace-nowrap text-xs text-primary/65 tabular-nums sm:text-sm">
                                  (Inv total {entityCurrency} {row.invoiceTotal})
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <div className={easyViewStatusTd} onClick={(e) => e.stopPropagation()}>
                          <EasyViewStatusCell
                            row={row}
                            isElevated={isElevated}
                            onPaymentRequestedPay={onPaymentRequestedPay}
                            onPaidStatusOpen={onPaidStatusOpen}
                            onDraftBillOpen={onDraftBillOpen}
                          />
                        </div>
                      </a>
                    </div>
                    {isPayPanelOpen ? (
                      <div
                        className="border-t border-gray-200 bg-gray-50/50 p-4 sm:p-5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex w-full min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:gap-6 sm:justify-between">
                          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
                            <div className="relative aspect-square w-full max-w-[min(100%,22rem)] shrink-0 sm:max-w-[24rem] md:max-w-[26rem] lg:max-w-[30rem]">
                              <Image
                                src="/paid.png"
                                alt=""
                                fill
                                className="object-contain object-center"
                                sizes="(min-width: 1024px) 30rem, (min-width: 768px) 26rem, (min-width: 640px) 24rem, min(100vw, 22rem)"
                                priority
                              />
                            </div>
                          </div>
                          <div className="flex w-full min-w-0 max-w-[min(100%,720px)] shrink-0 justify-end self-end sm:self-start sm:ml-auto">
                            {payPanel}
                          </div>
                        </div>
                      </div>
                    ) : isDraftDetailOpen ? (
                      <div
                        className="border-t border-gray-200 bg-gray-50/50 p-4 sm:p-5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="w-full min-w-0 max-w-full">
                          {row.status === "Draft" ? (
                            <EasyViewDraftDetailBody
                              billId={row.id}
                              actions={draftDetailActions}
                              isElevated={isElevated}
                              isViewOnly={isViewOnly}
                              onBillSaved={onDraftBillSaved}
                            />
                          ) : (
                            <EasyViewReadonlyBillDetailBody
                              billId={row.id}
                              listStatus={row.status}
                              isElevated={isElevated}
                              isViewOnly={isViewOnly}
                              voidBillPending={easyViewBillMutatePending}
                              onRequestVoidBill={draftDetailActions.onRequestDelete}
                              onBillUpdated={onDraftBillSaved}
                            />
                          )}
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {/* Sibling of the scroll container, so the pager stays pinned below the list. */}
        {pagination ? (
          <div className="shrink-0 border-t border-gray-100 pb-3 pt-2">{pagination}</div>
        ) : null}
      </div>

      <div
        className="hidden min-h-0 w-px shrink-0 self-stretch bg-gray-200 min-[1650px]:block"
        aria-hidden
      />

      <aside
        ref={asideRef}
        className="relative mx-auto hidden h-full min-h-0 w-full min-w-0 shrink-0 flex-col overflow-x-hidden overflow-y-auto min-[1650px]:flex min-[1650px]:max-w-[min(100%,28rem)] min-[1650px]:flex-1 min-[1650px]:self-stretch xl:max-w-[min(100%,32rem)]"
      >
        {selectedBillId ? (
          <div
            className="flex min-h-0 w-full flex-1 flex-col"
            style={invoiceAsideOffsetY > 0 ? { marginTop: invoiceAsideOffsetY } : undefined}
          >
            <div className="mb-3 flex w-full min-w-0 shrink-0">
              <span className="min-w-0 truncate text-[18px] font-semibold text-black" title="Invoice">
                Invoice
              </span>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <InvoiceAttachmentPreview
                attachments={invoiceAttachments}
                isLoadingAttachments={invoiceAttachmentsLoading}
                fillColumn
                showViewFullButton
                className="min-h-0 flex-1"
              />
            </div>
          </div>
        ) : (
          <div className="relative mx-auto flex aspect-square w-full max-w-2xl flex-1 items-center justify-center overflow-hidden rounded-2xl lg:max-h-[min(88vh,42rem)]">
            <Image
              key={easyViewAsideImageSrc}
              src={easyViewAsideImageSrc}
              alt=""
              fill
              className="object-contain object-center"
              sizes="(min-width: 1024px) min(55vw, 42rem), 0px"
              priority
            />
          </div>
        )}
      </aside>
    </div>
  );
}
