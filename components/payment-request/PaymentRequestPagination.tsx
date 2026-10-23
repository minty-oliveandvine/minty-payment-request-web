"use client";

import { useId } from "react";
import { ThemedSelect } from "@/components/ThemedSelect";

export const PAGE_SIZE_OPTIONS = [10, 50, 100] as const;

/** Beyond this many pages the strip collapses to `1 … p-1 p p+1 … last`. */
const MAX_INLINE_PAGES = 7;

const ELLIPSIS = "…";

const pageButtonBase =
  "box-border inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-sm font-medium tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary";

const chevronButtonClass = `${pageButtonBase} border border-gray-300 text-primary hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-primary/30 disabled:hover:bg-transparent`;

export type PaymentRequestPaginationProps = {
  /** 1-based. */
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** True when the fetch-all loop hit its row cap, so the count is a floor. */
  truncated?: boolean;
  className?: string;
};

/** `1 … 4 5 6 … 20` — first, last, and the current page's neighbours. */
export function buildPageItems(page: number, pageCount: number): Array<number | typeof ELLIPSIS> {
  if (pageCount <= MAX_INLINE_PAGES) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const items: Array<number | typeof ELLIPSIS> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) items.push(ELLIPSIS);
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < pageCount - 1) items.push(ELLIPSIS);
  items.push(pageCount);
  return items;
}

export function PaymentRequestPagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  truncated = false,
  className = "",
}: PaymentRequestPaginationProps) {
  // Both views mount a pager simultaneously, so the select id must be unique per instance.
  const selectId = `${useId()}-items-per-page`;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  const items = buildPageItems(page, pageCount);

  return (
    <div
      className={`flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <p className="text-sm text-gray-500 tabular-nums">
        Showing {from}–{to} of {totalItems}
        {truncated ? "+" : ""} items
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <label htmlFor={selectId} className="shrink-0 text-sm text-gray-500">
          Items per page
        </label>
        <ThemedSelect
          id={selectId}
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
          options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
          ariaLabel="Items per page"
          fullWidth={false}
          plainChevron
          centerValue
        />
        {pageCount > 1 ? (
          <nav className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Pagination">
            <button
              type="button"
              className={chevronButtonClass}
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              <span className="material-symbols-outlined text-[20px] leading-none" aria-hidden>
                chevron_left
              </span>
            </button>
            {items.map((item, i) =>
              item === ELLIPSIS ? (
                <span
                  key={`gap-${i}`}
                  className="inline-flex size-9 items-center justify-center text-sm text-gray-400"
                  aria-hidden
                >
                  {ELLIPSIS}
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`${pageButtonBase} ${
                    item === page
                      ? "bg-secondary text-white"
                      : "border border-gray-300 text-primary hover:bg-gray-50"
                  }`}
                  aria-current={item === page ? "page" : undefined}
                  aria-label={`Page ${item}`}
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </button>
              ),
            )}
            <button
              type="button"
              className={chevronButtonClass}
              disabled={page >= pageCount}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              <span className="material-symbols-outlined text-[20px] leading-none" aria-hidden>
                chevron_right
              </span>
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
