/**
 * The ONE app-specific file of the sidebar (menu + My Profile) this app carries since
 * 2026-09-30 - a copy of minty-web's `components/ui/Sidebar.tsx` family and its
 * `features/profile`, taken at the user's word ("build it now and transfer later to shared").
 *
 * Everything the copies need from THIS app comes through here and nowhere else, so this file is
 * also the list of what `@minty/shared` (`minty-shared-ts`, Part 3 step 4) will have to take as
 * injection when the copies are lifted and deleted:
 *
 * - who and where: the company in the cookie, its modules (the token's claims);
 * - where the menu's items lead from this app (Minty's `/enter` and `/handoff/minty-web`);
 * - how this app locks the page's scroll (`#app-scroll-root`, not `body`, below 1280 px);
 * - how it logs out (every app's Logout ends the session everywhere - the user's call);
 * - how it reaches Flask (`/api/me/profile`) and minty-subscription-api (`/api/me/subscriptions`)
 *   with the token it holds, and what a 401 means here (one refresh, then back to Minty).
 */

import { ApiError, logoutSession } from "@/lib/api";
import { pushAppScrollLock } from "@/lib/appScrollRoot";
import { env } from "@/lib/env";
import { clearAuth, getAuth, isTokenExpiringSoon, redirectToLogin, refreshToken } from "@/lib/auth";
import { guardLeave } from "@/lib/leaveGuard";
import { getModuleClaims } from "@/lib/moduleClaims";
import { buildMintyEnterUrl, buildMintyProfileUrl, MINTY_MODULE_URL } from "@/lib/mintyUrls";
import { cookieCompanyPages } from "@/lib/useCompanyPages";

/** minty-subscription-api - the Subscriptions Overview's read (`SUBSCRIPTION_API_URL`, lib/env.ts). */
const SUBSCRIPTION_API_URL = env.SUBSCRIPTION_API_URL;

/** minty-web's pages the menu leads to - reached through Flask's login-gated re-handoff. */
const MINTY_WEB_SUBSCRIPTIONS = "/subscription";

/** This app's settings page (app/entity/[ref]/[slug]/settings/payment-request). */
const SETTINGS_PAGE = /^\/entity\/[^/]+\/[^/]+\/settings\/payment-request\/?$/;

/** The home page's view choice (app/page.tsx) - this app's Logout always forgot it. */
const EASY_VIEW_STORAGE_KEY = "payment-request-easy-view";

export type ModuleAccess = { pettyCash: boolean; billing: boolean };

/**
 * Into minty-web through Flask's login-gated re-handoff - by way of `/enter` when a company is in
 * the cookie, so a Flask session that lapsed while this app's longer token lived is
 * re-established from that token on the way (as `buildMintyProfileUrl` does).
 */
function handoff(next: string): string {
  const path = `/handoff/minty-web?${new URLSearchParams({ next }).toString()}`;
  return getAuth()?.entityId ? buildMintyEnterUrl(path) : `${MINTY_MODULE_URL}${path}`;
}

/** The company in this app's cookie ("" when none). */
export function entityId(): string {
  return getAuth()?.entityId ?? "";
}

/** Which modules that company has - the token's claims, both on when unknown (never hide nav). */
export function moduleAccess(): ModuleAccess {
  const claims = getModuleClaims();
  return { pettyCash: claims.pettyCashEnabled, billing: claims.billingEnabled };
}

/** Where each item of the menu (and My Profile) leads FROM THIS APP. */
export const links = {
  /** Minty's `/entity` - which is minty-web's entity list wherever the hub is on. */
  entities: () => buildMintyEnterUrl("/entity"),
  subscriptions: () => handoff(MINTY_WEB_SUBSCRIPTIONS),
  pettyCashDashboard: () => buildMintyEnterUrl(),
  pettyCashReports: (id: string) => buildMintyEnterUrl(`/entity/${id}/reports`),
  /** The company's list - `/` (the middleware sends it there) when the cookie names none. */
  bills: () => cookieCompanyPages()?.list ?? "/",
  /**
   * THIS app's settings (the user's call, 2026-09-30: Settings opens the settings of the app it
   * is pressed in) - the page this app's old drawer opened. minty-web's menu keeps its own.
   */
  settings: () => cookieCompanyPages()?.settings ?? "/",
  /** The initials' way in without the sidebar: Minty's profile router. */
  profile: () => buildMintyProfileUrl(),
};

