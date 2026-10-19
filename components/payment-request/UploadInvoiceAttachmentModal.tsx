"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import { pushAppScrollLock } from "@/lib/appScrollRoot";
import { ApiError } from "@/lib/api";
import { formatFileSize, isAllowedAttachment, ATTACHMENT_ACCEPT } from "@/lib/fileAttachmentPreview";
import { RequiredMark } from "@/components/RequiredMark";
import {
  AttachmentFullScreenViewer,
  fileToPreviewItem,
  PreviewBlock,
  ViewFullButton,
} from "./AttachmentFullScreenViewer";

export type UploadInvoiceAttachmentModalProps = {
  open: boolean;
  onClose: () => void;
  onUpload: (files: File[]) => Promise<void> | void;
};

type UploadedEntry = { id: string; file: File };

function getUploadedFileIconInfo(filename: string): { icon: string; iconClass: string } {
  const ext = filename.trim().split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return { icon: "picture_as_pdf", iconClass: "text-status-danger-ink" };
  if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "heic" || ext === "heif" || ext === "webp" || ext === "gif") return { icon: "image", iconClass: "text-status-info-ink" };
  if (ext === "html" || ext === "htm") return { icon: "html", iconClass: "text-status-warning-ink" };
  return { icon: "draft", iconClass: "text-text-secondary" };
}

