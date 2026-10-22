"use client";

/**
 * Easy view - the payment requests as Part 14 "Record rows" (Part 15.4 / 15.17, Treasury's
 * default view). Wave 2 of the Part 15 migration (15.H) replaced the old cards here:
 *
 * - a row is identity (supplier, then one metadata line) · the amount in a fixed right-aligned
 *   track · the Status pill · ONE next action (`lib/requestActions.ts`). The whole row opens the
 *   request; the checkbox and the action do their own thing. Status is always a pill - never a
 *   "Pay" button in the Status column (Part 15.2);
 * - Record payment opens the Record payment Drawer (D15-11) - no row expands in place any more,
 *   and the mascot panel beside the list is retired (15.17 migration "Replace");
 * - rows are capped at 960px wide; on a phone they stack as cards (Table view is hidden below
 *   768px, so this is the phone's list).
 *
 * Amounts are always text/primary with tabular figures - never coloured by status (Part 13).
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { formatMoney } from "@minty/shared/money";

import { Button, buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusPill } from "@/components/ui/StatusPill";
import { type SortKey } from "@/lib/paymentRequestRowSort";
import { ACTION_LABEL, rowNextAction } from "@/lib/requestActions";
import { useCompanyPages } from "@/lib/useCompanyPages";

import { BankSlipLoadState } from "./BankSlipLoadState";
import { PaymentRequestDueMeta } from "./PaymentRequestDueMeta";
import { HEADER_CHECKBOX_CLASS } from "./paymentRequestCheckboxClasses";
import type { PaymentRequestRow } from "./PaymentRequestTable";

/** Sortable columns exposed in easy view (same `compareRows` as the main table). */
export type EasyViewSortKey = Extract<
  SortKey,
  "contact" | "submittedDate" | "unpaidAmount" | "status"
>;

const SORTS: { key: EasyViewSortKey; label: string; name: string; title: string }[] = [
  { key: "contact", label: "Supplier", name: "supplier", title: "Sort A-Z" },
  {
    key: "submittedDate",
    label: "Submitted",
    name: "submitted date",
    title: "Sort Newest - Oldest",
  },
  { key: "unpaidAmount", label: "Unpaid", name: "unpaid amount", title: "Sort Highest - Lowest" },
  { key: "status", label: "Status", name: "status", title: "Sort Status" },
];

export type PaymentRequestEasyViewProps = {
  /** The current page slice — already filtered and sorted by `PaymentRequestView`. */
  rows: PaymentRequestRow[];
  loading: boolean;
  /** Sort is owned by the parent so the page slice is taken after sorting. */
  sort: { key: EasyViewSortKey; dir: "asc" | "desc" };
  onSortChange: (key: EasyViewSortKey) => void;
  /** Selection is shared with the table view and spans pages. */
  selectedIds: ReadonlySet<string>;
  onToggleRow: (rowId: string) => void;
  onToggleAll: (rowIds: string[], next: boolean) => void;
  /** Today in the billing timezone, for each row's "Overdue N days" / "Due in N days". */
  todayIso?: string;
  /** Rendered below the list. */
  pagination?: ReactNode;
  /** Opens the Record payment Drawer; `readOnly` for View payments. */
  onRecordPayment: (rowId: string, readOnly: boolean) => void;
  onOpenBankSlipUpload: (rowId: string) => void;
  /** Reloads the bank slip counts after a lookup failed. */
  onRetryBankSlips?: () => void;
  isElevated: boolean;
  isViewOnly: boolean;
  /** Search / chips / filters narrowed the list - an empty list is then "no results", not first use. */
  filtered?: boolean;
  onClearFilters?: () => void;
  /** First use's one action (Part 15.11a). */
  createAction?: ReactNode;
};

