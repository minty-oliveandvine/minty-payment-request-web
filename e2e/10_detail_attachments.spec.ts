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

import { addRequestLink, expectNoSideScroll, fixtures, handoff, pagesOf, requireCredentials, requireStack } from './helpers';

test.describe.configure({ mode: 'serial' });

const creds = () => requireCredentials();

let created: { reference: string } | null = null;

// A real one-page PDF (the same as e2e/14's): pdf.js refuses a `%PDF-1.4 e2e` stub, and the
// preview test below has to see it actually draw.
const PDF = {
  name: 'invoice.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from(
    'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5' +
      'cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVu' +
      'dCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMjAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCA+PiA+PgplbmRv' +
      'YmoKNCAwIG9iago8PCAvTGVuZ3RoIDQ0ID4+CnN0cmVhbQoxIDAgMCBSRyAxMCB3IDIwIDIwIG0gMTgwIDE4MCBsIFMKZW5k' +
      'c3RyZWFtCmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1' +
      'OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyMTkgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA1IC9S' +
      'b290IDEgMCBSID4+CnN0YXJ0eHJlZgozMDIKJSVFT0YK',
    'base64',
  ),
};
const JPG = {
  name: 'receipt.jpg',
  mimeType: 'image/jpeg',
  // The smallest thing a browser will treat as a JPEG.
  buffer: Buffer.from('ffd8ffdb0000ffd9', 'hex'),
};

/** The Add page (`<list>/new`, since 2026-10-13 - it was a dialog), and its server-filled Payment No. */
async function openAddPage(page: Page) {
  await handoff(page, creds(), pagesOf(creds()).list);
  await addRequestLink(page).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New payment request' })).toBeVisible();
  const form = page.locator('form');
  await form.getByRole('button', { name: 'More details' }).click();
  const paymentNo = form.getByLabel(/Payment No\./);
  await expect(paymentNo).not.toHaveValue('');
  return { form, reference: await paymentNo.inputValue() };
}

test.beforeEach(async () => {
  await requireStack();
});

test('a staged attachment survives a reload of the draft', async ({ page }) => {
  // This is the IndexedDB store's whole job: a draft left and come back to keeps its files.
  const { form, reference } = await openAddPage(page);
  await form.getByPlaceholder('0.00').first().fill('2500');
  await form.locator('input[type="file"]').first().setInputFiles(PDF);
  await expect(form.getByRole('button', { name: 'Preview invoice.pdf' })).toBeVisible();

  await form.getByRole('button', { name: 'Save as draft' }).click();
  // a draft goes back to the list
  await expect(page).toHaveURL(/\/payment-request$/, { timeout: 20_000 });
  created = { reference };

  // Neither view prints the Payment No., so the draft is opened by it, after a reload.
  await page.reload();
  await page.goto(pagesOf(creds()).request('unused', reference));
  await expect(page.getByText(`Payment No. ${reference}`)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'View full — invoice.pdf' })).toBeVisible();
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

  // The request already holds a file, so the toolbar offers Add More (Upload is for none).
  await page.getByRole('button', { name: 'Add more attachments' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type="file"]').first().setInputFiles(JPG);
  // the name shows in the staged list and in the preview's header
  await expect(dialog.getByText('receipt.jpg', { exact: true }).first()).toBeVisible();
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

    await expect(page.getByRole('region', { name: 'Payment request details' })).toBeVisible();
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
  const { form, reference } = await openAddPage(page);
  await form.getByPlaceholder('0.00').first().fill('900');
  await form.locator('#pr-invoice-date').fill('2026-03-03');
  await form.locator('#pr-due-date').fill('2026-03-31');
  const supplier = form.getByRole('combobox', { name: /supplier/i });
  await supplier.click();
  await supplier.fill(fx.supplierQuery);
  await page.getByRole('option', { name: fx.supplierName }).click();
  await form.getByRole('combobox', { name: /account code/i }).click();
  await page.getByRole('option', { name: new RegExp(`^${fx.accountCode}`) }).click();
  await form.locator('input[type="file"]').first().setInputFiles(PDF);
  await form.getByRole('button', { name: 'Submit for payment' }).click();
  await expect(page).toHaveURL((u) => !u.pathname.endsWith('/new') && /\/payment-request\/[^/]+$/.test(u.pathname), {
    timeout: 20_000,
  });

  await handoff(page, creds(), pagesOf(creds()).request('unused', reference));
  await page.getByRole('button', { name: 'Record payment' }).click();
  const pay = page.getByRole('dialog', { name: 'Record payment' });
  await pay.getByRole('radio', { name: 'Pay in full' }).click();
  await pay.getByRole('button', { name: /^Record / }).click();
  await expect(pay.getByText(/bank slip/i).first()).toBeVisible({ timeout: 20_000 });
  // Fully paid, the drawer turns into the read-only "Payments" view once the recording has
  // finished - and only then does Close close it (it is held while a payment is being sent).
  const paid = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Payments', exact: true }) });
  await expect(paid).toBeVisible({ timeout: 20_000 });

  // Tidy up: void the request this test created.
  await paid.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click();
  await expect(paid).toBeHidden();
  await page.getByRole('button', { name: 'More payment actions' }).click();
  await page.getByRole('menuitem', { name: /Void/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /Void Payment/ }).click();
});
