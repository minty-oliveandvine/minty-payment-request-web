"use client";

/**
 * Part 14 "Segmented control": 2-4 modes, 36px tall on a 3px track, `role=radiogroup`; arrow
 * keys move the choice. Replaces the Easy view switch and the Pay mode control.
 */

import { useRef, type KeyboardEvent } from "react";

/** `disabled` needs its reason shown nearby (Part 15.2) - pass it as `title` and say it in the UI. */
export type Segment<T extends string> = { value: T; label: string; disabled?: boolean; title?: string };

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** The group's accessible name. */
  label: string;
  options: readonly Segment<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    for (let k = 1; k < options.length; k += 1) {
      const next = (i + step * k + options.length * k) % options.length;
      if (options[next].disabled) continue;
      onChange(options[next].value);
      refs.current[next]?.focus();
      return;
    }
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex min-w-0 rounded-lg bg-surface-sunk p-[3px]${className ? ` ${className}` : ""}`}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={`h-9 min-w-0 flex-1 cursor-pointer truncate rounded-md px-3 text-body-s font-semibold transition-colors duration-100 pointer-coarse:h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed disabled:text-text-disabled ${
              on ? "bg-surface-card text-text-primary" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
