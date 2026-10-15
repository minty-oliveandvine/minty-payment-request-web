// The company's address segment, `<shortid>/<name>`, for the browser tests only.
//
// A COPY of @minty/shared/companyRef, kept because Playwright never compiles TypeScript under
// node_modules and the package ships as .ts source: importing it from e2e/ fails every spec at
// load ("Stripping types is currently unsupported for files under node_modules"), the stubbed
// ones included. lib/__tests__/e2eCompanyRef.test.ts pins this copy to the package's answer, so
// a change there fails `npm test` until it is made here too.

const SHORT_ID_LENGTH = 8;
const SLUG_MAX = 60;
const EMPTY_SLUG = 'company';

export function slugifyName(name: string | null | undefined): string {
  const text = (name ?? '').normalize('NFKC').toLowerCase().replace(/&/g, ' and ');
  const slug = Array.from(text, (ch) => (/[\p{L}\p{N}]/u.test(ch) ? ch : '-'))
    .join('')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, SLUG_MAX).replace(/-+$/, '') || EMPTY_SLUG;
}

export function companyRef(entityId: string, name: string | null | undefined): string {
  const shortId = entityId.slice(0, SHORT_ID_LENGTH).toLowerCase();
  return `${encodeURIComponent(shortId)}/${encodeURIComponent(slugifyName(name))}`;
}
