"use client";

import { ConfirmDialog } from "./ConfirmDialog";

export type AttachmentDeleteConfirmModalProps = {
  open: boolean;
  count: number;
  pending?: boolean;
  onClose: () => void;
  /** Not used when `variant` is `minimumAttachment`. */
  onConfirm?: () => void;
  variant?: "attachments" | "bankSlip" | "minimumAttachment";
  fileName?: string;
};

export function AttachmentDeleteConfirmModal({
  open,
  count,
  pending = false,
  onClose,
  onConfirm,
  variant = "attachments",
  fileName,
}: AttachmentDeleteConfirmModalProps) {
  if (variant === "minimumAttachment") {
    return (
      <ConfirmDialog
        open={open}
        zIndex={430}
        onClose={onClose}
        acknowledgeOnly
        title="I need at least one attachment on a payment, so this one has to stay."
      >
        Any payment must have at least one supporting document. You may refresh the page to restore
        the last saved document.
      </ConfirmDialog>
    );
  }

  const n = Math.max(0, Math.floor(count));
  const isBankSlip = variant === "bankSlip";
  const titleText =
    isBankSlip && n <= 1
      ? "Delete bank slip?"
      : n > 1
        ? "Delete attachments?"
        : "Delete attachment?";

  return (
    <ConfirmDialog
      open={open}
      zIndex={430}
      pending={pending}
      onClose={onClose}
      onConfirm={onConfirm}
      title={titleText}
      confirmLabel={pending ? "Deleting…" : "Delete"}
    >
      {isBankSlip && n === 1 ? (
        <>
          Are you sure you want to delete this uploaded bank slip
          {fileName?.trim() ? (
            <>
              {" "}
              <span className="font-medium break-all">“{fileName.trim()}”</span>
            </>
          ) : null}
          ?
        </>
      ) : n > 1 ? (
        <>Are you sure you want to delete these {n} attachments?</>
      ) : (
        <>Are you sure you want to delete this attachment?</>
      )}
    </ConfirmDialog>
  );
}
