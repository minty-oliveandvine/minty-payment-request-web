// The list page's header (app/entity/[ref]/[slug]/payment-request/page.tsx): ONE Primary -
// "Add payment request", a link to the Add page (Part 15.2 / 15.16) - and who may follow it.
// The list itself is PaymentRequestView's and is tested there; it is stubbed here.

import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/Toast";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";

import Home from "../page";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

vi.mock("next/navigation", () => ({
  useParams: () => ({ ref: "360812e1", slug: "olive-and-vine" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/entity/360812e1/olive-and-vine/payment-request",
}));
vi.mock("@/components/ModuleGate", () => ({
  ModuleGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/payment-request", () => ({ PaymentRequestView: () => <p>the list</p> }));
vi.mock("@/components/SubscriptionNoticeModal", () => ({ SubscriptionNoticeModal: () => null }));
vi.mock("@/components/ui/NavMenu", () => ({ NavMenu: () => null }));
vi.mock("@/components/ui/ViewerBadge", () => ({ ViewerBadge: () => null }));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ member_entity_ids: [ENTITY_ID] }), { status: 200 }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const show = () =>
  render(
    <ToastProvider>
      <Home />
    </ToastProvider>,
  );

describe("the list page's header", () => {
  it("names the page once, as its only h1", () => {
    setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
    show();
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "Payment Requests",
    ]);
  });

  it("offers a member the Add page", async () => {
    setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
    show();
    expect(await screen.findByRole("link", { name: "Add payment request" })).toHaveAttribute(
      "href",
      "/entity/360812e1/olive-and-vine/payment-request/new",
    );
  });

  it("is dead for somebody with no role on the company", async () => {
    setAuth(unsignedToken({ role: "" }), ENTITY_ID, ENTITY_NAME);
    show();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add payment request" })).toBeDisabled(),
    );
    expect(screen.queryByRole("link", { name: "Add payment request" })).not.toBeInTheDocument();
  });

  it("is dead, with the reason beside it, for a view-only superuser", async () => {
    setAuth(
      unsignedToken({ role: "admin", system_role: "superadmin", is_view_only: true }),
      ENTITY_ID,
      ENTITY_NAME,
    );
    show();
    const button = await screen.findByRole("button", { name: "Add payment request" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute(
      "title",
      "Hmm, I can't let you in there. You have view-only access.",
    );
    expect(
      screen.getByText("You have view-only access, so nothing can be added here."),
    ).toBeInTheDocument();
  });
});
