// Part 13 V-01: screens bind to the semantic tokens (@minty/shared/tokens.css), never a hex and
// never a Tailwind palette colour. This guard fails on any that creeps back into the source, the
// way the date-format guard (rule 11) keeps dates in one place. It reads the files as text - so it
// catches a class string wherever it is built - and skips comments.
//
// Exceptions are listed by file and reason; add one only with the reason beside it.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DIRS = ["app", "components", "features", "lib"];

/** file (posix, from the repo root) -> what is allowed there, and why. */
const ALLOWED: Record<string, { pattern: RegExp; why: string }> = {
  // Image compression paints a JPEG's transparent pixels white before encoding - pixels, not UI.
  "lib/compressImage.ts": { pattern: /#fff\b/, why: "canvas fill for image conversion" },
};

const PALETTE =
  "gray|red|amber|rose|sky|orange|stone|emerald|green|blue|yellow|slate|zinc|neutral|teal|cyan|indigo|purple|pink|lime|violet|fuchsia|black|white";
const UTIL =
  "bg|text|border|ring|from|to|via|outline|fill|stroke|decoration|divide|placeholder|accent|caret|shadow";
const RAW = new RegExp(
  [
    String.raw`#[0-9a-fA-F]{3,8}\b`,
    String.raw`(?<![\w-])(?:[a-z-]+:)*(?:${UTIL})-(?:${PALETTE})(?:-\d{2,3})?(?:\/\d+)?\b`,
    // the pre-Part 13 aliases (`--primary` grey, `--secondary` brand teal used as a fill)
    String.raw`(?<![\w-])(?:[a-z-]+:)*(?:${UTIL})-(?:primary|secondary|teal-strong|accent)(?:\/\d+)?(?![\w-])`,
  ].join("|"),
  "g",
);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "__fixtures__" || name === "node_modules") continue;
      out.push(...sources(p));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("the guard itself", () => {
  it.each([
    'className="bg-[#54D3DA]"',
    'className="text-gray-700"',
    'className="hover:bg-red-50"',
    'className="bg-secondary/10"',
    'className="text-primary"',
    "const TEAL = '#54d3da';",
  ])("catches %s", (sample) => {
    expect(sample.match(RAW)).not.toBeNull();
  });

  it.each([
    'className="bg-action-primary text-action-on-primary"',
    'className="text-text-primary"',
    'className="bg-status-info-bg"',
  ])("lets the token %s through", (sample) => {
    expect(sample.match(RAW)).toBeNull();
  });
});

describe("Part 13 V-01: no raw colours in the source", () => {
  it("binds every colour to a semantic token", () => {
    const offences: string[] = [];
    for (const dir of DIRS) {
      for (const file of sources(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split(sep).join("/");
        const text = stripComments(readFileSync(file, "utf8"));
        for (const match of text.matchAll(RAW)) {
          if (ALLOWED[rel]?.pattern.test(match[0])) continue;
          const line = text.slice(0, match.index).split("\n").length;
          offences.push(`${rel}:${line}  ${match[0]}`);
        }
      }
    }
    expect(
      offences,
      `raw colours (use a Part 13 token from @minty/shared/tokens.css):\n${offences.join("\n")}`,
    ).toEqual([]);
  });
});