function BankSlipMeta({
  row,
  onOpen,
  onRetry,
}: {
  row: PaymentRequestRow;
  onOpen: (billId: string) => void;
  onRetry?: () => void;
}) {
  if (row.bankslipState === "error") {
    return (
      <span className="relative z-10">
        <BankSlipLoadState state="error" contactTitle={row.contactTitle} onRetry={onRetry} />
      </span>
    );
  }
  const n = row.bankslipFileCount;
  if (n == null || n < 1) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen(row.id)}
      className="relative z-10 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-1 text-body-s text-text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus pointer-fine:min-h-6"
      aria-label={`View bank slip — ${n} file${n === 1 ? "" : "s"}${row.status === "Voided" ? ", voided" : row.status === "Draft" ? ", draft" : " uploaded"}`}
    >
      <Icon name="receipt_long" size="sm" />
      {n} bank slip{n === 1 ? "" : "s"}
    </button>
  );
}

function SortButton({
  sort,
  def,
  onSortChange,
}: {
  sort: PaymentRequestEasyViewProps["sort"];
  def: (typeof SORTS)[number];
  onSortChange: (key: EasyViewSortKey) => void;
}) {
  const active = sort.key === def.key;
  return (
    <button
      type="button"
      onClick={() => onSortChange(def.key)}
      aria-pressed={active}
      aria-label={`Sort by ${def.name}${active ? (sort.dir === "asc" ? ", ascending" : ", descending") : ""}`}
      title={def.title}
      className={`inline-flex h-11 shrink-0 cursor-pointer items-center gap-0.5 rounded-md px-2 text-label transition-colors duration-100 hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${active ? "text-text-primary" : "text-text-muted"}`}
    >
      {def.label}
      <Icon
        name={active && sort.dir === "asc" ? "arrow_upward" : "arrow_downward"}
        size="sm"
        className={active ? "" : "opacity-50"}
      />
    </button>
  );
}

