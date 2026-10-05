import {
  type AuthInfo,
  getAuth,
  isTokenExpired,
  isTokenExpiringSoon,
  redirectToLogin,
  refreshToken,
} from "./auth";
import { compressImage } from "./compressImage";
import { API_BASE } from "./apiBase";

//  ── Error ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  /**
   * The server's own text, before it was made fit to show. `message` is what a
   * user reads; `detail` is what the shape-detectors below match on, because
   * Xero's rejection payloads are exactly the machine-shaped text `message` is
   * now scrubbed of.
   */
  public detail?: string;

  constructor(
    public status: number,
    message: string,
    detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.detail = detail ?? message;
  }
}

/** 422 from billing API when `reference` duplicates another bill in the entity. */
export function isDuplicateBillReferenceError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    err.status === 422 &&
    /invoice number already exists/i.test(err.detail ?? err.message)
  );
}

/**
 * Xero refused the request itself rather than the bill's contents — an expired,
 * revoked, or otherwise unusable OAuth connection. The billing API forwards
 * Xero's raw rejection payload as `detail`, so match on what that payload says
 * rather than on the wrapper wording.
 */
export function isXeroAuthError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    /authenticationunsuccessful|"?status"?\s*:\s*403|\bforbidden\b|token(?:\s+has)?\s+expired|unauthori[sz]ed/i.test(
      err.detail ?? err.message,
    )
  );
}

/** Copy for a Xero connection that needs re-authorising, in the app's voice. */
export const XERO_RECONNECT_MESSAGE =
  "The Xero connection needs reconnecting. An admin can do that in Settings, then I'll publish this.";

/**
 * Friendly copy for statuses where the server's own wording is unhelpful or
 * absent. Raw `statusText` ("Bad Gateway", "Internal Server Error") used to
 * reach users verbatim; these stand in instead.
 *
 * 422 is deliberately absent — its body carries the field-level validation
 * detail callers surface inline (see `isDuplicateBillReferenceError`), so its
 * message must pass through untouched.
 */
const STATUS_FALLBACK_MESSAGES: Record<number, string> = {
  403: "You don't have access to that.",
  404: "I couldn't find that.",
  408: "That took too long to come back. Mind trying again?",
  409: "Someone else changed that first. Refresh and try again.",
  429: "That's a lot of requests at once. Give it a moment and try again.",
  500: "Something went wrong on my end. Mind trying again?",
  502: "I couldn't reach the server just now. Mind trying again?",
  503: "The server is busy right now. Mind trying again in a moment?",
  504: "The server took too long to answer. Mind trying again?",
};

/**
 * True when `detail` is a bare HTTP reason phrase rather than real copy — i.e.
 * `res.statusText` fell through as the fallback and should not reach a user.
 */
function isRawStatusText(message: string, statusText: string): boolean {
  return message === statusText || message === "";
}

/**
 * Shapes that mean the text is machinery rather than a sentence: a serialised
 * body, markup, a stack, or a bare identifier like `invalid_state`. Any of
 * these reaching a toast reads as a leak however short they are.
 */
function readsAsProse(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 300) return false;
  if (/[{}[\]<>]/.test(text)) return false;
  if (/traceback|exception|__|null,/i.test(text)) return false;
  // A bare machine code (`invalid_state`) is not a sentence. Borrowed from the old
  // payer-portal client (deleted 2026-10-01), which guarded against these from the start.
  if (/^[a-z0-9_.:-]+$/.test(text)) return false;
  return /\s/.test(text);
}

/**
 * Flatten whatever the server put in `detail` into one readable sentence.
 *
 * django-ninja answers a schema failure with `detail: [{type, loc, msg}, ...]`.
 * Stringifying that put `{"type":"missing","loc":["body","email"]}` in front of
 * payers, so pydantic entries are reduced to their `msg` and anything still
 * object-shaped is dropped rather than rendered as `[object Object]`.
 */
