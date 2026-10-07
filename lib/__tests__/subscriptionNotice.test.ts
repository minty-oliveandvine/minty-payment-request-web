// The subscription notice (lib/subscriptionNotice.ts): once per company per sign-in, and
// silent about every failure.
//
// "Deliberately quiet" is the whole design - a notice is an interruption, not a feature - so
// most of these cases assert that nothing happened and nothing threw. The one that matters most
// is the opposite: when storage is unavailable the notice SHOWS, because a repeated warning is
// a smaller failure than a missed one.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { claimSubscriptionNotice, fetchSubscriptionNotice } from "@/lib/subscriptionNotice";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const OTHER_ENTITY = "99999999-0000-0000-0000-000000000000";
const ENTITY_NAME = "Olive & Vine";

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const NOTICE = {
  items: [
    {
      kind: "past_due" as const,
      severity: "critical" as const,
      module: "Payment Request",
      module_code: "PAYMENT_REQUEST",
      title: "A payment did not go through",
      detail: "Update the card to keep using Payment Request.",
      deadline: "2026-10-21",
    },
  ],
  can_manage: true,
  payer: { name: "Olive Vine", email: "olive@minty.test" },
  severity: "critical" as const,
  settings_path: "/entity/e1/settings/modules",
};

describe("claimSubscriptionNotice", () => {
  beforeEach(() => {
    setAuth(unsignedToken({ sid: "sign-in-1" }), ENTITY_ID, ENTITY_NAME);
  });

  it("shows once, then not again for the same company and sign-in", () => {
    expect(claimSubscriptionNotice(ENTITY_ID)).toBe(true);
    expect(claimSubscriptionNotice(ENTITY_ID)).toBe(false);
    expect(claimSubscriptionNotice(ENTITY_ID)).toBe(false);
  });

  it("shows once per company", () => {
    expect(claimSubscriptionNotice(ENTITY_ID)).toBe(true);
    expect(claimSubscriptionNotice(OTHER_ENTITY)).toBe(true);
    expect(claimSubscriptionNotice(OTHER_ENTITY)).toBe(false);
  });

  it("shows again after signing out and back in, in the same tab", () => {
    // Keying by entity alone made this per-tab rather than per-login, so the notice stayed
    // suppressed here while Minty's dashboard correctly showed it again.
    expect(claimSubscriptionNotice(ENTITY_ID)).toBe(true);
    setAuth(unsignedToken({ sid: "sign-in-2" }), ENTITY_ID, ENTITY_NAME);
    expect(claimSubscriptionNotice(ENTITY_ID)).toBe(true);
  });

  it("retires the old sign-in's entries rather than appending forever", () => {
    claimSubscriptionNotice(ENTITY_ID);
    claimSubscriptionNotice(OTHER_ENTITY);
    setAuth(unsignedToken({ sid: "sign-in-2" }), ENTITY_ID, ENTITY_NAME);
    claimSubscriptionNotice(ENTITY_ID);

    const seen = JSON.parse(sessionStorage.getItem("subscription_notice_seen")!) as string[];
    expect(seen).toEqual([`sign-in-2:${ENTITY_ID}`]);
  });

  it("falls back to a per-tab flag when the token carries no sid", () => {
    setAuth(unsignedToken({ role: "admin" }), ENTITY_ID, ENTITY_NAME);
    expect(claimSubscriptionNotice(ENTITY_ID)).toBe(true);
    expect(claimSubscriptionNotice(ENTITY_ID)).toBe(false);

    const seen = JSON.parse(sessionStorage.getItem("subscription_notice_seen")!) as string[];
    expect(seen).toEqual([ENTITY_ID]);
  });

  it("never shows for no company", () => {
    expect(claimSubscriptionNotice("")).toBe(false);
  });

  it("shows when the stored value is nonsense rather than refusing forever", () => {
    sessionStorage.setItem("subscription_notice_seen", "not json");
    expect(claimSubscriptionNotice(ENTITY_ID)).toBe(true);
  });

  it("shows when the stored value is the wrong shape", () => {
    sessionStorage.setItem("subscription_notice_seen", '{"not":"an array"}');
    expect(claimSubscriptionNotice(ENTITY_ID)).toBe(true);
  });

  it("SHOWS when storage throws - private mode must not suppress a warning", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    try {
      expect(claimSubscriptionNotice(ENTITY_ID)).toBe(true);
      expect(claimSubscriptionNotice(ENTITY_ID)).toBe(true);
    } finally {
      getItem.mockRestore();
    }
  });
});

