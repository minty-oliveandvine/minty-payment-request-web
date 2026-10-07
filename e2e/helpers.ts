// Shared plumbing: the module handoff token Minty mints, the landing handoff, skips.
//
// WHY THIS MINTS ITS OWN TOKEN
//
// In production a person clicks "Payments" in Minty; Flask mints a 30-minute HS256 JWT
// (blueprints/entity/routes/modules.py::_generate_module_token) and sends the browser to
// /landing?token=... here, which stores it in the `billing_token` cookie. A test cannot go
// through Minty's login (email OTP), but it holds the same SECRET_KEY, so it mints the same
// token. Nothing is bypassed: minty-payment-request-api verifies signature, expiry and claims exactly
// as it does Flask's, and the page reads the module claims out of it.
import { createHmac } from 'node:crypto';
import { test, type Page, type Route } from '@playwright/test';

import { companyPages, type CompanyPages } from '../lib/companyPages';
import { entityBillAccounts } from '../lib/__fixtures__/accounts';
import { ALL_STATUSES } from '../lib/__fixtures__/bills';
import type { BillListItem } from '../lib/api';
import { SUPPLIERS } from '../lib/__fixtures__/contacts';

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export type Credentials = { secret: string; userId: string; entityId: string; entityName: string };

export function credentials(): Credentials | null {
  const secret = process.env.E2E_JWT_SECRET;
  const userId = process.env.E2E_MINTY_USER;
  const entityId = process.env.E2E_MINTY_ENTITY;
  if (!secret || !userId || !entityId) return null;
  return { secret, userId, entityId, entityName: process.env.E2E_MINTY_ENTITY_NAME || 'E2E Petty Cash Shop' };
}

export function requireCredentials(): Credentials {
  const creds = credentials();
  test.skip(!creds, 'Set E2E_JWT_SECRET (Minty SECRET_KEY), E2E_MINTY_USER and E2E_MINTY_ENTITY (see e2e/README.md)');
  return creds as Credentials;
}

/** The claims Minty puts in the module token; ``role`` decides what the UI offers. */
export function mintModuleToken(creds: Credentials, overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    user_id: creds.userId, entity_id: creds.entityId, xero_org_id: '', role: 'admin', system_role: 'normal',
    module: 'billing', sid: 'e2e', billing_enabled: true, petty_cash_enabled: true,
    exp: now + 1800, iat: now, ...overrides,
  }));
  const signature = b64url(createHmac('sha256', creds.secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

export async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  }
}

export const PAYMENT_REQUEST_API_URL = process.env.E2E_PAYMENT_REQUEST_API_URL || 'http://localhost:8020';
export const PETTY_CASH_URL = process.env.E2E_PETTY_CASH_URL || 'http://localhost:8010';

export async function requireStack(): Promise<void> {
  test.skip(!(await reachable((process.env.E2E_BASE_URL || 'http://localhost:3020') + '/landing')), 'Next (:3020) is not answering');
  test.skip(!(await reachable(PAYMENT_REQUEST_API_URL + '/api/docs')) && !(await reachable(PAYMENT_REQUEST_API_URL + '/')), 'minty-payment-request-api (:8020) is not answering');
}

/** The preflight's answer: whatever origin and headers the browser asks for. */
export function cors(route: Route): Record<string, string> {
  const headers = route.request().headers();
  return {
    'access-control-allow-origin': headers['origin'] ?? '*',
    'access-control-allow-headers': headers['access-control-request-headers'] ?? 'authorization, content-type',
    'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
  };
}

/**
 * Payment Settings shows its account codes only for a company live on Xero (`/auth/xero-status`,
 * 2026-10-06). The seeded shop has no Xero org, so a spec that needs the codes says it is connected.
 */
export async function stubXeroStatus(page: Page, connected: boolean): Promise<void> {
  await page.route(`${PAYMENT_REQUEST_API_URL}/api/v1/auth/xero-status`, (route: Route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors(route) })
      : route.fulfill({ status: 200, headers: cors(route), contentType: 'application/json', body: JSON.stringify({ connected }) }),
  );
}

/** The company's pages in this app - `/entity/<shortid>/<name>/...` since 2026-10-05 (lib/companyPages.ts). */
export function pagesOf(creds: Credentials): CompanyPages {
  return companyPages(creds.entityId, creds.entityName);
}

