/**
 * Suppliers as the picker lists them, including the duplicates the dedupe helpers exist for.
 *
 * Typed data and builders only: no `page.route`, no @playwright/test import, no CORS header.
 */

import type { EntityBillContact } from "../api";

export const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";

export function entityBillContact(overrides: Partial<EntityBillContact> = {}): EntityBillContact {
  return {
    id: "contact-1",
    entity_id: ENTITY_ID,
    xero_contact_id: "XERO-1",
    xero_org_id: "ORG-1",
    name: "Young Bros Transport",
    category: null,
    ...overrides,
  };
}

/** The two names e2e/02_bill_lifecycle.spec.ts picks between. */
export const SUPPLIERS: EntityBillContact[] = [
  entityBillContact({ id: "c-1", xero_contact_id: "XERO-1", name: "E2E Stationery Supplier" }),
  entityBillContact({ id: "c-2", xero_contact_id: "XERO-2", name: "ABC Furniture" }),
  entityBillContact({ id: "c-3", xero_contact_id: "XERO-3", name: "Young Bros Transport" }),
];

/**
 * The same list with the two kinds of duplicate the API has sent: one Xero ContactID written in
 * another case, and one display name with doubled whitespace.
 */
export const WITH_DUPLICATES: EntityBillContact[] = [
  ...SUPPLIERS,
  entityBillContact({ id: "c-1-dup", xero_contact_id: "xero-1  ", name: "Different Name, Same Xero Id" }),
  entityBillContact({ id: "c-2-dup", xero_contact_id: "XERO-9", name: "ABC   Furniture" }),
  entityBillContact({ id: "c-blank", xero_contact_id: "", name: "" }),
];
