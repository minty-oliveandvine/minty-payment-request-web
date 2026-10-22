// A payment request through the browser: created as a draft, submitted, opened, and acted on.
// The words asserted here ("Draft", "Payment Requested", the status tabs, the action labels)
// are what phase C8 must keep while bill_status/publish_state change underneath.
import { expect, test, type Page } from "@playwright/test";
import {
  addRequestLink,
  fixtures,
  handoff,
  moneyRegex,
  requireCredentials,
  requireStack,
  statusChip,
  xeroLive,
} from "./helpers";

const AMOUNT = 120.5;
const DESCRIPTION = `E2E printer paper ${Date.now()}`;
const FX = fixtures();

/** The Add page (`<list>/new`, since 2026-10-13 - it was a dialog): its one form. */
async function openAddPayment(page: Page) {
  await addRequestLink(page).click();
  await expect(page).toHaveURL(/\/payment-request\/new$/);
  await expect(page.getByRole("heading", { level: 1, name: "New payment request" })).toBeVisible();
  return page.locator("form");
}

/** A request's row in Easy view (the default): the supplier is the row's link. */
const rowOf = (page: Page, supplier: string) =>
  page
    .getByRole("list", { name: "Payment requests" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: supplier, exact: true }) })
    .first();

async function fillPayment(page: Page, dlg: ReturnType<Page["locator"]>) {
  await dlg.getByRole("textbox", { name: /amount/i }).fill(String(AMOUNT));
  await dlg.getByRole("textbox", { name: /description/i }).fill(DESCRIPTION);
  // supplier: a searchable combobox over the entity's synced contacts
  const supplier = dlg.getByRole("combobox", { name: /supplier/i });
  await supplier.click();
  await supplier.pressSequentially(FX.supplierQuery);
  await page.getByRole("option", { name: FX.supplierName, exact: true }).click();
  // account code: a combobox over the entity's bill account codes
  const account = dlg.getByRole("combobox", { name: /account code/i });
  await account.click();
  await page
    .getByRole("option", { name: new RegExp(FX.accountCode) })
    .first()
    .click();
}

test.describe.serial("payment request lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await requireStack();
    await handoff(page, requireCredentials(), "/");
  });

  test("a draft is saved and listed under Draft with its amount and supplier", async ({ page }) => {
    const dlg = await openAddPayment(page);
    await fillPayment(page, dlg);
    await dlg.getByRole("button", { name: /save as draft/i }).click();
    // a draft goes back to the list, with a toast
    await expect(page).toHaveURL(/\/payment-request$/);
    await statusChip(page, "Draft").click();
    // the row: "<supplier> ... HKD 120.50 of HKD 120.50 Draft Continue"
    const row = rowOf(page, FX.supplierName);
    await expect(row).toBeVisible();
    await expect(row).toContainText(moneyRegex(AMOUNT));
    await expect(row).toContainText(/draft/i);
  });

  for (const width of [360, 768, 1440]) {
    test(`a new supplier refused (no Xero) closes the menu and turns the field red - ${width}px`, async ({
      page,
    }) => {
      test.skip(xeroLive(), 'the shop is on Xero: "+ Add" would create a real contact');
      await page.setViewportSize({ width, height: 800 });
      const dlg = await openAddPayment(page);
      const supplier = dlg.getByRole("combobox", { name: /supplier/i });
      await supplier.click();
      await supplier.pressSequentially(`E2E New Supplier ${Date.now()}`);
      await page.getByRole("option", { name: /as a new supplier/i }).click();
      await expect(dlg.getByRole("alert").filter({ hasText: /xero/i })).toBeVisible();
      await expect(page.getByRole("listbox")).toBeHidden();
      await expect(supplier).toHaveAttribute("aria-invalid", "true");
      await expect(supplier).toHaveClass(/border-action-danger/);
      // editing the name clears the refusal
      await supplier.press("End");
      await supplier.press("Backspace");
      await expect(supplier).not.toHaveAttribute("aria-invalid", "true");
      await expect(dlg.getByRole("alert").filter({ hasText: /xero/i })).toBeHidden();
    });
  }

  test("the amount is required", async ({ page }) => {
    const dlg = await openAddPayment(page);
    await dlg.getByRole("button", { name: "Submit for payment" }).click();
    await expect(page).toHaveURL(/\/payment-request\/new$/); // still here: nothing was submitted
    await expect(
      dlg.getByRole("alert").filter({ hasText: "The amount is still empty." }).first(),
    ).toBeVisible();
  });

  test("submitting needs an attachment and a due date - the page says so and stays", async ({
    page,
  }) => {
    // Submitting for real uploads the attachment to the bucket; that path is covered by
    // minty-payment-request-api's API tests with the storage stubbed, not by a browser against a real
    // bucket. What the browser owns is the validation the person sees.
    const dlg = await openAddPayment(page);
    await fillPayment(page, dlg);
    await dlg.getByRole("button", { name: "Submit for payment" }).click();
    await expect(page).toHaveURL(/\/payment-request\/new$/);
    // two problems: a summary above the form takes focus and names both (Part 14 error summary)
    const summary = page.getByRole("alert").filter({ hasText: /details need a look/ });
    await expect(summary).toBeFocused();
    await expect(summary).toContainText("The invoice is still missing.");
    await expect(summary).toContainText("The due date is still empty.");
  });

  test("the draft opens on its detail page with the request and its actions", async ({ page }) => {
    await statusChip(page, "Draft").click();
    await rowOf(page, FX.supplierName)
      .getByRole("link", { name: FX.supplierName, exact: true })
      .click();
    // by its Payment No. since 2026-10-05 (the id when it has none)
    await expect(page).toHaveURL(/\/payment-request\/[^/?#]+(?:[?#]|$)/);
    const body = page.locator("body");
    await expect(body).toContainText(FX.supplierName);
    await expect(body).toContainText(moneyRegex(AMOUNT));
    await expect(body).toContainText(new RegExp(FX.accountCode));
    await expect(body).toContainText(/draft/i);
    // an admin can still edit or submit a draft
    await expect(page.getByRole("button", { name: "Submit for payment" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  });
});
