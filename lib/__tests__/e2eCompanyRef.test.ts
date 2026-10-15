// e2e/companyRef.ts is a copy of @minty/shared/companyRef (Playwright cannot load the package's
// .ts source - see that file). This pins the copy to the package, so the two cannot drift.

import { describe, expect, it } from "vitest";

import { companyRef as packaged } from "@minty/shared/companyRef";

import { companyRef as e2eCopy } from "../../e2e/companyRef";
import { companyPages } from "../companyPages";
import { pagesUnder } from "../companyPaths";

const ID = "4F1C2A9B-77d0-4b55-9e7c-0a1b2c3d4e5f";
const NAMES = [
  "E2E Petty Cash Shop",
  "Kwok & Sons Transport Ltd.",
  "  --Café Lumière--  ",
  "大華貿易有限公司",
  "",
  null,
  undefined,
  "A".repeat(80) + " tail",
  "Ünïcödé — 2026 / Q4",
];

describe("the e2e copy of companyRef", () => {
  it.each(NAMES.map((n) => [n]))("matches the package for %j", (name) => {
    expect(e2eCopy(ID, name)).toBe(packaged(ID, name));
  });

  it("builds the same pages as the app", () => {
    const fromApp = companyPages(ID, "Kwok & Sons");
    const fromE2e = pagesUnder(`/entity/${e2eCopy(ID, "Kwok & Sons")}`);
    expect(fromE2e.list).toBe(fromApp.list);
    expect(fromE2e.settings).toBe(fromApp.settings);
    expect(fromE2e.request("x", "PR-0001")).toBe(fromApp.request("x", "PR-0001"));
  });
});
