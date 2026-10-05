// Payment Settings' "Leave without saving?" (lib/leaveGuard.ts, the dialog copied from minty-web):
// ticks not saved yet hold every way out of the page - the header's back link, the Flask pills,
// the sidebar's links, its Logout and the browser's Back - until "Discard changes"; "Go Back" and
// Escape stay. Save itself: off with nothing ticked, and a refusal shown in the server's words.
//
// Only the account-code list is stubbed (a fixed list, two of three active, so the saved ticks are
// known; a PUT answers `run.put`); everything else is the stack. Pages on Flask's origin are answered by a stub page, so
// Flask need not serve them, and Minty's /logout and the backend's logout call are caught, so no run
// signs anybody out. The browser's own leave prompt must never fire where our dialog asked.
import { expect, test, type Dialog, type Page, type Route } from '@playwright/test';
import { PAYMENT_REQUEST_API_URL, PETTY_CASH_URL, handoff, pagesOf, requireCredentials, requireStack, type Credentials } from './helpers';

/** The list and Payment Settings, under the company's address (lib/companyPages.ts). */
const isList = (u: URL) => /^\/entity\/[0-9a-f]{8}\/[^/]+\/payment-request$/.test(u.pathname);
const isSettings = (u: URL) => /^\/entity\/[0-9a-f]{8}\/[^/]+\/settings\/payment-request$/.test(u.pathname);

const ACCOUNTS = [
  { code: '200', name: 'Sales', active: true },
  { code: '429', name: 'General Expenses', active: true },
  { code: '310', name: 'Cost of Goods Sold', active: false },
];

const tick = (page: Page, code: string) => {
  const a = ACCOUNTS.find((x) => x.code === code)!;
  return page.getByRole('checkbox', { name: `Include ${a.code} - ${a.name} in payment account dropdown` });
};

/** The preflight's answer: whatever origin and headers the browser asks for. */
function cors(route: Route): Record<string, string> {
  const headers = route.request().headers();
  return {
    'access-control-allow-origin': headers['origin'] ?? '*',
    'access-control-allow-headers': headers['access-control-request-headers'] ?? 'authorization, content-type',
    'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
  };
}

type Run = {
  creds: Credentials;
  prompts: string[];
  logouts: string[];
  /** What a PUT answers; each one sent is recorded in `puts`. */
  put: { status: number; detail?: string };
  puts: { id: string; is_active: boolean }[];
};

async function arrive(page: Page): Promise<Run> {
  const creds = requireCredentials();
  const run: Run = { creds, prompts: [], logouts: [], put: { status: 200 }, puts: [] };
  page.on('dialog', (d: Dialog) => {
    run.prompts.push(d.type());
    void d.dismiss();
  });
  await page.route('**/entity-bill-accounts/**', (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
    if (route.request().method() === 'PUT') {
      const id = new URL(route.request().url()).pathname.split('/').pop() ?? '';
      const { is_active } = route.request().postDataJSON() as { is_active: boolean };
      run.puts.push({ id, is_active });
      const body = run.put.status === 200
        ? { id, entity_id: creds.entityId, account_code: id.replace('e2e-leave-', ''), account_name: '', account_type: 'EXPENSE', is_default: false, is_active, sort_order: 0 }
        : { detail: run.put.detail };
      return route.fulfill({ status: run.put.status, headers: cors(route), contentType: 'application/json', body: JSON.stringify(body) });
    }
    const body = ACCOUNTS.map((a, i) => ({
      id: `e2e-leave-${a.code}`,
      entity_id: creds.entityId,
      account_code: a.code,
      account_name: a.name,
      account_type: 'EXPENSE',
      is_default: false,
      is_active: a.active,
      sort_order: i,
    }));
    return route.fulfill({ status: 200, headers: cors(route), contentType: 'application/json', body: JSON.stringify(body) });
  });
  // Flask's pages (the pills' and the menu's destinations) - its API calls still reach Flask
  await page.route(`${PETTY_CASH_URL}/**`, (route: Route) =>
    route.request().resourceType() === 'document'
      ? route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Flask page stub</title>' })
      : route.fallback(),
  );
  await page.route(`${PETTY_CASH_URL}/logout**`, (route: Route) => {
    run.logouts.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Minty logout stub</title>' });
  });
  await page.route(`${PAYMENT_REQUEST_API_URL}/api/v1/auth/logout`, (route: Route) => {
    if (route.request().method() !== 'OPTIONS') run.logouts.push(route.request().url());
    return route.fulfill({ status: 204, headers: cors(route) });
  });
  await handoff(page, creds, pagesOf(creds).settings);
  await expect(page.getByRole('heading', { name: /payment account code/i })).toBeVisible();
  await expect(tick(page, '200')).toBeChecked();
  await expect(tick(page, '310')).not.toBeChecked();
  return run;
}

