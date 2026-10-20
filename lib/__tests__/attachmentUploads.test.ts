// Naming the invoice files that did not upload (lib/attachmentUploads.ts).

import { describe, expect, it } from "vitest";

import { joinFileNames } from "@/lib/attachmentUploads";

describe("joinFileNames", () => {
  it.each([
    [[], ""],
    [["a.pdf"], "a.pdf"],
    [["a.pdf", "b.pdf"], "a.pdf and b.pdf"],
    [["a.pdf", "b.pdf", "c.pdf"], "a.pdf, b.pdf and c.pdf"],
  ])("joins %j as %j", (names, joined) => {
    expect(joinFileNames(names)).toBe(joined);
  });
});
