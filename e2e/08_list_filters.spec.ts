// The list's own behaviour: search, the advanced filter, sorting, paging, easy view, bulk
// actions and the totals banner.
//
// STUBBED. Every `/api/v1/**` call is answered from `lib/__fixtures__/bills.ts` - the same
// module the Vitest tests read - so this spec needs `npm run dev` and nothing else: no Flask,
// no Django, no Postgres. That is deliberate: these are the journeys most worth running often,
// and a five-service stack is why nobody runs them.
//
// It also carries the list page's 360/768/1440 sweep (CLAUDE.md's responsive rule).

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

/** Four suppliers with the amounts the search rules turn on. */
const ROWS = [
  billListItem({ id: 'b-3000', reference: 'PR-3000', contact: 'Exact Three Thousand', amount: '3000.00', amount_due: '3000.00', status: 'submitted' }),
  billListItem({ id: 'b-13000', reference: 'PR-13000', contact: 'Thirteen Thousand Fifty', amount: '13000.50', amount_due: '13000.50', status: 'submitted' }),
  billListItem({ id: 'b-300', reference: 'PR-300', contact: 'Three Hundred', amount: '300.00', amount_due: '300.00', status: 'submitted' }),
  billListItem({ id: 'b-draft', reference: 'PR-DRAFT', contact: 'Draft Supplier', amount: '450.25', amount_due: '450.25', status: 'draft' }),
  billListItem({ id: 'b-void', reference: 'PR-VOID', contact: 'Cancelled Order Inc', amount: '800.00', amount_due: '800.00', status: 'void' }),
];

test.beforeEach(async ({ page }) => {
  await requireNextOnly();
  await stubFlaskHub(page);
});

/**
 * Open the list in TABLE view.
 *
 * The page opens in EASY VIEW by default on a desktop (`easyView` starts true), so the table is
 * the hidden half and a table query finds nothing at all. The toggle is turned off here on
 * purpose, and the easy view gets its own test below.
 */
async function openList(page: import('@playwright/test').Page, rows = ROWS) {
  await stubApi(page, { bills: rows });
  await handoff(page, creds(), pagesOf(creds()).list);
  await expect(page.getByRole('searchbox')).toBeVisible();

  const easyView = page.getByRole('switch', { name: 'Easy view' });
  if ((await easyView.getAttribute('aria-checked')) === 'true') await easyView.click();
  await expect(easyView).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('table')).toBeVisible();
}

const rowFor = (page: import('@playwright/test').Page, supplier: string) =>
  page.getByRole('table').getByText(supplier, { exact: true });

/** The status filter is drawn twice - a tablist on a desktop, a menu on a phone - so a tab is
 *  always taken from the tablist. */
const statusTab = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('tablist', { name: 'Filter by status' }).getByRole('tab', { name });

test('the list shows the company every request, minus the voided ones', async ({ page }) => {
  await openList(page);

  await expect(rowFor(page, 'Exact Three Thousand')).toBeVisible();
  await expect(rowFor(page, 'Draft Supplier')).toBeVisible();
  // A voided request is out of the way until its tab is asked for.
  await expect(rowFor(page, 'Cancelled Order Inc')).toHaveCount(0);
});

test('a status tab narrows the list to that status', async ({ page }) => {
  await openList(page);

  await statusTab(page, 'Draft').click();

  await expect(rowFor(page, 'Draft Supplier')).toBeVisible();
  await expect(rowFor(page, 'Exact Three Thousand')).toHaveCount(0);

  await statusTab(page, 'Voided').click();
  await expect(rowFor(page, 'Cancelled Order Inc')).toBeVisible();
});

test('typing in the search box matches part of an amount; submitting matches the whole one', async ({ page }) => {
  await openList(page);
  const search = page.getByRole('searchbox');

  // Contains: 3000 is inside 3,000.00 and 13,000.50, but not 300.00.
  await search.fill('3000');
  await expect(rowFor(page, 'Exact Three Thousand')).toBeVisible();
  await expect(rowFor(page, 'Thirteen Thousand Fifty')).toBeVisible();
  await expect(rowFor(page, 'Three Hundred')).toHaveCount(0);

  // Exact: only the request that comes to 3,000.00.
  await search.press('Enter');
  await expect(rowFor(page, 'Exact Three Thousand')).toBeVisible();
  await expect(rowFor(page, 'Thirteen Thousand Fifty')).toHaveCount(0);
});

test('the search box matches a supplier by name', async ({ page }) => {
  await openList(page);

  await page.getByRole('searchbox').fill('Hundred');

  await expect(rowFor(page, 'Three Hundred')).toBeVisible();
  await expect(rowFor(page, 'Exact Three Thousand')).toHaveCount(0);
});

