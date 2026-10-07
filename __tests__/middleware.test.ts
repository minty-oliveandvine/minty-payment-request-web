// @vitest-environment node
//
// Every redirect this app makes before a page renders (middleware.ts). 127 lines of routing
// that, until now, only a running server and a browser could check.
//
// The tables are the ones e2e/03_payer_portal.spec.ts and e2e/01_handoff.spec.ts assert through
// the browser; here they are pinned one layer down, where a case costs milliseconds instead of
// a five-service stack. The node environment is deliberate: NextRequest wants the platform
// Request, and middleware is server code.

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { AUTH_COOKIE_NAME, ENTITY_ID_COOKIE_NAME, ENTITY_NAME_COOKIE_NAME } from "@/lib/auth";
import { env } from "@/lib/env";
import { config, middleware } from "@/middleware";

const MINTY = env.PETTY_CASH_URL;
const APP = "http://localhost:3020";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";
const BASE = "/entity/360812e1/olive-and-vine";

type Jar = { token?: string; entityId?: string; entityName?: string };

const SIGNED_IN: Jar = { token: "a.b.c", entityId: ENTITY_ID, entityName: ENTITY_NAME };

function run(path: string, jar: Jar = {}) {
  const request = new NextRequest(new URL(path, APP));
  if (jar.token !== undefined) request.cookies.set(AUTH_COOKIE_NAME, jar.token);
  if (jar.entityId !== undefined) request.cookies.set(ENTITY_ID_COOKIE_NAME, jar.entityId);
  if (jar.entityName !== undefined) request.cookies.set(ENTITY_NAME_COOKIE_NAME, jar.entityName);
  const response = middleware(request);
  return {
    status: response.status,
    location: response.headers.get("location"),
    /** What NextResponse.next() sets, so "the page renders" is assertable rather than implied. */
    rewritten: response.headers.get("x-middleware-next") === "1",
  };
}

const handoff = (next: string) =>
  `${MINTY}/handoff/minty-web?${new URLSearchParams({ next }).toString()}`;

describe("the matcher", () => {
  it("runs on pages only - not on _next, not on /api, not on a file", () => {
    expect(config.matcher).toEqual(["/((?!_next|api|.*\\..*).*)"]);
  });
});

describe("the old /profile addresses", () => {
  // Deleted here on 2026-10-01; they live in minty-web now, and the addresses survive in emails
  // and bookmarks.
  it.each([
    ["/profile/subscriptions", "/subscription/subscriptions"],
    ["/profile/subscriptions/incoming", "/subscription/subscriptions/incoming"],
    ["/profile/subscriptions/subscriber", "/subscription/subscriptions/subscriber"],
    ["/profile/billing", "/subscription/billing"],
    ["/profile/invoices", "/subscription/billing"],
  ])("forwards %s through Flask's login-gated handoff", (path, target) => {
    expect(run(path)).toMatchObject({ status: 307, location: handoff(target) });
  });

  it("carries the query with it", () => {
    expect(run("/profile/billing?entity_id=e1&transfer=t1").location).toBe(
      handoff("/subscription/billing?entity_id=e1&transfer=t1"),
    );
  });

  it("sends /profile itself to Flask's profile router, which opens minty-web's My Profile", () => {
    expect(run("/profile")).toMatchObject({ status: 307, location: `${MINTY}/profile` });
  });

  it("sends an address it does not know where /profile goes", () => {
    expect(run("/profile/nonsense").location).toBe(`${MINTY}/profile`);
    expect(run("/profile/subscriptions/deeper/still").location).toBe(`${MINTY}/profile`);
  });

  it("keeps the rest of the query on /profile but drops from=bills", () => {
    // The profile's Back returns to the page the person came from, so nothing is carried
    // (2026-10-05).
    expect(run("/profile?entity_id=e1&from=bills").location).toBe(`${MINTY}/profile?entity_id=e1`);
    expect(run("/profile?from=bills").location).toBe(`${MINTY}/profile`);
  });

  it("forwards before the cookie is looked at, because an old email link has none", () => {
    expect(run("/profile/billing", {}).location).toBe(handoff("/subscription/billing"));
    expect(run("/profile", {}).location).toBe(`${MINTY}/profile`);
  });

  it("forwards the same way for a signed-in person", () => {
    expect(run("/profile/billing", SIGNED_IN).location).toBe(handoff("/subscription/billing"));
  });

  it("does not touch a path that merely starts with the same letters", () => {
    expect(run("/profiles", SIGNED_IN).location).toBeNull();
  });
});

