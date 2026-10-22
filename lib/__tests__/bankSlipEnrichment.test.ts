// The bank-slip details a paid row opens (lib/bankSlipEnrichment.ts) - here, the dates on them.
//
// Pins the Hong Kong date-and-time reckoning before it moves to @minty/shared (the shared-code
// refactor, 2026-10-21). "Created" is an instant shown on Hong Kong's clock; "When" is a payment
// DATE, read off the string without any timezone - two different rules, both pinned as they are.
// The amount is money and is pinned elsewhere, so it is left out of every assertion here.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { unsignedToken } from "@/lib/__fixtures__/tokens";
import type { PaymentAttachment, PaymentItem } from "@/lib/api";
import { setAuth } from "@/lib/auth";
import {
  buildBankSlipDetailsFromPaymentList,
  fetchBillBankSlipEnrichment,
  type BankSlipRowLabels,
} from "@/lib/bankSlipEnrichment";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";
const BILL_ID = "bill-1";

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const ROW: BankSlipRowLabels = {
  contactTitle: "Young Bros Transport",
  submittedDate: "01 Mar 2026",
  invoiceDate: "02 Mar 2026",
  paidDate: "  ",
  unpaidAmount: "0.00",
  currencyCode: "HKD",
};

function payment(overrides: Partial<PaymentItem> = {}): PaymentItem {
  return {
    id: "pay-1",
    bill_id: BILL_ID,
    payment_date: "2026-03-03",
    amount: "6000.00",
    currency_code: "HKD",
    payment_method: "bank_transfer",
    payment_status: "completed",
    reference_no: "",
    note: "",
    xero_payment_id: "",
    created_by: "Olive Vine",
    created_at: "2026-03-02T18:05:00Z",
    updated_at: "2026-03-02T18:05:00Z",
    ...overrides,
  };
}

function slip(
  id: string,
  linkCreatedAt: string,
  fileCreatedAt = "2026-01-01T00:00:00Z",
): PaymentAttachment {
  return {
    id,
    attachment_role: "bank_slip",
    sort_order: 0,
    note: "",
    created_at: linkCreatedAt,
    attachment: {
      id: `file-${id}`,
      original_name: `${id}.pdf`,
      mime_type: "application/pdf",
      file_size: 2048,
      file_extension: "pdf",
      storage_provider: "b2",
      created_at: fileCreatedAt,
      download_url: "",
    },
  };
}

/** Answers every attachments read with `slips`. */
function attachmentsAre(slips: PaymentAttachment[]) {
  fetchMock.mockImplementation(async () => answer(200, slips));
}

async function detailsFor(p: PaymentItem, row: BankSlipRowLabels = ROW) {
  const built = await buildBankSlipDetailsFromPaymentList(BILL_ID, [p], row);
  return built.bankSlipDetails!;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken(), ENTITY_ID, ENTITY_NAME);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Created - an instant on Hong Kong's clock", () => {
  beforeEach(() => attachmentsAre([slip("slip-1", "2026-03-02T18:05:00Z")]));

  it("rolls a UTC evening into the next Hong Kong day, with the time and the GMT+8 label", async () => {
    expect((await detailsFor(payment())).createdAt).toBe("03 Mar 2026, 02:05 GMT+8");
  });

  // owner 2026-10-21: one shared module (@minty/shared/dates) - "Sep", from the one month table
  // (it was Intl's "Sept").
  it("spells September 'Sep', as every other date does", async () => {
    const details = await detailsFor(payment({ created_at: "2026-09-01T02:00:00Z" }));
    expect(details.createdAt).toBe("01 Sep 2026, 10:00 GMT+8");
  });

  it("shows an unreadable timestamp exactly as it came", async () => {
    expect((await detailsFor(payment({ created_at: "not a date" }))).createdAt).toBe("not a date");
  });

  it("dates each file by its link's created_at, on the same clock", async () => {
    const details = await detailsFor(payment());
    expect(details.files[0].details).toEqual({ createdAt: "03 Mar 2026, 02:05 GMT+8" });
  });

  it("falls back to the file's own created_at when the link has none", async () => {
    attachmentsAre([slip("slip-1", "", "2026-03-04T01:00:00Z")]);
    const details = await detailsFor(payment());
    expect(details.files[0].details).toEqual({ createdAt: "04 Mar 2026, 09:00 GMT+8" });
  });
});

