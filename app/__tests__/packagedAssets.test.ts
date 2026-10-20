// The packaged sidebar renders `/menu/...` files, and Next cannot serve a static file out of
// node_modules - so they live in THIS app's public/. That makes it a contract, and a silent one:
// a missing file is a broken image, not an error. SIDEBAR_ASSETS is the package's own list of what
// it draws, so this fails the run instead of the page.

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { PROFILE_ASSETS } from "@minty/shared/profile";
import { SIDEBAR_ASSETS } from "@minty/shared/sidebar";
import { describe, expect, it } from "vitest";

describe.each([
  ["sidebar", SIDEBAR_ASSETS],
  ["profile", PROFILE_ASSETS],
])("the packaged %s's assets", (_, assets: readonly string[]) => {
  it("lists some", () => {
    expect(assets.length).toBeGreaterThan(0);
  });

  it.each(assets)("public%s is served by this app", (asset) => {
    expect(existsSync(resolve("public", asset.replace(/^\//, "")))).toBe(true);
  });
});
