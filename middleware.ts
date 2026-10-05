import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, ENTITY_ID_COOKIE_NAME, ENTITY_NAME_COOKIE_NAME } from "@/lib/auth";
import { COMPANY_PAGE, companyBase, companyPages, isCanonicalRef } from "@/lib/companyPages";
import { shortIdOf } from "@/lib/companyRef";
import { resolveMintyModuleUrl } from "@/lib/mintyEnv";

const AUTH_COOKIE = AUTH_COOKIE_NAME;

/**
 * This app's old profile and payer-portal pages (`/profile/*`), deleted on 2026-10-01: they live
 * in minty-web now. Their addresses survive in emails and bookmarks, so each is FORWARDED to
 * minty-web's page through Minty (Flask) - `/profile` to Flask's profile router (which opens
 * minty-web's My Profile), the rest through Flask's login-gated `/handoff/minty-web`. The query
 * string travels with it (`entity_id`, `transfer`, ...). Any other `/profile/*` address goes
 * where `/profile` does.
 */
const PROFILE_FORWARDS: ReadonlyMap<string, string> = new Map([
  ["/profile/subscriptions", "/subscription/subscriptions"],
  ["/profile/subscriptions/incoming", "/subscription/subscriptions/incoming"],
  ["/profile/subscriptions/subscriber", "/subscription/subscriptions/subscriber"],
  ["/profile/billing", "/subscription/billing"],
  ["/profile/invoices", "/subscription/billing"],
]);

/** Where an old `/profile` address goes now, or null when `pathname` is not one. */
function profileForward(pathname: string, search: string): string | null {
  if (pathname !== "/profile" && !pathname.startsWith("/profile/")) return null;
  const minty = resolveMintyModuleUrl().replace(/\/+$/, "");
  const query = search.startsWith("?") ? search.slice(1) : search;
  // Next has already 308'd a trailing slash away (`/profile/billing/` -> `/profile/billing`).
  const target = PROFILE_FORWARDS.get(pathname);
  if (!target) {
    // An old link's `from=bills` is dropped: the profile's Back returns to the page the person
    // came from (minty-web lib/backLink.ts), so nothing is carried (2026-10-05).
    const qs = new URLSearchParams(query);
    qs.delete("from");
    const rest = qs.toString();
    return `${minty}/profile${rest ? `?${rest}` : ""}`;
  }
  const next = query ? `${target}?${query}` : target;
  return `${minty}/handoff/minty-web?${new URLSearchParams({ next }).toString()}`;
}

/**
 * Flask's way into this app for the company in an address: a page of a company the cookie does
 * not hold (another tab switched it, a bookmark, an expired cookie) goes there, and Flask -
 * after its sign-in and membership checks - mints a token for that company and lands on the
 * same page. Flask resolves `<shortid>/<name>` itself.
 */
function flaskHandoff(ref: string, slug: string, page: string): string {
  const company = `${resolveMintyModuleUrl().replace(/\/+$/, "")}/entity/${ref}/${slug}`;
  if (page.startsWith("settings/")) return `${company}/settings/payment-request`;
  const requestId = page.split("/")[1];
  return requestId
    ? `${company}/payment-request?${new URLSearchParams({ request: requestId }).toString()}`
    : `${company}/payment-request`;
}

/**
 * The pages before company addresses (2026-10-05) - `/`, `/payment-request/<id>`, `/settings` -
 * as the cookie's company's address, or null when `pathname` is not one. Old links, bookmarks
 * and a Flask still sending `next=/` keep working.
 */
function legacyPage(pathname: string, entityId: string, entityName: string): string | null {
  const pages = companyPages(entityId, entityName);
  if (pathname === "/") return pages.list;
  if (pathname === "/settings") return pages.settings;
  const old = /^\/payment-request\/([^/]+)$/.exec(pathname);
  return old ? `${pages.list}/${old[1]}` : null;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Before the cookie check: an old email link arrives with no cookie at all.
  const forward = profileForward(pathname, search);
  if (forward) return NextResponse.redirect(forward);

  // Redirects that depend on the cookie are 307s, never 308s: a browser keeps a 308 for good,
  // and the next company's `/` would then open this one's address.
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const entityId = request.cookies.get(ENTITY_ID_COOKIE_NAME)?.value ?? "";
  const entityName = request.cookies.get(ENTITY_NAME_COOKIE_NAME)?.value ?? "";

  const company = COMPANY_PAGE.exec(pathname);
  if (company) {
    const [, ref, slug, page] = company;
    if (!token || !entityId || ref.toLowerCase() !== shortIdOf(entityId)) {
      return NextResponse.redirect(flaskHandoff(ref, slug, page));
    }
    if (!isCanonicalRef(ref, slug, entityId, entityName)) {
      const url = request.nextUrl.clone();
      url.pathname = `${companyBase(entityId, entityName)}/${page}`;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (token && entityId) {
    const target = legacyPage(pathname, entityId, entityName);
    if (target) {
      const url = request.nextUrl.clone();
      url.pathname = target;
      return NextResponse.redirect(url);
    }
  }

  if (
    pathname === "/module-selection" ||
    pathname.startsWith("/module-selection/") ||
    pathname === "/landing" ||
    pathname.startsWith("/landing/")
  ) {
    return NextResponse.next();
  }

  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/module-selection";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
