/**
 * Part 14 field anatomy: label, the control, then helper OR error (the error replaces the helper).
 * Inputs and selects are 44px, radius 12, border/input (>= 3:1); an error is a 2px danger ring.
 *
 * VALIDATION TIMING is the caller's, by the owner's rule (CLAUDE.md "Validation while typing",
 * 2026-10-13 - a deliberate exception to Part 14's "validate on blur"):
 *   - format, length and range messages appear and clear AS THE USER TYPES;
 *   - a message that only means "not finished yet" (a half-typed date or email) waits for blur;
 *   - an EMPTY required field turns red only after a refused submit - typing never paints an
 *     untouched field red.
 * The caller passes `error` exactly when it should show; this component only draws it.
 *
 * REQUIRED: the red `*` shows from the first render (the 2026-10-09 rule), `aria-hidden`; the
 * word "required" reaches assistive technology as screen-reader-only text in the label, and the
 * control gets `aria-required` (Part 15.3: required in text, not only "*").
 */

import { useId, type ReactNode } from "react";

/** The control's own class: Part 14 Input geometry and states. */
export function inputClass(
  invalid = false,
  { readOnly = false, multiline = false }: { readOnly?: boolean; multiline?: boolean } = {},
): string {
  const size = multiline ? "min-h-24 py-3" : "h-11";
  const surface = readOnly ? "bg-surface-sunk" : "bg-surface-card";
  const border = invalid
    ? "border-2 border-action-danger"
    : "border border-border-input focus:border-2 focus:border-border-focus";
  return `block w-full min-w-0 rounded-lg px-3 text-body-m text-text-primary placeholder:text-text-muted outline-none transition-colors duration-100 disabled:cursor-not-allowed disabled:bg-surface-sunk disabled:text-text-disabled ${size} ${surface} ${border}`;
}

export type FieldA11y = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};

export function Field({
  label,
  required = false,
  helper,
  error,
  id: idProp,
  className,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  helper?: ReactNode;
  /** Shown when given - the caller decides WHEN (see the timing rule above). */
  error?: ReactNode;
  id?: string;
  className?: string;
  children: (a11y: FieldA11y) => ReactNode;
}) {
  const auto = useId();
  const id = idProp ?? `f${auto.replace(/:/g, "")}`;
  const noteId = `${id}-note`;
  const note = error ?? helper;
  const a11y: FieldA11y = {
    id,
    ...(note ? { "aria-describedby": noteId } : {}),
    ...(error ? { "aria-invalid": true as const } : {}),
    ...(required ? { "aria-required": true as const } : {}),
  };
  return (
    <div className={`flex min-w-0 flex-col gap-1.5${className ? ` ${className}` : ""}`}>
      <label htmlFor={id} className="text-label text-text-secondary">
        {label}
        {required ? (
          <>
            <span className="text-action-danger" aria-hidden>
              {" *"}
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </label>
      {children(a11y)}
      {note ? (
        <p
          id={noteId}
          className={`text-caption ${error ? "text-status-danger-ink" : "text-text-muted"}`}
          {...(error ? { role: "alert" } : {})}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
