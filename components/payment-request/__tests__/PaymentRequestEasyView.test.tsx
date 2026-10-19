// Easy view - the payment requests as Part 14 Record rows (Part 15.4 / 15.17)
// (components/payment-request/PaymentRequestEasyView.tsx).
//
// What a row promises: the supplier opens the request at its own address; the amount is plain
// text; the status is a PILL in its Part 13 tone (never a "Pay" button in the Status column); and
// there is exactly one next action, chosen by the status × action matrix (lib/requestActions.ts).

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/Toast";
import {
  PaymentRequestEasyView,
  type EasyViewSortKey,
} from "@/components/payment-request/PaymentRequestEasyView";
import type { PaymentRequestRow } from "@/components/payment-request/PaymentRequestTable";
import { billRow } from "@/lib/__fixtures__/bills";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

vi.mock("next/navigation", () => ({
  useParams: () => ({ ref: "360812e1", slug: "olive-and-vine" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const ROWS: PaymentRequestRow[] = [
  billRow({
    id: "r-requested",
    reference: "PR-0001",
    contactTitle: "Young Bros Transport",
    contactCaption: "Corporate stationery",
    status: "Payment Requested",
    unpaidAmount: "HK$ 6,000.00",
  }),
  billRow({ id: "r-part", contactTitle: "Half Paid Ltd", status: "Partially Paid", unpaidAmount: "HK$ 300.00" }),
  billRow({ id: "r-paid", contactTitle: "All Square Co", status: "Paid", unpaidAmount: "HK$ 0.00" }),
  billRow({ id: "r-draft", contactTitle: "Draft Supplier", status: "Draft", unpaidAmount: "HK$ 450.25" }),
  billRow({ id: "r-void", contactTitle: "Cancelled Order Inc", status: "Voided", unpaidAmount: "HK$ 800.00" }),
];

const onSortChange = vi.fn<(key: EasyViewSortKey) => void>();
const onToggleRow = vi.fn();
const onToggleAll = vi.fn();
const onRecordPayment = vi.fn();

type Props = Parameters<typeof PaymentRequestEasyView>[0];

const show = (props: Partial<Props> = {}) =>
  render(
    <ToastProvider>
      <PaymentRequestEasyView
        rows={ROWS}
        loading={false}
        sort={{ key: "contact", dir: "asc" }}
        onSortChange={onSortChange}
        selectedIds={new Set()}
        onToggleRow={onToggleRow}
        onToggleAll={onToggleAll}
        onRecordPayment={onRecordPayment}
        onOpenBankSlipUpload={vi.fn()}
        isElevated
        isViewOnly={false}
        {...props}
      />
    </ToastProvider>,
  );

const row = (supplier: string) =>
  screen.getByRole("link", { name: supplier }).closest("li") as HTMLElement;

beforeEach(() => {
  setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a row", () => {
  it("opens the request at its own address from the supplier", () => {
    show();
    expect(screen.getByRole("link", { name: "Young Bros Transport" })).toHaveAttribute(
      "href",
      "/entity/360812e1/olive-and-vine/payment-request/PR-0001",
    );
  });

  it("shows the description and the amount as plain text", () => {
    show();
    const r = row("Young Bros Transport");
    expect(r).toHaveTextContent("Corporate stationery");
    expect(within(r).getByText("HK$ 6,000.00")).toHaveClass("text-text-primary", "tabular-nums");
  });

  it.each([
    ["Young Bros Transport", "Payment Requested", "info"],
    ["Half Paid Ltd", "Partially Paid", "warning"],
    ["All Square Co", "Paid", "success"],
    ["Draft Supplier", "Draft", "neutral"],
    ["Cancelled Order Inc", "Voided", "neutral"],
  ])("draws %s's status as a %s pill in the %s tone", (supplier, status, tone) => {
    show();
    expect(within(row(supplier)).getByText(status)).toHaveAttribute("data-tone", tone);
  });

  it("never offers a 'Pay' button in place of the status", () => {
    show();
    expect(screen.queryByRole("button", { name: "Pay" })).not.toBeInTheDocument();
  });
});

describe("the one next action (Part 15.17)", () => {
  it("records a payment on a request still to be paid, in the drawer", async () => {
    show();
    await userEvent.click(within(row("Young Bros Transport")).getByRole("button", { name: /Record payment/ }));
    expect(onRecordPayment).toHaveBeenCalledWith("r-requested", false);
  });

  it("views the payments of a paid one, read-only", async () => {
    show();
    await userEvent.click(within(row("All Square Co")).getByRole("button", { name: /View payments/ }));
    expect(onRecordPayment).toHaveBeenCalledWith("r-paid", true);
  });

  it("continues a draft and views a voided one, on its page", () => {
    show();
    expect(within(row("Draft Supplier")).getByRole("link", { name: /Continue/ })).toBeInTheDocument();
    expect(within(row("Cancelled Order Inc")).getByRole("link", { name: /View/ })).toBeInTheDocument();
  });

  it("offers no payment to someone who cannot make one", () => {
    show({ isElevated: false });
    expect(screen.queryByRole("button", { name: /Record payment/ })).not.toBeInTheDocument();
  });

  it("has exactly one action per row", () => {
    show();
    for (const r of screen.getAllByRole("listitem")) {
      const actions = within(r)
        .queryAllByRole("button")
        .concat(within(r).queryAllByRole("link"))
        .filter((el) => /Record payment|View payments|Continue|View —/.test(el.getAttribute("aria-label") ?? ""));
      expect(actions).toHaveLength(1);
    }
  });
});

describe("sorting", () => {
  it.each([
    [/Sort by supplier/, "contact"],
    [/Sort by submitted date/, "submittedDate"],
    [/Sort by status/, "status"],
    [/Sort by unpaid amount/, "unpaidAmount"],
  ])("reports %s as %s", async (name, key) => {
    show();
    await userEvent.click(screen.getByRole("button", { name: name as RegExp }));
    expect(onSortChange).toHaveBeenCalledWith(key);
  });

  it("says which way the open column is sorted", () => {
    show({ sort: { key: "contact", dir: "desc" } });
    expect(screen.getByRole("button", { name: /Sort by supplier, descending/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("selection", () => {
  it("reports the row that was ticked", async () => {
    show();
    await userEvent.click(screen.getByRole("checkbox", { name: /Select row Draft Supplier/ }));
    expect(onToggleRow).toHaveBeenCalledWith("r-draft");
  });

  it("shows what the parent says is selected - the selection is shared with the table", () => {
    show({ selectedIds: new Set(["r-draft"]) });
    expect(screen.getByRole("checkbox", { name: /Select row Draft Supplier/ })).toBeChecked();
  });

  it("selects every selectable row at once, leaving a voided one out", async () => {
    show();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
    const [ids, next] = onToggleAll.mock.calls[0];
    expect(next).toBe(true);
    expect(ids).not.toContain("r-void");
  });
});

describe("states (Part 15.11 / 15.17)", () => {
  it("shows five skeleton rows while loading, and says the list is busy", () => {
    show({ rows: [], loading: true });
    const busy = screen.getByRole("list", { name: "Loading payment requests" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy.querySelectorAll("li")).toHaveLength(5);
  });

  it("greets a first use with the one thing to do", () => {
    show({ rows: [], createAction: <a href="/new">Add payment request</a> });
    expect(screen.getByText("No payment requests yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add payment request" })).toBeInTheDocument();
  });

  it("offers to clear the filters when they matched nothing - and draws no character", async () => {
    const onClearFilters = vi.fn();
    show({ rows: [], filtered: true, onClearFilters });
    expect(screen.getByText("No payment requests match these filters.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClearFilters).toHaveBeenCalled();
  });

  // The totals banner moved out to the attention strip above the toolbar (PaymentRequestView),
  // drawn once for both views, so the list only takes the pager now.
  it("draws the pager it is handed", () => {
    show({ pagination: <p>The pager</p> });
    expect(screen.getByText("The pager")).toBeInTheDocument();
  });

  it("says in the row meta when an unpaid request is overdue or due this week - and nothing for a paid one", () => {
    show({
      todayIso: "2026-10-19",
      rows: [
        billRow({ id: "late", contactTitle: "Late Co", status: "Payment Requested", dueDateIso: "2026-10-16" }),
        billRow({ id: "soon", contactTitle: "Soon Co", status: "Partially Paid", dueDateIso: "2026-10-21" }),
        billRow({ id: "done", contactTitle: "Done Co", status: "Paid", dueDateIso: "2026-10-01" }),
      ],
    });
    const row = (id: string) => within(document.querySelector(`[data-easy-view-row="${id}"]`) as HTMLElement);
    expect(row("late").getByText("Overdue 3 days")).toBeInTheDocument();
    expect(row("soon").getByText("Due in 2 days")).toBeInTheDocument();
    expect(row("done").queryByText(/Overdue|Due /)).not.toBeInTheDocument();
  });
});

describe("a bank slip count that did not load", () => {
  it("offers a retry rather than nothing, and nothing while it is still loading", async () => {
    const onRetryBankSlips = vi.fn();
    show({
      rows: [
        billRow({ id: "e-fail", contactTitle: "Failed Lookup Co", status: "Payment Requested", bankslipState: "error" }),
        billRow({ id: "e-wait", contactTitle: "Still Loading Co", status: "Payment Requested", bankslipState: "loading" }),
      ],
      onRetryBankSlips,
    });

    await userEvent.click(screen.getByRole("button", { name: "Bank slips didn't load for Failed Lookup Co — try again" }));

    expect(onRetryBankSlips).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Still Loading Co — try again/ })).not.toBeInTheDocument();
  });
});
