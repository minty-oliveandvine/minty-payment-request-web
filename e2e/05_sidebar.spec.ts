// The sidebar - the menu and My Profile - copied from minty-web on 2026-09-30
// (components/ui/Sidebar.tsx, features/profile). What is pinned is how THIS app draws it and where
// its items lead from here; Flask's /api/me/profile and minty-subscription-api's /api/me/subscriptions
// are stubbed (their own suites pin the data), and so are Flask's /logout and the backend's
// logout call, so no run signs anybody out.
import { expect, test, type Page, type Route } from '@playwright/test';
import { PAYMENT_REQUEST_API_URL, PETTY_CASH_URL, handoff, pagesOf, requireCredentials, requireStack, type Credentials } from './helpers';

const SUBSCRIPTION_API_URL = process.env.E2E_SUBSCRIPTION_API_URL || 'http://localhost:8000';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, PATCH, OPTIONS',
};

type ProfileBody = {
  user: { id: string; first_name: string; last_name: string; name: string; initials: string; email: string };
  entity: { id: string; name: string; role: string; role_label: string; modules: string[] } | null;
};

function profileOf(creds: Credentials, first = 'Olive'): ProfileBody {
  return {
    user: { id: creds.userId, first_name: first, last_name: 'Vine', name: `${first} Vine`, initials: `${first[0]}V`, email: 'olive@example.test' },
    entity: { id: creds.entityId, name: creds.entityName, role: 'admin', role_label: 'Admin', modules: ['PAYMENT_REQUEST', 'PETTY_CASH'] },
  };
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** One company paid for, one with a trial ending in five days - figures 1 and 1. */
const SUBSCRIPTIONS = {
  entities: [
    { entity_id: 'e-1', entity_name: 'Paid Co', modules: [{ code: 'PETTY_CASH', name: 'Petty Cash', status: 'active', date_iso: inDays(20) }] },
    { entity_id: 'e-2', entity_name: 'Trial Co', modules: [{ code: 'PAYMENT_REQUEST', name: 'Payment Request', status: 'trialing', date_iso: inDays(5) }] },
  ],
  pages: 1,
};

type Stubs = { profile: ProfileBody; patches: unknown[]; patchAnswer?: { status: number; body: unknown } };

async function stubReads(page: Page, creds: Credentials, subscriptions: { status: number; body: unknown } = { status: 200, body: SUBSCRIPTIONS }): Promise<Stubs> {
  const stubs: Stubs = { profile: profileOf(creds), patches: [] };
  await page.route(`${PETTY_CASH_URL}/api/me/profile**`, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (request.method() === 'PATCH') {
      stubs.patches.push(request.postDataJSON());
      if (stubs.patchAnswer) {
        return route.fulfill({ status: stubs.patchAnswer.status, headers: CORS, contentType: 'application/json', body: JSON.stringify(stubs.patchAnswer.body) });
      }
      const changes = request.postDataJSON() as { first_name?: string };
      stubs.profile = profileOf(creds, changes.first_name ?? stubs.profile.user.first_name);
    }
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(stubs.profile) });
  });
  await page.route(`${SUBSCRIPTION_API_URL}/api/me/subscriptions**`, (route: Route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({ status: subscriptions.status, headers: CORS, contentType: 'application/json', body: JSON.stringify(subscriptions.body) }),
  );
  return stubs;
}