test('the advanced filter narrows by amount, and Reset puts the list back', async ({ page }) => {
  await openList(page);

  await page.getByRole('button', { name: 'Filter' }).click();
  const panel = page.getByRole('dialog', { name: 'Filters' });
  await panel.getByPlaceholder('0.00').first().fill('1000');
  await panel.getByRole('button', { name: 'Apply' }).click();

  await expect(rowFor(page, 'Exact Three Thousand')).toBeVisible();
  await expect(rowFor(page, 'Three Hundred')).toHaveCount(0);

  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByRole('dialog', { name: 'Filters' }).getByRole('button', { name: 'Reset' }).click();

  await expect(rowFor(page, 'Three Hundred')).toBeVisible();
});

test('the filter panel forgets a draft that was never applied', async ({ page }) => {
  await openList(page);

  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByRole('dialog', { name: 'Filters' }).getByPlaceholder('0.00').first().fill('1000');
  // Closed without applying.
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeHidden();

  await page.getByRole('button', { name: 'Filter' }).click();

  await expect(page.getByRole('dialog', { name: 'Filters' }).getByPlaceholder('0.00').first()).toHaveValue('');
  await expect(rowFor(page, 'Three Hundred')).toBeVisible();
});

test('a column sorts, and sorts the other way on a second press', async ({ page }) => {
  await openList(page);
  const sort = page.getByRole('table').getByRole('button', { name: /^Sort by Unpaid Amount/ });

  await sort.click();
  await expect(page.getByRole('table').getByRole('button', { name: /ascending/ })).toBeVisible();

  await sort.click();
  await expect(page.getByRole('table').getByRole('button', { name: /descending/ })).toBeVisible();
});

test('the pager walks a long list and says where it is', async ({ page }) => {
  const many = Array.from({ length: 24 }, (_, i) =>
    billListItem({
      id: `b-${i + 1}`,
      reference: `PR-${String(i + 1).padStart(4, '0')}`,
      contact: `Supplier ${String(i + 1).padStart(2, '0')}`,
      status: 'submitted',
    }),
  );
  await openList(page, many);

  // Both views mount a pager, and Tailwind hides one of them - so the count is read from
  // whichever is actually on screen.
  await expect(page.getByText(/Showing 1–10 of 24 items/).filter({ visible: true })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Pagination' })
    .filter({ visible: true })
    .getByRole('button', { name: 'Page 3' })
    .click();

  await expect(page.getByText(/Showing 21–24 of 24 items/).filter({ visible: true })).toBeVisible();
  await expect(rowFor(page, 'Supplier 24')).toBeVisible();
});

test('the Easy view choice survives a reload', async ({ page }) => {
  await openList(page);

  await page.getByRole('switch', { name: /Easy view/i }).or(page.getByLabel(/Easy view/i)).first().click();
  await page.reload();
  await expect(page.getByRole('searchbox')).toBeVisible();

  // The preference is remembered in localStorage, so the page comes back the way it was left.
  const remembered = await page.evaluate(() => localStorage.getItem('payment-request-easy-view'));
  expect(remembered).not.toBeNull();
});

test('bulk actions need at least TWO rows, and total what is checked', async ({ page }) => {
  await openList(page);
  const table = page.getByRole('table');

  await table.getByRole('checkbox', { name: 'Select row Exact Three Thousand' }).check();

  // One row is a row, not a batch.
  await expect(page.getByRole('button', { name: /Bulk actions, 1 selected/ })).toBeDisabled();
  await expect(page.getByText('Selected total unpaid amount').filter({ visible: true })).toBeVisible();

  await table.getByRole('checkbox', { name: 'Select row Three Hundred' }).check();

  await expect(page.getByRole('button', { name: /Bulk actions, 2 selected/ })).toBeEnabled();
});

test('the bulk menu asks before voiding what is checked', async ({ page }) => {
  await openList(page);
  await page.getByRole('table').getByRole('checkbox', { name: 'Select row Exact Three Thousand' }).check();
  await page.getByRole('table').getByRole('checkbox', { name: 'Select row Three Hundred' }).check();

  await page.getByRole('button', { name: /Bulk actions, 2 selected/ }).click();
  await page.getByRole('menuitem', { name: 'Void' }).click();

  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toHaveAccessibleName('Void selected payments?');
  await expect(confirm).toContainText('void 2 selected bills?');
});

for (const width of [360, 768, 1440]) {
  test(`nothing is wider than the screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    // Not `openList`: the Easy view switch is desktop-only chrome, so a phone cannot toggle it
    // and the view the page opens in is the one worth checking at that width.
    await stubApi(page, { bills: ROWS });
    await handoff(page, creds(), pagesOf(creds()).list);
    await expect(page.getByRole('searchbox')).toBeVisible();
    // Easy view below 1024px is the hidden half and the table's card list is shown, so the row
    // is taken from whichever copy the width actually puts on screen.
    await expect(page.getByText('Exact Three Thousand').filter({ visible: true }).first()).toBeVisible();

    await expectNoSideScroll(page, width);
  });
}
