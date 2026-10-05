// A payment request through the browser: created as a draft, submitted, opened, and acted on.
// The words asserted here ("Draft", "Payment Requested", the status tabs, the action labels)
// are what phase C8 must keep while bill_status/publish_state change underneath.
import { expect, test, type Page } from '@playwright/test';
import { fixtures, handoff, moneyRegex, requireCredentials, requireStack } from './helpers';

const AMOUNT = 120.5;
const DESCRIPTION = `E2E printer paper ${Date.now()}`;
const FX = fixtures();

async function openAddPayment(page: Page) {
  await page.getByRole('button', { name: 'Add Payment' }).click();
  const dlg = page.getByRole('dialog', { name: /add payment request/i });
  await expect(dlg).toBeVisible();
  return dlg;
}

async function fillPayment(page: Page, dlg: ReturnType<Page['getByRole']>) {
  await dlg.getByRole('textbox', { name: /amount/i }).fill(String(AMOUNT));
  await dlg.getByRole('textbox', { name: /description/i }).fill(DESCRIPTION);
  // supplier: a searchable input over the entity's synced contacts
  const supplier = dlg.getByRole('textbox', { name: /supplier/i });
  await supplier.click();
  await supplier.pressSequentially(FX.supplierQuery);
  await page.getByRole('option', { name: FX.supplierName, exact: true }).click();
  // account code: a combobox over the entity's bill account codes
  const account = dlg.getByRole('combobox', { name: /account code/i });
  await account.click();
  await page.getByRole('option', { name: new RegExp(FX.accountCode) }).first().click();
}

test.describe.serial('payment request lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await requireStack();
    await handoff(page, requireCredentials(), '/');
  });

  test('a draft is saved and listed under Draft with its amount and supplier', async ({ page }) => {
    const dlg = await openAddPayment(page);
    await fillPayment(page, dlg);
    await dlg.getByRole('button', { name: /save as draft/i }).click();
    await expect(dlg).toBeHidden();
    await page.getByRole('tab', { name: 'Draft' }).click();
    // each request is a link: "<supplier> <date> ... HKD 120.50 (Inv total HKD 120.50) Draft"
    const row = page.getByRole('link', { name: new RegExp(FX.supplierName) }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(moneyRegex(AMOUNT));
    await expect(row).toContainText(/draft/i);
  });

  test('the amount is required', async ({ page }) => {
    const dlg = await openAddPayment(page);
    await dlg.getByRole('button', { name: /^confirm$/i }).click();
    await expect(dlg).toBeVisible(); // still open: nothing was submitted
  });

  test('confirming needs an attachment and a due date - the dialog says so and stays open', async ({ page }) => {
    // Submitting for real uploads the attachment to the bucket; that path is covered by
    // minty-payment-request-api's API tests with the storage stubbed, not by a browser against a real
    // bucket. What the browser owns is the validation the person sees.
    const dlg = await openAddPayment(page);
    await fillPayment(page, dlg);
    await dlg.getByRole('button', { name: /^confirm$/i }).click();
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('alert').filter({ hasText: /attachment/i })).toBeVisible();
    await expect(dlg.getByRole('alert').filter({ hasText: /due date/i })).toBeVisible();
  });

  test('the draft opens on its detail page with the request and its actions', async ({ page }) => {
    await page.getByRole('tab', { name: 'Draft' }).click();
    await page.getByRole('link', { name: new RegExp(FX.supplierName) }).first().click();
    // by its Payment No. since 2026-10-05 (the id when it has none)
    await expect(page).toHaveURL(/\/payment-request\/[^/?#]+(?:[?#]|$)/);
    const body = page.locator('body');
    await expect(body).toContainText(FX.supplierName);
    await expect(body).toContainText(moneyRegex(AMOUNT));
    await expect(body).toContainText(new RegExp(FX.accountCode));
    await expect(body).toContainText(/draft/i);
    // an admin can still edit or delete a draft
    await expect(page.getByRole('button', { name: /edit|delete|submit/i }).first()).toBeVisible();
  });
});
