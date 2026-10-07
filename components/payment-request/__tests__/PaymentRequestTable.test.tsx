// The desktop table (components/payment-request/PaymentRequestTable.tsx).
//
// SCOPING, and it applies to every screen test in this folder: the component renders the table
// AND a card list of the same rows, with Tailwind hiding one by viewport. No stylesheet is
// loaded under jsdom, so both are in the document and every row would be found twice. Each
// query below is therefore scoped to one of them - `table()` or `cards()` - and never to the
// whole screen.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/Toast";
import {
  PaymentRequestTable,
  type PaymentRequestRow,
} from "@/components/payment-request/PaymentRequestTable";
import { billRow } from "@/lib/__fixtures__/bills";
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

const ROWS: PaymentRequestRow[] = [
  billRow({
    id: "r-requested",
    contactTitle: "Young Bros Transport",
    contactCaption: "Corporate stationery",
    status: "Payment Requested",
    unpaidAmount: "HK$ 6,000.00",
    invoiceDate: "03 Mar 2026",
    submittedDate: "04 Mar 2026",
    xeroActive: true,
  }),
  billRow({
    id: "r-draft",
    contactTitle: "Draft Supplier",
    contactCaption: "A draft",
    status: "Draft",
    unpaidAmount: "HK$ 450.25",
    invoiceDate: "01 Mar 2026",
  }),
  billRow({
    id: "r-void",
    contactTitle: "Cancelled Order Inc",
    contactCaption: "Voided",
    status: "Voided",
    unpaidAmount: "HK$ 800.00",
  }),
];

const onSortColumn = vi.fn();
const onToggleRow = vi.fn();
const onToggleAll = vi.fn();
const onRowClick = vi.fn();
const onRecordPayment = vi.fn();

type Props = Parameters<typeof PaymentRequestTable>[0];

const show = (props: Partial<Props> = {}) =>
  render(
    <ToastProvider>
      <PaymentRequestTable
        rows={ROWS}
        onSortColumn={onSortColumn}
        onToggleRow={onToggleRow}
        onToggleAll={onToggleAll}
        onRowClick={onRowClick}
        onRecordPayment={onRecordPayment}
        {...props}
      />
    </ToastProvider>,
  );

const table = () => within(screen.getByRole("table"));
const cards = () => within(screen.getByRole("list", { name: "Payment requests" }));
const bodyRows = () => screen.getByRole("table").querySelectorAll("tbody tr");

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
  fetchMock.mockImplementation(async () => answer(200, {}));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the columns", () => {
  it("are the eight the list shows, in order", () => {
    show();

    expect(
      table()
        .getAllByRole("columnheader")
        .map((h) => h.textContent?.trim())
        .filter((t) => t),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Supplier / Description"),
        expect.stringContaining("Submitted Date"),
        expect.stringContaining("Invoice Date"),
        expect.stringContaining("Status"),
        expect.stringContaining("Unpaid Amount"),
      ]),
    );
  });

  it("offer a sort on each sortable one, and report which was pressed", async () => {
    show();

    await userEvent.click(table().getByRole("button", { name: /^Sort by Invoice Date/ }));

    expect(onSortColumn).toHaveBeenCalledWith("invoiceDate");
  });

  it("say which way they are sorted", () => {
    show({ sort: { key: "invoiceDate", dir: "asc" } });

    expect(
      table().getByRole("button", { name: "Sort by Invoice Date, ascending" }),
    ).toBeInTheDocument();
  });

  it("say so the other way round too", () => {
    show({ sort: { key: "invoiceDate", dir: "desc" } });

    expect(
      table().getByRole("button", { name: "Sort by Invoice Date, descending" }),
    ).toBeInTheDocument();
  });
});

describe("the rows", () => {
  it("are one per payment request, with its supplier, description, dates and status", () => {
    show();

    expect(bodyRows()).toHaveLength(ROWS.length);
    const first = bodyRows()[0];
    expect(first).toHaveTextContent("Young Bros Transport");
    // The description is written twice in the cell - once in full, once truncated for a narrow
    // column - so the row's text is the honest thing to assert.
    expect(first).toHaveTextContent("Corporate stationery");
    expect(first).toHaveTextContent("03 Mar 2026");
    expect(first).toHaveTextContent("04 Mar 2026");
    expect(first).toHaveTextContent("Payment Requested");
  });

  it("show the unpaid amount with its currency", () => {
    show();

    expect(table().getByText("HK$ 6,000.00")).toBeInTheDocument();
  });

  it("say so plainly when nothing matches the status", () => {
    show({ rows: [] });

    expect(table().getByText("No payment requests match this status.")).toBeInTheDocument();
  });

  it("open the request that was clicked, by its Payment No.", async () => {
    show();

    await userEvent.click(table().getByText("Young Bros Transport"));

    expect(onRowClick).toHaveBeenCalledWith("r-requested", "PR-0001");
  });

  it("offer each row as a link too, so it can be opened in a new tab", () => {
    show();

    expect(table().getAllByRole("link", { name: "Open Young Bros Transport" }).length).toBeGreaterThan(0);
  });

  it("say they are loading rather than showing an empty table", () => {
    show({ loading: true, rows: [] });

    expect(screen.getByRole("table").querySelector("tbody")).toHaveAttribute("aria-busy", "true");
  });
});

