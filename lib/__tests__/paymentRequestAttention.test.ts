// What needs attention on the list (lib/paymentRequestAttention.ts): the Overdue, Due in 7 days
// and Returned figures above the list, and the "Overdue N days" / "Due in N days" row meta.
//
// Dates are calendar dates (`yyyy-mm-dd`) compared against "today" in the billing timezone, so
// every test passes today explicitly rather than reading the clock.

import { describe, expect, it } from "vitest";

import {
  billingToday,
  computeAttention,
  dueInDays,
  dueMetaLabel,
  rowMatchesDueFilter,
} from "@/lib/paymentRequestAttention";
import { billRow } from "@/lib/__fixtures__/bills";

const TODAY = "2026-10-19";

const due = (dueDateIso: string | undefined, overrides: Parameters<typeof billRow>[0] = {}) =>
  billRow({ id: `r-${dueDateIso}-${overrides.status ?? "pr"}`, dueDateIso, ...overrides });

describe("days until a request is due", () => {
  it("counts today as 0, yesterday as -1, and crosses month ends", () => {
    expect(dueInDays(due("2026-10-19"), TODAY)).toBe(0);
    expect(dueInDays(due("2026-10-18"), TODAY)).toBe(-1);
    expect(dueInDays(due("2026-10-26"), TODAY)).toBe(7);
    expect(dueInDays(due("2026-11-01"), "2026-10-31")).toBe(1);
  });

  it("has no answer when the request has no due date, or a broken one", () => {
    expect(dueInDays(due(undefined), TODAY)).toBeNull();
    expect(dueInDays(due(""), TODAY)).toBeNull();
    expect(dueInDays(due("not a date"), TODAY)).toBeNull();
  });

  it("has no answer for a request that is paid, voided or still a draft", () => {
    for (const status of ["Paid", "Voided", "Draft"]) {
      expect(dueInDays(due("2026-10-01", { status }), TODAY)).toBeNull();
    }
  });
});

describe("the row meta line", () => {
  it("says how long a request is overdue, in days", () => {
    expect(dueMetaLabel(due("2026-10-18"), TODAY)).toBe("Overdue 1 day");
    expect(dueMetaLabel(due("2026-10-09"), TODAY)).toBe("Overdue 10 days");
  });

  it("says due today, or due in N days up to a week ahead", () => {
    expect(dueMetaLabel(due("2026-10-19"), TODAY)).toBe("Due today");
    expect(dueMetaLabel(due("2026-10-20"), TODAY)).toBe("Due in 1 day");
    expect(dueMetaLabel(due("2026-10-26"), TODAY)).toBe("Due in 7 days");
  });

  it("says nothing further out than a week, or for a request with nothing to pay", () => {
    expect(dueMetaLabel(due("2026-10-27"), TODAY)).toBeNull();
    expect(dueMetaLabel(due("2026-10-01", { status: "Paid" }), TODAY)).toBeNull();
    expect(dueMetaLabel(due(undefined), TODAY)).toBeNull();
  });
});

describe("the attention figures", () => {
  it("count overdue and due-within-7-days apart, with yesterday overdue and 8 days out in neither", () => {
    const a = computeAttention(
      [
        due("2026-10-18", { id: "yesterday" }),
        due("2026-10-19", { id: "today" }),
        due("2026-10-26", { id: "seven" }),
        due("2026-10-27", { id: "eight" }),
      ],
      TODAY,
    );
    expect(a.overdue.count).toBe(1);
    expect(a.dueSoon.count).toBe(2);
  });

  it("leave out paid, voided and draft requests, and requests with no due date", () => {
    const a = computeAttention(
      [
        due("2026-10-01", { id: "paid", status: "Paid" }),
        due("2026-10-01", { id: "void", status: "Voided" }),
        due("2026-10-01", { id: "draft", status: "Draft" }),
        due(undefined, { id: "none" }),
      ],
      TODAY,
    );
    expect(a.overdue.count).toBe(0);
    expect(a.dueSoon.count).toBe(0);
    expect(a.isQuiet).toBe(true);
  });

  it("total the UNPAID amount, so a partly paid request counts only what is left", () => {
    const a = computeAttention(
      [
        due("2026-10-10", { id: "full", unpaidAmount: "HKD 6,000.00", invoiceTotal: "6,000.00" }),
        due("2026-10-11", {
          id: "part",
          status: "Partially Paid",
          unpaidAmount: "HKD 1,500.00",
          invoiceTotal: "13,000.50",
        }),
      ],
      TODAY,
    );
    expect(a.overdue.unpaid).toEqual([{ code: "HKD", amount: 7500 }]);
  });

  it("keep each currency apart, the largest first", () => {
    const a = computeAttention(
      [
        due("2026-10-20", { id: "h", currencyCode: "HKD", unpaidAmount: "HKD 100.00" }),
        due("2026-10-21", { id: "u", currencyCode: "USD", unpaidAmount: "USD 900.00" }),
        due("2026-10-22", { id: "h2", currencyCode: "HKD", unpaidAmount: "HKD 50.00" }),
      ],
      TODAY,
    );
    expect(a.dueSoon.unpaid).toEqual([
      { code: "USD", amount: 900 },
      { code: "HKD", amount: 150 },
    ]);
  });

  it("count every returned request, due date or not, and a returned one can also be overdue", () => {
    const a = computeAttention(
      [
        due(undefined, { id: "ret1", status: "Returned" }),
        due("2026-10-01", { id: "ret2", status: "Returned" }),
      ],
      TODAY,
    );
    expect(a.returned.count).toBe(2);
    expect(a.overdue.count).toBe(1);
    expect(a.isQuiet).toBe(false);
  });
});

describe("the due filter", () => {
  it("keeps only the overdue rows, or only the rows due within a week", () => {
    const rows = [due("2026-10-18", { id: "late" }), due("2026-10-22", { id: "soon" }), due("2026-11-30", { id: "later" })];
    expect(rows.filter((r) => rowMatchesDueFilter(r, "overdue", TODAY)).map((r) => r.id)).toEqual(["late"]);
    expect(rows.filter((r) => rowMatchesDueFilter(r, "dueSoon", TODAY)).map((r) => r.id)).toEqual(["soon"]);
  });
});

describe("today", () => {
  it("is the Hong Kong calendar date, not the UTC one", () => {
    // 18:00 UTC on 18 Oct is 02:00 on 19 Oct in Hong Kong.
    expect(billingToday(new Date("2026-10-18T18:00:00Z"))).toBe("2026-10-19");
  });
});
