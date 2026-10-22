"use client";

/**
 * The two Part 14 overlays, on one frame:
 *
 * - **Modal** (Confirmation modal, 440 wide; radius 12; a bottom sheet on a phone);
 * - **Drawer** (480 wide from the right; a full-screen sheet on a phone) - for work that needs a
 *   form beside the list, e.g. Record payment (D15-11). Substantial work never goes in a modal.
 *
 * Both: portal to `body`, Part 13 scrim (48% Light), elevation 2 (`shadow-modal`), the app's
 * reference-counted scroll lock, focus moved inside on open and trapped there (Tab wraps),
 * Escape closes, focus returns to the opener on close. `onRequestClose` may refuse (unsaved
 * changes ask first) - the frame only asks it.
 *
 * Motion (Part 13 §13.12): 300ms with the standard curve; none under reduced motion.
 */

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

import { pushAppScrollLock } from "@minty/shared/scrollLock";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Overlays stack (a confirmation over the Record payment drawer). Only the TOP one answers
 * Escape and keeps Tab: both listen on `document`, where stopPropagation cannot stop a sibling
 * listener, so each asks this stack whether it is on top instead.
 */
const overlayStack: symbol[] = [];

function useOverlayBehaviour(
  open: boolean,
  panel: RefObject<HTMLElement | null>,
  onRequestClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  const close = useRef(onRequestClose);
  useEffect(() => {
    close.current = onRequestClose;
  }, [onRequestClose]);

  useEffect(() => {
    if (!open) return;
    const release = pushAppScrollLock();
    const me = Symbol("overlay");
    overlayStack.push(me);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = initialFocus?.current ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (overlayStack[overlayStack.length - 1] !== me) return;
      // A dialog not built on this frame (the bank slip dialog, the file viewer) holds the focus
      // over this one: its own keys are its business.
      const active = document.activeElement;
      if (active && active !== document.body && panel.current && !panel.current.contains(active)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    // Capture phase: an overlay's Escape must not also reach a page listener underneath.
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const at = overlayStack.indexOf(me);
      if (at >= 0) overlayStack.splice(at, 1);
      release();
      opener?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/close only; the refs are stable
  }, [open]);
}

type FrameProps = {
  open: boolean;
  /** Asked on Escape and on a click on the scrim; it decides whether to close. */
  onRequestClose: () => void;
  title: ReactNode;
  /** Under the title: what happens, and whether it can be undone (Part 14 Confirmation modal). */
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons; Primary right on desktop, stacked with Primary first on a phone (Part 15.2). */
  footer?: ReactNode;
  /** A destructive confirmation focuses Cancel first - pass its ref. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** `alertdialog` for confirmations, `dialog` otherwise. */
  role?: "dialog" | "alertdialog";
  zIndex?: number;
};

export function Modal({
  open,
  onRequestClose,
  title,
  description,
  children,
  footer,
  initialFocus,
  role = "dialog",
  zIndex = 300,
}: FrameProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useOverlayBehaviour(open, panel, onRequestClose, initialFocus);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center bg-overlay-scrim sm:items-center sm:p-4"
      style={{ zIndex }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onRequestClose();
      }}
    >
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="flex max-h-[min(100dvh,100%)] w-full min-w-0 flex-col overflow-y-auto rounded-t-xl bg-surface-raised p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-modal outline-none sm:max-w-[440px] sm:rounded-lg"
      >
        <h2 id={titleId} className="text-title-l text-text-primary">
          {title}
        </h2>
        {description ? (
          <div id={descId} className="mt-2 text-body-m text-text-secondary">
            {description}
          </div>
        ) : null}
        {children ? <div className="mt-4 min-w-0">{children}</div> : null}
        {footer ? (
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 [&>*]:w-full sm:[&>*]:w-auto">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onRequestClose,
  title,
  description,
  children,
  footer,
  initialFocus,
  zIndex = 250,
}: Omit<FrameProps, "role">) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlayBehaviour(open, panel, onRequestClose, initialFocus);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 flex justify-end bg-overlay-scrim"
      style={{ zIndex }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onRequestClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex h-full w-full min-w-0 flex-col bg-surface-raised shadow-modal outline-none sm:max-w-[480px] sm:border-l sm:border-border-default"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border-subtle px-4 py-4 pt-[max(16px,env(safe-area-inset-top))] sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-title-l text-text-primary">
              {title}
            </h2>
            {description ? <div className="mt-1 text-body-s text-text-secondary">{description}</div> : null}
          </div>
          <button
            type="button"
            onClick={onRequestClose}
            aria-label="Close"
            className="-mr-2 -mt-1 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 24 }} aria-hidden>
              close
            </span>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border-subtle px-4 py-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:gap-3 sm:px-6 [&>*]:w-full sm:[&>*]:w-auto">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
