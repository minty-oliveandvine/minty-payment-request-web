"use client";

import { useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Overlay";

/**
 * Shared scaffold for the payment-request confirm dialogs (delete / void / warning), drawn as the
 * Part 14 "Confirmation modal" (components/ui/Overlay.tsx): 440 wide, radius 12, the Part 13
 * scrim, a bottom sheet on a phone. Each concrete modal stays a thin wrapper that supplies its
 * own title, body and labels - so user-facing strings and public props are unchanged.
 *
 * Kind = Standard | Destructive (Part 14): a destructive confirmation puts the keyboard on
 * CANCEL first, so Enter never voids by accident. Escape and a click on the scrim cancel - but
 * not while the action is in flight.
 */

export type ConfirmDialogProps = {
  open: boolean;
  /** Stacking context; each modal keeps its historical z-index. */
  zIndex: number;
  title: ReactNode;
  /** Dialog body: what happens, and whether it can be undone. */
  children: ReactNode;
  pending?: boolean;
  onClose: () => void;
  /**
   * Confirm handler. Omit together with `hideConfirm` for an acknowledge-only
   * dialog (single OK button that calls `onClose`).
   */
  onConfirm?: () => void;
  confirmLabel?: ReactNode;
  confirmVariant?: "danger" | "primary";
  /** When true, render only a single primary button (no Cancel / Confirm pair). */
  acknowledgeOnly?: boolean;
  /** Label of the single button in acknowledge-only mode. */
  acknowledgeLabel?: ReactNode;
};

export function ConfirmDialog({
  open,
  zIndex,
  title,
  children,
  pending = false,
  onClose,
  onConfirm,
  confirmLabel,
  confirmVariant = "danger",
  acknowledgeOnly = false,
  acknowledgeLabel = "OK",
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const destructive = !acknowledgeOnly && confirmVariant === "danger";

  return (
    <Modal
      open={open}
      role="alertdialog"
      zIndex={zIndex}
      title={title}
      description={children}
      initialFocus={destructive ? cancelRef : undefined}
      onRequestClose={() => {
        if (!pending) onClose();
      }}
      footer={
        acknowledgeOnly ? (
          <Button kind="primary" onClick={onClose}>
            {acknowledgeLabel}
          </Button>
        ) : (
          <>
            <Button ref={cancelRef} kind="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              kind={confirmVariant === "primary" ? "primary" : "danger"}
              onClick={() => onConfirm?.()}
              processing={pending}
            >
              {confirmLabel}
            </Button>
          </>
        )
      }
    />
  );
}
