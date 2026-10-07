import { resolveMintyModuleUrl } from "./mintyEnv";
import { API_BASE } from "./apiBase";

const TOKEN_KEY = "billing_token";
const ENTITY_ID_KEY = "billing_entity_id";
const ENTITY_NAME_KEY = "billing_entity_name";

const BILLING_TOKEN_MAX_AGE = 60 * 60 * 8; // 8 hours — matches JWT lifetime

export type AuthInfo = {
  token: string;
  entityId: string;
  entityName: string;
};

export function setAuth(token: string, entityId: string, entityName: string) {
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  const opts = `path=/;max-age=${BILLING_TOKEN_MAX_AGE};SameSite=Lax${isSecure ? ";Secure" : ""}`;
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)};${opts}`;
  document.cookie = `${ENTITY_ID_KEY}=${encodeURIComponent(entityId)};${opts}`;
  document.cookie = `${ENTITY_NAME_KEY}=${encodeURIComponent(entityName)};${opts}`;
}

export function getAuth(): AuthInfo | null {
  if (typeof document === "undefined") return null;
  const jar = Object.fromEntries(
    document.cookie
      .split("; ")
      .filter(Boolean)
      .map((c) => {
        const idx = c.indexOf("=");
        return [c.slice(0, idx), decodeURIComponent(c.slice(idx + 1))];
      }),
  );
  const token = jar[TOKEN_KEY];
  if (!token) return null;
  return {
    token,
    entityId: jar[ENTITY_ID_KEY] ?? "",
    entityName: jar[ENTITY_NAME_KEY] ?? "",
  };
}

/**
 * The same read as `getAuth()`, but referentially stable while the cookies are unchanged.
 *
 * `getAuth()` parses the jar on every call and returns a FRESH object. That is fine for a one-off
 * read, and unusable as a `useSyncExternalStore` snapshot: React compares snapshots by identity,
 * so a new object every call loops forever. Caching on the raw cookie string keeps the identity
 * stable and still notices `setAuth()` / `clearAuth()` / a cookie expiring.
 *
 * See `useClientValue` for why components read auth this way rather than in an effect.
 */
let cookieJarAtParse: string | null = null;
let parsedAuth: AuthInfo | null = null;

export function getAuthSnapshot(): AuthInfo | null {
  if (typeof document === "undefined") return null;
  if (document.cookie !== cookieJarAtParse) {
    cookieJarAtParse = document.cookie;
    parsedAuth = getAuth();
  }
  return parsedAuth;
}

/** `getAuthSnapshot()?.entityId ?? ""`, as a standalone snapshot for the components that only want it. */
export function getEntityIdSnapshot(): string {
  return getAuthSnapshot()?.entityId ?? "";
}

export function clearAuth() {
  const expire = "path=/;max-age=0";
  document.cookie = `${TOKEN_KEY}=;${expire}`;
  document.cookie = `${ENTITY_ID_KEY}=;${expire}`;
  document.cookie = `${ENTITY_NAME_KEY}=;${expire}`;
}

/** Cookie names read by Next.js middleware: auth gating, and the company the address must name. */
export const AUTH_COOKIE_NAME = TOKEN_KEY;
export const ENTITY_ID_COOKIE_NAME = ENTITY_ID_KEY;
export const ENTITY_NAME_COOKIE_NAME = ENTITY_NAME_KEY;

/**
 * Decodes the JWT payload and returns the `role` claim string, or null if the
 * token is missing, malformed, or contains no `role` claim. Never throws.
 */
export function getRoleFromToken(): string | null {
  try {
    const auth = getAuth();
    if (!auth?.token) return null;
    const payload = decodeJwtPayload(auth.token);
    if (!payload) return null;
    if (typeof payload.role !== "string" || !payload.role) return null;
    return payload.role;
  } catch {
    return null;
  }
}

/**
 * Neutral JWT-payload decode: splits the token, base64url-decodes and JSON-
 * parses the payload segment, and returns it as a plain object — or `null` if
 * the token is missing a payload, malformed, or the payload isn't a JSON
 * object. Never throws. Callers apply their own claim reading and defaults.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    const json = atob(base64);
    const payload = JSON.parse(json) as unknown;
    if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Returns the `sid` claim — an opaque id for the Minty sign-in this token belongs
 * to — or null if absent. Minty rewrites it on every login, so it is how this app
 * distinguishes "same sign-in as before" from "signed out and back in": it cannot
 * see the Flask session that actually holds that state.
 *
 * Not a credential and not usable as one; it only ever answers that question.
 * Tokens minted outside a request context carry an empty sid, treated as absent.
 */
export function getLoginSidFromToken(): string | null {
  try {
    const auth = getAuth();
    if (!auth?.token) return null;
    const payload = decodeJwtPayload(auth.token);
    if (!payload) return null;
    if (typeof payload.sid !== "string" || !payload.sid) return null;
    return payload.sid;
  } catch {
    return null;
  }
}

/**
 * Returns true if the JWT stored in the cookie will expire within
 * `thresholdSeconds` seconds (default 120). Returns false if the token is
 * missing, malformed, or has no `exp` claim. Never throws.
 */
export function isTokenExpiringSoon(thresholdSeconds = 120): boolean {
  try {
    const auth = getAuth();
    if (!auth?.token) return false;
    const payload = decodeJwtPayload(auth.token);
    if (!payload) return false;
    if (typeof payload.exp !== "number") return false;
    return payload.exp - Date.now() / 1000 < thresholdSeconds;
  } catch {
    return false;
  }
}

/**
 * Returns true only if the JWT is already past its `exp` claim (with a small
 * 5-second clock-skew tolerance). Used to decide when a failed refresh should
 * actually kick the user back to login vs. allow the request to proceed.
 * Returns false if the token is missing, malformed, or has no `exp` claim.
 * Never throws.
 */
export function isTokenExpired(): boolean {
  try {
    const auth = getAuth();
    if (!auth?.token) return false;
    const payload = decodeJwtPayload(auth.token);
    if (!payload) return false;
    if (typeof payload.exp !== "number") return false;
    return payload.exp - Date.now() / 1000 < -5;
  } catch {
    return false;
  }
}

/**
 * Hands the user back to Flask Module 1 when this app's billing JWT has run out.
 *
 * Output: navigates the browser to `<PETTY_CASH_URL>/` — Minty's landing page, and
 * nothing more specific. It forwards to the entity list when the Flask session
 * is still alive (the usual case: it outlives the 30-minute JWT) and to the login
 * form when it isn't. Picking a company there mints a fresh token through the
 * normal handoff, so no manual cookie clearing is ever required.
 *
 * It used to go to `/entity/<id>/billing-relogin?next=<current path>` asking to
 * be returned to the page it was on, and Flask replayed that path on ITS origin —
 * so an expiry on /profile became a 404 on Minty, reached with the cookie already
 * cleared. Root is the one URL on that origin this app can be sure of; a relogin
 * route that only ever redirects there is a hop that can 404 on its own.
 *
 * Fires once. Several requests in flight fail together, and each one calling
 * this would reassign `location.href` while the first navigation is already
 * under way.
 */
let redirecting = false;

export function redirectToLogin() {
  if (redirecting) return;
  redirecting = true;

  clearAuth();
  window.location.href = `${resolveMintyModuleUrl().replace(/\/$/, "")}/`;
}

/**
 * Exchanges the current valid billing JWT for a fresh 8-hour token via
 * POST /api/v1/auth/token/refresh.
 *
 * Returns true and updates the stored cookies if the server issued a new token.
 * Returns false if the token is already expired, missing, or the request failed.
 *
 * Uses raw fetch (not apiFetch) to avoid a circular import with api.ts.
 *
 * Single-flight: concurrent callers share one request. A screen like My Profile
 * fires several calls at mount (the header's initials badge, the profile card,
 * the Xero indicator), and each refreshing separately meant later ones spending
 * the token a successful refresh had already rotated away — and, when the
 * refresh failed, several racing to clear the cookie, so whichever call checked
 * auth last reported "you're signed out" rather than the session timing out.
 */
let refreshInFlight: Promise<boolean> | null = null;

export function refreshToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performTokenRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function performTokenRefresh(): Promise<boolean> {
  const auth = getAuth();
  if (!auth?.token) return false;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/token/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "X-Entity-Id": auth.entityId,
      },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { token?: string; expires_in?: number };
    if (!data.token) return false;
    setAuth(data.token, auth.entityId, auth.entityName);
    return true;
  } catch {
    return false;
  }
}
