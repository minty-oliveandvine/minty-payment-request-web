// My Profile's pure rules (features/profile/lib/profileView.ts): the plan line under the
// company, and what the details card refuses before anything is sent.
//
// Ported from minty-web's test of the same module, minus its `backHref` cases - this copy does
// not have that function, because this app draws the profile only in the sidebar.

import { describe, expect, it } from "vitest";

import type { ProfileChanges, ProfileCompany } from "@/features/profile/api/profile";
import {
  CHANGE_PASSWORD_URL,
  EMAIL_REQUIRED,
  changesFrom,
  planLabel,
} from "@/features/profile/lib/profileView";
import { EMAIL_ASCII_HINT } from "@/lib/emailInput";

const company = (modules: string[]): ProfileCompany => ({
  id: "e1",
  name: "Olive & Vine",
  role: "admin",
  role_label: "Admin",
  modules,
});

const saved: Required<ProfileChanges> = {
  first_name: "Olive",
  last_name: "Vine",
  email: "olive@minty.test",
};

describe("planLabel", () => {
  it("says SuperMinty, with the cat, when both modules are on", () => {
    expect(planLabel(company(["PETTY_CASH", "PAYMENT_REQUEST"]))).toEqual({
      text: "SuperMinty",
      tone: "font-bold text-teal-strong",
      cat: true,
    });
  });

  it("names the one module that is on, in that module's colour and without the cat", () => {
    expect(planLabel(company(["PAYMENT_REQUEST"]))).toEqual({
      text: "Payment Request",
      tone: "text-[#2e6ff2]",
      cat: false,
    });
    expect(planLabel(company(["PETTY_CASH"]))).toEqual({
      text: "Petty Cash",
      tone: "text-[#ea9713]",
      cat: false,
    });
  });

  it("says nothing when no module is on, and nothing when there is no company", () => {
    expect(planLabel(company([]))).toBeNull();
    expect(planLabel(company(["SOMETHING_ELSE"]))).toBeNull();
    expect(planLabel(null)).toBeNull();
  });
});

describe("changesFrom", () => {
  it("sends only what changed", () => {
    expect(changesFrom({ ...saved, first_name: "Olivia" }, saved)).toEqual({
      changes: { first_name: "Olivia" },
      error: null,
    });
  });

  it("sends nothing when nothing changed", () => {
    expect(changesFrom({ ...saved }, saved)).toEqual({ changes: {}, error: null });
  });

  it("sends every field that changed at once", () => {
    const draft = { first_name: "A", last_name: "B", email: "c@d.test" };
    expect(changesFrom(draft, saved).changes).toEqual(draft);
  });

  it("compares trimmed, but sends what was typed", () => {
    expect(changesFrom({ ...saved, first_name: "  Olive  " }, saved).changes).toEqual({});
    expect(changesFrom({ ...saved, first_name: "  Olivia  " }, saved).changes).toEqual({
      first_name: "  Olivia  ",
    });
  });

  it("refuses an emptied email with the old profile's words, and sends nothing", () => {
    expect(changesFrom({ ...saved, email: "" }, saved)).toEqual({
      changes: {},
      error: EMAIL_REQUIRED,
    });
    expect(changesFrom({ ...saved, email: "   " }, saved).error).toBe(EMAIL_REQUIRED);
  });

  it("refuses a non-English email with the hint, and sends nothing", () => {
    expect(changesFrom({ ...saved, email: "홍길동@minty.test" }, saved)).toEqual({
      changes: {},
      error: EMAIL_ASCII_HINT,
    });
  });

  it("refuses the email before it looks at anything else", () => {
    const result = changesFrom({ first_name: "Olivia", last_name: "Vine", email: "" }, saved);
    expect(result.changes).toEqual({});
    expect(result.error).toBe(EMAIL_REQUIRED);
  });
});

describe("CHANGE_PASSWORD_URL", () => {
  it("goes to Xero's account page - Minty holds no password for most people", () => {
    expect(CHANGE_PASSWORD_URL).toBe("https://identity.xero.com/account");
  });
});
