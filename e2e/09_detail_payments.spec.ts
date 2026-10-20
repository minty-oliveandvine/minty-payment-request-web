// Paying a payment request, for real: record a payment, overpay and be refused, delete it, and
// watch the status roll back.
//
// LIVE STACK. These write rows, so they run in order (`describe.serial`) and against the seeded
// shop - `Minty/scripts/e2e_seed.py --print` before the run, as e2e/README.md says. There is no
// viewport sweep here on purpose: it writes a request per run, and three widths would write
// three.

import { expect, test, type Page } from '@playwright/test';

import { addRequestLink, fixtures, handoff, moneyRegex, pagesOf, requireCredentials, requireStack } from './helpers';

test.describe.configure({ mode: 'serial' });

const AMOUNT = 4000;
const PART = 1500;

let created: { reference: string } | null = null;

const creds = () => requireCredentials();

/** Create a submitted request on the Add page (`<list>/new`), and remember its Payment No. */
async function createRequest(page: Page): Promise<string> {
  const fx = fixtures();
  await handoff(page, creds(), pagesOf(creds()).list);
  await addRequestLink(page).click();
  const form = page.locator('form');
  await expect(page.getByRole('heading', { level: 1, name: 'New payment request' })).toBeVisible();

  // Payment No. sits under "More details" (optional, Part 15.3), filled in by the server.
  await form.getByRole('button', { name: 'More details' }).click();
  const paymentNo = form.getByLabel(/Payment No\./);
  await expect(paymentNo).not.toHaveValue('');
  const reference = await paymentNo.inputValue();

  await form.getByPlaceholder('0.00').first().fill(String(AMOUNT));
  await form.locator('#pr-invoice-date').fill('2026-03-03');
  await form.locator('#pr-due-date').fill('2026-03-31');

  const supplier = form.getByRole('combobox', { name: /supplier/i });
  await supplier.click();
  await supplier.fill(fx.supplierQuery);
  await page.getByRole('option', { name: fx.supplierName }).click();

  await form.getByRole('combobox', { name: /account code/i }).click();
  await page.getByRole('option', { name: new RegExp(`^${fx.accountCode}`) }).click();

  await form.locator('input[type="file"]').first().setInputFiles({
    name: 'invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 e2e'),
  });

  await form.getByRole('button', { name: 'Submit for payment' }).click();
  // Submitting opens the new request's own page.
  await expect(page).toHaveURL((u) => !u.pathname.endsWith('/new') && /\/payment-request\/[^/]+$/.test(u.pathname), {
    timeout: 20_000,
  });
  return reference;
}

/** The Record payment drawer (Part 15.17, D15-11), from the detail page's Primary. */
async function openRecordPayment(page: Page) {
  await page.getByRole('button', { name: 'Record payment' }).click();
  const drawer = page.getByRole('dialog', { name: 'Record payment' });
  await expect(drawer).toBeVisible();
  return drawer;
}

test.beforeEach(async () => {
  await requireStack();
});

test('a request can be created and opened at its own address', async ({ page }) => {
  const reference = await createRequest(page);
  created = { reference };

  await page.goto(pagesOf(creds()).request('unused', reference));

  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  await expect(page.getByText('Payment Requested').first()).toBeVisible();
});

test('a Payment No. in the address resolves to the request', async ({ page }) => {
  test.skip(!created, 'the request was not created');

  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  // The address names the Payment No., and the page it opens is that request.
  expect(page.url()).toContain(encodeURIComponent(created!.reference));
  await expect(page.getByText(created!.reference, { exact: true })).toBeVisible();
});

test('a part payment leaves the request partially paid', async ({ page }) => {
  test.skip(!created, 'the request was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  const dialog = await openRecordPayment(page);
  await dialog.getByRole('radio', { name: 'Part payment' }).click();
  await dialog.getByPlaceholder('0.00').fill(String(PART));
  await dialog.getByRole('button', { name: /^Record / }).click();

  // The drawer stays open; the payment is listed and the unpaid amount drops.
  await expect(dialog.getByText(moneyRegex(AMOUNT - PART)).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Payment of .* recorded/)).toBeVisible();
});

test('more than what is left is refused, with the maximum named', async ({ page }) => {
  test.skip(!created, 'the request was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  const dialog = await openRecordPayment(page);
  await dialog.getByRole('radio', { name: 'Part payment' }).click();
  await dialog.getByPlaceholder('0.00').fill(String(AMOUNT * 2));

  // Said as it is typed, naming the most it can be (Part 11) - nothing is sent.
  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText(moneyRegex(AMOUNT - PART));
  await expect(alert).toContainText('or less - that is what is unpaid.');
});

test('Pay in full is no longer offered once a part payment exists, and says why', async ({ page }) => {
  test.skip(!created, 'the request was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  const dialog = await openRecordPayment(page);

  await expect(dialog.getByRole('radio', { name: 'Pay in full' })).toBeDisabled();
  await expect(dialog.getByText('Part of this is paid already, so record the rest as a part payment.')).toBeVisible();
});

test('deleting the payment rolls the request back off Partially Paid', async ({ page }) => {
  test.skip(!created, 'the request was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  const dialog = await openRecordPayment(page);
  await dialog.getByRole('button', { name: 'Remove this payment' }).first().click();

  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toHaveAccessibleName('Delete this payment?');
  await confirm.getByRole('button', { name: /^Delete/ }).click();

  // With no payment left, the whole amount is outstanding again.
  await expect(dialog.getByText(moneyRegex(AMOUNT)).first()).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole('radio', { name: 'Pay in full' })).toBeEnabled();
});

test('the request this spec created is voided, so the shop is left as it was found', async ({ page }) => {
  test.skip(!created, 'the request was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  await page.getByRole('button', { name: 'More payment actions' }).click();
  await page.getByRole('menuitem', { name: /Void/ }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByRole('button', { name: /Void Payment/ }).click();

  await expect(confirm).toBeHidden({ timeout: 20_000 });
  // A void request is addressed by its id: its Payment No. may be reused by a live request, and
  // the by-reference lookup prefers the live one (lib/companyPaths.ts).
  await expect(page).toHaveURL(/\/payment-request\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  await page.reload();
  await expect(page.getByText('Voided').first()).toBeVisible();
});
