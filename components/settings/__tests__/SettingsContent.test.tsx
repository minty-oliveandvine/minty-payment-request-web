// The Settings tab router (components/settings/SettingsContent.tsx): which panel the `?tab=`
// opens, and the company id the pills and the Xero link are built from.
//
// `entityId` is "" on the first render because it comes from a cookie, so every assertion here
// waits for the settled screen. That is deliberate: the pending useSyncExternalStore refactor
// removes that first frame, and nothing in this file may notice.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/Toast";
import { SettingsContent } from "@/components/settings/SettingsContent";
import { SETTINGS_TAB_LABELS, type SettingsTabId } from "@/components/settings/SettingsPills";
import { entityBillAccounts } from "@/lib/__fixtures__/accounts";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

let tab: string | null = null;
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(tab === null ? "" : `tab=${tab}`),
  useParams: () => ({ ref: "360812e1", slug: "olive-and-vine" }),
}));

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const show = () => render(<ToastProvider><SettingsContent /></ToastProvider>);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin" }), ENTITY_ID, ENTITY_NAME);
  tab = null;
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/auth/xero-status")) return answer(200, { connected: true });
    if (url.includes("/auth/entitlements")) return answer(200, { petty_cash_enabled: true, billing_enabled: true });
    if (url.includes("/entity-bill-accounts/")) return answer(200, entityBillAccounts());
    return answer(200, {});
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("which panel opens", () => {
  it("is the account-code card for ?tab=bill", async () => {
    tab = "bill";

    show();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Payment Account Code" }),
    ).toBeInTheDocument();
  });

  it("is the account-code card when no tab is named at all", async () => {
    show();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Payment Account Code" }),
    ).toBeInTheDocument();
  });

  it("is the account-code card for a tab it does not know", async () => {
    tab = "nonsense";

    show();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Payment Account Code" }),
    ).toBeInTheDocument();
  });

  it.each(["users", "xero", "entity", "modules"] as SettingsTabId[])(
    "is the placeholder, titled for the tab, for %s",
    async (id) => {
      tab = id;

      show();

      // The label is on the pill as well as on the card, so the assertion is scoped to the
      // card - found by the one sentence only the placeholder has.
      const note = await screen.findByText("This section is not available in the app yet.");
      expect(note.parentElement).toHaveTextContent(SETTINGS_TAB_LABELS[id]);
      expect(
        screen.queryByRole("heading", { level: 2, name: "Payment Account Code" }),
      ).not.toBeInTheDocument();
    },
  );

  it("reads nothing from the payment-request API for a tab that is not this app's", async () => {
    tab = "users";

    show();

    await screen.findByText("This section is not available in the app yet.");
    const asked = fetchMock.mock.calls.map(([u]) => String(u));
    expect(asked.some((u) => u.includes("/entity-bill-accounts/"))).toBe(false);
    expect(asked.some((u) => u.includes("/auth/xero-status"))).toBe(false);
  });
});

describe("the company id the panel is built from", () => {
  it("reaches the Xero link once the cookie has been read", async () => {
    tab = "bill";
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/auth/xero-status")) return answer(200, { connected: false });
      if (url.includes("/auth/entitlements")) return answer(200, { petty_cash_enabled: true, billing_enabled: true });
      return answer(200, {});
    });

    show();

    const link = await screen.findByRole("link", { name: "Entity & Integration" });
    await waitFor(() =>
      expect(link.getAttribute("href")).toBe(
        `${env.PETTY_CASH_URL}/entity/${ENTITY_ID}/settings/integration`,
      ),
    );
  });

  it("reaches the pills too", async () => {
    tab = "bill";

    show();

    const users = await screen.findByRole("link", { name: "Users" });
    await waitFor(() =>
      expect(users.getAttribute("href")).toBe(
        `${env.PETTY_CASH_URL}/entity/${ENTITY_ID}/settings/users`,
      ),
    );
  });
});

describe("the pills above the panel", () => {
  it("mark the tab that is open", async () => {
    tab = "bill";

    show();

    const open = await screen.findByRole("link", { name: "Payment Request Settings" });
    expect(open).toHaveAttribute("aria-current", "page");
  });
});
