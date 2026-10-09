// The app's one full-screen file preview (components/payment-request/AttachmentFullScreenViewer.tsx).
//
// The rule it exists to keep: a file NEVER leaves the app. It used to open in a new tab, so
// the assertions worth pinning are the absence of any link or download, and the keyboard
// contract that lets it stack over a modal - Escape closes the viewer and nothing else,
// because it listens in the capture phase.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AttachmentFullScreenViewer,
  fileToPreviewItem,
  nameToPreviewMime,
  resolvePreviewMime,
  type AttachmentPreviewItem,
} from "@/components/payment-request/AttachmentFullScreenViewer";

// pdf.js needs a canvas, which jsdom has not got, so the renderer is stubbed at its module
// boundary and named instead - rendering one for real is e2e's job.
vi.mock("@/components/PdfJsCanvasPreview", () => ({
  PdfJsCanvasPreview: ({ title, src }: { title?: string; src?: string }) => (
    <div data-pdf={src}>{`pdf: ${title}`}</div>
  ),
}));

const IMAGE: AttachmentPreviewItem = {
  url: "blob:receipt",
  name: "receipt.png",
  mime: "image/png",
};

const onClose = vi.fn();

const show = (item: AttachmentPreviewItem = IMAGE) =>
  render(<AttachmentFullScreenViewer item={item} onClose={onClose} />);

const viewer = () => screen.getByRole("dialog");
const close = () => screen.getByRole("button", { name: "Close preview" });

beforeEach(() => {
  onClose.mockReset();
});

describe("the overlay", () => {
  it("is a modal dialog named after the file", () => {
    show();

    expect(viewer()).toHaveAttribute("aria-modal", "true");
    expect(viewer()).toHaveAccessibleName("receipt.png");
  });

  it("never offers a link out or a download", () => {
    show();

    expect(within(viewer()).queryAllByRole("link")).toHaveLength(0);
    expect(viewer().querySelector('[target="_blank"]')).toBeNull();
    expect(viewer().querySelector("[download]")).toBeNull();
  });

  it("closes on the backdrop's close control", async () => {
    show();

    await userEvent.click(close());

    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("the keyboard", () => {
  it("starts focus on Close, so Escape and Enter both work straight away", async () => {
    show();

    await waitFor(() => expect(close()).toHaveFocus());
  });

  it("closes on Escape", async () => {
    show();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("swallows Escape, so the modal underneath stays open", async () => {
    // A parent modal's own listener is bubble-phase on window, like the real ones.
    const parent = vi.fn();
    window.addEventListener("keydown", parent);
    show();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
    expect(parent).not.toHaveBeenCalled();
    window.removeEventListener("keydown", parent);
  });

  it("keeps Tab inside itself", async () => {
    show();
    await waitFor(() => expect(close()).toHaveFocus());

    await userEvent.tab();

    expect(viewer().contains(document.activeElement)).toBe(true);
  });

  it("hands focus back to whatever opened it", async () => {
    render(<button type="button">View full</button>);
    const opener = screen.getByRole("button", { name: "View full" });
    opener.focus();
    const { unmount } = show();
    await waitFor(() => expect(close()).toHaveFocus());

    unmount();

    expect(opener).toHaveFocus();
  });
});

describe("what it draws", () => {
  it("draws an image as an image", () => {
    show();

    expect(within(viewer()).getByAltText("receipt.png")).toBeInTheDocument();
  });

  it("hands a PDF to the pdf.js renderer", () => {
    show({ url: "blob:inv", name: "invoice.pdf", mime: "application/pdf" });

    expect(screen.getByText("pdf: invoice.pdf")).toHaveAttribute("data-pdf", "blob:inv");
  });

  it("sandboxes HTML rather than running it", () => {
    show({ url: "blob:page", name: "statement.html", mime: "text/html" });

    const frame = viewer().querySelector("iframe") as HTMLIFrameElement;
    expect(frame).toHaveAttribute("title", "statement.html");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("referrerPolicy", "no-referrer");
  });

  it("says so for a file it cannot draw, instead of offering it for download", () => {
    show({ url: "blob:bin", name: "payload.bin", mime: "application/octet-stream" });

    expect(screen.getByText("Preview is not available for this file type.")).toBeInTheDocument();
    expect(within(viewer()).queryAllByRole("link")).toHaveLength(0);
  });
});

// The mime a browser reports cannot be trusted, and a wrong answer here is the difference
// between drawing the file and telling the user it cannot be drawn.
describe("resolving the type", () => {
  it("reads the extension when the browser gives no type", () => {
    expect(resolvePreviewMime(new File(["x"], "scan.pdf", { type: "" }))).toBe("application/pdf");
    expect(resolvePreviewMime(new File(["x"], "scan.PNG", { type: "" }))).toBe("image/*");
    expect(resolvePreviewMime(new File(["x"], "page.htm", { type: "" }))).toBe("text/html");
  });

  it("distrusts octet-stream, which is what B2 calls a PDF", () => {
    const f = new File(["x"], "slip.pdf", { type: "application/octet-stream" });

    expect(resolvePreviewMime(f)).toBe("application/pdf");
  });

  it("keeps a type the browser did give", () => {
    expect(resolvePreviewMime(new File(["x"], "a.png", { type: "image/webp" }))).toBe("image/webp");
  });

  it("gives up on an extension it does not know", () => {
    expect(nameToPreviewMime("payload.bin")).toBe("application/octet-stream");
    expect(nameToPreviewMime("noextension")).toBe("application/octet-stream");
  });

  it("builds an item for a staged file", () => {
    const f = new File(["x"], "receipt.jpg", { type: "image/jpeg" });

    expect(fileToPreviewItem(f, "blob:abc")).toEqual({
      url: "blob:abc",
      name: "receipt.jpg",
      mime: "image/jpeg",
    });
  });
});
