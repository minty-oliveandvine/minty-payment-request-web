// The company's currency, read once and shared (lib/entityCurrency.ts + lib/currencyDisplay.ts).
//
// The cache is a module-level promise, so every case that depends on its state takes a fresh
// copy of the module rather than trying to reach into it.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { currencyLabelForCode } from "@/lib/currencyDisplay";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fresh module, so the cache starts empty. */
async function freshModule() {
  vi.resetModules();
  return import("@/lib/entityCurrency");
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken(), ENTITY_ID, "Olive & Vine");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("currencyLabelForCode", () => {
  it("is the ISO code itself, upper case - the billing UI shows no symbols", () => {
    expect(currencyLabelForCode("hkd")).toBe("HKD");
    expect(currencyLabelForCode(" usd ")).toBe("USD");
    expect(currencyLabelForCode("")).toBe("");
  });
});

describe("getEntityCurrencyCode", () => {
  it("reads the code once and hands the same answer back", async () => {
    const { getEntityCurrencyCode } = await freshModule();
    fetchMock.mockResolvedValueOnce(answer(200, { currency_code: "hkd" }));

    await expect(getEntityCurrencyCode()).resolves.toBe("HKD");
    await expect(getEntityCurrencyCode()).resolves.toBe("HKD");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is empty when the company has no currency set", async () => {
    const { getEntityCurrencyCode } = await freshModule();
    fetchMock.mockResolvedValueOnce(answer(200, { currency_code: "" }));

    await expect(getEntityCurrencyCode()).resolves.toBe("");
  });

  it("clears the cache after a failure, so a later call tries again", async () => {
    const { getEntityCurrencyCode } = await freshModule();
    fetchMock.mockResolvedValueOnce(answer(500, { detail: "boom" }));

    await expect(getEntityCurrencyCode()).resolves.toBe("");

    fetchMock.mockResolvedValueOnce(answer(200, { currency_code: "HKD" }));
    await expect(getEntityCurrencyCode()).resolves.toBe("HKD");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("useEntityCurrency", () => {
  it("is empty until the code arrives, then the code", async () => {
    const { useEntityCurrency } = await freshModule();
    function Probe() {
      return <p role="status">{`currency=${useEntityCurrency()}`}</p>;
    }
    fetchMock.mockResolvedValueOnce(answer(200, { currency_code: "HKD" }));

    render(<Probe />);

    // Callers fall back to their per-record currency while it is empty.
    expect(screen.getByRole("status").textContent).toBe("currency=");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("currency=HKD"));
  });

  it("is read once however many components ask", async () => {
    const { useEntityCurrency } = await freshModule();
    function Probe({ label }: { label: string }) {
      return <p aria-label={label}>{`currency=${useEntityCurrency()}`}</p>;
    }
    fetchMock.mockResolvedValueOnce(answer(200, { currency_code: "HKD" }));

    render(
      <>
        <Probe label="table" />
        <Probe label="banner" />
        <Probe label="detail" />
      </>,
    );

    await waitFor(() => expect(screen.getByLabelText("table").textContent).toBe("currency=HKD"));
    expect(screen.getByLabelText("banner").textContent).toBe("currency=HKD");
    expect(screen.getByLabelText("detail").textContent).toBe("currency=HKD");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stays empty when the read fails, and says nothing about it on screen", async () => {
    const { useEntityCurrency } = await freshModule();
    function Probe() {
      return <p role="status">{`currency=${useEntityCurrency()}`}</p>;
    }
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    render(<Probe />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole("status").textContent).toBe("currency=");
  });
});
