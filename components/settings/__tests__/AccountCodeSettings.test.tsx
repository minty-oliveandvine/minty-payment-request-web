// Payment Settings' account-code card (components/settings/AccountCodeSettings.tsx).
//
// e2e/06_settings.spec.ts and e2e/07_settings_leave.spec.ts drive this in a browser; what the
// unit layer adds is the cases that are slow or awkward there - the Xero-less card reading
// nothing at all, the at-least-one rule, the ON-before-OFF ordering of a save, and a partial
// failure leaving the saved set exactly where the server left it.
//
// The ACCOUNTS fixture is the same list e2e/07 uses, so a tick means the same thing either side.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/Toast";
import { AccountCodeSettings } from "@/components/settings/AccountCodeSettings";
import { ACCOUNTS, entityBillAccounts, labelOf } from "@/lib/__fixtures__/accounts";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";
const INTEGRATION_HREF = `${env.PETTY_CASH_URL}/entity/${ENTITY_ID}/settings/integration`;
const V1 = `${env.PAYMENT_REQUEST_API_URL}/api/v1`;

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Answers by path, so a test says what the stack holds rather than counting calls in order. */
function serve({
  connected = true,
  accounts = entityBillAccounts(),
  save = () => answer(200, {}),
}: {
  connected?: boolean;
  accounts?: ReturnType<typeof entityBillAccounts>;
  save?: (id: string) => Response;
} = {}) {
  const saved: { id: string; is_active: boolean }[] = [];
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/xero-status")) return answer(200, { connected });
    if (url.includes("/auth/entitlements")) return answer(200, { billing_enabled: true });
    if (url.includes("/profile/me")) return answer(200, { member_entity_ids: [ENTITY_ID] });
    if (url.includes("/entity-bill-accounts/") && init?.method === "PUT") {
      const id = url.split("/entity-bill-accounts/")[1];
      saved.push({ id, is_active: JSON.parse(String(init.body)).is_active });
      return save(id);
    }
    if (url.includes("/entity-bill-accounts/")) return answer(200, accounts);
    throw new Error(`no stub for ${url}`);
  });
  return { saved };
}

const show = () =>
  render(
    <ToastProvider>
      <AccountCodeSettings integrationHref={INTEGRATION_HREF} />
    </ToastProvider>,
  );

const tick = (seed: (typeof ACCOUNTS)[number]) =>
  screen.getByRole("checkbox", { name: `Include ${labelOf(seed)} in payment account dropdown` });
const saveButton = () => screen.getByRole("button", { name: /Save Changes/ });
const toastText = () => document.querySelector("[data-toast-type]")?.textContent ?? "";

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("without a live Xero connection", () => {
  it("offers only a way to connect, and does not read the codes AT ALL", async () => {
    // Reading them would also start the chart re-sync, for a chart that cannot be synced.
    serve({ connected: false });

    show();

    expect(await screen.findByText(/Xero isn't connected/)).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const asked = fetchMock.mock.calls.map(([u]) => String(u));
    expect(asked.some((u) => u.includes("/auth/xero-status"))).toBe(true);
    expect(asked.some((u) => u.includes("/entity-bill-accounts/"))).toBe(false);
  });

  it("points at Entity & Integration, where Xero is connected", async () => {
    serve({ connected: false });

    show();

    const link = await screen.findByRole("link", { name: "Entity & Integration" });
    expect(link.getAttribute("href")).toBe(INTEGRATION_HREF);
  });

  it("shows no search box and no Save at all", async () => {
    serve({ connected: false });

    show();

    await screen.findByText(/Xero isn't connected/);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save Changes/ })).not.toBeInTheDocument();
  });
});

describe("with Xero connected", () => {
  it("shows a tick per code, ticked as the company has them", async () => {
    serve();

    show();

    const list = await screen.findByRole("list", { name: "Account codes" });
    expect(within(list).getAllByRole("checkbox")).toHaveLength(ACCOUNTS.length + 1); // + select all
    for (const seed of ACCOUNTS) {
      expect(tick(seed)).toHaveProperty("checked", seed.active);
    }
  });

  it("asks for the inactive codes too, so an unticked one can be ticked", async () => {
    serve();

    show();

    await screen.findByRole("list", { name: "Account codes" });
    const asked = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes("/entity-bill-accounts/"))!;
    expect(asked).toBe(`${V1}/entity-bill-accounts/?include_inactive=true`);
  });

  it("says so when the codes do not load, rather than calling the list empty", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/auth/xero-status")) return answer(200, { connected: true });
      if (url.includes("/auth/entitlements")) return answer(200, { billing_enabled: true });
      return answer(500, { detail: "boom" });
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      show();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /I couldn't load your account codes/,
      );
      expect(screen.queryByText(/No account codes yet/)).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("filters the list as the search is typed, and says when nothing matches", async () => {
    serve();
    show();
    await screen.findByRole("list", { name: "Account codes" });

    await userEvent.type(screen.getByRole("searchbox"), "General");

    expect(tick(ACCOUNTS[1])).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: `Include ${labelOf(ACCOUNTS[0])} in payment account dropdown` }),
    ).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "nothing like this");
    expect(screen.getByText("No codes match your search.")).toBeInTheDocument();
  });
});

