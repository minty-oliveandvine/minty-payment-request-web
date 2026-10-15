"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DateTextField } from "@/components/DateTextField";
import { ThemedSelect } from "@/components/ThemedSelect";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { FilterChip } from "@/components/ui/FilterChip";
import { Icon } from "@/components/ui/Icon";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
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

/** Filter panel field labels — Part 13 `label` style. */
const fieldLabelClass = "mb-1.5 block text-label text-text-secondary";

const textInputClass = inputClass();

const filterDateTextClass = inputClass();
const filterDateCalendarBtnClass = "hidden";

/** The toolbar's square icon buttons (Filter): 44px, Part 14 Secondary outline. */
const iconButtonClass =
  "box-border inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-default bg-surface-card text-text-secondary transition-colors duration-100 hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";

/** The menus the toolbar opens: elevation 1 on the raised surface. */
const menuPanelClass = "fixed z-[400] rounded-lg border border-border-default bg-surface-raised py-1 shadow-overlay";
const menuItemClass =
  "block min-h-11 w-full cursor-pointer px-3 py-2.5 text-left text-body-m text-text-primary transition-colors hover:bg-state-hover focus-visible:bg-state-hover focus-visible:outline-none";

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
  /** Live counts per chip (Part 15.17); "All" counts everything but Voided. */
  statusCounts?: Partial<Record<string, number>>;
  /** Easy view or Table view - offered from 768px; a phone always gets the rows. */
  easyView?: boolean;
  onEasyViewChange?: (next: boolean) => void;
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

const BULK_MENU_MIN_WIDTH_PX = 200;

