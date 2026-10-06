// Payment Settings (`/entity/<shortid>/<name>/settings/payment-request`) - the one settings page this app keeps. Moved here unchanged from
// 03_payer_portal when the profile pages left for minty-web (2026-10-01). The account codes are the
// company's Xero chart, shown only while it is live on Xero (2026-10-06); `/auth/xero-status` is
// stubbed either way, since the seeded shop has no Xero org.
import { expect, test } from '@playwright/test';
import { handoff, pagesOf, requireCredentials, requireStack, stubXeroStatus } from './helpers';

test.describe('payment settings', () => {
  test.beforeEach(async ({ page }) => {
    await requireStack();
    await handoff(page, requireCredentials(), pagesOf(requireCredentials()).settings);
  });

  test('settings offers the payment account-code picker', async ({ page }) => {
    await stubXeroStatus(page, true);
    await page.goto(pagesOf(requireCredentials()).settings);
    await expect(page.getByRole('heading', { name: /payment account code/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible();
    // the codes seeded for the entity are offered
    await expect(page.locator('body')).toContainText(/429|408/);
  });

  test('without Xero the card only says how to connect it (phone)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await stubXeroStatus(page, false);
    let codesRead = false;
    page.on('request', (r) => { if (r.url().includes('/entity-bill-accounts/')) codesRead = true; });
    await page.goto(pagesOf(requireCredentials()).settings);

    await expect(page.getByRole('heading', { name: /payment account code/i })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: "Xero isn't connected." })).toBeVisible();
    const link = page.getByRole('link', { name: 'Entity & Integration' }).last();
    await expect(link).toHaveAttribute('href', /\/entity\/[^/]+\/settings\/integration$/);
    await expect(page.getByRole('searchbox', { name: /search account code/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /save changes/i })).toHaveCount(0);
    expect(codesRead).toBe(false);
    // nothing spills sideways at 360 px
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
