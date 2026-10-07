// How a company is written into an address (lib/companyRef.ts). Three callers depend on this
// agreeing with Flask's blueprints/shared/entity_ref.py::slugify_name: middleware.ts,
// lib/companyPages.ts and e2e/helpers.ts. A mismatch only costs a redirect, which is exactly
// why nothing would notice it without these.

import { describe, expect, it } from "vitest";

import { SHORT_ID_LENGTH, companyRef, shortIdOf, slugifyName } from "@/lib/companyRef";

describe("shortIdOf", () => {
  it("is the first eight characters, lowercased", () => {
    expect(SHORT_ID_LENGTH).toBe(8);
    expect(shortIdOf("360812E1-9F3A-4C21-8E5B-1A2B3C4D5E6F")).toBe("360812e1");
  });

  it("takes what there is when the id is shorter", () => {
    expect(shortIdOf("abc")).toBe("abc");
    expect(shortIdOf("")).toBe("");
  });
});

describe("slugifyName", () => {
  it.each([
    ["Olive & Vine", "olive-and-vine"],
    ["Olive and Vine", "olive-and-vine"],
    ["E2E Petty Cash Shop", "e2e-petty-cash-shop"],
    ["  Spaced   Out  ", "spaced-out"],
    ["Punctuation!!! Here???", "punctuation-here"],
    ["Hyphen--Already", "hyphen-already"],
  ])("turns %s into %s", (name, slug) => {
    expect(slugifyName(name)).toBe(slug);
  });

  it("keeps letters and digits of any script", () => {
    expect(slugifyName("橄欖 Vine 3")).toBe("橄欖-vine-3");
  });

  it("falls back to 'company' when nothing is left", () => {
    expect(slugifyName(null)).toBe("company");
    expect(slugifyName(undefined)).toBe("company");
    expect(slugifyName("")).toBe("company");
    expect(slugifyName("!!!")).toBe("company");
  });

  it("caps the slug at 60 characters and never ends on a hyphen", () => {
    const slug = slugifyName(`${"a".repeat(59)} tail`);
    expect(slug).toHaveLength(59);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("companyRef", () => {
  it("is the short id and the slug, each ready for a path", () => {
    expect(companyRef("360812e1-9f3a-4c21", "Olive & Vine")).toBe("360812e1/olive-and-vine");
  });

  it("percent-encodes a non-ASCII slug", () => {
    expect(companyRef("360812e1", "橄欖")).toBe(`360812e1/${encodeURIComponent("橄欖")}`);
  });
});
