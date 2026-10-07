// The ONE app-specific file the copied sidebar needs (components/ui/sidebarHost.ts): where the
// menu's items lead from this app, and how it reaches Flask and minty-subscription-api.
//
// e2e/05_sidebar.spec.ts asserts the rendered links over a stubbed Flask; this pins the builders
// and the two fetch wrappers under them, including the one rule a browser test cannot see - that
// mintyFetch must NOT send X-Entity-Id, because Flask's CORS allowlist has only Authorization
// and Content-Type and the preflight fails with it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tokenExpiringIn, unsignedToken } from "@/lib/__fixtures__/tokens";
import { ApiError } from "@/lib/api";
import { getAuth, setAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  HOUSE_FALLBACK,
  billingApiFetch,
  currentOf,
  currentToken,
  entityId,
  links,
  mintyFetch,
  moduleAccess,
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
    setAuth(unsignedToken({ petty_cash_enabled: false, billing_enabled: true }), ENTITY_ID, ENTITY_NAME);
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
    expect(links.subscriptions()).toBe(`${env.PETTY_CASH_URL}/handoff/minty-web?next=%2Fsubscription`);
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

describe("currentOf", () => {
  it("is 'settings' only on this app's settings page - the one menu item that is ours", () => {
    window.history.replaceState({}, "", "/entity/360812e1/olive-and-vine/settings/payment-request");
    expect(currentOf()).toBe("settings");
  });

  it("is null on every other page", () => {
    for (const path of [
      "/entity/360812e1/olive-and-vine/payment-request",
      "/entity/360812e1/olive-and-vine/payment-request/PR-0001",
      "/landing",
      "/",
    ]) {
      window.history.replaceState({}, "", path);
      expect(currentOf()).toBeNull();
    }
  });
});

describe("currentToken", () => {
  it("is the token the viewer cache keys on, or empty", () => {
    expect(currentToken()).toBe("");
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    expect(currentToken()).toBe(TOKEN);
  });
});

describe("mintyFetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks Flask with the bearer and NO X-Entity-Id", () => {
    fetchMock.mockResolvedValueOnce(answer(200, { user: { name: "Olive Vine" } }));

    return mintyFetch("/api/me/profile").then((body) => {
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
    await mintyFetch("/api/me/profile", { query: { entity: ENTITY_ID } });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${env.PETTY_CASH_URL}/api/me/profile?entity=${ENTITY_ID}`,
    );

    fetchMock.mockResolvedValueOnce(answer(200, {}));
    await mintyFetch("/api/me/profile", { query: { entity: undefined } });
    expect(String(fetchMock.mock.calls[1][0])).toBe(`${env.PETTY_CASH_URL}/api/me/profile`);
  });

  it("sends a PATCH as JSON", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, {}));

    await mintyFetch("/api/me/profile", { method: "PATCH", json: { first_name: "Olivia" } });

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

    await mintyFetch("/api/me/profile");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("Authorization")).toBe(`Bearer ${fresh}`);
  });

  it("retries a 401 ONCE after a successful refresh", async () => {
    const fresh = unsignedToken({ note: "fresh" });
    fetchMock.mockResolvedValueOnce(answer(401, {}));
    fetchMock.mockResolvedValueOnce(answer(200, { token: fresh }));
    fetchMock.mockResolvedValueOnce(answer(200, { user: { name: "Olive Vine" } }));

    await expect(mintyFetch("/api/me/profile")).resolves.toEqual({ user: { name: "Olive Vine" } });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects a 401 it cannot cure WITHOUT clearing the session, for a decoration read", async () => {
    // The header's initials must never move the page: a lapsed token is the page's own reads'
    // business.
    fetchMock.mockResolvedValueOnce(answer(401, {}));
    fetchMock.mockResolvedValueOnce(answer(401, {})); // the refresh fails too

    const err = (await mintyFetch("/api/me/profile", { onUnauthorized: "reject" }).catch(
      (e: unknown) => e,
    )) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(getAuth()?.token).toBe(TOKEN);
  });

  it("prefers the backend's own sentence over the house fallback", async () => {
    fetchMock.mockResolvedValueOnce(answer(422, { error: "That email is already in use." }));

    const err = (await mintyFetch("/api/me/profile").catch((e: unknown) => e)) as ApiError;

    expect(err.message).toBe("That email is already in use.");
  });

  it("falls back to the house line when the backend said nothing useful", async () => {
    fetchMock.mockResolvedValueOnce(answer(500, { detail: "Internal Server Error" }));

    const err = (await mintyFetch("/api/me/profile").catch((e: unknown) => e)) as ApiError;

    expect(err.message).toBe(HOUSE_FALLBACK);
  });

  it("reads an empty body as null rather than failing to parse it", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));
    await expect(mintyFetch("/api/me/profile")).resolves.toBeNull();
  });

  it("hands back text when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("plain words", { status: 200 }));
    await expect(mintyFetch("/api/me/profile")).resolves.toBe("plain words");
  });
});

describe("billingApiFetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks minty-subscription-api, not Flask and not the payment-request API", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { entities: [] }));

    await billingApiFetch("/api/me/subscriptions");

    expect(String(fetchMock.mock.calls[0][0])).toBe(`${env.SUBSCRIPTION_API_URL}/api/me/subscriptions`);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(env.PAYMENT_REQUEST_API_URL);
  });
});
