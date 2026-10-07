// How the list orders itself (lib/paymentRequestRowSort.ts + lib/paymentRequestDateSort.ts).
//
// These are characterisation tests: they pin what the code does today, which includes two
// things worth knowing before changing either file - a row with no date sorts LAST in both
// directions (compareNullableNumber ignores `dir` for nulls), and every date key falls back to
// comparing ids so the order is stable.

import { describe, expect, it } from "vitest";

import { billRow } from "@/lib/__fixtures__/bills";
import {
  compareBySubmittedDate,
  compareNullableNumber,
  dateSortValue,
} from "@/lib/paymentRequestDateSort";
import { compareRows, parseRowAmount, type SortKey } from "@/lib/paymentRequestRowSort";

const order = (rows: ReturnType<typeof billRow>[], key: SortKey, dir: "asc" | "desc") =>
  [...rows].sort((a, b) => compareRows(a, b, key, dir)).map((r) => r.id);

describe("parseRowAmount", () => {
  it("reads both row shapes", () => {
    // invoiceTotal carries no currency symbol, unpaidAmount does.
    expect(parseRowAmount("6,000.00")).toBe(6000);
    expect(parseRowAmount("HK$ 1,500.00")).toBe(1500);
    expect(parseRowAmount("13,000.50")).toBe(13000.5);
  });

  it("is null for blank, a dash or anything with no number in it", () => {
    expect(parseRowAmount("")).toBeNull();
    expect(parseRowAmount("   ")).toBeNull();
    expect(parseRowAmount("-")).toBeNull();
    expect(parseRowAmount("HK$")).toBeNull();
  });
});

describe("dateSortValue", () => {
  // `Date.parse` is tried first and on V8 it reads every one of these shapes, as LOCAL
  // midnight. So the own slash and long-month branches below it are unreachable here, and
  // these numbers are machine-dependent - hence the assertions against local midnight rather
  // than a literal.
  const localMidnight = new Date(2026, 2, 3).getTime();

  it.each(["03 Mar 2026", "3/Mar/2026", "03 March 2026", "03 mar 2026"])(
    "reads %s as local midnight on 3 March",
    (shown) => {
      expect(dateSortValue(shown)).toBe(localMidnight);
    },
  );

  // CHARACTERISATION: an ISO cell is UTC midnight while a displayed cell is local midnight, so
  // the two spellings of the same day are eight hours apart on a Hong Kong machine. Harmless
  // today because a column's cells all use one spelling; it would misorder a mixed column.
  it("reads an ISO date as UTC midnight, which is NOT the same number as the displayed form", () => {
    expect(dateSortValue("2026-03-03")).toBe(Date.UTC(2026, 2, 3));
    if (new Date().getTimezoneOffset() !== 0) {
      expect(dateSortValue("2026-03-03")).not.toBe(dateSortValue("03 Mar 2026"));
    }
  });

  it("is null for an empty cell, including both dash characters the table uses", () => {
    expect(dateSortValue("")).toBeNull();
    expect(dateSortValue("   ")).toBeNull();
    expect(dateSortValue("-")).toBeNull();
    expect(dateSortValue("—")).toBeNull();
  });

  it("is null for an unreadable date", () => {
    expect(dateSortValue("03 Mal 2026")).toBeNull();
    expect(dateSortValue("nonsense")).toBeNull();
  });

  it("orders earlier before later", () => {
    expect(dateSortValue("03 Mar 2026")! < dateSortValue("04 Mar 2026")!).toBe(true);
  });
});

describe("compareNullableNumber", () => {
  it("orders ascending and descending", () => {
    expect(compareNullableNumber(1, 2, 1)).toBeLessThan(0);
    expect(compareNullableNumber(1, 2, -1)).toBeGreaterThan(0);
    expect(compareNullableNumber(2, 2, 1)).toBe(0);
  });

  it("puts a null last in BOTH directions", () => {
    // The direction is deliberately not applied to the null branch: a row with no date is last
    // whichever way the column is sorted.
    expect(compareNullableNumber(null, 1, 1)).toBeGreaterThan(0);
    expect(compareNullableNumber(null, 1, -1)).toBeGreaterThan(0);
    expect(compareNullableNumber(1, null, 1)).toBeLessThan(0);
    expect(compareNullableNumber(1, null, -1)).toBeLessThan(0);
    expect(compareNullableNumber(null, null, 1)).toBe(0);
  });
});

