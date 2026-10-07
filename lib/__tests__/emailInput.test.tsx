// Email fields take English only (lib/emailInput.ts): the rule, the strip, and the IME wait.
//
// Ported verbatim from minty-web/lib/__tests__/emailInput.test.tsx - lib/emailInput.ts is a
// copy of minty-web's and the two differ only in their header comment, so the two suites must
// agree until the module is lifted into @minty/shared.

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  EMAIL_ASCII_HINT,
  isEmail,
  sanitizeEmailInput,
  useEmailInput,
} from "@/lib/emailInput";

function Harness() {
  const [value, setValue] = useState("");
  const email = useEmailInput(setValue);
  return (
    <>
      <input aria-label="Email" {...email.props} value={value} />
      {email.rejected && <p role="status">{EMAIL_ASCII_HINT}</p>}
      <span data-testid="state">{value}</span>
    </>
  );
}

describe("isEmail", () => {
  it("is shallow, but English only on both sides of the @", () => {
    expect(isEmail("a+b@sub.domain.museum")).toBe(true);
    expect(isEmail(" user@example.com ")).toBe(true);
    expect(isEmail("홍길동@example.com")).toBe(false);
    expect(isEmail("user@회사.com")).toBe(false);
    expect(isEmail("user@example")).toBe(false);
    expect(isEmail("a@b@c.com")).toBe(false);
  });
});

describe("sanitizeEmailInput", () => {
  it("keeps printable ASCII and drops the rest, spaces included", () => {
    expect(sanitizeEmailInput("한user@회사example.com")).toBe("user@example.com");
    expect(sanitizeEmailInput(" é a@b.co ")).toBe("a@b.co");
    expect(sanitizeEmailInput("a+b_c-d@x.io")).toBe("a+b_c-d@x.io");
  });
});

describe("useEmailInput", () => {
  it("is a text field with the email keyboard, not type=email", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "email");
    expect(input).toHaveAttribute("autocomplete", "email");
  });

  it("strips Korean after the @ as well as before it, and says why", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Email" });
    await userEvent.type(input, "가user@회example.com");
    expect(input).toHaveValue("user@example.com");
    expect(screen.getByTestId("state")).toHaveTextContent("user@example.com");
    // The hint is up after the last rejected key and clears on the next clean one.
    fireEvent.change(input, { target: { value: "user@example.com한" } });
    expect(screen.getByRole("status")).toHaveTextContent(EMAIL_ASCII_HINT);
    await userEvent.type(input, "x");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("strips a paste and keeps the caret where it was", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Email" }) as HTMLInputElement;
    // The prototype's setter, as a browser's paste does: React's own tracker must see a change.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "ab한한@c.com");
    input.setSelectionRange(4, 4);
    fireEvent.input(input);
    expect(input).toHaveValue("ab@c.com");
    expect(input.selectionStart).toBe(2);
  });

  it("waits for the IME composition to end before stripping", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Email" });
    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: "user@한" }, isComposing: true });
    expect(input).toHaveValue("user@한");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.compositionEnd(input);
    expect(input).toHaveValue("user@");
    expect(screen.getByTestId("state")).toHaveTextContent("user@");
    expect(screen.getByRole("status")).toHaveTextContent(EMAIL_ASCII_HINT);
  });
});
