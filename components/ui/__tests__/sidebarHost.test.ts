// The ONE app-specific file the copied sidebar needs (components/ui/sidebarHost.ts): where the
// menu's items lead from this app, and how it reaches Flask and minty-subscription-api.
//
// e2e/05_sidebar.spec.ts asserts the rendered links over a stubbed Flask; this pins the builders
// and the bearer clients under them (@minty/shared/apiClient's createBearerClient, configured here),
// including the one rule a browser test cannot see - that the Flask client must NOT send X-Entity-Id, because Flask's CORS allowlist has only Authorization
// and Content-Type and the preflight fails with it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tokenExpiringIn, unsignedToken } from "@/lib/__fixtures__/tokens";
import { ApiError, HOUSE_FALLBACK } from "@minty/shared/apiClient";

import { getAuth, setAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  currentOf,
  currentToken,
  entityId,
  entityName,
  links,
  logOut,
  mintyApi,
  mintyQuietApi,
  moduleAccess,
  sidebarHost,
  subscriptionApi,
} from "@/components/ui/sidebarHost";

const TOKEN = unsignedToken();
const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("entityId", () => {
  it("is the company in the cookie, or empty", () => {
    expect(entityId()).toBe("");
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    expect(entityId()).toBe(ENTITY_ID);
  });
});

describe("moduleAccess", () => {
  it("is both modules when there is no token - nav is never hidden by accident", () => {
    expect(moduleAccess()).toEqual({ pettyCash: true, billing: true });
  });

  it("honours an explicit false in the token", () => {
    setAuth(
      unsignedToken({ petty_cash_enabled: false, billing_enabled: true }),
      ENTITY_ID,
      ENTITY_NAME,
    );
    expect(moduleAccess()).toEqual({ pettyCash: false, billing: true });
  });
});

describe("links", () => {
  beforeEach(() => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
  });

  it("all point at the Petty Cash origin lib/env.ts resolved", () => {
    for (const href of [
      links.entities(),
      links.subscriptions(),
      links.pettyCashDashboard(),
      links.pettyCashReports(ENTITY_ID),
      links.profile(),
    ]) {
      expect(href.startsWith(env.PETTY_CASH_URL)).toBe(true);
    }
  });

  it("lead into Minty through /enter, so a lapsed Flask session is remade on the way", () => {
    expect(links.entities()).toContain(`/entity/${ENTITY_ID}/enter`);
    expect(new URL(links.entities()).searchParams.get("next")).toBe("/entity");
    expect(new URL(links.pettyCashReports(ENTITY_ID)).searchParams.get("next")).toBe(
      `/entity/${ENTITY_ID}/petty-cash/reports`,
    );
  });

  it("send Subscriptions to minty-web through Flask's login-gated re-handoff", () => {
    const next = new URL(links.subscriptions()).searchParams.get("next")!;
    expect(next).toBe("/handoff/minty-web?next=%2Fsubscription");
  });

  it("send Subscriptions straight to the handoff when no company is in the cookie", () => {
    setAuth(TOKEN, "", "");
    expect(links.subscriptions()).toBe(
      `${env.PETTY_CASH_URL}/handoff/minty-web?next=%2Fsubscription&return_origin=${encodeURIComponent(window.location.origin)}`,
    );
  });

  it("keep Payment Requests and Settings inside this app", () => {
    expect(links.bills()).toBe("/entity/360812e1/olive-and-vine/payment-request");
    expect(links.settings()).toBe("/entity/360812e1/olive-and-vine/settings/payment-request");
  });

  it("fall back to / for this app's own pages when the cookie names no company", () => {
    // The middleware then sends `/` wherever it should go.
    setAuth(TOKEN, "", "");
    expect(links.bills()).toBe("/");
    expect(links.settings()).toBe("/");
  });
});

