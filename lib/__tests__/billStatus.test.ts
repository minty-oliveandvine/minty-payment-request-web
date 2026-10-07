// What a bill's status is called on screen, and when paying it back out rolls it back
// (lib/billStatusDisplay.ts + lib/billStatusRollback.ts).
//
// The six display labels here are the same seven words (with "All") that e2e/01_handoff.spec.ts
// asserts as the list's status tabs, pinned one layer down: the API's vocabulary is
// draft / submitted / paid / partially_paid / void / returned, and `submitted` is the one that
// reads "Payment Requested".

import { describe, expect, it } from "vitest";

import { payment } from "@/lib/__fixtures__/bills";
import { billStatusToDisplayLabel, statusDisplayBadgeClass } from "@/lib/billStatusDisplay";
import {
  billHasRemainingCountablePayments,
  billStatusShouldRollbackWhenNoPayments,
  normalizeBillStatusKey,
} from "@/lib/billStatusRollback";
import { shouldShowPaymentInHistory } from "@/lib/paymentHistoryDisplay";

describe("billStatusToDisplayLabel", () => {
  it.each([
    ["draft", "Draft"],
    ["submitted", "Payment Requested"],
    ["paid", "Paid"],
    ["partially_paid", "Partially Paid"],
    ["void", "Voided"],
    ["returned", "Returned"],
  ])("shows %s as %s", (status, label) => {
    expect(billStatusToDisplayLabel(status)).toBe(label);
  });

  it("is forgiving about case, padding and hyphens", () => {
    expect(billStatusToDisplayLabel("  PARTIALLY-PAID ")).toBe("Partially Paid");
    expect(billStatusToDisplayLabel("Submitted")).toBe("Payment Requested");
  });

  it("shows an em dash when there is no status at all", () => {
    expect(billStatusToDisplayLabel("")).toBe("—");
    expect(billStatusToDisplayLabel("   ")).toBe("—");
  });

  it("capitalises a status it does not know rather than hiding it", () => {
    expect(billStatusToDisplayLabel("awaiting_approval")).toBe("Awaiting_approval");
  });

  // `payment_requested` is the argument returnBill() takes, NOT a status the API stores, so it
  // deliberately falls through to the unknown branch. A future rename would land here first.
  it("does not know 'payment_requested' - that is a transition name, not a status", () => {
    expect(billStatusToDisplayLabel("payment_requested")).toBe("Payment_requested");
  });
});

describe("statusDisplayBadgeClass", () => {
  it.each(["Paid", "Payment Requested", "Partially Paid", "Returned", "Voided", "Draft"])(
    "gives %s its own badge",
    (label) => {
      expect(statusDisplayBadgeClass(label)).toContain("inline-flex");
    },
  );

  it("gives every label a different badge", () => {
    const labels = ["Paid", "Payment Requested", "Partially Paid", "Returned", "Voided", "Draft"];
    expect(new Set(labels.map(statusDisplayBadgeClass)).size).toBe(labels.length);
  });

  it("falls back to the Draft badge for a label it does not know", () => {
    expect(statusDisplayBadgeClass("Something New")).toBe(statusDisplayBadgeClass("Draft"));
  });
});

describe("normalizeBillStatusKey", () => {
  it("lowercases, trims and turns hyphens into underscores", () => {
    expect(normalizeBillStatusKey("  Partially-Paid ")).toBe("partially_paid");
    expect(normalizeBillStatusKey("")).toBe("");
  });
});

describe("billStatusShouldRollbackWhenNoPayments", () => {
  it("is true only for the two statuses a payment put the bill into", () => {
    expect(billStatusShouldRollbackWhenNoPayments("paid")).toBe(true);
    expect(billStatusShouldRollbackWhenNoPayments("partially_paid")).toBe(true);
    expect(billStatusShouldRollbackWhenNoPayments("Partially-Paid")).toBe(true);
  });

  it.each(["draft", "submitted", "returned", "void", ""])("is false for %s", (status) => {
    expect(billStatusShouldRollbackWhenNoPayments(status)).toBe(false);
  });
});

describe("shouldShowPaymentInHistory", () => {
  it("counts a positive amount only", () => {
    expect(shouldShowPaymentInHistory({ amount: "1500.00" })).toBe(true);
    expect(shouldShowPaymentInHistory({ amount: "0.01" })).toBe(true);
  });

  it("does not count zero, a negative amount, a blank or nonsense", () => {
    expect(shouldShowPaymentInHistory({ amount: "0.00" })).toBe(false);
    expect(shouldShowPaymentInHistory({ amount: "-100.00" })).toBe(false);
    expect(shouldShowPaymentInHistory({ amount: "" })).toBe(false);
    expect(shouldShowPaymentInHistory({ amount: "abc" })).toBe(false);
  });
});

describe("billHasRemainingCountablePayments", () => {
  it("only counts payments of the bill it was asked about", () => {
    const payments = [payment({ id: "p1", bill_id: "other-bill", amount: "1500.00" })];
    expect(billHasRemainingCountablePayments("bill-requested", payments)).toBe(false);
    expect(billHasRemainingCountablePayments("other-bill", payments)).toBe(true);
  });

  it("ignores a zero or negative payment of the right bill", () => {
    const payments = [
      payment({ id: "p1", bill_id: "bill-requested", amount: "0.00" }),
      payment({ id: "p2", bill_id: "bill-requested", amount: "-50.00" }),
    ];
    expect(billHasRemainingCountablePayments("bill-requested", payments)).toBe(false);
  });

  it("is true as soon as one payment counts", () => {
    const payments = [
      payment({ id: "p1", bill_id: "bill-requested", amount: "0.00" }),
      payment({ id: "p2", bill_id: "bill-requested", amount: "10.00" }),
    ];
    expect(billHasRemainingCountablePayments("bill-requested", payments)).toBe(true);
  });

  it("is false for no payments at all", () => {
    expect(billHasRemainingCountablePayments("bill-requested", [])).toBe(false);
  });
});
