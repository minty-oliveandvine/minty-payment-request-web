// A system superuser looking at a company they are not a member of: everything readable,
// nothing writable.
//
// STUBBED - Next alone. The token carries `system_role: 'superuser'` and `is_view_only: true`,
// which is what Minty stamps for a superuser with no `user_entity` row, and `/profile/me`
// answers with no memberships. Nothing here is a security claim: the API re-checks every call.
// What it proves is that the screen does not OFFER a write it would then be refused for -
// the state nothing covered before.

import { expect, test } from '@playwright/test';

import { billListItem } from '../lib/__fixtures__/bills';
import {
  expectNoSideScroll,
  handoff,
  pagesOf,
  requireNextOnly,
  stubApi,
  stubCredentials,
  stubFlaskHub,
} from './helpers';

const creds = () => stubCredentials();

const VIEW_ONLY = { system_role: 'superuser', is_view_only: true, role: 'admin' };

const ROWS = [
  billListItem({ id: 'b-1', reference: 'PR-0001', contact: 'Young Bros Transport', status: 'submitted', amount_due: '6000.00' }),
  billListItem({ id: 'b-2', reference: 'PR-0002', contact: 'ABC Furniture', status: 'paid', amount_due: '0.00' }),
];

const BANNER = 'Read-only access — you are not a member of this entity.';

test.beforeEach(async ({ page }) => {
  await requireNextOnly();
  await stubFlaskHub(page);
  await stubApi(page, { bills: ROWS, memberEntityIds: [] });
});

/** The list in TABLE view: it opens in easy view on a desktop, where the table is the hidden
 *  half (see e2e/08_list_filters.spec.ts). */
async function openList(page: import('@playwright/test').Page) {
  await handoff(page, creds(), pagesOf(creds()).list, VIEW_ONLY);
  await expect(page.getByRole('searchbox')).toBeVisible();

  const easyView = page.getByRole('switch', { name: 'Easy view' });
  if ((await easyView.getAttribute('aria-checked')) === 'true') await easyView.click();
  // And wait for a real row: the loading state draws skeleton rows, so a table on screen is
  // not the same as the list having arrived.
  await expect(page.getByRole('table').getByText('Young Bros Transport')).toBeVisible();
}

test('the list says the access is read-only', async ({ page }) => {
  await openList(page);

  await expect(page.getByText(BANNER)).toBeVisible();
});

test('the list is perfectly readable', async ({ page }) => {
  await openList(page);

  await expect(page.getByRole('table').getByText('Young Bros Transport')).toBeVisible();
  await expect(page.getByRole('table').getByText('ABC Furniture')).toBeVisible();
});

test('Add Payment is dead, and says why', async ({ page }) => {
  await openList(page);

  const add = page.getByRole('button', { name: /Add Payment/ });
  await expect(add).toBeDisabled();
  await expect(add).toHaveAttribute('title', "Hmm, I can't let you in there. You have view-only access.");
});

test('no row offers a payment to record', async ({ page }) => {
  await openList(page);

  const record = page
    .getByRole('table')
    .getByRole('button', { name: /Insufficient permissions|Record payment for/ });
  for (const button of await record.all()) {
    await expect(button).toBeDisabled();
  }
});

test('the request opens, and offers nothing to change', async ({ page }) => {
  await handoff(page, creds(), pagesOf(creds()).request('b-1', 'PR-0001'), VIEW_ONLY);

  await expect(page.getByText('Young Bros Transport').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeDisabled();
});

test('Payment Settings opens, and its ticks cannot be changed', async ({ page }) => {
  await handoff(page, creds(), pagesOf(creds()).settings, VIEW_ONLY);

  await expect(page.getByRole('heading', { name: 'Payment Account Code' })).toBeVisible();
  await expect(page.getByText(BANNER)).toBeVisible();
  await expect(page.getByRole('button', { name: /Save Changes/ })).toBeDisabled();
  for (const tick of await page.getByRole('checkbox', { name: /^Include / }).all()) {
    await expect(tick).toBeDisabled();
  }
});

for (const width of [360, 768, 1440]) {
  test(`the read-only banner fits the screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    // Not `openList`: the Easy view switch is desktop-only chrome, so toggling it is not a
    // thing a phone can do. The banner is what this test is about either way.
    await handoff(page, creds(), pagesOf(creds()).list, VIEW_ONLY);
    await expect(page.getByRole('searchbox')).toBeVisible();

    await expect(page.getByText(BANNER)).toBeVisible();
    await expectNoSideScroll(page, width);
  });
}
