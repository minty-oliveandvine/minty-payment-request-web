"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { PaymentRequestStatusFilter } from "./PaymentRequestToolbar";
import { BankSlipDetailsModal, type BankSlipDetails } from "./BankSlipDetailsModal";
import { RowDeleteConfirmModal } from "./RowDeleteConfirmModal";
import { useUserRole } from "@/lib/useUserRole";
import { useEntityCurrency } from "@/lib/entityCurrency";
import { recordPaymentButtonClass } from "./paymentRequestButtonClasses";
import { HEADER_CHECKBOX_CLASS } from "./paymentRequestCheckboxClasses";
import { type SortKey } from "@/lib/paymentRequestRowSort";
import { useCompanyPages } from "@/lib/useCompanyPages";

const COLUMN_TITLES = [
  "Supplier / Description",
  "Submitted Date",
  "Invoice Date",
  "Status",
  "Unpaid Amount",
  "Payment",
  "Paid Date",
  "Bankslip",
] as const;

export type PaymentRequestColumnTitle = (typeof COLUMN_TITLES)[number];

export type PaymentRequestRow = {
  id: string;
  contactTitle: string;
  contactCaption: string;
  invoiceDate: string;
  /** Hong Kong calendar date (`yyyy-mm-dd`) behind `invoiceDate`, for date filtering. */
  invoiceDateIso?: string;
  /** Hong Kong calendar date (`yyyy-mm-dd`) behind `submittedDate`, for date filtering. */
  submittedDateIso?: string;
  status: string;
  submittedDate: string;
  unpaidAmount: string;
  invoiceTotal?: string;
  payment: string;
  paidDate: string;
  bankslip: string;
  currencyCode?: string;
  bankslipFileCount?: number;
  bankSlipDetails?: BankSlipDetails;
  xeroActive?: boolean;
  description?: string;
};

function isActionColumnTitle(title: string) {
  return title === "Payment" || title === "Paid Date" || title === "Bankslip";
}

const MOBILE_BILL_DESCRIPTION_VISIBLE_CHARS = 26;

function truncateMobileBillDescription(text: string): string {
  return text.length > MOBILE_BILL_DESCRIPTION_VISIBLE_CHARS
    ? `${text.slice(0, MOBILE_BILL_DESCRIPTION_VISIBLE_CHARS)}...`
    : text;
}

const SORTABLE_TITLE: Partial<Record<PaymentRequestColumnTitle, SortKey>> = {
  "Supplier / Description": "contact",
  "Invoice Date": "invoiceDate",
  Status: "status",
  "Submitted Date": "submittedDate",
  "Unpaid Amount": "unpaidAmount",
  "Paid Date": "paidDate",
};

/** Screen-reader copy for column sort (sr-only + aria-describedby). */
function sortColumnDescription(key: SortKey): string {
  const suffix =
    " Click again to reverse. Only rows you see now are sorted; changing the status filter resets the order.";
  switch (key) {
    case "contact":
      return "Sort by supplier, then description (A–Z)." + suffix;
    case "invoiceDate":
      return "Sort by invoice date (oldest first or newest first)." + suffix;
    case "submittedDate":
      return "Sort by submitted date (oldest first or newest first)." + suffix;
    case "paidDate":
      return "Sort by paid date (oldest first or newest first); rows without a date go last." + suffix;
    case "status":
      return "Sort by status in billing order, then A–Z." + suffix;
    case "unpaidAmount":
      return "Sort by unpaid amount." + suffix;
    default:
      return "Sort this column." + suffix;
  }
}

/** Native hover tooltip for sort control — keep short. */
function sortColumnTooltip(key: SortKey): string {
  switch (key) {
    case "contact":
      return "Sort A-Z";
    case "invoiceDate":
    case "submittedDate":
      return "Sort Newest - Oldest";
    case "paidDate":
      return "Sort Newest - Oldest";
    case "status":
      return "Sort Status";
    case "unpaidAmount":
      return "Sort Highest - Lowest";
    default:
      return "Sort";
  }
}

const DEMO_ROWS: PaymentRequestRow[] = [
  {
    id: "1",
    contactTitle: "Young Bros Transport",
    contactCaption: "Corporate stationery and printer supplies",
    invoiceDate: "03 Mar 2026",
    status: "Draft",
    submittedDate: "01 Mar 2026",
    unpaidAmount: "1,500.00",
    invoiceTotal: "1,000.00",
    payment: "",
    paidDate: "",
    bankslip: "",
    currencyCode: "HKD",
    xeroActive: false,
  },
  {
    id: "2",
    contactTitle: "Chun Fat Seafood",
    contactCaption: "Monthly supplier invoice",
    invoiceDate: "28 Feb 2026",
    status: "Payment Requested",
    submittedDate: "27 Feb 2026",
    unpaidAmount: "2,400.00",
    invoiceTotal: "2,000.00",
    payment: "",
    paidDate: "",
    bankslip: "",
    currencyCode: "HKD",
    xeroActive: false,
  },
  {
    id: "3",
    contactTitle: "Harbour Logistics Ltd",
    contactCaption: "Freight forwarding — Q1",
    invoiceDate: "15 Mar 2026",
    status: "Paid",
    submittedDate: "14 Mar 2026",
    unpaidAmount: "0.00",
    invoiceTotal: "890.00",
    payment: "",
    paidDate: "16 Mar 2026",
    bankslip: "",
    bankslipFileCount: 1,
    bankSlipDetails: {
      createdBy: "John Doe",
      createdAt: "14 Mar 2026 10:22 HKT",
      toName: "Harbour Logistics Ltd",
      toAccount: "147-622484-838",
      amount: "0.00",
      fromName: "BUSINESS INTEGRATED SAVINGS - HKD SAVINGS",
      fromAccount: "040-286XXX-838",
      when: "15 Mar 2026",
      files: [{ id: "h1", name: "Harbour_Logistics_receipt.pdf" }],
    },
    currencyCode: "HKD",
    xeroActive: false,
  },
  {
    id: "4",
    contactTitle: "Metro Office Supplies",
    contactCaption: "Stationery — returned to sender",
    invoiceDate: "10 Mar 2026",
    status: "Returned",
    submittedDate: "08 Mar 2026",
    unpaidAmount: "320.00",
    invoiceTotal: "320.00",
    payment: "",
    paidDate: "11 Mar 2026",
    bankslip: "",
    bankslipFileCount: 2,
    bankSlipDetails: {
      createdBy: "John Doe",
      createdAt: "03 Mar 2026 13:36 HKT",
      toName: "OL*VE AN* V*NE LTD",
      toAccount: "147-622484-838",
      amount: "1,500.00",
      fromName: "BUSINESS INTEGRATED SAVINGS - HKD SAVINGS",
      fromAccount: "040-286XXX-838",
      when: "03 Mar 2026",
      files: [
        {
          id: "m1",
          name: "01 Nov 2025_ChunFatSeafood_240 1.pdf",
          details: {
            createdAt: "03 Mar 2026 13:36 HKT",
            amount: "1,500.00",
            when: "03 Mar 2026",
          },
        },
        {
          id: "m2",
          name: "Metro_Office_slip_2.pdf",
          details: {
            createdAt: "10 Mar 2026 09:15 HKT",
            amount: "320.00",
            when: "10 Mar 2026",
            toName: "Metro Office Supplies",
          },
        },
      ],
    },
    currencyCode: "HKD",
    xeroActive: false,
  },
  {
    id: "5",
    contactTitle: "Pacific Utilities Co.",
    contactCaption: "Duplicate billing — voided",
    invoiceDate: "02 Mar 2026",
    status: "Voided",
    submittedDate: "01 Mar 2026",
    unpaidAmount: "",
    invoiceTotal: "",
    payment: "",
    paidDate: "",
    bankslip: "",
    currencyCode: "HKD",
    xeroActive: false,
  },
];

