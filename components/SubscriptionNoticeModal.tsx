"use client";

import { createPortal } from "react-dom";
import { useEffect, useId } from "react";
import { pushAppScrollLock } from "@/lib/appScrollRoot";
import { buildMintyEnterUrl } from "@/lib/mintyUrls";
import type { SubscriptionNotice, NoticeSeverity } from "@/lib/subscriptionNotice";

export type SubscriptionNoticeModalProps = {
  notice: SubscriptionNotice | null;
  onClose: () => void;
};

const overlayClass =
  "fixed inset-0 z-[460] flex items-center justify-center overflow-x-hidden overscroll-x-none bg-overlay-scrim p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:p-4";

const shellClass =
  "relative z-[1] w-full min-w-0 max-w-[440px] rounded-lg bg-surface-card p-5 shadow-modal ring-1 ring-border-subtle sm:rounded-lg sm:p-6";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";

const dismissClass = `box-border h-12 min-h-[48px] w-full cursor-pointer rounded-lg border border-action-secondary-border bg-surface-card px-4 text-sm font-semibold text-text-link transition-colors hover:bg-state-selected ${focusRing} sm:h-11 sm:min-h-[44px] sm:w-auto`;

const primaryClass = `box-border inline-flex h-12 min-h-[48px] w-full cursor-pointer items-center justify-center rounded-lg border border-transparent bg-action-primary px-4 text-sm font-semibold text-action-on-primary transition-opacity duration-200 ease-out hover:opacity-80 ${focusRing} sm:h-11 sm:min-h-[44px] sm:w-auto`;

/** Per-item card colouring. Severity is the server's call, not the component's. */
const itemToneClass: Record<NoticeSeverity, string> = {
  critical: "border-action-danger bg-status-danger-bg",
  warning: "border-status-warning-ink bg-status-warning-bg",
  info: "border-border-default bg-surface-sunk",
};

const itemTitleClass: Record<NoticeSeverity, string> = {
  critical: "text-status-danger-ink",
  warning: "text-status-warning-ink",
  info: "text-text-secondary",
};

/**
 * Subscription notice for the Payment landing page.
 *
 * Same list Minty's Petty Cash dashboard renders, from the same builder — a company
 * can be past due on one module and winding down another, so every applicable item
 * is shown rather than just the worst.
 *
 * The action goes back to Minty, not to this app's settings: subscription management
 * lives there. `buildMintyEnterUrl` wraps the path so the billing token buys a Flask
 * session on arrival, instead of landing on the login form.
 */
export function SubscriptionNoticeModal({ notice, onClose }: SubscriptionNoticeModalProps) {
  const titleId = useId();
  const open = Boolean(notice && notice.items.length > 0);

  useEffect(() => {
    if (!open) return;
    return pushAppScrollLock();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !notice || typeof document === "undefined") return null;

  const critical = notice.severity === "critical";
  const settingsHref = notice.settings_path
    ? buildMintyEnterUrl(notice.settings_path)
    : null;

  return createPortal(
    <div
      className={overlayClass}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={shellClass}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              critical ? "bg-status-danger-bg text-status-danger-ink" : "bg-status-warning-bg text-status-warning-ink"
            }`}
            aria-hidden
          >
            <span className="material-symbols-rounded text-[20px] leading-none">
              {critical ? "error" : "info"}
            </span>
          </span>
          <h2 id={titleId} className="text-lg font-semibold text-text-secondary sm:text-xl">
            {critical ? "Action needed" : "Your subscription"}
          </h2>
        </div>

        <ul className="mt-4 flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {notice.items.map((item) => (
            <li
              key={`${item.module_code}-${item.kind}`}
              className={`rounded-lg border px-3 py-3 ${itemToneClass[item.severity]}`}
            >
              <p className={`text-sm font-semibold ${itemTitleClass[item.severity]}`}>
                {item.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">{item.detail}</p>
            </li>
          ))}
        </ul>

        {/* Only the payer can act — the server refuses everyone else, so a button
            here would be a click that fails. Name who to ask instead. */}
        {!notice.can_manage && notice.payer ? (
          <p className="mt-4 text-sm leading-relaxed text-text-muted">
            Billing for this company is managed by{" "}
            {notice.payer.name || notice.payer.email}
            {notice.payer.name && notice.payer.email ? ` <${notice.payer.email}>` : ""} — only
            they can change its subscription.
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" className={dismissClass} onClick={onClose}>
            Dismiss
          </button>
          {notice.can_manage && settingsHref ? (
            <a className={primaryClass} href={settingsHref}>
              Go to subscription settings
            </a>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
