/**
 * Part 14 "Button" (v1.1, Minty/docs/design/part-14-component-library.md).
 *
 * Kind = Primary | Secondary | Ghost | Danger | Link. One Primary per context (Part 15.2):
 * Minty Action fill with a white 14px SemiBold label - an owner-accepted contrast exception for
 * CTA labels only (Part 13 AX-01); brand #54D3DA is never a button fill. 44px tall, radius 12,
 * never a pill. `compact` (32px) is only for Ghost/Link inside desktop tables.
 *
 * `processing`: the label becomes the processing text ("Saving…", "Recording…"), the button is
 * disabled and shows a spinner - the double-submit guard every money or status action needs.
 * A disabled button must have its reason shown next to it (Part 15.2); that is the caller's job.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonKind = "primary" | "secondary" | "ghost" | "danger" | "link";

const BASE =
  "inline-flex min-w-0 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg text-button whitespace-nowrap transition-colors duration-100 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed";

const SIZE = {
  regular: "h-11 min-h-11 px-4",
  compact: "h-8 min-h-8 px-3",
  link: "min-h-11 px-1",
} as const;

const KIND: Record<ButtonKind, string> = {
  primary:
    "bg-action-primary text-action-on-primary hover:bg-action-primary-hover active:bg-action-primary-pressed disabled:bg-action-disabled disabled:text-text-disabled",
  secondary:
    "border border-action-secondary-border bg-surface-card text-action-secondary-text hover:bg-state-selected active:bg-state-selected disabled:border-border-default disabled:bg-surface-card disabled:text-text-disabled",
  ghost:
    "bg-transparent text-action-secondary-text hover:bg-state-hover active:bg-state-selected disabled:text-text-disabled disabled:hover:bg-transparent",
  danger:
    "bg-action-danger text-action-on-danger hover:bg-action-danger-hover active:bg-action-danger-hover disabled:bg-action-disabled disabled:text-text-disabled",
  link: "bg-transparent text-text-link underline-offset-2 hover:underline disabled:text-text-disabled disabled:no-underline",
};

/** The class string, for the rare element that must be a link (`<a>`) yet look like a button. */
export function buttonClass(
  kind: ButtonKind = "secondary",
  { compact = false, full = false }: { compact?: boolean; full?: boolean } = {},
): string {
  const size = kind === "link" ? SIZE.link : compact ? SIZE.compact : SIZE.regular;
  return `${BASE} ${size} ${KIND[kind]}${full ? " w-full" : ""}`;
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: ButtonKind;
  /** 32px - Ghost/Link inside desktop tables only. */
  compact?: boolean;
  /** Full width - the phone form's Primary (Part 15.2: first and full width on a phone). */
  full?: boolean;
  /** In flight: disabled, spinner, and this text instead of the label. */
  processing?: boolean;
  processingLabel?: ReactNode;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    kind = "secondary",
    compact = false,
    full = false,
    processing = false,
    processingLabel,
    icon,
    type = "button",
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || processing}
      aria-busy={processing || undefined}
      className={`${buttonClass(kind, { compact, full })}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {processing ? (
        <span
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
          aria-hidden
        />
      ) : (
        icon
      )}
      <span className="min-w-0 truncate">{processing ? (processingLabel ?? children) : children}</span>
    </button>
  );
});
