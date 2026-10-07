// The subscription notice on the way in: once per company per sign-in, and never in the way.
//
// STUBBED - Next alone. lib/__tests__/subscriptionNotice.test.ts pins the one-shot claim
// itself; what a browser adds is the part sessionStorage makes awkward to assert anywhere else:
// that a RELOAD in the same tab does not show it again, and that a new sign-in does.

import { expect, test } from '@playwright/test';

import { billListItem } from '../lib/__fixtures__/bills';
import {
  handoff,
  pagesOf,
  requireNextOnly,
  stubApi,
  stubCredentials,
  stubFlaskHub,
  stubSubscriptionNotice,
} from './helpers';

const creds = () => stubCredentials();

const NOTICE = {
  items: [
    {
      kind: 'past_due',
      severity: 'critical',
      module: 'Payment Request',
      module_code: 'PAYMENT_REQUEST',
      title: 'A payment did not go through',
      detail: 'Update the card to keep using Payment Request.',
      deadline: '2026-10-21',
    },
  ],
  can_manage: true,
  payer: { name: 'Olive Vine', email: 'olive@minty.test' },
  severity: 'critical',
  settings_path: `/entity/${creds().entityId}/settings/modules`,
};

const dialog = (page: import('@playwright/test').Page) =>
  page.getByRole('alertdialog', { name: 'Action needed' });

test.beforeEach(async ({ page }) => {
  await requireNextOnly();
  await stubFlaskHub(page);
  await stubApi(page, {
    bills: [billListItem({ id: 'b-1', reference: 'PR-0001', contact: 'Young Bros Transport', status: 'submitted' })],
  });
});

test('the notice appears once on the way in', async ({ page }) => {
  await stubSubscriptionNotice(page, NOTICE);

  await handoff(page, creds(), pagesOf(creds()).list);

  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('A payment did not go through');
  await expect(dialog(page)).toContainText('Update the card to keep using Payment Request.');
});

test('it offers the payer the way to fix it, through Minty', async ({ page }) => {
  await stubSubscriptionNotice(page, NOTICE);
  await handoff(page, creds(), pagesOf(creds()).list);

  const action = dialog(page).getByRole('link', { name: 'Go to subscription settings' });

  await expect(action).toBeVisible();
  const href = await action.getAttribute('href');
  expect(href).toContain(`/entity/${creds().entityId}/enter`);
  expect(decodeURIComponent(href!)).toContain(`/entity/${creds().entityId}/settings/modules`);
});

test('it is never in the way of the list', async ({ page }) => {
  await stubSubscriptionNotice(page, NOTICE);
  await handoff(page, creds(), pagesOf(creds()).list);

  await dialog(page).getByRole('button', { name: 'Dismiss' }).click();

  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole('button', { name: /Add Payment/ })).toBeEnabled();
});

test('a reload in the same sign-in does NOT show it again', async ({ page }) => {
  await stubSubscriptionNotice(page, NOTICE);
  await handoff(page, creds(), pagesOf(creds()).list);
  await dialog(page).getByRole('button', { name: 'Dismiss' }).click();

  await page.reload();
  // The search box, not the "All" tab: the status filter exists twice over (a tablist on a
  // desktop, a menu on a phone), so "All" is ambiguous.
  await expect(page.getByRole('searchbox')).toBeVisible();

  await expect(dialog(page)).toBeHidden();
});

test('a new sign-in shows it again', async ({ page }) => {
  // Keying by company alone made the flag per-TAB rather than per-login, so signing out and
  // back in left the notice suppressed here while Minty's dashboard correctly showed it again.
  await stubSubscriptionNotice(page, NOTICE);
  await handoff(page, creds(), pagesOf(creds()).list, { sid: 'sign-in-1' });
  await dialog(page).getByRole('button', { name: 'Dismiss' }).click();

  await handoff(page, creds(), pagesOf(creds()).list, { sid: 'sign-in-2' });

  await expect(dialog(page)).toBeVisible();
});

test('a notice that failed to load shows nothing and blocks nothing', async ({ page }) => {
  // Deliberately quiet: a notice is an interruption, not a feature.
  await page.route('**/subscription-notice', (route) => route.abort('failed'));

  await handoff(page, creds(), pagesOf(creds()).list);

  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add Payment/ })).toBeEnabled();
});

test('a company with nothing to report is not interrupted', async ({ page }) => {
  await stubSubscriptionNotice(page, { ...NOTICE, items: [] });

  await handoff(page, creds(), pagesOf(creds()).list);

  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('somebody who is not the payer is told who to ask instead', async ({ page }) => {
  await stubSubscriptionNotice(page, { ...NOTICE, can_manage: false });

  await handoff(page, creds(), pagesOf(creds()).list);

  await expect(dialog(page)).toContainText('managed by Olive Vine');
  await expect(dialog(page).getByRole('link', { name: 'Go to subscription settings' })).toHaveCount(0);
});
