"use client";

import { useId, useState } from "react";

import { useToast } from "@/components/Toast";
import { ApiError, downloadBillsCsv } from "@/lib/api";
import { saveExport } from "@/lib/saveExport";

export const CSV_DOWNLOADED = "Your CSV is downloading.";
export const NOTHING_TO_DOWNLOAD = "There are no bills in the list to download.";
const UNREACHABLE = "We couldn't reach Payment Request. Check your connection, then try again.";

/** The browser's local day, `YYYY-MM-DD`. */
function today(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/**
 * The saved file's name: `bills_` (`bills_selected_` for ticked bills), then the list's date
 * filter - `<start>_to_<end>`, `from_<start>` or `to_<end>` - or today's day when it has none.
 */
export function billsCsvFileName(
  ticked: boolean,
  range: { start?: string; end?: string } = {},
  day: string = today(),
): string {
  const { start, end } = range;
  const span =
    start && end ? `${start}_to_${end}` : start ? `from_${start}` : end ? `to_${end}` : day;
  return `${ticked ? "bills_selected" : "bills"}_${span}.csv`;
}

/**
 * The range a download's name carries: the list's date filter, and for an end it leaves open, the
 * earliest or latest of the downloaded bills' own dates (`dates`, ISO days; a bill with none is
 * skipped). With no filter that is the bills' whole span, as Petty Cash names a whole history.
 */
export function billsCsvRange(
  dates: readonly (string | undefined | null)[],
  filter: { start?: string; end?: string } = {},
): { start?: string; end?: string } {
  const known = dates.filter((d): d is string => Boolean(d)).sort();
  return {
    start: filter.start || known[0] || undefined,
    end: filter.end || known[known.length - 1] || undefined,
  };
}

export type BillCsvDownloadProps = {
  /** The bills to download: the ticked ones, else every bill the list's filters show. */
  ids: readonly string[];
  /** True when `ids` are the ticked bills. */
  ticked: boolean;
  /** The range for the file's name (`billsCsvRange`). */
  startDate?: string;
  endDate?: string;
};

/**
 * "Download CSV" (owner, 2026-11-13): no dialog - it downloads what the list already shows. With
 * bills ticked, those bills; with none ticked, every bill the filters leave (status, search,
 * amount, dates, Xero). One line per bill, from `POST /bills/export.csv`. Shown at every width;
 * held, with its reason for a screen reader, only when the list is empty.
 */
export function BillCsvDownload({ ids, ticked, startDate, endDate }: BillCsvDownloadProps) {
  const { showToast } = useToast();
  const reasonId = useId();
  const [pending, setPending] = useState(false);
  const count = ids.length;
  const empty = count === 0;
  const label = ticked
    ? `Download CSV of ${count} ticked bill${count === 1 ? "" : "s"}`
    : `Download CSV of the ${count} bill${count === 1 ? "" : "s"} shown`;

  async function download() {
    if (empty || pending) return;
    setPending(true);
    try {
      saveExport(
        await downloadBillsCsv({ ids: [...ids] }),
        billsCsvFileName(ticked, { start: startDate, end: endDate }),
      );
      showToast(CSV_DOWNLOADED, "success");
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401))
        showToast(err instanceof ApiError ? err.message : UNREACHABLE, "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void download()}
        disabled={empty || pending}
        aria-label={empty ? "Download CSV" : label}
        aria-describedby={empty ? reasonId : undefined}
        title={empty ? NOTHING_TO_DOWNLOAD : label}
        className="box-border inline-flex h-11 min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-primary/25 px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:bg-[#F5F5F5] disabled:text-primary/45 sm:px-4"
      >
        <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
          download
        </span>
        {pending ? "Downloading…" : ticked ? `Download CSV (${count})` : "Download CSV"}
      </button>
      {empty ? (
        <span id={reasonId} className="sr-only">
          {NOTHING_TO_DOWNLOAD}
        </span>
      ) : null}
    </>
  );
}