function normalizeApiErrorDetail(detail: unknown, fallback: string): string {
  if (detail == null || detail === "") return fallback;
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const parts = detail
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const msg = (entry as { msg?: unknown }).msg;
          if (typeof msg === "string") return msg;
        }
        return "";
      })
      .filter((part) => part.trim() !== "");
    return parts.length ? parts.join("; ") : fallback;
  }

  if (typeof detail === "object") {
    // A field-error map: {"email": ["This field is required."]}. Keep the
    // sentences, discard the field keys — `String(detail)` used to render the
    // whole thing as "[object Object]".
    const parts = Object.values(detail as Record<string, unknown>)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value): value is string => typeof value === "string")
      .filter((value) => value.trim() !== "");
    return parts.length ? parts.join("; ") : fallback;
  }

  return fallback;
}

/**
 * Resolve the user-facing message for a failed response: the server's own
 * `detail`/`message` when it says something useful, otherwise friendly copy
 * for the status. Falls back to a generic line so no HTTP reason phrase leaks.
 */
function resolveApiErrorMessage(
  status: number,
  detail: unknown,
  statusText: string,
): string {
  const raw = normalizeApiErrorDetail(detail, statusText).trim();
  if (raw && !isRawStatusText(raw, statusText) && readsAsProse(raw)) return raw;
  return (
    STATUS_FALLBACK_MESSAGES[status] ??
    "Something went wrong on my end. Mind trying again?"
  );
}

/**
 * Refresh the token if it's close to expiring, then require an authenticated
 * session. Redirects to login and throws `ApiError(401)` when the token is
 * expired-and-unrefreshable or absent. Returns the validated `AuthInfo` so
 * callers don't re-read it.
 */
async function requireAuthenticatedSession(): Promise<AuthInfo> {
  if (isTokenExpiringSoon(120)) {
    const refreshed = await refreshToken();
    if (!refreshed && isTokenExpired()) {
      redirectToLogin();
      throw new ApiError(401, "Your session expired. Taking you back to sign in.");
    }
  }

  const auth = getAuth();
  if (!auth?.token) {
    redirectToLogin();
    throw new ApiError(401, "You're signed out. Taking you back to sign in.");
  }
  return auth;
}