const dataCellBase = "border-b border-gray-100 px-4 py-3 text-sm text-primary sm:px-5 sm:py-3.5";
const contactCellClass = `${dataCellBase} align-middle`;
const invoiceDateCellClass = `${dataCellBase} align-middle`;
const singleLineDateCellClass = `${dataCellBase} align-middle whitespace-nowrap tabular-nums min-w-[9rem]`;
/** Compact on small screens; from `sm:` matches Record Payment height + Payment Requested min width. */
const STATUS_TAG_UNIFORM =
  "max-w-full items-center px-2.5 py-1 sm:box-border sm:min-w-[11rem] sm:h-[42px] sm:min-h-[42px] sm:justify-center sm:px-3 sm:py-0";

const singleLineStatusCellClass = `${dataCellBase} align-middle whitespace-nowrap min-w-0 sm:min-w-[11rem]`;
const unpaidAmountCellClass = `${dataCellBase} align-middle tabular-nums min-w-[13rem]`;

const actionBodyCellBg = "bg-secondary/8";

const TABLE_SKELETON_ROW_COUNT = 6;
const MOBILE_SKELETON_CARD_COUNT = 6;

const statusTagClass =
  `inline-flex rounded-lg bg-[#EDEDED] text-xs font-medium text-[#C0C0C0] sm:text-sm ${STATUS_TAG_UNIFORM}`;

/** Paid: #656565 text, border-primary/25. Payment Requested: secondary text + tinted fill, no border. */
const statusTagPaidClass =
  `inline-flex rounded-lg border border-primary/25 bg-transparent text-xs font-semibold text-[#656565] sm:text-sm ${STATUS_TAG_UNIFORM}`;

const statusTagPartiallyPaidClass =
  `inline-flex rounded-lg bg-[#70ebba]/10 text-xs font-semibold text-[#70ebba] sm:text-sm ${STATUS_TAG_UNIFORM}`;

const statusTagPaymentRequestedClass =
  `inline-flex rounded-lg bg-secondary/10 text-xs font-semibold text-secondary sm:text-sm ${STATUS_TAG_UNIFORM}`;

const statusTagReturnedClass =
  `inline-flex rounded-lg bg-[#EA9713]/10 text-xs font-semibold text-[#EA9713] sm:text-sm ${STATUS_TAG_UNIFORM}`;

const statusTagVoidedClass =
  `inline-flex rounded-lg text-xs font-semibold text-[#FF6B6B] sm:text-sm ${STATUS_TAG_UNIFORM}`;

const viewPaymentsButtonClass =
  "box-border inline-flex h-10 min-h-10 w-max max-w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-0 bg-secondary/15 px-3 text-xs font-medium text-secondary transition-colors hover:bg-secondary/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-primary/40 disabled:hover:bg-[#F5F5F5] sm:h-[42px] sm:min-h-[42px] sm:px-4 sm:text-sm";

const uploadBankslipButtonClass =
  "box-border inline-flex h-10 min-h-10 w-max max-w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-secondary bg-white px-3 text-xs font-semibold text-secondary transition-colors hover:bg-secondary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:h-[42px] sm:min-h-[42px] sm:px-4 sm:text-sm";

const uploadBankslipReadOnlyClass =
  "box-border inline-flex h-10 min-h-10 w-max max-w-full cursor-default items-center justify-center gap-2 rounded-lg border-2 border-primary/15 bg-[#F5F5F5] px-3 text-xs font-semibold text-primary/40 sm:h-[42px] sm:min-h-[42px] sm:px-4 sm:text-sm";

const rowMenuButtonClass =
  "box-border inline-flex h-9 min-h-9 w-9 min-w-9 cursor-pointer items-center justify-center rounded-lg text-primary transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:text-primary/35 disabled:hover:bg-transparent sm:h-10 sm:min-h-10 sm:w-10 sm:min-w-10";

function unpaidAmountTextClass(status: string): string {
  if (status === "Paid") return "text-[#656565]";
  if (status === "Payment Requested") return "text-secondary";
  if (status === "Partially Paid") return "text-[#70ebba]";
  if (status === "Voided") return "text-[#FF6B6B]";
  if (status === "Draft") return "text-[#656565]";
  if (status === "Returned") return "text-[#EA9713]";
  return "text-[#C0C0C0]";
}

type PaymentRequestTableProps = {
  /** The current page slice — already filtered and sorted by `PaymentRequestView`. */
  rows?: PaymentRequestRow[];
  onRecordPayment?: (rowId: string, readOnly?: boolean) => void;
  /** Empty array = no status filter ("All"). Only used to reset transient menus. */
  statusFilters?: PaymentRequestStatusFilter[];
  onRowDelete?: (rowId: string) => void;
  onRowPublish?: (rowId: string) => void | Promise<void>;
  onRowRepublish?: (rowId: string) => void | Promise<void>;
  onRowClick?: (rowId: string) => void;
  loading?: boolean;
  /** Sort is owned by the parent so the page slice is taken after sorting. */
  sort?: { key: SortKey | null; dir: "asc" | "desc" };
  onSortColumn?: (key: SortKey) => void;
  /** Selection is shared with the easy view and spans pages. */
  selectedIds?: ReadonlySet<string>;
  onToggleRow?: (rowId: string) => void;
  onToggleAll?: (rowIds: string[], next: boolean) => void;
  /** Rendered top-right above the table (the totals banner). */
  headerSlot?: ReactNode;
  /** After bank slip files are uploaded via API for a bill. */
  onBankSlipUploaded?: () => void;
};

/** Stable empty default so an uncontrolled table doesn't get a new Set every render. */
const EMPTY_SELECTION: ReadonlySet<string> = new Set<string>();

const ROW_MENU_MIN_WIDTH_PX = 160;
const COLUMNS_MENU_WIDTH_PX = 288;

type RowMenuState = { rowId: string; top: number; left: number };
type ColumnsMenuState = { top: number; left: number };
type ColumnSelectorKey = "contact" | "submittedDate" | "invoiceDate" | "status" | "unpaidAmount";

const COLUMN_SELECTOR_ITEMS: Array<{ key: ColumnSelectorKey; label: string }> = [
  { key: "contact", label: "Supplier / Description" },
  { key: "submittedDate", label: "Submitted Date" },
  { key: "invoiceDate", label: "Invoice Date" },
  { key: "status", label: "Status" },
  { key: "unpaidAmount", label: "Unpaid Amount" },
];

/** Fixed column order (reordering UI removed). */
const DEFAULT_COLUMN_ORDER: ColumnSelectorKey[] = COLUMN_SELECTOR_ITEMS.map((item) => item.key);

