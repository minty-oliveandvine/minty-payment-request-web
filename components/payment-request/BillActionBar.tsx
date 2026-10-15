"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { BillDraftSubmitButton } from "./BillDraftSubmitButton";

const ROW_MENU_MIN_WIDTH_PX = 160;

const rowMenuButtonClass =
  "box-border inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-default bg-surface-card text-text-secondary transition-colors hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed disabled:text-text-disabled disabled:hover:bg-transparent";

type BillActionBarProps = {
  onDeleteBill?: () => void;
  onPublishToXero?: () => void;
  deleteDisabled?: boolean;
  publishDisabled?: boolean;
  publishStatus?: "draft" | "published" | "failed";
  publishPending?: boolean;
  draftSubmit?: {
    show: boolean;
    onClick: () => void;
    disabled?: boolean;
    pending?: boolean;
  };
  showVoidBill?: boolean;
  endRowPrefix?: ReactNode;
  useActionsOverflowMenu?: boolean;
  overflowShowPublish?: boolean;
  overflowShowRepublish?: boolean;
  overflowMenuTriggerDisabled?: boolean;
  overflowVoidDisabled?: boolean;
  isDraftBill?: boolean;
  /** When true with void/delete shown: same easy-view row as draft — actions `justify-end`, void then publish (publish on the right). */
  voidButtonTrailing?: boolean;
};

