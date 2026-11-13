// "Download CSV" on the bill list (components/payment-request/BillCsvDownload.tsx; owner,
// 2026-11-13): no dialog - the ticked bills, else every bill the filters show, through
// POST /bills/export.csv.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BillCsvDownload,
  CSV_DOWNLOADED,
  NOTHING_TO_DOWNLOAD,
  billsCsvFileName,
  billsCsvRange,
} from "@/components/payment-request/BillCsvDownload";
import { ToastProvider } from "@/components/Toast";
import { ApiError } from "@/lib/api";

const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (real) => ({
  ...(await real<typeof import("@/lib/api")>()),
  downloadBillsCsv: download,
}));

afterEach(() => vi.restoreAllMocks());

function show(ids: string[], ticked: boolean) {
  return render(
    <ToastProvider>
      <BillCsvDownload ids={ids} ticked={ticked} />
    </ToastProvider>,
  );
}

function stubSave() {
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  return vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
}

describe("Download CSV", () => {
  it("names the file by the list's date range, else today", () => {
    const day = "2026-11-13";
    const both = { start: "2026-10-01", end: "2026-10-31" };
    expect(billsCsvFileName(false, both, day)).toBe("bills_2026-10-01_to_2026-10-31.csv");
    expect(billsCsvFileName(true, both, day)).toBe("bills_selected_2026-10-01_to_2026-10-31.csv");
    expect(billsCsvFileName(false, { start: "2026-10-01" }, day)).toBe("bills_from_2026-10-01.csv");
    expect(billsCsvFileName(false, { end: "2026-10-31" }, day)).toBe("bills_to_2026-10-31.csv");
    expect(billsCsvFileName(false, {}, day)).toBe("bills_2026-11-13.csv");
    expect(billsCsvFileName(true, {}, day)).toBe("bills_selected_2026-11-13.csv");
  });

  it("with no date filter, the range is the bills' own first and last day", () => {
    const dates = ["2026-10-09", undefined, "2026-09-30", "2026-10-21"];
    expect(billsCsvRange(dates)).toEqual({ start: "2026-09-30", end: "2026-10-21" });
    // the filter's ends win; an open end comes from the bills
    expect(billsCsvRange(dates, { start: "2026-09-01", end: "2026-12-31" })).toEqual({
      start: "2026-09-01",
      end: "2026-12-31",
    });
    expect(billsCsvRange(dates, { start: "2026-10-01" })).toEqual({
      start: "2026-10-01",
      end: "2026-10-21",
    });
    expect(billsCsvRange([undefined])).toEqual({ start: undefined, end: undefined });
    expect(billsCsvFileName(false, billsCsvRange(dates), "2026-11-13")).toBe(
      "bills_2026-09-30_to_2026-10-21.csv",
    );
  });

  it("downloads the ticked bills at once - no dialog", async () => {
    const user = userEvent.setup();
    const saved = stubSave();
    download.mockResolvedValueOnce(new Blob(["Payment No.\n"]));
    show(["a", "b"], true);

    await user.click(screen.getByRole("button", { name: "Download CSV of 2 ticked bills" }));

    await waitFor(() => expect(download).toHaveBeenCalledWith({ ids: ["a", "b"] }));
    expect(saved).toHaveBeenCalled();
    expect(await screen.findByText(CSV_DOWNLOADED)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("with nothing ticked, downloads every bill the filters show", async () => {
    const user = userEvent.setup();
    stubSave();
    download.mockResolvedValueOnce(new Blob([""]));
    show(["a", "b", "c"], false);

    await user.click(screen.getByRole("button", { name: "Download CSV of the 3 bills shown" }));
    await waitFor(() => expect(download).toHaveBeenCalledWith({ ids: ["a", "b", "c"] }));
  });

  it("is held when the list is empty, and says why", () => {
    show([], false);
    const button = screen.getByRole("button", { name: "Download CSV" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(NOTHING_TO_DOWNLOAD);
  });

  it("a refusal shows the API's sentence", async () => {
    const user = userEvent.setup();
    download.mockRejectedValueOnce(
      new ApiError(404, "One of the bills isn't in this company any more."),
    );
    show(["a"], true);

    await user.click(screen.getByRole("button", { name: "Download CSV of 1 ticked bill" }));
    expect(
      await screen.findByText("One of the bills isn't in this company any more."),
    ).toBeInTheDocument();
  });
});
