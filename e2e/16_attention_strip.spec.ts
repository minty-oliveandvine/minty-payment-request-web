// The list's "Needs attention" strip: what is overdue, due within a week or returned, and the
// tiles that filter the list down to it.
//
// STUBBED, like 08: every `/api/v1/**` call is answered from `lib/__fixtures__/bills.ts`, so this
// needs `npm run dev` and nothing else. It also carries the strip's 360/768/1440 sweep.

import { expect, test, type Page } from "@playwright/test";

import { billListItem } from "../lib/__fixtures__/bills";
import {
  expectNoSideScroll,
  handoff,
  pagesOf,
  requireNextOnly,
  stubApi,
  stubCredentials,
  stubFlaskHub,
} from "./helpers";

const creds = () => stubCredentials();

/** A Hong Kong calendar date `days` from today, as the API writes due dates. */
function hkDate(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(d);
}

const ROWS = [
  billListItem({
    id: "b-late",
    reference: "PR-LATE",
    contact: "Late Logistics",
    amount: "1200.00",
    amount_due: "1200.00",
    status: "submitted",
    due_date: hkDate(-3),
  }),
  billListItem({
    id: "b-soon",
    reference: "PR-SOON",
    contact: "Soon Supplies",
    amount: "640.00",
    amount_due: "640.00",
    status: "submitted",
    due_date: hkDate(2),
  }),
  billListItem({
    id: "b-later",
    reference: "PR-LATER",
    contact: "Later Linens",
    amount: "90.00",
    amount_due: "90.00",
    status: "submitted",
    due_date: hkDate(30),
  }),
  billListItem({
    id: "b-ret",
    reference: "PR-RET",
    contact: "Returned Goods Ltd",
    amount: "300.00",
    amount_due: "300.00",
    status: "returned",
    due_date: hkDate(20),
  }),
  billListItem({
    id: "b-paid",
    reference: "PR-PAID",
    contact: "Paid Early Co",
    amount: "500.00",
    amount_due: "0.00",
    status: "paid",
    due_date: hkDate(-10),
  }),
];

const strip = (page: Page) => page.getByRole("region", { name: "Needs attention" });
const tile = (page: Page, label: RegExp) => strip(page).getByRole("button", { name: label });
const visibleText = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).filter({ visible: true }).first();

async function openList(page: Page, rows = ROWS) {
  await stubApi(page, { bills: rows });
  await handoff(page, creds(), pagesOf(creds()).list);
  await expect(page.getByRole("searchbox")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await requireNextOnly();
  await stubFlaskHub(page);
});

test("the strip counts what needs the user and filters the list to it", async ({ page }) => {
  await openList(page);

  await expect(tile(page, /Overdue/)).toContainText("1");
  await expect(tile(page, /Due in 7 days/)).toContainText("1");
  await expect(tile(page, /Returned/)).toContainText("1");

  await tile(page, /Overdue/).click();
  await expect(tile(page, /Overdue/)).toHaveAttribute("aria-pressed", "true");
  await expect(visibleText(page, "Late Logistics")).toBeVisible();
  await expect(
    page.getByText("Soon Supplies", { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);

  // Pressing it again lets the whole list back.
  await tile(page, /Overdue/).click();
  await expect(visibleText(page, "Soon Supplies")).toBeVisible();
});

test("a quiet list says so in one line instead of three empty tiles", async ({ page }) => {
  await openList(page, [ROWS[2], ROWS[4]]);

  await expect(strip(page)).toContainText("Nothing is overdue or due this week.");
  await expect(strip(page).getByRole("button")).toHaveCount(0);
});

for (const width of [360, 768, 1440]) {
  test(`the strip fits the screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openList(page);
    await expect(tile(page, /Overdue/)).toBeVisible();

    await expectNoSideScroll(page, width);
    const box = await tile(page, /Overdue/).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    if (process.env.E2E_SHOTS_DIR) {
      await page.screenshot({
        path: `${process.env.E2E_SHOTS_DIR}/prw-overview-${width}.png`,
        fullPage: true,
      });
    }
  });
}