const leaveDialog = (page: Page) => page.getByRole('dialog', { name: 'Leave without saving?' });
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save Changes' });
/** The history entry the tab is on (Chrome's Navigation API): shows the sentinel come and go. */
const historyIndex = (page: Page) =>
  page.evaluate(() => (window as unknown as { navigation: { currentEntry: { index: number } } }).navigation.currentEntry.index);

/** Arrive, then put the payments list behind the settings page, so Back has somewhere to go. */
async function arriveFromTheList(page: Page): Promise<Run> {
  const run = await arrive(page);
  await page.goto(pagesOf(run.creds).list);
  await expect(page).toHaveURL(isList);
  await page.goto(pagesOf(run.creds).settings);
  await expect(tick(page, '200')).toBeChecked();
  return run;
}
const backLink = (page: Page) => page.getByRole('banner').getByRole('link', { name: /Payments/ });

/**
 * Arrive on Payment Settings, then take the Payment Settings pill (a Next `<Link>` to
 * `<settings>?tab=bill`): two entries of ONE document, so a jump between them is a `popstate` the
 * guard must hold (a jump into another document gets `beforeunload` instead).
 */
async function arriveWithASoftEntry(page: Page): Promise<{ run: Run; first: number }> {
  const run = await arrive(page);
  const first = await historyIndex(page);
  await page.getByRole('link', { name: 'Payment Settings', exact: true }).click();
  await expect(page).toHaveURL((u) => isSettings(u) && u.searchParams.get('tab') === 'bill');
  await expect.poll(() => historyIndex(page)).toBe(first + 1);
  return { run, first };
}
const jump = (page: Page, delta: number) => page.evaluate((d) => window.history.go(d), delta);

