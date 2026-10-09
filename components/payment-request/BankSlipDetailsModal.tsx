"use client";

import { createPortal } from "react-dom";
import type { ChangeEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { pushAppScrollLock } from "@/lib/appScrollRoot";
import { useEntityCurrency } from "@/lib/entityCurrency";
import {
  ApiError,
  createPayment,
  deletePayment,
  deletePaymentAttachment,
  fetchPaymentAttachmentPreview,
  fetchPayments,
  updatePayment,
  uploadPaymentAttachment,
  type PaymentItem,
} from "@/lib/api";
import { formatFileSize, isAllowedAttachment, ATTACHMENT_ACCEPT } from "@/lib/fileAttachmentPreview";
import { RequiredMark } from "@/components/RequiredMark";
import {
  AttachmentFullScreenViewer,
  fileToPreviewItem,
  nameToPreviewMime,
  PreviewBlock,
  ViewFullButton,
} from "./AttachmentFullScreenViewer";
import { AttachmentDeleteConfirmModal } from "./AttachmentDeleteConfirmModal";

export type BankSlipFileRef = { id: string; name: string };

export type BankSlipFileFetchSource = {
  billId: string;
  paymentId: string;
  attachmentId: string;
  fileAttachmentId?: string;
};

export type BankSlipFileDetailsOverride = Partial<{
  createdBy: string;
  createdAt: string;
  toName: string;
  toAccount: string;
  amount: string;
  fromName: string;
  fromAccount: string;
  when: string;
}>;

export type BankSlipFileEntry = BankSlipFileRef & {
  details?: BankSlipFileDetailsOverride;
  previewUrl?: string;
  fetchSource?: BankSlipFileFetchSource;
  fileSizeBytes?: number;
};

/** Row-level metadata (subtitle only in the simplified modal). */
export type BankSlipDetails = {
  createdBy: string;
  createdAt: string;
  toName: string;
  toAccount?: string;
  amount: string;
  fromName: string;
  fromAccount?: string;
  when: string;
  files: BankSlipFileEntry[];
};

export type BankSlipDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  details: BankSlipDetails;
  inlineUploadBillContext?: { billId: string; currencyCode?: string };
  onInlineUploadSuccess?: () => void;
  onRemoveFile?: (fileId: string) => void;
  allowRemoveFiles?: boolean;
  onBankSlipFileDeleted?: () => void;
};

const overlayClass =
  "fixed inset-0 z-[300] flex items-center justify-center overflow-x-hidden overscroll-x-none p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:p-4 md:p-6";

const shellClass =
  "relative z-[1] flex max-h-[min(100dvh-1rem,760px)] w-full min-w-0 max-w-[520px] flex-col rounded-xl bg-white shadow-xl ring-1 ring-black/5 sm:max-h-[min(92dvh,760px)] sm:rounded-2xl";


const bankSlipModalFooterCancelClass =
  "box-border h-12 min-h-[48px] w-full min-w-0 cursor-pointer rounded-lg border-2 border-secondary bg-white px-3 text-sm font-semibold text-secondary transition-colors hover:bg-secondary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:min-h-[44px] sm:flex-1 sm:px-4";

const bankSlipModalFooterPrimaryClass =
  "box-border h-12 min-h-[48px] w-full min-w-0 cursor-pointer rounded-lg border border-transparent bg-secondary px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:min-h-[44px] sm:flex-1";

type StagedBankSlipEntry = { id: string; file: File };

function pickExistingPaymentIdForBankSlipUpload(payments: PaymentItem[], billId: string): string | null {
  const forBill = payments.filter((p) => p.bill_id === billId);
  if (forBill.length === 0) return null;

  const byDateDesc = (a: PaymentItem, b: PaymentItem) => {
    const da = (a.payment_date ?? "").trim();
    const db = (b.payment_date ?? "").trim();
    return db.localeCompare(da);
  };

  const pending = forBill.filter((p) => (p.payment_status ?? "").trim().toLowerCase() === "pending");
  if (pending.length > 0) {
    return [...pending].sort(byDateDesc)[0]!.id;
  }

  const settled = forBill.filter((p) => (p.payment_status ?? "").trim().toLowerCase() !== "pending");
  if (settled.length > 0) {
    return [...settled].sort(byDateDesc)[0]!.id;
  }

  return null;
}

