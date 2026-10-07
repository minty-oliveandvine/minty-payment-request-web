// The company's addresses (lib/companyPages.ts). middleware.ts matches COMPANY_PAGE on every
// request and e2e/helpers.ts builds the same paths, so both of them break if these change.

import { describe, expect, it } from "vitest";

import {
  COMPANY_PAGE,
  companyBase,
  companyPages,
  decodeSegment,
  isCanonicalRef,
  pagesUnder,
} from "@/lib/companyPages";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";
const BASE = "/entity/360812e1/olive-and-vine";

describe("COMPANY_PAGE", () => {
  it.each([
    ["the list", `${BASE}/payment-request`, "payment-request"],
    ["one request", `${BASE}/payment-request/PR-0001`, "payment-request/PR-0001"],
    ["the settings page", `${BASE}/settings/payment-request`, "settings/payment-request"],
  ])("matches %s and reports the page", (_label, path, page) => {
    const match = COMPANY_PAGE.exec(path);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("360812e1");
    expect(match?.[2]).toBe("olive-and-vine");
    expect(match?.[3]).toBe(page);
  });

  it("matches an uppercase short id - canonicalising it is isCanonicalRef's job, not the regex's", () => {
    expect(COMPANY_PAGE.test("/entity/360812E1/olive-and-vine/payment-request")).toBe(true);
  });

  it.each([
    ["a seven-character ref", "/entity/360812e/olive-and-vine/payment-request"],
    ["a nine-character ref", "/entity/360812e1a/olive-and-vine/payment-request"],
    ["a non-hex ref", "/entity/360812zz/olive-and-vine/payment-request"],
    ["a deeper path", `${BASE}/payment-request/PR-0001/edit`],
    ["another module's page", `${BASE}/petty-cash`],
    ["another settings tab", `${BASE}/settings/integration`],
    ["no page at all", BASE],
  ])("does not match %s", (_label, path) => {
    expect(COMPANY_PAGE.test(path)).toBe(false);
  });
});

describe("pagesUnder", () => {
  const pages = pagesUnder(BASE);

  it("builds the list and the settings page", () => {
    expect(pages.list).toBe(`${BASE}/payment-request`);
    expect(pages.settings).toBe(`${BASE}/settings/payment-request`);
  });

  it("addresses a request by its Payment No. when it has one", () => {
    expect(pages.request("f47ac10b-58cc", "PR-0001")).toBe(`${BASE}/payment-request/PR-0001`);
  });

  it("falls back to the id for a missing, empty or blank reference", () => {
    const byId = `${BASE}/payment-request/f47ac10b-58cc`;
    expect(pages.request("f47ac10b-58cc")).toBe(byId);
    expect(pages.request("f47ac10b-58cc", null)).toBe(byId);
    expect(pages.request("f47ac10b-58cc", "")).toBe(byId);
    expect(pages.request("f47ac10b-58cc", "   ")).toBe(byId);
  });

  it("trims and percent-encodes the reference", () => {
    expect(pages.request("id", "  PR-0001  ")).toBe(`${BASE}/payment-request/PR-0001`);
    expect(pages.request("id", "PR/0001")).toBe(`${BASE}/payment-request/PR%2F0001`);
  });
});

describe("companyBase and companyPages", () => {
  it("build the address from the id and the name", () => {
    expect(companyBase(ENTITY_ID, ENTITY_NAME)).toBe(BASE);
    expect(companyPages(ENTITY_ID, ENTITY_NAME).list).toBe(`${BASE}/payment-request`);
  });
});

describe("decodeSegment", () => {
  it("reads a percent-encoded segment as text", () => {
    expect(decodeSegment("olive%20and%20vine")).toBe("olive and vine");
  });

  it("takes an invalid percent-escape as it is rather than throwing", () => {
    expect(decodeSegment("100%")).toBe("100%");
    expect(decodeSegment("%zz")).toBe("%zz");
  });
});

describe("isCanonicalRef", () => {
  it("is true only for the exact spelling this app would build", () => {
    expect(isCanonicalRef("360812e1", "olive-and-vine", ENTITY_ID, ENTITY_NAME)).toBe(true);
  });

  it("is false for a capital in the short id", () => {
    expect(isCanonicalRef("360812E1", "olive-and-vine", ENTITY_ID, ENTITY_NAME)).toBe(false);
  });

  it("is false for a stale or wrong name", () => {
    expect(isCanonicalRef("360812e1", "olive-vine", ENTITY_ID, ENTITY_NAME)).toBe(false);
  });

  it("compares the decoded slug, so a percent-encoded name is still canonical", () => {
    expect(isCanonicalRef("360812e1", encodeURIComponent("橄欖"), ENTITY_ID, "橄欖")).toBe(true);
  });
});
