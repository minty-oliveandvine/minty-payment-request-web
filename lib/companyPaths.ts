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
   *
   * A voided request is always addressed by its id: its Payment No. is free for a new request
   * (void bills are left out of the uniqueness check) and the by-reference lookup prefers the
   * live one, so the Payment No. would open the wrong request.
   */
  request: (id: string, reference?: string | null, status?: string | null) => string;
  settings: string;
};

const LIST = "payment-request";
const SETTINGS = "settings/payment-request";

/** `/entity/<ref>/<slug>/<page>`; `page` is `payment-request`, `payment-request/<id>` or `settings/payment-request`. */
export const COMPANY_PAGE =
  /^\/entity\/([0-9a-fA-F]{8})\/([^/]+)\/(payment-request(?:\/[^/]+)?|settings\/payment-request)$/;

/** Whether a bill status (the API's `void` or the list's `Voided`) is a voided one. */
export function isVoidStatus(status?: string | null): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "void" || s === "voided";
}

export function pagesUnder(base: string): CompanyPages {
  return {
    list: `${base}/${LIST}`,
    request: (id, reference, status) =>
      `${base}/${LIST}/${encodeURIComponent((!isVoidStatus(status) && reference?.trim()) || id)}`,
    settings: `${base}/${SETTINGS}`,
  };
}
