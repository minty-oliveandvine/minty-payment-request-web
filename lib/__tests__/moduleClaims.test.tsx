// Whether this app's module is switched on for the company (lib/moduleClaims.ts).
//
// Two readers: the token's claim, which paints first, and the database, which decides.
// e2e/01_handoff.spec.ts's last test says the same thing through the browser - the database
// entitlement, not the token claim, is what gates the page.
//
// Deliberately asserts only the final rendered text. Which paint showed what, and how many
// renders it took, are render mechanics: the pending useSyncExternalStore refactor changes those
// and must not change any of this.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { getModuleClaims, useEntitlements } from "@/lib/moduleClaims";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The smallest possible reader of the hook: one line of text per flag. */
function Probe() {
  const { pettyCashEnabled, billingEnabled } = useEntitlements();
  return (
    <p role="status">
      {`petty cash ${pettyCashEnabled ? "on" : "off"}, payment request ${billingEnabled ? "on" : "off"}`}
    </p>
  );
}

const shown = () => screen.getByRole("status").textContent;

describe("getModuleClaims", () => {
  it("is both modules ON with no token at all", () => {
    // A standalone or pre-auth render must never hide nav.
    expect(getModuleClaims()).toEqual({ pettyCashEnabled: true, billingEnabled: true });
  });

  it("is both ON for a malformed token", () => {
    setAuth("nonsense", ENTITY_ID, ENTITY_NAME);
    expect(getModuleClaims()).toEqual({ pettyCashEnabled: true, billingEnabled: true });
  });

  it("is both ON for a token minted before module gating shipped", () => {
    // `unsignedToken` takes the claim set it is given, so this token carries ONLY a role -
    // exactly a legacy token. "Missing claim" must mean "not gated", never "off".
    setAuth(unsignedToken({ role: "admin" }), ENTITY_ID, ENTITY_NAME);
    expect(getModuleClaims()).toEqual({ pettyCashEnabled: true, billingEnabled: true });
  });

  it("honours an explicit false, which the backend writes only from an entitlement row", () => {
    setAuth(unsignedToken({ petty_cash_enabled: false, billing_enabled: false }), ENTITY_ID, ENTITY_NAME);
    expect(getModuleClaims()).toEqual({ pettyCashEnabled: false, billingEnabled: false });
  });

  it("falls back to ON for a claim that is not a boolean", () => {
    setAuth(unsignedToken({ billing_enabled: "false", petty_cash_enabled: 0 }), ENTITY_ID, ENTITY_NAME);
    expect(getModuleClaims()).toEqual({ pettyCashEnabled: true, billingEnabled: true });
  });
});

describe("useEntitlements", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the database for the company in the cookie", async () => {
    setAuth(unsignedToken(), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(200, { petty_cash_enabled: true, billing_enabled: true }));

    render(<Probe />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${env.PAYMENT_REQUEST_API_URL}/api/v1/auth/entitlements`);
    expect(new Headers(init?.headers).get("X-Entity-Id")).toBe(ENTITY_ID);
  });

  it("lets the database turn a module OFF that the token said was on", async () => {
    setAuth(unsignedToken({ billing_enabled: true }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(200, { petty_cash_enabled: true, billing_enabled: false }));

    render(<Probe />);

    await waitFor(() => expect(shown()).toContain("payment request off"));
  });

  it("lets the database turn a module ON that a stale token said was off", async () => {
    setAuth(unsignedToken({ billing_enabled: false }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(200, { billing_enabled: true }));

    render(<Probe />);

    await waitFor(() => expect(shown()).toContain("payment request on"));
  });

  it("leaves the token's claim standing when the read fails", async () => {
    setAuth(unsignedToken({ billing_enabled: false }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    render(<Probe />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(shown()).toContain("payment request off");
  });

  it("leaves the claim standing on a 404, and on a body it cannot use", async () => {
    setAuth(unsignedToken({ billing_enabled: false }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(404, { detail: "no such entity" }));

    render(<Probe />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(shown()).toContain("payment request off");
  });

  it("ignores a flag the answer left out", async () => {
    setAuth(unsignedToken({ petty_cash_enabled: false, billing_enabled: false }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValueOnce(answer(200, { billing_enabled: true }));

    render(<Probe />);

    await waitFor(() => expect(shown()).toContain("payment request on"));
    expect(shown()).toContain("petty cash off");
  });

  it("asks nothing with no session, and shows both modules on", () => {
    render(<Probe />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(shown()).toBe("petty cash on, payment request on");
  });

  it("asks nothing when the token names no company", () => {
    setAuth(unsignedToken(), "", "");
    render(<Probe />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
