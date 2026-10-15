// The two silent failure modes of consuming @minty/shared, each made loud. minty-web carries the
// same pair; the one difference is noted on the --font-brand assertion below.
//
// 1. TOKENS: app/globals.css imports @minty/shared/theme.css. Loud by itself (a bad specifier
//    fails the build), but these assertions pin what the tokens come out AS, and that nothing
//    local redeclares them - which would win invisibly.
// 2. CLASSES: Tailwind v4 never scans node_modules, so without the `@source` line every utility
//    class inside the packaged sidebar is dropped from the generated CSS. Nothing errors. The
//    sidebar just renders as unstyled stacked text. This test is the only thing that catches it.
//
// It compiles the app's REAL stylesheet with the app's REAL Tailwind plugin, so it tests what the
// browser is served, not what the file says.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { beforeAll, describe, expect, it } from "vitest";

const CSS = "app/globals.css";
const PKG_SRC = "node_modules/@minty/shared/src";

let compiled = "";

beforeAll(async () => {
  compiled = (
    await postcss([tailwind()]).process(readFileSync(CSS, "utf8"), {
      from: resolve(CSS),
    })
  ).css;
}, 120_000);

describe("@minty/shared reaches the stylesheet", () => {
  it("declares the source so Tailwind scans the package", () => {
    const source = readFileSync(CSS, "utf8");
    expect(source).toContain('@import "@minty/shared/theme.css";');
    expect(source).toContain(`@source "../${PKG_SRC}";`);
    expect(existsSync(resolve(PKG_SRC, "sidebar/SideMenu.tsx"))).toBe(true);
  });

  it("keeps @source after every @import, or the last import is dropped", () => {
    // CSS requires @import to precede other rules. An `@source` line placed above the checkbox
    // import made that import invalid - and it fails SILENTLY, taking those styles with it.
    const source = readFileSync(CSS, "utf8");
    const lastImport = source.lastIndexOf("@import ");
    const atSource = source.indexOf("@source ");
    expect(atSource).toBeGreaterThan(lastImport);
  });

  it("has no local font tokens left to override the shared ones", () => {
    expect(readFileSync(CSS, "utf8")).not.toMatch(
      /^\s*--font-(sans|brand|mono):/m,
    );
  });

  it("emits the shared faces", () => {
    expect(compiled).toMatch(/--font-sans:\s*var\(--font-inter\)/);
    // --font-brand is emitted here too, but this app loads no Plus Jakarta Sans (it draws no
    // lockup as text), so --font-jakarta is undefined and it falls through to Inter. That is
    // deliberate - see the note in app/globals.css.
    expect(compiled).toMatch(/--font-brand:\s*var\(--font-jakarta\)/);
  });

  it("still emits this app's own imported CSS", () => {
    // The checkbox sheet is the import that an out-of-order @source would have killed.
    expect(compiled).toMatch(/appearance:\s*none/);
  });

  it("emits the Part 13 tokens, and the utilities the screens bind to", () => {
    // Semantic roles generate utilities only when declared in @theme (a :root-only token
    // generates none - the font lesson of 2026-10-12, again).
    expect(compiled).toMatch(/--color-action-primary:\s*var\(--minty-mint-action-500\)/);
    expect(compiled).toMatch(/--minty-mint-action-500:\s*#3cbcc3/i);
    expect(compiled).toMatch(/\.bg-action-primary\s*\{/);
    expect(compiled).toMatch(/\.text-text-primary\s*\{/);
    expect(compiled).toMatch(/\.bg-status-info-bg\s*\{/);
    // The Part 13 radius scale replaces Tailwind's: rounded-lg is 12px.
    expect(compiled).toMatch(/--radius-lg:\s*12px/);
    // Light at launch (D-24): no prefers-color-scheme switch, dark only behind data-theme.
    expect(compiled).not.toMatch(/prefers-color-scheme:\s*dark/);
    expect(compiled).toMatch(/\[data-theme="?dark"?\]/);
    // Part 13 D-20: the Rounded icon set.
    expect(compiled).toMatch(/\.material-symbols-rounded/);
  });

  it("emits the packaged sidebar's own utilities", () => {
    // Declarations, not class selectors: no escaping to get wrong. Each arbitrary value appears in
    // the package's sidebar and nowhere in this app's own source, so if Tailwind stops scanning
    // node_modules they disappear from the output.
    expect(compiled).toMatch(/width:\s*min\(100%,\s*280px\)/); // Sidebar's menu panel (v0.2)
    expect(compiled).toMatch(/height:\s*31px/); // SideMenu's section mark
    expect(compiled).toMatch(/width:\s*72px/); // SideMenu's logo
  });
});
