// A company keeping its books in Minty (Xero optional, 2026-11-10) has nothing to publish: the API
// says `minty_only` on /auth/xero-status and BillActionBar draws no Publish (the API refuses one too).

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BillActionBar } from "@/components/payment-request/BillActionBar";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { forgetMintyOnly } from "@/lib/useMintyOnly";

const fetchMock = vi.fn<typeof fetch>();
const answer = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function serve(mintyOnly: boolean) {
  fetchMock.mockImplementation(async (input) => {
    if (String(input).includes("/auth/xero-status"))
      return answer({ connected: !mintyOnly, minty_only: mintyOnly });
    throw new Error(`no stub for ${String(input)}`);
  });
}

beforeEach(() => {
  forgetMintyOnly();
  vi.stubGlobal("fetch", fetchMock);
  setAuth(
    unsignedToken({ role: "admin", system_role: "normal" }),
    "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f",
    "Shop",
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Publish", () => {
  it("is not offered to a company keeping its books in Minty", async () => {
    serve(true);
    render(<BillActionBar onPublishToXero={vi.fn()} publishStatus="draft" showVoidBill={false} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Publish to Xero/ })).not.toBeInTheDocument(),
    );
  });

  it("is still offered to a Xero company", async () => {
    serve(false);
    render(<BillActionBar onPublishToXero={vi.fn()} publishStatus="draft" showVoidBill={false} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /Publish to Xero/ })).toBeInTheDocument();
  });
});