/** Which menu item is the page being shown - Settings is the only one that is this app's page. */
export function currentOf(): "profile" | "entities" | "subscriptions" | "settings" | null {
  const path = typeof window === "undefined" ? "" : window.location.pathname;
  return SETTINGS_PAGE.test(path) ? "settings" : null;
}

/** Hold the page still while the sidebar is open; the returned function lets it go. */
export function lockScroll(): () => void {
  return pushAppScrollLock();
}

/**
 * Log out - the menu's Logout and My Profile's Log Out: drop this app's sign-in presence and its
 * cookies, forget the view choice, then end the session at Minty (its `/logout` signs the person
 * out and lands on its sign-in page), so no app is left signed in behind the one that said
 * goodbye. minty-web's `lib/logout.ts`, with this app's own steps first.
 *
 * While Payment Settings has unsaved ticks it asks first ("Leave without saving?",
 * `lib/leaveGuard.ts`): none of this runs until the person picks "Discard changes", and "Go Back"
 * leaves them on the page, still signed in - the promise then never settles.
 */
export function logOut(): Promise<void> {
  return new Promise((resolve, reject) => {
    guardLeave(() => {
      endSession().then(resolve, reject);
    });
  });
}

async function endSession(): Promise<void> {
  await logoutSession();
  clearAuth();
  try {
    localStorage.removeItem(EASY_VIEW_STORAGE_KEY);
  } catch {
    /* private mode / unavailable */
  }
  window.location.href = `${MINTY_MODULE_URL}/logout`;
}

// --- the two backends the copies read ----------------------------------------------------------

/** Shown when a backend gave no sentence of its own - minty-web's `HOUSE_FALLBACK`. */
export const HOUSE_FALLBACK = "Something went wrong on my end. Mind trying again?";
const SESSION_ENDED = "Your session has ended. Signing you back in…";

export type HubRequest = {
  method?: "GET" | "PATCH";
  json?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  /**
   * What a 401 that one refresh did not cure means to the caller: `"reauth"` (the default) sends
   * the browser back to Minty for a fresh token, as every other read of this app does;
   * `"reject"` only rejects - for a read that is decoration (the header's initials), which must
   * never move the page.
   */
  onUnauthorized?: "reauth" | "reject";
};

function withQuery(path: string, query?: HubRequest["query"]): string {
  if (!query) return path;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function sentence(body: unknown): string | null {
  if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return null;
}

async function bearerJson<T>(base: string, path: string, init: HubRequest, retried = false): Promise<T> {
  const { method = "GET", json, query, signal, onUnauthorized = "reauth" } = init;
  if (!retried && isTokenExpiringSoon(120)) await refreshToken();
  const token = getAuth()?.token;
  if (!token) {
    if (onUnauthorized === "reauth") redirectToLogin();
    throw new ApiError(401, SESSION_ENDED);
  }

  const headers = new Headers({ Accept: "application/json", Authorization: `Bearer ${token}` });
  if (json !== undefined) headers.set("Content-Type", "application/json");
  const res = await fetch(`${base}${withQuery(path, query)}`, {
    method,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
    signal,
  });

  if (res.status === 401) {
    if (!retried && (await refreshToken())) return bearerJson<T>(base, path, init, true);
    if (onUnauthorized === "reauth") redirectToLogin();
    throw new ApiError(401, SESSION_ENDED);
  }
  const body = await readBody(res);
  if (!res.ok) throw new ApiError(res.status, sentence(body) ?? HOUSE_FALLBACK);
  return body as T;
}

/**
 * Flask's hub surface - `/api/me/profile` (minty-web's `mintyFetch`). Never sends `X-Entity-Id`:
 * Flask allows only `Authorization` and `Content-Type`; a company travels as `?entity=`.
 */
export function mintyFetch<T = unknown>(path: string, init: HubRequest = {}): Promise<T> {
  return bearerJson<T>(MINTY_MODULE_URL.replace(/\/+$/, ""), path, init);
}

/** minty-subscription-api's person-scoped `/api/me/*` (minty-web's `apiFetch`, without a company). */
export function billingApiFetch<T = unknown>(path: string, init: HubRequest = {}): Promise<T> {
  return bearerJson<T>(SUBSCRIPTION_API_URL, path, init);
}

/** The token this app holds - what the viewer read is cached by. */
export function currentToken(): string {
  return getAuth()?.token ?? "";
}
