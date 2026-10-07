// Every call this app makes to the Django API goes through one wrapper (lib/api.ts's
// `apiFetch`). It is private, so it is exercised through the thin public functions that use it
// - which is also the path the app itself takes.
//
// The two 401 branches are the most valuable cases in the file. Treating any 401 as an expired
// session sent the person back through the handoff, which re-minted the SAME token and landed
// them on the same screen failing the same way: an endless loop, reported as "our session
// timed out". Only a genuinely expired token is fixed by signing in again.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bill, billListItem } from "@/lib/__fixtures__/bills";
import { tokenExpiringIn, unsignedToken } from "@/lib/__fixtures__/tokens";
import {
  ApiError,
  createBill,
  deleteBillAttachment,
  fetchBills,
  fetchEntityCurrency,
  uploadBillAttachments,
} from "@/lib/api";
import { getAuth, setAuth } from "@/lib/auth";
import { env } from "@/lib/env";

const TOKEN = unsignedToken();
const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";
const V1 = `${env.PAYMENT_REQUEST_API_URL}/api/v1`;

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fresh copy of the module graph, for the tests that trip the once-only redirect. */
async function freshApi() {
  vi.resetModules();
  return {
    api: await import("@/lib/api"),
    auth: await import("@/lib/auth"),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
});

afterEach(() => {
  // clearMocks/restoreMocks do not undo stubGlobal.
  vi.unstubAllGlobals();
});

