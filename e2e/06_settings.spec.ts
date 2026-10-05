// Payment Settings (`/entity/<shortid>/<name>/settings/payment-request`) - the one settings page this app keeps. Moved here unchanged from
// 03_payer_portal when the profile pages left for minty-web (2026-10-01).
import { expect, test } from '@playwright/test';
import { handoff, pagesOf, requireCredentials, requireStack } from './helpers';

test.describe('payment settings', () => {
  test.beforeEach(async ({ page }) => {
    await requireStack();
    await handoff(page, requireCredentials(), pagesOf(requireCredentials()).settings);
  });

  test('settings offers the payment account-code picker', async ({ page }) => {
    await page.goto(pagesOf(requireCredentials()).settings);
    await expect(page.getByRole('heading', { name: /payment account code/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible();
    // the codes seeded for the entity are offered
    await expect(page.locator('body')).toContainText(/429|408/);
  });
});
