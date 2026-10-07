// The settings tabs (components/settings/SettingsPills.tsx).
//
// Four of the five pills leave this app for Flask, and they are real `<a href>` on purpose: a
// Next <Link> would be a soft move that "Leave without saving?" (lib/leaveGuard.ts) cannot hold.
// That is the rule most worth pinning here, because it is invisible on screen.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SETTINGS_TAB_IDS,
  SETTINGS_TAB_LABELS,
  SettingsPills,
  getSettingsTabFromSearchParams,
  integrationTabUrl,
  type SettingsTabId,
} from "@/components/settings/SettingsPills";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";
const SETTINGS_PATH = "/entity/360812e1/olive-and-vine/settings/payment-request";

vi.mock("next/navigation", () => ({
  useParams: () => ({ ref: "360812e1", slug: "olive-and-vine" }),
}));

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const pills = (activeTab: SettingsTabId = "bill") =>
  render(<SettingsPills activeTab={activeTab} entityId={ENTITY_ID} module1Url={env.PETTY_CASH_URL} />);

const names = () =>
  screen.getAllByRole("link").map((a) => a.textContent?.trim());

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken(), ENTITY_ID, ENTITY_NAME);
  fetchMock.mockResolvedValue(answer(200, { petty_cash_enabled: true, billing_enabled: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getSettingsTabFromSearchParams", () => {
  it.each([...SETTINGS_TAB_IDS])("takes %s as it is", (tab) => {
    expect(getSettingsTabFromSearchParams(tab)).toBe(tab);
  });

  it("falls back to Payment Request Settings - this app's own tab", () => {
    expect(getSettingsTabFromSearchParams(null)).toBe("bill");
    expect(getSettingsTabFromSearchParams("")).toBe("bill");
    expect(getSettingsTabFromSearchParams("nonsense")).toBe("bill");
    expect(getSettingsTabFromSearchParams("BILL")).toBe("bill");
  });
});

describe("the tab list", () => {
  it("is the five tabs, in order, with their labels", () => {
    expect([...SETTINGS_TAB_IDS]).toEqual(["users", "xero", "entity", "bill", "modules"]);
    expect(SETTINGS_TAB_LABELS).toEqual({
      users: "Users",
      xero: "Entity & Integration",
      entity: "Petty Cash Settings",
      bill: "Payment Request Settings",
      modules: "Modules",
    });
  });
});

describe("integrationTabUrl", () => {
  it("is Flask's Entity & Integration page, where Xero is connected", () => {
    expect(integrationTabUrl(env.PETTY_CASH_URL, ENTITY_ID)).toBe(
      `${env.PETTY_CASH_URL}/entity/${ENTITY_ID}/settings/integration`,
    );
  });

  it("encodes the company id", () => {
    expect(integrationTabUrl("https://minty.test", "a/b")).toBe(
      "https://minty.test/entity/a%2Fb/settings/integration",
    );
  });
});

describe("the pills on screen", () => {
  it("are all five, in the tab order", async () => {
    pills();

    await waitFor(() => expect(names()).toHaveLength(5));
    expect(names()).toEqual([
      "Users",
      "Entity & Integration",
      "Petty Cash Settings",
      "Payment Request Settings",
      "Modules",
    ]);
  });

  it("drop Petty Cash Settings when the company has not got that module", async () => {
    // It bounces over to Module 1, and would land them on a screen they cannot use.
    setAuth(unsignedToken({ petty_cash_enabled: false }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValue(answer(200, { petty_cash_enabled: false }));

    pills();

    await waitFor(() => expect(names()).toHaveLength(4));
    expect(names()).not.toContain("Petty Cash Settings");
  });

  it("mark the open tab, and only it", async () => {
    pills("bill");

    const open = await screen.findByRole("link", { name: "Payment Request Settings" });
    expect(open).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Users" })).not.toHaveAttribute("aria-current");
  });

  it("keep this app's tab inside this app", async () => {
    pills();

    const own = await screen.findByRole("link", { name: "Payment Request Settings" });
    expect(own.getAttribute("href")).toBe(`${SETTINGS_PATH}?tab=bill`);
  });

  it.each([
    ["Users", "users"],
    ["Entity & Integration", "integration"],
    ["Petty Cash Settings", "petty-cash"],
    ["Modules", "modules"],
  ])("send %s to Flask's own settings page", async (name, page) => {
    pills();

    const link = await screen.findByRole("link", { name });
    expect(link.getAttribute("href")).toBe(
      `${env.PETTY_CASH_URL}/entity/${ENTITY_ID}/settings/${page}`,
    );
  });

  it("carry no token in any address - a settings link is never a credential", async () => {
    pills();

    await waitFor(() => expect(names()).toHaveLength(5));
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toContain("token=");
    }
  });

  it("leave for Flask as FULL loads, so the leave guard can hold them", async () => {
    // A Next <Link> renders with its own router handling; these must be plain anchors with an
    // absolute href, which is what lib/leaveGuard.ts's click rules recognise.
    pills();

    await waitFor(() => expect(names()).toHaveLength(5));
    for (const name of ["Users", "Entity & Integration", "Petty Cash Settings", "Modules"]) {
      const href = screen.getByRole("link", { name }).getAttribute("href")!;
      expect(href.startsWith(env.PETTY_CASH_URL)).toBe(true);
    }
  });
});
