// Picking attachments to delete (components/payment-request/InvoiceAttachmentPreview.tsx).
//
// The selection is dual-mode: controlled by the parent when `selectedIndices` and
// `onSelectedIndicesChange` are both given, and its own otherwise. The rule worth pinning is
// what happens on the way OUT of edit mode - one of the thirteen set-state-in-effect sites -
// and that it does not report an empty selection as a change.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  InvoiceAttachmentPreview,
  type InvoiceAttachmentPreviewItem,
} from "@/components/payment-request/InvoiceAttachmentPreview";

// pdf.js needs a canvas, which jsdom has not got, so the PDF renderer is stubbed at its module
// boundary and named instead - rendering one for real is e2e/10's job.
vi.mock("@/components/PdfJsCanvasPreview", () => ({
  PdfJsCanvasPreview: ({ title, src }: { title?: string; src?: string }) => (
    <div data-pdf={src}>{`pdf: ${title}`}</div>
  ),
}));

const ATTACHMENTS: InvoiceAttachmentPreviewItem[] = [
  { url: "https://files.test/a.png", name: "receipt-a.png", mime: "image/png" },
  { url: "https://files.test/b.png", name: "receipt-b.png", mime: "image/png" },
  { url: "https://files.test/c.png", name: "receipt-c.png", mime: "image/png" },
];

const onSelectedIndicesChange = vi.fn<(next: number[]) => void>();

type Props = Parameters<typeof InvoiceAttachmentPreview>[0];

const show = (props: Partial<Props> = {}) =>
  render(<InvoiceAttachmentPreview attachments={ATTACHMENTS} {...props} />);

const tick = (item: InvoiceAttachmentPreviewItem) =>
  screen.getByRole("checkbox", { name: `Select attachment ${item.name}` });
const ticks = () => screen.queryAllByRole("checkbox");

describe("outside edit mode", () => {
  it("offers no way to select anything", () => {
    show();

    expect(ticks()).toHaveLength(0);
  });
});

describe("in edit mode, keeping its own selection", () => {
  it("offers a tick per attachment", () => {
    show({ editMode: true });

    expect(ticks()).toHaveLength(ATTACHMENTS.length);
    for (const item of ATTACHMENTS) expect(tick(item)).not.toBeChecked();
  });

  it("ticks and unticks", async () => {
    show({ editMode: true });

    await userEvent.click(tick(ATTACHMENTS[1]));
    expect(tick(ATTACHMENTS[1])).toBeChecked();
    expect(tick(ATTACHMENTS[0])).not.toBeChecked();

    await userEvent.click(tick(ATTACHMENTS[1]));
    expect(tick(ATTACHMENTS[1])).not.toBeChecked();
  });

  it("holds several at once", async () => {
    show({ editMode: true });

    await userEvent.click(tick(ATTACHMENTS[0]));
    await userEvent.click(tick(ATTACHMENTS[2]));

    expect(tick(ATTACHMENTS[0])).toBeChecked();
    expect(tick(ATTACHMENTS[2])).toBeChecked();
  });

  it("forgets the selection when edit mode is left", async () => {
    const view = show({ editMode: true });
    await userEvent.click(tick(ATTACHMENTS[0]));

    view.rerender(<InvoiceAttachmentPreview attachments={ATTACHMENTS} editMode={false} />);
    view.rerender(<InvoiceAttachmentPreview attachments={ATTACHMENTS} editMode />);

    for (const item of ATTACHMENTS) expect(tick(item)).not.toBeChecked();
  });
});

describe("in edit mode, controlled by the parent", () => {
  it("shows the parent's selection and keeps none of its own", () => {
    show({ editMode: true, selectedIndices: [1], onSelectedIndicesChange });

    expect(tick(ATTACHMENTS[1])).toBeChecked();
    expect(tick(ATTACHMENTS[0])).not.toBeChecked();
  });

  it("reports a tick as the whole selection, in order", async () => {
    show({ editMode: true, selectedIndices: [2], onSelectedIndicesChange });

    await userEvent.click(tick(ATTACHMENTS[0]));

    expect(onSelectedIndicesChange).toHaveBeenCalledWith([0, 2]);
  });

  it("reports an untick the same way", async () => {
    show({ editMode: true, selectedIndices: [0, 2], onSelectedIndicesChange });

    await userEvent.click(tick(ATTACHMENTS[2]));

    expect(onSelectedIndicesChange).toHaveBeenCalledWith([0]);
  });

  it("does not move on its own - the parent's prop is the only truth", async () => {
    show({ editMode: true, selectedIndices: [], onSelectedIndicesChange });

    await userEvent.click(tick(ATTACHMENTS[0]));

    // It told the parent; it did not tick itself.
    expect(onSelectedIndicesChange).toHaveBeenCalledWith([0]);
    expect(tick(ATTACHMENTS[0])).not.toBeChecked();
  });

  it("asks the parent to clear the selection when edit mode is left", () => {
    const view = show({ editMode: true, selectedIndices: [0, 1], onSelectedIndicesChange });

    view.rerender(
      <InvoiceAttachmentPreview
        attachments={ATTACHMENTS}
        editMode={false}
        selectedIndices={[0, 1]}
        onSelectedIndicesChange={onSelectedIndicesChange}
      />,
    );

    expect(onSelectedIndicesChange).toHaveBeenCalledWith([]);
  });

  it("says NOTHING when there was no selection to clear", () => {
    const view = show({ editMode: true, selectedIndices: [], onSelectedIndicesChange });

    view.rerender(
      <InvoiceAttachmentPreview
        attachments={ATTACHMENTS}
        editMode={false}
        selectedIndices={[]}
        onSelectedIndicesChange={onSelectedIndicesChange}
      />,
    );

    expect(onSelectedIndicesChange).not.toHaveBeenCalled();
  });
});

describe("what it draws", () => {
  it("names each attachment in its own 'view full' control", () => {
    show({ showViewFullButton: true });

    for (const item of ATTACHMENTS) {
      expect(screen.getByRole("button", { name: `View full — ${item.name}` })).toBeInTheDocument();
    }
  });

  it("hands a PDF to the pdf.js renderer rather than an image tag", () => {
    show({
      attachments: [{ url: "https://files.test/a.pdf", name: "invoice.pdf", mime: "application/pdf" }],
    });

    expect(screen.getByText("pdf: invoice.pdf")).toBeInTheDocument();
    expect(screen.getByText("pdf: invoice.pdf")).toHaveAttribute("data-pdf", "https://files.test/a.pdf");
  });

  it("says it is loading rather than showing an empty frame", () => {
    show({ attachments: [], isLoadingAttachments: true });

    expect(screen.getByRole("status", { name: "Loading invoice attachment" })).toBeInTheDocument();
  });

  it("takes the older images-only list too", () => {
    render(
      <InvoiceAttachmentPreview imageSrcs={["https://files.test/legacy.png"]} showViewFullButton />,
    );

    expect(screen.getByRole("button", { name: /View full — attachment 1/ })).toBeInTheDocument();
  });
});
