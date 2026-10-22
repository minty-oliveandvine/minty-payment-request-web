/**
 * The pages under a company's address, from the address itself - no package import, so the
 * Playwright helpers can use it. Playwright never compiles TypeScript under node_modules, and
 * @minty/shared ships as .ts source, so anything e2e/ imports must not reach the package
 * (`lib/companyPages.ts` does, for `companyRef`); e2e/ takes `companyRef` from the plain-JS
 * `@minty/shared/e2e`.
 */

export type CompanyPages = {
  list: string;
  /**
   * One payment request: by its Payment No. (`reference`) when it has one, else by its id
   * (2026-10-05). The details page looks a Payment No. up (`lib/useRequestId.ts`) and turns an
   * id address into the Payment No. one once the request has loaded.
   *
   * A void request is always addressed by its id (`status` "void"/"Voided"): void requests do
   * not hold their Payment No. against reuse, and the API's by-reference lookup prefers the live
   * request, so the Payment No. would open a different one. So is a Payment No. of "new" - that
   * address is the Add page.
   */
  request: (id: string, reference?: string | null, status?: string | null) => string;
  /** Add payment request - a page of its own since the Part 15 migration (was a modal). */
  create: string;
  settings: string;
};

const LIST = "payment-request";
const SETTINGS = "settings/payment-request";

/** `/entity/<ref>/<slug>/<page>`; `page` is `payment-request`, `payment-request/<id>` or `settings/payment-request`. */
export const COMPANY_PAGE =
  /^\/entity\/([0-9a-fA-F]{8})\/([^/]+)\/(payment-request(?:\/[^/]+)?|settings\/payment-request)$/;

const VOID_STATUSES = new Set(["void", "voided"]);

/** What names one request in its address - see `CompanyPages.request`. */
function requestSegment(id: string, reference?: string | null, status?: string | null): string {
  const ref = reference?.trim() ?? "";
  if (!ref || ref.toLowerCase() === "new") return id;
  if (VOID_STATUSES.has((status ?? "").trim().toLowerCase())) return id;
  return ref;
}

export function pagesUnder(base: string): CompanyPages {
  return {
    list: `${base}/${LIST}`,
    request: (id, reference, status) =>
      `${base}/${LIST}/${encodeURIComponent(requestSegment(id, reference, status))}`,
    create: `${base}/${LIST}/new`,
    settings: `${base}/${SETTINGS}`,
  };
}
