// The module gate (components/ModuleGate.tsx): Minty's own refusal page, rendered on this side
// so being turned away feels like one product whichever half you were standing in.
//
// Two separate questions, and the file keeps them apart on purpose: WHETHER to refuse
// (the entitlement) and WHICH refusal (a member of a company that never bought the module needs
// "Module not active" and a way to fix it; somebody with no role at all needs "Access Denied",
// because the subscription page would refuse them too).
//
// Nothing here asserts the internal `resolved` flag, a null frame, or a render count - the
// pending useSyncExternalStore refactor changes exactly those.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ModuleGate, ModuleNotActive } from "@/components/ModuleGate";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const gate = () => render(<ModuleGate><p>The payment requests</p></ModuleGate>);

const page = () => screen.queryByText("The payment requests");
const refusal = (name: "Module not active" | "Access Denied") =>
  screen.queryByRole("heading", { level: 2, name });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a company that has the module", () => {
  it("shows the page, and never the refusal", async () => {
    setAuth(unsignedToken({ billing_enabled: true, role: "admin" }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValue(answer(200, { billing_enabled: true }));

    gate();

    expect(page()).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(refusal("Module not active")).not.toBeInTheDocument();
    expect(refusal("Access Denied")).not.toBeInTheDocument();
  });

  it("shows the page for a claim-less token - a stale token must not lock a customer out", async () => {
    setAuth(unsignedToken({ role: "admin" }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValue(answer(200, {}));

    gate();

    expect(page()).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(refusal("Module not active")).not.toBeInTheDocument();
  });

  it("reveals the page when the database says yes to a token that said no", async () => {
    setAuth(unsignedToken({ billing_enabled: false, role: "admin" }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValue(answer(200, { billing_enabled: true }));

    gate();

    await waitFor(() => expect(page()).toBeInTheDocument());
  });
});

describe("a member of a company without the module", () => {
  beforeEach(() => {
    setAuth(unsignedToken({ billing_enabled: false, role: "shop_manager" }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValue(answer(200, { billing_enabled: false }));
  });

  it("is told the module is not active, and not shown the page", async () => {
    gate();

    expect(await waitFor(() => refusal("Module not active"))).toBeInTheDocument();
    expect(page()).not.toBeInTheDocument();
    expect(refusal("Access Denied")).not.toBeInTheDocument();
  });

  it("is told it was probably switched off or has lapsed", async () => {
    gate();

    await waitFor(() => expect(refusal("Module not active")).toBeInTheDocument());
    expect(
      screen.getByText(/switched off, or its subscription has lapsed/),
    ).toBeInTheDocument();
  });

  it("is offered the subscription settings first, and the entity list second", async () => {
    gate();

    const check = await screen.findByRole("link", { name: /Check subscription settings/ });
    const back = screen.getByRole("link", { name: /Back to Entity List/ });

    // The order is Minty's own: the fixable action, then the way out.
    expect(check.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is sent to the subscription page through /enter, so the token buys a Flask session", async () => {
    gate();

    const check = await screen.findByRole("link", { name: /Check subscription settings/ });
    const url = new URL(check.getAttribute("href")!);

    expect(url.origin).toBe(env.PETTY_CASH_URL);
    expect(url.pathname).toBe(`/entity/${ENTITY_ID}/enter`);
    expect(url.searchParams.get("next")).toBe(`/entity/${ENTITY_ID}/settings/modules`);
  });

  it("is sent to Minty's entity list by the way out", async () => {
    gate();

    const back = await screen.findByRole("link", { name: /Back to Entity List/ });
    expect(back.getAttribute("href")).toBe(`${env.PETTY_CASH_URL}/entity`);
  });
});

describe("somebody with no role on the company at all", () => {
  beforeEach(() => {
    // Minty stamps "" for a user with no user_entity row.
    setAuth(unsignedToken({ billing_enabled: false, role: "" }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValue(answer(200, { billing_enabled: false }));
  });

  it("is told access is denied, not that a module is inactive", async () => {
    gate();

    expect(await waitFor(() => refusal("Access Denied"))).toBeInTheDocument();
    expect(refusal("Module not active")).not.toBeInTheDocument();
  });

  it("is offered ONLY the way out - the subscription page would refuse them too", async () => {
    gate();

    await waitFor(() => expect(refusal("Access Denied")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Check subscription settings/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Entity List/ })).toBeInTheDocument();
  });

  it("is told to contact an administrator", async () => {
    gate();

    await waitFor(() => expect(refusal("Access Denied")).toBeInTheDocument());
    expect(screen.getByText(/contact your\s+administrator/)).toBeInTheDocument();
  });
});

describe("ModuleNotActive on its own", () => {
  it("heads the page with the same words as the refusal it shows", () => {
    setAuth(unsignedToken({ role: "admin" }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValue(answer(200, {}));

    render(<ModuleNotActive />);

    expect(screen.getByRole("heading", { level: 1, name: "Module not active" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Module not active" })).toBeInTheDocument();
  });

  it("asks a member with no company in the cookie to ask an admin instead", async () => {
    render(<ModuleNotActive />);

    expect(await screen.findByText(/Ask an admin for this entity/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Check subscription settings/ })).not.toBeInTheDocument();
  });

  it("offers no subscription link to someone whose role is not a bill role", async () => {
    setAuth(unsignedToken({ role: "something_else" }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValue(answer(200, {}));

    render(<ModuleNotActive />);

    await waitFor(() => expect(screen.getByText(/Ask an admin for this entity/)).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Check subscription settings/ })).not.toBeInTheDocument();
  });

  it("offers it to a cashier - MODULE_VIEW starts there, so any member qualifies", async () => {
    setAuth(unsignedToken({ role: "cashier" }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValue(answer(200, {}));

    render(<ModuleNotActive />);

    expect(await screen.findByRole("link", { name: /Check subscription settings/ })).toBeInTheDocument();
  });

  it("says Access Denied in the permission variant, and offers only the way out", () => {
    setAuth(unsignedToken({ role: "admin" }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValue(answer(200, {}));

    render(<ModuleNotActive variant="permission" />);

    expect(screen.getByRole("heading", { level: 2, name: "Access Denied" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Check subscription settings/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Entity List/ })).toBeInTheDocument();
  });
});
