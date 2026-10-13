// Part 15.17's status × action matrix (lib/requestActions.ts): one next action per row, chosen
// by status and by who is looking.

import { describe, expect, it } from "vitest";

import { ACTION_LABEL, detailActions, rowNextAction } from "@/lib/requestActions";

const TREASURY = { isElevated: true, isViewOnly: false };
const REQUESTER = { isElevated: false, isViewOnly: false };
const VISITOR = { isElevated: true, isViewOnly: true };

describe("a row's next action", () => {
  it.each([
    ["Payment Requested", "record"],
    ["Partially Paid", "record"],
    ["Paid", "viewPayments"],
    ["Draft", "continue"],
    ["Returned", "view"],
    ["Voided", "view"],
  ])("for Treasury, %s offers %s", (status, action) => {
    expect(rowNextAction(status, TREASURY)).toBe(action);
  });

  it("never offers a payment to someone who cannot make one", () => {
    expect(rowNextAction("Payment Requested", REQUESTER)).toBe("view");
    expect(rowNextAction("Partially Paid", VISITOR)).toBe("view");
  });

  it("lets a visitor read a draft, not continue it", () => {
    expect(rowNextAction("Draft", VISITOR)).toBe("view");
  });

  it("offers nothing for a status it does not know", () => {
    expect(rowNextAction("Something new", TREASURY)).toBeNull();
  });
});

describe("the detail header", () => {
  it("offers Return and Void on a request still to be paid", () => {
    expect(detailActions("Payment Requested", TREASURY)).toEqual(["return", "void"]);
  });

  it("offers the payments and Void once part of it is paid", () => {
    expect(detailActions("Partially Paid", TREASURY)).toEqual(["viewPayments", "void"]);
  });

  it("hides every money action from someone who cannot take it", () => {
    expect(detailActions("Payment Requested", REQUESTER)).toEqual([]);
    expect(detailActions("Payment Requested", VISITOR)).toEqual([]);
  });

  it("names every action with a verb and an object", () => {
    for (const label of Object.values(ACTION_LABEL)) {
      expect(label).not.toMatch(/^(OK|Yes|Submit)$/);
    }
  });
});