test.describe('payment settings: leave without saving', () => {
  test.beforeEach(async () => {
    await requireStack();
  });

  test('nothing changed: the back link leaves at once', async ({ page }) => {
    const run = await arrive(page);
    await backLink(page).click();
    await expect(page).toHaveURL(isList);
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(run.prompts).toEqual([]);
  });

  test('a tick held by the back link: Go Back and Escape both stay, the tick kept', async ({ page }) => {
    const run = await arrive(page);
    await tick(page, '310').check();

    await backLink(page).click();
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('You have unsaved changes.');
    await dialog.getByRole('button', { name: 'Go Back', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(isSettings);
    await expect(tick(page, '310')).toBeChecked();

    await backLink(page).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(isSettings);
    await expect(tick(page, '310')).toBeChecked();
    expect(run.prompts).toEqual([]);
  });

  test('a Flask pill is a real link: Discard changes goes there, with no browser prompt', async ({ page }) => {
    const run = await arrive(page);
    await tick(page, '310').check();

    await page.getByRole('link', { name: 'Users', exact: true }).click();
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Discard changes' }).click();

    // the pill links the full id; Flask (stubbed here) then shows `<shortid>/<name>` (2026-10-05)
    await expect(page).toHaveURL(`${PETTY_CASH_URL}/entity/${run.creds.entityId}/settings/users`);
    expect(run.prompts).toEqual([]);
  });

  test("the sidebar's Settings asks above the drawer, and Discard changes reloads the saved ticks", async ({ page }) => {
    const run = await arrive(page);
    await tick(page, '310').check();

    await page.getByRole('banner').getByRole('button', { name: 'Open navigation menu' }).click();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Settings', exact: true }).click();

    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await expect(nav).toBeVisible(); // the drawer stayed open under it
    // Escape answers the dialog alone: the drawer under it stays open
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(nav).toBeVisible();
    await nav.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(dialog).toBeVisible();
    const discard = dialog.getByRole('button', { name: 'Discard changes' });
    // the button is what the pointer hits at its own centre - not the drawer over it
    const onTop = await discard.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && el.contains(hit);
    });
    expect(onTop).toBe(true);
    await discard.click();

    await expect(page).toHaveURL(isSettings);
    await expect(leaveDialog(page)).toHaveCount(0);
    await expect(tick(page, '200')).toBeChecked();
    await expect(tick(page, '429')).toBeChecked();
    await expect(tick(page, '310')).not.toBeChecked();
    expect(run.prompts).toEqual([]);
  });

  test('Logout asks first: Go Back stays, signed in, and nothing was logged out', async ({ page }) => {
    const run = await arrive(page);
    await tick(page, '310').check();

    await page.getByRole('banner').getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Logout', exact: true }).click();

    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Go Back', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page).toHaveURL(isSettings);
    await expect(tick(page, '310')).toBeChecked();
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'billing_token')?.value ?? '').not.toBe('');
    expect(run.logouts).toEqual([]);
    expect(run.prompts).toEqual([]);
  });
  test("the browser's Back asks: Go Back stays on the page, the tick and the sentinel kept", async ({ page }) => {
    const run = await arrive(page);
    const before = await historyIndex(page);
    await tick(page, '310').check();
    await expect.poll(() => historyIndex(page)).toBe(before + 1); // the sentinel

    await page.goBack();
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Go Back', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(isSettings);
    await expect(tick(page, '310')).toBeChecked();
    expect(await historyIndex(page)).toBe(before + 1); // pushed again: Back asks again

    await page.goBack();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(tick(page, '310')).toBeChecked();
    expect(run.prompts).toEqual([]);
  });

  test("the browser's Back, then Discard changes, goes back to the page before", async ({ page }) => {
    const run = await arriveFromTheList(page);
    await tick(page, '310').check();

    await page.goBack();
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Discard changes' }).click();

    await expect(page).toHaveURL(isList);
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(run.prompts).toEqual([]);
  });

  test('a jump of several entries asks too, and Discard changes goes where it was going', async ({ page }) => {
    const { run, first } = await arriveWithASoftEntry(page);
    await tick(page, '310').check();
    await expect.poll(() => historyIndex(page)).toBe(first + 2); // the sentinel

    await jump(page, -2);
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL((u) => u.searchParams.get('tab') === 'bill');
    expect(await historyIndex(page)).toBe(first + 2); // the jump undone: back on the sentinel
    await dialog.getByRole('button', { name: 'Discard changes' }).click();

    await expect(page).toHaveURL((u) => isSettings(u) && !u.searchParams.has('tab'));
    await expect.poll(() => historyIndex(page)).toBe(first);
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(run.prompts).toEqual([]);
  });

  test('a jump of several entries: Go Back stays, the tick and the sentinel kept, and it asks again', async ({ page }) => {
    const { run, first } = await arriveWithASoftEntry(page);
    await tick(page, '310').check();
    await expect.poll(() => historyIndex(page)).toBe(first + 2);

    await jump(page, -2);
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Go Back', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(tick(page, '310')).toBeChecked();
    expect(await historyIndex(page)).toBe(first + 2);

    await jump(page, -2);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(tick(page, '310')).toBeChecked();
    expect(run.prompts).toEqual([]);
  });

  test('an earlier entry at this same address is a jump, not the sentinel', async ({ page }) => {
    const { run, first } = await arriveWithASoftEntry(page);
    // a second entry at <settings>?tab=bill (Next's own state kept, as the guard's sentinel does)
    await page.evaluate(() => window.history.pushState(window.history.state, '', window.location.href));
    await tick(page, '310').check();
    await expect.poll(() => historyIndex(page)).toBe(first + 3);

    await jump(page, -2); // onto the FIRST <settings>?tab=bill - the same address as the sentinel
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    expect(await historyIndex(page)).toBe(first + 3); // not a second sentinel pushed past it
    await dialog.getByRole('button', { name: 'Discard changes' }).click();

    await expect.poll(() => historyIndex(page)).toBe(first + 1);
    await expect(page).toHaveURL((u) => u.searchParams.get('tab') === 'bill');
    expect(run.prompts).toEqual([]);
  });

  test("once saved, the browser's Back leaves without asking", async ({ page }) => {
    const run = await arriveFromTheList(page);
    const before = await historyIndex(page);
    await tick(page, '310').check();
    await expect.poll(() => historyIndex(page)).toBe(before + 1);

    await saveButton(page).click();
    await expect(page.getByText('Payment settings updated successfully')).toBeVisible();
    expect(run.puts).toEqual([{ id: 'e2e-leave-310', is_active: true }]);
    await expect.poll(() => historyIndex(page)).toBe(before); // the sentinel taken off

    await page.goBack();
    await expect(page).toHaveURL(isList);
    await expect(leaveDialog(page)).toHaveCount(0);
    expect(run.prompts).toEqual([]);
  });

  test('nothing ticked: Save is off and says why', async ({ page }) => {
    const run = await arrive(page);
    const hint = page.getByText('Pick at least one account code.');
    await expect(hint).toHaveCount(0);
    await tick(page, '200').uncheck();
    await expect(saveButton(page)).toBeEnabled();
    await tick(page, '429').uncheck();

    await expect(saveButton(page)).toBeDisabled();
    await expect(hint).toBeVisible();
    await expect(saveButton(page)).not.toHaveAttribute('title', /.+/);
    await tick(page, '310').check();
    await expect(saveButton(page)).toBeEnabled();
    await expect(hint).toHaveCount(0);
    expect(run.puts).toEqual([]);
  });

  test("a refused untick shows the server's reason, and the page still asks before leaving", async ({ page }) => {
    const run = await arrive(page);
    run.put = { status: 409, detail: 'Keep at least one account code ticked.' };
    await tick(page, '310').check();
    await tick(page, '200').uncheck();

    await saveButton(page).click();
    await expect(page.getByText('Keep at least one account code ticked.')).toBeVisible();
    // ticks ON before ticks OFF
    expect(run.puts).toEqual([
      { id: 'e2e-leave-310', is_active: true },
      { id: 'e2e-leave-200', is_active: false },
    ]);
    await expect(tick(page, '200')).not.toBeChecked();
    await backLink(page).click();
    await expect(leaveDialog(page)).toBeVisible();
  });
});
