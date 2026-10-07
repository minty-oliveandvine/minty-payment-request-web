// The list's page strip (components/payment-request/PaymentRequestPagination.tsx).

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  PAGE_SIZE_OPTIONS,
  PaymentRequestPagination,
  buildPageItems,
} from "@/components/payment-request/PaymentRequestPagination";

const onPageChange = vi.fn<(page: number) => void>();
const onPageSizeChange = vi.fn<(size: number) => void>();

const show = (props: Partial<Parameters<typeof PaymentRequestPagination>[0]> = {}) =>
  render(
    <PaymentRequestPagination
      page={1}
      pageSize={10}
      totalItems={100}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      {...props}
    />,
  );

const pageNumbers = () =>
  screen
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label"))
    .filter((l): l is string => !!l && l.startsWith("Page "))
    .map((l) => l.replace("Page ", ""));

describe("buildPageItems", () => {
  it("shows every page while there are seven or fewer", () => {
    expect(buildPageItems(1, 1)).toEqual([1]);
    expect(buildPageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("collapses to first, the current page's neighbours, and last", () => {
    expect(buildPageItems(5, 20)).toEqual([1, "…", 4, 5, 6, "…", 20]);
  });

  it("keeps the run against the near end rather than stranding a single gap", () => {
    expect(buildPageItems(1, 20)).toEqual([1, 2, "…", 20]);
    expect(buildPageItems(2, 20)).toEqual([1, 2, 3, "…", 20]);
    expect(buildPageItems(20, 20)).toEqual([1, "…", 19, 20]);
    expect(buildPageItems(19, 20)).toEqual([1, "…", 18, 19, 20]);
  });
});

describe("the count", () => {
  it("reads as the range on this page out of the whole", () => {
    show({ page: 2, pageSize: 10, totalItems: 95 });
    expect(screen.getByText(/Showing 11–20 of 95 items/)).toBeInTheDocument();
  });

  it("ends the range at the total on the last, short page", () => {
    show({ page: 10, pageSize: 10, totalItems: 95 });
    expect(screen.getByText(/Showing 91–95 of 95 items/)).toBeInTheDocument();
  });

  it("reads as zero when there is nothing at all", () => {
    show({ totalItems: 0 });
    expect(screen.getByText(/Showing 0–0 of 0 items/)).toBeInTheDocument();
  });

  it("marks the count as a floor when the fetch loop hit its cap", () => {
    show({ totalItems: 2000, truncated: true });
    expect(screen.getByText(/of 2000\+ items/)).toBeInTheDocument();
  });
});

describe("the strip", () => {
  it("is not drawn at all for a single page", () => {
    show({ totalItems: 5, pageSize: 10 });
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("marks the page being shown", () => {
    show({ page: 3, totalItems: 50, pageSize: 10 });
    expect(screen.getByRole("button", { name: "Page 3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Page 2" })).not.toHaveAttribute("aria-current");
  });

  it("draws the collapsed strip for a long list", () => {
    show({ page: 5, totalItems: 200, pageSize: 10 });
    expect(pageNumbers()).toEqual(["1", "4", "5", "6", "20"]);
  });

  it("asks for the page that was pressed", async () => {
    show({ page: 5, totalItems: 200, pageSize: 10 });

    await userEvent.click(screen.getByRole("button", { name: "Page 20" }));

    expect(onPageChange).toHaveBeenCalledWith(20);
  });
});

describe("the arrows", () => {
  it("step one page either way", async () => {
    show({ page: 5, totalItems: 200, pageSize: 10 });

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(6);

    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it("are dead at the ends", () => {
    show({ page: 1, totalItems: 50, pageSize: 10 });
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  it("are dead at the far end too", () => {
    show({ page: 5, totalItems: 50, pageSize: 10 });
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });
});

describe("items per page", () => {
  it("offers ten, fifty and a hundred", () => {
    expect([...PAGE_SIZE_OPTIONS]).toEqual([10, 50, 100]);
    show();
    // ThemedSelect's non-searchable form is a button that opens a listbox, not a combobox -
    // the combobox role is only on its searchable variant's input.
    const trigger = screen.getByRole("button", { name: "Items per page" });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("gives each instance its own control, because both views mount one", () => {
    const first = render(
      <PaymentRequestPagination
        page={1}
        pageSize={10}
        totalItems={100}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    const second = render(
      <PaymentRequestPagination
        page={1}
        pageSize={10}
        totalItems={100}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    const ids = [first, second].map(
      (r) => r.container.querySelector("label")!.getAttribute("for"),
    );
    expect(ids[0]).not.toBe(ids[1]);
    second.unmount();
    first.unmount();
  });

  it("reports the size that was picked as a number", async () => {
    show();

    await userEvent.click(screen.getByRole("button", { name: "Items per page" }));
    await userEvent.click(screen.getByRole("option", { name: "50" }));

    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });
});
