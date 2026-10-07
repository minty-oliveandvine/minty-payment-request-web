// /landing, the one door into this app, and the rule that keeps it from being a way OUT of it.
//
// NEXT ONLY. Nothing here reaches a backend, so `npm run dev` is the whole stack.
//
// `startsWith("/") && !startsWith("//")` was an open redirect (found 2026-10-05): browsers read
// `\` as `/` and drop tab, CR and LF from a URL, so `/\evil.com` and `/<TAB>/evil.com` both
// landed on https://evil.com/. lib/safeNext.ts fixed it and lib/__tests__/safeNext.test.ts pins
// the function; this is the same list through a real browser, which is the only place the
// browser's own parsing is in play.

import { expect, test } from '@playwright/test';

import { mintModuleToken, pagesOf, requireNextOnly, stubCredentials, stubFlaskHub } from './helpers';

const creds = () => stubCredentials();

test.beforeEach(async ({ page }) => {
  await requireNextOnly();
  await stubFlaskHub(page);
});

/** Arrive at /landing with `next` spelled however the test means, and report where we ended up. */
async function landOn(page: import('@playwright/test').Page, next: string): Promise<string> {
  const token = mintModuleToken(creds());
  const qs = new URLSearchParams({
    entity_id: creds().entityId,
    entity_name: creds().entityName,
    token,
  });
  // `next` is appended raw: URLSearchParams would encode the control characters away, and the
  // point is what the browser does with them unencoded.
  await page.goto(`/landing?${qs.toString()}&next=${next}`);
  await page.waitForURL((u) => !u.pathname.startsWith('/landing'), { timeout: 15_000 });
  return page.url();
}

const OFF_SITE = [
  ['a protocol-relative address', '//evil.com'],
  ['a backslash', '/%5Cevil.com'],
  ['a tab', '/%09/evil.com'],
  ['a newline', '/%0A/evil.com'],
  ['a carriage return', '/%0D/evil.com'],
  ['an absolute URL', 'https://evil.com'],
  ['a javascript: address', 'javascript:alert(1)'],
  ['a bare host', 'evil.com'],
] as const;

for (const [label, next] of OFF_SITE) {
  test(`${label} never leaves this app`, async ({ page }) => {
    const landed = await landOn(page, next);

    expect(new URL(landed).host).toBe(new URL(page.url()).host);
    expect(landed).not.toContain('evil.com');
  });
}

test('a same-origin path is honoured', async ({ page }) => {
  // The company's own address, spelled the way this app spells it: a different spelling is
  // canonicalised by the middleware, which would make this assertion about the wrong thing.
  const list = pagesOf(creds()).list;

  const landed = await landOn(page, encodeURIComponent(list));

  expect(new URL(landed).pathname).toBe(list);
});

test('the handoff stores the session the way the app expects it', async ({ page, context }) => {
  await landOn(page, encodeURIComponent(pagesOf(creds()).list));

  const jar = await context.cookies();
  const token = jar.find((c) => c.name === 'billing_token')!;
  expect(token).toBeDefined();
  expect(token.path).toBe('/');
  // Eight hours, matching the cookie's documented lifetime.
  expect(Math.round(token.expires - Date.now() / 1000)).toBeGreaterThan(28_000);
  expect(token.sameSite).toBe('Lax');
  // Not Secure over http, which is how the local stack and this test are served.
  expect(token.secure).toBe(false);

  expect(jar.find((c) => c.name === 'billing_entity_id')?.value).toBe(creds().entityId);
  expect(decodeURIComponent(jar.find((c) => c.name === 'billing_entity_name')!.value)).toBe(
    creds().entityName,
  );
});

// These two assert that the browser LEFT this app, not where it arrived. Minty's own origin is
// whatever the NEXT SERVER resolved (`PETTY_CASH_URL`, lib/env.ts) and Flask may redirect again
// from there, so naming a port here would be testing the local setup rather than the app.
const APP_HOST = new URL(process.env.E2E_BASE_URL || 'http://localhost:3020').host;

/** Polled, not `waitForURL`: Minty answers with its own redirect chain, which takes a few
 *  seconds and crosses origins on the way. */
const leftTheApp = (page: import('@playwright/test').Page) =>
  expect.poll(() => new URL(page.url()).host, { timeout: 25_000 }).not.toBe(APP_HOST);

test('arriving with no token at all leaves for Minty', async ({ page }) => {
  await page.goto('/landing');

  await leftTheApp(page);
});

test('a page of the app with no cookie leaves for Minty rather than rendering', async ({ page, context }) => {
  await context.clearCookies();

  await page.goto(pagesOf(creds()).list, { waitUntil: 'domcontentloaded' });

  await leftTheApp(page);
});
