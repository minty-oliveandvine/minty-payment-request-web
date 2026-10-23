"use client";

import { ConfirmDialog } from "./ConfirmDialog";

export type BulkDeleteConfirmModalProps = {
  open: boolean;
  selectedCount: number;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function BulkDeleteConfirmModal({
  open,
  selectedCount,
  pending = false,
  onClose,
  onConfirm,
}: BulkDeleteConfirmModalProps) {
  return (
    <ConfirmDialog
      open={open}
      zIndex={300}
      pending={pending}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Void selected payments?"
      confirmLabel={pending ? "Voiding…" : "Void Payments"}
    >
      Are you sure you want to void {selectedCount} selected bill{selectedCount === 1 ? "" : "s"}?
      They will be marked as voided and can no longer be edited.
    </ConfirmDialog>
  );
}
