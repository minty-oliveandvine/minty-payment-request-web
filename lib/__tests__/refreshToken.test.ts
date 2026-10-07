// The single-flight token refresh and the once-only trip back to Minty (lib/auth.ts).
//
// Both are module-level state - `refreshInFlight` and `redirecting` - so these live apart from
// auth.test.ts and the ones that need a fresh module say so by importing it again.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { getAuth, refreshToken, setAuth } from "@/lib/auth";
import { env } from "@/lib/env";

const TOKEN = unsignedToken();
const FRESH = unsignedToken({ note: "fresh" });
const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  // clearMocks/restoreMocks do not undo stubGlobal.
  vi.unstubAllGlobals();
});

describe("refreshToken", () => {
  it("asks the API with the old token and stores the new one", async () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(200, { token: FRESH, expires_in: 28800 }));

    await expect(refreshToken()).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${env.PAYMENT_REQUEST_API_URL}/api/v1/auth/token/refresh`);
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("X-Entity-Id")).toBe(ENTITY_ID);
  });

  it("keeps the company the cookie already names", async () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(200, { token: FRESH }));

    await refreshToken();

    expect(getAuth()).toEqual({ token: FRESH, entityId: ENTITY_ID, entityName: ENTITY_NAME });
  });

  it("makes ONE request for two callers racing at mount, and answers both", async () => {
    // A screen fires several calls at once (the badge, the card, the Xero indicator). Each
    // refreshing separately meant later ones spending a token the first had already rotated
    // away, and on failure several raced to clear the cookie.
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(200, { token: FRESH }));

    const [first, second] = await Promise.all([refreshToken(), refreshToken()]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("releases the slot afterwards, so a later refresh asks again", async () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(200, { token: FRESH }));
    await refreshToken();
    fetchMock.mockResolvedValueOnce(answer(200, { token: unsignedToken({ note: "third" }) }));
    await refreshToken();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not ask at all without a token", async () => {
    await expect(refreshToken()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves the cookie alone when the server refuses", async () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(401, { detail: "expired" }));

    await expect(refreshToken()).resolves.toBe(false);
    expect(getAuth()?.token).toBe(TOKEN);
  });

  it("leaves the cookie alone when the network drops", async () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(refreshToken()).resolves.toBe(false);
    expect(getAuth()?.token).toBe(TOKEN);
  });

  it("leaves the cookie alone when the answer carries no token", async () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(200, { expires_in: 28800 }));

    await expect(refreshToken()).resolves.toBe(false);
    expect(getAuth()?.token).toBe(TOKEN);
  });

  it("leaves the cookie alone when the answer is not JSON", async () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(new Response("<html>nope</html>", { status: 200 }));

    await expect(refreshToken()).resolves.toBe(false);
    expect(getAuth()?.token).toBe(TOKEN);
  });
});

describe("redirectToLogin", () => {
  // jsdom implements no navigation and will not let `window.location` be redefined, so the
  // DESTINATION is not assertable here - e2e/01_handoff.spec.ts is what proves where the
  // browser lands. What is assertable is the observable side effect: the session is cleared,
  // and only the first caller does anything.
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // jsdom reports the unimplemented navigation through the virtual console.
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("clears the session on its way out", async () => {
    vi.resetModules();
    const auth = await import("@/lib/auth");
    auth.setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);

    auth.redirectToLogin();

    expect(auth.getAuth()).toBeNull();
  });

  it("fires once - several failing requests do not each navigate", async () => {
    vi.resetModules();
    const auth = await import("@/lib/auth");
    auth.setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);

    auth.redirectToLogin();
    expect(auth.getAuth()).toBeNull();

    // A second caller must do nothing at all - if it still ran, it would clear this again.
    auth.setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    auth.redirectToLogin();
    expect(auth.getAuth()?.token).toBe(TOKEN);
  });
});
