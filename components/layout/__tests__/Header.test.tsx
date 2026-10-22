// The App bar (components/layout/Header.tsx): where you are - the mark, the company, the way back.

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Header } from "../Header";

const bar = () => within(screen.getByRole("banner"));

describe("the App bar", () => {
  it("shows the Minty mark, as the hub does, not the module name as text", () => {
    render(<Header companyName="Shop" />);
    expect(bar().getByRole("img", { name: "Minty" })).toHaveAttribute("src", "/minty-mark.png");
    // The module name is still there for a screen reader, just not drawn.
    expect(bar().getByText("Payment Request")).toHaveClass("sr-only");
  });

  it("names the company", () => {
    render(<Header companyName="E2E Petty Cash Shop" />);
    expect(bar().getByText("E2E Petty Cash Shop")).toBeInTheDocument();
  });

  it("offers the way back in a drill-down", () => {
    render(<Header companyName="Shop" backHref="/list" backLabel="Payment Requests" />);
    expect(bar().getByRole("link", { name: "Back to Payment Requests" })).toHaveAttribute(
      "href",
      "/list",
    );
  });
});