describe("fetchSubscriptionNotice", () => {
  // Silent to the USER, never to the console: outside production the module says why nothing
  // appeared, because "no modal" is otherwise indistinguishable from "nothing to say". The spy
  // both keeps the suite's output readable and lets each case assert that it said so.
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setAuth(unsignedToken(), ENTITY_ID, ENTITY_NAME);
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    warn.mockRestore();
  });

  const warnedAbout = (fragment: string) =>
    warn.mock.calls.some(([first]) => String(first).includes(fragment));

  it("asks the subscription engine, not the payment-request API", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, NOTICE));

    await expect(fetchSubscriptionNotice()).resolves.toEqual(NOTICE);

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${env.SUBSCRIPTION_API_URL}/api/entities/${ENTITY_ID}/subscription-notice`,
    );
  });

  it("asks nothing at all without a session, and says why", async () => {
    document.cookie = "billing_token=;path=/;max-age=0";
    await expect(fetchSubscriptionNotice()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnedAbout("no auth cookie")).toBe(true);
  });

  it("asks nothing when the cookie names no company", async () => {
    setAuth(unsignedToken(), "", "");
    await expect(fetchSubscriptionNotice()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is null for a server error, and logs the status", async () => {
    fetchMock.mockResolvedValueOnce(answer(500, { detail: "boom" }));
    await expect(fetchSubscriptionNotice()).resolves.toBeNull();
    expect(warnedAbout("server said 500")).toBe(true);
  });

  it("is null when the network drops, and logs it", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchSubscriptionNotice()).resolves.toBeNull();
    expect(warnedAbout("request failed")).toBe(true);
  });

  it("is null for a body it cannot read, and logs it", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>nope</html>", { status: 200 }));
    await expect(fetchSubscriptionNotice()).resolves.toBeNull();
    expect(warnedAbout("could not parse response")).toBe(true);
  });

  it("is null for a body with no items array, and calls it malformed", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { can_manage: true }));
    await expect(fetchSubscriptionNotice()).resolves.toBeNull();
    expect(warnedAbout("malformed response")).toBe(true);
  });

  it("is null when there is simply nothing to report, and says so distinctly", async () => {
    // A different reason from every failure above - which is the point of logging at all.
    fetchMock.mockResolvedValueOnce(answer(200, { ...NOTICE, items: [] }));
    await expect(fetchSubscriptionNotice()).resolves.toBeNull();
    expect(warnedAbout("nothing to report")).toBe(true);
  });

  it("retries once behind a refresh when the API says the token has aged out", async () => {
    fetchMock.mockResolvedValueOnce(answer(401, { detail: "expired" }));
    fetchMock.mockResolvedValueOnce(answer(200, { token: unsignedToken({ note: "fresh" }) }));
    fetchMock.mockResolvedValueOnce(answer(200, NOTICE));

    await expect(fetchSubscriptionNotice()).resolves.toEqual(NOTICE);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up when that refresh fails too", async () => {
    fetchMock.mockResolvedValueOnce(answer(401, { detail: "expired" }));
    fetchMock.mockResolvedValueOnce(answer(401, { detail: "no" })); // the refresh

    await expect(fetchSubscriptionNotice()).resolves.toBeNull();
  });
});