function fileIconForName(filename: string): { icon: string; iconClass: string } {
  const ext = filename.trim().split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return { icon: "picture_as_pdf", iconClass: "text-red-600" };
  if (ext === "jpg" || ext === "jpeg" || ext === "png") return { icon: "image", iconClass: "text-sky-600" };
  if (ext === "html" || ext === "htm") return { icon: "html", iconClass: "text-orange-600" };
  return { icon: "draft", iconClass: "text-primary" };
}

function isPdfName(name: string): boolean {
  return name.trim().toLowerCase().endsWith(".pdf");
}

function isImageName(name: string): boolean {
  const ext = name.trim().split(".").pop()?.toLowerCase() ?? "";
  return ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "gif" || ext === "webp";
}

function isHtmlName(name: string): boolean {
  const ext = name.trim().split(".").pop()?.toLowerCase() ?? "";
  return ext === "html" || ext === "htm";
}

/**
 * What makes a previewed file a DIFFERENT file.
 *
 * Both preview components hold state about the file in front of them - a load/ready/error state
 * and a resolved size - and both used to clear it in an effect when the props changed. React's
 * answer for "reset all state when the identity changes" is a `key`: remounting starts the state
 * at its initial value, with no setState inside an effect and no frame showing the previous
 * file's size next to this file's name.
 */
function previewIdentity(
  fileName: string,
  previewUrl?: string,
  fetchSource?: BankSlipFileFetchSource,
): string {
  return [
    fileName,
    previewUrl ?? "",
    fetchSource?.billId ?? "",
    fetchSource?.paymentId ?? "",
    fetchSource?.attachmentId ?? "",
    fetchSource?.fileAttachmentId ?? "",
  ].join("|");
}

function PreviewContent({
  fileName,
  previewUrl,
  fetchSource,
  onResolvedFileSize,
}: {
  fileName: string;
  previewUrl?: string;
  fetchSource?: BankSlipFileFetchSource;
  onResolvedFileSize?: (bytes: number) => void;
}) {
  if (previewUrl) {
    return <BlobOrUrlPreviewContent fileName={fileName} url={previewUrl} />;
  }
  if (fetchSource) {
    return (
      <FetchedPreviewContent
        key={previewIdentity(fileName, previewUrl, fetchSource)}
        fileName={fileName}
        source={fetchSource}
        onResolvedFileSize={onResolvedFileSize}
      />
    );
  }
  return (
    <p className="py-8 text-center text-sm text-primary/70">No preview available for this file.</p>
  );
}

function BlobOrUrlPreviewContent({ fileName, url }: { fileName: string; url: string }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const item = { url, name: fileName, mime: nameToPreviewMime(fileName) };
  return (
    <div className="relative w-full">
      <ViewFullButton name={fileName} onClick={() => setViewerOpen(true)} />
      <PreviewBlock {...item} />
      {viewerOpen ? <AttachmentFullScreenViewer item={item} onClose={() => setViewerOpen(false)} /> : null}
    </div>
  );
}