export function BillActionBar({
  onDeleteBill,
  onPublishToXero,
  deleteDisabled,
  publishDisabled,
  publishStatus,
  publishPending,
  draftSubmit,
  showVoidBill = true,
  endRowPrefix,
  useActionsOverflowMenu = false,
  overflowShowPublish = false,
  overflowShowRepublish = false,
  overflowMenuTriggerDisabled = false,
  overflowVoidDisabled = false,
  isDraftBill = false,
  voidButtonTrailing = false,
}: BillActionBarProps) {
  const removeMenuLabel = isDraftBill ? "Delete" : "Void";
  const removePrimaryLabel = isDraftBill ? "Delete Payment" : "Void Payment";
  const isPublished = publishStatus === "published";
  const menuId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!menuOpen || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.max(8, r.right - ROW_MENU_MIN_WIDTH_PX) });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-bill-action-menu-panel]")) return;
      if (t.closest("[data-bill-action-menu-trigger]")) return;
      setMenuOpen(false);
    };
    const onScroll = () => setMenuOpen(false);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menuOpen]);

  const publishItemDisabled = Boolean(publishDisabled || publishPending);
  const toggleMenu = () => {
    if (overflowMenuTriggerDisabled || publishPending) return;
    setMenuOpen((o) => !o);
  };

  const overflowMenu =
    useActionsOverflowMenu && menuOpen
      ? createPortal(
          <div
            data-bill-action-menu-panel
            id={menuId}
            role="menu"
            aria-label="Payment actions"
            className="fixed z-[400] rounded-lg border border-border-default bg-surface-raised py-1 shadow-overlay"
            style={{ top: pos.top, left: pos.left, minWidth: ROW_MENU_MIN_WIDTH_PX }}
          >
            {overflowShowPublish || overflowShowRepublish ? (
              <button
                type="button"
                role="menuitem"
                disabled={publishItemDisabled}
                className="block min-h-11 w-full cursor-pointer px-3 py-2 text-left text-body-m text-text-primary transition-colors hover:bg-state-hover disabled:cursor-not-allowed disabled:text-text-disabled"
                onClick={() => {
                  if (publishItemDisabled) return;
                  setMenuOpen(false);
                  void onPublishToXero?.();
                }}
              >
                {publishPending
                  ? overflowShowRepublish
                    ? "Republishing…"
                    : "Publishing…"
                  : overflowShowRepublish
                    ? "Republish"
                    : "Publish"}
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              disabled={overflowVoidDisabled}
              className="block min-h-11 w-full cursor-pointer px-3 py-2 text-left text-body-m text-action-danger transition-colors hover:bg-status-danger-bg disabled:cursor-not-allowed disabled:text-text-disabled"
              onClick={() => {
                if (overflowVoidDisabled) return;
                setMenuOpen(false);
                onDeleteBill?.();
              }}
            >
              {removeMenuLabel}
            </button>
          </div>,
          document.body,
        )
      : null;

  const voidBillButton =
    showVoidBill !== false ? (
      <button type="button" onClick={onDeleteBill} disabled={deleteDisabled} className={buttonClass("danger")}>
        {removePrimaryLabel}
      </button>
    ) : null;

  const centerActions = (
    <>
      {endRowPrefix}
      {draftSubmit?.show ? (
        <BillDraftSubmitButton onClick={draftSubmit.onClick} disabled={draftSubmit.disabled} pending={draftSubmit.pending} />
      ) : null}
      {useActionsOverflowMenu ? (
        <>
          {/* The overflow menu closes the moment Republish is clicked, so the disabled
              trigger was the only sign anything was happening. Publish is a Xero round
              trip - say so, in the same words the non-overflow button uses. */}
          {publishPending ? (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1.5 whitespace-nowrap text-body-m text-text-secondary"
            >
              <span className="material-symbols-rounded animate-spin text-[20px]! leading-none text-text-link motion-reduce:animate-none" aria-hidden>
                progress_activity
              </span>
              {overflowShowRepublish ? "Republishing…" : "Publishing…"}
            </span>
          ) : null}
          <button
            ref={btnRef}
            type="button"
            data-bill-action-menu-trigger
            disabled={overflowMenuTriggerDisabled || publishPending}
            className={rowMenuButtonClass}
            aria-label="More payment actions"
            aria-busy={publishPending ? true : undefined}
            aria-expanded={menuOpen ? "true" : "false"}
            aria-haspopup="menu"
            aria-controls={menuOpen ? menuId : undefined}
            onClick={(e) => {
              e.preventDefault();
              toggleMenu();
            }}
          >
            <span className="material-symbols-rounded text-[22px] leading-none" aria-hidden>
              more_vert
            </span>
          </button>
          {overflowMenu}
        </>
      ) : (
        <button
          type="button"
          onClick={isPublished || publishDisabled ? undefined : onPublishToXero}
          disabled={isPublished || publishPending || publishDisabled}
          title={publishDisabled ? "This payment's been voided, so there's nothing to publish." : undefined}
          className={
            isPublished
              ? "inline-flex h-11 max-w-full shrink-0 cursor-default items-center gap-2 rounded-lg bg-status-success-bg px-4 text-button text-status-success-ink"
              : buttonClass("secondary")
          }
        >
          {isPublished ? (
            <>
              <Icon name="check_circle" size="md" />
              Published to Xero
            </>
          ) : publishPending ? (
            "Publishing…"
          ) : (
            "Publish to Xero"
          )}
          <img
            src="/xero-active.png"
            alt=""
            width={40}
            height={40}
            className={"h-10 w-10 shrink-0 object-contain" + (publishDisabled ? " grayscale opacity-40" : "")}
            aria-hidden
          />
        </button>
      )}
    </>
  );

  if (voidButtonTrailing && voidBillButton) {
    return (
      <div className="flex w-full min-w-0 flex-row flex-wrap items-center justify-end gap-2 sm:gap-3">
        {voidBillButton}
        {centerActions}
      </div>
    );
  }

  return (
    <div
      className={`flex w-full min-w-0 flex-row items-center gap-2 sm:gap-3 ${showVoidBill === false ? "justify-end" : "justify-between"}`}
    >
      {voidBillButton}
      <div className="flex min-w-0 flex-1 flex-row flex-wrap items-center justify-end gap-2 sm:gap-3">{centerActions}</div>
    </div>
  );
}
