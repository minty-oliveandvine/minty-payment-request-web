// The one drawer with two views (components/ui/Sidebar.tsx + SideMenu.tsx), copied from
// minty-web on 2026-09-30 and wired to this app through components/ui/sidebarHost.ts.
//
// e2e/05_sidebar.spec.ts drives it over a stubbed Flask; what this adds is the drawer's own
// mechanics - which view is showing, what closes it, and the fact that it closes itself when
// the page underneath changes.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider, useSidebar } from "@/components/ui/Sidebar";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

const nav = { pathname: "/entity/360812e1/olive-and-vine/payment-request" };
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useParams: () => ({ ref: "360812e1", slug: "olive-and-vine" }),
}));

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The page under the drawer: the two openers the real header has. */
function Page() {
  const sidebar = useSidebar()!;
  return (
    <>
      <button type="button" onClick={() => sidebar.openMenu()}>
        Open the menu
      </button>
      <button type="button" onClick={() => sidebar.openProfile()}>
        OV
      </button>
    </>
  );
}

const show = ({ profile }: { profile?: React.ReactNode } = {}) =>
  render(
    <SidebarProvider profile={profile}>
      <Page />
    </SidebarProvider>,
  );

const menu = () => screen.queryByRole("navigation", { name: "Main navigation" });
const profilePanel = () => screen.queryByRole("region", { name: "My Profile" });
const openMenu = () => userEvent.click(screen.getByRole("button", { name: "Open the menu" }));

beforeEach(() => {
  nav.pathname = "/entity/360812e1/olive-and-vine/payment-request";
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin" }), ENTITY_ID, ENTITY_NAME);
  fetchMock.mockImplementation(async () => answer(200, { petty_cash_enabled: true, billing_enabled: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the drawer", () => {
  it("is shut until something opens it", () => {
    show();

    expect(menu()).not.toBeInTheDocument();
  });

  it("opens on the menu view", async () => {
    show();

    await openMenu();

    expect(menu()).toBeInTheDocument();
  });

  it("closes on its own close control", async () => {
    show();
    await openMenu();

    await userEvent.click(screen.getByRole("button", { name: "Close menu" }));

    expect(menu()).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    show();
    await openMenu();

    await userEvent.keyboard("{Escape}");

    expect(menu()).not.toBeInTheDocument();
  });

  it("closes itself when the page underneath changes", async () => {
    // It is opened AT a path: a soft navigation must not leave a drawer hanging over the new
    // page.
    const view = show();
    await openMenu();
    expect(menu()).toBeInTheDocument();

    nav.pathname = "/entity/360812e1/olive-and-vine/settings/payment-request";
    view.rerender(
      <SidebarProvider>
        <Page />
      </SidebarProvider>,
    );

    expect(menu()).not.toBeInTheDocument();
  });
});

describe("the menu's items", () => {
  it("lead where this app's host says, all on the Petty Cash origin", async () => {
    show();
    await openMenu();

    const nav = within(screen.getByRole("navigation", { name: "Main navigation" }));
    for (const name of ["Dashboard", "Reports"]) {
      const href = nav.getByRole("link", { name }).getAttribute("href")!;
      expect(href.startsWith(env.PETTY_CASH_URL)).toBe(true);
      expect(href).toContain("/enter");
    }
  });

  it("keep Settings inside this app - Settings opens the settings of the app it is pressed in", async () => {
    show();
    await openMenu();

    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      "/entity/360812e1/olive-and-vine/settings/payment-request",
    );
  });

  it("group the two modules separately", async () => {
    show();
    await openMenu();

    expect(screen.getByRole("group", { name: "Petty Cash" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Payment Request" })).toBeInTheDocument();
  });

  it("drop the Petty Cash group when the company has not got that module", async () => {
    setAuth(unsignedToken({ petty_cash_enabled: false }), ENTITY_ID, ENTITY_NAME);

    show();
    await openMenu();

    expect(screen.queryByRole("group", { name: "Petty Cash" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Payment Request" })).toBeInTheDocument();
  });

  it("offer a way out", async () => {
    show();
    await openMenu();

    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
  });
});

describe("My Profile", () => {
  it("opens in the drawer when the shell filled the slot", async () => {
    show({ profile: <p>Olive Vine</p> });

    await userEvent.click(screen.getByRole("button", { name: "OV" }));

    expect(profilePanel()).toBeInTheDocument();
    expect(screen.getByText("Olive Vine")).toBeInTheDocument();
    expect(menu()).not.toBeInTheDocument();
  });

  it("has its own close wording, so a reader knows which view is shutting", async () => {
    show({ profile: <p>Olive Vine</p> });
    await userEvent.click(screen.getByRole("button", { name: "OV" }));

    expect(screen.getByRole("button", { name: "Close My Profile" })).toBeInTheDocument();
  });

  it("is reachable from the menu, and the menu is reachable back", async () => {
    show({ profile: <p>Olive Vine</p> });
    await openMenu();

    await userEvent.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("button", { name: /Olive|OV|My Profile/ }));
    expect(profilePanel()).toBeInTheDocument();
  });

  it("is not offered FROM THE MENU when the shell left the slot empty", async () => {
    // `canOpenProfile` is how the drawer says whether My Profile lives in here; the header's
    // initials read it and go to Minty's profile router instead (components/ui/ViewerBadge).
    show();
    await openMenu();

    const sideMenu = within(screen.getByRole("navigation", { name: "Main navigation" }));
    expect(sideMenu.queryByRole("button", { name: /My Profile/ })).not.toBeInTheDocument();
  });

  // CHARACTERISATION: `openProfile()` is not itself guarded, so calling it with no profile in
  // the slot opens the drawer on an EMPTY panel. Nothing does that today - every caller checks
  // `canOpenProfile` first - but the drawer does not refuse it.
  it("opens an empty panel if something calls openProfile with no profile to show", async () => {
    show();

    await userEvent.click(screen.getByRole("button", { name: "OV" }));

    expect(profilePanel()).toBeInTheDocument();
    expect(profilePanel()).toBeEmptyDOMElement();
  });
});
