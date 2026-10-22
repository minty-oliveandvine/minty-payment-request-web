// The Subscriptions Overview's one read (loadSubscriptions in
// features/subscription/routes/SubscriptionsOverviewCard.tsx - @minty/shared/portal's
// fetchAllSubscriptions over this app's subscription-api client): minty-subscription-api's
// /api/me/subscriptions, every page of it, in order.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { ApiError } from "@/lib/api";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { MAX_PER_PAGE, UNEXPECTED_SHAPE, type PortalEntity } from "@minty/shared/portal";

import { loadSubscriptions as fetchAllPayerSubscriptions } from "@/features/subscription/routes/SubscriptionsOverviewCard";

const TOKEN = unsignedToken();
const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";
const SUBSCRIPTIONS_URL = `${env.SUBSCRIPTION_API_URL}/api/me/subscriptions`;
// owner 2026-10-21: one shared module (@minty/shared/portal) - a wrong-shaped page now reads
// "That came back in a shape I didn't expect. Mind trying again?" (it was "Your subscriptions
// didn't load. Mind trying again?"), and the result carries payer, billing and transfer_outcomes
// beside the companies.
const EMPTY_EXTRAS = { payer: undefined, billing: undefined, transfer_outcomes: [] };

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function company(n: number): PortalEntity {
  return {
    entity_id: `entity-${n}`,
    entity_name: `Company ${n}`,
    country: "Hong Kong",
    country_code: "HK",
    subscriber: { id: "payer-1", name: "Olive Vine", email: "olive@minty.test" },
    modules: [],
    settings_path: `/entity/entity-${n}/settings/modules`,
  };
}

const calledUrl = (i: number) => String(fetchMock.mock.calls[i][0]);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadSubscriptions", () => {
  it("asks for 100 a page - the API's ceiling", () => {
    expect(MAX_PER_PAGE).toBe(100);
    expect(UNEXPECTED_SHAPE).toBe("That came back in a shape I didn't expect. Mind trying again?");
  });

  it("carries the payer, billing and transfer outcomes of the FIRST page", async () => {
    const payer = { id: "payer-1", name: "Olive Vine", email: "olive@minty.test" };
    const outcome = {
      id: "t-1",
      entity_id: "entity-1",
      entity_name: "Company 1",
      status: "declined",
      who: "Ivy",
      responded_at: null,
    };
    fetchMock.mockResolvedValueOnce(
      answer(200, { payer, transfer_outcomes: [outcome], entities: [company(1)], pages: 2 }),
    );
    fetchMock.mockResolvedValueOnce(
      answer(200, { transfer_outcomes: [], entities: [company(2)], pages: 2 }),
    );

    const all = await fetchAllPayerSubscriptions();

    expect(all.payer).toEqual(payer);
    expect(all.transfer_outcomes).toEqual([outcome]);
    expect(all.entities).toHaveLength(2);
  });

  it("reads one page when there is one, with no company header", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { entities: [company(1)], pages: 1 }));

    await expect(fetchAllPayerSubscriptions()).resolves.toEqual({
      ...EMPTY_EXTRAS,
      entities: [company(1)],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledUrl(0)).toBe(`${SUBSCRIPTIONS_URL}?page=1&per_page=100`);
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.has("X-Entity-Id")).toBe(false);
  });

  it("walks every page in order and joins them", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { entities: [company(1)], pages: 3 }));
    fetchMock.mockResolvedValueOnce(answer(200, { entities: [company(2)], pages: 3 }));
    fetchMock.mockResolvedValueOnce(answer(200, { entities: [company(3), company(4)], pages: 3 }));

    const { entities } = await fetchAllPayerSubscriptions();

    expect(entities.map((e) => e.entity_id)).toEqual([
      "entity-1",
      "entity-2",
      "entity-3",
      "entity-4",
    ]);
    expect([0, 1, 2].map(calledUrl)).toEqual([
      `${SUBSCRIPTIONS_URL}?page=1&per_page=100`,
      `${SUBSCRIPTIONS_URL}?page=2&per_page=100`,
      `${SUBSCRIPTIONS_URL}?page=3&per_page=100`,
    ]);
  });

  it("trusts the FIRST page's count - a later page's `pages` is not read", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { entities: [company(1)], pages: 2 }));
    fetchMock.mockResolvedValueOnce(answer(200, { entities: [company(2)], pages: 9 }));

    const { entities } = await fetchAllPayerSubscriptions();

    expect(entities).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["zero pages", { entities: [], pages: 0 }],
    ["no pages field at all", { entities: [company(1)] }],
  ])("reads only the first page for %s", async (_label, body) => {
    fetchMock.mockResolvedValueOnce(answer(200, body));

    await fetchAllPayerSubscriptions();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes the caller's signal to every page", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(answer(200, { entities: [], pages: 2 }));
    fetchMock.mockResolvedValueOnce(answer(200, { entities: [], pages: 2 }));

    await fetchAllPayerSubscriptions(controller.signal);

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(fetchMock.mock.calls[1][1]?.signal).toBe(controller.signal);
  });

  it.each([
    ["an empty body", ""],
    ["no entities array", JSON.stringify({ pages: 1 })],
    ["entities that are not an array", JSON.stringify({ entities: {}, pages: 1 })],
  ])("refuses %s as a 502 in the app's voice", async (_label, raw) => {
    fetchMock.mockResolvedValueOnce(new Response(raw, { status: 200 }));

    const err = (await fetchAllPayerSubscriptions().catch((e: unknown) => e)) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.message).toBe(UNEXPECTED_SHAPE);
  });

  it("refuses a bad LATER page too, dropping the pages already read", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { entities: [company(1)], pages: 2 }));
    fetchMock.mockResolvedValueOnce(answer(200, { pages: 2 }));

    const err = (await fetchAllPayerSubscriptions().catch((e: unknown) => e)) as ApiError;

    expect(err.status).toBe(502);
    expect(err.message).toBe(UNEXPECTED_SHAPE);
  });

  it("lets the host's error through for a failed page", async () => {
    fetchMock.mockResolvedValueOnce(answer(500, { error: "The subscriptions service is down." }));

    const err = (await fetchAllPayerSubscriptions().catch((e: unknown) => e)) as ApiError;

    expect(err.status).toBe(500);
    expect(err.message).toBe("The subscriptions service is down.");
  });
});
