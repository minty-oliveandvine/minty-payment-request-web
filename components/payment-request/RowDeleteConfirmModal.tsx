"use client";

import { ConfirmDialog } from "./ConfirmDialog";

export type RowDeleteConfirmModalProps = {
  open: boolean;
  contactTitle: string;
  isDraft?: boolean;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function RowDeleteConfirmModal({
  open,
  contactTitle,
  isDraft = false,
  pending = false,
  onClose,
  onConfirm,
}: RowDeleteConfirmModalProps) {
  const trimmed = contactTitle.trim();
  const title = isDraft ? "Delete this payment?" : "Void this payment?";
  const confirmLabel = pending ? (isDraft ? "Deleting…" : "Voiding…") : isDraft ? "Delete Payment" : "Void Payment";

  return (
    <ConfirmDialog
      open={open}
      zIndex={420}
      pending={pending}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      confirmLabel={confirmLabel}
    >
      {isDraft ? (
        trimmed ? (
          <>
            Are you sure you want to delete <span className="font-semibold text-text-secondary">&quot;{trimmed}&quot;</span>? This draft will be removed and cannot be recovered.
          </>
        ) : (
          <>Are you sure you want to delete this draft? It will be removed and cannot be recovered.</>
        )
      ) : trimmed ? (
        <>
          Are you sure you want to void <span className="font-semibold text-text-secondary">&quot;{trimmed}&quot;</span>? The payment will be marked as voided and can no longer be edited.
        </>
      ) : (
        <>Are you sure you want to void this payment? It will be marked as voided and can no longer be edited.</>
      )}
    </ConfirmDialog>
  );
}
