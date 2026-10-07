// Easy view - the same payment requests as cards instead of a table
// (components/payment-request/PaymentRequestEasyView.tsx).
//
// This is the one component in the repo that asks `matchMedia` a question, at
// PaymentRequestEasyView's `(max-width: 1023px)`, so these tests state the width they mean with
// `setViewportMatches` rather than leaving a blanket stub to pick a branch for them. See
// test/matchMedia.ts.
//
// Like the table, it draws two lists (a desktop one and a phone one) with Tailwind hiding one,
// so the sort controls appear twice under jsdom - hence `getAllByRole` where a count is not the
// point.

import { render, screen } from "@testing-library/react";
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
import { setViewportMatches } from "../../../test/matchMedia";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

vi.mock("next/navigation", () => ({
  useParams: () => ({ ref: "360812e1", slug: "olive-and-vine" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/PdfJsCanvasPreview", () => ({
  PdfJsCanvasPreview: () => <div>pdf preview</div>,
}));

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const ROWS: PaymentRequestRow[] = [
  billRow({
    id: "r-requested",
    contactTitle: "Young Bros Transport",
    contactCaption: "Corporate stationery",
    status: "Payment Requested",
    unpaidAmount: "HK$ 6,000.00",
  }),
  billRow({
    id: "r-draft",
    contactTitle: "Draft Supplier",
    contactCaption: "A draft",
    status: "Draft",
    unpaidAmount: "HK$ 450.25",
  }),
  billRow({
    id: "r-void",
    contactTitle: "Cancelled Order Inc",
    contactCaption: "Voided",
    status: "Voided",
    unpaidAmount: "HK$ 800.00",
  }),
];

const onSortChange = vi.fn<(key: EasyViewSortKey) => void>();
const onToggleRow = vi.fn();
const onToggleAll = vi.fn();
const onRowClick = vi.fn();

type Props = Parameters<typeof PaymentRequestEasyView>[0];

const show = (props: Partial<Props> = {}) =>
  render(
    <ToastProvider>
      <PaymentRequestEasyView
        rows={ROWS}
        loading={false}
        activeStatuses={[]}
        sort={{ key: "contact", dir: "asc" }}
        onSortChange={onSortChange}
        selectedIds={new Set()}
        onToggleRow={onToggleRow}
        onToggleAll={onToggleAll}
        onRowClick={onRowClick}
        payPanelBillId={null}
        payPanel={null}
        selectedBillId={null}
        invoiceAttachments={[]}
        invoiceAttachmentsLoading={false}
        onPaymentRequestedPay={vi.fn()}
        onPaidStatusOpen={vi.fn()}
        onOpenBankSlipUpload={vi.fn()}
        draftDetailBillId={null}
        onDraftBillOpen={vi.fn()}
        draftDetailActions={{ onRequestDelete: vi.fn(), deleteDisabled: false }}
        isElevated
        isViewOnly={false}
        {...props}
      />
    </ToastProvider>,
  );

const sortControl = (name: RegExp) => screen.getAllByRole("button", { name })[0];

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
  fetchMock.mockImplementation(async () => answer(200, {}));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the cards", () => {
  it("are one per payment request, with its supplier, description, status and amount", () => {
    show();

    expect(screen.getAllByText("Young Bros Transport").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Corporate stationery").length).toBeGreaterThan(0);
    expect(screen.getAllByText("HK$ 6,000.00").length).toBeGreaterThan(0);
    // The status is an ACTION here rather than a label: a submitted request offers "Pay",
    // where the table would print "Payment Requested".
    expect(screen.getAllByRole("button", { name: "Pay" }).length).toBeGreaterThan(0);
    // A voided one has nothing to do, so it reads as its status.
    expect(screen.getAllByText("Voided").length).toBeGreaterThan(0);
  });

  it("show the same rows the table would", () => {
    show();

    for (const row of ROWS) {
      expect(screen.getAllByText(row.contactTitle).length).toBeGreaterThan(0);
    }
  });

  // CHARACTERISATION: `onRowClick` is declared, destructured, and never called - easy view
  // opens a request INLINE (the pay panel, the draft card) instead of navigating to its page.
  // PaymentRequestView still hands it a `router.push`, which nothing can reach; ESLint already
  // flags the unused binding. Pinned so a later clean-up is a deliberate one.
  it("never calls onRowClick - a card opens in place, it does not navigate", async () => {
    show();

    await userEvent.click(screen.getAllByText("Young Bros Transport")[0]);

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("draw nothing but their frame when there is nothing to show", () => {
    show({ rows: [] });

    expect(screen.queryByText("Young Bros Transport")).not.toBeInTheDocument();
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

    await userEvent.click(sortControl(name as RegExp));

    expect(onSortChange).toHaveBeenCalledWith(key);
  });

  it("says which way the open column is sorted", () => {
    show({ sort: { key: "contact", dir: "asc" } });

    expect(screen.getAllByRole("button", { name: /Sort by supplier, ascending/ }).length).toBeGreaterThan(0);
  });

  it("says so the other way round", () => {
    show({ sort: { key: "contact", dir: "desc" } });

    expect(screen.getAllByRole("button", { name: /Sort by supplier, descending/ }).length).toBeGreaterThan(0);
  });

  it("offers only the four keys easy view sorts by", () => {
    show();

    // No invoice-date or paid-date sort here: the cards do not show those columns.
    expect(screen.queryByRole("button", { name: /Sort by invoice date/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sort by paid date/ })).not.toBeInTheDocument();
  });
});

describe("selection", () => {
  it("reports the row that was ticked", async () => {
    show();

    await userEvent.click(screen.getAllByRole("checkbox", { name: /Select row Draft Supplier/ })[0]);

    expect(onToggleRow).toHaveBeenCalledWith("r-draft");
  });

  it("shows what the parent says is selected - the selection is shared with the table", () => {
    show({ selectedIds: new Set(["r-draft"]) });

    expect(screen.getAllByRole("checkbox", { name: /Select row Draft Supplier/ })[0]).toBeChecked();
  });

  it("selects every selectable row at once, leaving a voided one out", async () => {
    show();

    await userEvent.click(screen.getAllByRole("checkbox", { name: "Select all rows" })[0]);

    expect(onToggleAll).toHaveBeenCalledTimes(1);
    const [ids, next] = onToggleAll.mock.calls[0];
    expect(next).toBe(true);
    expect(ids).not.toContain("r-void");
  });
});

describe("the width it is drawn at", () => {
  // The branch at PaymentRequestEasyView's `(max-width: 1023px)`: on a narrow screen the
  // invoice panel is never offset, because it is not beside the list at all.
  it("renders the cards on a phone", () => {
    setViewportMatches(360);

    show({ selectedBillId: "r-requested" });

    expect(screen.getAllByText("Young Bros Transport").length).toBeGreaterThan(0);
  });

  it("renders the cards on a desktop, with the invoice panel beside them", () => {
    setViewportMatches(1440);

    show({ selectedBillId: "r-requested", invoiceAttachments: [] });

    expect(screen.getAllByText("Young Bros Transport").length).toBeGreaterThan(0);
  });

  it("survives a width the stub has to evaluate either way", () => {
    for (const width of [360, 768, 1023, 1024, 1440]) {
      setViewportMatches(width);
      const view = show();
      expect(screen.getAllByText("Young Bros Transport").length).toBeGreaterThan(0);
      view.unmount();
    }
  });
});

describe("the slots the list fills", () => {
  it("draws the totals banner it is handed", () => {
    show({ totalsBanner: <p>The totals</p> });

    expect(screen.getByText("The totals")).toBeInTheDocument();
  });

  it("draws the pager it is handed", () => {
    show({ pagination: <p>The pager</p> });

    expect(screen.getByText("The pager")).toBeInTheDocument();
  });

  it("draws the payment panel for the row it was opened on", () => {
    show({ payPanelBillId: "r-requested", payPanel: <p>Record a payment here</p> });

    expect(screen.getByText("Record a payment here")).toBeInTheDocument();
  });
});

describe("while it is loading", () => {
  it("draws a skeleton in place of the cards", () => {
    show({ rows: [], loading: true });

    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  // CHARACTERISATION and a small a11y gap: the skeleton is `aria-hidden`, so unlike the table -
  // which marks its tbody `aria-busy` - a screen reader is told nothing at all while the list
  // loads. Pinned, not fixed.
  it("hides that skeleton from a screen reader, announcing nothing", () => {
    show({ rows: [], loading: true });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-hidden='true'] .animate-pulse")).not.toBeNull();
  });
});
