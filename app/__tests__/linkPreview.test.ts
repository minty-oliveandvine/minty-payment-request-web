// The card a chat app shows for any link to this app (owner, 2026-10-23): Next serves
// app/opengraph-image.png and app/twitter-image.png on every route that sets no image of its own.
// The same file sits in all four Next apps (minty-web, minty-petty-cash-web,
// minty-payment-request-web, minty-onboarding-web), so a copy that drifts fails here, not in a
// chat window. A new card means a new hash in all four.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const CARD_SHA256 = "dfbe96307705059a914d5b4d7440a71def981bf602bddd7ce3b890d15fa39cce";

describe.each(["opengraph-image", "twitter-image"])("app/%s", (name) => {
  it("is the shared 1200x630 PNG card", () => {
    const png = readFileSync(resolve("app", `${name}.png`));
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(createHash("sha256").update(png).digest("hex")).toBe(CARD_SHA256);
  });

  it("carries its alt text", () => {
    expect(readFileSync(resolve("app", `${name}.alt.txt`), "utf8").trim()).toBe("Minty");
  });
});
