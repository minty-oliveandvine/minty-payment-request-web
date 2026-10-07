// The `next` rule (lib/safeNext.ts): only a path on this origin survives. The off-site
// spellings below each landed on https://evil.com/ under the old startsWith check, which is
// why this file exists. Ported from minty-web/lib/__tests__/safeNext.test.ts, minus its
// handoff/HUB_HOME case - this app has neither.
//
// e2e/11_landing_safety.spec.ts drives the same list through a real browser at /landing.

import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/safeNext";

describe("safeNextPath", () => {
  it.each([
    "/payment-request",
    "/entity/360812e1/olive-and-vine/payment-request?request=PR-1",
    "/entity/360812e1/olive-and-vine/settings/payment-request#tab",
  ])("keeps the same-origin path %s", (path) => {
    expect(safeNextPath(path, "/fallback")).toBe(path);
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["backslash", "/\\evil.com"],
    ["tab", "/\t/evil.com"],
    ["newline", "/\n/evil.com"],
    ["carriage return", "/\r/evil.com"],
    ["delete character", "/\u007f/evil.com"],
    ["absolute URL", "https://evil.com"],
    ["javascript:", "javascript:alert(1)"],
    ["relative", "evil.com"],
    ["empty", ""],
  ])("refuses %s", (_label, raw) => {
    expect(safeNextPath(raw, "/fallback")).toBe("/fallback");
  });

  it("refuses null and undefined", () => {
    expect(safeNextPath(null, "/fallback")).toBe("/fallback");
    expect(safeNextPath(undefined, "/fallback")).toBe("/fallback");
  });

  it("keeps the query and the fragment, and drops a traversal the URL parser resolves", () => {
    expect(safeNextPath("/a/b?x=1&y=2#z", "/fallback")).toBe("/a/b?x=1&y=2#z");
    expect(safeNextPath("/a/../b", "/fallback")).toBe("/b");
  });
});
