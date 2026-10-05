// Arriving from Minty, the module gate, and the payment-request list's vocabulary.
import { expect, test } from '@playwright/test';
import { handoff, pagesOf, requireCredentials, requireStack } from './helpers';

// The status tabs ARE the bill_status vocabulary the redesign renames (voided -> void, and the
// dead members go). Pin the words the user sees today.
const STATUS_TABS = ['All', 'Payment Requested', 'Partially Paid', 'Returned', 'Paid', 'Draft', 'Voided'];

test.describe('handoff and list', () => {
  test.beforeEach(async () => {
    await requireStack();
  });

  test('without a token the app falls back to module selection', async ({ page }) => {
    await page.goto('/landing');
    await expect(page).toHaveURL(/\/module-selection/);
  });

  test('the handoff stores the token and opens the payment-request list for the entity', async ({ page }) => {
    const creds = requireCredentials();
    await handoff(page, creds, '/');
    // an old `next=/` lands on the company's own address (`/entity/<shortid>/<name>/payment-request`)
    await expect(page).toHaveURL((u) => u.pathname === pagesOf(creds).list);
    // exact: the route announcer also reads the tab title "Payment Request - <company>"
    await expect(page.getByText(creds.entityName, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Payment' })).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'billing_token')?.value).toBeTruthy();
    expect(cookies.find((c) => c.name === 'billing_entity_id')?.value).toBe(creds.entityId);
  });

  test('a page of another company is handed to Minty, which signs into that one', async ({ page }) => {
    const creds = requireCredentials();
    await handoff(page, creds, pagesOf(creds).list);
    // not this company's short id: the cookie holds one company, so Flask mints a token for the other
    const other = creds.entityId.startsWith('0') ? '1' : '0';
    const ref = `${other.repeat(8)}/another-shop`;
    for (const [path, flask] of [
      [`/entity/${ref}/payment-request`, `/entity/${ref}/payment-request`],
      [`/entity/${ref}/payment-request/abc`, `/entity/${ref}/payment-request?request=abc`],
      [`/entity/${ref}/settings/payment-request`, `/entity/${ref}/settings/payment-request`],
    ]) {
      const resp = await page.request.get(path, { maxRedirects: 0 });
      expect(resp.status()).toBe(307);
      expect(new URL(resp.headers()['location']).pathname + new URL(resp.headers()['location']).search).toBe(flask);
    }
  });

  test("an old or misspelt address moves to the company's own, query kept", async ({ page }) => {
    const creds = requireCredentials();
    await handoff(page, creds, pagesOf(creds).list);
    const pages = pagesOf(creds);
    const shortId = creds.entityId.slice(0, 8);
    for (const [path, target] of [
      ['/settings?tab=bill', `${pages.settings}?tab=bill`],
      [`/payment-request/${creds.entityId}`, pages.request(creds.entityId)],
      [`/entity/${shortId.toUpperCase()}/old-name/payment-request`, pages.list],
    ]) {
      const resp = await page.request.get(path, { maxRedirects: 0 });
      // 307, never 308: the target depends on the cookie, and a browser keeps a 308 for good
      expect(resp.status()).toBe(307);
      const location = new URL(resp.headers()['location'], 'http://x');
      expect(location.pathname + location.search).toBe(target);
    }
  });

  test('the status filter offers exactly the bill statuses', async ({ page }) => {
    const creds = requireCredentials();
    await handoff(page, creds, '/');
    const tabs = page.getByRole('tablist', { name: /filter by status/i }).getByRole('tab');
    await expect(tabs).toHaveText(STATUS_TABS);
    await tabs.filter({ hasText: 'Draft' }).click();
    await expect(tabs.filter({ hasText: 'Draft' })).toHaveAttribute('aria-selected', 'true');
  });

  test('the database entitlement, not the token claim, decides whether the module shows', async ({ page }) => {
    // lib/moduleClaims.ts refreshes entitlements from the backend; a stale claim in the JWT is
    // only the first paint. The E2E entity has the BILL module on, so it stays available.
    const creds = requireCredentials();
    await handoff(page, creds, '/', { billing_enabled: false });
    await expect(page.getByRole('button', { name: 'Add Payment' })).toBeVisible();
  });
});
