import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME, ENTITY_ID_COOKIE_NAME, ENTITY_NAME_COOKIE_NAME } from "@/lib/auth";
import {
  COMPANY_PAGE,
  companyBase,
  companyPages,
  decodeSegment,
  isCanonicalRef,
} from "@/lib/companyPages";
import { shortIdOf } from "@minty/shared/companyRef";
import { hubHandoffUrl } from "@minty/shared/handoff";
import { previewSetSlug, withReturnOrigin } from "@minty/shared/previewSibling";
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

/**
 * Where an old `/profile` address goes now, or null when `pathname` is not one. The hand-off is
 * `@minty/shared/handoff`'s `hubHandoffUrl` (owner 2026-10-21: one shared module), naming the
 * request's origin as `return_origin` - which `toFlask` sets again, to the same value.
 */
function profileForward(pathname: string, search: string, origin: string): string | null {
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
  return hubHandoffUrl(minty, next, null, origin);
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
  // The pathname is still percent-encoded; decode it so URLSearchParams encodes it only once.
  const requestId = decodeSegment(page.split("/")[1] ?? "").trim();
  // `payment-request/new` is the Add page, not a request: the other company's list is the place.
  return requestId && requestId !== "new"
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

/**
 * A plain redirect - except on a branch preview-set host, where the trip has to START on a page
 * of this host: a visitor arriving from a link on GitHub or in an email makes the whole redirect
 * chain cross-site, and Flask names a preview set only on a same-site navigation (Minty
 * blueprints/shared/preview_origin.py), so it would hand back to the configured hosts instead of
 * the set. A meta refresh is navigated by the page itself.
 */
function flaskTrip(request: NextRequest, url: string): NextResponse {
  if (previewSetSlug(request.nextUrl.host) === null) return NextResponse.redirect(url);
  const attr = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${attr}"><title>Minty</title>`,
    {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    },
  );
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // Every trip to Flask names the origin it came in on, so Flask can hand back into a branch
  // preview set (Minty blueprints/shared/preview_origin.py); Flask ignores it everywhere else.
  const toFlask = (url: string) =>
    flaskTrip(request, withReturnOrigin(url, request.nextUrl.origin));

  // Before the cookie check: an old email link arrives with no cookie at all.
  const forward = profileForward(pathname, search, request.nextUrl.origin);
  if (forward) return toFlask(forward);

  // Redirects that depend on the cookie are 307s, never 308s: a browser keeps a 308 for good,
  // and the next company's `/` would then open this one's address.
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const entityId = request.cookies.get(ENTITY_ID_COOKIE_NAME)?.value ?? "";
  const entityName = request.cookies.get(ENTITY_NAME_COOKIE_NAME)?.value ?? "";

  const company = COMPANY_PAGE.exec(pathname);
  if (company) {
    const [, ref, slug, page] = company;
    if (!token || !entityId || ref.toLowerCase() !== shortIdOf(entityId)) {
      return toFlask(flaskHandoff(ref, slug, page));
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

  if (pathname === "/landing" || pathname.startsWith("/landing/")) {
    return NextResponse.next();
  }

  // No token: back into Minty, whose /entity sends a signed-in person to the entity list
  // (minty-web's) and anyone else to sign in. Choosing a module is minty-web's page since
  // phase 2 (2026-10-05); this app's /module-selection is gone.
  if (!token) {
    return toFlask(`${resolveMintyModuleUrl().replace(/\/+$/, "")}/entity`);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
