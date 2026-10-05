// The old payer portal and profile addresses (`/profile/*`). The pages were deleted on 2026-10-01
// - they live in minty-web - and the middleware forwards every old address (emails, bookmarks)
// to minty-web through Minty (Flask): `/profile` to Flask's profile router, the rest through
// Flask's login-gated `/handoff/minty-web`, with the original query string. The forward comes
// BEFORE the cookie check, so a link opened with no billing cookie goes there too.
//
// Only Next has to answer: the specs read the redirect, they do not follow it. E2E_PETTY_CASH_URL must
// be the Minty origin the Next server resolves (lib/mintyEnv.ts; both default to :8010).
import { expect, test, type APIRequestContext } from '@playwright/test';
import { PETTY_CASH_URL, reachable } from './helpers';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3020';

const handoff = (next: string) => `${PETTY_CASH_URL}/handoff/minty-web?${new URLSearchParams({ next }).toString()}`;

/** Old address -> where it must go now. */
const FORWARDS: Array<[string, string]> = [
  ['/profile', `${PETTY_CASH_URL}/profile`],
  ['/profile?entity_id=abc-123', `${PETTY_CASH_URL}/profile?entity_id=abc-123`],
  // an old link's from=bills is dropped (2026-10-05)
  ['/profile?entity_id=abc-123&from=bills', `${PETTY_CASH_URL}/profile?entity_id=abc-123`],
  ['/profile/subscriptions', handoff('/subscription/subscriptions')],
  ['/profile/subscriptions?q=acme&page=2', handoff('/subscription/subscriptions?q=acme&page=2')],
  ['/profile/subscriptions/incoming', handoff('/subscription/subscriptions/incoming')],
  ['/profile/subscriptions/incoming?transfer=t-42', handoff('/subscription/subscriptions/incoming?transfer=t-42')],
  ['/profile/subscriptions/subscriber?entity=e-7', handoff('/subscription/subscriptions/subscriber?entity=e-7')],
  ['/profile/billing', handoff('/subscription/billing')],
  ['/profile/invoices', handoff('/subscription/billing')],
  ['/profile/no-such-page?entity_id=abc-123', `${PETTY_CASH_URL}/profile?entity_id=abc-123`],
];

async function locationOf(request: APIRequestContext, path: string, cookie?: string): Promise<{ status: number; location: string }> {
  const res = await request.get(path, { maxRedirects: 0, headers: cookie ? { cookie } : {} });
  return { status: res.status(), location: res.headers()['location'] ?? '' };
}

test.describe('old /profile addresses forward to minty-web through Minty', () => {
  test.beforeEach(async () => {
    test.skip(!(await reachable(`${BASE_URL}/landing`)), 'Next (:3020) is not answering');
  });

  for (const [from, to] of FORWARDS) {
    test(`${from} with no billing cookie`, async ({ request }) => {
      expect(await locationOf(request, from)).toEqual({ status: 307, location: to });
    });

    test(`${from} with a billing cookie`, async ({ request }) => {
      expect(await locationOf(request, from, 'billing_token=any-token; billing_entity_id=abc-123')).toEqual({ status: 307, location: to });
    });
  }

  test('the drawer\'s own /profile assets are still served, not forwarded', async ({ request }) => {
    const res = await request.get('/profile/person.svg', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/svg');
  });
});