describe("When - the payment date, read with no timezone at all", () => {
  beforeEach(() => attachmentsAre([slip("slip-1", "2026-03-02T18:05:00Z")]));

  it.each([
    ["an ISO date", "2026-03-03", "03 Mar 2026"],
    [
      "a timestamp - its first ten characters, NOT the Hong Kong day",
      "2026-03-03T23:00:00Z",
      "03 Mar 2026",
    ],
    ["an impossible ISO date - kept as it came", "2026-02-30", "2026-02-30"],
    ["words - kept as they came", "garbage", "garbage"],
  ])("shows %s", async (_label, paymentDate, shown) => {
    expect((await detailsFor(payment({ payment_date: paymentDate }))).when).toBe(shown);
  });

  it("reads a non-ISO date on the LOCAL calendar", async () => {
    // Built from a string Date parses as local midnight, so it is the same day in any timezone.
    expect((await detailsFor(payment({ payment_date: "2026/03/03 00:00" }))).when).toBe(
      "03 Mar 2026",
    );
  });

  it("uses the row's paid date when the payment has none", async () => {
    const details = await detailsFor(payment({ payment_date: null }), {
      ...ROW,
      paidDate: " 05 Mar 2026 ",
    });
    expect(details.when).toBe("05 Mar 2026");
  });

  it("and the row's invoice date when the paid date is blank too", async () => {
    expect((await detailsFor(payment({ payment_date: null }))).when).toBe("02 Mar 2026");
  });
});

describe("the rest of the details", () => {
  it("fills who, to and from, with a dash where nothing is known", async () => {
    attachmentsAre([slip("slip-1", "2026-03-02T18:05:00Z")]);

    const details = await detailsFor(payment({ created_by: "  " }));

    expect(details).toMatchObject({
      createdBy: "—",
      toName: "Young Bros Transport",
      fromName: "—",
    });
  });

  it("counts each attachment once across the bill's payments, and ignores other bills' payments", async () => {
    attachmentsAre([
      slip("slip-1", "2026-03-02T18:05:00Z"),
      slip("slip-2", "2026-03-02T18:05:00Z"),
    ]);

    const built = await buildBankSlipDetailsFromPaymentList(
      BILL_ID,
      [
        payment({ id: "pay-1" }),
        payment({ id: "pay-2" }),
        payment({ id: "pay-3", bill_id: "other-bill" }),
      ],
      ROW,
    );

    expect(built.count).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(built.bankSlipDetails?.files.map((f) => f.fetchSource)).toEqual([
      {
        billId: BILL_ID,
        paymentId: "pay-1",
        attachmentId: "slip-1",
        fileAttachmentId: "file-slip-1",
      },
      {
        billId: BILL_ID,
        paymentId: "pay-1",
        attachmentId: "slip-2",
        fileAttachmentId: "file-slip-2",
      },
    ]);
  });

  it("is nothing at all when the bill has no payments, or its payments no files", async () => {
    await expect(buildBankSlipDetailsFromPaymentList(BILL_ID, [], ROW)).resolves.toEqual({
      count: 0,
      bankSlipDetails: null,
    });
    attachmentsAre([]);
    await expect(buildBankSlipDetailsFromPaymentList(BILL_ID, [payment()], ROW)).resolves.toEqual({
      count: 0,
      bankSlipDetails: null,
    });
  });
});

describe("fetchBillBankSlipEnrichment", () => {
  it("reports a failed lookup as failed, NOT as zero files, and logs it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(fetchBillBankSlipEnrichment(BILL_ID, ROW)).resolves.toEqual({
      bankslipFileCount: 0,
      failed: true,
    });
    expect(consoleError).toHaveBeenCalled();
  });

  it("is a plain zero when the bill has no payments", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { paid_total: "0.00", payments: [] }));

    await expect(fetchBillBankSlipEnrichment(BILL_ID, ROW)).resolves.toEqual({
      bankslipFileCount: 0,
    });
  });
});