export function PaymentRequestEasyView({
  rows,
  loading,
  sort,
  onSortChange,
  selectedIds,
  onToggleRow,
  onToggleAll,
  todayIso,
  pagination,
  onRecordPayment,
  onOpenBankSlipUpload,
  onRetryBankSlips,
  isElevated,
  isViewOnly,
  filtered = false,
  onClearFilters,
  createAction,
}: PaymentRequestEasyViewProps) {
  const pages = useCompanyPages();

  /** "Select all" means everything selectable on this page — selection spans pages. */
  const selectableRows = rows.filter((r) => r.status !== "Voided");
  const allSelected =
    selectableRows.length > 0 && selectableRows.every((r) => selectedIds.has(r.id));
  const someSelected = selectableRows.some((r) => selectedIds.has(r.id)) && !allSelected;

  return (
    // The page's 1200px frame (aligned with the toolbar above), the rows capped at 960 inside it.
    <div className="mx-auto flex w-full max-w-[1200px] min-w-0 flex-col gap-5 px-4 pb-8 sm:px-6 lg:px-8 [&>*]:max-w-[960px]">
      {/* The column header: select-all and the four sorts. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-subtle pb-2">
        <label className="relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={() =>
              onToggleAll(
                selectableRows.map((r) => r.id),
                !allSelected,
              )
            }
            disabled={loading || selectableRows.length === 0}
            className={`${HEADER_CHECKBOX_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label="Select all rows"
            suppressHydrationWarning
          />
        </label>
        <span className="sr-only">Sort by</span>
        {SORTS.map((def) => (
          <SortButton key={def.key} sort={sort} def={def} onSortChange={onSortChange} />
        ))}
      </div>

      {loading ? (
        // Part 15.17: five skeleton rows while the list loads; the region says it is busy.
        <ul className="flex flex-col gap-2" aria-busy="true" aria-label="Loading payment requests">
          {Array.from({ length: 5 }, (_, i) => (
            <li
              key={`sk-${i}`}
              className="flex items-center gap-4 rounded-lg border border-border-subtle bg-surface-card p-4"
              aria-hidden
            >
              <Skeleton className="size-5 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
              <Skeleton className="hidden h-5 w-28 lg:block" />
              <Skeleton className="hidden h-6 w-32 rounded-full lg:block" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        filtered ? (
          // Part 15.11c: no results - no character, and the way back.
          <EmptyState
            title="No payment requests match these filters."
            action={
              onClearFilters ? (
                <Button kind="secondary" onClick={onClearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          // Part 15.11a: first use - Minty, and the one thing to do.
          <EmptyState character title="No payment requests yet" action={createAction}>
            Create one when a supplier bill arrives.
          </EmptyState>
        )
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Payment requests">
          {rows.map((row) => {
            const next = rowNextAction(row.status, { isElevated, isViewOnly });
            const href = pages.request(row.id, row.reference, row.status);
            const selected = selectedIds.has(row.id);
            return (
              <li
                key={row.id}
                data-easy-view-row={row.id}
                className={`relative flex min-w-0 flex-col gap-3 rounded-lg border p-4 transition-colors duration-100 focus-within:border-border-selected lg:flex-row lg:items-center lg:gap-4 ${
                  selected
                    ? "border-border-selected bg-state-selected"
                    : "border-border-subtle bg-surface-card hover:bg-state-hover"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-2 lg:items-center">
                  <label className="relative z-10 -m-3 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={row.status === "Voided"}
                      onChange={() => onToggleRow(row.id)}
                      className={`${HEADER_CHECKBOX_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
                      aria-label={
                        row.status === "Voided"
                          ? `Voided — cannot select ${row.contactTitle}`
                          : `Select row ${row.contactTitle}`
                      }
                      suppressHydrationWarning
                    />
                  </label>
                  <div className="ml-3 flex min-w-0 flex-1 flex-col gap-0.5">
                    {/* The supplier IS the row's link, stretched over the row (after:inset-0),
                        so the whole row opens the request and its controls sit above it. */}
                    <Link
                      href={href}
                      className="min-w-0 truncate text-title-m text-text-primary after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-border-focus"
                    >
                      {row.contactTitle}
                    </Link>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-body-s text-text-secondary">
                      {row.contactCaption?.trim() ? (
                        <span className="min-w-0 max-w-full truncate">{row.contactCaption}</span>
                      ) : null}
                      {row.submittedDate ? (
                        <span className="whitespace-nowrap">
                          {row.contactCaption?.trim() ? "· " : ""}Submitted {row.submittedDate}
                        </span>
                      ) : null}
                      {todayIso ? <PaymentRequestDueMeta row={row} todayIso={todayIso} /> : null}
                      <BankSlipMeta
                        row={row}
                        onOpen={onOpenBankSlipUpload}
                        onRetry={onRetryBankSlips}
                      />
                    </div>
                  </div>
                </div>

                {/* Amount track: 160 wide, right-aligned from lg (Part 14 Record row). */}
                <div
                  className="flex min-w-0 flex-col pl-11 lg:w-40 lg:shrink-0 lg:items-end lg:pl-0"
                  translate="no"
                >
                  <span className="whitespace-nowrap text-title-m tabular-nums text-text-primary">
                    {row.unpaidAmount}
                  </span>
                  {row.invoiceTotal ? (
                    <span className="whitespace-nowrap text-caption tabular-nums text-text-muted">
                      of {formatMoney(row.invoiceTotal, row.currencyCode)}
                    </span>
                  ) : null}
                </div>

                {/* Status + the one next action: a 360 track on a computer. */}
                <div className="relative z-10 flex min-w-0 flex-wrap items-center gap-3 pl-11 lg:w-[360px] lg:shrink-0 lg:flex-nowrap lg:justify-end lg:pl-0">
                  <StatusPill label={row.status} />
                  {next === "record" || next === "viewPayments" ? (
                    <Button
                      kind="secondary"
                      onClick={() => onRecordPayment(row.id, next === "viewPayments")}
                      aria-label={`${ACTION_LABEL[next]} — ${row.contactTitle}`}
                    >
                      {ACTION_LABEL[next]}
                    </Button>
                  ) : next ? (
                    <Link
                      href={href}
                      className={buttonClass("ghost")}
                      aria-label={`${ACTION_LABEL[next]} — ${row.contactTitle}`}
                    >
                      {ACTION_LABEL[next]}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pagination ? <div className="border-t border-border-subtle pt-3">{pagination}</div> : null}
    </div>
  );
}
