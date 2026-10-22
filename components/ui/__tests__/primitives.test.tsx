// The Part 13/14 primitives (components/ui): what each one promises, by role and state - not by
// class name, except where the class IS the promise (a token, never a hex).

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { statusTone } from "@/lib/statusTone";

import { Button } from "../Button";
import { ErrorSummary } from "../ErrorSummary";
import { Field, inputClass } from "../Field";
import { FilterChip } from "../FilterChip";
import { InlineAlert } from "../InlineAlert";
import { PageHeader } from "../PageHeader";
import { Drawer, Modal } from "../Overlay";
import { SegmentedControl } from "../SegmentedControl";
import { StatusPill } from "../StatusPill";

describe("Button", () => {
  it("is 44px, radius 12, and Primary is Minty Action with the white label", () => {
    render(<Button kind="primary">Record payment</Button>);
    const b = screen.getByRole("button", { name: "Record payment" });
    expect(b).toHaveClass("h-11", "rounded-lg", "bg-action-primary", "text-action-on-primary");
    expect(b.className).not.toMatch(/#[0-9a-f]{3,6}|rounded-full/i);
  });

  it("while processing: disabled, busy, and says what it is doing", async () => {
    const onClick = vi.fn();
    render(
      <Button kind="primary" processing processingLabel="Recording…" onClick={onClick}>
        Record HKD 4,800.00
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Recording…" });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("status tones (Part 13 §13.4, D-27)", () => {
  it.each([
    ["Payment Requested", "info"],
    ["Partially Paid", "warning"],
    ["Returned", "warning"],
    ["Paid", "success"],
    ["Draft", "neutral"],
    ["Voided", "neutral"],
    ["Something new", "neutral"],
  ])("%s is %s", (label, tone) => {
    expect(statusTone(label)).toBe(tone);
    render(<StatusPill label={label} />);
    expect(screen.getByText(label)).toHaveAttribute("data-tone", tone);
  });
});

describe("Field", () => {
  it("shows the red * from the start and says 'required' to assistive technology", () => {
    render(
      <Field label="Invoice amount" required>
        {(a) => <input {...a} className={inputClass()} />}
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: /Invoice amount/ });
    expect(input).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("(required)")).toHaveClass("sr-only");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("an error replaces the helper, is linked to the control, and marks it invalid", () => {
    const { rerender } = render(
      <Field label="Amount" helper="Unpaid: HKD 4,800.00">
        {(a) => <input {...a} />}
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Amount" });
    expect(input).toHaveAccessibleDescription("Unpaid: HKD 4,800.00");
    rerender(
      <Field label="Amount" helper="Unpaid: HKD 4,800.00" error="Enter HKD 4,800.00 or less.">
        {(a) => <input {...a} />}
      </Field>,
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter HKD 4,800.00 or less.");
    expect(screen.queryByText("Unpaid: HKD 4,800.00")).not.toBeInTheDocument();
  });

  it("draws the error ring only when invalid", () => {
    expect(inputClass(false)).toContain("border-border-input");
    expect(inputClass(true)).toContain("border-action-danger");
  });
});

describe("ErrorSummary", () => {
  it("stays out of the way for a single problem", () => {
    render(<ErrorSummary items={[{ fieldId: "a", message: "One." }]} attempt={1} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("with two or more, takes focus and links to each field", async () => {
    render(
      <>
        <input id="amount" aria-label="Amount" />
        <ErrorSummary
          items={[
            {
              fieldId: "amount",
              message: "The amount is still empty. Add the amount to continue.",
            },
            { fieldId: "supplier", message: "Choose a supplier to continue." },
          ]}
          attempt={1}
        />
      </>,
    );
    const box = screen.getByRole("alert");
    expect(box).toHaveFocus();
    await userEvent.click(screen.getByRole("link", { name: /amount is still empty/ }));
    expect(screen.getByLabelText("Amount")).toHaveFocus();
  });
});

describe("FilterChip and SegmentedControl", () => {
  it("a chip is a toggle with its count", () => {
    render(<FilterChip label="Returned" count={3} selected />);
    expect(screen.getByRole("button", { name: /Returned/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("arrow keys move the segmented choice", async () => {
    function Harness() {
      const [v, setV] = useState<"easy" | "table">("easy");
      return (
        <SegmentedControl
          label="View"
          value={v}
          onChange={setV}
          options={[
            { value: "easy", label: "Easy view" },
            { value: "table", label: "Table view" },
          ]}
        />
      );
    }
    render(<Harness />);
    const easy = screen.getByRole("radio", { name: "Easy view" });
    expect(easy).toHaveAttribute("aria-checked", "true");
    easy.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Table view" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Table view" })).toHaveFocus();
  });
});

describe("PageHeader", () => {
  it("draws the module art beside the one h1, out of the accessible name", () => {
    render(<PageHeader title="Payment Requests" art={<span aria-hidden data-testid="art" />} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveAccessibleName("Payment Requests");
    expect(screen.getByTestId("art").nextElementSibling).toBe(h1);
  });
});

describe("InlineAlert", () => {
  it("Danger interrupts (alert); the others are status", () => {
    const { rerender } = render(<InlineAlert tone="danger" title="This file did not upload." />);
    expect(screen.getByRole("alert")).toHaveTextContent("This file did not upload.");
    rerender(<InlineAlert tone="warning" title="Returned by Treasury." />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("Modal and Drawer", () => {
  it("a destructive modal focuses Cancel first, traps Tab and closes on Escape", async () => {
    const onClose = vi.fn();
    function Harness() {
      const cancel = useRef<HTMLButtonElement>(null);
      return (
        <Modal
          open
          role="alertdialog"
          onRequestClose={onClose}
          title="Void this payment?"
          description="The payment is removed from the request. Xero is updated."
          initialFocus={cancel}
          footer={
            <>
              <Button ref={cancel} onClick={onClose}>
                Cancel
              </Button>
              <Button kind="danger">Void payment</Button>
            </>
          }
        />
      );
    }
    render(<Harness />);
    expect(screen.getByRole("alertdialog", { name: "Void this payment?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Void payment" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("a drawer has a named close button and asks before closing", async () => {
    const ask = vi.fn();
    render(
      <Drawer open onRequestClose={ask} title="Record payment">
        <input aria-label="Amount" />
      </Drawer>,
    );
    expect(screen.getByRole("dialog", { name: "Record payment" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