/** Arrive the way Minty sends people: /landing stores the token and forwards to ``next``. */
export async function handoff(page: Page, creds: Credentials, next = '/', overrides: Record<string, unknown> = {}): Promise<void> {
  const token = mintModuleToken(creds, overrides);
  const qs = new URLSearchParams({ next, entity_id: creds.entityId, entity_name: creds.entityName, token });
  await page.goto(`/landing?${qs.toString()}`);
  await page.waitForURL((u) => !u.pathname.startsWith('/landing'), { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

export function moneyRegex(amount: number): RegExp {
  const fixed2 = amount.toFixed(2);
  const withCommas = fixed2.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return new RegExp([fixed2, withCommas].map((s) => s.replace('.', '\.')).join('|'));
}

/**
 * The e2e shop is connected to a real Xero organisation (a Demo Company, linked by hand) when
 * ``E2E_XERO=1``: 04_xero_publish runs, and the supplier is one of the organisation's real
 * contacts rather than the seed's placeholder (scripts/e2e_seed.py in Minty leaves a connected
 * shop's contacts alone). Override either name with its own variable.
 */
export function xeroLive(): boolean {
  return (process.env.E2E_XERO ?? '').trim() === '1';
}

export function fixtures() {
  const live = xeroLive();
  const env = (name: string, dflt: string) => (process.env[name] ?? '').trim() || dflt;
  return {
    /** typed into the supplier search, and the option clicked */
    supplierQuery: env('E2E_SUPPLIER_QUERY', live ? 'ABC' : 'E2E Stationery'),
    supplierName: env('E2E_SUPPLIER', live ? 'ABC Furniture' : 'E2E Stationery Supplier'),
    /** an expense account code the entity's bill account list carries (429 General Expenses in both) */
    accountCode: env('E2E_BILL_ACCOUNT_CODE', '429'),
  };
}

// --- stubbed mode -------------------------------------------------------------------------------
//
// Four of the specs (08, 11, 12, 13) answer every API call themselves, so they need no Flask, no
// Django and no Postgres - only `npm run dev`. They still arrive through /landing with a real
// token shape, because the app reads its claims; nothing verifies the signature on that path, so
// a stub secret is enough. `STUB_CREDS=1` picks these up when the live E2E_* variables are unset.

const STUB_CREDS: Credentials = {
  secret: 'stub-nothing-verifies-this',
  userId: '070b40af-d5fc-4430-8e25-f11b3294d5f5',
  entityId: '360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f',
  entityName: 'E2E Petty Cash Shop',
};

/** The live identity when it is configured, else the stub one. Never skips. */
export function stubCredentials(): Credentials {
  return credentials() ?? STUB_CREDS;
}

/** For a spec that stubs the API: only Next has to be up. */
export async function requireNextOnly(): Promise<void> {
  test.skip(
    !(await reachable((process.env.E2E_BASE_URL || 'http://localhost:3020') + '/landing')),
    'Next (:3020) is not answering',
  );
}

export const SUBSCRIPTION_API_URL = process.env.E2E_SUBSCRIPTION_API_URL || 'http://localhost:8000';

type Json = unknown;

/** What `stubApi` answers with; every field has a default, so a spec states only what it cares about. */
export type ApiStub = {
  bills?: BillListItem[] | ((page: number) => BillListItem[]);
  xeroConnected?: boolean;
  entitlements?: { petty_cash_enabled?: boolean; billing_enabled?: boolean };
  memberEntityIds?: string[];
  currencyCode?: string;
  payments?: Json;
  /** Extra exact-path answers, keyed by a substring of the pathname. Checked before the defaults. */
  extra?: Record<string, { status?: number; body?: Json }>;
};

/**
 * Answer every `/api/v1/**` call from the fixtures rather than from a running backend.
 *
 * The bodies come from `lib/__fixtures__/*`, the same modules the Vitest tests use, so a shape
 * change breaks both layers together. This is the ONLY place the two layers meet: a fixture
 * never knows about `page.route`, and `cors()` stays here.
 */
export async function stubApi(page: Page, stub: ApiStub = {}): Promise<void> {
  const bills = stub.bills ?? ALL_STATUSES;
  const answer = (route: Route, body: Json, status = 200) =>
    route.fulfill({ status, headers: cors(route), contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(`${PAYMENT_REQUEST_API_URL}/api/v1/**`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: cors(route) });
    }
    const url = new URL(route.request().url());
    const path = url.pathname;

    for (const [fragment, reply] of Object.entries(stub.extra ?? {})) {
      if (path.includes(fragment)) return answer(route, reply.body ?? {}, reply.status ?? 200);
    }

    if (path.endsWith('/auth/xero-status')) return answer(route, { connected: stub.xeroConnected ?? true });
    if (path.endsWith('/auth/entity-currency')) return answer(route, { currency_code: stub.currencyCode ?? 'HKD' });
    if (path.endsWith('/auth/entitlements')) {
      return answer(route, { petty_cash_enabled: true, billing_enabled: true, ...stub.entitlements });
    }
    if (path.endsWith('/profile/me')) return answer(route, { member_entity_ids: stub.memberEntityIds ?? [] });
    if (path.endsWith('/entity-bill-contacts/')) return answer(route, SUPPLIERS);
    if (path.includes('/entity-bill-accounts/')) return answer(route, entityBillAccounts());
    if (path.endsWith('/audit')) return answer(route, []);
    if (path.endsWith('/payments')) return answer(route, stub.payments ?? { paid_total: '0.00', payments: [] });
    if (path.includes('/attachments')) return answer(route, []);
    if (path.endsWith('/bills/')) {
      const pageNum = Number(url.searchParams.get('page') ?? '1');
      const all = typeof bills === 'function' ? bills(pageNum) : pageNum === 1 ? bills : [];
      // The server's own filters, because the app delegates these three to it rather than
      // narrowing in the browser: a stub that ignored them would make the filter panel look
      // like it did nothing.
      const status = url.searchParams.get('status');
      const min = url.searchParams.get('amount_min');
      const max = url.searchParams.get('amount_max');
      const rows = all.filter((b) => {
        if (status && b.status !== status) return false;
        const amount = Number.parseFloat(b.amount || '0');
        if (min !== null && amount < Number.parseFloat(min)) return false;
        if (max !== null && amount > Number.parseFloat(max)) return false;
        return true;
      });
      return answer(route, rows);
    }
    if (path.includes('/bills/')) {
      const rows = typeof bills === 'function' ? bills(1) : bills;
      // `/bills/by-reference/<Payment No.>` is its own lookup: the details address names the
      // Payment No. and lib/useRequestId.ts resolves it once (2026-10-05).
      const tail = path.includes('/bills/by-reference/')
        ? decodeURIComponent(path.split('/bills/by-reference/')[1] ?? '')
        : decodeURIComponent(path.split('/bills/')[1]?.replace(/\/$/, '') ?? '');
      const row = rows.find((b) => b.id === tail || b.reference === tail);
      if (!row) return answer(route, { detail: 'no such bill' }, 404);
      return answer(route, {
        ...row,
        xero_contact_id: '',
        updated_at: row.created_at,
        attachments: [],
        line_items: [],
      });
    }
    return answer(route, {});
  });
}

/** Flask's hub surface, which the sidebar reads on every page. */
export async function stubFlaskHub(page: Page, overrides: Record<string, unknown> = {}): Promise<void> {
  await page.route(`${PETTY_CASH_URL}/api/me/**`, (route: Route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors(route) })
      : route.fulfill({
          status: 200,
          headers: cors(route),
          contentType: 'application/json',
          body: JSON.stringify({
            user: { id: 'u1', first_name: 'Olive', last_name: 'Vine', name: 'Olive Vine', initials: 'OV', email: 'olive@minty.test' },
            entity: null,
            ...overrides,
          }),
        }),
  );
}

/** The subscription notice the landing page asks for; `null` means there is nothing to say. */
export async function stubSubscriptionNotice(page: Page, notice: Json | null): Promise<void> {
  await page.route(`${SUBSCRIPTION_API_URL}/api/entities/*/subscription-notice`, (route: Route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors(route) })
      : route.fulfill({
          status: notice === null ? 204 : 200,
          headers: cors(route),
          contentType: 'application/json',
          body: JSON.stringify(notice ?? {}),
        }),
  );
}

/** Nothing spills sideways: the page is never wider than the screen. */
export async function expectNoSideScroll(page: Page, width: number): Promise<void> {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  if (scrollWidth > width) {
    throw new Error(`the page is ${scrollWidth}px wide at a ${width}px viewport`);
  }
}
