// The date field (components/DateTextField.tsx).
//
// It is a native `<input type="date">` filling the whole field with a formatted "dd Mmm yyyy"
// overlay on top - not a typed mask. A tap anywhere opens the OS picker, which is the reason
// for the arrangement: showPicker() against a HIDDEN input is a no-op in iOS WebView.
//
// So the value is always ISO, and the only thing the overlay does is read it back.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DATE_TEXT_PLACEHOLDER, DateTextField } from "@/components/DateTextField";

const onChange = vi.fn<(iso: string) => void>();

const show = (props: Partial<Parameters<typeof DateTextField>[0]> = {}) =>
  render(
    <DateTextField
      id="invoice-date"
      value=""
      onChange={onChange}
      calendarAriaLabel="Invoice date"
      textInputClassName="text-input"
      calendarButtonClassName="calendar-button"
      {...props}
    />,
  );

const field = () => screen.getByLabelText("Invoice date") as HTMLInputElement;

describe("the field", () => {
  it("is a native date input, so every platform opens its own picker", () => {
    show();

    expect(field()).toHaveAttribute("type", "date");
    expect(field()).toHaveAttribute("id", "invoice-date");
  });

  it("holds the ISO value it was given", () => {
    show({ value: "2026-03-03" });

    expect(field().value).toBe("2026-03-03");
  });

  it("reports the ISO value the picker produced", () => {
    show();

    fireEvent.change(field(), { target: { value: "2026-03-03" } });

    expect(onChange).toHaveBeenCalledWith("2026-03-03");
  });

  it("reports an emptied field as an empty string, not as nothing", () => {
    show({ value: "2026-03-03" });

    fireEvent.change(field(), { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("what is shown on top", () => {
  it("is the date read back as dd Mmm yyyy", () => {
    show({ value: "2026-03-03" });

    expect(screen.getByText("03 Mar 2026")).toBeInTheDocument();
  });

  it("is the placeholder while the field is empty", () => {
    show();

    expect(DATE_TEXT_PLACEHOLDER).toBe("DD MM YYYY");
    expect(screen.getByText(DATE_TEXT_PLACEHOLDER)).toBeInTheDocument();
  });

  it("is the placeholder for a date the formatter will not stand behind", () => {
    show({ value: "2026-02-30" });

    expect(screen.getByText(DATE_TEXT_PLACEHOLDER)).toBeInTheDocument();
  });

  it("is hidden from a screen reader, which reads the input itself", () => {
    show({ value: "2026-03-03" });

    expect(screen.getByText("03 Mar 2026")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("the states", () => {
  it("takes no input while disabled", () => {
    show({ disabled: true, value: "2026-03-03" });

    expect(field()).toBeDisabled();
  });

  it("says so when the value is invalid", () => {
    show({ invalid: true });

    expect(field()).toHaveAttribute("aria-invalid", "true");
  });

  it("says nothing about validity when it is fine", () => {
    show();

    expect(field()).not.toHaveAttribute("aria-invalid");
  });

  it("wears the class the caller gave the field", () => {
    const { container } = show();

    expect(container.firstElementChild).toHaveClass("text-input");
  });
});
