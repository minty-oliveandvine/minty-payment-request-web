// The rule, locked: a file NEVER opens in a new tab and NEVER downloads itself.
//
// Every attachment preview in this app used to be wrapped in an `<a target="_blank">`, so
// clicking a staged receipt left the app. That is now one full-screen viewer
// (components/payment-request/AttachmentFullScreenViewer.tsx). This test is here so the habit
// does not come back by copy-paste: it reads the source rather than rendering anything, which
// is the only way to catch a branch no test happens to render.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const TREES = ["components", "lib", "features", "app"];

/** Pages that legitimately link OUT of the app - to Xero, to legal copy, to a status page. */
const NOT_A_FILE_LINK = new Set([
  "app/maintenance/page.tsx", // the status page
  "features/profile/components/DetailsCard.tsx", // "manage this in Xero"
]);

function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === "__tests__") continue;
        walk(full);
        continue;
      }
      if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

const FILES = TREES.flatMap((t) => sources(join(ROOT, t))).map((f) => ({
  path: relative(ROOT, f).replace(/\\/g, "/"),
  text: readFileSync(f, "utf8"),
}));

describe("no file ever leaves the app", () => {
  it("finds the source tree it means to scan", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("keeps its own exception list honest", () => {
    // An exception for a file that no longer links out is an exception nobody is watching.
    for (const path of NOT_A_FILE_LINK) {
      const f = FILES.find((x) => x.path === path);
      expect(f, `${path} is excused but no longer exists`).toBeDefined();
      expect(f!.text, `${path} is excused but no longer links out`).toMatch(/target=["']_blank["']/);
    }
  });

  it("opens nothing in a new tab", () => {
    const offenders = FILES.filter(
      (f) => !NOT_A_FILE_LINK.has(f.path) && /target=["']_blank["']/.test(f.text),
    ).map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it("calls window.open on nothing", () => {
    const offenders = FILES.filter((f) => /window\.open\s*\(/.test(f.text)).map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it("marks no anchor as a download", () => {
    const offenders = FILES.filter((f) => /\bdownload\s*=|\.download\s*=/.test(f.text)).map(
      (f) => f.path,
    );

    expect(offenders).toEqual([]);
  });

  it("keeps the one full-screen viewer, and only one", () => {
    const overlays = FILES.filter((f) => /fixed inset-0 z-\[340\]/.test(f.text)).map((f) => f.path);

    expect(overlays).toEqual(["components/payment-request/AttachmentFullScreenViewer.tsx"]);
  });
});