// Takes the path since 2026-10-12, instead of reading window.location itself: the packaged
// sidebar feeds it from this app's router (sidebarHost.usePathname), so it is a pure function.
describe("currentOf", () => {
  it("is 'settings' only on this app's settings page - the one menu item that is ours", () => {
    expect(currentOf("/entity/360812e1/olive-and-vine/settings/payment-request")).toBe("settings");
  });

  it("is null on every other page", () => {
    for (const path of [
      "/entity/360812e1/olive-and-vine/payment-request",
      "/entity/360812e1/olive-and-vine/payment-request/PR-0001",
      "/landing",
      "/",
      "",
    ]) {
      expect(currentOf(path)).toBeNull();
    }
  });

  it("never reports 'profile' - that page is minty-web's, so the menu's name always opens the view", () => {
    expect(currentOf("/profile")).toBeNull();
  });
});

describe("currentToken", () => {
  it("is the token the viewer cache keys on, or empty", () => {
    expect(currentToken()).toBe("");
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    expect(currentToken()).toBe(TOKEN);
  });
});

describe("mintyApi (Flask)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks Flask with the bearer and NO X-Entity-Id", () => {
    fetchMock.mockResolvedValueOnce(answer(200, { user: { name: "Olive Vine" } }));

    return mintyApi.json("/api/me/profile").then((body) => {
      expect(body).toEqual({ user: { name: "Olive Vine" } });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${env.PETTY_CASH_URL}/api/me/profile`);
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
      expect(headers.has("X-Entity-Id")).toBe(false);
      expect(headers.get("Accept")).toBe("application/json");
    });
  });

  it("carries a company as ?entity=, and leaves it off when there is none", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, {}));
    await mintyApi.json("/api/me/profile", { query: { entity: ENTITY_ID } });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${env.PETTY_CASH_URL}/api/me/profile?entity=${ENTITY_ID}`,
    );

    fetchMock.mockResolvedValueOnce(answer(200, {}));
    await mintyApi.json("/api/me/profile", { query: { entity: undefined } });
    expect(String(fetchMock.mock.calls[1][0])).toBe(`${env.PETTY_CASH_URL}/api/me/profile`);
  });

  it("sends a PATCH as JSON", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, {}));

    await mintyApi.json("/api/me/profile", { method: "PATCH", body: { first_name: "Olivia" } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("PATCH");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(init?.body).toBe('{"first_name":"Olivia"}');
  });

  it("refreshes first when the token is nearly out, then sends the fresh one", async () => {
    const fresh = unsignedToken({ note: "fresh" });
    setAuth(tokenExpiringIn(60), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(200, { token: fresh }));
    fetchMock.mockResolvedValueOnce(answer(200, {}));

    await mintyApi.json("/api/me/profile");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("Authorization")).toBe(
      `Bearer ${fresh}`,
    );
  });

  it("retries a 401 ONCE after a successful refresh", async () => {
    const fresh = unsignedToken({ note: "fresh" });
    fetchMock.mockResolvedValueOnce(answer(401, {}));
    fetchMock.mockResolvedValueOnce(answer(200, { token: fresh }));
    fetchMock.mockResolvedValueOnce(answer(200, { user: { name: "Olive Vine" } }));

    await expect(mintyApi.json("/api/me/profile")).resolves.toEqual({
      user: { name: "Olive Vine" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects a 401 it cannot cure WITHOUT clearing the session, for a decoration read", async () => {
    // The header's initials must never move the page: a lapsed token is the page's own reads'
    // business.
    fetchMock.mockResolvedValueOnce(answer(401, {}));
    fetchMock.mockResolvedValueOnce(answer(401, {})); // the refresh fails too

    const err = (await mintyQuietApi.json("/api/me/profile").catch((e: unknown) => e)) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(getAuth()?.token).toBe(TOKEN);
  });

  it("prefers the backend's own sentence over the house fallback", async () => {
    fetchMock.mockResolvedValueOnce(answer(422, { error: "That email is already in use." }));

    const err = (await mintyApi.json("/api/me/profile").catch((e: unknown) => e)) as ApiError;

    expect(err.message).toBe("That email is already in use.");
  });

  it("falls back to the house line when the backend said nothing useful", async () => {
    fetchMock.mockResolvedValueOnce(answer(500, { detail: "Internal Server Error" }));

    const err = (await mintyApi.json("/api/me/profile").catch((e: unknown) => e)) as ApiError;

    expect(err.message).toBe(HOUSE_FALLBACK);
  });

  it("reads an empty body as null rather than failing to parse it", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));
    await expect(mintyApi.json("/api/me/profile")).resolves.toBeNull();
  });

  it("hands back text when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("plain words", { status: 200 }));
    await expect(mintyApi.json("/api/me/profile")).resolves.toBe("plain words");
  });
});

