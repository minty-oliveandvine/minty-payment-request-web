// A file always opens a FULL-SCREEN preview, in this tab. It never opens a new tab and it
// never downloads itself (the user's rule, 2026-10-09).
//
// Only a browser can prove the two things that matter here: that no second page and no
// download was ever created, and that pdf.js really drew the file onto a canvas inside the
// overlay. The unit layer asserts the absence of an anchor; only this can assert the absence
// of a tab.
//
// STUBBED - every `/api/v1/**` call is answered from the fixtures, so this needs `npm run dev`
// and nothing else. The behaviour under test is entirely in the browser: a staged file never
// reaches a server, so a five-service stack would prove nothing extra.
//
// At a PHONE viewport throughout - the overlay stacks over a modal that is itself full-width
// there, which is where clipping and trapped scroll would show up first.

import { expect, test, type Page } from '@playwright/test';

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

const PHONE = { width: 360, height: 740 };

// A real one-page PDF, xref and all: pdf.js refuses a `%PDF-1.4 e2e` stub, and the point of
// this spec is to see it actually draw.
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
  buffer: Buffer.from('ffd8ffdb0000ffd9', 'hex'),
};

/** A staged file's row in the list, named unambiguously (the name also shows in the preview
 *  header and inside a refusal message, so a bare getByText matches more than one thing). */
const stagedRow = (page: Page, name: string) => page.getByRole('button', { name: `Preview ${name}` });

/** Watch for every way a file could escape the page. */
function watchForEscapes(page: Page) {
  const popups: string[] = [];
  const downloads: string[] = [];
  page.context().on('page', (p) => popups.push(p.url()));
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  return {
    expectNone: () => {
      expect(popups, 'a new tab was opened').toEqual([]);
      expect(downloads, 'a file was downloaded').toEqual([]);
    },
  };
}

async function openAddDialog(page: Page) {
  await stubFlaskHub(page);
  await stubApi(page, {
    extra: { '/bills/suggested-reference/': { body: { reference: 'PR-E2E-14' } } },
  });
  await handoff(page, creds(), pagesOf(creds()).list);
  await page.getByRole('button', { name: /Add Payment/ }).click();
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await requireNextOnly();
  await page.setViewportSize(PHONE);
});

test('a staged image enlarges full screen, with no new tab and no download', async ({ page }) => {
  const escapes = watchForEscapes(page);
  const dialog = await openAddDialog(page);

  await dialog.locator('input[type="file"]').first().setInputFiles(JPG);
  await dialog.getByRole('button', { name: 'View full — receipt.jpg' }).click();

  const viewer = page.getByRole('dialog', { name: 'receipt.jpg' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByAltText('receipt.jpg')).toBeVisible();
  // It fills the window rather than sitting inside the modal's 520px card.
  const box = await viewer.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(PHONE.width - 1);
  await expect(viewer.getByRole('link')).toHaveCount(0);
  escapes.expectNone();

  // CLAUDE.md's sweep: the overlay must fill the window and never scroll sideways at any width.
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(viewer).toBeVisible();
    const at = await viewer.boundingBox();
    expect(at?.width, `overlay does not fill ${width}px`).toBeGreaterThanOrEqual(width - 1);
    await expectNoSideScroll(page, width);
  }
});

test('a staged PDF is drawn by pdf.js inside the overlay, not handed to the browser', async ({ page }) => {
  const escapes = watchForEscapes(page);
  const dialog = await openAddDialog(page);

  await dialog.locator('input[type="file"]').first().setInputFiles(PDF);
  await dialog.getByRole('button', { name: 'View full — invoice.pdf' }).click();

  const viewer = page.getByRole('dialog', { name: 'invoice.pdf' });
  await expect(viewer.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  escapes.expectNone();
});

test('Close is a real tap target, and one Escape leaves the modal open', async ({ page }) => {
  const dialog = await openAddDialog(page);
  await dialog.locator('input[type="file"]').first().setInputFiles(JPG);
  await dialog.getByRole('button', { name: 'View full — receipt.jpg' }).click();

  const close = page.getByRole('button', { name: 'Close preview' });
  const box = await close.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  // One Escape, one layer. The viewer goes first - it listens in the capture phase, which is
  // what stops the modal's own handler seeing the same keystroke - and the file stays staged.
  await page.keyboard.press('Escape');

  await expect(close).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Add Payment Request' })).toBeVisible();
  await expect(stagedRow(page, 'receipt.jpg')).toBeVisible();

  // then the modal's own ladder: the preview selection, then the dialog
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Add Payment Request' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Add Payment Request' })).toBeHidden();
});

test('the page still scrolls after the viewer has been opened and closed', async ({ page }) => {
  // The scroll lock is reference counted; a stacked overlay used to be able to leave
  // `overflow: hidden` behind for good.
  const dialog = await openAddDialog(page);
  await dialog.locator('input[type="file"]').first().setInputFiles(JPG);
  await dialog.getByRole('button', { name: 'View full — receipt.jpg' }).click();
  await page.getByRole('button', { name: 'Close preview' }).click();
  await page.keyboard.press('Escape'); // clears the preview selection
  await page.keyboard.press('Escape'); // closes the dialog
  await expect(page.getByRole('heading', { name: 'Add Payment Request' })).toBeHidden();

  const overflow = await page.evaluate(
    () => getComputedStyle(document.getElementById('app-scroll-root') ?? document.body).overflow,
  );
  expect(overflow).not.toBe('hidden');
});

test('a spreadsheet is not offered, and is refused if forced past the picker', async ({ page }) => {
  const dialog = await openAddDialog(page);
  const input = dialog.locator('input[type="file"]').first();

  expect(await input.getAttribute('accept')).not.toContain('xls');

  await input.setInputFiles({
    name: 'books.xlsx',
    mimeType: 'application/vnd.ms-excel',
    buffer: Buffer.from('PK'),
  });

  // The refusal names the file, so "is it staged?" is a question for the list, not the text.
  await expect(dialog.getByText(/I can't open this one/)).toBeVisible();
  await expect(dialog.getByText(/Excel/)).toHaveCount(0);
  await expect(stagedRow(page, 'books.xlsx')).toHaveCount(0);
});

test('the modal keeps the staged list usable behind the viewer', async ({ page }) => {
  const dialog = await openAddDialog(page);
  const input = dialog.locator('input[type="file"]').first();
  await input.setInputFiles(JPG);
  await input.setInputFiles(PDF);

  // The newest file is the one previewed, and both stay in the list.
  await dialog.getByRole('button', { name: 'View full — invoice.pdf' }).click();
  await expect(page.getByRole('dialog', { name: 'invoice.pdf' })).toBeVisible();

  await page.getByRole('button', { name: 'Close preview' }).click();

  await expect(stagedRow(page, 'receipt.jpg')).toBeVisible();
  await expect(stagedRow(page, 'invoice.pdf')).toBeVisible();
});
