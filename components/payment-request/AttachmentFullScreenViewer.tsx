"use client";

// The app's ONE full-screen file preview.
//
// Every surface that shows an attachment - staged uploads in Add Payment Request and the
// upload-invoice modal, staged and saved bank slips, and the saved invoice attachments on the
// detail page and easy view - enlarges through this component. Nothing opens a new tab and
// nothing downloads: a file the browser cannot draw says so instead.
//
// It renders no object URL of its own. The caller owns the URL's lifetime and must stop
// rendering the viewer in the same commit that revokes it.

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PdfJsCanvasPreview } from "@/components/PdfJsCanvasPreview";
import { pushAppScrollLock } from "@/lib/appScrollRoot";

const MIN_SCALE = 0.6;
const MAX_SCALE = 3;

/** What the viewer needs to draw a file. Callers may carry more (see InvoiceAttachmentPreviewItem). */
export type AttachmentPreviewItem = {
  url: string;
  name: string;
  mime: string;
  /**
   * Optional Django proxy path for PDF rendering. When set, PdfJsCanvasPreview fetches bytes
   * with auth headers instead of loading the raw storage URL, which avoids cross-origin iframe
   * blocks in Edge and other browsers.
   *
   * Example: "/api/v1/bills/{billId}/attachments/{attachmentId}/preview/"
   */
  previewApiPath?: string;
};

/**
 * The mime a file name implies. `image/*` is not a real media type, but PreviewBlock only ever
 * tests the `image/` prefix, and naming a concrete subtype here would be a guess.
 */
export function nameToPreviewMime(name: string): string {
  const ext = name.trim().split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (["jpg", "jpeg", "png", "heic", "heif", "webp", "gif"].includes(ext)) return "image/*";
  if (ext === "html" || ext === "htm") return "text/html";
  return "application/octet-stream";
}

/**
 * A file's own `type` is not to be trusted: it comes back empty from drag-drop in some
 * browsers, and B2 hands back `application/octet-stream` for PDFs. Either would send
 * PreviewBlock to its "cannot preview" card for a file we can perfectly well draw, so fall
 * back to what the extension says.
 */
export function resolvePreviewMime(file: File): string {
  const type = file.type.trim().toLowerCase();
  if (type && type !== "application/octet-stream") return type;
  return nameToPreviewMime(file.name);
}

/** Build a viewer item for a file still staged in the browser. */
export function fileToPreviewItem(file: File, objectUrl: string): AttachmentPreviewItem {
  return { url: objectUrl, name: file.name, mime: resolvePreviewMime(file) };
}