describe("subscriptionApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks minty-subscription-api, not Flask and not the payment-request API", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { entities: [] }));

    await subscriptionApi.json("/api/me/subscriptions");

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${env.SUBSCRIPTION_API_URL}/api/me/subscriptions`,
    );
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(env.PAYMENT_REQUEST_API_URL);
  });
});

// The host's clients, hand-off and log-out since they moved to @minty/shared (the shared-code
// refactor, 2026-10-21). Where the shared module decided differently from this app's old
// wrappers, the case says "owner 2026-10-21: one shared module (@minty/shared/apiClient)".
describe("withQuery, through mintyApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    fetchMock.mockImplementation(async () => answer(200, {}));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const urlFor = async (path: string, query?: Record<string, string | number | undefined>) => {
    fetchMock.mockClear();
    await mintyApi.json(path, query === undefined ? {} : { query });
    return String(fetchMock.mock.calls[0][0]);
  };

  it("drops an empty string and undefined, and leaves no bare '?' behind", async () => {
    expect(await urlFor("/api/me/profile", { entity: "", page: undefined })).toBe(
      `${env.PETTY_CASH_URL}/api/me/profile`,
    );
    expect(await urlFor("/api/me/profile", {})).toBe(`${env.PETTY_CASH_URL}/api/me/profile`);
  });

  it("keeps a zero, as the string '0'", async () => {
    expect(await urlFor("/api/me/subscriptions", { page: 0 })).toBe(
      `${env.PETTY_CASH_URL}/api/me/subscriptions?page=0`,
    );
  });

  it("keeps a whitespace-only value - only the exact empty string is dropped", async () => {
    expect(await urlFor("/api/me/profile", { entity: " " })).toBe(
      `${env.PETTY_CASH_URL}/api/me/profile?entity=+`,
    );
  });

  // owner 2026-10-21: one shared module (@minty/shared/apiClient) - a null is dropped like
  // undefined and "" (it was sent as the text "null").
  it("drops a null too", async () => {
    const url = await urlFor("/api/me/profile", { entity: null as unknown as string });
    expect(url).toBe(`${env.PETTY_CASH_URL}/api/me/profile`);
  });

  // owner 2026-10-21: one shared module (@minty/shared/apiClient) - joined with "&" (a second
  // "?" was appended before).
  it("joins a path that already has a query with '&'", async () => {
    expect(await urlFor("/api/me/profile?x=1", { entity: "e1" })).toBe(
      `${env.PETTY_CASH_URL}/api/me/profile?x=1&entity=e1`,
    );
  });

  it("keeps the order the keys were given in and encodes the values", async () => {
    expect(await urlFor("/api/me/subscriptions", { per_page: 100, page: 2, q: "a&b" })).toBe(
      `${env.PETTY_CASH_URL}/api/me/subscriptions?per_page=100&page=2&q=a%26b`,
    );
  });

  it("does not touch the path when no query is given", async () => {
    expect(await urlFor("/api/me/profile?x=1")).toBe(`${env.PETTY_CASH_URL}/api/me/profile?x=1`);
  });
});

describe("the clients' failures, through mintyApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to the house line when `error` is not a string", async () => {
    fetchMock.mockResolvedValueOnce(answer(400, { error: { code: "bad" } }));
    const err = (await mintyApi.json("/api/me/profile").catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(400);
    expect(err.message).toBe(HOUSE_FALLBACK);
  });

  it("falls back to the house line for a plain-text error body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));
    const err = (await mintyApi.json("/api/me/profile").catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.message).toBe(HOUSE_FALLBACK);
  });

  // owner 2026-10-21: one shared module (@minty/shared/errorCopy's friendlyError) - `error`
  // first, then `detail`, then `message` (only `error` was read before, so a sentence in
  // `detail` was the house line).
  it("reads `detail` when there is no `error`", async () => {
    fetchMock.mockResolvedValueOnce(answer(403, { detail: "You may not see that company." }));
    const err = (await mintyApi.json("/api/me/profile").catch((e: unknown) => e)) as ApiError;
    expect(err.message).toBe("You may not see that company.");
  });

  it("is the literal house line minty-web uses", () => {
    expect(HOUSE_FALLBACK).toBe("Something went wrong on my end. Mind trying again?");
  });

  it("sends no Content-Type and no body for a GET", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, {}));
    await mintyApi.json("/api/me/profile");
    const [, init] = fetchMock.mock.calls[0];
    // owner 2026-10-21: one shared module - a read names no method; fetch's default is GET.
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });
});

describe("what a 401 means, in each mode", () => {
  // `redirectToLogin` fires once per module load, so each case takes a fresh module graph with
  // a spy in its place - the spy is what says whether the page would have moved.
  const redirectSpy = vi.fn();

  async function freshHost() {
    vi.resetModules();
    vi.doMock("@/lib/auth", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/auth")>()),
      redirectToLogin: redirectSpy,
    }));
    const host = await import("@/components/ui/sidebarHost");
    const auth = await import("@/lib/auth");
    return { host, auth };
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.doUnmock("@/lib/auth");
    vi.unstubAllGlobals();
  });

  it("'reauth' (mintyApi, subscriptionApi): one refresh, then back to Minty, with the session-ended line", async () => {
    const { host, auth } = await freshHost();
    auth.setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(401, {}));
    fetchMock.mockResolvedValueOnce(answer(401, {})); // the refresh fails

    const err = (await host.mintyApi.json("/api/me/profile").catch((e: unknown) => e)) as ApiError;

    expect(err.status).toBe(401);
    expect(err.message).toBe("Your session has ended. Signing you back in…");
    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `${env.PAYMENT_REQUEST_API_URL}/api/v1/auth/token/refresh`,
    );
  });

  it("'reject' (mintyQuietApi): the same error, and the page is never moved", async () => {
    const { host, auth } = await freshHost();
    auth.setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(401, {}));
    fetchMock.mockResolvedValueOnce(answer(401, {}));

    const err = (await host.mintyQuietApi
      .json("/api/me/profile")
      .catch((e: unknown) => e)) as ApiError;

    expect(err.message).toBe("Your session has ended. Signing you back in…");
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it("refreshes only once: a 401 on the retry goes straight to the mode's answer", async () => {
    const { host, auth } = await freshHost();
    auth.setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(401, {}));
    fetchMock.mockResolvedValueOnce(answer(200, { token: unsignedToken({ note: "fresh" }) }));
    fetchMock.mockResolvedValueOnce(answer(401, {}));

    const err = (await host.subscriptionApi
      .json("/api/me/subscriptions")
      .catch((e: unknown) => e)) as ApiError;

    expect(err.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(redirectSpy).toHaveBeenCalledTimes(1);
  });

  it("with no token at all asks nothing; 'reauth' goes back to Minty, 'reject' does not", async () => {
    const { host } = await freshHost();

    const reauth = (await host.mintyApi
      .json("/api/me/profile")
      .catch((e: unknown) => e)) as ApiError;
    expect(reauth.status).toBe(401);
    expect(reauth.message).toBe("Your session has ended. Signing you back in…");
    expect(redirectSpy).toHaveBeenCalledTimes(1);

    const reject = (await host.mintyQuietApi
      .json("/api/me/profile")
      .catch((e: unknown) => e)) as ApiError;
    expect(reject.status).toBe(401);
    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Unlike these clients, lib/api.ts's apiFetch neither refreshes nor retries on a live token's
  // 401 - apiFetch.test.ts pins that, so the move does not merge the two rules.
});

describe("handoff, through links.subscriptions", () => {
  it("is Minty's /enter carrying the token, with the hand-off as `next`, exactly", () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    expect(links.subscriptions()).toBe(
      `${env.PETTY_CASH_URL}/entity/${ENTITY_ID}/enter?token=${TOKEN}` +
        `&next=%2Fhandoff%2Fminty-web%3Fnext%3D%252Fsubscription` +
        `&return_origin=${encodeURIComponent(window.location.origin)}`,
    );
  });

  it("goes straight to the hand-off with no session at all", () => {
    expect(links.subscriptions()).toBe(
      `${env.PETTY_CASH_URL}/handoff/minty-web?next=%2Fsubscription&return_origin=${encodeURIComponent(window.location.origin)}`,
    );
  });

  it("the profile link enters through the company and lands on Minty's /profile naming it", () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    expect(new URL(links.profile()).searchParams.get("next")).toBe(
      `/profile?entity_id=${ENTITY_ID}`,
    );
  });

  it("the Petty Cash dashboard is a bare /enter, with no `next`", () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    const url = new URL(links.pettyCashDashboard());
    expect(url.pathname).toBe(`/entity/${ENTITY_ID}/enter`);
    expect(url.searchParams.has("next")).toBe(false);
  });
});

describe("entityName", () => {
  it("is the company name in the cookie, or empty", () => {
    expect(entityName()).toBe("");
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    expect(entityName()).toBe(ENTITY_NAME);
  });
});

describe("loadViewer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is the name and initials from Flask's profile, and nothing else", async () => {
    fetchMock.mockResolvedValueOnce(
      answer(200, { user: { name: "Olive Vine", initials: "OV", email: "olive@minty.test" } }),
    );

    await expect(sidebarHost.loadViewer()).resolves.toEqual({ name: "Olive Vine", initials: "OV" });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${env.PETTY_CASH_URL}/api/me/profile`);
  });

  it.each([
    ["no user", {}],
    ["a user without initials", { user: { name: "Olive Vine" } }],
    ["a name that is not a string", { user: { name: 7, initials: "OV" } }],
  ])("is null for %s", async (_label, body) => {
    fetchMock.mockResolvedValueOnce(answer(200, body));
    await expect(sidebarHost.loadViewer()).resolves.toBeNull();
  });

  it("rejects an uncured 401 and leaves the session where it was - it is decoration", async () => {
    fetchMock.mockResolvedValueOnce(answer(401, {}));
    fetchMock.mockResolvedValueOnce(answer(401, {}));

    await expect(sidebarHost.loadViewer()).rejects.toBeInstanceOf(ApiError);
    expect(getAuth()?.token).toBe(TOKEN);
  });
});

describe("logOut", () => {
  // jsdom implements no navigation, so the last step - `location.href = <Minty>/logout` - is not
  // assertable here (it reports through console.error); e2e proves where the browser lands.
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    consoleError.mockRestore();
  });

  it("tells the payment-request API first, then drops the cookies and the view choice", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    localStorage.setItem("payment-request-easy-view", "easy");
    localStorage.setItem("something-else", "kept");
    const onLeaving = vi.fn();

    await logOut(onLeaving);

    expect(onLeaving).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${env.PAYMENT_REQUEST_API_URL}/api/v1/auth/logout`);
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("X-Entity-Id")).toBe(ENTITY_ID);
    expect(getAuth()).toBeNull();
    expect(localStorage.getItem("payment-request-easy-view")).toBeNull();
    expect(localStorage.getItem("something-else")).toBe("kept");
  });

  it("still signs out locally when the API cannot be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(logOut()).resolves.toBeUndefined();

    expect(getAuth()).toBeNull();
  });

  it("asks the API nothing when there is no session, and still finishes", async () => {
    document.cookie = "billing_token=;path=/;max-age=0";

    await expect(logOut()).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