describe("a company's own page", () => {
  it.each([
    ["the list", `${BASE}/payment-request`],
    ["one request", `${BASE}/payment-request/PR-0001`],
    ["the settings page", `${BASE}/settings/payment-request`],
  ])("renders %s when the cookie holds that company", (_label, path) => {
    expect(run(path, SIGNED_IN)).toMatchObject({ rewritten: true, location: null });
  });

  it.each([
    ["the list", `${BASE}/payment-request`, `${MINTY}/entity/360812e1/olive-and-vine/payment-request`],
    [
      "one request",
      `${BASE}/payment-request/PR-0001`,
      `${MINTY}/entity/360812e1/olive-and-vine/payment-request?request=PR-0001`,
    ],
    [
      "the settings page",
      `${BASE}/settings/payment-request`,
      `${MINTY}/entity/360812e1/olive-and-vine/settings/payment-request`,
    ],
  ])("hands %s to Flask when there is no cookie at all", (_label, path, target) => {
    expect(run(path, {})).toMatchObject({ status: 307, location: target });
  });

  it("hands a page of another company to Flask, which mints a token for that one", () => {
    const other = { ...SIGNED_IN, entityId: "99999999-0000-0000-0000-000000000000" };
    expect(run(`${BASE}/payment-request`, other).location).toBe(
      `${MINTY}/entity/360812e1/olive-and-vine/payment-request`,
    );
  });

  it("hands it to Flask when the token is gone but the company cookie is not", () => {
    expect(run(`${BASE}/payment-request`, { entityId: ENTITY_ID, entityName: ENTITY_NAME }).location).toBe(
      `${MINTY}/entity/360812e1/olive-and-vine/payment-request`,
    );
  });

  it("percent-encodes a request id on the way to Flask", () => {
    expect(run(`${BASE}/payment-request/PR%2F0001`, {}).location).toBe(
      `${MINTY}/entity/360812e1/olive-and-vine/payment-request?request=PR%252F0001`,
    );
  });

  it("corrects a capital in the short id, keeping the query", () => {
    expect(run("/entity/360812E1/olive-and-vine/payment-request?status=Draft", SIGNED_IN)).toMatchObject({
      status: 307,
      location: `${APP}${BASE}/payment-request?status=Draft`,
    });
  });

  it("corrects a stale company name", () => {
    expect(run("/entity/360812e1/olive-vine/payment-request", SIGNED_IN).location).toBe(
      `${APP}${BASE}/payment-request`,
    );
  });

  it("corrects the name on a request page and on the settings page too", () => {
    expect(run("/entity/360812e1/wrong/payment-request/PR-0001", SIGNED_IN).location).toBe(
      `${APP}${BASE}/payment-request/PR-0001`,
    );
    expect(run("/entity/360812e1/wrong/settings/payment-request", SIGNED_IN).location).toBe(
      `${APP}${BASE}/settings/payment-request`,
    );
  });
});

describe("the addresses from before company addresses", () => {
  // 2026-10-05. Old links, bookmarks and a Flask still sending `next=/` keep working.
  it.each([
    ["/", `${BASE}/payment-request`],
    ["/settings", `${BASE}/settings/payment-request`],
    ["/payment-request/PR-0001", `${BASE}/payment-request/PR-0001`],
  ])("sends %s to the cookie's company address", (path, target) => {
    expect(run(path, SIGNED_IN)).toMatchObject({ status: 307, location: `${APP}${target}` });
  });

  it("keeps the query", () => {
    expect(run("/?status=Draft", SIGNED_IN).location).toBe(`${APP}${BASE}/payment-request?status=Draft`);
  });

  it("sends an unknown legacy page back into Minty when there is no cookie", () => {
    expect(run("/", {}).location).toBe(`${MINTY}/entity`);
    expect(run("/settings", {}).location).toBe(`${MINTY}/entity`);
    expect(run("/payment-request/PR-0001", {}).location).toBe(`${MINTY}/entity`);
  });

  it("does not upgrade a legacy page when the token is there but the company is not", () => {
    // The company address cannot be built without an entity id, so the page is left to render
    // and the client's own handoff deals with it.
    expect(run("/", { token: "a.b.c" })).toMatchObject({ rewritten: true, location: null });
  });
});

describe("/landing", () => {
  it("always passes, token or no token - it is where the token arrives", () => {
    expect(run("/landing", {})).toMatchObject({ rewritten: true, location: null });
    expect(run("/landing?token=a.b.c&next=/payment-request", {})).toMatchObject({ rewritten: true });
    expect(run("/landing/anything", {})).toMatchObject({ rewritten: true });
    expect(run("/landing", SIGNED_IN)).toMatchObject({ rewritten: true });
  });
});

describe("anything else", () => {
  it("goes back into Minty without a token", () => {
    expect(run("/maintenance", {})).toMatchObject({ status: 307, location: `${MINTY}/entity` });
    expect(run("/whatever", {})).toMatchObject({ status: 307, location: `${MINTY}/entity` });
  });

  it("renders with a token", () => {
    expect(run("/maintenance", SIGNED_IN)).toMatchObject({ rewritten: true, location: null });
  });
});

describe("the status code", () => {
  // A browser keeps a 308 for good, and the next company's `/` would then open this one's
  // address. Every redirect here must be a 307.
  it.each([
    ["/profile", {}],
    ["/profile/billing", {}],
    [`${BASE}/payment-request`, {}],
    ["/entity/360812E1/olive-and-vine/payment-request", SIGNED_IN],
    ["/", SIGNED_IN],
    ["/whatever", {}],
  ])("is 307 for %s, never 308", (path, jar) => {
    expect(run(path, jar as Jar).status).toBe(307);
  });
});
