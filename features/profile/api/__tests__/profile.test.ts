// My Profile's read and write (features/profile/api/profile.ts - @minty/shared/portal's
// createProfileApi over sidebarHost.mintyApi): Flask's /api/me/profile, the company as `?entity=`
// and never as a header.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { profileApi } from "@/features/profile/api/profile";

const TOKEN = unsignedToken();
const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";
const PROFILE_URL = `${env.PETTY_CASH_URL}/api/me/profile`;

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("profileApi", () => {
  it("loads with a GET naming the company, and hands back the body as it came", async () => {
    const body = { user: { name: "Olive Vine", initials: "OV" } };
    fetchMock.mockResolvedValueOnce(answer(200, body));
    const controller = new AbortController();

    await expect(profileApi.load(ENTITY_ID, controller.signal)).resolves.toEqual(body);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${PROFILE_URL}?entity=${ENTITY_ID}`);
    // owner 2026-10-21: one shared module (@minty/shared/apiClient) - a read names no method,
    // so fetch's own default (GET) applies.
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.signal).toBe(controller.signal);
    expect(init?.body).toBeUndefined();
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.has("X-Entity-Id")).toBe(false);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
  ])("leaves ?entity= off for %s", async (_label, entityId) => {
    // The package's type says string; the adapter still guards against a missing company.
    fetchMock.mockResolvedValueOnce(answer(200, {}));

    await profileApi.load(entityId as unknown as string, new AbortController().signal);

    expect(fetchMock.mock.calls[0][0]).toBe(PROFILE_URL);
  });

  it("saves with a PATCH of the changes as JSON, naming the company", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { user: { name: "Olivia Vine" } }));

    await profileApi.save({ first_name: "Olivia" }, ENTITY_ID);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${PROFILE_URL}?entity=${ENTITY_ID}`);
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe('{"first_name":"Olivia"}');
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("saves without ?entity= when opened outside a company", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, {}));

    await profileApi.save({ first_name: "Olivia" }, null as unknown as string);

    expect(fetchMock.mock.calls[0][0]).toBe(PROFILE_URL);
  });
});
