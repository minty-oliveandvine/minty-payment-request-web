"use client";

export type BillDraftSubmitButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
};

const submitButtonClass =
  "inline-flex h-10 min-h-[44px] w-auto max-w-full shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-secondary px-5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50 sm:px-7";

export function BillDraftSubmitButton({ onClick, disabled, pending }: BillDraftSubmitButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className={submitButtonClass}
      aria-busy={pending ? true : undefined}
    >
      <span className="whitespace-nowrap">{pending ? "Submitting…" : "Submit"}</span>
    </button>
  );
}