describe("the request", () => {
  it("goes to the API's /api/v1 with the bearer and the company", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { currency_code: "HKD" }));

    await expect(fetchEntityCurrency()).resolves.toEqual({ currency_code: "HKD" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${V1}/auth/entity-currency`);
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("X-Entity-Id")).toBe(ENTITY_ID);
  });

  it("sends JSON with its content type", async () => {
    fetchMock.mockResolvedValueOnce(answer(201, bill()));

    await createBill({ contact: "Young Bros Transport", amount: "6000.00" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(init?.body as string)).toEqual({
      contact: "Young Bros Transport",
      amount: "6000.00",
    });
  });

  it("does NOT set a content type for a FormData body - the browser must set the boundary", async () => {
    fetchMock.mockResolvedValueOnce(answer(201, []));

    // A PDF, so compressImage hands it back untouched and no canvas is needed.
    await uploadBillAttachments("bill-1", [new File(["%PDF-1.4"], "invoice.pdf", { type: "application/pdf" })]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${V1}/bills/bill-1/attachments`);
    expect(init?.body).toBeInstanceOf(FormData);
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });

  it("builds the list query from the parameters it was given, and omits the rest", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, [billListItem()]));

    await fetchBills({ status: "submitted", page: 2, amount_min: 0, search: "Young Bros" });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/v1/bills/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: "submitted",
      page: "2",
      amount_min: "0",
      search: "Young Bros",
    });
  });

  it("asks for the plain list when given no parameters", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, []));
    await fetchBills();
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${V1}/bills/`);
  });
});

describe("the answer", () => {
  it("is the parsed body", async () => {
    const row = billListItem({ id: "bill-1" });
    fetchMock.mockResolvedValueOnce(answer(200, [row]));
    await expect(fetchBills()).resolves.toEqual([row]);
  });

  it("is undefined for a 204, which has no body to parse", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteBillAttachment("bill-1", "att-1")).resolves.toBeUndefined();
  });
});

describe("a failure", () => {
  it("reads as friendly copy while keeping the server's own words in detail", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Internal Server Error" }), {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const err = await fetchBills().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).message).toBe("Something went wrong on my end. Mind trying again?");
    expect((err as ApiError).detail).toBe("Internal Server Error");
  });

  // CHARACTERISATION, and a real hole in the guard above.
  //
  // `isRawStatusText` recognises a bare reason phrase only by comparing it to `res.statusText`.
  // HTTP/2 carries no reason phrase at all, so `res.statusText` is ALWAYS "" there - and
  // production is HTTP/2 (Render, Vercel). A server that puts a reason phrase in its JSON
  // `detail` therefore has it shown verbatim, which is the exact leak docs/ERROR_COPY.md
  // records as fixed. It only holds today because the API sends real sentences.
  //
  // Pinned, not fixed: the fix is a change to what users see, which is a separate decision.
  it("shows a bare reason phrase from the body when statusText is empty, as it is over HTTP/2", async () => {
    fetchMock.mockResolvedValueOnce(answer(500, { detail: "Internal Server Error" }));

    const err = (await fetchBills().catch((e: unknown) => e)) as ApiError;

    expect(err.message).toBe("Internal Server Error");
    expect(err.message).not.toBe("Something went wrong on my end. Mind trying again?");
  });

  it("falls back to the reason phrase when the body is not JSON at all", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>502</html>", { status: 502, statusText: "Bad Gateway" }));

    const err = (await fetchBills().catch((e: unknown) => e)) as ApiError;

    expect(err.message).toBe("I couldn't reach the server just now. Mind trying again?");
    expect(err.message).not.toBe("Bad Gateway");
  });

  it("shows a 422's own sentence, which callers surface inline", async () => {
    fetchMock.mockResolvedValueOnce(
      answer(422, { detail: "That invoice number already exists in this company." }),
    );

    const err = (await createBill({}).catch((e: unknown) => e)) as ApiError;

    expect(err.status).toBe(422);
    expect(err.message).toBe("That invoice number already exists in this company.");
  });

  it("does not wrap a dropped connection - a network failure is still a TypeError", async () => {
    // docs/ERROR_COPY.md says so outright: catch sites must narrow to ApiError, because this
    // one arrives as "Failed to fetch".
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const err = await fetchBills().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TypeError);
    expect(err).not.toBeInstanceOf(ApiError);
  });
});

describe("a 401", () => {
  it("with a LIVE token is reported and the session is left alone - no handoff loop", async () => {
    fetchMock.mockResolvedValueOnce(answer(401, { detail: "not_a_member" }));

    const err = (await fetchBills().catch((e: unknown) => e)) as ApiError;

    expect(err.status).toBe(401);
    expect(err.message).toBe(
      "You don't have access to that. If you've just been added to a company, try picking it again from the company list.",
    );
    // The cookies are still there: nothing was signed out, and the page stays where it is.
    expect(getAuth()?.token).toBe(TOKEN);
  });

  it("with a live token shows the server's sentence when it has one", async () => {
    fetchMock.mockResolvedValueOnce(
      answer(401, { detail: "You are not a member of that company any more." }),
    );

    const err = (await fetchBills().catch((e: unknown) => e)) as ApiError;

    expect(err.message).toBe("You are not a member of that company any more.");
    expect(getAuth()?.token).toBe(TOKEN);
  });

  it("with a live token keeps a machine-shaped refusal out of the message but in the detail", async () => {
    fetchMock.mockResolvedValueOnce(answer(401, { detail: "entity_membership_revoked" }));

    const err = (await fetchBills().catch((e: unknown) => e)) as ApiError;

    expect(err.message).toContain("You don't have access to that.");
    expect(err.detail).toBe("entity_membership_revoked");
  });

  it("with an EXPIRED token signs the person out and says the session expired", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { api, auth } = await freshApi();
      // Past the five-second skew, and past the refresh threshold, so the refresh is tried
      // first and only then given up on.
      auth.setAuth(tokenExpiringIn(-60), ENTITY_ID, ENTITY_NAME);
      fetchMock.mockResolvedValueOnce(answer(401, { detail: "token expired" }));

      const err = (await api.fetchBills().catch((e: unknown) => e)) as ApiError;

      expect(err.status).toBe(401);
      expect(err.message).toBe("Your session expired. Taking you back to sign in.");
      expect(auth.getAuth()).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("the session before the request", () => {
  it("refreshes a token inside the two-minute window, then sends the FRESH one", async () => {
    const fresh = unsignedToken({ note: "fresh" });
    setAuth(tokenExpiringIn(60), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(200, { token: fresh }));
    fetchMock.mockResolvedValueOnce(answer(200, []));

    await fetchBills();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${V1}/auth/token/refresh`);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("Authorization")).toBe(`Bearer ${fresh}`);
  });

  it("does not refresh a token with plenty of life left", async () => {
    setAuth(tokenExpiringIn(3600), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(200, []));

    await fetchBills();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${V1}/bills/`);
  });

  it("carries on with the old token when the refresh fails but the token has not expired yet", async () => {
    const soon = tokenExpiringIn(60);
    setAuth(soon, ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(401, { detail: "nope" })); // the refresh
    fetchMock.mockResolvedValueOnce(answer(200, [])); // the call goes ahead

    await expect(fetchBills()).resolves.toEqual([]);

    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("Authorization")).toBe(`Bearer ${soon}`);
    expect(getAuth()?.token).toBe(soon);
  });

  it("refuses to call at all with no session, and asks nothing of the network", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { api, auth } = await freshApi();
      auth.clearAuth();

      const err = (await api.fetchBills().catch((e: unknown) => e)) as ApiError;

      expect(err.status).toBe(401);
      expect(err.message).toBe("You're signed out. Taking you back to sign in.");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