describe("compareRows", () => {
  it("sorts by supplier, then by description, ignoring case", () => {
    const rows = [
      billRow({ id: "b", contactTitle: "beta", contactCaption: "z" }),
      billRow({ id: "a", contactTitle: "Alpha", contactCaption: "z" }),
      billRow({ id: "a2", contactTitle: "alpha", contactCaption: "a" }),
    ];
    expect(order(rows, "contact", "asc")).toEqual(["a2", "a", "b"]);
    expect(order(rows, "contact", "desc")).toEqual(["b", "a", "a2"]);
  });

  it.each(["invoiceDate", "submittedDate", "paidDate"] as const)(
    "sorts by %s, oldest first ascending, with undated rows last either way",
    (key) => {
      const field = key as "invoiceDate" | "submittedDate" | "paidDate";
      const rows = [
        billRow({ id: "late", [field]: "05 Mar 2026" }),
        billRow({ id: "early", [field]: "01 Mar 2026" }),
        billRow({ id: "none", [field]: "-" }),
      ];
      expect(order(rows, key, "asc")).toEqual(["early", "late", "none"]);
      expect(order(rows, key, "desc")).toEqual(["late", "early", "none"]);
    },
  );

  it.each(["invoiceDate", "submittedDate", "paidDate"] as const)(
    "breaks a %s tie on the id, so the order is stable",
    (key) => {
      const field = key as "invoiceDate" | "submittedDate" | "paidDate";
      const rows = [
        billRow({ id: "b", [field]: "03 Mar 2026" }),
        billRow({ id: "a", [field]: "03 Mar 2026" }),
      ];
      // The id tiebreak is NOT reversed by the direction - both ways give the same order.
      expect(order(rows, key, "asc")).toEqual(["a", "b"]);
      expect(order(rows, key, "desc")).toEqual(["a", "b"]);
    },
  );

  it("sorts by status in the table's own billing order, not alphabetically", () => {
    const rows = [
      billRow({ id: "voided", status: "Voided" }),
      billRow({ id: "draft", status: "Draft" }),
      billRow({ id: "partial", status: "Partially Paid" }),
      billRow({ id: "paid", status: "Paid" }),
      billRow({ id: "returned", status: "Returned" }),
      billRow({ id: "requested", status: "Payment Requested" }),
    ];
    expect(order(rows, "status", "asc")).toEqual([
      "requested",
      "returned",
      "paid",
      "partial",
      "draft",
      "voided",
    ]);
  });

  it("puts a status it does not know after the ones it does", () => {
    const rows = [
      billRow({ id: "unknown", status: "Something New" }),
      billRow({ id: "voided", status: "Voided" }),
    ];
    expect(order(rows, "status", "asc")).toEqual(["voided", "unknown"]);
  });

  it("sorts by unpaid amount, lowest first ascending, with blanks last", () => {
    const rows = [
      billRow({ id: "high", unpaidAmount: "HK$ 6,000.00" }),
      billRow({ id: "low", unpaidAmount: "HK$ 300.00" }),
      billRow({ id: "none", unpaidAmount: "" }),
    ];
    expect(order(rows, "unpaidAmount", "asc")).toEqual(["low", "high", "none"]);
    expect(order(rows, "unpaidAmount", "desc")).toEqual(["high", "low", "none"]);
  });

  it("leaves the order alone for a key it does not handle", () => {
    const a = billRow({ id: "a" });
    const b = billRow({ id: "b" });
    expect(compareRows(a, b, "nonsense" as SortKey, "asc")).toBe(0);
  });
});

describe("compareBySubmittedDate", () => {
  it("is the submitted-date rule on its own, id-stable", () => {
    const rows = [
      { id: "b", submittedDate: "03 Mar 2026" },
      { id: "a", submittedDate: "03 Mar 2026" },
      { id: "early", submittedDate: "01 Mar 2026" },
      { id: "none", submittedDate: "-" },
    ];
    expect([...rows].sort((x, y) => compareBySubmittedDate(x, y, "asc")).map((r) => r.id)).toEqual([
      "early",
      "a",
      "b",
      "none",
    ]);
  });
});
