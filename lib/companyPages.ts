/**
 * This app's pages live under the company's address (2026-10-05), Flask's scheme:
 *
 * - `/entity/<shortid>/<name>/payment-request` - the list;
 * - `/entity/<shortid>/<name>/payment-request/<id>` - one payment request;
 * - `/entity/<shortid>/<name>/settings/payment-request` - Payment Settings.
 *
 * The company is still the one in the cookie (every API call sends its id): `middleware.ts`
 * checks the address against it before a page renders, and hands a page of another company to
 * Flask, which mints a token for that one. No React here - the middleware imports it.
 */

import { companyRef, shortIdOf, slugifyName } from "@/lib/companyRef";

export type CompanyPages = {
  list: string;
  request: (id: string) => string;
  settings: string;
};

const LIST = "payment-request";
const SETTINGS = "settings/payment-request";

/** `/entity/<ref>/<slug>/<page>`; `page` is `payment-request`, `payment-request/<id>` or `settings/payment-request`. */
export const COMPANY_PAGE =
  /^\/entity\/([0-9a-fA-F]{8})\/([^/]+)\/(payment-request(?:\/[^/]+)?|settings\/payment-request)$/;

export function pagesUnder(base: string): CompanyPages {
  return {
    list: `${base}/${LIST}`,
    request: (id) => `${base}/${LIST}/${encodeURIComponent(id)}`,
    settings: `${base}/${SETTINGS}`,
  };
}

/** `/entity/<shortid>/<name>` of a company, from its id and name. */
export function companyBase(entityId: string, entityName: string): string {
  return `/entity/${companyRef(entityId, entityName)}`;
}

/** The pages of a company, from its id and name. */
export function companyPages(entityId: string, entityName: string): CompanyPages {
  return pagesUnder(companyBase(entityId, entityName));
}

/** A path segment as text; one that is not valid percent-encoding is taken as it is. */
export function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Whether `<ref>/<slug>` from an address is exactly how this company is written (a capital in the short id is not). */
export function isCanonicalRef(ref: string, slug: string, entityId: string, entityName: string): boolean {
  return ref === shortIdOf(entityId) && decodeSegment(slug) === slugifyName(entityName);
}
