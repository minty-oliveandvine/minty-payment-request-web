"use client";

/**
 * The ONE app-specific file the packaged sidebar (`@minty/shared/sidebar`) reads of this app.
 *
 * It was written on 2026-09-30 as the list of what a shared package would have to take as
 * injection, while this app still carried its own copy of minty-web's sidebar. On 2026-10-12 the
 * copies went and the package arrived, and this file became exactly what it predicted - the host.
 * It still answers:
 *
 * - who and where: the company in the cookie, its modules (the token's claims);
 * - where the menu's items lead from this app (Minty's `/enter` and `/handoff/minty-web`);
 * - how this app locks the page's scroll (`#app-scroll-root`, not `body`, below 1280 px);
 * - how it logs out (every app's Logout ends the session everywhere - the user's call);
 * - how it reaches Flask (`/api/me/profile`) and minty-subscription-api (`/api/me/subscriptions`)
 *   with the token it holds, and what a 401 means here (one refresh, then back to Minty).
 *
 * The clients are `@minty/shared/apiClient`'s `createBearerClient`, the viewer read is
 * `@minty/shared/portal`'s `loadViewer` and the way into minty-web is `@minty/shared/handoff`'s
 * `hubHandoffUrl` (owner 2026-10-21: one shared module) - what is left here is this app's
 * configuration of them.
 */

import { usePathname } from "next/navigation";

import { setSidebarHost, type SidebarHost, type Viewer } from "@minty/shared/sidebar";
import { createBearerClient, type UnauthorizedContext } from "@minty/shared/apiClient";
import { isTokenExpiringSoon, moduleClaims } from "@minty/shared/auth";
import { HUB_HANDOFF_ROUTE, hubHandoffUrl } from "@minty/shared/handoff";
import { guardLeave } from "@minty/shared/leaveGuard";
import { loadViewer as readViewer } from "@minty/shared/portal";
import { pushAppScrollLock } from "@minty/shared/scrollLock";

import { logoutSession } from "@/lib/api";
import { env } from "@/lib/env";
import { clearAuth, getAuth, redirectToLogin, refreshToken } from "@/lib/auth";
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

/** Re-exported, not redeclared: the package owns the shape now (its src/host.ts). */
export type { ModuleAccess } from "@minty/shared/sidebar";
type ModuleAccess = { pettyCash: boolean; billing: boolean };

/**
 * Into minty-web through Flask's login-gated re-handoff - by way of `/enter` when a company is in
 * the cookie, so a Flask session that lapsed while this app's longer token lived is
 * re-established from that token on the way (as `buildMintyProfileUrl` does).
 */
function handoff(next: string): string {
  if (!getAuth()?.entityId) return hubHandoffUrl(MINTY_MODULE_URL, next);
  return buildMintyEnterUrl(`${HUB_HANDOFF_ROUTE}?${new URLSearchParams({ next }).toString()}`);
}

/** The company in this app's cookie ("" when none). */
export function entityId(): string {
  return getAuth()?.entityId ?? "";
}

/** Its name, for the links that spell it. */
export function entityName(): string {
  return getAuth()?.entityName ?? "";
}

/** Which modules that company has - the token's claims, both on when unknown (never hide nav). */
export function moduleAccess(): ModuleAccess {
  return moduleClaims(getAuth()?.token);
}

/** Where each item of the menu (and My Profile) leads FROM THIS APP. */
export const links = {
  /** Minty's `/entity` - which is minty-web's entity list wherever the hub is on. */
  entities: () => buildMintyEnterUrl("/entity"),
  subscriptions: () => handoff(MINTY_WEB_SUBSCRIPTIONS),
  pettyCashDashboard: () => buildMintyEnterUrl(),
  pettyCashReports: (id: string) => buildMintyEnterUrl(`/entity/${id}/petty-cash/reports`),
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

/**
 * Which menu item is the page being shown. Settings is the only one that is this app's own page -
 * the entity list, subscriptions and the profile are all minty-web's, so a person is never ON
 * them here, and this app never reports "profile" (which is why the menu's person block always
 * switches the sidebar's view rather than just closing).
 *
 * Takes the path rather than reading `window.location` itself, so it is a pure function the
 * packaged sidebar can feed from the app's router.
 */
export function currentOf(
  pathname: string,
): "profile" | "entities" | "subscriptions" | "settings" | null {
  return SETTINGS_PAGE.test(pathname) ? "settings" : null;
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
export function logOut(onLeaving?: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    guardLeave(() => {
      // Only now has the person committed to going, so only now may the drawer close.
      onLeaving?.();
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

/** The bearer, refreshed first when it is about to lapse. */
async function freshToken(): Promise<string | null> {
  const token = getAuth()?.token;
  if (token && isTokenExpiringSoon(token, 120)) await refreshToken();
  return getAuth()?.token || null;
}

/**
 * What a 401 means to the hub reads: one refresh and one retry; a 401 that does not cure, or no
 * token at all, `"reauth"` sends the browser back to Minty for a fresh token (as every other read
 * of this app does) and `"reject"` only rejects - for a read that is decoration (the header's
 * initials), which must never move the page. Either way the call rejects with the shared
 * SESSION_ENDED.
 */
function onUnauthorized(mode: "reauth" | "reject") {
  return async ({ reason, retried }: UnauthorizedContext): Promise<boolean> => {
    if (reason === "401" && !retried && (await refreshToken())) return true;
    if (mode === "reauth") redirectToLogin();
    return false;
  };
}

/**
 * Flask's hub surface - `/api/me/profile` (minty-web's `mintyFetch`). Never sends `X-Entity-Id`:
 * Flask allows only `Authorization` and `Content-Type`; a company travels as `?entity=`.
 */
export const mintyApi = createBearerClient({
  baseUrl: MINTY_MODULE_URL,
  getToken: freshToken,
  onUnauthorized: onUnauthorized("reauth"),
});

/** The same, for decoration: a 401 that one refresh did not cure only rejects. */
export const mintyQuietApi = createBearerClient({
  baseUrl: MINTY_MODULE_URL,
  getToken: freshToken,
  onUnauthorized: onUnauthorized("reject"),
});

/** minty-subscription-api's person-scoped `/api/me/*` (minty-web's `apiFetch`, without a company). */
export const subscriptionApi = createBearerClient({
  baseUrl: SUBSCRIPTION_API_URL,
  getToken: freshToken,
  onUnauthorized: onUnauthorized("reauth"),
});

/** The token this app holds - what the viewer read is cached by. */
export function currentToken(): string {
  return getAuth()?.token ?? "";
}

// --- the host the packaged sidebar reads ---------------------------------------------------------

/**
 * Flask's hub surface, as decoration: a read that fails must never move the page, so a 401 only
 * rejects and the badge stays empty.
 */
const loadViewer = (): Promise<Viewer | null> => readViewer(mintyQuietApi.json);

export const sidebarHost: SidebarHost = {
  app: "minty-payment-request-web",
  entityId,
  entityName,
  moduleAccess,
  links,
  /**
   * This app's router. Imported HERE and not in the package, so a test's
   * `vi.mock("next/navigation")` reaches it - a mock does not apply to a module inside
   * node_modules, and the real hook returns null outside an app-router tree.
   */
  usePathname: () => usePathname() ?? "",
  currentOf,
  lockScroll,
  logOut,
  currentToken,
  loadViewer,
};

setSidebarHost(sidebarHost);