const DEFAULT_COLUMN_VISIBILITY: Record<ColumnSelectorKey, boolean> = {
  contact: true,
  submittedDate: true,
  invoiceDate: true,
  status: true,
  unpaidAmount: true,
};

const COLUMN_VISIBILITY_STORAGE_KEY = "payment-request-table-column-visibility";

function loadStoredColumnVisibility(): Record<ColumnSelectorKey, boolean> {
  const base = { ...DEFAULT_COLUMN_VISIBILITY };
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== "object") return base;
    const o = parsed as Record<string, unknown>;
    for (const key of Object.keys(base) as ColumnSelectorKey[]) {
      const v = o[key];
      if (typeof v === "boolean") base[key] = v;
    }
    return base;
  } catch {
    return base;
  }
}

function persistColumnVisibility(next: Record<ColumnSelectorKey, boolean>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

const TITLE_SELECTOR_KEY: Partial<Record<PaymentRequestColumnTitle, ColumnSelectorKey>> = {
  "Supplier / Description": "contact",
  "Submitted Date": "submittedDate",
  "Invoice Date": "invoiceDate",
  Status: "status",
  "Unpaid Amount": "unpaidAmount",
};

const SELECTOR_TITLE: Record<ColumnSelectorKey, PaymentRequestColumnTitle> = {
  contact: "Supplier / Description",
  submittedDate: "Submitted Date",
  invoiceDate: "Invoice Date",
  status: "Status",
  unpaidAmount: "Unpaid Amount",
};

const NON_SELECTOR_TITLES: PaymentRequestColumnTitle[] = COLUMN_TITLES.filter((title) => !TITLE_SELECTOR_KEY[title]);

function skeletonDesktopTdClass(title: PaymentRequestColumnTitle): string {
  if (title === "Supplier / Description") return contactCellClass;
  if (title === "Invoice Date") return singleLineDateCellClass;
  if (title === "Submitted Date") return invoiceDateCellClass;
  if (title === "Status") return singleLineStatusCellClass;
  if (title === "Unpaid Amount") return unpaidAmountCellClass;
  if (title === "Payment") return `${dataCellBase} align-middle text-left ${actionBodyCellBg}`;
  if (title === "Paid Date") return `${singleLineDateCellClass} ${actionBodyCellBg}`;
  if (title === "Bankslip") return `${invoiceDateCellClass} ${actionBodyCellBg}`;
  return `${dataCellBase} align-middle`;
}

function skeletonDesktopCellInner(title: PaymentRequestColumnTitle) {
  switch (title) {
    case "Supplier / Description":
      return (
        <div className="space-y-2 py-0.5">
          <div className="h-4 max-w-[14rem] animate-pulse rounded bg-gray-200" />
          <div className="h-3 max-w-md animate-pulse rounded bg-gray-100" />
        </div>
      );
    case "Invoice Date":
    case "Submitted Date":
      return <div className="h-4 w-[5.75rem] animate-pulse rounded bg-gray-200" />;
    case "Status":
      return (
        <div className="h-7 w-[7rem] animate-pulse rounded-lg bg-gray-200 sm:h-[42px] sm:min-w-[11rem] sm:w-[11rem]" />
      );
    case "Unpaid Amount":
      return (
        <div className="space-y-1.5">
          <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-36 animate-pulse rounded bg-gray-100" />
        </div>
      );
    case "Payment":
    case "Bankslip":
      return <div className="h-10 w-[7.5rem] max-w-full animate-pulse rounded-lg bg-gray-200" />;
    case "Paid Date":
      return <div className="h-4 w-[5.75rem] animate-pulse rounded bg-gray-200" />;
    default:
      return null;
  }
}

export function getBankSlipDetailsForRow(row: PaymentRequestRow): BankSlipDetails {
  if (row.bankSlipDetails) return row.bankSlipDetails;
  const count = Math.max(0, row.bankslipFileCount ?? 0);
  const files = Array.from({ length: count }, (_, i) => ({
    id: `${row.id}-slip-${i}`,
    name: `${row.contactTitle.replace(/\s+/g, "_")}_slip_${i + 1}.pdf`,
  }));
  return {
    createdBy: "John Doe",
    createdAt: `${row.submittedDate} 13:36 HKT`,
    toName: row.contactTitle,
    toAccount: "147-622484-838",
    amount: row.unpaidAmount.trim() ? row.unpaidAmount : "—",
    fromName: "BUSINESS INTEGRATED SAVINGS - HKD SAVINGS",
    fromAccount: "040-286XXX-838",
    when: row.paidDate.trim() ? row.paidDate : row.invoiceDate,
    files,
  };
}

/**
 * Transparent anchor stretched over its positioned parent (a table cell or card).
 * Gives the browser a real link at every point of the row body, so right-click
 * offers "Open link in new tab" and ctrl/cmd-click or middle-click open a new tab,
 * matching easy view. A plain left-click is cancelled here and handled by the
 * row's onClick so client-side routing still applies.
 * Interactive content in the same cell must sit in a `relative z-[1]` wrapper to
 * stay above this overlay.
 */
function RowLinkOverlay({ rowId, label }: { rowId: string; label: string }) {
  const pages = useCompanyPages();
  return (
    <a
      href={pages.request(rowId)}
      aria-label={label}
      tabIndex={-1}
      className="absolute inset-0 z-0"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
          e.stopPropagation();
          return;
        }
        e.preventDefault();
      }}
    />
  );
}