// ── Core fetch wrapper ───────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = await requireAuthenticatedSession();

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${auth.token}`);
  headers.set("X-Entity-Id", auth.entityId);

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}/api/v1${path}`, { ...options, headers });

  if (!res.ok) {
    if (res.status === 401) {
      // A 401 is not automatically an expired session, and treating it as one was worse
      // than a wrong message: `redirectToLogin` sends the user back through the handoff,
      // which re-mints the SAME token and lands them on the same screen, failing the same
      // way. An endless loop, reported as "our session timed out".
      //
      // The token is the thing that can time out, so ask it — and note that
      // `requireAuthenticatedSession` above has already tried to refresh it. Only a
      // genuinely expired one is fixed by signing in again. Anything else is the server
      // declining this caller for this request, which a fresh login cannot change, so it
      // is reported and the page stays where it is.
      if (isTokenExpired()) {
        redirectToLogin();
        throw new ApiError(401, "Your session expired. Taking you back to sign in.");
      }
      const denied = await res.json().catch(() => null);
      const deniedRaw = denied?.detail ?? denied?.message;
      const deniedMsg = normalizeApiErrorDetail(deniedRaw, "").trim();
      throw new ApiError(
        401,
        deniedMsg && readsAsProse(deniedMsg)
          ? deniedMsg
          : "You don't have access to that. If you've just been added to a company, try picking it again from the company list.",
        typeof deniedRaw === "string" ? deniedRaw : JSON.stringify(deniedRaw ?? ""),
      );
    }
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const rawDetail = body.detail ?? body.message;
    const msg = resolveApiErrorMessage(res.status, rawDetail, res.statusText);
    // `detail` keeps the server's own words for the shape-detectors above;
    // `msg` is the scrubbed copy the user actually reads.
    throw new ApiError(
      res.status,
      msg,
      typeof rawDetail === "string" ? rawDetail : JSON.stringify(rawDetail ?? ""),
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

function resolveBackendFileUrl(url: string): string {
  const base = API_BASE.replace(/\/$/, "");
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/api/v1")) return `${base}${url}`;
  if (url.startsWith("/")) return `${base}/api/v1${url}`;
  return `${base}/api/v1/${url}`;
}

function getApiOrigin(): string {
  try {
    return new URL(API_BASE.replace(/\/$/, "")).origin;
  } catch {
    return "";
  }
}

function isCrossOriginStoragePreviewUrl(absolute: string): boolean {
  if (!absolute.startsWith("http://") && !absolute.startsWith("https://")) return false;
  const api = getApiOrigin();
  if (!api) return true;
  try {
    return new URL(absolute).origin !== api;
  } catch {
    return false;
  }
}

function extractFileUrlFromAttachmentJson(data: Record<string, unknown>): string | undefined {
  const nested = data.attachment as Record<string, unknown> | undefined;
  const from = (o: Record<string, unknown>): string | undefined => {
    const pick = (v: unknown): string | undefined => {
      if (typeof v !== "string") return undefined;
      const s = v.trim();
      return s.length > 0 ? s : undefined;
    };
    return (
      pick(o.download_url) ??
      pick(o.file_url) ??
      pick(o.url) ??
      pick(o.signed_url) ??
      pick(o.presigned_url) ??
      pick(o.public_url)
    );
  };
  return from(data) ?? (nested ? from(nested) : undefined);
}

function parseAttachmentFileSizeBytes(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  if (typeof raw === "string" && raw.trim()) {
    const n = Number.parseFloat(raw.trim());
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return undefined;
}

async function fetchAttachmentDownloadJson(path: string): Promise<{
  url: string;
  mime_type?: string;
  file_size?: number;
} | null> {
  const auth = await requireAuthenticatedSession();

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${auth.token}`);
  headers.set("X-Entity-Id", auth.entityId);
  headers.set("Accept", "application/json");

  const res = await fetch(`${API_BASE}/api/v1${path}`, { headers });

  if (!res.ok) {
    if (res.status === 401) {
      redirectToLogin();
      throw new ApiError(401, "Your session expired. Taking you back to sign in.");
    }
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const url = extractFileUrlFromAttachmentJson(data);
  if (!url) return null;

  const mimeRaw = data.mime_type;
  const mime_type =
    typeof mimeRaw === "string" && mimeRaw.trim() ? mimeRaw.trim() : undefined;

  const nestedAtt = data.attachment as Record<string, unknown> | undefined;
  const file_size =
    parseAttachmentFileSizeBytes(data.file_size) ??
    (nestedAtt ? parseAttachmentFileSizeBytes(nestedAtt.file_size) : undefined);

  return { url, mime_type, file_size };
}

async function fetchBytesFromResolvedFileUrl(absolute: string): Promise<Blob | null> {
  const auth = getAuth();
  const apiOrigin = getApiOrigin();
  let targetOrigin: string;
  try {
    targetOrigin = new URL(absolute).origin;
  } catch {
    return null;
  }

  const authHeaders = (): Headers => {
    const h = new Headers();
    h.set("Accept", "*/*");
    if (auth?.token) {
      h.set("Authorization", `Bearer ${auth.token}`);
      h.set("X-Entity-Id", auth.entityId);
    }
    return h;
  };

  if (targetOrigin === apiOrigin && apiOrigin !== "") {
    const res = await fetch(absolute, { headers: authHeaders() });
    if (!res.ok) return null;
    const b = await res.blob();
    return b.size > 0 ? b : null;
  }

  /** Third-party storage: no Authorization (avoids CORS preflight / breaks presigned URLs). */
  const res = await fetch(absolute, { credentials: "omit" });
  if (!res.ok) return null;
  const b = await res.blob();
  return b.size > 0 ? b : null;
}

function buildPaymentAttachmentDownloadPaths(
  billId: string,
  paymentId: string,
  paymentAttachmentId: string,
  storageAttachmentId?: string,
): string[] {
  const payBase = `/bills/${billId}/payments/${paymentId}/attachments`;
  const billAttBase = `/bills/${billId}/attachments`;
  const nested = storageAttachmentId?.trim();
  const ordered: string[] = [];
  if (nested && nested !== paymentAttachmentId) {
    ordered.push(`${payBase}/${nested}/download`);
    ordered.push(`${billAttBase}/${nested}/download`);
  }
  ordered.push(`${payBase}/${paymentAttachmentId}/download`);
  ordered.push(`${billAttBase}/${paymentAttachmentId}/download`);
  const seen = new Set<string>();
  return ordered.filter((p) => (seen.has(p) ? false : !!seen.add(p)));
}

type PaymentAttachmentPreview =
  | { kind: "embed"; url: string; mime_type?: string; file_size?: number }
  | { kind: "blob"; blob: Blob; file_size?: number };

export async function fetchPaymentAttachmentPreview(
  billId: string,
  paymentId: string,
  paymentAttachmentId: string,
  storageAttachmentId?: string,
): Promise<PaymentAttachmentPreview> {
  let lastError: unknown;

  const downloadPaths = buildPaymentAttachmentDownloadPaths(
    billId,
    paymentId,
    paymentAttachmentId,
    storageAttachmentId,
  );

  for (const path of downloadPaths) {
    try {
      const meta = await fetchAttachmentDownloadJson(path);
      if (!meta) continue;
      const absolute = resolveBackendFileUrl(meta.url);
      if (isCrossOriginStoragePreviewUrl(absolute)) {
        return {
          kind: "embed",
          url: absolute,
          mime_type: meta.mime_type,
          file_size: meta.file_size,
        };
      }
      const bytes = await fetchBytesFromResolvedFileUrl(absolute);
      if (!bytes || bytes.size === 0) {
        lastError = new ApiError(404, "That attachment came back empty. Mind trying again?");
        continue;
      }
      const t = (bytes.type || "").toLowerCase();
      const file_size = meta.file_size ?? bytes.size;
      if (meta.mime_type && (!t || t === "application/octet-stream")) {
        return {
          kind: "blob",
          blob: new Blob([await bytes.arrayBuffer()], { type: meta.mime_type }),
          file_size,
        };
      }
      return { kind: "blob", blob: bytes, file_size };
    } catch (e) {
      lastError = e;
      if (e instanceof ApiError && e.status === 401) throw e;
      continue;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new ApiError(404, "I couldn't open that attachment. Mind trying again?");
}

// ── Types ────────────────────────────────────────────────────────────

export type BillListItem = {
  id: string;
  entity_id: string;
  contact: string;
  status: string;
  amount: string;
  amount_due: string;
  description: string;
  due_date: string | null;
  invoice_date: string | null;
  reference: string;
  currency_code: string;
  xero_account_code: string;
  published: string;
  created_at: string;
  uploaded_by: string | null;
  paid_at: string | null;
};

export type BillDetail = BillListItem & {
  xero_contact_id: string;
  updated_at: string;
  attachments: BillAttachment[];
  line_items: LineItem[];
};

export type LineItem = {
  id: string;
  description: string;
  quantity: string;
  unit_amount: string;
  line_amount: string;
  account_code: string;
  account_name: string;
  tax_type: string;
  sort_order: number;
  note: string;
  created_at: string;
  updated_at: string;
};

export type Attachment = {
  id: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  file_extension: string;
  storage_provider: string;
  created_at: string;
  /** Presigned S3 download URL (15-min TTL). Always use this for preview. */
  download_url: string;
};

export type BillAttachment = {
  id: string;
  attachment: Attachment;
  attachment_role: string;
  sort_order: number;
  note: string;
  created_at: string;
};

/** Payment attachment row (bank slip, etc.) — same shape as bill attachment in API responses. */
export type PaymentAttachment = BillAttachment;

export type BillCreatePayload = {
  contact?: string;
  xero_contact_id?: string;
  description?: string;
  // Sent as an exact decimal string (e.g. "123456789012.00") to preserve
  // precision end-to-end; number still accepted for the older edit path.
  amount?: string | number;
  due_date?: string | null;
  invoice_date?: string | null;
  reference?: string;
  currency_code?: string;
  xero_account_code?: string;
  line_items?: {
    description?: string;
    quantity?: number;
    unit_amount?: string | number;
    line_amount?: string | number;
    account_code?: string;
    account_name?: string;
  }[];
};

export type EntityBillAccount = {
  id: string;
  entity_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
};

export type CurrencyInfo = {
  id: string;
  currency_code: string;
  currency_name: string;
  symbol: string;
  decimal_places: number;
  is_active: boolean;
};

/** ISO code of the entity's selected currency (entities.currency_id ->
 * currency_info.iso_code); currency_code is "" when the entity has none. */
export function fetchEntityCurrency(): Promise<{ currency_code: string }> {
  return apiFetch<{ currency_code: string }>("/auth/entity-currency");
}

// ── Bills ────────────────────────────────────────────────────────────

export function fetchBills(params?: {
  status?: string;
  contact?: string;
  /** Matches contact or bill description (case-insensitive). */
  search?: string;
  sort_by?: string;
  page?: number;
  page_size?: number;
  amount_min?: number;
  amount_max?: number;
  date_field?: string;
  date_from?: string;
  date_to?: string;
}): Promise<BillListItem[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.contact) qs.set("contact", params.contact);
  if (params?.search) qs.set("search", params.search);
  if (params?.sort_by) qs.set("sort_by", params.sort_by);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  if (params?.amount_min != null) qs.set("amount_min", String(params.amount_min));
  if (params?.amount_max != null) qs.set("amount_max", String(params.amount_max));
  if (params?.date_field) qs.set("date_field", params.date_field);
  if (params?.date_from) qs.set("date_from", params.date_from);
  if (params?.date_to) qs.set("date_to", params.date_to);
  const q = qs.toString();
  return apiFetch<BillListItem[]>(`/bills/${q ? `?${q}` : ""}`);
}

export function fetchBill(billId: string): Promise<BillDetail> {
  return apiFetch<BillDetail>(`/bills/${billId}`);
}

/** The company's payment request with this Payment No. (case-insensitive; a live one before a void one). */
export function fetchBillByReference(reference: string): Promise<BillDetail> {
  return apiFetch<BillDetail>(`/bills/by-reference/${encodeURIComponent(reference)}`);
}

/** Suggested bill number from backend (MBI + 3 name letters + HK time/date). */
export function fetchSuggestedBillReference(): Promise<{ reference: string }> {
  return apiFetch<{ reference: string }>("/bills/suggested-reference/");
}

export function createBill(payload: BillCreatePayload): Promise<BillDetail> {
  return apiFetch<BillDetail>("/bills/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function submitBill(payload: BillCreatePayload): Promise<BillDetail> {
  return apiFetch<BillDetail>("/bills/submit/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function saveBillDraft(payload: Partial<BillCreatePayload>): Promise<BillDetail> {
  return apiFetch<BillDetail>("/bills/draft/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateBill(
  billId: string,
  payload: Partial<BillCreatePayload> & { status?: string },
): Promise<BillDetail> {
  return apiFetch<BillDetail>(`/bills/${billId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteBill(billId: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/bills/${billId}`, {
    method: "DELETE",
  });
}

/**
 * Return / un-return / void a payment request.
 *
 * status values:
 *   "payment_requested" → bill is currently submitted (Payment Requested) → transitions to Returned
 *   "returned"          → bill is currently Returned → transitions back to submitted (Payment Requested)
 *   "void"              → bill is currently Returned → transitions to Voided
 */
export function returnBill(billId: string, status: "payment_requested" | "returned" | "void"): Promise<BillDetail> {
  return apiFetch<BillDetail>(`/bills/${billId}/return/`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

/** Publish a bill to Xero (single bill). */
export function publishBill(billId: string): Promise<BillDetail> {
  return apiFetch<BillDetail>(`/bills/${billId}/publish/`, {
    method: "POST",
  });
}

// ── Attachments ──────────────────────────────────────────────────────

export async function uploadBillAttachments(
  billId: string,
  files: File[],
): Promise<BillAttachment[]> {
  const form = new FormData();

  for (const file of files) {
    const optimized = await compressImage(file);
    form.append("files", optimized);
  }

  return apiFetch<BillAttachment[]>(
    `/bills/${billId}/attachments`,
    {
      method: "POST",
      body: form,
    }
  );
}

export function deleteBillAttachment(billId: string, attachmentId: string): Promise<void> {
  return apiFetch<void>(`/bills/${billId}/attachments/${attachmentId}`, {
    method: "DELETE",
  });
}

// ── Payments ─────────────────────────────────────────────────────

export type PaymentItem = {
  id: string;
  bill_id: string;
  /** Invoice-style ref for the bill paid; list responses may include it. */
  bill_reference?: string;
  /** Status of the bill that owns this payment — used for per-row delete eligibility. */
  bill_status?: string;
  payment_date: string | null;
  amount: string;
  currency_code: string;
  payment_method: string;
  payment_status: string;
  reference_no: string;
  note: string;
  xero_payment_id: string;
  created_by: string | null;
  /** Resolved full name of the user who recorded the payment; populated by the list endpoint. */
  created_by_name?: string;
  created_at: string;
  updated_at: string;
};

export type PaymentListResponse = {
  paid_total: string;
  payments: PaymentItem[];
};

export type PaymentCreatePayload = {
  payment_date?: string | null;
  amount?: number;
  currency_code?: string;
  payment_method?: string;
  payment_status?: string;
  reference_no?: string;
  note?: string;
};

export function fetchPayments(billId: string): Promise<PaymentListResponse> {
  return apiFetch(`/bills/${billId}/payments`);
}

export function createPayment(
  billId: string,
  payload: PaymentCreatePayload,
): Promise<PaymentItem> {
  return apiFetch(`/bills/${billId}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePayment(
  billId: string,
  paymentId: string,
  payload: Partial<PaymentCreatePayload>,
): Promise<PaymentItem> {
  return apiFetch(`/bills/${billId}/payments/${paymentId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deletePayment(
  billId: string,
  paymentId: string,
): Promise<{ message: string }> {
  return apiFetch(`/bills/${billId}/payments/${paymentId}`, {
    method: "DELETE",
  });
}

export function listPaymentAttachments(
  billId: string,
  paymentId: string,
): Promise<PaymentAttachment[]> {
  return apiFetch(`/bills/${billId}/payments/${paymentId}/attachments`);
}

export function deletePaymentAttachment(
  billId: string,
  paymentId: string,
  paymentAttachmentId: string,
): Promise<{ message: string } | undefined> {
  return apiFetch(`/bills/${billId}/payments/${paymentId}/attachments/${paymentAttachmentId}`, {
    method: "DELETE",
  });
}

/** Upload a file for a payment (e.g. bank slip). Multipart field `file`; `attachment_role` query defaults to bank_slip. */
export async function uploadPaymentAttachment(
  billId: string,
  paymentId: string,
  file: File,
  attachmentRole: string = "bank_slip",
): Promise<PaymentAttachment> {
  const optimized = await compressImage(file);

  const form = new FormData();
  form.append("file", optimized);

  const qs = new URLSearchParams();
  qs.set("attachment_role", attachmentRole);

  return apiFetch<PaymentAttachment>(
    `/bills/${billId}/payments/${paymentId}/attachments?${qs.toString()}`,
    {
      method: "POST",
      body: form,
    },
  );
}

// ── Audit   ─────────────────────────────────────────────────────────

export type AuditItem = {
  id: string;
  bill_id: string;
  action: string;
  detail: string;
  date: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_first_name?: string | null;
  user_last_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export function fetchAuditHistory(billId: string): Promise<AuditItem[]> {
  return apiFetch(`/bills/${billId}/audit`);
}

// ── Config ──────────────────────────────────────────────────────────

/**
 * Pass forceChartSync on Settings so Xero vs DB reconcile runs even if another list ran recently (bypasses server debounce).
 * Pass billDropdown for add/edit bill flows so the API returns only EXPENSE/DIRECTCOSTS accounts (still entity-scoped, active, chart sync rules).
 */
export function fetchEntityBillAccounts(options?: {
  forceChartSync?: boolean;
  billDropdown?: boolean;
  includeInactive?: boolean;
  accountType?: string;
}): Promise<EntityBillAccount[]> {
  const params = new URLSearchParams();
  if (options?.forceChartSync) params.set("force_chart_sync", "true");
  if (options?.billDropdown) params.set("bill_dropdown", "true");
  if (options?.includeInactive) params.set("include_inactive", "true");
  if (options?.accountType) params.set("account_type", options.accountType);
  const q = params.toString();
  return apiFetch(`/entity-bill-accounts/${q ? `?${q}` : ""}`);
}

export function updateEntityBillAccount(
  accountId: string,
  payload: Partial<Pick<EntityBillAccount, "is_active" | "is_default" | "sort_order">>,
): Promise<EntityBillAccount> {
  return apiFetch(`/entity-bill-accounts/${accountId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export type EntityBillContact = {
  id: string;
  entity_id: string;
  xero_contact_id: string;
  xero_org_id: string | null;
  name: string;
  category: string | null;
};

/** Collapse duplicate API rows that share the same Xero ContactID (trim, case-insensitive).   */
export function dedupeEntityBillContactsByXeroId(
  contacts: EntityBillContact[],
): EntityBillContact[] {
  const seen = new Set<string>();
  const out: EntityBillContact[] = [];
  for (const c of contacts) {
    const raw = (c.xero_contact_id || "").trim();
    if (raw) {
      const key = raw.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(c);
  }
  return out;
}

/** ID dedupe then normalized display name (matches `get_entity_bill_contacts` picker output). */
export function dedupeEntityBillContactsForPicker(
  contacts: EntityBillContact[],
): EntityBillContact[] {
  const byId = dedupeEntityBillContactsByXeroId(contacts);
  const seenNames = new Set<string>();
  const out: EntityBillContact[] = [];
  for (const c of byId) {
    const nameKey = c.name.trim().replace(/\s+/g, " ").toLowerCase();
    if (!nameKey) {
      out.push(c);
      continue;
    }
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    out.push(c);
  }
  return out;
}

export function fetchEntityBillContacts(): Promise<EntityBillContact[]> {
  return apiFetch("/entity-bill-contacts/");
}

/** Create a contact in Xero and persist `xero_contact_sync` (same auth as list). */
export function createEntityBillContact(payload: {
  name: string;
}): Promise<EntityBillContact> {
  return apiFetch<EntityBillContact>("/entity-bill-contacts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Auth ─────────────────────────────────────────────────────────────

/**
 * Tells the server the user is signing out, then resolves either way.
 *
 * The billing cookies are cleared client-side by `clearAuth()`, so this call is
 * not what ends the session — it is what drops the user's sign-in presence, which
 * is how Minty's Settings > Users decides who to list. Every Log out button has to
 * make it, or signing out from that screen leaves the person listed as present.
 *
 * Never throws, and deliberately bypasses `apiFetch`: that wrapper answers an
 * expiring or rejected token by redirecting to login, which would hijack the
 * navigation the caller is about to perform. A logout the user asked for must not
 * be blocked by a network failure either; the worst case is a stale row that ages
 * out of the presence window on its own.
 */
export async function logoutSession(): Promise<void> {
  const auth = getAuth();
  if (!auth?.token) return;
  try {
    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "X-Entity-Id": auth.entityId,
      },
    });
  } catch {
    // proceed with local logout even if the server call fails
  }
}

// ── Xero status ──────────────────────────────────────────────────────

/**
 * Returns whether the current user has an active Xero connection.
 * Used to show/hide the Xero connection indicator in the UI.
 * Returns false (not null) on any network or auth failure.
 */
export async function fetchXeroStatus(): Promise<boolean> {
  try {
    const data = await apiFetch<{ connected: boolean }>("/auth/xero-status");
    return data.connected;
  } catch {
    return false;
  }
}

export function fetchCurrencies(): Promise<CurrencyInfo[]> {
  return apiFetch("/currencies/");
}
