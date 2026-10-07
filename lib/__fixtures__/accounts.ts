/**
 * The company's Xero chart, as Payment Settings ticks it.
 *
 * The three codes below are lifted verbatim from e2e/07_settings_leave.spec.ts so a tick means
 * the same thing in the browser suite and in the unit tests: two active, one not, which is what
 * makes "untick everything" and "Select all" worth asserting at all.
 *
 * Typed data and builders only: no `page.route`, no @playwright/test import, no CORS header.
 */

import type { EntityBillAccount } from "../api";

export const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";

export type AccountSeed = { code: string; name: string; active: boolean };

/** Two ticked, one not. */
export const ACCOUNTS: AccountSeed[] = [
  { code: "200", name: "Sales", active: true },
  { code: "429", name: "General Expenses", active: true },
  { code: "310", name: "Cost of Goods Sold", active: false },
];

export function entityBillAccount(seed: AccountSeed, index = 0, entityId = ENTITY_ID): EntityBillAccount {
  return {
    id: `account-${seed.code}`,
    entity_id: entityId,
    account_code: seed.code,
    account_name: seed.name,
    account_type: "EXPENSE",
    is_default: false,
    is_active: seed.active,
    sort_order: index,
  };
}

/** The chart as `GET /entity-bill-accounts/?include_inactive=true` answers it. */
export function entityBillAccounts(
  seeds: AccountSeed[] = ACCOUNTS,
  entityId = ENTITY_ID,
): EntityBillAccount[] {
  return seeds.map((seed, i) => entityBillAccount(seed, i, entityId));
}

/** How a row reads on screen: "429 - General Expenses". */
export const labelOf = (seed: AccountSeed) => `${seed.code} - ${seed.name}`;
