import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { resolveMintyModuleUrl } from "@/lib/mintyEnv";

const AUTH_COOKIE = "billing_token";

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

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Before the cookie check: an old email link arrives with no cookie at all.
  const forward = profileForward(pathname, search);
  if (forward) return NextResponse.redirect(forward);

  if (
    pathname === "/module-selection" ||
    pathname.startsWith("/module-selection/") ||
    pathname === "/landing" ||
    pathname.startsWith("/landing/")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
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
