// The select used everywhere (components/ThemedSelect.tsx).
//
// Two shapes, and they are not the same control: the ordinary one is a BUTTON that opens a
// listbox, the `searchable` one is a combobox input that filters as you type. A test (or an
// accessibility check) that looks for a combobox on the ordinary one finds nothing.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemedSelect, type ThemedSelectOption } from "@/components/ThemedSelect";

const OPTIONS: ThemedSelectOption[] = [
  { value: "429 - General Expenses", label: "429 - General Expenses" },
  { value: "200 - Sales", label: "200 - Sales" },
  { value: "310 - Cost of Goods Sold", label: "310 - Cost of Goods Sold" },
];

const onChange = vi.fn<(value: string) => void>();

const show = (props: Partial<Parameters<typeof ThemedSelect>[0]> = {}) =>
  render(
    <ThemedSelect
      id="account-code"
      value=""
      onChange={onChange}
      options={OPTIONS}
      ariaLabel="Account code"
      placeholder="Select account"
      {...props}
    />,
  );

const trigger = () => screen.getByRole("button", { name: "Account code" });
const listbox = () => screen.getByRole("listbox");

describe("the ordinary select", () => {
  it("is a button that opens a listbox", () => {
    show();

    expect(trigger()).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows the placeholder until something is chosen", () => {
    show();

    expect(trigger()).toHaveTextContent("Select account");
  });

  it("shows the chosen option's label", () => {
    show({ value: "200 - Sales" });

    expect(trigger()).toHaveTextContent("200 - Sales");
  });

  it("opens on a click and offers every option", async () => {
    show();

    await userEvent.click(trigger());

    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(within(listbox()).getAllByRole("option").map((o) => o.textContent)).toEqual(
      OPTIONS.map((o) => o.label),
    );
  });

  it("marks the chosen option as selected", async () => {
    show({ value: "200 - Sales" });

    await userEvent.click(trigger());

    expect(within(listbox()).getByRole("option", { name: "200 - Sales" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(listbox()).getByRole("option", { name: "429 - General Expenses" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("reports the value that was picked, and closes", async () => {
    show();
    await userEvent.click(trigger());

    await userEvent.click(screen.getByRole("option", { name: "310 - Cost of Goods Sold" }));

    expect(onChange).toHaveBeenCalledWith("310 - Cost of Goods Sold");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on Escape without choosing anything", async () => {
    show();
    await userEvent.click(trigger());

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on a click away without choosing anything", async () => {
    show();
    await userEvent.click(trigger());

    await userEvent.click(document.body);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens from the keyboard", async () => {
    show();

    trigger().focus();
    await userEvent.keyboard("{Enter}");

    expect(listbox()).toBeInTheDocument();
  });

  it("does nothing at all while disabled", async () => {
    show({ disabled: true });

    expect(trigger()).toBeDisabled();
    await userEvent.click(trigger());

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("says when the value is wrong", () => {
    show({ error: true });

    expect(trigger()).toHaveAttribute("aria-invalid", "true");
  });

  it("takes an empty option list without breaking", async () => {
    show({ options: [] });

    await userEvent.click(trigger());

    expect(within(listbox()).queryAllByRole("option")).toHaveLength(0);
  });
});

describe("the searchable select", () => {
  const searchBox = () => screen.getByRole("combobox", { name: "Account code" });

  it("is a combobox you can type in", () => {
    show({ searchable: true });

    expect(searchBox()).toHaveAttribute("aria-autocomplete", "list");
    expect(searchBox()).toHaveAttribute("aria-expanded", "false");
  });

  it("narrows the options as it is typed", async () => {
    show({ searchable: true });

    await userEvent.click(searchBox());
    await userEvent.type(searchBox(), "general");

    expect(within(listbox()).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "429 - General Expenses",
    ]);
  });

  it("matches on the code as well as the name", async () => {
    show({ searchable: true });

    await userEvent.click(searchBox());
    await userEvent.type(searchBox(), "310");

    expect(within(listbox()).getAllByRole("option")).toHaveLength(1);
  });

  it("reports the option that was picked", async () => {
    show({ searchable: true });
    await userEvent.click(searchBox());

    await userEvent.click(screen.getByRole("option", { name: "200 - Sales" }));

    expect(onChange).toHaveBeenCalledWith("200 - Sales");
  });

  it("shows the chosen value again once it is closed", () => {
    show({ searchable: true, value: "200 - Sales" });

    expect(searchBox()).toHaveValue("200 - Sales");
  });
});
