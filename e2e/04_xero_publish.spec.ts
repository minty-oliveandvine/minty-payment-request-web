// Publishing a payment request to Xero, for real: the ACCPAY invoice, the attachment upload,
// and the token hand-off (minty-payment-request-api asks Minty for a live access token when the stored
// one has expired - the one contract nothing else in this suite exercises). Runs only with
// E2E_XERO=1, against a shop linked to a Xero Demo Company by hand; every run writes a real
// bill into that organisation, which is what a Demo Company is for.
import { expect, test } from '@playwright/test';
import { fixtures, handoff, moneyRegex, requireCredentials, requireStack, xeroLive } from './helpers';

const AMOUNT = 87.25;
const DESCRIPTION = `E2E toner cartridge ${Date.now()}`;

// the smallest PDF that opens: one empty page
const RECEIPT_PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'binary',
);

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

test.describe('publish to Xero', () => {
  test.skip(!xeroLive(), 'set E2E_XERO=1 against a shop connected to a Xero Demo Company');

  test('a confirmed payment request publishes and stays published after a reload', async ({ page }) => {
    test.setTimeout(180_000); // Xero round-trips: the contact lookup, the invoice, the attachment
    await requireStack();
    await handoff(page, requireCredentials(), '/');
    const fx = fixtures();

    // a complete request: amount, supplier, account, both dates and the attachment Confirm insists on
    await page.getByRole('button', { name: 'Add Payment' }).click();
    const dlg = page.getByRole('dialog', { name: /add payment request/i });
    await expect(dlg).toBeVisible();
    await dlg.getByRole('textbox', { name: /amount/i }).fill(String(AMOUNT));
    await dlg.getByRole('textbox', { name: /description/i }).fill(DESCRIPTION);
    const supplier = dlg.getByRole('textbox', { name: /supplier/i });
    await supplier.click();
    await supplier.pressSequentially(fx.supplierQuery);
    await page.getByRole('option', { name: fx.supplierName, exact: true }).click();
    const account = dlg.getByRole('combobox', { name: /account code/i });
    await account.click();
    await page.getByRole('option', { name: new RegExp(fx.accountCode) }).first().click();
    await dlg.locator('#pr-invoice-date').fill(isoDaysAgo(1));
    await dlg.locator('#pr-due-date').fill(isoDaysAgo(-14));
    await dlg.locator('input[aria-label="Choose files to attach"]').setInputFiles({
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
      buffer: RECEIPT_PDF,
    });
    await dlg.getByRole('button', { name: /^confirm$/i }).click();

    // Confirm submits the request and opens it
    // by its Payment No. since 2026-10-05 (the id when it has none)
    await expect(page).toHaveURL(/\/payment-request\/[^/?#]+(?:[?#]|$)/, { timeout: 30_000 });
    const body = page.locator('body');
    await expect(body).toContainText(fx.supplierName);
    await expect(body).toContainText(moneyRegex(AMOUNT));
    await expect(body).toContainText(/payment requested/i);

    // publish from the payment actions menu, and wait for Xero to answer
    await page.getByRole('button', { name: 'More payment actions' }).click();
    const menu = page.getByRole('menu', { name: 'Payment actions' });
    await expect(menu.getByRole('menuitem', { name: 'Publish', exact: true })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Publish', exact: true }).click();
    const busy = page.getByRole('status').filter({ hasText: /publishing/i });
    await expect(busy).toBeVisible();
    await expect(busy).toBeHidden({ timeout: 150_000 });
    // a failure arrives as an error toast that says why; surface it instead of a bare timeout
    // below. Only the toast: Next's route announcer is an alert too (it reads the page title)
    const errorToast = page.getByRole('alert').filter({ has: page.getByRole('img', { name: 'Error' }) });
    if ((await errorToast.count()) > 0) {
      throw new Error(`publish failed: ${(await errorToast.allInnerTexts()).join(' | ')}`);
    }

    // the menu now offers Republish, and still does after the page is loaded afresh
    await page.getByRole('button', { name: 'More payment actions' }).click();
    await expect(menu.getByRole('menuitem', { name: 'Republish', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'More payment actions' }).click();
    await expect(page.getByRole('menu', { name: 'Payment actions' }).getByRole('menuitem', { name: 'Republish', exact: true })).toBeVisible();
  });
});
