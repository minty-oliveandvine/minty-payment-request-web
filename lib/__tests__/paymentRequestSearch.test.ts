// What the search box matches (lib/paymentRequestSearch.ts). "contains" is what typing gives
// you; "exact" is what Enter (or a phone keyboard's Search key) switches to. The amounts in the
// fixture are the ones the module's own docstring reasons about.
//
// e2e/08_list_filters.spec.ts drives the same words through the browser.

import { describe, expect, it } from "vitest";

import { SEARCH_ROWS, billRow } from "@/lib/__fixtures__/bills";
import { normalizeAmountForSearch, rowMatchesSearch } from "@/lib/paymentRequestSearch";

const matching = (query: string, mode: "contains" | "exact") =>
  SEARCH_ROWS.filter((row) => rowMatchesSearch(row, query, mode)).map((row) => row.id);

describe("normalizeAmountForSearch", () => {
  it("keeps the digits and the decimal point, and nothing else", () => {
    expect(normalizeAmountForSearch("6,000.00")).toBe("6000.00");
    expect(normalizeAmountForSearch("HK$ 1,500.00")).toBe("1500.00");
    expect(normalizeAmountForSearch("3,000")).toBe("3000");
  });

  it("keeps the point so 3,000.00 never reads as 300000", () => {
    // Stripping to bare digits would make a query of 3000 match 300.00.
    expect(normalizeAmountForSearch("300.00")).not.toBe("30000");
    expect(normalizeAmountForSearch("300.00")).toBe("300.00");
  });
});

describe("rowMatchesSearch, contains mode", () => {
  it("matches every row for a blank query", () => {
    expect(matching("", "contains")).toHaveLength(SEARCH_ROWS.length);
    expect(matching("   ", "contains")).toHaveLength(SEARCH_ROWS.length);
  });

  it("3000 matches 3,000.00 and 13,000.50 but not 300.00", () => {
    const ids = matching("3000", "contains");
    expect(ids).toContain("r-3000");
    expect(ids).toContain("r-13000");
    expect(ids).not.toContain("r-300");
  });

  it("matches the supplier and the description, case-insensitively", () => {
    expect(rowMatchesSearch(billRow(), "young bros", "contains")).toBe(true);
    expect(rowMatchesSearch(billRow(), "STATIONERY", "contains")).toBe(true);
    expect(rowMatchesSearch(billRow(), "nobody", "contains")).toBe(false);
  });

  it("refuses a query that normalises to nothing", () => {
    expect(rowMatchesSearch(billRow({ invoiceTotal: "0.00" }), ".", "contains")).toBe(false);
    expect(rowMatchesSearch(billRow({ invoiceTotal: "0.00" }), "$", "contains")).toBe(false);
  });

  it("is the default mode", () => {
    expect(rowMatchesSearch(SEARCH_ROWS[1], "3000")).toBe(true);
  });
});

describe("rowMatchesSearch, exact mode", () => {
  it("3000 matches only 3,000.00", () => {
    const ids = matching("3000", "exact");
    expect(ids).toContain("r-3000");
    expect(ids).not.toContain("r-13000");
    expect(ids).not.toContain("r-300");
  });

  it("compares amounts as numbers, so 3000 and 3000.00 are the same query", () => {
    expect(rowMatchesSearch(SEARCH_ROWS[0], "3000", "exact")).toBe(true);
    expect(rowMatchesSearch(SEARCH_ROWS[0], "3000.00", "exact")).toBe(true);
    expect(rowMatchesSearch(SEARCH_ROWS[0], "3,000.00", "exact")).toBe(true);
  });

  it("keeps a supplier literally named 3000 reachable", () => {
    expect(matching("3000", "exact")).toContain("r-1500");
  });

  it("wants the whole supplier or description, not a part of it", () => {
    expect(rowMatchesSearch(billRow(), "Young Bros Transport", "exact")).toBe(true);
    expect(rowMatchesSearch(billRow(), "young bros transport", "exact")).toBe(true);
    expect(rowMatchesSearch(billRow(), "Young", "exact")).toBe(false);
  });

  it("refuses a query that is neither the text nor a number", () => {
    expect(rowMatchesSearch(billRow(), "nobody", "exact")).toBe(false);
  });
});

describe("the unpaid amount", () => {
  it("is not searched in either mode - only the invoice total is", () => {
    const row = billRow({ invoiceTotal: "6,000.00", unpaidAmount: "HK$ 1,234.00" });
    expect(rowMatchesSearch(row, "1234", "contains")).toBe(false);
    expect(rowMatchesSearch(row, "1234", "exact")).toBe(false);
    expect(rowMatchesSearch(row, "6000", "contains")).toBe(true);
  });

  it("means a row with no invoice total matches on its text alone", () => {
    const row = billRow({ invoiceTotal: undefined });
    expect(rowMatchesSearch(row, "6000", "contains")).toBe(false);
    expect(rowMatchesSearch(row, "Young Bros Transport", "exact")).toBe(true);
  });
});
