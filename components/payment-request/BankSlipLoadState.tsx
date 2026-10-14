"use client";

/**
 * A row's bank slips before their count is known: still loading, or the lookup failed.
 * Neither may show "Upload" - slips may already exist, and an empty modal invites a duplicate.
 */
export function BankSlipLoadState({
  state,
  contactTitle,
  onRetry,
}: {
  state: "loading" | "error";
  contactTitle: string;
  onRetry?: () => void;
}) {
  if (state === "loading") {
    return (
      <span
        role="status"
        aria-label={`Loading bank slips for ${contactTitle}`}
        className="inline-flex h-10 min-h-10 items-center px-2 text-sm text-primary/40"
      >
        …
      </span>
    );
  }
  return (
    <button
      type="button"
      title="Bank slips didn't load"
      aria-label={`Bank slips didn't load for ${contactTitle} — try again`}
      className="inline-flex h-10 min-h-10 min-w-[44px] cursor-pointer items-center justify-center gap-1 rounded-lg border-0 bg-transparent px-2 text-xs font-semibold text-red-600 transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary sm:text-sm"
      onClick={(e) => {
        e.stopPropagation();
        onRetry?.();
      }}
    >
      <span className="material-symbols-outlined shrink-0 text-[20px] leading-none" aria-hidden>
        refresh
      </span>
      <span className="whitespace-nowrap">Retry</span>
    </button>
  );
}
