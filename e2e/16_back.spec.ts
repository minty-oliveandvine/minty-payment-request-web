// "‹ Back" on a payment request's details: to the page the person came from
// (`@minty/shared/backLink`) - the list, or the other request they came from - and to the list
// when nothing in this app came before (a link, a new tab). The list's tabs and filters live in
// the page, not the address, so the list comes back at its default view.
//
// STUBBED - Next alone.

import { expect, test, type Page } from "@playwright/test";

import { billListItem } from "../lib/__fixtures__/bills";
import {
  handoff,
  pagesOf,
  requireNextOnly,
  stubApi,
  stubCredentials,
  stubFlaskHub,
} from "./helpers";

const creds = () => stubCredentials();

const ROWS = [
  billListItem({
    id: "b-1",
    reference: "PR-0001",
    contact: "Young Bros Transport",
    status: "submitted",
    amount_due: "6000.00",
  }),
  billListItem({
    id: "b-2",
    reference: "PR-0002",
    contact: "ABC Furniture",
    status: "paid",
    amount_due: "0.00",
  }),
];

test.beforeEach(async ({ page }) => {
  await requireNextOnly();
  await stubFlaskHub(page);
  await stubApi(page, { bills: ROWS });
});

const back = (page: Page) => page.locator("header [data-back-link]");

test("from another request, Back returns to that request, not the list", async ({ page }) => {
  const first = pagesOf(creds()).request("b-1", "PR-0001");
  await handoff(page, creds(), first);
  await expect(page.getByText("Young Bros Transport").first()).toBeVisible();
  // as the payment history's link to another bill does
  await page.goto(pagesOf(creds()).request("b-2", "PR-0002"));
  await expect(back(page)).toBeVisible();

  await back(page).click();
  await expect(page).toHaveURL((url) => url.pathname === new URL(first, url).pathname);
  await expect(page.getByText("Young Bros Transport").first()).toBeVisible();
});

test("from the list, Back returns to the list", async ({ page }) => {
  await handoff(page, creds(), pagesOf(creds()).list);
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page.getByText("Young Bros Transport").first()).toBeVisible();
  const list = page.url();

  await page.getByText("Young Bros Transport").first().click();
  await expect(
    page
      .getByRole("heading", { name: "Payment Request Details" })
      .or(page.getByText("Payment Request Details"))
      .first(),
  ).toBeVisible();
  await expect(back(page)).toHaveText(/Back/);

  await back(page).click();
  await expect(page).toHaveURL(list);
  await expect(page.getByRole("searchbox")).toBeVisible();
});

test("with nothing before it in this app, Back goes to the list", async ({ page }) => {
  await handoff(page, creds(), pagesOf(creds()).request("b-1", "PR-0001"));
  await expect(page.getByText("Young Bros Transport").first()).toBeVisible();
  // a real link to the list: what a middle-click or a new tab opens
  await expect(back(page)).toHaveAttribute("href", pagesOf(creds()).list);

  await back(page).click();
  await expect(page).toHaveURL((url) => url.pathname === pagesOf(creds()).list);
  await expect(page.getByRole("searchbox")).toBeVisible();
});
