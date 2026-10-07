"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DateTextField } from "@/components/DateTextField";
import { PaymentRequestModal } from "@/components/PaymentRequestModal";
import { ThemedSelect } from "@/components/ThemedSelect";
import { useUserRole } from "@/lib/useUserRole";
import { acceptAmountInput, formatAmount, toAmountEditString } from "@/lib/amountFormat";

const FILTER_DATE_TYPE_OPTIONS = [
  { value: "Invoice Date", label: "Invoice Date" },
  { value: "Submitted Date", label: "Submitted Date" },
] as const;

/** The date range means invoice date unless the user says otherwise. */
export const DEFAULT_FILTER_DATE_TYPE = "Invoice Date";

/** Xero publish state. Empty value = "All" (no filter). */
const FILTER_XERO_STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Not published" },
] as const;

/** Filter panel field labels — sentence case (not all-caps). */
const fieldLabelClass = "mb-1.5 block text-[11px] font-semibold tracking-wide text-gray-700 sm:text-xs";

const textInputClass =
  "box-border h-11 min-h-[44px] w-full rounded-2xl border border-gray-300 bg-white px-3 text-base text-black placeholder:text-gray-700 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25 sm:min-h-11 sm:text-sm";

const filterDateTextClass =
  "relative z-[1] box-border h-11 min-h-[44px] w-full rounded-2xl border border-gray-300 bg-white py-0 pl-3 pr-11 text-base text-black placeholder:text-gray-700 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25 [color-scheme:light] sm:min-h-11 sm:text-sm";
/** Same calendar control styling as payment history (`RecordPaymentModal`). */
const filterDateCalendarBtnClass =
  "absolute right-0 top-0 z-[3] box-border flex h-11 min-h-[44px] w-11 min-w-[44px] cursor-pointer items-center justify-center rounded-r-2xl border border-gray-300 bg-gray-100 text-primary transition-colors hover:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:min-h-11";

export const PAYMENT_REQUEST_STATUS_FILTERS = ["All", "Payment Requested", "Partially Paid", "Returned", "Paid", "Draft", "Voided"] as const;
export type PaymentRequestStatusFilter = (typeof PAYMENT_REQUEST_STATUS_FILTERS)[number];

type AdvancedFilters = {
  minAmount?: string;
  maxAmount?: string;
  dateType?: string;
  startDate?: string;
  endDate?: string;
  xeroStatus?: string;
};

type PaymentRequestToolbarProps = {
  /** Empty array = "All" pill active. Multiple entries = stacked filter (desktop only). */
  activeStatuses: PaymentRequestStatusFilter[];
  onActiveStatusesChange: (statuses: PaymentRequestStatusFilter[]) => void;
  onBillCreated?: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  /** Fired on Enter (desktop) or the Search key (mobile keyboards) — narrows to an exact match. */
  onSearchSubmit?: () => void;
  bulkActionsEnabled: boolean;
  bulkSelectedCount?: number;
  onBulkDeleteSelected?: () => void;
  onBulkPublishSelected?: () => void;
  /** Persists advanced filters to the list (only when the user clicks Save changes). */
  onApplyFilters?: (filters: AdvancedFilters) => void;
  /** Advanced filters currently applied to the list — used to fill the panel when it opens. */
  appliedMinAmount?: string;
  appliedMaxAmount?: string;
  appliedDateType?: string;
  appliedStartDate?: string;
  appliedEndDate?: string;
  appliedXeroStatus?: string;
  /** True when the current selection contains at least one Paid bill. */
  selectionContainsPaid?: boolean;
  /** Whether the current user may void Paid/Authorised bills (elevated roles only). */
  canVoidPaid?: boolean;
  /** Whether the current user may publish to Xero (elevated roles only). */
  canPublish?: boolean;
};
type FilterMenuState = { top: number; left: number; width: number };
type BulkMenuState = { top: number; left: number; minWidth: number };
type StatusMenuState = { top: number; left: number; width: number };

const BULK_MENU_MIN_WIDTH_PX = 200;

