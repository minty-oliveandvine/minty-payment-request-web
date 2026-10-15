"use client";

type InvoiceAttachmentToolbarProps = {
  onDelete?: () => void;
  deleteReadOnly?: boolean;
  onUpload?: () => void;
  uploadReadOnly?: boolean;
  /** First attachment(s) when the list is empty */
  showUpload?: boolean;
  /** Additional files when at least one attachment is already shown */
  showAddMore?: boolean;
};

export function InvoiceAttachmentToolbar({
  onDelete,
  deleteReadOnly = false,
  onUpload,
  uploadReadOnly = false,
  showUpload = false,
  showAddMore = false,
}: InvoiceAttachmentToolbarProps) {
  const btnClass =
    "inline-flex h-9 min-h-[44px] shrink-0 items-center gap-1.5 rounded-md border border-border-default bg-surface-card px-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-state-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus sm:h-10 sm:min-h-0 sm:px-3.5 sm:text-sm";

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 sm:flex-nowrap">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-initial">
        {onDelete ? (
          <button
            type="button"
            className={`${btnClass} ${deleteReadOnly ? "cursor-not-allowed opacity-50 hover:bg-surface-card" : "cursor-pointer"}`}
            onClick={onDelete}
            aria-label="Delete attachment"
            disabled={deleteReadOnly}
            aria-disabled={deleteReadOnly}
            title={deleteReadOnly ? "Select attachment(s) to delete" : undefined}
          >
            Delete
            <span className="material-symbols-rounded text-[20px] leading-none" aria-hidden>
              delete
            </span>
          </button>
        ) : null}
        {showUpload && onUpload ? (
          <button
            type="button"
            className={`${btnClass} ${uploadReadOnly ? "cursor-not-allowed opacity-50 hover:bg-surface-card" : "cursor-pointer"}`}
            onClick={onUpload}
            aria-label="Upload attachment"
            disabled={uploadReadOnly}
            aria-disabled={uploadReadOnly}
            title={uploadReadOnly ? "Enable Edit to upload attachments" : undefined}
          >
            Upload
            <span className="material-symbols-rounded text-[20px] leading-none" aria-hidden>
              upload
            </span>
          </button>
        ) : null}
        {showAddMore && onUpload ? (
          <button
            type="button"
            className={`${btnClass} ${uploadReadOnly ? "cursor-not-allowed opacity-50 hover:bg-surface-card" : "cursor-pointer"}`}
            onClick={onUpload}
            aria-label="Add more attachments"
            disabled={uploadReadOnly}
            aria-disabled={uploadReadOnly}
            title={uploadReadOnly ? "Enable Edit to add attachments" : undefined}
          >
            Add More
            <span className="material-symbols-rounded text-[20px] leading-none" aria-hidden>
              attach_file
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
