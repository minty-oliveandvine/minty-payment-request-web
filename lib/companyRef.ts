/**
 * A company in an address: `<shortid>/<name>` (2026-10-05) - the first 8 characters of its id,
 * then its name as a readable segment. The short id decides; the name is only for reading.
 *
 * COPY of minty-web/lib/companyRef.ts - change both. The same rule as Flask's
 * `blueprints/shared/entity_ref.py::slugify_name`, so the address Flask hands over is the one
 * this app would build (a mismatch only costs a redirect).
 */

export const SHORT_ID_LENGTH = 8;
const SLUG_MAX = 60;
const EMPTY_SLUG = "company";

/** Lowercase, `&` as "and", letters and digits of any script kept, anything else one `-`. */
export function slugifyName(name: string | null | undefined): string {
  const text = (name ?? "").normalize("NFKC").toLowerCase().replace(/&/g, " and ");
  const slug = Array.from(text, (ch) => (/[\p{L}\p{N}]/u.test(ch) ? ch : "-"))
    .join("")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, SLUG_MAX).replace(/-+$/, "") || EMPTY_SLUG;
}

export function shortIdOf(entityId: string): string {
  return entityId.slice(0, SHORT_ID_LENGTH).toLowerCase();
}

/** `<shortid>/<slug>`, each part ready for a path. */
export function companyRef(entityId: string, name: string | null | undefined): string {
  return `${encodeURIComponent(shortIdOf(entityId))}/${encodeURIComponent(slugifyName(name))}`;
}