export function PaymentRequestTable({
  rows = DEMO_ROWS,
  onRecordPayment,
  statusFilters = [],
  onRowDelete,
  onRowPublish,
  onRowRepublish,
  onRowClick,
  loading = false,
  sort = { key: "status", dir: "asc" },
  onSortColumn,
  selectedIds = EMPTY_SELECTION,
  onToggleRow,
  onToggleAll,
  headerSlot,
  onBankSlipUploaded,
}: PaymentRequestTableProps) {
  const sortDescriptionIdPrefix = useId();
  const { isElevated, isViewOnly } = useUserRole();
  const entityCurrency = useEntityCurrency();
  const [bankSlipDetailsRowId, setBankSlipDetailsRowId] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null);
  const [rowDeleteConfirmId, setRowDeleteConfirmId] = useState<string | null>(null);
  const [rowDeletePending, setRowDeletePending] = useState(false);
  /** Row whose (re)publish is in flight. The menu closes on click, so without this the
      row gave no sign that a Xero round trip was running. */
  const [rowPublishPending, setRowPublishPending] = useState<{ rowId: string; mode: "publish" | "republish" } | null>(null);
  const [columnsMenu, setColumnsMenu] = useState<ColumnsMenuState | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnSelectorKey, boolean>>(() => ({ ...DEFAULT_COLUMN_VISIBILITY }));
  const [columnVisibilityDraft, setColumnVisibilityDraft] = useState<Record<ColumnSelectorKey, boolean>>(() => ({ ...DEFAULT_COLUMN_VISIBILITY }));
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setColumnVisibility(loadStoredColumnVisibility());
  }, []);

  const statusFilterKey = statusFilters.join("|");

  /** "Select all" means everything selectable on this page — selection spans pages. */
  const selectableVisibleRows = useMemo(
    () => rows.filter((r) => r.status !== "Voided"),
    [rows],
  );

  const allSelected =
    selectableVisibleRows.length > 0 && selectableVisibleRows.every((r) => selectedIds.has(r.id));
  const someSelected =
    selectableVisibleRows.some((r) => selectedIds.has(r.id)) && !allSelected;
  const visibleSelectorCount = COLUMN_SELECTOR_ITEMS.reduce((n, item) => n + (columnVisibility[item.key] ? 1 : 0), 0);
  const tableColCount = 1 + visibleSelectorCount + 2 + 2;
  const orderedTableTitles = useMemo(
    () => [...DEFAULT_COLUMN_ORDER.map((key) => SELECTOR_TITLE[key]), ...NON_SELECTOR_TITLES],
    [],
  );

  const bankSlipDetailsSourceRow = useMemo(() => {
    if (!bankSlipDetailsRowId) return undefined;
    return rows.find((x) => x.id === bankSlipDetailsRowId);
  }, [bankSlipDetailsRowId, rows]);

  const bankSlipDetailsPayload = useMemo(() => {
    if (!bankSlipDetailsSourceRow) return null;
    return getBankSlipDetailsForRow(bankSlipDetailsSourceRow);
  }, [bankSlipDetailsSourceRow]);

  const bankSlipDetailsReadOnly =
    bankSlipDetailsSourceRow != null &&
    (bankSlipDetailsSourceRow.status === "Voided" || bankSlipDetailsSourceRow.status === "Draft");

  /** Selection and sort resets live in the parent; only transient menus close here. */
  useEffect(() => {
    setRowMenu(null);
    setRowDeleteConfirmId(null);
    setColumnsMenu(null);
    setBankSlipDetailsRowId(null);
  }, [statusFilterKey]);

  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (el) el.indeterminate = someSelected;
  }, [someSelected]);

  const toggleAll = () => {
    onToggleAll?.(selectableVisibleRows.map((r) => r.id), !allSelected);
  };

  const rowMenuRow = rowMenu ? rows.find((r) => r.id === rowMenu.rowId) : undefined;
  const isRowMenuDeleteDisabled =
    rowMenuRow?.status === "Voided" ||
    ((rowMenuRow?.status === "Paid" || rowMenuRow?.status === "Partially Paid") && !isElevated) ||
    isViewOnly;
  const rowMenuPublishedToXero = rowMenuRow?.xeroActive === true;
  const showRowMenuPublish =
    isElevated &&
    !isViewOnly &&
    rowMenuRow != null &&
    rowMenuRow.status !== "Draft" &&
    rowMenuRow.status !== "Voided" &&
    !rowMenuPublishedToXero;
  const showRowMenuRepublish =
    isElevated &&
    !isViewOnly &&
    rowMenuRow != null &&
    rowMenuRow.status !== "Draft" &&
    rowMenuRow.status !== "Voided" &&
    rowMenuPublishedToXero;
  const rowDeleteContactTitle = useMemo(() => {
    if (!rowDeleteConfirmId) return "";
    return rows.find((r) => r.id === rowDeleteConfirmId)?.contactTitle ?? "";
  }, [rowDeleteConfirmId, rows]);
  const rowDeleteIsDraft = useMemo(() => {
    if (!rowDeleteConfirmId) return false;
    return rows.find((r) => r.id === rowDeleteConfirmId)?.status === "Draft";
  }, [rowDeleteConfirmId, rows]);

  const runRowPublish = useCallback(
    async (rowId: string, mode: "publish" | "republish", handler?: (rowId: string) => void | Promise<void>) => {
      if (!handler) return;
      setRowPublishPending({ rowId, mode });
      try {
        await Promise.resolve(handler(rowId));
      } catch {
        /* error surfaced by parent */
      } finally {
        setRowPublishPending(null);
      }
    },
    [],
  );

  const confirmRowDelete = useCallback(async () => {
    if (!rowDeleteConfirmId) return;
    setRowDeletePending(true);
    try {
      await Promise.resolve(onRowDelete?.(rowDeleteConfirmId));
      setRowDeleteConfirmId(null);
    } catch {
      /* error surfaced by parent */
    } finally {
      setRowDeletePending(false);
    }
  }, [rowDeleteConfirmId, onRowDelete]);

  useEffect(() => {
    if (!rowMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRowMenu(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-row-menu-panel]")) return;
      if (t.closest("[data-row-menu-trigger]")) return;
      setRowMenu(null);
    };
    const onScroll = () => setRowMenu(null);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [rowMenu]);

  const toggleRowMenu = (rowId: string, trigger: HTMLButtonElement) => {
    const r = trigger.getBoundingClientRect();
    const left = Math.max(8, r.right - ROW_MENU_MIN_WIDTH_PX);
    const top = r.bottom + 4;
    setRowMenu((open) => (open?.rowId === rowId ? null : { rowId, top, left }));
  };

  const toggleColumnsMenu = (trigger: HTMLButtonElement) => {
    const r = trigger.getBoundingClientRect();
    const left = Math.max(8, r.right - COLUMNS_MENU_WIDTH_PX);
    const top = r.bottom + 6;
    setColumnsMenu((open) => (open ? null : { top, left }));
  };

  const prevColumnsMenuRef = useRef<ColumnsMenuState | null>(null);
  useEffect(() => {
    const wasOpen = prevColumnsMenuRef.current != null;
    const isOpen = columnsMenu != null;
    if (isOpen && !wasOpen) {
      setColumnVisibilityDraft({ ...columnVisibility });
    }
    prevColumnsMenuRef.current = columnsMenu;
  }, [columnsMenu, columnVisibility]);

  useEffect(() => {
    if (!columnsMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setColumnsMenu(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-columns-menu-panel]")) return;
      if (t.closest("[data-columns-menu-trigger]")) return;
      setColumnsMenu(null);
    };
    const onScroll = () => setColumnsMenu(null);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [columnsMenu]);

  return (
    <div className="w-full min-w-0 px-4 pb-6 sm:px-6">
      {headerSlot ? <div className="mb-3 flex justify-end">{headerSlot}</div> : null}
      <div className="flex flex-col gap-3 lg:hidden" role="list" aria-label="Payment requests">
        {loading ? (
          <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label="Loading payment requests">
            {Array.from({ length: MOBILE_SKELETON_CARD_COUNT }, (_, i) => (
              <div
                key={`sk-card-${i}`}
                className="rounded-xl border border-gray-200 bg-[#F5F5F5] p-4 shadow-sm"
                aria-hidden
              >
                <div className="flex gap-3">
                  <div className="mt-0.5 h-4 w-4 shrink-0 animate-pulse rounded bg-gray-300" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-4 w-[min(100%,12rem)] animate-pulse rounded bg-gray-300" />
                        <div className="h-3 w-full max-w-[18rem] animate-pulse rounded bg-gray-200" />
                      </div>
                      <div className="h-7 w-20 shrink-0 animate-pulse rounded-lg bg-gray-200" />
                    </div>
                    <div className="flex items-start justify-between gap-3 pt-1">
                      <div className="space-y-1.5">
                        <div className="h-2.5 w-16 animate-pulse rounded bg-gray-200" />
                        <div className="h-4 w-24 animate-pulse rounded bg-gray-300" />
                      </div>
                      <div className="space-y-1 text-right">
                        <div className="ml-auto h-5 w-28 animate-pulse rounded bg-gray-300" />
                        <div className="ml-auto h-3 w-32 animate-pulse rounded bg-gray-200" />
                      </div>
                    </div>
                    <div className="flex min-h-10 items-center gap-2 pt-1">
                      <div className="h-7 w-20 max-w-[50%] animate-pulse rounded-lg bg-gray-200 sm:h-[42px] sm:min-w-[11rem] sm:w-[min(100%,11rem)] sm:max-w-none" />
                      <div className="ml-auto h-10 w-24 animate-pulse rounded-lg bg-gray-200" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-[#F5F5F5] px-4 py-8 text-center text-sm text-primary/70">No payment requests match this status.</div>
        ) : (
          rows.map((row) => {
            const isPaid = row.status === "Paid";
            const isPartiallyPaid = row.status === "Partially Paid";
            const isVoided = row.status === "Voided";
            const isPaymentRequested = row.status === "Payment Requested";
            const isDraft = row.status === "Draft";
            const isReturned = row.status === "Returned";
            const bankslipReadOnly = isVoided || isDraft;
            const statusBadgeClass = isPaid
              ? statusTagPaidClass
              : isPartiallyPaid
                ? statusTagPartiallyPaidClass
                : isVoided
                  ? statusTagVoidedClass
                  : isPaymentRequested
                    ? statusTagPaymentRequestedClass
                    : isReturned
                      ? statusTagReturnedClass
                      : statusTagClass;
            const articleClassName = `rounded-xl border border-gray-200 p-4 shadow-sm transition-colors ${isVoided ? "bg-[#F5F5F5]" : isPaid ? "bg-[#F5F5F5]" : isPaymentRequested ? "bg-secondary/10" : isPartiallyPaid ? "bg-[#70ebba]/10" : isReturned ? "bg-[#EA9713]/10" : "bg-[#F5F5F5]"} ${isVoided ? "cursor-pointer active:bg-gray-200/60" : isPaid ? "cursor-pointer active:bg-gray-200/60" : isPaymentRequested ? "cursor-pointer active:bg-secondary/20" : isPartiallyPaid ? "cursor-pointer active:bg-[#70ebba]/20" : isReturned ? "cursor-pointer active:bg-[#EA9713]/20" : "cursor-pointer active:bg-gray-200/60"}`;
            return (
              <article key={row.id} role="listitem" className={`${articleClassName} relative`} onClick={() => { onRowClick?.(row.id); }}>
                <RowLinkOverlay rowId={row.id} label={`Open ${row.contactTitle}`} />
                <div className="flex gap-3">
                  <div className="relative z-[1] hidden shrink-0 pt-0.5 sm:block" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(row.id)} disabled={isVoided} onChange={() => onToggleRow?.(row.id)} className={`${HEADER_CHECKBOX_CLASS} disabled:cursor-not-allowed disabled:opacity-40`} aria-label={isVoided ? `Voided — cannot select ${row.contactTitle}` : `Select row ${row.contactTitle}`} suppressHydrationWarning />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold leading-snug text-primary">{row.contactTitle}</h3>
                        {row.contactCaption ? (
                          <p className="mt-0.5 min-w-0 max-w-full text-xs leading-snug text-primary/60" title={row.contactCaption}>
                            {truncateMobileBillDescription(row.contactCaption)}
                          </p>
                        ) : null}
                      </div>
                      {row.status ? (
                        <div className="relative z-[1] shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
                          <span className={statusBadgeClass}>{row.status}</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-4 flex min-w-0 items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-primary/45">Invoice date</span>
                        <span className="text-sm font-semibold tabular-nums text-primary">{row.invoiceDate}</span>
                      </div>
                      {row.unpaidAmount || row.invoiceTotal ? (
                        <div className="shrink-0 space-y-0.5 text-right">
                          {row.unpaidAmount ? (
                            <p className={"text-base font-semibold tabular-nums " + unpaidAmountTextClass(row.status)}>{row.unpaidAmount}</p>
                          ) : null}
                          {row.invoiceTotal ? (
                            <p className="text-[11px] tabular-nums text-primary/55">
                              (Inv total {entityCurrency} {row.invoiceTotal})
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="relative z-[1] mt-4 flex min-h-[2.5rem] min-w-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex min-w-0 min-h-10 flex-1 flex-wrap items-center gap-2">
                        {!isVoided && !isDraft && !isReturned && isElevated ? (
                          isPaid ? (
                            <button type="button" aria-label={`View payments for ${row.contactTitle}`} onClick={(e) => { e.stopPropagation(); onRecordPayment?.(row.id, true); }} className={viewPaymentsButtonClass}>
                              <span className="whitespace-nowrap">View payments</span>
                            </button>
                          ) : (
                            <button type="button" aria-label={`Record payment for ${row.contactTitle}`} onClick={(e) => { e.stopPropagation(); onRecordPayment?.(row.id); }} className={recordPaymentButtonClass}>
                              <span className="whitespace-nowrap">Record Payment</span>
                              <span className="material-symbols-outlined shrink-0 text-[20px] leading-none" aria-hidden>add</span>
                            </button>
                          )
                        ) : isReturned ? (
                          <button type="button" disabled aria-label={`Returned — record payment not available for ${row.contactTitle}`} className={recordPaymentButtonClass}>
                            <span className="whitespace-nowrap">Record Payment</span>
                            <span className="material-symbols-outlined shrink-0 text-[20px] leading-none" aria-hidden>add</span>
                          </button>
                        ) : !isVoided && !isDraft && isPaid && !isElevated ? (
                          <button type="button" disabled aria-label={`Insufficient permissions — view payments not available for ${row.contactTitle}`} className={viewPaymentsButtonClass}>
                            <span className="whitespace-nowrap">View payments</span>
                          </button>
                        ) : null}
                      </div>
                      <div className="flex h-10 min-h-10 shrink-0 items-center justify-end">
                        {row.bankslipFileCount != null && row.bankslipFileCount > 0 ? (
                          <button
                            type="button"
                            className={`inline-flex h-10 min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${bankslipReadOnly ? "text-primary/40" : "text-secondary"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setBankSlipDetailsRowId(row.id);
                            }}
                            aria-label={
                              isVoided
                                ? `View bank slip — voided, ${row.bankslipFileCount} file${row.bankslipFileCount === 1 ? "" : "s"}`
                                : isDraft
                                  ? `View bank slip — draft, ${row.bankslipFileCount} file${row.bankslipFileCount === 1 ? "" : "s"}`
                                  : `View bank slip — ${row.bankslipFileCount} file${row.bankslipFileCount === 1 ? "" : "s"} uploaded`
                            }
                          >
                            <span className="text-sm font-semibold tabular-nums">{row.bankslipFileCount}</span>
                            <span className="material-symbols-outlined shrink-0 text-[20px] leading-none" aria-hidden>draft</span>
                          </button>
                        ) : bankslipReadOnly || isViewOnly ? (
                          <div className={uploadBankslipReadOnlyClass} aria-label={isVoided ? `Voided — upload not available for ${row.contactTitle}` : isDraft ? `Draft — upload not available for ${row.contactTitle}` : `Upload not available for ${row.contactTitle}`}>
                            <span className="whitespace-nowrap">Upload</span>
                            <span className="material-symbols-outlined shrink-0 text-[20px] leading-none" aria-hidden>upload_file</span>
                          </div>
                        ) : (
                          <button type="button" className={uploadBankslipButtonClass} onClick={(e) => { e.stopPropagation(); setBankSlipDetailsRowId(row.id); }}>
                            <span className="whitespace-nowrap">Upload</span>
                            <span className="material-symbols-outlined shrink-0 text-[20px] leading-none" aria-hidden>upload_file</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
      <div className="hidden rounded-lg border border-gray-200 lg:block">
        <div className="overflow-x-auto touch-auto [-webkit-overflow-scrolling:touch]">
          <table className="min-w-[82rem] w-full border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" className="w-12 min-w-[2.75rem] border-b border-gray-200 bg-[#9CA3AF] px-2 py-3 text-center sm:px-3 sm:py-3.5">
                  <input ref={headerCheckboxRef} type="checkbox" checked={allSelected} onChange={toggleAll} disabled={selectableVisibleRows.length === 0} className={`${HEADER_CHECKBOX_CLASS} disabled:cursor-not-allowed disabled:opacity-40`} aria-label="Select all rows" suppressHydrationWarning />
                </th>
                {orderedTableTitles.map((title) => {
                  const selectorKey = TITLE_SELECTOR_KEY[title];
                  if (selectorKey && !columnVisibility[selectorKey]) return null;
                  const sortKeyForCol = SORTABLE_TITLE[title];
                  const sortActive = sortKeyForCol != null && sort.key === sortKeyForCol;
                  const thBase = `border-b border-gray-200 px-4 py-3 text-left text-xs sm:px-5 sm:py-3.5 sm:text-sm ${isActionColumnTitle(title) ? "bg-secondary text-white" : "bg-[#9CA3AF] text-white"} ${title === "Supplier / Description" ? "min-w-[14rem]" : title === "Payment" || title === "Bankslip" ? "min-w-[11rem] whitespace-nowrap" : title === "Invoice Date" || title === "Paid Date" ? "min-w-[9rem] whitespace-nowrap" : title === "Status" ? "min-w-0 whitespace-nowrap sm:min-w-[11rem]" : title === "Unpaid Amount" ? "min-w-[13rem] whitespace-nowrap" : "min-w-[7rem] whitespace-nowrap"}`;
                  const hoverSort = title === "Paid Date" ? "hover:bg-white/15 focus-visible:outline-white/60" : "hover:bg-black/10 focus-visible:outline-white/60";
                  return (
                    <th key={title} scope="col" aria-sort={sortActive ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className={thBase}>
                      {sortKeyForCol ? (
                        <div className="flex min-w-0 items-center gap-1 sm:gap-1.5">
                          <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
                          <span id={`${sortDescriptionIdPrefix}-${sortKeyForCol}`} className="sr-only">
                            {sortColumnDescription(sortKeyForCol)}
                          </span>
                          <button
                            type="button"
                            className={`inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${hoverSort}`}
                            aria-label={`Sort by ${title}${sortActive ? `, ${sort.dir === "asc" ? "ascending" : "descending"}` : ""}`}
                            aria-describedby={`${sortDescriptionIdPrefix}-${sortKeyForCol}`}
                            title={sortColumnTooltip(sortKeyForCol)}
                            onClick={() => onSortColumn?.(sortKeyForCol)}
                          >
                            <span className="inline-flex size-5 items-center justify-center" aria-hidden>
                              <span className={`material-symbols-outlined block text-[18px] leading-none ${sortActive ? "opacity-100" : "opacity-60"}`}>{sortActive ? (sort.dir === "asc" ? "expand_less" : "expand_more") : "expand_more"}</span>
                            </span>
                          </button>
                        </div>
                      ) : (
                        <span className="font-semibold">{title}</span>
                      )}
                    </th>
                  );
                })}
                <th scope="col" colSpan={2} aria-label="Actions" className="border-b border-gray-200 bg-secondary px-2 py-2 text-right text-white sm:px-3 sm:py-2.5">
                  <button type="button" data-columns-menu-trigger className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-white/40 bg-white/15 px-3 text-sm font-medium text-white transition-colors hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label="Columns" aria-expanded={columnsMenu ? "true" : "false"} aria-haspopup="dialog" onClick={(e) => { e.stopPropagation(); toggleColumnsMenu(e.currentTarget); }}>
                    <span>Columns</span>
                    <span className="material-symbols-outlined text-[18px] leading-none" aria-hidden>vertical_split</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white" aria-busy={loading}>
              {loading ? (
                Array.from({ length: TABLE_SKELETON_ROW_COUNT }, (_, rowIdx) => (
                  <tr key={`sk-row-${rowIdx}`} className="pointer-events-none" aria-hidden>
                    <td className="border-b border-gray-100 px-2 py-3 text-center align-middle sm:px-3">
                      <div className="mx-auto h-4 w-4 animate-pulse rounded bg-gray-200" />
                    </td>
                    {orderedTableTitles.map((title) => {
                      const selectorKey = TITLE_SELECTOR_KEY[title];
                      if (selectorKey && !columnVisibility[selectorKey]) return null;
                      const inner = skeletonDesktopCellInner(title);
                      if (inner == null) return null;
                      return (
                        <td key={`${title}-${rowIdx}`} className={skeletonDesktopTdClass(title)}>
                          {inner}
                        </td>
                      );
                    })}
                    <td className={`border-b border-gray-100 px-2 py-3 text-center align-middle sm:px-3 ${actionBodyCellBg}`}>
                      <div className="mx-auto h-10 w-10 animate-pulse rounded-md bg-gray-200" />
                    </td>
                    <td className={`border-b border-gray-100 px-2 py-3 text-center align-middle sm:px-3 ${actionBodyCellBg}`}>
                      <div className="mx-auto h-9 w-9 animate-pulse rounded-full bg-gray-200" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={tableColCount} className="border-b border-gray-100 px-4 py-8 text-center text-sm text-primary/70 sm:px-5">No payment requests match this status.</td>
                </tr>
              ) : null}
              {!loading &&
                rows.map((row) => {
                const isPaid = row.status === "Paid";
                const isPartiallyPaid = row.status === "Partially Paid";
                const isVoided = row.status === "Voided";
                const isPaymentRequested = row.status === "Payment Requested";
                const isDraft = row.status === "Draft";
                const isReturned = row.status === "Returned";
                const bankslipReadOnly = isVoided || isDraft;
                const xeroConnected = !isDraft && row.xeroActive;
                const isRowPublishing = rowPublishPending?.rowId === row.id;
                return (
                  <tr key={row.id} className={`transition-colors duration-150 ease-out cursor-pointer hover:bg-gray-50`} onClick={() => { onRowClick?.(row.id); }}>
                    <td className="border-b border-gray-100 px-2 py-3 text-center align-middle sm:px-3">
                      <input type="checkbox" checked={selectedIds.has(row.id)} disabled={isVoided} onChange={() => onToggleRow?.(row.id)} onClick={(e) => e.stopPropagation()} className={`${HEADER_CHECKBOX_CLASS} disabled:cursor-not-allowed disabled:opacity-40`} aria-label={isVoided ? `Voided — cannot select ${row.contactTitle}` : `Select row ${row.contactTitle}`} suppressHydrationWarning />
                    </td>
                    {orderedTableTitles.map((title) => {
                      const selectorKey = TITLE_SELECTOR_KEY[title];
                      if (selectorKey && !columnVisibility[selectorKey]) return null;
                      switch (title) {
                        case "Supplier / Description":
                          return (
                            <td key={title} className={`${contactCellClass} relative`}>
                              <RowLinkOverlay rowId={row.id} label={`Open ${row.contactTitle}`} />
                              <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-sm font-semibold text-primary sm:text-base">{row.contactTitle}</span>
                                {row.contactCaption ? <span className="text-xs text-primary/65 sm:text-sm">{row.contactCaption}</span> : null}
                              </div>
                            </td>
                          );
                        case "Invoice Date":
                          return (
                            <td key={title} className={`${singleLineDateCellClass} relative`}>
                              <RowLinkOverlay rowId={row.id} label={`Open ${row.contactTitle}`} />
                              {row.invoiceDate}
                            </td>
                          );
                        case "Status":
                          return (
                            <td key={title} className={`${singleLineStatusCellClass} relative`}>
                              <RowLinkOverlay rowId={row.id} label={`Open ${row.contactTitle}`} />
                              {row.status ? (
                                <span
                                  className={
                                    isPaid
                                      ? statusTagPaidClass
                                      : isPartiallyPaid
                                        ? statusTagPartiallyPaidClass
                                        : isVoided
                                          ? statusTagVoidedClass
                                          : isPaymentRequested
                                            ? statusTagPaymentRequestedClass
                                            : isReturned
                                              ? statusTagReturnedClass
                                              : statusTagClass
                                  }
                                >
                                  {row.status}
                                </span>
                              ) : null}
                            </td>
                          );
                        case "Submitted Date":
                          return (
                            <td key={title} className={`${invoiceDateCellClass} relative`}>
                              <RowLinkOverlay rowId={row.id} label={`Open ${row.contactTitle}`} />
                              {row.submittedDate}
                            </td>
                          );
                        case "Unpaid Amount":
                          return (
                            <td key={title} className={`${unpaidAmountCellClass} relative`}>
                              <RowLinkOverlay rowId={row.id} label={`Open ${row.contactTitle}`} />
                              {row.unpaidAmount || row.invoiceTotal ? (
                                <div className="flex min-w-0 flex-col gap-0.5">
                                  {row.unpaidAmount ? <span className={"whitespace-nowrap text-sm font-semibold sm:text-base " + unpaidAmountTextClass(row.status)}>{row.unpaidAmount}</span> : null}
                                  {row.invoiceTotal ? (
                                    <span className="whitespace-nowrap text-xs text-primary/65 tabular-nums sm:text-sm">
                                      (Inv total {entityCurrency} {row.invoiceTotal})
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </td>
                          );
                        case "Payment": {
                          const canViewPaid = isPaid && !isVoided && !isDraft && isElevated;
                          const canRecord = !isPaid && !isVoided && !isDraft && !isReturned && isElevated;
                          const disabledViewPaid = isPaid && !isVoided && !isDraft && !isElevated;
                          return (
                            <td key={title} className={`${dataCellBase} align-middle text-left ${actionBodyCellBg} relative`}>
                              <RowLinkOverlay rowId={row.id} label={`Open ${row.contactTitle}`} />
                              <div className="relative z-[1] inline-flex">
                              <button
                                type="button"
                                disabled={!canViewPaid && !canRecord}
                                aria-label={
                                  isVoided
                                    ? `Voided — record payment not available for ${row.contactTitle}`
                                    : isDraft
                                      ? `Draft — record payment not available for ${row.contactTitle}`
                                      : isReturned
                                        ? `Returned — record payment not available for ${row.contactTitle}`
                                        : canViewPaid
                                          ? `View payments for ${row.contactTitle}`
                                          : disabledViewPaid
                                            ? `Insufficient permissions — view payments not available for ${row.contactTitle}`
                                            : !isElevated
                                              ? `Insufficient permissions — record payment not available for ${row.contactTitle}`
                                              : `Record payment for ${row.contactTitle}`
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (canViewPaid) {
                                    onRecordPayment?.(row.id, true);
                                    return;
                                  }
                                  if (canRecord) onRecordPayment?.(row.id);
                                }}
                                className={canViewPaid || disabledViewPaid ? viewPaymentsButtonClass : recordPaymentButtonClass}
                              >
                                <span className="whitespace-nowrap">{canViewPaid || disabledViewPaid ? "View payments" : "Record Payment"}</span>
                                {canViewPaid || disabledViewPaid ? null : (
                                  <span className="material-symbols-outlined shrink-0 text-[20px] leading-none sm:text-[22px]" aria-hidden>
                                    add
                                  </span>
                                )}
                              </button>
                              </div>
                            </td>
                          );
                        }
                        case "Paid Date":
                          return (
                            <td key={title} className={`${singleLineDateCellClass} ${actionBodyCellBg} relative`}>
                              <RowLinkOverlay rowId={row.id} label={`Open ${row.contactTitle}`} />
                              {row.paidDate.trim() ? row.paidDate : <span className="text-primary/40 tabular-nums" aria-label="No paid date">-</span>}
                            </td>
                          );
                        case "Bankslip":
                          return (
                            <td key={title} className={`${invoiceDateCellClass} ${actionBodyCellBg} relative`}>
                              <RowLinkOverlay rowId={row.id} label={`Open ${row.contactTitle}`} />
                              <div className="relative z-[1] flex items-center gap-2">
                                <div>
                                  {row.bankslipFileCount != null && row.bankslipFileCount > 0 ? (
                                    <button
                                      type="button"
                                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:gap-2 ${bankslipReadOnly ? "text-primary/40" : "text-secondary"}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setBankSlipDetailsRowId(row.id);
                                      }}
                                      aria-label={
                                        isVoided
                                          ? `View bank slip — voided, ${row.bankslipFileCount} file${row.bankslipFileCount === 1 ? "" : "s"}`
                                          : isDraft
                                            ? `View bank slip — draft, ${row.bankslipFileCount} file${row.bankslipFileCount === 1 ? "" : "s"}`
                                            : `View bank slip — ${row.bankslipFileCount} file${row.bankslipFileCount === 1 ? "" : "s"} uploaded`
                                      }
                                    >
                                      <span className="text-sm font-semibold tabular-nums sm:text-base">{row.bankslipFileCount}</span>
                                      <span className="material-symbols-outlined shrink-0 text-[20px] leading-none sm:text-[22px]" aria-hidden>draft</span>
                                    </button>
                                  ) : bankslipReadOnly || isViewOnly ? (
                                    <div
                                      className={uploadBankslipReadOnlyClass}
                                      aria-label={
                                        isVoided
                                          ? `Voided — upload not available for ${row.contactTitle}`
                                          : isDraft
                                            ? `Draft — upload not available for ${row.contactTitle}`
                                            : `Upload not available for ${row.contactTitle}`
                                      }
                                    >
                                      <span className="whitespace-nowrap">Upload</span>
                                      <span className="material-symbols-outlined shrink-0 text-[20px] leading-none sm:text-[22px]" aria-hidden>upload_file</span>
                                    </div>
                                  ) : (
                                    <button type="button" className={uploadBankslipButtonClass} onClick={(e) => { e.stopPropagation(); setBankSlipDetailsRowId(row.id); }}><span className="whitespace-nowrap">Upload</span><span className="material-symbols-outlined shrink-0 text-[20px] leading-none sm:text-[22px]" aria-hidden>upload_file</span></button>
                                  )}
                                </div>
                                <div className="relative group inline-block">
                                  <span className="material-symbols-outlined text-[16px] cursor-pointer text-black hover:text-stone-800 block">
                                    info
                                  </span>
                                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 hidden group-hover:block bg-gray-950 text-white text-xs rounded-md py-2 px-3 whitespace-nowrap shadow-lg z-20 pointer-events-none">
                                    {row.contactCaption?.trim() ? row.contactCaption : "No description added"}
                                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-950"></div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          );
                        default:
                          return null;
                      }
                    })}
                    <td className={`border-b border-gray-100 px-2 py-3 text-center align-middle sm:px-3 ${actionBodyCellBg} relative`}>
                      <RowLinkOverlay rowId={row.id} label={`Open ${row.contactTitle}`} />
                      <img src={xeroConnected ? "/xero-active.png" : "/xero-inactive.png"} alt={xeroConnected ? "Xero connected" : "Xero not connected"} width={40} height={40} className="mx-auto h-10 w-10 max-h-10 max-w-10 object-contain" />
                    </td>
                    <td className={`border-b border-gray-100 px-2 py-3 text-center align-middle sm:px-3 ${actionBodyCellBg}`}>
                      <button type="button" data-row-menu-trigger disabled={isVoided || isRowPublishing} className={rowMenuButtonClass} aria-label={isRowPublishing ? `${rowPublishPending?.mode === "republish" ? "Republishing" : "Publishing"} ${row.contactTitle} to Xero` : isVoided ? `Voided — row actions not available for ${row.contactTitle}` : `More options for ${row.contactTitle}`} aria-busy={isRowPublishing ? true : undefined} aria-expanded={rowMenu?.rowId === row.id ? "true" : "false"} aria-haspopup={isVoided || isRowPublishing ? undefined : "menu"} onClick={(e) => { e.stopPropagation(); if (isVoided || isRowPublishing) return; toggleRowMenu(row.id, e.currentTarget); }}>
                        <span className={`material-symbols-outlined text-[22px] leading-none${isRowPublishing ? " animate-spin text-secondary" : ""}`} aria-hidden>{isRowPublishing ? "progress_activity" : "more_vert"}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {bankSlipDetailsRowId != null && bankSlipDetailsPayload ? (
        <BankSlipDetailsModal
          open
          onClose={() => setBankSlipDetailsRowId(null)}
          details={bankSlipDetailsPayload}
          allowRemoveFiles={!bankSlipDetailsReadOnly}
          onBankSlipFileDeleted={onBankSlipUploaded}
          inlineUploadBillContext={
            !bankSlipDetailsReadOnly && bankSlipDetailsRowId
              ? { billId: bankSlipDetailsRowId }
              : undefined
          }
          onInlineUploadSuccess={onBankSlipUploaded}
        />
      ) : null}
      {rowMenu
        ? createPortal(
            <div data-row-menu-panel role="menu" aria-label="Row actions" className="fixed z-[400] rounded-lg border border-gray-200 bg-white py-1 shadow-lg" style={{ top: rowMenu.top, left: rowMenu.left, minWidth: ROW_MENU_MIN_WIDTH_PX }}>
              {showRowMenuPublish ? (
                <button type="button" role="menuitem" className="block w-full cursor-pointer px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-gray-100" onClick={() => { const id = rowMenu.rowId; setRowMenu(null); void runRowPublish(id, "publish", onRowPublish); }}>
                  Publish
                </button>
              ) : null}
              {showRowMenuRepublish ? <button type="button" role="menuitem" className="block w-full cursor-pointer px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-gray-100" onClick={() => { const id = rowMenu.rowId; setRowMenu(null); void runRowPublish(id, "republish", onRowRepublish); }}>Republish</button> : null}
              <button type="button" role="menuitem" disabled={isRowMenuDeleteDisabled} className="block w-full cursor-pointer px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { if (isRowMenuDeleteDisabled) return; const id = rowMenu.rowId; setRowMenu(null); setRowDeleteConfirmId(id); }}>
                {rowMenuRow?.status === "Draft" ? "Delete" : "Void"}
              </button>
            </div>,
            document.body,
          )
        : null}
      {columnsMenu
        ? createPortal(
            <div data-columns-menu-panel role="dialog" aria-label="Columns selector" className="fixed z-[400] w-[min(18rem,calc(100vw-1rem))] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg" style={{ top: columnsMenu.top, left: columnsMenu.left }}>
              <div className="border-b border-gray-200 px-3 py-2">
                <h3 className="text-sm font-semibold text-primary">Columns</h3>
                <p className="mt-1 text-xs leading-snug text-primary/65">Select columns to show in the table.</p>
              </div>
              <ul className="max-h-[min(22rem,55dvh)] overflow-y-auto overscroll-contain py-1">
                {COLUMN_SELECTOR_ITEMS.map((item) => (
                  <li key={item.key}>
                    <label className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-gray-100">
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <input
                        type="checkbox"
                        className={HEADER_CHECKBOX_CLASS}
                        checked={columnVisibilityDraft[item.key]}
                        onChange={() =>
                          setColumnVisibilityDraft((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                        }
                        aria-label={`Toggle ${item.label} column`}
                        suppressHydrationWarning
                      />
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2 border-t border-gray-200 px-3 py-2">
                <button
                  type="button"
                  className="inline-flex h-9 min-h-[44px] w-full min-w-0 flex-1 items-center justify-center rounded-lg border-2 border-secondary bg-white px-4 text-sm font-semibold text-secondary transition-colors hover:bg-secondary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:min-h-9"
                  onClick={() => setColumnVisibilityDraft({ ...DEFAULT_COLUMN_VISIBILITY })}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 min-h-[44px] w-full min-w-0 flex-1 items-center justify-center rounded-lg bg-secondary px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:min-h-9"
                  onClick={() => {
                    const next = { ...columnVisibilityDraft };
                    setColumnVisibility(next);
                    persistColumnVisibility(next);
                    setColumnsMenu(null);
                  }}
                >
                  Apply
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
      <RowDeleteConfirmModal
        open={rowDeleteConfirmId != null}
        contactTitle={rowDeleteContactTitle}
        isDraft={rowDeleteIsDraft}
        pending={rowDeletePending}
        onClose={() => {
          if (!rowDeletePending) setRowDeleteConfirmId(null);
        }}
        onConfirm={confirmRowDelete}
      />
    </div>
  );
}

export { COLUMN_TITLES };
