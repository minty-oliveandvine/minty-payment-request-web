"use client";

/**
 * Part 15.3 / 15.G error summary: when a submit is refused with MORE THAN ONE problem, a list at
 * the top of the form names each one and links to its field; it takes focus so the person hears
 * it (`aria-live=assertive` - it blocks submission). With exactly one problem, focus the field
 * itself instead and render nothing here.
 *
 * Wording follows Part 11 §11.17-11.18: issue, then the action ("The amount is still empty. Add
 * the amount to continue.") - never "Error", "Invalid" or "Mandatory".
 */

import { useEffect, useRef } from "react";

export type SummaryItem = { fieldId: string; message: string };

export function ErrorSummary({
  items,
  attempt,
}: {
  items: SummaryItem[];
  /** Bumped on every refused submit, so the summary takes focus again on each one. */
  attempt: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const shown = items.length > 1;

  useEffect(() => {
    if (shown && attempt > 0) box.current?.focus();
  }, [shown, attempt]);

  if (!shown) return null;
  return (
    <div
      ref={box}
      tabIndex={-1}
      role="alert"
      aria-live="assertive"
      className="rounded-md bg-status-danger-bg p-3 text-body-m text-status-danger-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
    >
      <p className="font-semibold">{items.length} details need a look before this can be sent.</p>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
        {items.map((it) => (
          <li key={it.fieldId}>
            <a
              href={`#${it.fieldId}`}
              className="underline underline-offset-2"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(it.fieldId)?.focus();
              }}
            >
              {it.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
