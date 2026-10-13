/**
 * Part 14 "Filter chip": 32px tall, full radius, label + optional live count, the exact status
 * words. In a list it is a toggle (`aria-pressed`); switching page areas it is a tab - pass
 * `tab` and wrap the set in `role=tablist` (M-01: Minty has no Tabs component). Phones scroll the
 * row sideways, never wrap it into a wall.
 *
 * The visible height is 32px; on a touch screen the hit area is padded to 44px (Part 13 §13.16).
 */

import type { ButtonHTMLAttributes } from "react";

export function FilterChip({
  label,
  count,
  selected,
  tab = false,
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  count?: number;
  selected: boolean;
  tab?: boolean;
}) {
  const state = tab
    ? { role: "tab" as const, "aria-selected": selected, tabIndex: selected ? 0 : -1 }
    : { "aria-pressed": selected };
  return (
    <button
      type="button"
      {...state}
      {...rest}
      className={`relative inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-body-s font-medium whitespace-nowrap transition-colors duration-100 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] pointer-coarse:before:block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
        selected
          ? "border-border-selected bg-state-selected text-text-link"
          : "border-border-default bg-surface-card text-text-secondary hover:bg-state-hover"
      }${className ? ` ${className}` : ""}`}
    >
      {label}
      {count !== undefined ? (
        <span className="tabular-nums text-text-muted" aria-label={`, ${count}`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
