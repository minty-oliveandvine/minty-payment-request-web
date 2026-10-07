// The subscription notice (components/SubscriptionNoticeModal.tsx).
//
// Two rules carry the component. Every applicable item is shown, not just the worst, because a
// company can be past due on one module and winding down another. And only the payer gets a
// button, because the server refuses everybody else - so for anyone else the dialog names who
// to ask rather than offering a click that fails.
//
// e2e/13_subscription_notice.spec.ts covers the once-per-sign-in behaviour around it.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SubscriptionNoticeModal } from "@/components/SubscriptionNoticeModal";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import type { SubscriptionNotice, SubscriptionNoticeItem } from "@/lib/subscriptionNotice";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

const onClose = vi.fn();

const item = (overrides: Partial<SubscriptionNoticeItem> = {}): SubscriptionNoticeItem => ({
  kind: "past_due",
  severity: "critical",
  module: "Payment Request",
  module_code: "PAYMENT_REQUEST",
  title: "A payment did not go through",
  detail: "Update the card to keep using Payment Request.",
  deadline: "2026-10-21",
  ...overrides,
});

const notice = (overrides: Partial<SubscriptionNotice> = {}): SubscriptionNotice => ({
  items: [item()],
  can_manage: true,
  payer: { name: "Olive Vine", email: "olive@minty.test" },
  severity: "critical",
  settings_path: "/entity/e1/settings/modules",
  ...overrides,
});

const show = (value: SubscriptionNotice | null) =>
  render(<SubscriptionNoticeModal notice={value} onClose={onClose} />);

const dialog = () => screen.getByRole("alertdialog");

beforeEach(() => {
  setAuth(unsignedToken(), ENTITY_ID, ENTITY_NAME);
});

describe("when there is nothing to say", () => {
  it("draws nothing for no notice at all", () => {
    show(null);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("draws nothing for a notice with no items", () => {
    show(notice({ items: [] }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("the dialog", () => {
  it("is a modal alert dialog, headed by how serious it is", () => {
    show(notice());

    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(dialog()).toHaveAccessibleName("Action needed");
  });

  it("reads less alarmingly when nothing is critical", () => {
    show(notice({ severity: "warning", items: [item({ severity: "warning", kind: "pending_cancel" })] }));

    expect(dialog()).toHaveAccessibleName("Your subscription");
  });

  it("shows every item, not just the worst", () => {
    show(
      notice({
        items: [
          item({ title: "A payment did not go through" }),
          item({
            kind: "pending_cancel",
            severity: "warning",
            module_code: "PETTY_CASH",
            module: "Petty Cash",
            title: "Petty Cash ends on 21 Oct",
            detail: "It stays available until then.",
          }),
        ],
      }),
    );

    const items = within(dialog()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("A payment did not go through");
    expect(items[1]).toHaveTextContent("Petty Cash ends on 21 Oct");
  });

  it("shows each item's own words, title and detail", () => {
    show(notice());

    expect(within(dialog()).getByText("A payment did not go through")).toBeInTheDocument();
    expect(
      within(dialog()).getByText("Update the card to keep using Payment Request."),
    ).toBeInTheDocument();
  });

  it("closes on Dismiss, on Escape and on the backdrop", async () => {
    show(notice());

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("holds the page still while it is open", () => {
    const root = document.createElement("div");
    root.id = "app-scroll-root";
    document.body.appendChild(root);
    try {
      const view = show(notice());
      expect(root.style.overflow).toBe("hidden");
      view.unmount();
      expect(root.style.overflow).not.toBe("hidden");
    } finally {
      root.remove();
    }
  });
});

describe("the payer", () => {
  it("is sent to Minty's subscription settings, through /enter", () => {
    show(notice());

    const action = screen.getByRole("link", { name: "Go to subscription settings" });
    const url = new URL(action.getAttribute("href")!);

    expect(url.origin).toBe(env.PETTY_CASH_URL);
    expect(url.pathname).toBe(`/entity/${ENTITY_ID}/enter`);
    expect(url.searchParams.get("next")).toBe("/entity/e1/settings/modules");
  });

  it("is offered nothing when the server named no settings page", () => {
    show(notice({ settings_path: null }));

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });
});

describe("anyone who is not the payer", () => {
  it("gets no button, because the server would refuse the click", () => {
    show(notice({ can_manage: false }));

    expect(screen.queryByRole("link", { name: "Go to subscription settings" })).not.toBeInTheDocument();
  });

  it("is told who to ask, by name and address", () => {
    show(notice({ can_manage: false }));

    expect(
      within(dialog()).getByText(/managed by Olive Vine <olive@minty.test> — only/),
    ).toBeInTheDocument();
  });

  it("is told the address alone when there is no name", () => {
    show(notice({ can_manage: false, payer: { name: "", email: "olive@minty.test" } }));

    expect(within(dialog()).getByText(/managed by olive@minty.test — only/)).toBeInTheDocument();
  });

  it("is told nothing extra when the server named no payer", () => {
    show(notice({ can_manage: false, payer: null }));

    expect(within(dialog()).queryByText(/managed by/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });
});
