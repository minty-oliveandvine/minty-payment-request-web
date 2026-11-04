// Shrinking an image before upload (lib/compressImage.ts).
//
// jsdom draws nothing, so the image and the canvas are stand-ins: what is checked is the type
// asked of the canvas and the name and type of the file that comes back. The 2026-11-03 walk
// uploaded receipt.png and the bill held receipt.jpg (image/jpeg).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { compressImage } from "@/lib/compressImage";

let asked: { type?: string; filled: boolean };

beforeEach(() => {
  asked = { filled: false };
  vi.stubGlobal(
    "Image",
    class {
      width = 4000;
      height = 2000;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return "blob:image";
      }
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:image");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag !== "canvas") return realCreate(tag);
    return {
      width: 0,
      height: 0,
      getContext: () => ({
        set fillStyle(_: string) {
          asked.filled = true;
        },
        fillRect: () => {},
        drawImage: () => {},
      }),
      toBlob: (cb: (b: Blob) => void, type: string) => {
        asked.type = type;
        cb(new Blob(["x"], { type }));
      },
    } as unknown as HTMLCanvasElement;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("compressImage", () => {
  it("keeps a PNG a PNG, under its own name, with its transparency", async () => {
    const out = await compressImage(new File(["x"], "receipt.png", { type: "image/png" }));

    expect(out.name).toBe("receipt.png");
    expect(out.type).toBe("image/png");
    expect(asked.type).toBe("image/png");
    expect(asked.filled).toBe(false);
  });

  it("keeps a JPEG a JPEG", async () => {
    const out = await compressImage(new File(["x"], "slip.jpeg", { type: "image/jpeg" }));

    expect(out.name).toBe("slip.jpeg");
    expect(out.type).toBe("image/jpeg");
  });

  it("still turns other images into a JPEG", async () => {
    const out = await compressImage(new File(["x"], "scan.webp", { type: "image/webp" }));

    expect(out.name).toBe("scan.jpg");
    expect(out.type).toBe("image/jpeg");
  });

  it("leaves a PDF alone", async () => {
    const pdf = new File(["%PDF"], "invoice.pdf", { type: "application/pdf" });

    expect(await compressImage(pdf)).toBe(pdf);
  });
});
