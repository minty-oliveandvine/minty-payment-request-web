import {
  ApiError,
  SESSION_ENDED,
  createBearerClient,
  errorSentence,
  type BearerRequest,
} from "@minty/shared/apiClient";
import { isTokenExpired, isTokenExpiringSoon } from "@minty/shared/auth";
import { statusFallback } from "@minty/shared/errorCopy";

import { getAuth, redirectToLogin, refreshToken } from "./auth";
import { compressImage } from "./compressImage";
import { API_BASE } from "./apiBase";

//  ── Error ────────────────────────────────────────────────────────────

/**
 * A refused call - `@minty/shared/apiClient`'s (owner 2026-10-21: one shared module). `message`
 * is what a user reads; `body` is what the server sent, and the `detail` getter is the server's
 * own words out of it - what the shape-detectors below match on, because Xero's rejection
 * payloads are exactly the machine-shaped text `message` is scrubbed of.
 */
export { ApiError };

/** 422 from billing API when `reference` duplicates another bill in the entity. */
export function isDuplicateBillReferenceError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    err.status === 422 &&
    /invoice number already exists/i.test(err.detail)
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
      err.detail,
    )
  );
}

/** Copy for a Xero connection that needs re-authorising, in the app's voice. */
export const XERO_RECONNECT_MESSAGE =
  "The Xero connection needs reconnecting. An admin can do that in Settings, then I'll publish this.";

/** What a 401 on a token that has NOT run out says when the server gave no sentence of its own. */
export const NO_ACCESS_MESSAGE =
  "You don't have access to that. If you've just been added to a company, try picking it again from the company list.";

// ── The session ──────────────────────────────────────────────────────

/**
 * The bearer to send: refreshed first when it is close to expiring. Null - which the client
 * hands to `onUnauthorized` as "no-token", asking the network nothing - when there is none, or
 * when it has run out and the refresh failed.
 */
async function sessionToken(): Promise<string | null> {
  const current = getAuth()?.token;
  if (current && isTokenExpiringSoon(current, 120)) {
    const refreshed = await refreshToken();
    if (!refreshed && isTokenExpired(current)) return null;
  }
  return getAuth()?.token || null;
}

// ── Core fetch wrapper ───────────────────────────────────────────────

/**
 * The payment-request API's client (`@minty/shared/apiClient`): the bearer and the company's
 * `X-Entity-Id` on every call, per-status copy when a refusal has no sentence fit to show.
 *
 * A 401 is not automatically an expired session, and treating it as one was worse than a wrong
 * message: `redirectToLogin` sends the user back through the handoff, which re-mints the SAME
 * token and lands them on the same screen, failing the same way. An endless loop, reported as
 * "our session timed out". So the token is asked - `sessionToken` has already tried to refresh
 * it. Only a genuinely expired (or missing) one is fixed by signing in again: back to Minty,
 * rejecting with the shared SESSION_ENDED. Anything else is the server declining this caller for
 * this request, which a fresh login cannot change, so it is reported - the server's sentence, or
 * NO_ACCESS_MESSAGE - and the page stays where it is. No retry either way.
 */
const client = createBearerClient({
  baseUrl: () => `${API_BASE}/api/v1`,
  getToken: sessionToken,
  entityHeader: () => getAuth()?.entityId ?? null,
  fallback: statusFallback,
  onUnauthorized: async ({ reason, body }) => {
    if (reason === "401" && !isTokenExpired(getAuth()?.token)) {
      throw new ApiError(401, errorSentence(body, NO_ACCESS_MESSAGE), body);
    }
    redirectToLogin();
    return false;
  },
});