export function UploadInvoiceAttachmentModal({ open, onClose, onUpload }: UploadInvoiceAttachmentModalProps) {
  const titleId = useId();
  const previewSubtitleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedEntry[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const uploadErrorId = useId();
  /** A file problem, not a server one: a failed upload leaves its files staged, a refused one does not. */
  const filesMissing = Boolean(uploadError) && uploadedFiles.length === 0;

  const previewFile = previewFileId ? uploadedFiles.find((x) => x.id === previewFileId)?.file ?? null : null;

  useEffect(() => {
    if (!previewFile) {
      setPreviewObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(previewFile);
    setPreviewObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewFile]);

  useEffect(() => {
    if (previewFileId && !uploadedFiles.some((x) => x.id === previewFileId)) setPreviewFileId(null);
  }, [uploadedFiles, previewFileId]);

  useEffect(() => {
    if (!open) {
      setUploadedFiles([]);
      setUploadError(null);
      setUploading(false);
      setPreviewFileId(null);
      setViewerOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return pushAppScrollLock();
  }, [open]);

  // Two levels, not three: the full-screen viewer swallows Escape in the capture phase
  // (AttachmentFullScreenViewer), so this handler never sees the keystroke that closes it.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (previewFileId) {
        setPreviewFileId(null);
        return;
      }
      if (!uploading) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, previewFileId, uploading]);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
    const oversized = Array.from(list).filter((file) => file.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setUploadError(`${oversized.length > 1 ? "These are" : "This one's"} a bit too big - 10MB is the max: ${oversized.map((f) => f.name).join(", ")}`);
      e.target.value = "";
      return;
    }
    const disallowed = Array.from(list).filter((file) => !isAllowedAttachment(file));
    if (disallowed.length > 0) {
      setUploadError(`I can't open ${disallowed.length > 1 ? "these" : "this one"} - try PDF, JPEG, PNG, or HTML: ${disallowed.map((f) => f.name).join(", ")}`);
      e.target.value = "";
      return;
    }
    const added: UploadedEntry[] = Array.from(list).map((file) => ({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
    }));
    setUploadedFiles((prev) => [...prev, ...added]);
    setPreviewFileId(added[added.length - 1]?.id ?? null);
    setUploadError(null);
    e.target.value = "";
  };

  const removeFile = (entryId: string) => {
    setUploadedFiles((prev) => prev.filter((x) => x.id !== entryId));
  };

  const handleUploadClick = async () => {
    if (uploadedFiles.length === 0) {
      setUploadError("I need at least one file to work with first.");
      return;
    }
    if (uploading) return;
    setUploadError(null);
    setUploading(true);
    try {
      await Promise.resolve(onUpload(uploadedFiles.map((x) => x.file)));
      onClose();
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : "That upload didn't quite go through. Mind trying again?");
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-x-hidden overscroll-x-none p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:p-4 md:p-6" role="presentation">
      <button type="button" aria-label="Close dialog" className={`absolute inset-0 bg-overlay-scrim backdrop-blur-[1px] ${uploading ? "cursor-not-allowed" : "cursor-pointer"}`} onClick={() => !uploading && onClose()} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={previewFile ? previewSubtitleId : undefined} className="relative z-[1] flex max-h-[min(100dvh-1rem,760px)] w-full min-w-0 max-w-[520px] flex-col rounded-lg bg-surface-card shadow-modal ring-1 ring-border-subtle sm:max-h-[min(92dvh,760px)] sm:rounded-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-4 pb-3 pt-4 sm:gap-4 sm:px-6 sm:pb-4 sm:pt-6">
          <div className="min-w-0 pr-2">
            <h2 id={titleId} className="text-lg font-bold leading-snug text-text-primary sm:text-xl md:text-2xl">
              Upload Attachment
            </h2>
            <p className="mt-1 text-sm text-text-secondary">Add invoice images or PDFs to this payment.</p>
          </div>
          <button type="button" onClick={() => !uploading && onClose()} className={`-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-sunk focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${uploading ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`} aria-label="Close" disabled={uploading}>
            <span className="material-symbols-rounded text-[22px] leading-none" aria-hidden>
              close
            </span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6">
          {uploadError ? (
            <div id={uploadErrorId} className="mb-4 rounded-lg border border-action-danger bg-status-danger-bg px-3 py-2 text-sm text-status-danger-ink" role="alert">
              {uploadError}
            </div>
          ) : null}

          {/* Vertical layout aligned with bank slip modal: preview → file list → dashed upload */}
          <div className="flex flex-col gap-6">
            <div className="min-w-0">
              {previewFile && previewObjectUrl ? (
                <div className="flex flex-col">
                  <div className="flex gap-3 pb-2">
                    <span className={`material-symbols-rounded mt-0.5 shrink-0 text-[28px] leading-none sm:text-[32px] ${getUploadedFileIconInfo(previewFile.name).iconClass}`}aria-hidden>
                      {getUploadedFileIconInfo(previewFile.name).icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-text-primary sm:text-base">{previewFile.name}</p>
                      <p id={previewSubtitleId} className="mt-1 text-caption font-medium uppercase tracking-wide text-text-muted sm:text-xs">
                        Document preview<span className="text-text-disabled"> • </span>
                        {formatFileSize(previewFile.size)}
                      </p>
                    </div>
                  </div>
                  <div className="relative mt-3 min-h-[min(42dvh,280px)] overflow-auto rounded-lg bg-surface-document p-2 sm:min-h-[min(45dvh,320px)] sm:p-3">
                    <ViewFullButton name={previewFile.name} onClick={() => setViewerOpen(true)} />
                    <PreviewBlock {...fileToPreviewItem(previewFile, previewObjectUrl)} />
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[156px] items-center justify-center rounded-lg border-2 border-dashed border-border-input bg-surface-sunk px-4 text-center text-sm text-text-muted sm:min-h-[176px]">
                  Pick a file and I&apos;ll show it here.
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-caption font-semibold uppercase tracking-wide text-text-secondary">
                  Selected files ({uploadedFiles.length})
                  <RequiredMark />
                </p>
                {uploadedFiles.length > 0 ? (
                  <span className="shrink-0 text-caption font-medium text-text-muted">Click the file to preview</span>
                ) : null}
              </div>

              <ul className="flex flex-col gap-2">
                {uploadedFiles.map(({ id, file }) => {
                  const { icon, iconClass } = getUploadedFileIconInfo(file.name);
                  const selected = previewFileId === id;
                  return (
                    <li key={id} className={"relative flex items-center justify-start rounded-lg border bg-surface-card px-3 py-2.5 pr-11 sm:gap-2 sm:pr-3 " + (selected ? "border-action-secondary-border ring-2 ring-border-focus" : "border-border-input")}>
                      <button type="button" onClick={() => setPreviewFileId(id)} className="flex min-w-0 flex-1 cursor-pointer items-center justify-start gap-2 rounded-md text-left" aria-pressed={selected} aria-label={"Preview " + file.name}>
                        <span className={`material-symbols-rounded shrink-0 text-[22px] leading-none sm:text-[26px] ${iconClass}`} aria-hidden>
                          {icon}
                        </span>
                        <span className="min-w-0 break-words text-left text-sm leading-snug text-text-primary sm:flex-1 sm:truncate sm:leading-normal">
                          {file.name}
                        </span>
                      </button>
                      <button type="button" onClick={() => removeFile(id)} className="absolute right-2 top-1/2 flex h-8 w-8 shrink-0 before:absolute before:-inset-1.5 before:hidden before:content-[''] pointer-coarse:before:block -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-sunk hover:text-text-secondary sm:relative sm:translate-y-0" aria-label={"Remove " + file.name}>
                        <span className="material-symbols-rounded text-[20px] leading-none" aria-hidden>
                          close
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="relative min-w-0">
              <input ref={fileInputRef} type="file" className="absolute inset-0 z-20 h-full min-h-[156px] w-full cursor-pointer opacity-0 sm:min-h-[176px]" multiple accept={ATTACHMENT_ACCEPT} onChange={handleFilesSelected} aria-label="Choose files to attach" aria-required="true" aria-invalid={filesMissing ? true : undefined} aria-describedby={uploadError ? uploadErrorId : undefined} />
              <div className="pointer-events-none">
                <div className={`flex min-h-[156px] flex-col items-center justify-center gap-3 overflow-visible rounded-lg border-2 border-dashed px-4 py-5 sm:min-h-[176px] sm:gap-4 sm:py-6 ${filesMissing ? "border-action-danger bg-status-danger-bg" : "border-border-input bg-surface-sunk"}`}>
                  <span className="material-symbols-rounded inline-block origin-center text-[48px] leading-none text-text-muted [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_48] scale-[1.78] sm:scale-[2.02]" aria-hidden>
                    cloud_upload
                  </span>
                  <div className="flex flex-col items-center">
                    <p className="px-2 text-center text-[14px] font-medium leading-tight text-text-secondary">Click or drag files here to upload</p>
                    <p className="mt-1 px-2 text-center text-[12px] leading-tight text-text-muted">PDF, JPEG, PNG, HTML (Max 10MB)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border-subtle px-4 py-3 sm:flex-row sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
          <button type="button" onClick={onClose} disabled={uploading} className="box-border h-12 min-h-[48px] w-full min-w-0 cursor-pointer rounded-lg border border-action-secondary-border bg-surface-card px-3 text-sm font-semibold text-text-link transition-colors hover:bg-state-selected focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:min-h-[44px] sm:flex-1 sm:px-4">
            Cancel
          </button>
          <button type="button" onClick={() => void handleUploadClick()} disabled={uploading} className="box-border h-12 min-h-[48px] w-full min-w-0 cursor-pointer rounded-lg border border-transparent bg-action-primary px-4 text-sm font-semibold text-action-on-primary transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:min-h-[44px] sm:flex-1">
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
      {viewerOpen && previewFile && previewObjectUrl ? (
        <AttachmentFullScreenViewer
          item={fileToPreviewItem(previewFile, previewObjectUrl)}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}

