/**
 * The pages under a company's address, from the address itself - no package import, so the
 * Playwright helpers can use it. Playwright never compiles TypeScript under node_modules, and
 * @minty/shared ships as .ts source, so anything e2e/ imports must not reach the package
 * (`lib/companyPages.ts` does, for `companyRef`). See e2e/companyRef.ts.
 */

export type CompanyPages = {
  list: string;
  /**
   * One payment request: by its Payment No. (`reference`) when it has one, else by its id
   * (2026-10-05). The details page looks a Payment No. up (`lib/useRequestId.ts`) and turns an
   * id address into the Payment No. one once the request has loaded.
   */
  request: (id: string, reference?: string | null) => string;
  /** Add payment request - a page of its own since the Part 15 migration (was a modal). */
  create: string;
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
    request: (id, reference) => `${base}/${LIST}/${encodeURIComponent(reference?.trim() || id)}`,
    create: `${base}/${LIST}/new`,
    settings: `${base}/${SETTINGS}`,
  };
}