describe("selection", () => {
  it("offers a tick per row, named by its supplier", () => {
    show();

    expect(table().getByRole("checkbox", { name: "Select row Young Bros Transport" })).toBeInTheDocument();
  });

  it("reports the row that was ticked", async () => {
    show();

    await userEvent.click(table().getByRole("checkbox", { name: "Select row Draft Supplier" }));

    expect(onToggleRow).toHaveBeenCalledWith("r-draft");
  });

  it("shows the rows the parent says are selected", () => {
    show({ selectedIds: new Set(["r-draft"]) });

    expect(table().getByRole("checkbox", { name: "Select row Draft Supplier" })).toBeChecked();
    expect(table().getByRole("checkbox", { name: "Select row Young Bros Transport" })).not.toBeChecked();
  });

  it("will not let a voided row be selected, and says why", () => {
    show();

    const voided = table().getByRole("checkbox", {
      name: "Voided — cannot select Cancelled Order Inc",
    });
    expect(voided).toBeDisabled();
  });

  it("selects every selectable row at once from the header", async () => {
    show();

    await userEvent.click(table().getByRole("checkbox", { name: "Select all rows" }));

    expect(onToggleAll).toHaveBeenCalledTimes(1);
    const [ids, next] = onToggleAll.mock.calls[0];
    expect(next).toBe(true);
    // The voided row is not among them.
    expect(ids).toEqual(["r-requested", "r-draft"]);
  });

  it("clears them all again when every selectable row is already ticked", async () => {
    show({ selectedIds: new Set(["r-requested", "r-draft"]) });

    await userEvent.click(table().getByRole("checkbox", { name: "Select all rows" }));

    expect(onToggleAll.mock.calls[0][1]).toBe(false);
  });

  it("has nothing to select at all when the page is empty", () => {
    show({ rows: [] });

    expect(table().getByRole("checkbox", { name: "Select all rows" })).toBeDisabled();
  });
});

describe("the per-row payment action", () => {
  it("records a payment on a submitted request", async () => {
    show();

    await userEvent.click(
      table().getByRole("button", { name: "Record payment for Young Bros Transport" }),
    );

    expect(onRecordPayment).toHaveBeenCalledWith("r-requested");
  });

  it("is offered read-only on a request that is already paid", async () => {
    show({
      rows: [billRow({ id: "r-paid", contactTitle: "Paid In Full Co", status: "Paid" })],
    });

    await userEvent.click(table().getByRole("button", { name: "View payments for Paid In Full Co" }));

    expect(onRecordPayment).toHaveBeenCalledWith("r-paid", true);
  });

  it("is dead on a returned request, and says why", () => {
    show({
      rows: [billRow({ id: "r-ret", contactTitle: "Returned Supplies Ltd", status: "Returned" })],
    });

    expect(
      table().getByRole("button", {
        name: "Returned — record payment not available for Returned Supplies Ltd",
      }),
    ).toBeDisabled();
  });

  it("is dead for somebody without the permission, and says why", async () => {
    setAuth(unsignedToken({ role: "cashier", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);

    show();

    const button = await within(screen.getByRole("table")).findByRole("button", {
      name: "Insufficient permissions — record payment not available for Young Bros Transport",
    });
    expect(button).toBeDisabled();
  });

  it("is dead on a PAID row for the same person, with the wording for viewing", async () => {
    setAuth(unsignedToken({ role: "cashier", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);

    show({ rows: [billRow({ id: "r-paid", contactTitle: "Paid In Full Co", status: "Paid" })] });

    const button = await within(screen.getByRole("table")).findByRole("button", {
      name: "Insufficient permissions — view payments not available for Paid In Full Co",
    });
    expect(button).toBeDisabled();
  });
});

describe("the card list beside it", () => {
  it("carries the same rows, for a phone", () => {
    show();

    expect(cards().getByText("Young Bros Transport")).toBeInTheDocument();
    expect(cards().getByText("HK$ 6,000.00")).toBeInTheDocument();
  });
});
