// Paying a payment request, for real: record a payment, overpay and be refused, delete it, and
// watch the status roll back.
//
// LIVE STACK. These write rows, so they run in order (`describe.serial`) and against the seeded
// shop - `Minty/scripts/e2e_seed.py --print` before the run, as e2e/README.md says. There is no
// viewport sweep here on purpose: it writes a request per run, and three widths would write
// three.

import { expect, test, type Page } from '@playwright/test';

import { fixtures, handoff, moneyRegex, pagesOf, requireCredentials, requireStack } from './helpers';

test.describe.configure({ mode: 'serial' });

const AMOUNT = 4000;
const PART = 1500;

let created: { reference: string } | null = null;

const creds = () => requireCredentials();

/** Create a submitted request through the Add Payment dialog, and remember its Payment No. */
async function createRequest(page: Page): Promise<string> {
  const fx = fixtures();
  await handoff(page, creds(), pagesOf(creds()).list);
  await page.getByRole('button', { name: /Add Payment/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const reference = await dialog.getByLabel(/Payment No\./).inputValue();

  await dialog.getByPlaceholder('0.00').first().fill(String(AMOUNT));
  await dialog.getByLabel(/invoice date/i).fill('2026-03-03');
  await dialog.getByLabel(/due date/i).fill('2026-03-31');

  const supplier = dialog.getByPlaceholder('Select a supplier');
  await supplier.click();
  await supplier.fill(fx.supplierQuery);
  await page.getByRole('option', { name: fx.supplierName }).click();

  await dialog.getByRole('button', { name: /account code/i }).click();
  await page.getByRole('option', { name: new RegExp(`^${fx.accountCode}`) }).click();

  await dialog.locator('input[type="file"]').first().setInputFiles({
    name: 'invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 e2e'),
  });

  await dialog.getByRole('button', { name: /^Confirm/ }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  return reference;
}

test.beforeEach(async () => {
  await requireStack();
});

test('a request can be created and opened at its own address', async ({ page }) => {
  const reference = await createRequest(page);
  created = { reference };

  await page.goto(pagesOf(creds()).request('unused', reference));

  await expect(page.getByText(reference)).toBeVisible();
  await expect(page.getByText(/Payment Requested|Detailed Information/).first()).toBeVisible();
});

test('a Payment No. in the address resolves to the request', async ({ page }) => {
  test.skip(!created, 'the request was not created');

  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  // The address names the Payment No., and the page it opens is that request.
  expect(page.url()).toContain(encodeURIComponent(created!.reference));
  await expect(page.getByText(created!.reference)).toBeVisible();
});

test('a part payment leaves the request partially paid', async ({ page }) => {
  test.skip(!created, 'the request was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  await page.getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Partial Pay' }).click();
  await dialog.getByPlaceholder('0.00').fill(String(PART));
  await dialog.getByRole('button', { name: /Add Payment/ }).click();

  await expect(dialog.getByText(moneyRegex(AMOUNT - PART))).toBeVisible({ timeout: 20_000 });
});

test('more than what is left is refused, with the maximum named', async ({ page }) => {
  test.skip(!created, 'the request was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  await page.getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Partial Pay' }).click();
  await dialog.getByPlaceholder('0.00').fill(String(AMOUNT * 2));
  await dialog.getByRole('button', { name: /Add Payment/ }).click();

  await expect(dialog.getByRole('alert')).toContainText("more than what's left");
});

test('Full Pay is no longer offered once a part payment exists', async ({ page }) => {
  test.skip(!created, 'the request was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  await page.getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog');

  await expect(dialog.getByRole('button', { name: 'Full Pay' })).toBeDisabled();
});

test('deleting the payment rolls the request back off Partially Paid', async ({ page }) => {
  test.skip(!created, 'the request was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  await page.getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Remove this payment' }).first().click();

  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toHaveAccessibleName('Delete this payment?');
  await confirm.getByRole('button', { name: /^Delete/ }).click();

  // With no payment left, the whole amount is outstanding again.
  await expect(dialog.getByText(moneyRegex(AMOUNT))).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole('button', { name: 'Full Pay' })).toBeEnabled();
});

test('the request this spec created is voided, so the shop is left as it was found', async ({ page }) => {
  test.skip(!created, 'the request was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  await page.getByRole('button', { name: 'More payment actions' }).click();
  await page.getByRole('menuitem', { name: /Void/ }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByRole('button', { name: /Void Payment/ }).click();

  await expect(confirm).toBeHidden({ timeout: 20_000 });
});
