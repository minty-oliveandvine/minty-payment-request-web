// Making a select able to show a value that is not in its list (lib/billFormSelectOptions.ts).
// Line items often come back with an account_code and an empty account_name, so without this
// the field would open blank on a bill that plainly has a code.

import { describe, expect, it } from "vitest";

import {
  BILL_ACCOUNT_SELECT_OPTIONS,
  BILL_CONTACT_SELECT_OPTIONS,
  enrichAccountCodeWithOptions,
  mergeSelectOption,
} from "@/lib/billFormSelectOptions";

describe("the static option lists", () => {
  it("open the contact select on a placeholder", () => {
    expect(BILL_CONTACT_SELECT_OPTIONS[0]).toEqual({ value: "", label: "Select contact" });
  });

  it("offer the two demo account codes", () => {
    expect(BILL_ACCOUNT_SELECT_OPTIONS.map((o) => o.value)).toEqual([
      "425 - Transport",
      "400 - General",
    ]);
  });
});

describe("mergeSelectOption", () => {
  it("prepends a value the list has not got", () => {
    const merged = mergeSelectOption(BILL_ACCOUNT_SELECT_OPTIONS, "429 - General Expenses");
    expect(merged[0]).toEqual({ value: "429 - General Expenses", label: "429 - General Expenses" });
    expect(merged).toHaveLength(BILL_ACCOUNT_SELECT_OPTIONS.length + 1);
  });

  it("takes a label of its own when one is given", () => {
    expect(mergeSelectOption([], "429", "429 - General Expenses")[0]).toEqual({
      value: "429",
      label: "429 - General Expenses",
    });
  });

  it("does not duplicate a value already there, and returns the same list", () => {
    const merged = mergeSelectOption(BILL_ACCOUNT_SELECT_OPTIONS, "425 - Transport");
    expect(merged).toBe(BILL_ACCOUNT_SELECT_OPTIONS);
  });

  it("does nothing for an empty value", () => {
    expect(mergeSelectOption(BILL_ACCOUNT_SELECT_OPTIONS, "")).toBe(BILL_ACCOUNT_SELECT_OPTIONS);
  });
});

describe("enrichAccountCodeWithOptions", () => {
  const options = [
    { value: "429 - General Expenses", label: "429 - General Expenses" },
    { value: "200 - Sales", label: "200 - Sales" },
    { value: "", label: "Select account" },
  ];

  it("resolves a bare code to the dropdown's own 'CODE - Name' value", () => {
    expect(enrichAccountCodeWithOptions("429", options)).toBe("429 - General Expenses");
    expect(enrichAccountCodeWithOptions("  429  ", options)).toBe("429 - General Expenses");
  });

  // CHARACTERISATION: the value is trimmed first, so "429 - " becomes "429 -" and the " - "
  // separator is no longer there to find. The code then looks like "429 -", which matches no
  // option, and the half-written value is handed back unchanged. Only a bare code resolves.
  it("does not resolve a code left with a dangling separator", () => {
    expect(enrichAccountCodeWithOptions("429 - ", options)).toBe("429 -");
  });

  it("leaves a value that already carries a name alone", () => {
    expect(enrichAccountCodeWithOptions("429 - Something Else", options)).toBe("429 - Something Else");
  });

  it("leaves a code the chart does not know as it is", () => {
    expect(enrichAccountCodeWithOptions("999", options)).toBe("999");
  });

  it("is empty for an empty or blank value", () => {
    expect(enrichAccountCodeWithOptions("", options)).toBe("");
    expect(enrichAccountCodeWithOptions("   ", options)).toBe("");
  });

  it("does not match a code against a longer one that merely starts the same", () => {
    expect(enrichAccountCodeWithOptions("42", options)).toBe("42");
  });

  it("leaves everything alone when the chart has not loaded yet", () => {
    expect(enrichAccountCodeWithOptions("429", [])).toBe("429");
  });
});
