"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getAuth, isTokenExpired, isTokenExpiringSoon, redirectToLogin, refreshToken } from "@/lib/auth";
import { API_BASE } from "@/lib/apiBase";

// pdf.js runtime assets (worker, cMaps, standard fonts) are self-hosted under
// /public/pdfjs — copied out of node_modules by scripts/copy-pdfjs-assets.mjs
// so previews are served same-origin and never depend on a third-party CDN
// being reachable. Paths are version-agnostic because the copy step always
// mirrors the installed pdfjs-dist version.
const PDFJS_ASSET_BASE = "/pdfjs";

let workerSrcConfigured = false;

function configureWorker(pdfjs: typeof import("pdfjs-dist")) {
  if (workerSrcConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_ASSET_BASE}/pdf.worker.min.mjs`;
  workerSrcConfigured = true;
}

/**
 * cMap + standard-font resources pdf.js needs to render PDFs that use
 * CID-keyed fonts (e.g. Chinese/Japanese invoices) or that rely on the 14
 * standard fonts without embedding them. Without these, `getDocument` throws
 * ("Ensure that the cMapUrl and cMapPacked API parameters are provided") for
 * such files, so they silently fall through to the error state.
 */
const FONT_OPTIONS = {
  cMapUrl: `${PDFJS_ASSET_BASE}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${PDFJS_ASSET_BASE}/standard_fonts/`,
} as const;

/**
 * Turns a pdf.js load/render error into a short, user-facing reason so the
 * rarer "can't preview" cases (damaged file, encrypted, network) each show a
 * clear message instead of one generic line. pdf.js tags its errors via `name`.
 */
function describePdfError(err: unknown): string {
  const name = typeof err === "object" && err && "name" in err ? String((err as { name: unknown }).name) : "";
  switch (name) {
    case "InvalidPDFException":
      return "This file looks damaged or isn't a valid PDF, so it can't be previewed.";
    case "PasswordException":
      return "This PDF's locked, so I couldn't open it for preview.";
    case "MissingPDFException":
    case "UnexpectedResponseException":
      return "That PDF didn't come through. Check your connection, then mind trying again?";
    default:
      return "This PDF can't be previewed here.";
  }
}

const DEFAULT_MAX_PAGES = 50;

export type PdfJsCanvasPreviewProps = {
  src: string;
  /**
   * Optional Django proxy path for fetching the PDF with auth headers instead
   * of using the raw storage URL directly. When provided the component fetches
   * bytes server-to-client (authenticated) and renders via pdf.js canvas,
   * avoiding cross-origin iframe restrictions in Edge and other browsers.
   *
   * Example: "/api/v1/bills/{billId}/attachments/{attachmentId}/preview/"
   */
  previewApiPath?: string;
  title?: string;
  className?: string;
  maxPageWidthCssPx?: number;
  maxPages?: number;
};

/**
 * Returns true when `src` is a local URL (blob: or data:) that can be safely
 * fetched by pdf.js without hitting CORS restrictions.
 */
function isLocalSrc(src: string): boolean {
  return src.startsWith("blob:") || src.startsWith("data:");
}

/**
 * Fetch a PDF from a Django proxy endpoint with JWT auth headers.
 * Returns a blob: URL on success, or null on failure.
 */
async function fetchProxyBlob(apiPath: string): Promise<string | null> {
  try {
    if (isTokenExpiringSoon(5 * 60)) {
      const refreshed = await refreshToken();
      if (!refreshed && isTokenExpired()) {
        redirectToLogin();
        return null;
      }
    }
    const auth = getAuth();
    if (!auth?.token) {
      redirectToLogin();
      return null;
    }
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${auth.token}`);
    headers.set("X-Entity-Id", auth.entityId);
    const url = `${API_BASE.replace(/\/$/, "")}${apiPath}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    // Ensure the blob has the correct MIME type so pdf.js accepts it.
    const typed =
      blob.type && blob.type !== "application/octet-stream"
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: "application/pdf" });
    return URL.createObjectURL(typed);
  } catch {
    return null;
  }
}

export function PdfJsCanvasPreview({
  src,
  previewApiPath,
  title = "PDF preview",
  className = "",
  maxPageWidthCssPx = 720,
  maxPages = DEFAULT_MAX_PAGES,
}: PdfJsCanvasPreviewProps) {
  // When a Django proxy path is supplied, fetch the PDF bytes with auth and
  // render via pdf.js canvas — this avoids cross-origin iframe blocks entirely.
  if (previewApiPath) {
    return (
      <PdfJsProxyFetcher
        apiPath={previewApiPath}
        title={title}
        className={className}
        maxPageWidthCssPx={maxPageWidthCssPx}
        maxPages={maxPages}
      />
    );
  }

  // blob: / data: URLs are safe for pdf.js canvas rendering.
  if (isLocalSrc(src)) {
    return (
      <PdfJsCanvasRenderer
        src={src}
        title={title}
        className={className}
        maxPageWidthCssPx={maxPageWidthCssPx}
        maxPages={maxPages}
      />
    );
  }

  // Fallback for any remaining remote URL: render via pdf.js canvas directly.
  // (In practice this path should no longer be hit for B2 URLs — callers should
  // pass previewApiPath instead to avoid CORS and Edge iframe restrictions.)
  return (
    <PdfJsCanvasRenderer
      src={src}
      title={title}
      className={className}
      maxPageWidthCssPx={maxPageWidthCssPx}
      maxPages={maxPages}
    />
  );
}

/**
 * Fetches the PDF bytes from a Django proxy path (with JWT auth), creates a
 * blob URL, then hands it off to PdfJsCanvasRenderer.
 */
function PdfJsProxyFetcher({
  apiPath,
  title,
  className,
  maxPageWidthCssPx,
  maxPages,
}: {
  apiPath: string;
  title: string;
  className: string;
  maxPageWidthCssPx: number;
  maxPages: number;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [loadedPath, setLoadedPath] = useState(apiPath);

  // Reset the preview state during render (not in the effect) when the source
  // path changes, so the spinner shows immediately instead of briefly keeping
  // the previous PDF. This is React's "adjust state on prop change" pattern.
  if (loadedPath !== apiPath) {
    setLoadedPath(apiPath);
    setBlobUrl(null);
    setFetchError(false);
  }

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    void (async () => {
      const url = await fetchProxyBlob(apiPath);
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (!url) {
        setFetchError(true);
        return;
      }
      createdUrl = url;
      setBlobUrl(url);
    })();

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
        createdUrl = null;
      }
    };
  }, [apiPath]);

  if (fetchError) {
    return (
      <div className={`${className} flex flex-col items-center gap-2 py-8 text-center text-sm text-primary/70`}>
        <span className="material-symbols-outlined text-[28px] text-primary/40" aria-hidden>
          description
        </span>
        <p>The PDF couldn&apos;t be loaded. Please check your connection and try again.</p>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className={`${className} flex min-h-[200px] items-center justify-center py-8 text-sm text-primary/60`}>
        <span className="inline-flex items-center gap-2">
          <span className="material-symbols-outlined animate-spin text-secondary text-[22px]" aria-hidden>
            progress_activity
          </span>
          Loading PDF…
        </span>
      </div>
    );
  }

  return (
    <PdfJsCanvasRenderer
      src={blobUrl}
      title={title}
      className={className}
      maxPageWidthCssPx={maxPageWidthCssPx}
      maxPages={maxPages}
    />
  );
}

function PdfJsCanvasRenderer({
  src,
  title,
  className,
  maxPageWidthCssPx,
  maxPages,
}: Required<Omit<PdfJsCanvasPreviewProps, "previewApiPath">>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready" | "password">("loading");
  const [passwordError, setPasswordError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("This PDF can't be previewed here.");
  // Holds pdf.js's callback that resumes document loading once the user submits
  // a password. Set when the PDF is encrypted; cleared between loads.
  const submitPasswordRef = useRef<((password: string) => void) | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: import("pdfjs-dist").PDFDocumentProxy | undefined;
    const host = hostRef.current;
    if (!host) return;

    host.replaceChildren();
    setStatus("loading");
    setPasswordError(false);
    submitPasswordRef.current = null;

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        configureWorker(pdfjs);
        const loadingTask = pdfjs.getDocument({ url: src, withCredentials: false, ...FONT_OPTIONS });
        // Encrypted PDFs: pdf.js invokes onPassword instead of rejecting. Show a
        // password prompt and hand the entered value back via updatePassword.
        loadingTask.onPassword = (updatePassword: (password: string) => void, reason: number) => {
          if (cancelled) return;
          submitPasswordRef.current = updatePassword;
          setPasswordError(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
          setStatus("password");
        };
        pdfDoc = await loadingTask.promise;
        const pageLimit = Math.min(pdfDoc.numPages, Math.max(1, maxPages));
        const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1, 2);

        for (let p = 1; p <= pageLimit; p++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(p);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(maxPageWidthCssPx / base.width, 2.5);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${title} — page ${p} of ${pdfDoc.numPages}`);
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.maxWidth = `${viewport.width}px`;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className =
            "mx-auto block rounded border border-gray-200 bg-white shadow-sm";
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("2D context unavailable");
          ctx.scale(dpr, dpr);
          const renderTask = page.render({ canvasContext: ctx, viewport });
          await renderTask.promise;
          if (cancelled) return;
          host.appendChild(canvas);
        }

        if (!cancelled && pageLimit < pdfDoc.numPages) {
          const note = document.createElement("p");
          note.className = "mt-2 text-center text-xs text-primary/55";
          note.textContent = `Showing first ${pageLimit} of ${pdfDoc.numPages} pages.`;
          host.appendChild(note);
        }

        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(describePdfError(err));
          setStatus("error");
        }
      } finally {
        if (pdfDoc) {
          await pdfDoc.destroy().catch(() => {});
        }
      }
    })();

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [src, title, maxPageWidthCssPx, maxPages]);

  const submitPassword = (value: string) => {
    const submit = submitPasswordRef.current;
    if (!submit || !value) return;
    setStatus("loading");
    submit(value);
  };

  const handlePasswordSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submitPassword(passwordInputRef.current?.value ?? "");
  };

  return (
    <div className={className}>
      {status === "loading" ? (
        <div className="flex min-h-[200px] items-center justify-center py-8 text-sm text-primary/60">
          <span className="inline-flex items-center gap-2">
            <span className="material-symbols-outlined animate-spin text-secondary text-[22px]" aria-hidden>
              progress_activity
            </span>
            Loading PDF…
          </span>
        </div>
      ) : null}
      {status === "password" ? (
        <form
          onSubmit={handlePasswordSubmit}
          onClick={(e) => {
            // The preview pane carries a "view full" control. Keep clicks inside this
            // prompt from reaching it (preventDefault does not affect input focus or our
            // own handlers), so typing a password never enlarges the file.
            e.preventDefault();
            e.stopPropagation();
          }}
          className="mx-auto flex w-full max-w-sm flex-col items-center gap-3 py-8 text-center text-sm text-primary/80"
        >
          <span className="material-symbols-outlined text-[28px] text-secondary" aria-hidden>
            lock
          </span>
          <p className="font-medium text-black">This PDF is password-protected</p>
          <p className="text-primary/60">Enter the password to preview it.</p>
          <input
            ref={passwordInputRef}
            type="password"
            name="pdf-password"
            autoFocus
            aria-label="PDF password"
            aria-invalid={passwordError}
            className={`w-full rounded-lg border px-3 py-2 text-sm text-black outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
              passwordError ? "border-red-400" : "border-gray-300"
            }`}
          />
          {passwordError ? (
            <p role="alert" className="text-xs font-medium text-red-500">
              That wasn&apos;t the right password! Let&apos;s try again?
            </p>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              submitPassword(passwordInputRef.current?.value ?? "");
            }}
            className="w-full rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            Unlock preview
          </button>
        </form>
      ) : null}
      {status === "error" ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-primary/70">
          <span className="material-symbols-outlined text-[28px] text-primary/40" aria-hidden>
            description
          </span>
          <p>{errorMessage}</p>
        </div>
      ) : null}
      <div ref={hostRef} className={status === "ready" ? "flex w-full flex-col items-stretch gap-3" : "hidden"} />
    </div>
  );
}