/** Draws one file: image, PDF (pdf.js canvas), sandboxed HTML, or a "cannot preview" card. */
export function PreviewBlock({
  url,
  name,
  mime,
  previewApiPath,
  layout = "embedded",
}: AttachmentPreviewItem & { layout?: "embedded" | "fullscreen" }) {
  const mimeLower = mime.toLowerCase();
  const imgClass =
    layout === "fullscreen"
      ? "mx-auto block h-auto max-h-[calc(100dvh-7rem)] w-full object-contain"
      : "mx-auto block h-auto max-h-[min(75vh,56rem)] w-full object-contain";
  if (mimeLower.startsWith("image/")) {
    return <img src={url} alt={name || "Attachment"} className={imgClass} draggable={false} />;
  }
  if (mimeLower === "application/pdf") {
    return (
      <PdfJsCanvasPreview
        src={url}
        previewApiPath={previewApiPath}
        title={name || "PDF preview"}
        className="w-full"
        maxPageWidthCssPx={layout === "fullscreen" ? 1200 : 900}
      />
    );
  }
  if (mimeLower === "text/html" || /\.html?$/.test((name || "").trim().toLowerCase())) {
    return (
      <iframe
        src={url}
        title={name || "HTML preview"}
        sandbox=""
        referrerPolicy="no-referrer"
        className={
          layout === "fullscreen"
            ? "block h-[calc(100dvh-7rem)] w-full bg-white"
            : "block h-[min(75vh,56rem)] w-full bg-white"
        }
      />
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-2 bg-gray-50 px-4 py-8 text-center">
      <span className="material-symbols-outlined text-[40px] text-primary/35" aria-hidden>
        draft
      </span>
      <p className="text-sm font-medium text-primary">{name || "File"}</p>
      <p className="text-xs text-primary/50">Preview is not available for this file type.</p>
    </div>
  );
}

/** Two-finger pinch zoom, shared by the viewer and the embedded invoice panel. */
export function usePinchZoom() {
  const [scale, setScale] = useState(1);
  const pinchRef = useRef<{ initialDistance: number; initialScale: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const getDistance = (a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          initialDistance: getDistance(e.touches[0], e.touches[1]),
          initialScale: scale,
        };
      }
    },
    [scale],
  );

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    const d = getDistance(e.touches[0], e.touches[1]);
    const { initialDistance, initialScale } = pinchRef.current;
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, (d / initialDistance) * initialScale)));
  }, []);

  const onTouchEnd = useCallback(() => {
    if (pinchRef.current) pinchRef.current = null;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const preventOverscroll = (ev: TouchEvent) => {
      if (ev.touches.length === 2) ev.preventDefault();
    };
    el.addEventListener("touchmove", preventOverscroll, { passive: false });
    return () => el.removeEventListener("touchmove", preventOverscroll);
  }, []);

  const resetScale = useCallback(() => setScale(1), []);

  return { scale, resetScale, scrollRef, touchHandlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AttachmentFullScreenViewer({
  item,
  onClose,
}: {
  item: AttachmentPreviewItem;
  onClose: () => void;
}) {
  const titleId = useId();
  const { scale, resetScale, scrollRef, touchHandlers } = usePinchZoom();
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => pushAppScrollLock(), []);

  // Escape, in the CAPTURE phase.
  //
  // The modals this opens over (Add Payment Request, upload-invoice, bank slip details) each
  // keep their own bubble-phase `window` keydown listener, and theirs were registered first.
  // A window capture listener runs before every window bubble listener regardless of
  // registration order, so this is the only way one Escape closes exactly one layer - the
  // viewer - and leaves the modal underneath open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  // Focus starts on Close and stays inside; on the way out it goes back to whatever opened the
  // viewer, which may have been removed meanwhile (the file was deleted), hence the fallback.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      if (opener && opener.isConnected) opener.focus();
      else document.getElementById("app-scroll-root")?.focus?.();
    };
  }, []);

  const onKeyDownTrap = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const root = overlayRef.current;
    if (!root) return;
    const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDownTrap}
      className="fixed inset-0 z-[340] flex flex-col bg-black/90"
    >
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 px-3 py-2">
        <p id={titleId} className="min-w-0 truncate text-sm font-medium text-white/95" title={item.name || undefined}>
          {item.name || "Attachment"}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={resetScale}
            className="min-h-11 rounded-md px-3 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Reset zoom
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="Close preview"
          >
            <span className="material-symbols-outlined text-[28px]" aria-hidden>
              close
            </span>
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-2 pb-4">
        <div
          ref={scrollRef}
          className="visible-scrollbar mx-auto h-full max-h-full min-h-0 w-full max-w-5xl overflow-auto touch-pan-x touch-pan-y"
          {...touchHandlers}
        >
          <div className="flex w-full flex-col p-2" style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
            <figure className="relative mx-auto w-full min-w-0 overflow-hidden rounded-lg border border-white/10 bg-white shadow-lg">
              <PreviewBlock {...item} layout="fullscreen" />
            </figure>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The enlarge control every inline preview pane puts over its top-right corner. */
export function ViewFullButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="absolute right-2 top-2 z-10 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-gray-200/90 bg-white/95 text-primary shadow-sm backdrop-blur-[1px] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      aria-label={`View full — ${name}`}
      title="View full"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <span className="material-symbols-outlined text-[20px] leading-none" aria-hidden>
        open_in_full
      </span>
    </button>
  );
}
