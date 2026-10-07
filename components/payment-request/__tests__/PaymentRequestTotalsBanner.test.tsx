// The totals above the list (components/payment-request/PaymentRequestTotalsBanner.tsx).
//
// The rule that matters is that HKD is never silently added to USD: the figures are summed per
// currency, and a mixed set labels each group rather than producing one meaningless number.

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PaymentRequestTotalsBanner } from "@/components/payment-request/PaymentRequestTotalsBanner";
import { billRow } from "@/lib/__fixtures__/bills";

const hkd = (invoice: string, unpaid: string, id: string) =>
  billRow({ id, currencyCode: "HKD", invoiceTotal: invoice, unpaidAmount: `HK$ ${unpaid}` });

const show = (props: Partial<Parameters<typeof PaymentRequestTotalsBanner>[0]> = {}) =>
  render(<PaymentRequestTotalsBanner allRows={[]} selectedRows={[]} {...props} />);

const banner = () => within(screen.getByRole("status"));
const figureFor = (label: string) => banner().getByText(label).nextElementSibling?.textContent;

describe("with no rows at all", () => {
  it("still draws a zeroed box rather than collapsing to nothing", () => {
    show();

    expect(figureFor("Total unpaid amount")).toBe("0.00");
    expect(figureFor("Total invoice amount")).toBe("0.00");
  });
});

describe("one currency", () => {
  const rows = [hkd("6,000.00", "6,000.00", "a"), hkd("1,500.50", "500.50", "b")];

  it("adds both figures across every filtered row", () => {
    show({ allRows: rows });

    expect(figureFor("Total unpaid amount")).toBe("6,500.50");
    expect(figureFor("Total invoice amount")).toBe("7,500.50");
  });

  it("names no currency, because there is only the one", () => {
    show({ allRows: rows });

    expect(banner().queryByText("HKD")).not.toBeInTheDocument();
  });

  it("reads a blank amount as nothing rather than breaking the sum", () => {
    show({ allRows: [hkd("6,000.00", "6,000.00", "a"), billRow({ id: "b", invoiceTotal: "", unpaidAmount: "" })] });

    expect(figureFor("Total unpaid amount")).toBe("6,000.00");
  });
});

describe("a selection", () => {
  const rows = [hkd("6,000.00", "6,000.00", "a"), hkd("1,000.00", "1,000.00", "b")];

  it("switches both figures to the checked rows, and says so", () => {
    show({ allRows: rows, selectedRows: [rows[1]] });

    expect(figureFor("Selected total unpaid amount")).toBe("1,000.00");
    expect(figureFor("Selected total invoice amount")).toBe("1,000.00");
    expect(banner().queryByText("Total unpaid amount")).not.toBeInTheDocument();
  });

  it("hides the date range while rows are checked", () => {
    show({ allRows: rows, selectedRows: [rows[0]], startDate: "2026-08-10", endDate: "2026-08-17" });

    expect(banner().queryByText(/10 Aug 2026/)).not.toBeInTheDocument();
  });
});

describe("the date range", () => {
  it("reads as both ends when both are set", () => {
    show({ allRows: [], startDate: "2026-08-10", endDate: "2026-08-17" });

    expect(banner().getByText("10 Aug 2026 - 17 Aug 2026")).toBeInTheDocument();
  });

  it("reads as the one end that is set", () => {
    show({ allRows: [], startDate: "2026-08-10" });
    expect(banner().getByText("From 10 Aug 2026")).toBeInTheDocument();
  });

  it("reads as the other end that is set", () => {
    show({ allRows: [], endDate: "2026-08-17" });
    expect(banner().getByText("Until 17 Aug 2026")).toBeInTheDocument();
  });

  it("falls back to the raw value for a date it cannot format", () => {
    show({ allRows: [], startDate: "2026-02-30" });
    expect(banner().getByText("From 2026-02-30")).toBeInTheDocument();
  });
});

describe("several currencies", () => {
  const rows = [
    hkd("1,000.00", "1,000.00", "hk"),
    billRow({ id: "us", currencyCode: "USD", invoiceTotal: "500.00", unpaidAmount: "US$ 500.00" }),
  ];

  it("never adds one currency to another", () => {
    show({ allRows: rows });

    // Two labelled groups, not one 1,500 figure.
    expect(banner().getByText("HKD")).toBeInTheDocument();
    expect(banner().getByText("USD")).toBeInTheDocument();
    expect(banner().queryByText("1,500.00")).not.toBeInTheDocument();
  });

  it("leads with the largest unpaid total, matching the headline figure", () => {
    show({ allRows: rows });

    const labels = banner().getAllByText(/^(HKD|USD)$/).map((el) => el.textContent);
    expect(labels).toEqual(["HKD", "USD"]);
  });

  it("treats a row with no currency code as HKD", () => {
    show({ allRows: [billRow({ id: "x", currencyCode: undefined, invoiceTotal: "10.00", unpaidAmount: "10.00" })] });

    expect(figureFor("Total unpaid amount")).toBe("10.00");
    expect(banner().queryByText("HKD")).not.toBeInTheDocument();
  });

  it("collapses past the second group into a +N more line", () => {
    show({
      allRows: [
        ...rows,
        billRow({ id: "gb", currencyCode: "GBP", invoiceTotal: "1.00", unpaidAmount: "1.00" }),
      ],
    });

    expect(banner().getByText("+1 more currency")).toBeInTheDocument();
    expect(banner().queryByText("GBP")).not.toBeInTheDocument();
  });

  it("pluralises that line", () => {
    show({
      allRows: [
        ...rows,
        billRow({ id: "gb", currencyCode: "GBP", invoiceTotal: "1.00", unpaidAmount: "1.00" }),
        billRow({ id: "jp", currencyCode: "JPY", invoiceTotal: "1.00", unpaidAmount: "1.00" }),
      ],
    });

    expect(banner().getByText("+2 more currencies")).toBeInTheDocument();
  });
});

describe("the box itself", () => {
  it("is announced politely, so a changed total is read without stealing focus", () => {
    show();

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
