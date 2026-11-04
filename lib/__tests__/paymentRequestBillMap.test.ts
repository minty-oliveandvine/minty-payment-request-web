// What an edited payment request sends back (lib/paymentRequestBillMap.ts).
//
// A request is one line on the API: the bill's own fields and that line's. The 2026-11-03 walk
// edited a request's description and published it: the bill said the new words and the line,
// which is what reaches Xero, still said the old ones.

import { describe, expect, it } from "vitest";

import type { LineItem } from "@/lib/api";
import { bill } from "@/lib/__fixtures__/bills";
import { billToDetailedInfo, buildBillUpdatePayload } from "@/lib/paymentRequestBillMap";

const line = (overrides: Partial<LineItem> = {}): LineItem => ({
  id: "line-1",
  description: "Printer paper",
  quantity: "1",
  unit_amount: "6000.00",
  line_amount: "6000.00",
  account_code: "429",
  account_name: "General Expenses",
  tax_type: "",
  sort_order: 0,
  note: "",
  created_at: "2026-03-03T02:00:00Z",
  updated_at: "2026-03-03T02:00:00Z",
  ...overrides,
});

describe("buildBillUpdatePayload", () => {
  it("gives the line the edited description, so Xero gets the words on screen", () => {
    const saved = bill({ description: "Printer paper", line_items: [line()] });
    const draft = { ...billToDetailedInfo(saved, 2), description: "Printer paper and toner" };

    const payload = buildBillUpdatePayload(saved, draft, 2);

    expect(payload.description).toBe("Printer paper and toner");
    expect(payload.line_items?.[0].description).toBe("Printer paper and toner");
  });

  it("keeps the line's account and amount alongside", () => {
    const saved = bill({ line_items: [line()] });
    const draft = { ...billToDetailedInfo(saved, 2), amount: "7,500.50" };

    const payload = buildBillUpdatePayload(saved, draft, 2);

    expect(payload.line_items?.[0]).toMatchObject({
      account_code: "429",
      account_name: "General Expenses",
      unit_amount: "7500.50",
      line_amount: "7500.50",
    });
  });
});
