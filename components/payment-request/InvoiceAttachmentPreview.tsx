"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  AttachmentFullScreenViewer,
  PreviewBlock,
  ViewFullButton,
  usePinchZoom,
  type AttachmentPreviewItem,
} from "./AttachmentFullScreenViewer";

const ATTACHMENT_CHECKBOX_CLASS = "checkbox-secondary-white-tick h-4 w-4 rounded border border-primary/40";

export type InvoiceAttachmentPreviewItem = AttachmentPreviewItem & {
  billAttachmentId?: string;
  pendingUploadKey?: string;
  pendingFile?: File;
};

type InvoiceAttachmentPreviewProps = {
  /** Built from IndexedDB / object URLs on the details page */
  attachments?: InvoiceAttachmentPreviewItem[];
  /** Legacy: plain image URLs only */
  imageSrcs?: string[];
  className?: string;
  /**
   * When true (e.g. easy view aside), the gray preview panel fills the flex parent and
   * scrolls internally for multiple files / tall PDFs — same behavior as details, without viewport max-heights fighting the column.
   */
  fillColumn?: boolean;
  /**
   * When true, each attachment shows a top-right “view full” control that opens the full-screen
   * preview (same tab — nothing ever opens a new tab or downloads).
   */
  showViewFullButton?: boolean;
  /** While blobs are loading from IndexedDB */
  isLoadingAttachments?: boolean;
  /** Show attachment selection checkboxes (used in Edit mode). */
  editMode?: boolean;
  selectedIndices?: number[];
  onSelectedIndicesChange?: (next: number[]) => void;
};

/** Easy-view aside: document-style skeleton while invoice blobs / URLs load. */
function FillColumnInvoiceLoadingSkeleton() {
  return (
    <div
      className="flex w-full shrink-0 flex-col gap-2 p-1.5 sm:p-2"
      role="status"
      aria-busy="true"
      aria-label="Loading invoice attachment"
    >
      <figure className="relative mx-auto w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex min-h-[min(14rem,48dvh)] w-full flex-col gap-3 p-3 sm:min-h-[min(18rem,52dvh)] sm:gap-4 sm:p-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3 sm:pb-4">
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-md bg-gray-200" aria-hidden />
            <div className="h-2.5 min-w-0 flex-1 animate-pulse rounded-full bg-gray-200/80" aria-hidden />
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-md bg-gray-100" aria-hidden />
          </div>
          <div className="flex min-h-0 flex-1 flex-col items-center gap-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/90 p-3 sm:p-4">
            <div
              className="aspect-[8.5/11] w-full max-w-[min(100%,17rem)] animate-pulse rounded-sm bg-gradient-to-b from-gray-100 to-gray-200/90 sm:max-w-[min(100%,20rem)]"
              aria-hidden
            />
            <div className="flex w-full max-w-[14rem] flex-col gap-2">
              <div className="h-2 w-[96%] animate-pulse rounded-full bg-gray-200/90" aria-hidden />
              <div className="h-2 w-[88%] animate-pulse rounded-full bg-gray-200/80" aria-hidden />
              <div className="h-2 w-[92%] animate-pulse rounded-full bg-gray-200/75" aria-hidden />
              <div className="h-2 w-[72%] animate-pulse rounded-full bg-gray-200/70" aria-hidden />
            </div>
          </div>
        </div>
      </figure>
    </div>
  );
}

