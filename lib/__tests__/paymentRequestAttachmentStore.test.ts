// Naming a dropped file that clashes with one already staged
// (lib/paymentRequestAttachmentStore.ts).
//
// Only `uniquifyFileName` is tested here. The rest of the module is an IndexedDB store, and
// `indexedDB` is deliberately left undefined in test/setup.ts so an accidental use fails
// loudly; the store's round-trip is proved in e2e/10_detail_attachments.spec.ts, where a real
// browser holds the draft across a reload.

import { describe, expect, it } from "vitest";

import { uniquifyFileName } from "@/lib/paymentRequestAttachmentStore";

describe("uniquifyFileName", () => {
  it("leaves a name nothing has taken", () => {
    expect(uniquifyFileName("invoice.pdf", new Set())).toBe("invoice.pdf");
    expect(uniquifyFileName("invoice.pdf", new Set(["other.pdf"]))).toBe("invoice.pdf");
  });

  it("numbers the first clash, keeping the extension", () => {
    expect(uniquifyFileName("invoice.pdf", new Set(["invoice.pdf"]))).toBe("invoice (1).pdf");
  });

  it("counts up past every taken number", () => {
    const used = new Set(["invoice.pdf", "invoice (1).pdf", "invoice (2).pdf"]);
    expect(uniquifyFileName("invoice.pdf", used)).toBe("invoice (3).pdf");
  });

  it("fills a gap rather than always taking the next number", () => {
    const used = new Set(["invoice.pdf", "invoice (2).pdf"]);
    expect(uniquifyFileName("invoice.pdf", used)).toBe("invoice (1).pdf");
  });

  it("numbers a name with no extension", () => {
    expect(uniquifyFileName("scan", new Set(["scan"]))).toBe("scan (1)");
  });

  it("keeps only the last extension of a double-barrelled name", () => {
    expect(uniquifyFileName("report.tar.gz", new Set(["report.tar.gz"]))).toBe("report.tar (1).gz");
  });

  // lastIndexOf(".") is 0 here, and the split only happens for an index > 0, so a dotfile is
  // numbered whole rather than becoming " (1).env".
  it("treats a leading dot as part of the name, not as an extension", () => {
    expect(uniquifyFileName(".env", new Set([".env"]))).toBe(".env (1)");
  });
});