export function PaymentRequestToolbar({
  activeStatuses,
  onActiveStatusesChange,
  onBillCreated,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  bulkActionsEnabled,
  bulkSelectedCount = 0,
  onBulkDeleteSelected,
  onBulkPublishSelected,
  onApplyFilters,
  appliedMinAmount = "",
  appliedMaxAmount = "",
  appliedDateType = "",
  appliedStartDate = "",
  appliedEndDate = "",
  appliedXeroStatus = "",
  selectionContainsPaid = false,
  canVoidPaid = false,
  canPublish = false,
}: PaymentRequestToolbarProps) {
  const { hasAnyRole, isViewOnly } = useUserRole();
  const filterFieldIds = useId();
  // Mobile dropdown is single-select: 0 → "All", 1 → that label, 2+ → "Multiple".
  const mobileStatusLabel =
    activeStatuses.length === 0
      ? "All"
      : activeStatuses.length === 1
        ? activeStatuses[0]!
        : "Multiple";
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [billModalMounted, setBillModalMounted] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterMenu, setFilterMenu] = useState<FilterMenuState | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMenu, setBulkMenu] = useState<BulkMenuState | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusMenu, setStatusMenu] = useState<StatusMenuState | null>(null);
  const filterWrapRef = useRef<HTMLDivElement | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const bulkWrapRef = useRef<HTMLDivElement | null>(null);
  const bulkButtonRef = useRef<HTMLButtonElement | null>(null);
  const statusWrapRef = useRef<HTMLDivElement | null>(null);
  const statusButtonRef = useRef<HTMLButtonElement | null>(null);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [dateType, setDateType] = useState<string>(DEFAULT_FILTER_DATE_TYPE);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [xeroStatus, setXeroStatus] = useState("");
  /** The date range applies to whichever field Date Type names. */
  const dateRangeNoun = dateType === "Submitted Date" ? "Submitted" : "Invoice";

  /**
   * When the filter panel opens, show the last saved filters (discard any unsaved draft from a
   * previous close).
   *
   * Called from the handler that opens the panel rather than from an effect watching `filterOpen`:
   * seeding the draft is a consequence of that click, not of the render that follows it. ("Reset"
   * keeps the panel open and sets the draft itself, so it does not go through here.)
   */
  const seedFilterDraftFromApplied = () => {
    setMinAmount(appliedMinAmount ?? "");
    setMaxAmount(appliedMaxAmount ?? "");
    setDateType(appliedDateType || DEFAULT_FILTER_DATE_TYPE);
    setStartDate(appliedStartDate ?? "");
    setEndDate(appliedEndDate ?? "");
    setXeroStatus(appliedXeroStatus ?? "");
  };

  useEffect(() => {
    if (!filterOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const t = event.target;
      if (filterWrapRef.current?.contains(t as Node)) return;
      if (t instanceof Element && t.closest("[data-filter-menu-panel]")) return;
      if (t instanceof Element && t.closest("[data-themed-select-menu]")) return;
      setFilterOpen(false);
      setFilterMenu(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFilterOpen(false);
        setFilterMenu(null);
      }
    };
    const onResizeOrScroll = () => {
      // Reposition the menu to stay anchored to its button rather than closing.
      // Closing here broke interacting with fields inside the panel: focusing the
      // amount input (or switching between fields) scrolls it into view / opens the
      // mobile keyboard, both of which fire scroll/resize and dismissed the filter.
      // This matches how ThemedSelect / BillContactPicker handle scroll & resize.
      const trigger = filterButtonRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const maxWidth = Math.min(416, window.innerWidth - viewportPadding * 2);
      const left = Math.max(viewportPadding, Math.min(rect.right - maxWidth, window.innerWidth - maxWidth - viewportPadding));
      const top = rect.bottom + 8;
      setFilterMenu({ top, left, width: maxWidth });
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", onResizeOrScroll);
    window.addEventListener("scroll", onResizeOrScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", onResizeOrScroll);
      window.removeEventListener("scroll", onResizeOrScroll, true);
    };
  }, [filterOpen]);

  // Whether the bulk menu is actually open: derived, not stored. Losing the selection disables
  // bulk actions, and the menu must not be open then - which used to be an effect that closed it
  // after the fact. Deriving it means there is no moment where the two disagree, and the stale
  // `bulkOpen` behind it is harmless because nothing reads it directly (toggleBulkMenu already
  // refuses while disabled).
  const bulkMenuOpen = bulkOpen && bulkActionsEnabled;

  useEffect(() => {
    if (!bulkMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const t = event.target;
      if (bulkWrapRef.current?.contains(t as Node)) return;
      if (t instanceof Element && t.closest("[data-bulk-menu-panel]")) return;
      setBulkOpen(false);
      setBulkMenu(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBulkOpen(false);
        setBulkMenu(null);
      }
    };
    const onResizeOrScroll = () => {
      setBulkOpen(false);
      setBulkMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", onResizeOrScroll);
    window.addEventListener("scroll", onResizeOrScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", onResizeOrScroll);
      window.removeEventListener("scroll", onResizeOrScroll, true);
    };
  }, [bulkMenuOpen]);

  useEffect(() => {
    if (!statusOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const t = event.target;
      if (statusWrapRef.current?.contains(t as Node)) return;
      if (t instanceof Element && t.closest("[data-status-menu-panel]")) return;
      setStatusOpen(false);
      setStatusMenu(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStatusOpen(false);
        setStatusMenu(null);
      }
    };
    const onResizeOrScroll = () => {
      setStatusOpen(false);
      setStatusMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", onResizeOrScroll);
    window.addEventListener("scroll", onResizeOrScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", onResizeOrScroll);
      window.removeEventListener("scroll", onResizeOrScroll, true);
    };
  }, [statusOpen]);


  const toggleBulkMenu = (trigger: HTMLButtonElement) => {
    if (!bulkActionsEnabled) return;
    setBulkOpen((open) => {
      if (open) {
        setBulkMenu(null);
        return false;
      }
      const rect = trigger.getBoundingClientRect();
      const left = Math.max(8, rect.right - BULK_MENU_MIN_WIDTH_PX);
      const top = rect.bottom + 8;
      setBulkMenu({ top, left, minWidth: BULK_MENU_MIN_WIDTH_PX });
      return true;
    });
  };

  /** Instead, once "Reset" button is clicked, the filter should be reset without clicking "Apply" */
  const onResetFilterDraft = () => {
    setMinAmount("");
    setMaxAmount("");
    setDateType(DEFAULT_FILTER_DATE_TYPE);
    setStartDate("");
    setEndDate("");
    setXeroStatus("");
    onApplyFilters?.({ minAmount: "", maxAmount: "", dateType: DEFAULT_FILTER_DATE_TYPE, startDate: "", endDate: "", xeroStatus: "" });
    setFilterOpen(true);
    if (filterButtonRef.current) {
      // Use filterButtonRef instead of trigger parameter
      const rect = filterButtonRef.current.getBoundingClientRect();
      const viewportPadding = 8;
      const maxWidth = Math.min(416, window.innerWidth - viewportPadding * 2);
      const left = Math.max(viewportPadding, Math.min(rect.right - maxWidth, window.innerWidth - maxWidth - viewportPadding));
      const top = rect.bottom + 8;
      setFilterMenu({ top, left, width: maxWidth });
    }
  };
  

  const onSaveFilterChanges = () => {
    onApplyFilters?.({ minAmount, maxAmount, dateType, startDate, endDate, xeroStatus });
    setFilterOpen(false);
    setFilterMenu(null);
  };

  const toggleFilterMenu = (trigger: HTMLButtonElement) => {
    if (!filterOpen) seedFilterDraftFromApplied();
    setFilterOpen((open) => {
      if (open) {
        setFilterMenu(null);
        return false;
      }
      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const maxWidth = Math.min(416, window.innerWidth - viewportPadding * 2);
      const left = Math.max(viewportPadding, Math.min(rect.right - maxWidth, window.innerWidth - maxWidth - viewportPadding));
      const top = rect.bottom + 8;
      setFilterMenu({ top, left, width: maxWidth });
      return true;
    });
  };

  const toggleStatusMenu = (trigger: HTMLButtonElement) => {
    setStatusOpen((open) => {
      if (open) {
        setStatusMenu(null);
        return false;
      }
      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const width = Math.min(Math.max(rect.width, 200), window.innerWidth - viewportPadding * 2);
      const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
      const top = rect.bottom + 8;
      setStatusMenu({ top, left, width });
      return true;
    });
  };

  return (
    <>
    <div className="mx-auto flex w-full min-w-0 max-w-[1920px] flex-col gap-3 bg-white px-4 py-3 sm:px-6 sm:py-4 xl:flex-row xl:items-center xl:justify-between xl:gap-6">
      <div className="-mx-4 flex min-w-0 flex-wrap items-center gap-2 px-4 sm:mx-0 sm:px-0">
        <button type="button" disabled={!hasAnyRole || isViewOnly} title={isViewOnly ? "Hmm, I can't let you in there. You have view-only access." : undefined} onClick={() => { if (!isViewOnly) { setBillModalMounted(true); setBillModalOpen(true); } }} className="box-border inline-flex h-10 min-h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-transparent bg-secondary px-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50 sm:h-[42px] sm:min-h-[42px] sm:px-4">Add Payment<span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>add</span></button>
        <div ref={statusWrapRef} className="relative min-w-0 flex-1 min-[925px]:hidden">
          <button ref={statusButtonRef} type="button" aria-label={`Status: ${mobileStatusLabel}`} aria-expanded={statusOpen ? "true" : "false"} aria-haspopup="menu" onClick={() => { if (!statusButtonRef.current) return; toggleStatusMenu(statusButtonRef.current); }} className="box-border flex h-10 min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-primary/25 bg-white px-3 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
            <span className="min-w-0 truncate">{mobileStatusLabel}</span>
            <span className="material-symbols-outlined shrink-0 text-[22px] leading-none text-primary/70" aria-hidden>{statusOpen ? "expand_less" : "expand_more"}</span>
          </button>
          {statusOpen && statusMenu && typeof document !== "undefined"
            ? createPortal(
                <div data-status-menu-panel role="menu" aria-label="Filter by status" className="fixed z-[400] max-h-[min(70vh,320px)] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg" style={{ top: statusMenu.top, left: statusMenu.left, width: statusMenu.width }}>
                  {PAYMENT_REQUEST_STATUS_FILTERS.map((label) => {
                    const isActive =
                      label === "All" ? activeStatuses.length === 0 : activeStatuses.length === 1 && activeStatuses[0] === label;
                    return (
                      <button key={label} type="button" role="menuitem" className={`block w-full cursor-pointer px-3 py-2.5 text-left text-sm font-medium transition-colors ${isActive ? "bg-secondary/15 text-secondary" : "text-primary hover:bg-gray-100"}`} onClick={() => { onActiveStatusesChange(label === "All" ? [] : [label]); setStatusOpen(false); setStatusMenu(null); }}>
                        {label}
                      </button>
                    );
                  })}
                </div>,
                document.body,
              )
            : null}
        </div>
        <div className="hidden min-w-0 flex-1 touch-pan-x gap-2 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] min-[925px]:flex min-[925px]:flex-wrap min-[925px]:touch-auto min-[925px]:overflow-visible [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Filter by status">
          {PAYMENT_REQUEST_STATUS_FILTERS.map((label) => {
            const isAllPill = label === "All";
            const isActive = isAllPill ? activeStatuses.length === 0 : activeStatuses.includes(label);
            return (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={isActive ? "true" : "false"}
                onClick={() => {
                  if (isAllPill) {
                    onActiveStatusesChange([]);
                    return;
                  }
                  if (activeStatuses.includes(label)) {
                    onActiveStatusesChange(activeStatuses.filter((s) => s !== label));
                  } else {
                    onActiveStatusesChange([...activeStatuses, label]);
                  }
                }}
                className={`box-border inline-flex h-10 min-h-10 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors sm:h-[42px] sm:min-h-[42px] sm:px-4 sm:text-sm md:text-base ${isActive ? "border-secondary bg-secondary/15 text-secondary" : "border-primary/25 text-primary hover:bg-primary/10"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex w-full min-w-0 flex-row items-center gap-2 sm:gap-2 xl:w-auto xl:max-w-3xl xl:flex-1">
        <label htmlFor="payment-request-search" className="sr-only">
          Search by supplier, description or amount
        </label>
        {/*
          A form, not an onKeyDown handler: phone keyboards show a Search/Go key rather
          than Enter, and Android IMEs report `key === "Unidentified"` mid-composition,
          so a keydown test can never fire there. Submitting works on both.
        */}
        <form
          className="relative min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSubmit?.();
          }}
        >
          <input id="payment-request-search" type="search" name="q" value={searchQuery ?? ""} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search by supplier, description or amount" autoComplete="off" enterKeyHint="search" className="box-border h-11 min-h-[44px] w-full rounded-lg border border-primary/25 bg-white py-0 pl-3 pr-3 text-base leading-normal text-black placeholder:text-gray-700 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/30 sm:h-[42px] sm:min-h-[42px] sm:text-sm" suppressHydrationWarning />
        </form>
        <div className="flex shrink-0 items-center gap-2">
          <div ref={filterWrapRef} className="relative">
            <button ref={filterButtonRef} type="button" aria-label="Filter" aria-expanded={filterOpen ? "true" : "false"} aria-haspopup="dialog" onClick={() => { if (!filterButtonRef.current) return; toggleFilterMenu(filterButtonRef.current); }} className="box-border inline-flex h-11 min-h-[44px] w-11 min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-primary/25 text-primary transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:h-[42px] sm:min-h-[42px] sm:w-[42px] sm:min-w-[42px]"><span className="material-symbols-outlined text-[22px] leading-none">filter_alt</span></button>
            {filterOpen && filterMenu && typeof document !== "undefined"
              ? createPortal(
              <div data-filter-menu-panel role="dialog" aria-label="Filters" className="fixed z-[400] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg" style={{ top: filterMenu.top, left: filterMenu.left, width: filterMenu.width }}>
                <div className="border-b border-gray-200 px-3 py-2">
                  <h3 className="text-sm font-semibold text-primary">Filters</h3>
                  <p className="mt-1 text-xs leading-snug text-primary/65">Adjust criteria, then apply to update the list. Closing without applying keeps the current filters.</p>
                </div>
                <div className="px-3 py-4 sm:px-4" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="flex flex-col gap-5">
                    <div>
                      <label htmlFor={`${filterFieldIds}-min-amount`} className={fieldLabelClass}>
                        Amount
                      </label>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
                        <input
                          id={`${filterFieldIds}-min-amount`}
                          type="text"
                          inputMode="decimal"
                          value={minAmount ?? ""}
                          onChange={(e) => {
                            const value = acceptAmountInput(e.target.value);
                            if (value === null) return;
                            setMinAmount(value);
                          }}
                          onFocus={() => setMinAmount(toAmountEditString(minAmount))}
                          onBlur={(e) => setMinAmount(formatAmount(e.target.value))}
                          placeholder="0.00"
                          className={textInputClass}
                        />
                        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-700 sm:text-xs">To</span>
                        <input
                          id={`${filterFieldIds}-max-amount`}
                          type="text"
                          inputMode="decimal"
                          value={maxAmount ?? ""}
                          onChange={(e) => {
                            const value = acceptAmountInput(e.target.value);
                            if (value === null) return;
                            setMaxAmount(value);
                          }}
                          onFocus={() => setMaxAmount(toAmountEditString(maxAmount))}
                          onBlur={(e) => setMaxAmount(formatAmount(e.target.value))}
                          placeholder="0.00"
                          className={textInputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor={`${filterFieldIds}-xero-status`} className={fieldLabelClass}>
                        Xero Status
                      </label>
                      <ThemedSelect
                        id={`${filterFieldIds}-xero-status`}
                        value={xeroStatus ?? ""}
                        onChange={setXeroStatus}
                        options={[...FILTER_XERO_STATUS_OPTIONS]}
                        ariaLabel="Xero status"
                        triggerClassName="!rounded-2xl"
                        plainChevron
                      />
                    </div>
                    {/* Sits directly above the date range it governs. */}
                    <div>
                      <label htmlFor={`${filterFieldIds}-date-type`} className={fieldLabelClass}>
                        Date Type
                      </label>
                      <ThemedSelect
                        id={`${filterFieldIds}-date-type`}
                        value={dateType ?? ""}
                        onChange={setDateType}
                        options={[...FILTER_DATE_TYPE_OPTIONS]}
                        placeholder="Select date type"
                        ariaLabel="Date type"
                        triggerClassName="!rounded-2xl"
                        plainChevron
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
                      <div>
                        <label htmlFor={`${filterFieldIds}-start-date`} className={fieldLabelClass}>
                          {dateRangeNoun} Start Date
                        </label>
                        <DateTextField
                          id={`${filterFieldIds}-start-date`}
                          value={startDate ?? ""}
                          onChange={setStartDate}
                          calendarAriaLabel={`Open calendar for ${dateRangeNoun.toLowerCase()} start date`}
                          textInputClassName={filterDateTextClass}
                          calendarButtonClassName={filterDateCalendarBtnClass}
                        />
                      </div>
                      <div>
                        <label htmlFor={`${filterFieldIds}-end-date`} className={fieldLabelClass}>
                          {dateRangeNoun} End Date
                        </label>
                        <DateTextField
                          id={`${filterFieldIds}-end-date`}
                          value={endDate ?? ""}
                          onChange={setEndDate}
                          calendarAriaLabel={`Open calendar for ${dateRangeNoun.toLowerCase()} end date`}
                          textInputClassName={filterDateTextClass}
                          calendarButtonClassName={filterDateCalendarBtnClass}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-gray-200 px-3 py-2 sm:px-4" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={onResetFilterDraft} className="box-border h-12 min-h-[48px] w-full min-w-0 flex-1 rounded-lg border-2 border-secondary bg-white px-4 text-sm font-semibold text-secondary transition-colors hover:bg-secondary/10 sm:h-11 sm:min-h-[44px]">Reset</button>
                    <button type="button" onClick={onSaveFilterChanges} className="box-border h-12 min-h-[48px] w-full min-w-0 flex-1 rounded-lg border border-transparent bg-secondary px-5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:h-11 sm:min-h-[44px]">Apply</button>
                  </div>
                </div>
              </div>,
              document.body,
            )
              : null}
          </div>
          <div ref={bulkWrapRef} className="relative hidden sm:block">
            <button ref={bulkButtonRef} type="button" aria-label={bulkSelectedCount > 0 ? `Bulk actions, ${bulkSelectedCount} selected` : "Bulk actions"} aria-expanded={bulkMenuOpen ? "true" : "false"} aria-haspopup="menu" disabled={!bulkActionsEnabled} onClick={() => { if (!bulkButtonRef.current) return; toggleBulkMenu(bulkButtonRef.current); }} className={`box-border inline-flex h-11 min-h-[44px] items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:h-[42px] sm:min-h-[42px] sm:px-4 ${bulkActionsEnabled ? "cursor-pointer border-primary/25 text-primary hover:bg-primary/10" : "cursor-not-allowed border-primary/20 bg-[#F5F5F5] text-primary/45"}`}>{bulkSelectedCount > 0 ? `Bulk Actions (${bulkSelectedCount})` : "Bulk Actions"}</button>
            {bulkMenuOpen && bulkMenu && typeof document !== "undefined"
              ? createPortal(
                  <div data-bulk-menu-panel role="menu" aria-label="Bulk actions" className="fixed z-[400] rounded-lg border border-gray-200 bg-white py-1 shadow-lg" style={{ top: bulkMenu.top, left: bulkMenu.left, minWidth: bulkMenu.minWidth }}>
                    {!isViewOnly && canPublish ? (
                      <button type="button" role="menuitem" className="block w-full cursor-pointer px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-gray-100" onClick={() => { onBulkPublishSelected?.(); setBulkOpen(false); setBulkMenu(null); }}>Publish</button>
                    ) : null}
                    {!isViewOnly && !(selectionContainsPaid && !canVoidPaid) ? (
                      <button type="button" role="menuitem" className="block w-full cursor-pointer px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50" onClick={() => { onBulkDeleteSelected?.(); setBulkOpen(false); setBulkMenu(null); }}>Void</button>
                    ) : null}
                    {isViewOnly ? (
                      <div className="px-3 py-2 text-sm text-gray-400 select-none">View-only access</div>
                    ) : null}
                  </div>,
                  document.body,
                )
              : null}
          </div>
        </div>
      </div>
    </div>
    {billModalMounted ? (
      <PaymentRequestModal open={billModalOpen} onClose={() => setBillModalOpen(false)} onConfirm={onBillCreated} onSaveDraft={onBillCreated} />
    ) : null}
    </>
  );
}