export function InvoiceAttachmentPreview({
  attachments,
  imageSrcs = [],
  className = "",
  fillColumn = false,
  showViewFullButton = false,
  isLoadingAttachments = false,
  editMode = false,
  selectedIndices,
  onSelectedIndicesChange,
}: InvoiceAttachmentPreviewProps) {
  const { scale, scrollRef, touchHandlers } = usePinchZoom();
  /** When set, the full-screen viewer shows this attachment. */
  const [viewFullIndex, setViewFullIndex] = useState<number | null>(null);
  const [internalSelected, setInternalSelected] = useState<Set<number>>(new Set());

  const effectiveSelected = selectedIndices ? new Set(selectedIndices) : internalSelected;
  const setEffectiveSelected = useCallback(
    (updater: (prev: Set<number>) => Set<number>) => {
      if (selectedIndices && onSelectedIndicesChange) {
        const nextSet = updater(new Set(selectedIndices));
        onSelectedIndicesChange(Array.from(nextSet).sort((a, b) => a - b));
        return;
      }
      setInternalSelected((prev) => updater(new Set(prev)));
    },
    [selectedIndices, onSelectedIndicesChange],
  );

  // Leaving edit mode ends the selection.
  //
  // For the selection this component owns, that adjustment happens DURING RENDER with the
  // previous value remembered - React's documented alternative to an effect that corrects state
  // after the fact. It costs no extra commit and leaves no frame in which the selection is stale.
  const [selectionEditMode, setSelectionEditMode] = useState(editMode);
  if (editMode !== selectionEditMode) {
    setSelectionEditMode(editMode);
    if (!editMode && internalSelected.size > 0) setInternalSelected(new Set());
  }

  // When the selection is the PARENT's (the only way this is used in the app), it can only be
  // asked to clear, which is a side effect on somebody else and so belongs in an effect.
  useEffect(() => {
    if (editMode) return;
    if (selectedIndices && onSelectedIndicesChange && selectedIndices.length > 0) {
      onSelectedIndicesChange([]);
    }
  }, [editMode, selectedIndices, onSelectedIndicesChange]);

  const items: (InvoiceAttachmentPreviewItem | null)[] =
    attachments && attachments.length > 0
      ? attachments
      : imageSrcs.length > 0
        ? imageSrcs.map((url) => ({ url, name: "", mime: "image/png" }))
        : [null];

  const attachmentCount = items.filter((item): item is InvoiceAttachmentPreviewItem => item != null).length;
  /** Bound height so multiple files (or tall PDFs) scroll inside the gray panel instead of stretching the page. */
  const constrainScrollHeight = isLoadingAttachments || attachmentCount >= 1;

  const scrollAreaMinMaxClass = fillColumn
    ? constrainScrollHeight
      ? "min-h-0 h-full max-h-full flex-1"
      : "min-h-0 flex-1"
    : constrainScrollHeight
      ? "min-h-[min(60vh,32rem)] max-h-[min(85dvh,52rem)] sm:max-h-[min(88dvh,56rem)] lg:max-h-[min(90vh,60rem)]"
      : "min-h-[min(60vh,32rem)]";

  const focused = viewFullIndex != null ? items[viewFullIndex] : null;

  const inner = (
    <div
      className="flex w-full shrink-0 flex-col gap-2 p-1.5 sm:p-2" style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
      {isLoadingAttachments ? (
        fillColumn ? (
          <FillColumnInvoiceLoadingSkeleton />
        ) : (
          <figure
            className="relative mx-auto w-full min-w-0 max-w-full overflow-hidden rounded border border-gray-200 bg-white shadow-sm"
            role="status"
            aria-busy="true"
            aria-label="Loading invoice attachment"
          >
            <div className="flex aspect-[8.5/11] w-full max-h-[min(75vh,56rem)] min-h-[min(12rem,40dvh)] items-center justify-center bg-gray-50 sm:min-h-[min(16rem,45dvh)]">
              <div className="mx-auto h-full w-[92%] max-w-full animate-pulse rounded-sm bg-gray-100" aria-hidden />
            </div>
          </figure>
        )
      ) : (
        items.map((item, i) => (
          <Fragment key={item ? `${item.url}-${i}` : `placeholder-${i}`}>
            {i > 0 && item != null ? (
              <div
                className="flex w-full shrink-0 items-center gap-2.5 py-0.5"
                role="separator"
                aria-label="Next file"
              >
                <span className="h-px min-w-0 flex-1 bg-gray-300" aria-hidden />
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary/50 sm:text-[11px]">
                  Next file
                </span>
                <span className="h-px min-w-0 flex-1 bg-gray-300" aria-hidden />
              </div>
            ) : null}
            <figure className="relative mx-auto w-full min-w-0 max-w-full overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
              {item ? (
                <>
                  {editMode ? (
                    <label className="absolute left-2 top-2 z-10 inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={effectiveSelected.has(i)}
                        onChange={(e) => {
                          setEffectiveSelected((prev) => {
                            if (e.target.checked) prev.add(i);
                            else prev.delete(i);
                            return prev;
                          });
                        }}
                        className={`${ATTACHMENT_CHECKBOX_CLASS} cursor-pointer`}
                        aria-label={`Select attachment ${item.name || i + 1}`}
                      />
                    </label>
                  ) : null}
                  {showViewFullButton && !editMode ? (
                    <ViewFullButton
                      name={item.name || `attachment ${i + 1}`}
                      onClick={() => setViewFullIndex(i)}
                    />
                  ) : null}
                  <PreviewBlock {...item} />
                </>
              ) : (
                <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 bg-gray-50 px-4 text-center text-sm text-primary/60">
                  <span className="material-symbols-outlined text-[40px] text-primary/35" aria-hidden>
                    description
                  </span>
                  <span>Invoice attachment preview</span>
                  <span className="text-xs text-primary/45">Pinch to zoom on mobile</span>
                </div>
              )}
            </figure>
          </Fragment>
        ))
      )}
    </div>
  );

  return (
    <>
      <div className={`flex min-h-0 w-full flex-1 flex-col ${fillColumn ? "h-full min-h-0" : ""} ${className}`}>
        <div
          ref={scrollRef}
          className={`visible-scrollbar relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto rounded-lg border border-gray-200 bg-gray-100 touch-pan-x touch-pan-y ${scrollAreaMinMaxClass}`}
          {...touchHandlers}
        >
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-2 py-1 text-xs text-white sm:hidden">
            <span className="material-symbols-outlined align-middle text-[16px]" aria-hidden>
              pinch
            </span>{" "}
            Pinch to zoom
          </div>
          {inner}
        </div>
      </div>
      {focused ? (
        <AttachmentFullScreenViewer item={focused} onClose={() => setViewFullIndex(null)} />
      ) : null}
    </>
  );
}
