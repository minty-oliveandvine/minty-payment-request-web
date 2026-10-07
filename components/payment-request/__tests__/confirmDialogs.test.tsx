// The confirm dialogs (components/payment-request/ConfirmDialog.tsx and the five thin wrappers
// over it).
//
// The scaffold owns the portal, the backdrop, the scroll lock, Escape and the accessible
// wrapper; each wrapper supplies only its own words. So the scaffold is tested once, and each
// wrapper is tested for the words it chooses - including the ones that change with a count or a
// name, which is where a wrong sentence would actually reach somebody.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AttachmentDeleteConfirmModal } from "@/components/payment-request/AttachmentDeleteConfirmModal";
import { BulkDeleteConfirmModal } from "@/components/payment-request/BulkDeleteConfirmModal";
import { ConfirmDialog } from "@/components/payment-request/ConfirmDialog";
import { PaymentDeleteConfirmModal } from "@/components/payment-request/PaymentDeleteConfirmModal";
import { RowDeleteConfirmModal } from "@/components/payment-request/RowDeleteConfirmModal";

const onClose = vi.fn();
const onConfirm = vi.fn();

const dialog = () => screen.getByRole("alertdialog");
const title = () => screen.getByRole("heading", { level: 2 }).textContent;
const body = () => dialog().querySelector("p")?.textContent ?? "";

describe("the scaffold", () => {
  const show = (props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) =>
    render(
      <ConfirmDialog
        open
        zIndex={420}
        title="Void this payment?"
        onClose={onClose}
        onConfirm={onConfirm}
        confirmLabel="Void Payment"
        {...props}
      >
        Are you sure?
      </ConfirmDialog>,
    );

  it("draws nothing at all while closed", () => {
    show({ open: false });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("is a modal alert dialog, named and described by its own text", () => {
    show();

    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(dialog()).toHaveAccessibleName("Void this payment?");
    expect(dialog()).toHaveAccessibleDescription("Are you sure?");
  });

  it("offers Cancel and the confirm the caller named", () => {
    show();

    expect(within(dialog()).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "Void Payment" })).toBeInTheDocument();
  });

  it("reports the confirm once", async () => {
    show();

    await userEvent.click(screen.getByRole("button", { name: "Void Payment" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Cancel, on Escape and on the backdrop", async () => {
    show();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("does not close on a press inside the dialog", async () => {
    show();

    await userEvent.click(screen.getByRole("heading", { level: 2 }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("goes deaf while the action is under way", async () => {
    show({ pending: true, confirmLabel: "Voiding…" });

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Voiding…" })).toBeDisabled();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("presentation"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("holds the page still while it is open, and lets it go again", () => {
    const root = document.createElement("div");
    root.id = "app-scroll-root";
    document.body.appendChild(root);
    try {
      const view = show();
      expect(root.style.overflow).toBe("hidden");

      view.unmount();
      expect(root.style.overflow).not.toBe("hidden");
    } finally {
      root.remove();
    }
  });

  it("offers one button only when it is just telling you something", async () => {
    show({ acknowledgeOnly: true, acknowledgeLabel: "Got it" });

    expect(within(dialog()).getAllByRole("button")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("voiding or deleting one row", () => {
  const show = (props: Partial<Parameters<typeof RowDeleteConfirmModal>[0]> = {}) =>
    render(
      <RowDeleteConfirmModal
        open
        contactTitle="Young Bros Transport"
        onClose={onClose}
        onConfirm={onConfirm}
        {...props}
      />,
    );

  it("asks about voiding a submitted request, and names the supplier", () => {
    show();

    expect(title()).toBe("Void this payment?");
    expect(body()).toContain("Young Bros Transport");
    expect(body()).toContain("can no longer be edited");
    expect(screen.getByRole("button", { name: "Void Payment" })).toBeInTheDocument();
  });

  it("asks about DELETING a draft instead - a draft is gone, not voided", () => {
    show({ isDraft: true });

    expect(title()).toBe("Delete this payment?");
    expect(body()).toContain("cannot be recovered");
    expect(screen.getByRole("button", { name: "Delete Payment" })).toBeInTheDocument();
  });

  it("still reads as a sentence with no supplier name", () => {
    show({ contactTitle: "   " });

    expect(body()).toContain("void this payment");
    expect(body()).not.toContain('""');
  });

  it("says what it is doing while it does it", () => {
    show({ pending: true });
    expect(screen.getByRole("button", { name: "Voiding…" })).toBeDisabled();
  });

  it("says Deleting… for a draft", () => {
    show({ isDraft: true, pending: true });
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
  });
});

describe("voiding a selection", () => {
  const show = (selectedCount: number, pending = false) =>
    render(
      <BulkDeleteConfirmModal
        open
        selectedCount={selectedCount}
        pending={pending}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

  it("counts them, in the singular", () => {
    show(1);

    expect(title()).toBe("Void selected payments?");
    expect(body()).toContain("void 1 selected bill?");
  });

  it("counts them, in the plural", () => {
    show(4);
    expect(body()).toContain("void 4 selected bills?");
  });

  it("says what it is doing while it does it", () => {
    show(4, true);
    expect(screen.getByRole("button", { name: "Voiding…" })).toBeDisabled();
  });
});

describe("deleting a payment", () => {
  const show = (summary: string) =>
    render(
      <PaymentDeleteConfirmModal
        open
        summary={summary}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

  it("names the payment it means, and warns it cannot be undone", () => {
    show("10 Mar 2026 · HKD 1,500.00");

    expect(title()).toBe("Delete this payment?");
    expect(body()).toContain("10 Mar 2026 · HKD 1,500.00");
    expect(body()).toContain("cannot be undone");
  });

  it("still reads as a sentence with nothing to name", () => {
    show("   ");

    expect(body()).toContain("remove this payment? This action cannot be undone.");
    expect(body()).not.toContain("()");
  });
});

describe("deleting attachments", () => {
  const show = (props: Partial<Parameters<typeof AttachmentDeleteConfirmModal>[0]> = {}) =>
    render(
      <AttachmentDeleteConfirmModal
        open
        count={1}
        onClose={onClose}
        onConfirm={onConfirm}
        {...props}
      />,
    );

  it("asks about one attachment", () => {
    show();
    expect(title()).toBe("Delete attachment?");
  });

  it("asks about several", () => {
    show({ count: 3 });
    expect(title()).toBe("Delete attachments?");
  });

  it("calls a single bank slip what it is", () => {
    show({ variant: "bankSlip", fileName: "slip.pdf" });

    expect(title()).toBe("Delete bank slip?");
    expect(body()).toContain("slip.pdf");
  });

  it("refuses to remove the last one, and only says so - there is nothing to confirm", async () => {
    show({ variant: "minimumAttachment" });

    expect(title()).toBe(
      "I need at least one attachment on a payment, so this one has to stay.",
    );
    expect(within(dialog()).getAllByRole("button")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("treats a nonsense count as none rather than showing a negative", () => {
    show({ count: -3 });
    expect(title()).toBe("Delete attachment?");
  });
});
