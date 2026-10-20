// The packaged sidebar renders `/menu/...` files, and Next cannot serve a static file out of
// node_modules - so they live in THIS app's public/. That makes it a contract, and a silent one:
// a missing file is a broken image, not an error. SIDEBAR_ASSETS is the package's own list of what
// it draws, so this fails the run instead of the page.

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { SIDEBAR_ASSETS } from "@minty/shared/sidebar";
import { describe, expect, it } from "vitest";

describe("the packaged sidebar's assets", () => {
  it("lists some", () => {
    expect(SIDEBAR_ASSETS.length).toBeGreaterThan(0);
  });

  it.each(SIDEBAR_ASSETS)("public%s is served by this app", (asset) => {
    expect(existsSync(resolve("public", asset.replace(/^\//, "")))).toBe(true);
  });
});
