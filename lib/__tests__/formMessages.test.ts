// The bill forms' messages (lib/formMessages.ts): Part 11's issue-then-action wording, one for
// every form (owner, 2026-11-04).

import { describe, expect, it } from "vitest";

import { AMOUNT_TOO_LONG, filesNotOpenable, filesTooBig, SUPPLIER_ADDED } from "@/lib/formMessages";

describe("the bill forms' messages", () => {
  it("name the file and the limit, one or several", () => {
    expect(filesTooBig(["scan.pdf"])).toBe("scan.pdf is over 10 MB. Choose a file up to 10 MB.");
    expect(filesTooBig(["a.pdf", "b.png"])).toBe(
      "These files are over 10 MB: a.pdf, b.png. Choose files up to 10 MB.",
    );
    expect(filesNotOpenable(["books.xlsx"])).toBe(
      "I can't open books.xlsx. Choose a PDF, JPEG, PNG or HTML file.",
    );
    expect(AMOUNT_TOO_LONG).toBe(
      "The amount is too long. Use up to 11 digits before the decimal point.",
    );
    expect(SUPPLIER_ADDED).toBe("Supplier added to Xero.");
  });

  it("never use the words Part 11 rules out", () => {
    const all = [filesTooBig(["x"]), filesNotOpenable(["x"]), AMOUNT_TOO_LONG, SUPPLIER_ADDED].join(
      " ",
    );
    expect(all).not.toMatch(/error|invalid|mandatory|required field/i);
  });
});
