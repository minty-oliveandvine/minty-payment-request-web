// The list's toolbar (components/payment-request/PaymentRequestToolbar.tsx): the status tabs,
// the search box's two modes, the advanced filter panel and the bulk-actions menu.
//
// Two of the thirteen set-state-in-effect sites are in this file - the filter draft re-seeded
// when the panel opens, and the bulk menu closing when it is disabled while open. Both are
// asserted through what is ON SCREEN (the field values, the menu's presence) and never through
// a render count or an effect's timing, so the refactor can change how they happen.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/Toast";
import {
  DEFAULT_FILTER_DATE_TYPE,
  PAYMENT_REQUEST_STATUS_FILTERS,
  PaymentRequestToolbar,
} from "@/components/payment-request/PaymentRequestToolbar";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

vi.mock("next/navigation", () => ({
  useParams: () => ({ ref: "360812e1", slug: "olive-and-vine" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const onActiveStatusesChange = vi.fn();
const onSearchChange = vi.fn();
const onSearchSubmit = vi.fn();
const onApplyFilters = vi.fn();
const onBulkDeleteSelected = vi.fn();
const onBulkPublishSelected = vi.fn();

type Props = Parameters<typeof PaymentRequestToolbar>[0];

function show(props: Partial<Props> = {}) {
  return render(
    <ToastProvider>
      <PaymentRequestToolbar
        activeStatuses={[]}
        onActiveStatusesChange={onActiveStatusesChange}
        searchQuery=""
        onSearchChange={onSearchChange}
        onSearchSubmit={onSearchSubmit}
        bulkActionsEnabled={false}
        onApplyFilters={onApplyFilters}
        onBulkDeleteSelected={onBulkDeleteSelected}
        onBulkPublishSelected={onBulkPublishSelected}
        {...props}
      />
    </ToastProvider>,
  );
}

const tabs = () => within(screen.getByRole("tablist", { name: "Filter by status" }));
const openFilters = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Filter" }));
  return screen.getByRole("dialog", { name: "Filters" });
};
const bulkTrigger = () => screen.getByRole("button", { name: /^Bulk actions/ });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
  fetchMock.mockImplementation(async () => answer(200, {}));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the status tabs", () => {
  it("are the seven the list offers", () => {
    expect([...PAYMENT_REQUEST_STATUS_FILTERS]).toEqual([
      "All",
      "Payment Requested",
      "Partially Paid",
      "Returned",
      "Paid",
      "Draft",
      "Voided",
    ]);
  });

  it("are all on screen, in that order", () => {
    show();

    expect(tabs().getAllByRole("tab").map((t) => t.textContent)).toEqual([
      ...PAYMENT_REQUEST_STATUS_FILTERS,
    ]);
  });

  it("start on All when nothing is filtered", () => {
    show();

    expect(tabs().getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    expect(tabs().getByRole("tab", { name: "Draft" })).toHaveAttribute("aria-selected", "false");
  });

  it("mark the one that is filtered", () => {
    show({ activeStatuses: ["Draft"] });

    expect(tabs().getByRole("tab", { name: "Draft" })).toHaveAttribute("aria-selected", "true");
    expect(tabs().getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "false");
  });

  it("report the status that was picked", async () => {
    show();

    await userEvent.click(tabs().getByRole("tab", { name: "Paid" }));

    expect(onActiveStatusesChange).toHaveBeenCalledWith(["Paid"]);
  });

  it("report All as no filter at all", async () => {
    show({ activeStatuses: ["Paid"] });

    await userEvent.click(tabs().getByRole("tab", { name: "All" }));

    expect(onActiveStatusesChange).toHaveBeenCalledWith([]);
  });
});

describe("the search box", () => {
  it("reports every keystroke, for the contains match", async () => {
    show();

    await userEvent.type(screen.getByRole("searchbox"), "You");

    expect(onSearchChange).toHaveBeenCalledTimes(3);
    expect(onSearchChange).toHaveBeenLastCalledWith("u");
  });

  it("reports a submit separately, which is what narrows to an exact match", async () => {
    show({ searchQuery: "3000" });

    await userEvent.type(screen.getByRole("searchbox"), "{Enter}");

    expect(onSearchSubmit).toHaveBeenCalledTimes(1);
  });

  it("asks a phone keyboard for its Search key", () => {
    show();

    expect(screen.getByRole("searchbox")).toHaveAttribute("enterkeyhint", "search");
  });
});

describe("the filter panel", () => {
  it("opens on the filter button and shows every field", async () => {
    show();

    const panel = await openFilters();

    expect(within(panel).getByText("Amount")).toBeInTheDocument();
    expect(within(panel).getByText("Date Type")).toBeInTheDocument();
    expect(within(panel).getByText("Xero Status")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("opens showing the filters that are applied", async () => {
    show({ appliedMinAmount: "100.00", appliedMaxAmount: "900.00", appliedDateType: "Submitted Date" });

    const panel = await openFilters();

    expect(within(panel).getByDisplayValue("100.00")).toBeInTheDocument();
    expect(within(panel).getByDisplayValue("900.00")).toBeInTheDocument();
    expect(within(panel).getByText("Submitted Date")).toBeInTheDocument();
  });

  it("defaults the date type to invoice date", async () => {
    show();

    const panel = await openFilters();

    expect(DEFAULT_FILTER_DATE_TYPE).toBe("Invoice Date");
    expect(within(panel).getByText(DEFAULT_FILTER_DATE_TYPE)).toBeInTheDocument();
  });

  it("DISCARDS a draft that was abandoned, and shows the applied filters again next time", async () => {
    // The panel is an uncontrolled draft re-seeded from the applied filters each time it opens.
    show({ appliedMinAmount: "100.00" });
    const panel = await openFilters();
    const min = within(panel).getByDisplayValue("100.00");

    await userEvent.clear(min);
    await userEvent.type(min, "555");
    // Closed without applying.
    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument());

    const reopened = await openFilters();

    expect(within(reopened).getByDisplayValue("100.00")).toBeInTheDocument();
    expect(within(reopened).queryByDisplayValue("555")).not.toBeInTheDocument();
  });

  it("sends the draft on Apply", async () => {
    show();
    const panel = await openFilters();

    await userEvent.type(within(panel).getAllByPlaceholderText("0.00")[0], "100");
    await userEvent.click(within(panel).getByRole("button", { name: "Apply" }));

    expect(onApplyFilters).toHaveBeenCalledTimes(1);
    // Blurring the field on the way to Apply formats it, so the list is handed a grouped
    // two-decimal amount rather than the keystrokes.
    expect(onApplyFilters.mock.calls[0][0]).toMatchObject({ minAmount: "100.00" });
  });

  it("clears every field on Reset, and says so to the list", async () => {
    show({ appliedMinAmount: "100.00", appliedMaxAmount: "900.00", appliedXeroStatus: "published" });
    const panel = await openFilters();

    await userEvent.click(within(panel).getByRole("button", { name: "Reset" }));

    expect(onApplyFilters).toHaveBeenCalledTimes(1);
    expect(onApplyFilters.mock.calls[0][0]).toMatchObject({
      minAmount: "",
      maxAmount: "",
      xeroStatus: "",
    });
  });
});

describe("the bulk actions menu", () => {
  it("does not open while nothing is selected", async () => {
    show({ bulkActionsEnabled: false });

    expect(bulkTrigger()).toBeDisabled();
    await userEvent.click(bulkTrigger());

    expect(screen.queryByRole("menu", { name: "Bulk actions" })).not.toBeInTheDocument();
  });

  it("counts the selection in its own name", () => {
    show({ bulkActionsEnabled: true, bulkSelectedCount: 3 });

    expect(screen.getByRole("button", { name: "Bulk actions, 3 selected" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bulk actions, 3 selected" })).toHaveTextContent(
      "Bulk Actions (3)",
    );
  });

  it("opens with Void, and with Publish when publishing is allowed", async () => {
    show({ bulkActionsEnabled: true, bulkSelectedCount: 2, canPublish: true });

    await userEvent.click(bulkTrigger());

    const menu = screen.getByRole("menu", { name: "Bulk actions" });
    expect(within(menu).getByRole("menuitem", { name: "Publish" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Void" })).toBeInTheDocument();
  });

  it("offers no Publish when publishing is not allowed", async () => {
    show({ bulkActionsEnabled: true, bulkSelectedCount: 2, canPublish: false });

    await userEvent.click(bulkTrigger());

    const menu = screen.getByRole("menu", { name: "Bulk actions" });
    expect(within(menu).queryByRole("menuitem", { name: "Publish" })).not.toBeInTheDocument();
  });

  it("reports the action and closes", async () => {
    show({ bulkActionsEnabled: true, bulkSelectedCount: 2, canPublish: true });
    await userEvent.click(bulkTrigger());

    await userEvent.click(screen.getByRole("menuitem", { name: "Void" }));

    expect(onBulkDeleteSelected).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu", { name: "Bulk actions" })).not.toBeInTheDocument();
  });

  it("CLOSES when the selection is cleared while it is open", async () => {
    const view = show({ bulkActionsEnabled: true, bulkSelectedCount: 2, canPublish: true });
    await userEvent.click(bulkTrigger());
    expect(screen.getByRole("menu", { name: "Bulk actions" })).toBeInTheDocument();

    view.rerender(
      <ToastProvider>
        <PaymentRequestToolbar
          activeStatuses={[]}
          onActiveStatusesChange={onActiveStatusesChange}
          searchQuery=""
          onSearchChange={onSearchChange}
          bulkActionsEnabled={false}
          onApplyFilters={onApplyFilters}
          onBulkDeleteSelected={onBulkDeleteSelected}
          onBulkPublishSelected={onBulkPublishSelected}
        />
      </ToastProvider>,
    );

    await waitFor(() =>
      expect(screen.queryByRole("menu", { name: "Bulk actions" })).not.toBeInTheDocument(),
    );
  });
});

describe("Add Payment", () => {
  it("is offered to a member", () => {
    show();

    expect(screen.getByRole("button", { name: /Add Payment/ })).toBeEnabled();
  });

  it("is dead for somebody with no role on the company", () => {
    setAuth(unsignedToken({ role: "" }), ENTITY_ID, ENTITY_NAME);

    show();

    expect(screen.getByRole("button", { name: /Add Payment/ })).toBeDisabled();
  });

  it("is dead, with a reason, for a view-only superuser", async () => {
    setAuth(
      unsignedToken({ role: "admin", system_role: "superuser", is_view_only: true }),
      ENTITY_ID,
      ENTITY_NAME,
    );

    show();

    const button = screen.getByRole("button", { name: /Add Payment/ });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute(
      "title",
      "Hmm, I can't let you in there. You have view-only access.",
    );
  });
});