export function PaymentRequestToolbar({
  activeStatuses,
  onActiveStatusesChange,
  statusCounts,
  easyView = true,
  onEasyViewChange,
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
  const { isViewOnly } = useUserRole();
  const filterFieldIds = useId();
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterMenu, setFilterMenu] = useState<FilterMenuState | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMenu, setBulkMenu] = useState<BulkMenuState | null>(null);
  const filterWrapRef = useRef<HTMLDivElement | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const bulkWrapRef = useRef<HTMLDivElement | null>(null);
  const bulkButtonRef = useRef<HTMLButtonElement | null>(null);
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


  // Part 15.4 / 15.17 list toolbar: Search + [Easy view | Table view] + Filter + Bulk, then the
  // status chips with live counts. A phone scrolls the chips sideways (Part 14 Filter chip).
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-3 px-4 sm:px-6 lg:px-8">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:flex-nowrap md:gap-3">
        <label htmlFor="payment-request-search" className="sr-only">
          Search supplier, description or amount
        </label>
        {/*
          A form, not an onKeyDown handler: phone keyboards show a Search/Go key rather
          than Enter, and Android IMEs report `key === "Unidentified"` mid-composition,
          so a keydown test can never fire there. Submitting works on both.
        */}
        <form
          role="search"
          className="relative min-w-0 flex-1 basis-[12rem] md:max-w-[360px]"
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSubmit?.();
          }}
        >
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-muted">
            <Icon name="search" size="md" />
          </span>
          <input
            id="payment-request-search"
            type="search"
            name="q"
            value={searchQuery ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && searchQuery) {
                e.preventDefault();
                onSearchChange("");
              }
            }}
            placeholder="Search supplier, description or amount"
            autoComplete="off"
            enterKeyHint="search"
            className={`${inputClass()} pl-10`}
            suppressHydrationWarning
          />
        </form>
        {onEasyViewChange ? (
          // Offered from 768px only: a phone always gets the rows (Table view hidden below 768).
          <div className="hidden shrink-0 md:block">
            <SegmentedControl
              label="View"
              className="w-[15rem]"
              value={easyView ? "easy" : "table"}
              onChange={(v) => onEasyViewChange(v === "easy")}
              options={[
                { value: "easy", label: "Easy view" },
                { value: "table", label: "Table view" },
              ]}
            />
          </div>
        ) : null}
        <div className="flex shrink-0 items-center gap-2 md:ml-auto">
          <div ref={filterWrapRef} className="relative">
            <button
              ref={filterButtonRef}
              type="button"
              aria-label="Filter"
              aria-expanded={filterOpen ? "true" : "false"}
              aria-haspopup="dialog"
              onClick={() => {
                if (!filterButtonRef.current) return;
                toggleFilterMenu(filterButtonRef.current);
              }}
              className={iconButtonClass}
            >
              <Icon name="filter_alt" size="md" />
            </button>
            {filterOpen && filterMenu && typeof document !== "undefined"
              ? createPortal(
                  <div
                    data-filter-menu-panel
                    role="dialog"
                    aria-label="Filters"
                    className="fixed z-[400] overflow-hidden rounded-lg border border-border-default bg-surface-raised shadow-overlay"
                    style={{ top: filterMenu.top, left: filterMenu.left, width: filterMenu.width }}
                  >
                    <div className="border-b border-border-subtle px-4 py-3">
                      <h3 className="text-title-m text-text-primary">Filters</h3>
                      <p className="mt-1 text-body-s text-text-secondary">
                        Choose what to show, then Apply. Closing without applying keeps the current filters.
                      </p>
                    </div>
                    <div className="px-4 py-4" onMouseDown={(e) => e.stopPropagation()}>
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
                              className={`${textInputClass} text-right tabular-nums`}
                            />
                            <span className="shrink-0 text-label text-text-secondary">to</span>
                            <input
                              id={`${filterFieldIds}-max-amount`}
                              type="text"
                              inputMode="decimal"
                              aria-label="Amount to"
                              value={maxAmount ?? ""}
                              onChange={(e) => {
                                const value = acceptAmountInput(e.target.value);
                                if (value === null) return;
                                setMaxAmount(value);
                              }}
                              onFocus={() => setMaxAmount(toAmountEditString(maxAmount))}
                              onBlur={(e) => setMaxAmount(formatAmount(e.target.value))}
                              placeholder="0.00"
                              className={`${textInputClass} text-right tabular-nums`}
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor={`${filterFieldIds}-xero-status`} className={fieldLabelClass}>
                            Xero status
                          </label>
                          <ThemedSelect
                            id={`${filterFieldIds}-xero-status`}
                            value={xeroStatus ?? ""}
                            onChange={setXeroStatus}
                            options={[...FILTER_XERO_STATUS_OPTIONS]}
                            ariaLabel="Xero status"
                            plainChevron
                          />
                        </div>
                        {/* Sits directly above the date range it governs. */}
                        <div>
                          <label htmlFor={`${filterFieldIds}-date-type`} className={fieldLabelClass}>
                            Date type
                          </label>
                          <ThemedSelect
                            id={`${filterFieldIds}-date-type`}
                            value={dateType ?? ""}
                            onChange={setDateType}
                            options={[...FILTER_DATE_TYPE_OPTIONS]}
                            placeholder="Select date type"
                            ariaLabel="Date type"
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
                    <div className="flex gap-3 border-t border-border-subtle px-4 py-3" onMouseDown={(e) => e.stopPropagation()}>
                      <Button kind="secondary" full onClick={onResetFilterDraft}>
                        Reset
                      </Button>
                      <Button kind="primary" full onClick={onSaveFilterChanges}>
                        Apply
                      </Button>
                    </div>
                  </div>,
                  document.body,
                )
              : null}
          </div>
          <div ref={bulkWrapRef} className="relative hidden sm:block">
            <Button
              ref={bulkButtonRef}
              kind="secondary"
              aria-label={bulkSelectedCount > 0 ? `Bulk actions, ${bulkSelectedCount} selected` : "Bulk actions"}
              aria-expanded={bulkMenuOpen ? "true" : "false"}
              aria-haspopup="menu"
              disabled={!bulkActionsEnabled}
              title={bulkActionsEnabled ? undefined : "Select at least two payment requests"}
              onClick={() => {
                if (!bulkButtonRef.current) return;
                toggleBulkMenu(bulkButtonRef.current);
              }}
            >
              {bulkSelectedCount > 0 ? `Bulk Actions (${bulkSelectedCount})` : "Bulk Actions"}
            </Button>
            {bulkMenuOpen && bulkMenu && typeof document !== "undefined"
              ? createPortal(
                  <div
                    data-bulk-menu-panel
                    role="menu"
                    aria-label="Bulk actions"
                    className={menuPanelClass}
                    style={{ top: bulkMenu.top, left: bulkMenu.left, minWidth: bulkMenu.minWidth }}
                  >
                    {!isViewOnly && canPublish ? (
                      <button
                        type="button"
                        role="menuitem"
                        className={menuItemClass}
                        onClick={() => {
                          onBulkPublishSelected?.();
                          setBulkOpen(false);
                          setBulkMenu(null);
                        }}
                      >
                        Publish
                      </button>
                    ) : null}
                    {/* Danger last (Part 14 Menu); it opens a Destructive confirmation. */}
                    {!isViewOnly && !(selectionContainsPaid && !canVoidPaid) ? (
                      <button
                        type="button"
                        role="menuitem"
                        className={`${menuItemClass} text-action-danger`}
                        onClick={() => {
                          onBulkDeleteSelected?.();
                          setBulkOpen(false);
                          setBulkMenu(null);
                        }}
                      >
                        Void
                      </button>
                    ) : null}
                    {isViewOnly ? (
                      <div className="select-none px-3 py-2 text-body-m text-text-disabled">View-only access</div>
                    ) : null}
                  </div>,
                  document.body,
                )
              : null}
          </div>
        </div>
      </div>

      <div
        className="-mx-4 flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="Filter by status"
      >
        {PAYMENT_REQUEST_STATUS_FILTERS.map((label) => {
          const isAllPill = label === "All";
          const isActive = isAllPill ? activeStatuses.length === 0 : activeStatuses.includes(label);
          return (
            <FilterChip
              key={label}
              label={label}
              count={statusCounts?.[label]}
              selected={isActive}
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
            />
          );
        })}
      </div>
    </div>
  );
}