test.describe('the sidebar', () => {
  test.beforeEach(async () => {
    await requireStack();
  });

  test('the initials open My Profile over the page, and its ‹ goes back to the menu', async ({ page }) => {
    const creds = requireCredentials();
    await stubReads(page, creds);
    await handoff(page, creds, '/');

    const badge = page.getByRole('banner').getByRole('button', { name: 'Olive Vine, My Profile', exact: true });
    await expect(badge).toHaveText('OV');
    await badge.click();

    const profile = page.getByRole('region', { name: 'My Profile', exact: true });
    await expect(profile.getByRole('heading', { name: 'Olive Vine' })).toBeVisible();
    await expect(profile.getByText(creds.entityName, { exact: true })).toBeVisible();
    await expect(profile.getByText('SuperMinty', { exact: true })).toBeVisible();
    await expect(profile.getByText('Admin', { exact: true })).toBeVisible();
    // 440 px from 640 px up (minty-web's width), never scrolling sideways
    const panel = page.locator('section[aria-label="My Profile"]').locator('xpath=..');
    await expect.poll(async () => Math.round((await panel.boundingBox())?.width ?? 0)).toBe(440);
    expect(await panel.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);

    const card = profile.getByRole('region', { name: 'Subscriptions Overview' });
    await expect(card.getByText('Active subscriptions')).toBeVisible();
    await expect(card).toContainText('Active subscriptions1entity');
    await expect(card).toContainText('Trial ending1entity');
    await expect(card.getByRole('link', { name: 'Manage Subscription' })).toHaveAttribute(
      'href',
      new RegExp(`^${PETTY_CASH_URL}/entity/${creds.entityId}/enter\\?token=.+&next=${encodeURIComponent('/handoff/minty-web?next=%2Fsubscription').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    );

    await profile.getByRole('button', { name: 'Back to the menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
    await expect(badge).toBeFocused();
  });

  test("the menu leads where this app's should - Settings to this app's own settings", async ({ page }) => {
    const creds = requireCredentials();
    await stubReads(page, creds);
    await handoff(page, creds, '/');

    await page.getByRole('banner').getByRole('button', { name: 'Open navigation menu' }).click();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav).toBeVisible();
    const enter = `${PETTY_CASH_URL}/entity/${creds.entityId}/enter?token=`;

    await expect(nav.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', pagesOf(creds).settings);
    await expect(nav.getByRole('link', { name: 'Bills', exact: true })).toHaveAttribute('href', pagesOf(creds).list);
    const select = await nav.getByRole('link', { name: 'Select Entity', exact: true }).getAttribute('href');
    expect(select?.startsWith(enter) && select.endsWith(`&next=${encodeURIComponent('/entity')}`)).toBe(true);
    const reports = await nav.getByRole('link', { name: 'Reports', exact: true }).getAttribute('href');
    expect(reports?.startsWith(enter) && reports.endsWith(`&next=${encodeURIComponent(`/entity/${creds.entityId}/petty-cash/reports`)}`)).toBe(true);
    await expect(nav.getByRole('group', { name: 'Petty Cash' })).toBeVisible();
    await expect(nav.getByRole('group', { name: 'Payment Request' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();

    // the person's name switches the same drawer to My Profile
    await nav.getByRole('button', { name: 'Olive Vine, My Profile' }).click();
    await expect(page.getByRole('region', { name: 'My Profile', exact: true }).getByRole('heading', { name: 'Olive Vine' })).toBeVisible();
  });

  test('a save sends only what changed, and the header shows the new name at once', async ({ page }) => {
    const creds = requireCredentials();
    const stubs = await stubReads(page, creds);
    await handoff(page, creds, '/');

    await page.getByRole('banner').getByRole('button', { name: 'Olive Vine, My Profile', exact: true }).click();
    const profile = page.getByRole('region', { name: 'My Profile', exact: true });
    await profile.getByRole('button', { name: 'Edit' }).click();
    const first = profile.getByRole('textbox', { name: 'FIRST NAME' });
    await first.fill('Una');
    await profile.getByRole('button', { name: 'Save' }).click();

    await expect(profile.getByRole('heading', { name: 'Una Vine' })).toBeVisible();
    expect(stubs.patches).toEqual([{ first_name: 'Una' }]);
    await expect(page.getByRole('banner').getByRole('button', { name: 'Una Vine, My Profile', exact: true })).toHaveText('UV');
    await expect(page.getByText('Your profile is saved.')).toBeVisible();
  });

  test("a refusal is Flask's own sentence, shown in the card with what was typed", async ({ page }) => {
    const creds = requireCredentials();
    const stubs = await stubReads(page, creds);
    stubs.patchAnswer = { status: 422, body: { error: 'That email address is already in use.' } };
    await handoff(page, creds, '/');

    await page.getByRole('banner').getByRole('button', { name: 'Olive Vine, My Profile', exact: true }).click();
    const profile = page.getByRole('region', { name: 'My Profile', exact: true });
    await profile.getByRole('button', { name: 'Edit' }).click();
    await profile.getByRole('textbox', { name: 'Email' }).fill('taken@example.test');
    await profile.getByRole('button', { name: 'Save' }).click();

    await expect(profile.getByRole('alert')).toHaveText('That email address is already in use.');
    await expect(profile.getByRole('textbox', { name: 'Email' })).toHaveValue('taken@example.test');
  });

  test('a failed subscriptions read - a 404 too, there is no dark switch - says so in the card, and Try again re-reads', async ({ page }) => {
    const creds = requireCredentials();
    let reads = 0;
    let answer = { status: 404, body: { error: 'not_found' } as unknown };
    await stubReads(page, creds);
    // registered after stubReads, so it answers first (Playwright runs the newest route first)
    await page.route(`${SUBSCRIPTION_API_URL}/api/me/subscriptions**`, (route: Route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      reads += 1;
      return route.fulfill({ status: answer.status, headers: CORS, contentType: 'application/json', body: JSON.stringify(answer.body) });
    });
    await handoff(page, creds, '/');

    await page.getByRole('banner').getByRole('button', { name: 'Olive Vine, My Profile', exact: true }).click();
    const profile = page.getByRole('region', { name: 'My Profile', exact: true });
    await expect(profile.getByRole('heading', { name: 'Olive Vine' })).toBeVisible();
    const card = profile.getByRole('region', { name: 'Subscriptions Overview' });
    await expect(card.getByRole('alert')).toHaveText(/Your subscriptions didn't load\. Mind trying again\?/);
    await expect(card.getByRole('link', { name: 'Manage Subscription' })).toHaveCount(0);

    const before = reads;
    answer = { status: 200, body: SUBSCRIPTIONS };
    await card.getByRole('button', { name: 'Try again' }).click();
    await expect(card).toContainText('Active subscriptions1entity');
    expect(reads).toBeGreaterThan(before);
  });

  test("Logout ends the session everywhere: this app's cookies go, then Minty's /logout", async ({ page }) => {
    const creds = requireCredentials();
    await stubReads(page, creds);
    await page.route(`${PAYMENT_REQUEST_API_URL}/api/v1/auth/logout`, (route) => route.fulfill({ status: 204, headers: CORS }));
    await page.route(`${PETTY_CASH_URL}/logout`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Minty logout stub</title>' }));
    await handoff(page, creds, '/');

    await page.getByRole('banner').getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Logout', exact: true }).click();

    await expect(page).toHaveURL(`${PETTY_CASH_URL}/logout`);
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'billing_token')?.value ?? '').toBe('');
  });
});
