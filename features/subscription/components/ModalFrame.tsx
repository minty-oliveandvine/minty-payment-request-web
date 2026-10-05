"use client";

// COPY of minty-web/components/ui/ModalFrame.tsx (2026-10-01; there since 2026-10-05) - lifted into @minty/shared at Part 3 step 4;
// change all three (minty-web, here, Flask's port: Minty static/js/minty_dialog.js + static/css/minty_dialog.css).

/**
 * Every portal modal's frame: the page blurred behind a pale backdrop, and one card over it.
 * Escape and a click on the backdrop close it through `onDismiss` - unless `busy`, when nothing
 * closes it, because what the card is doing (a charge, a move) must not be abandoned mid-way.
 *
 * Extracted from `ConfirmDialog` (Figma 04-G / section 06) so a modal without a Minty in the
 * corner is the same modal rather than a second copy of the backdrop and the keyboard handling.
 * `className` dresses the card. (The billing-account dialogs are not on it: they are
 * onboarding's sheet - `AccountSheet` - whose scrim scrolls with a tall card form.)
 */

import { useEffect, type ReactNode } from "react";

export function ModalFrame({
  labelledBy,
  busy,
  onDismiss,
  dismissLabel = "Go back",
  className,
  children,
}: {
  /** The id of the heading that names the dialog. */
  labelledBy: string;
  busy: boolean;
  onDismiss: () => void;
  /** What the backdrop button says to a screen reader. */
  dismissLabel?: string;
  className: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onDismiss]);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={onDismiss}
        disabled={busy}
        className="absolute inset-0 cursor-default bg-white/60 backdrop-blur-[3px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative w-full ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
