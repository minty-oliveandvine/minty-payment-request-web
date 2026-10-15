"use client";

import { ConfirmDialog } from "./ConfirmDialog";

export type PaymentDeleteConfirmModalProps = {
  open: boolean;
  /** Short line shown in the dialog (e.g. date, amount, invoice ref). */
  summary: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function PaymentDeleteConfirmModal({
  open,
  summary,
  pending = false,
  onClose,
  onConfirm,
}: PaymentDeleteConfirmModalProps) {
  const trimmed = summary.trim();

  return (
    <ConfirmDialog
      open={open}
      zIndex={430}
      pending={pending}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Delete this payment?"
      confirmLabel={pending ? "Deleting…" : "Delete"}
    >
      Are you sure you want to remove this payment
      {trimmed ? (
        <>
          {" "}
          (<span className="font-semibold text-text-secondary">{trimmed}</span>)
        </>
      ) : null}
      ? This action cannot be undone.
    </ConfirmDialog>
  );
}