/** One call to the API, answered with its parsed JSON (null for a 204). */
function apiFetch<T>(path: string, init?: BearerRequest): Promise<T> {
  return client.json<T>(path, init);
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
  // Raw fetch, not the client: a refusal here only means "try the next path" (null), so it
  // must not be turned into copy - except a 401, which ends the session as the client's does.
  const token = await sessionToken();
  if (!token) {
    redirectToLogin();
    throw new ApiError(401, SESSION_ENDED);
  }

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Entity-Id", getAuth()?.entityId ?? "");
  headers.set("Accept", "application/json");

  const res = await fetch(`${API_BASE}/api/v1${path}`, { headers });

  if (!res.ok) {
    if (res.status === 401) {
      redirectToLogin();
      throw new ApiError(401, SESSION_ENDED);
    }
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const url = extractFileUrlFromAttachmentJson(data);
  if (!url) return null;

  const mimeRaw = data.mime_type;
  const mime_type = typeof mimeRaw === "string" && mimeRaw.trim() ? mimeRaw.trim() : undefined;

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
  // Always an exact decimal string ("1234.50"), on create and edit alike, to preserve
  // precision end-to-end (owner, 2026-10-26).
  amount?: string;
  due_date?: string | null;
  invoice_date?: string | null;
  reference?: string;
  currency_code?: string;
  xero_account_code?: string;
  line_items?: {
    description?: string;
    quantity?: number;
    unit_amount?: string;
    line_amount?: string;
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

/** ISO code and decimal places of the entity's selected currency (entities.currency_id ->
 * currency_info); currency_code is "" when the entity has none, and decimals then 2. */
export async function fetchEntityCurrency(): Promise<{ currency_code: string; decimals: number }> {
  const data = await apiFetch<{ currency_code: string; decimal_places?: number | null }>(
    "/auth/entity-currency",
  );
  const places = data.decimal_places;
  return {
    currency_code: data.currency_code,
    decimals: typeof places === "number" && Number.isInteger(places) && places >= 0 ? places : 2,
  };
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
  // Each value is sent only when set: a falsy page or page_size (0) is left off, as before;
  // amount bounds keep 0. The shared withQuery drops undefined, null and "".
  return apiFetch<BillListItem[]>("/bills/", {
    query: {
      status: params?.status,
      contact: params?.contact,
      search: params?.search,
      sort_by: params?.sort_by,
      page: params?.page || undefined,
      page_size: params?.page_size || undefined,
      amount_min: params?.amount_min,
      amount_max: params?.amount_max,
      date_field: params?.date_field,
      date_from: params?.date_from,
      date_to: params?.date_to,
    },
  });
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
    body: payload,
  });
}

export function submitBill(payload: BillCreatePayload): Promise<BillDetail> {
  return apiFetch<BillDetail>("/bills/submit/", {
    method: "POST",
    body: payload,
  });
}

export function saveBillDraft(payload: Partial<BillCreatePayload>): Promise<BillDetail> {
  return apiFetch<BillDetail>("/bills/draft/", {
    method: "POST",
    body: payload,
  });
}

export function updateBill(
  billId: string,
  payload: Partial<BillCreatePayload> & { status?: string },
): Promise<BillDetail> {
  return apiFetch<BillDetail>(`/bills/${billId}`, {
    method: "PUT",
    body: payload,
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
export function returnBill(
  billId: string,
  status: "payment_requested" | "returned" | "void",
): Promise<BillDetail> {
  return apiFetch<BillDetail>(`/bills/${billId}/return/`, {
    method: "POST",
    body: { status },
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

  return apiFetch<BillAttachment[]>(`/bills/${billId}/attachments`, {
    method: "POST",
    form,
  });
}

export function deleteBillAttachment(billId: string, attachmentId: string): Promise<null> {
  return apiFetch<null>(`/bills/${billId}/attachments/${attachmentId}`, {
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
  amount?: string;
  currency_code?: string;
  payment_method?: string;
  payment_status?: string;
  reference_no?: string;
  note?: string;
};

export function fetchPayments(billId: string): Promise<PaymentListResponse> {
  return apiFetch(`/bills/${billId}/payments`);
}

export function createPayment(billId: string, payload: PaymentCreatePayload): Promise<PaymentItem> {
  return apiFetch(`/bills/${billId}/payments`, {
    method: "POST",
    body: payload,
  });
}

export function updatePayment(
  billId: string,
  paymentId: string,
  payload: Partial<PaymentCreatePayload>,
): Promise<PaymentItem> {
  return apiFetch(`/bills/${billId}/payments/${paymentId}`, {
    method: "PUT",
    body: payload,
  });
}

export function deletePayment(billId: string, paymentId: string): Promise<{ message: string }> {
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
): Promise<{ message: string } | null> {
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

  return apiFetch<PaymentAttachment>(`/bills/${billId}/payments/${paymentId}/attachments`, {
    method: "POST",
    query: { attachment_role: attachmentRole },
    form,
  });
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
  return apiFetch("/entity-bill-accounts/", {
    query: {
      force_chart_sync: options?.forceChartSync ? "true" : undefined,
      bill_dropdown: options?.billDropdown ? "true" : undefined,
      include_inactive: options?.includeInactive ? "true" : undefined,
      account_type: options?.accountType,
    },
  });
}

export function updateEntityBillAccount(
  accountId: string,
  payload: Partial<Pick<EntityBillAccount, "is_active" | "is_default" | "sort_order">>,
): Promise<EntityBillAccount> {
  return apiFetch(`/entity-bill-accounts/${accountId}`, {
    method: "PUT",
    body: payload,
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
export function createEntityBillContact(payload: { name: string }): Promise<EntityBillContact> {
  return apiFetch<EntityBillContact>("/entity-bill-contacts/", {
    method: "POST",
    body: payload,
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
 * Whether the current company has a live Xero connection (a linked org, not revoked, and a
 * refresh token on the connector). Payment Request Settings hides its account codes when it
 * is not. A failed read rejects - it is not "not connected".
 */
export async function fetchXeroStatus(): Promise<boolean> {
  const data = await apiFetch<{ connected: boolean }>("/auth/xero-status");
  return data.connected;
}

export function fetchCurrencies(): Promise<CurrencyInfo[]> {
  return apiFetch("/currencies/");
}