function FetchedPreviewContent({
  fileName,
  source,
  onResolvedFileSize,
}: {
  fileName: string;
  source: BankSlipFileFetchSource;
  onResolvedFileSize?: (bytes: number) => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; url: string; mime: string; previewApiPath?: string }
    | { status: "error" }
  >({ status: "loading" });

  // No reset here: the parent keys this component on the file's identity (see previewIdentity),
  // so a different file is a fresh mount whose state already starts at "loading".
  useEffect(() => {
    let cancelled = false;
    const blobObjectUrlRef: { current: string | null } = { current: null };
    (async () => {
      try {
        const preview = await fetchPaymentAttachmentPreview(
          source.billId,
          source.paymentId,
          source.attachmentId,
          source.fileAttachmentId,
        );
        if (cancelled) return;

        if (preview.kind === "embed") {
          const mime = (preview.mime_type || "").toLowerCase();
          // Build a Django proxy path for PDFs so the browser never loads
          // the raw B2 presigned URL inside a canvas/frame — avoids Edge's
          // cross-origin block ("Unsafe attempt to load URL https://s3.us-east-005...").
          const isPdf = mime === "application/pdf" || isPdfName(fileName);
          const previewApiPath = isPdf
            ? `/api/v1/bills/${source.billId}/payments/${source.paymentId}/attachments/${source.attachmentId}/preview/`
            : undefined;
          setState({ status: "ready", url: preview.url, mime, previewApiPath });
          const sz = preview.file_size;
          if (sz != null && Number.isFinite(sz) && sz >= 0) {
            onResolvedFileSize?.(sz);
          }
          return;
        }

        const blob = preview.blob;
        const rawType = (blob.type || "").toLowerCase();
        let previewBlob = blob;
        if (isPdfName(fileName) && (!rawType || rawType === "application/octet-stream")) {
          previewBlob = new Blob([await blob.arrayBuffer()], { type: "application/pdf" });
        } else if (isImageName(fileName) && (!rawType || rawType === "application/octet-stream")) {
          const ext = fileName.trim().split(".").pop()?.toLowerCase() ?? "";
          const imageType =
            ext === "png"
              ? "image/png"
              : ext === "gif"
                ? "image/gif"
                : ext === "webp"
                  ? "image/webp"
                  : "image/jpeg";
          previewBlob = new Blob([await blob.arrayBuffer()], { type: imageType });
        }
        const objectUrl = URL.createObjectURL(previewBlob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        blobObjectUrlRef.current = objectUrl;
        setState({ status: "ready", url: objectUrl, mime: previewBlob.type || "" });
        const sz = preview.file_size ?? previewBlob.size;
        if (Number.isFinite(sz) && sz >= 0) {
          onResolvedFileSize?.(sz);
        }
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
      if (blobObjectUrlRef.current) {
        URL.revokeObjectURL(blobObjectUrlRef.current);
        blobObjectUrlRef.current = null;
      }
    };
  }, [source.billId, source.paymentId, source.attachmentId, source.fileAttachmentId, onResolvedFileSize]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-[200px] items-center justify-center py-8">
        <span className="inline-flex items-center gap-2 text-sm text-primary/60">
          <span className="material-symbols-outlined animate-spin text-secondary text-[22px]" aria-hidden>
            progress_activity
          </span>
          Loading preview…
        </span>
      </div>
    );
  }
  if (state.status === "error") {
    return <p className="py-8 text-center text-sm text-primary/70">Could not load this file.</p>;
  }

  const { url, mime } = state;
  const previewApiPath = "previewApiPath" in state ? state.previewApiPath : undefined;
  const showImage = mime.startsWith("image/") || isImageName(fileName);
  const showHtml = (mime === "text/html" || isHtmlName(fileName)) && !showImage;
  // B2 serves PDFs as octet-stream; call it a PDF so PreviewBlock draws it instead of
  // falling through to its "cannot preview" card.
  const showPdf = !showHtml && (mime === "application/pdf" || mime === "application/octet-stream" || isPdfName(fileName));
  const item = {
    url,
    name: fileName,
    mime: showImage ? (mime.startsWith("image/") ? mime : "image/*") : showPdf ? "application/pdf" : showHtml ? "text/html" : mime,
    previewApiPath,
  };

  return (
    <div className="relative w-full">
      <ViewFullButton name={fileName} onClick={() => setViewerOpen(true)} />
      <PreviewBlock {...item} />
      {viewerOpen ? <AttachmentFullScreenViewer item={item} onClose={() => setViewerOpen(false)} /> : null}
    </div>
  );
}

function ViewBankSlipInlinePreview({
  fileName,
  previewUrl,
  fetchSource,
  previewSubtitleId,
  fileSizeBytes,
}: {
  fileName: string;
  previewUrl?: string;
  fetchSource?: BankSlipFileFetchSource;
  previewSubtitleId: string;
  fileSizeBytes?: number;
}) {
  // Keyed on the file's identity by the caller (see previewIdentity), so this starts empty for
  // every new file rather than being cleared in an effect.
  const [fetchedSize, setFetchedSize] = useState<number | undefined>(undefined);

  const displayBytes =
    fileSizeBytes != null && Number.isFinite(fileSizeBytes) && fileSizeBytes >= 0
      ? fileSizeBytes
      : fetchedSize;

  const { icon, iconClass } = fileIconForName(fileName);
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-3 pb-2">
        <span
          className={`material-symbols-outlined mt-0.5 shrink-0 text-[28px] leading-none sm:text-[32px] ${iconClass}`}
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-black sm:text-base">{fileName}</p>
          <p id={previewSubtitleId} className="mt-1 text-[11px] font-medium uppercase tracking-wide text-primary/55 sm:text-xs">
            Document preview
            {displayBytes != null && Number.isFinite(displayBytes) ? (
              <>
                <span className="text-primary/35"> • </span>
                {formatFileSize(displayBytes)}
              </>
            ) : null}
          </p>
        </div>
      </div>
      <div className="mt-3 min-h-[min(50dvh,320px)] overflow-auto rounded-lg bg-black/5 p-2 sm:min-h-[240px] sm:p-3">
        <PreviewContent
          fileName={fileName}
          previewUrl={previewUrl}
          fetchSource={fetchSource}
          onResolvedFileSize={fetchSource ? setFetchedSize : undefined}
        />
      </div>
    </div>
  );
}

function StagedBankSlipInlinePreview({
  file,
  objectUrl,
  previewSubtitleId,
}: {
  file: File;
  objectUrl: string;
  previewSubtitleId: string;
}) {
  const { icon, iconClass } = fileIconForName(file.name);
  const [viewerOpen, setViewerOpen] = useState(false);
  const item = fileToPreviewItem(file, objectUrl);
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-3 pb-2">
        <span
          className={`material-symbols-outlined mt-0.5 shrink-0 text-[28px] leading-none sm:text-[32px] ${iconClass}`}
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-black sm:text-base">{file.name}</p>
          <p id={previewSubtitleId} className="mt-1 text-[11px] font-medium tracking-wide text-primary/55 sm:text-xs">
            Document preview<span className="text-primary/35"> • </span>
            {formatFileSize(file.size)}
          </p>
        </div>
      </div>
      <div className="relative mt-3 min-h-[min(50dvh,320px)] overflow-auto rounded-lg bg-black/5 p-2 sm:min-h-[240px] sm:p-3">
        <ViewFullButton name={file.name} onClick={() => setViewerOpen(true)} />
        <PreviewBlock {...item} />
      </div>
      {viewerOpen ? <AttachmentFullScreenViewer item={item} onClose={() => setViewerOpen(false)} /> : null}
    </div>
  );
}

