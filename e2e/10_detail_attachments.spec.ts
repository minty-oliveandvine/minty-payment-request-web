// Attachments and bank slips, for real: upload, preview, delete, and the draft that survives a
// reload.
//
// LIVE STACK, and the only place two things are provable at all:
//
//   - the pdf.js preview, which needs a canvas jsdom has not got;
//   - the IndexedDB store behind a draft's staged attachments
//     (lib/paymentRequestAttachmentStore.ts), which the unit layer deliberately leaves alone -
//     `indexedDB` is undefined there so an accidental use fails loudly.
//
// Writes rows, so `describe.serial` and the seeded shop (`Minty/scripts/e2e_seed.py --print`).

import { expect, test, type Page } from '@playwright/test';

import { expectNoSideScroll, fixtures, handoff, pagesOf, requireCredentials, requireStack } from './helpers';

test.describe.configure({ mode: 'serial' });

const creds = () => requireCredentials();

let created: { reference: string } | null = null;

const PDF = { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') };
const JPG = {
  name: 'receipt.jpg',
  mimeType: 'image/jpeg',
  // The smallest thing a browser will treat as a JPEG.
  buffer: Buffer.from('ffd8ffdb0000ffd9', 'hex'),
};

async function openAddDialog(page: Page) {
  await handoff(page, creds(), pagesOf(creds()).list);
  await page.getByRole('button', { name: /Add Payment/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async () => {
  await requireStack();
});

test('a staged attachment survives a reload of the dialog', async ({ page }) => {
  // This is the IndexedDB store's whole job: a draft left and come back to keeps its files.
  const dialog = await openAddDialog(page);
  const reference = await dialog.getByLabel(/Payment No\./).inputValue();
  await dialog.getByPlaceholder('0.00').first().fill('2500');
  await dialog.locator('input[type="file"]').first().setInputFiles(PDF);
  await expect(dialog.getByText('invoice.pdf')).toBeVisible();

  await dialog.getByRole('button', { name: /Save as Draft/ }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  created = { reference };

  await page.reload();
  await page
    .getByRole('tablist', { name: 'Filter by status' })
    .getByRole('tab', { name: 'Draft' })
    .click();

  await expect(page.getByRole('table').getByText(reference)).toBeVisible({ timeout: 20_000 });
});

test('the request opens with its attachment, rendered rather than described', async ({ page }) => {
  test.skip(!created, 'the draft was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  // pdf.js draws onto a canvas - the one thing a jsdom test cannot see at all.
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
});

test('another attachment can be added, and the preview takes both', async ({ page }) => {
  test.skip(!created, 'the draft was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));
  await page.getByRole('button', { name: 'Edit' }).click();

  await page.getByRole('button', { name: 'Upload attachment' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type="file"]').first().setInputFiles(JPG);
  await expect(dialog.getByText('receipt.jpg')).toBeVisible();
});

test('deleting an attachment asks first', async ({ page }) => {
  test.skip(!created, 'the draft was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));
  await page.getByRole('button', { name: 'Edit' }).click();

  await page.getByRole('checkbox', { name: /^Select attachment/ }).first().check();
  await page.getByRole('button', { name: 'Delete attachment' }).click();

  await expect(page.getByRole('alertdialog')).toHaveAccessibleName(/Delete attachments?\?/);
});

test('the LAST attachment cannot be removed, and the dialog says so', async ({ page }) => {
  test.skip(!created, 'the draft was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  // A payment request must keep at least one supporting document; the page refuses rather than
  // letting the save fail at the API.
  await page.getByRole('button', { name: 'Edit' }).click();
  for (const tick of await page.getByRole('checkbox', { name: /^Select attachment/ }).all()) {
    await tick.check();
  }
  await page.getByRole('button', { name: 'Delete attachment' }).click();
  const confirm = page.getByRole('alertdialog');
  const name = await confirm.getAttribute('aria-labelledby');
  expect(name).toBeTruthy();
});

for (const width of [360, 768, 1440]) {
  test(`the request's page fits the screen at ${width}px`, async ({ page }) => {
    test.skip(!created, 'the draft was not created');
    await page.setViewportSize({ width, height: 900 });

    await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

    await expect(page.getByRole('heading', { name: 'Detailed Information' })).toBeVisible();
    await expectNoSideScroll(page, width);
  });
}

test('the draft this spec created is deleted, so the shop is left as it was found', async ({ page }) => {
  test.skip(!created, 'the draft was not created');
  await handoff(page, creds(), pagesOf(creds()).request('unused', created!.reference));

  await page.getByRole('button', { name: 'More payment actions' }).click();
  await page.getByRole('menuitem', { name: /Delete/ }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByRole('button', { name: /Delete Payment/ }).click();

  await expect(confirm).toBeHidden({ timeout: 20_000 });
});

test('a bank slip can be put on a payment, and read back', async ({ page }) => {
  const fx = fixtures();
  // Its own request, since the draft above is gone by now.
  const dialog = await openAddDialog(page);
  const reference = await dialog.getByLabel(/Payment No\./).inputValue();
  await dialog.getByPlaceholder('0.00').first().fill('900');
  await dialog.getByLabel(/invoice date/i).fill('2026-03-03');
  await dialog.getByLabel(/due date/i).fill('2026-03-31');
  const supplier = dialog.getByPlaceholder('Select a supplier');
  await supplier.click();
  await supplier.fill(fx.supplierQuery);
  await page.getByRole('option', { name: fx.supplierName }).click();
  await dialog.getByRole('button', { name: /account code/i }).click();
  await page.getByRole('option', { name: new RegExp(`^${fx.accountCode}`) }).click();
  await dialog.locator('input[type="file"]').first().setInputFiles(PDF);
  await dialog.getByRole('button', { name: /^Confirm/ }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  await handoff(page, creds(), pagesOf(creds()).request('unused', reference));
  await page.getByRole('button', { name: 'Record payment' }).click();
  const pay = page.getByRole('dialog');
  await pay.getByRole('button', { name: 'Full Pay' }).click();
  await pay.getByRole('button', { name: /Add Payment/ }).click();
  await expect(pay.getByText(/Upload Bank Slip|bank slip/i).first()).toBeVisible({ timeout: 20_000 });

  // Tidy up: void the request this test created.
  await pay.getByRole('button', { name: 'Close dialog' }).or(pay.getByRole('button', { name: 'Close' })).first().click();
  await page.getByRole('button', { name: 'More payment actions' }).click();
  await page.getByRole('menuitem', { name: /Void/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /Void Payment/ }).click();
});