describe("Save", () => {
  it("is off until something changes", async () => {
    serve();
    show();
    await screen.findByRole("list", { name: "Account codes" });

    expect(saveButton()).toBeDisabled();

    await userEvent.click(tick(ACCOUNTS[2]));
    expect(saveButton()).toBeEnabled();
  });

  it("sends only the codes that changed", async () => {
    const { saved } = serve();
    show();
    await screen.findByRole("list", { name: "Account codes" });

    await userEvent.click(tick(ACCOUNTS[2]));
    await userEvent.click(saveButton());

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({ id: "account-310", is_active: true });
  });

  it("sends the ticks ON before the ticks OFF", async () => {
    // Unticking A while ticking B must never pass through a moment with nothing ticked, or the
    // server's at-least-one rule refuses the untick.
    const { saved } = serve();
    show();
    await screen.findByRole("list", { name: "Account codes" });

    await userEvent.click(tick(ACCOUNTS[0])); // 200 Sales off
    await userEvent.click(tick(ACCOUNTS[2])); // 310 COGS on
    await userEvent.click(saveButton());

    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved.map((s) => s.is_active)).toEqual([true, false]);
  });

  it("says it went through", async () => {
    serve();
    show();
    await screen.findByRole("list", { name: "Account codes" });

    await userEvent.click(tick(ACCOUNTS[2]));
    await userEvent.click(saveButton());

    await waitFor(() => expect(toastText()).toContain("Payment settings updated successfully"));
  });

  it("greys out with nothing ticked, and says to pick one", async () => {
    // The server refuses to untick the last ticked code (409), so the page never offers it.
    serve();
    show();
    await screen.findByRole("list", { name: "Account codes" });

    await userEvent.click(tick(ACCOUNTS[0]));
    await userEvent.click(tick(ACCOUNTS[1]));

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("Pick at least one account code.")).toBeInTheDocument();
  });

  it("shows a 409 in the server's own words", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      serve({ save: () => answer(409, { detail: "Keep at least one account code ticked." }) });
      show();
      await screen.findByRole("list", { name: "Account codes" });

      await userEvent.click(tick(ACCOUNTS[2]));
      await userEvent.click(saveButton());

      await waitFor(() =>
        expect(toastText()).toContain("Keep at least one account code ticked."),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("gives the generic retry line for any other refusal", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      serve({ save: () => answer(500, { detail: "boom" }) });
      show();
      await screen.findByRole("list", { name: "Account codes" });

      await userEvent.click(tick(ACCOUNTS[2]));
      await userEvent.click(saveButton());

      await waitFor(() => expect(toastText()).toContain("Some of those changes didn't save"));
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps the rows that DID save - the page measures from what the server holds", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // 310 on goes through; 200 off is refused.
      serve({ save: (id) => (id === "account-200" ? answer(500, { detail: "no" }) : answer(200, {})) });
      show();
      await screen.findByRole("list", { name: "Account codes" });

      await userEvent.click(tick(ACCOUNTS[2]));
      await userEvent.click(tick(ACCOUNTS[0]));
      await userEvent.click(saveButton());

      await waitFor(() => expect(toastText()).toContain("Some of those changes didn't save"));
      // Save is still live, because 200 is still unticked on screen and ticked on the server.
      expect(saveButton()).toBeEnabled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("somebody who may not change these", () => {
  it("is told to ask an Accountant or Admin, and gets no live controls", async () => {
    setAuth(unsignedToken({ role: "cashier", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
    serve();

    show();

    await screen.findByRole("list", { name: "Account codes" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "You have view-only access to these settings. Ask an Accountant or Admin to make changes.",
    );
    expect(tick(ACCOUNTS[0])).toBeDisabled();
    expect(saveButton()).toBeDisabled();
  });

  it("is told plainly when they are not a member of the company at all", async () => {
    setAuth(
      unsignedToken({ role: "admin", system_role: "superuser", is_view_only: true }),
      ENTITY_ID,
      ENTITY_NAME,
    );
    serve();

    show();

    await screen.findByRole("list", { name: "Account codes" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Read-only access — you are not a member of this entity.",
    );
  });

  it("is never shown that notice while the codes are still loading", () => {
    // The role arrives from the cookie a frame late, so an accountant would see it flash.
    setAuth(unsignedToken({ role: "cashier" }), ENTITY_ID, ENTITY_NAME);
    serve();

    show();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