export function BankSlipDetailsModal({
  open,
  onClose,
  details,
  inlineUploadBillContext,
  onInlineUploadSuccess,
  onRemoveFile,
  allowRemoveFiles = true,
  onBankSlipFileDeleted,
}: BankSlipDetailsModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const previewSubtitleId = useId();
  const uploadErrorId = useId();
  const [files, setFiles] = useState<BankSlipFileEntry[]>(() => details.files);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(() => details.files[0]?.id ?? null);
  const [selectedStagedId, setSelectedStagedId] = useState<string | null>(null);
  const [stagedUploads, setStagedUploads] = useState<StagedBankSlipEntry[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingDeleteFileId, setPendingDeleteFileId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const detailsFileIdsSigRef = useRef<string | null>(null);

  const inlineBillId = inlineUploadBillContext?.billId;
  // Always the entity's selected currency (entities.currency_id -> iso_code).
  const inlineCurrency = useEntityCurrency();

  const stagedPreviewFile = selectedStagedId ? stagedUploads.find((x) => x.id === selectedStagedId)?.file ?? null : null;
  const [stagedObjectUrl, setStagedObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!stagedPreviewFile) {
      setStagedObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(stagedPreviewFile);
    setStagedObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [stagedPreviewFile]);

  useEffect(() => {
    if (!open) {
      detailsFileIdsSigRef.current = null;
      return;
    }
    const nextFiles = details.files.map((f) => ({ ...f }));
    const nextSig = nextFiles.map((f) => f.id).join("\0");
    const prevSig = detailsFileIdsSigRef.current;
    detailsFileIdsSigRef.current = nextSig;

    setFiles(nextFiles);
    setPendingDeleteFileId(null);
    setDeleteError(null);
    setDeletePending(false);

    const prevIds = prevSig?.split("\0").filter(Boolean) ?? [];
    const nextIds = nextFiles.map((f) => f.id);

    if (prevSig == null) {
      setSelectedFileId(nextFiles[0]?.id ?? null);
    } else if (nextIds.length > prevIds.length) {
      const appended = nextIds.slice(prevIds.length);
      setSelectedFileId(appended.length ? appended[appended.length - 1]! : nextIds[nextIds.length - 1]!);
    } else {
      setSelectedFileId((sel) => {
        if (sel != null && nextFiles.some((f) => f.id === sel)) return sel;
        return nextFiles[0]?.id ?? null;
      });
    }
  }, [open, details]);

  useEffect(() => {
    if (!open) {
      setStagedUploads([]);
      setSelectedStagedId(null);
      setUploadError(null);
      setUploading(false);
    }
  }, [open]);

  useEffect(() => {
    if (selectedStagedId && !stagedUploads.some((x) => x.id === selectedStagedId)) {
      setSelectedStagedId(null);
    }
  }, [stagedUploads, selectedStagedId]);

  useEffect(() => {
    setSelectedFileId((sel) => {
      if (files.length === 0) return null;
      if (sel != null && files.some((f) => f.id === sel)) return sel;
      return files[0].id;
    });
  }, [files]);

  useEffect(() => {
    if (!open) return;
    return pushAppScrollLock();
  }, [open]);

  useEffect(() => {
    if (!open || pendingDeleteFileId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, pendingDeleteFileId]);

  const removeLocal = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    onRemoveFile?.(fileId);
  };

  const handleStagedFilesSelected = (e: ChangeEvent<HTMLInputElement>) => {
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
    const added: StagedBankSlipEntry[] = Array.from(list).map((file) => ({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
    }));
    setStagedUploads((prev) => [...prev, ...added]);
    setSelectedStagedId(added[added.length - 1]?.id ?? null);
    setSelectedFileId(null);
    setUploadError(null);
    e.target.value = "";
  };

  const removeStaged = (entryId: string) => {
    setStagedUploads((prev) => prev.filter((x) => x.id !== entryId));
    if (selectedStagedId === entryId) setSelectedStagedId(null);
  };

  const handleCommitInlineUpload = async () => {
    if (!inlineBillId || stagedUploads.length === 0) {
      setUploadError("I need at least one bank slip to work with first.");
      return;
    }
    setUploadError(null);
    if (uploading) return;
    setUploading(true);
    let createdPaymentId: string | null = null;
    try {
      const { payments } = await fetchPayments(inlineBillId);
      const existingPaymentId = pickExistingPaymentIdForBankSlipUpload(payments, inlineBillId);
      const existingPayment = existingPaymentId
        ? payments.find((p) => p.id === existingPaymentId) ?? null
        : null;
      const existingStatus = (existingPayment?.payment_status ?? "").trim().toLowerCase();

      let paymentId: string;
      if (existingPaymentId) {
        paymentId = existingPaymentId;
      } else {
        const payment = await createPayment(inlineBillId, {
          currency_code: inlineCurrency,
          payment_status: "pending",
        });
        paymentId = payment.id;
        createdPaymentId = payment.id;
      }

      for (const { file } of stagedUploads) {
        await uploadPaymentAttachment(inlineBillId, paymentId, file, "bank_slip");
      }

      const shouldFinalize = createdPaymentId != null || existingStatus === "pending";
      if (shouldFinalize) {
        await updatePayment(inlineBillId, paymentId, { payment_status: "completed" });
      }

      setStagedUploads([]);
      setSelectedStagedId(null);
      onInlineUploadSuccess?.();
    } catch (e) {
      if (createdPaymentId) {
        try {
          await deletePayment(inlineBillId, createdPaymentId);
        } catch {
          /* best-effort rollback */
        }
      }
      setUploadError(e instanceof ApiError ? e.message : "That upload didn't quite go through. Mind trying again?");
    } finally {
      setUploading(false);
    }
  };

  const pendingDeleteFile = pendingDeleteFileId ? files.find((f) => f.id === pendingDeleteFileId) : undefined;

  const confirmDeleteBankSlip = async () => {
    if (!pendingDeleteFileId || !pendingDeleteFile) return;
    setDeleteError(null);
    const wasLast = files.length === 1;
    try {
      if (pendingDeleteFile.fetchSource) {
        setDeletePending(true);
        const { billId, paymentId, attachmentId } = pendingDeleteFile.fetchSource;
        await deletePaymentAttachment(billId, paymentId, attachmentId);
      }
      removeLocal(pendingDeleteFileId);
      setPendingDeleteFileId(null);
      onBankSlipFileDeleted?.();
      if (wasLast) onClose();
    } catch (e) {
      setPendingDeleteFileId(null);
      setDeleteError(e instanceof ApiError ? e.message : "This bank slip's being a bit stubborn. Mind trying again?");
    } finally {
      setDeletePending(false);
    }
  };

  const selectedEntry = files.find((f) => f.id === selectedFileId);
  const showRemoveOnRows = allowRemoveFiles;
  const showInlineUpload = inlineBillId != null;
  const previewingStaged = Boolean(selectedStagedId && stagedPreviewFile && stagedObjectUrl);
  const totalListedFiles = files.length + stagedUploads.length;
  /** A file problem, not a server one: a failed upload leaves its files staged, a refused one does not. */
  const slipsMissing = Boolean(uploadError) && stagedUploads.length === 0;
  const billTitle = details.toName.trim();

  if (!open) return null;

  return createPortal(
    <div className={overlayClass} role="presentation">
      <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-black/35 backdrop-blur-[1px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={
          [
            billTitle ? descriptionId : null,
            previewingStaged || selectedEntry ? previewSubtitleId : null,
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        className={shellClass}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 pb-3 pt-4 sm:gap-4 sm:px-6 sm:pb-4 sm:pt-6">
          <div className="min-w-0 pr-2">
            <h2 id={titleId} className="text-lg font-bold leading-snug text-black sm:text-xl md:text-2xl">
              {showInlineUpload ? "Upload Bank Slip" : "Bank Slip"}
            </h2>
            {billTitle ? (
              <p id={descriptionId} className="mt-1 break-words text-sm text-primary/70">
                {details.toName}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-primary transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6">
          {uploadError ? (
            <div id={uploadErrorId} className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
              {uploadError}
            </div>
          ) : null}
          {deleteError ? (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
              {deleteError}
            </div>
          ) : null}
          <div className="flex flex-col gap-6">
            <div className="min-w-0">
              {previewingStaged && stagedPreviewFile && stagedObjectUrl ? (
                <StagedBankSlipInlinePreview
                  file={stagedPreviewFile}
                  objectUrl={stagedObjectUrl}
                  previewSubtitleId={previewSubtitleId}
                />
              ) : selectedStagedId && stagedPreviewFile && !stagedObjectUrl ? (
                <div className="flex min-h-[156px] items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 text-center text-sm text-primary/60 sm:min-h-[176px]">
                  Loading preview…
                </div>
              ) : selectedEntry ? (
                <ViewBankSlipInlinePreview
                  key={previewIdentity(
                    selectedEntry.name,
                    selectedEntry.previewUrl,
                    selectedEntry.fetchSource,
                  )}
                  fileName={selectedEntry.name}
                  previewUrl={selectedEntry.previewUrl}
                  fetchSource={selectedEntry.fetchSource}
                  previewSubtitleId={previewSubtitleId}
                  fileSizeBytes={selectedEntry.fileSizeBytes}
                />
              ) : files.length === 0 && !showInlineUpload ? (
                <div className="flex min-h-[156px] items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 text-center text-sm text-primary/60 sm:min-h-[176px]">
                  No bank slips added for these payments yet.
                </div>
              ) : (
                <div className="flex min-h-[156px] items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 text-center text-sm text-primary/60 sm:min-h-[176px]">
                  {showInlineUpload && files.length === 0 && stagedUploads.length === 0
                    ? "No bank slips here yet."
                    : "Pick a file and I'll show it here."}
                </div>
              )}
            </div>

            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-[11px] font-semibold uppercase tracking-wide text-primary/80">
                Uploaded files ({totalListedFiles})
                {showInlineUpload ? <RequiredMark /> : null}
              </p>
              {totalListedFiles > 0 ? (
                <span className="shrink-0 text-[10px] font-medium text-primary/55 sm:text-[11px]">Click the file to preview</span>
              ) : null}
            </div>
            <ul className="flex flex-col gap-2">
                {files.map((f) => {
                  const { icon, iconClass } = fileIconForName(f.name);
                  const selected = f.id === selectedFileId && selectedStagedId == null;
                  return (
                    <li
                      key={f.id}
                      className={
                        "relative flex items-center justify-start rounded-lg border bg-white px-3 py-2.5 pr-11 sm:gap-2 sm:pr-3 " +
                        (selected ? "border-secondary/50 ring-2 ring-secondary/20" : "border-gray-300")
                      }
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFileId(f.id);
                          setSelectedStagedId(null);
                        }}
                        className="flex min-w-0 flex-1 cursor-pointer items-center justify-start gap-2 rounded-md text-left"
                        aria-pressed={selected}
                        aria-label={`Preview ${f.name}`}
                      >
                        <span
                          className={`material-symbols-outlined shrink-0 text-[22px] leading-none sm:text-[26px] ${iconClass}`}
                          aria-hidden
                        >
                          {icon}
                        </span>
                        <span className="min-w-0 break-words text-left text-sm leading-snug text-black sm:flex-1 sm:truncate sm:leading-normal">
                          {f.name}
                        </span>
                      </button>
                      {showRemoveOnRows ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setPendingDeleteFileId(f.id);
                          }}
                          className="absolute right-2 top-1/2 flex h-8 w-8 shrink-0 -translate-y-1/2 items-center justify-center rounded-md text-primary/60 transition-colors hover:bg-gray-100 hover:text-primary sm:static sm:translate-y-0"
                          aria-label={`Delete ${f.name}`}
                        >
                          <span className="material-symbols-outlined text-[20px] leading-none" aria-hidden>
                            close
                          </span>
                        </button>
                      ) : null}
                    </li>
                  );
                })}
                {stagedUploads.map(({ id, file }) => {
                  const { icon, iconClass } = fileIconForName(file.name);
                  const selected = selectedStagedId === id;
                  return (
                    <li
                      key={`staged-${id}`}
                      className={
                        "relative flex items-center justify-start rounded-lg border bg-white px-3 py-2.5 pr-11 sm:gap-2 sm:pr-3 " +
                        (selected ? "border-secondary/50 ring-2 ring-secondary/20" : "border-gray-300")
                      }
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStagedId(id);
                          setSelectedFileId(null);
                        }}
                        className="flex min-w-0 flex-1 cursor-pointer items-center justify-start gap-2 rounded-md text-left"
                        aria-pressed={selected}
                        aria-label={`Preview ${file.name}`}
                      >
                        <span
                          className={`material-symbols-outlined shrink-0 text-[22px] leading-none sm:text-[26px] ${iconClass}`}
                          aria-hidden
                        >
                          {icon}
                        </span>
                        <span className="min-w-0 break-words text-left text-sm leading-snug text-black sm:flex-1 sm:truncate sm:leading-normal">
                          {file.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStaged(id)}
                        className="absolute right-2 top-1/2 flex h-8 w-8 shrink-0 -translate-y-1/2 items-center justify-center rounded-md text-primary/60 transition-colors hover:bg-gray-100 hover:text-primary sm:static sm:translate-y-0"
                        aria-label={`Remove ${file.name}`}
                      >
                        <span className="material-symbols-outlined text-[20px] leading-none" aria-hidden>
                          close
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>

            {showInlineUpload ? (
              <div className="relative">
                <input
                  type="file"
                  className="absolute inset-0 z-20 h-full min-h-[156px] w-full cursor-pointer opacity-0 sm:min-h-[176px]"
                  multiple
                  accept={ATTACHMENT_ACCEPT}
                  onChange={handleStagedFilesSelected}
                  disabled={uploading}
                  aria-label="Choose bank slips to attach"
                  aria-required="true"
                  aria-invalid={slipsMissing ? true : undefined}
                  aria-describedby={uploadError ? uploadErrorId : undefined}
                />
                <div className="pointer-events-none">
                  <div className={`flex min-h-[156px] flex-col items-center justify-center gap-3 overflow-visible rounded-lg border-2 border-dashed px-4 py-5 sm:min-h-[176px] sm:gap-4 sm:py-6 ${slipsMissing ? "border-red-500 bg-red-50/40" : "border-gray-300 bg-gray-50"}`}>
                    <span className="material-symbols-outlined inline-block origin-center text-[48px] leading-none text-gray-400 [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_48] scale-[1.78] sm:text-[48px] sm:scale-[2.02]" aria-hidden>cloud_upload</span>
                    <div className="flex flex-col items-center">
                      <p className="px-2 text-center text-[14px] font-medium leading-tight text-gray-700">Click to upload or drag and drop</p>
                      <p className="mt-1 px-2 text-center text-[12px] leading-tight text-gray-400">PDF, JPEG, PNG, HTML (Max 10MB)</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 px-4 py-3 sm:flex-row sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
          <button type="button" onClick={onClose} disabled={uploading} className={bankSlipModalFooterCancelClass}>
            Cancel
          </button>
          {showInlineUpload ? (
            <button
              type="button"
              onClick={() => void handleCommitInlineUpload()}
              disabled={uploading || stagedUploads.length === 0}
              className={bankSlipModalFooterPrimaryClass}
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          ) : null}
        </div>
      </div>
      <AttachmentDeleteConfirmModal
        open={pendingDeleteFileId != null}
        count={1}
        pending={deletePending}
        variant="bankSlip"
        fileName={pendingDeleteFile?.name}
        onClose={() => {
          if (!deletePending) {
            setPendingDeleteFileId(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void confirmDeleteBankSlip()}
      />
    </div>,
    document.body,
  );
}
