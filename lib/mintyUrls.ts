import { getAuth } from "@/lib/auth";
import { resolveMintyModuleUrl } from "@/lib/mintyEnv";

/** Minty (module 1) origin — same as Petty Cash / entity entry. */
export const MINTY_MODULE_URL = resolveMintyModuleUrl();
export { resolveMintyModuleUrl };

/**
 * Minty entry URL with optional `next` path (path on the Minty app, e.g. `/entity/…/settings`).
 */
export function buildMintyEnterUrl(nextPath?: string): string {
  const auth = getAuth();
  if (auth?.entityId && auth?.token) {
    const base = `${MINTY_MODULE_URL}/entity/${encodeURIComponent(auth.entityId)}/enter?token=${encodeURIComponent(auth.token)}`;
    return nextPath ? `${base}&next=${encodeURIComponent(nextPath)}` : base;
  }
  return `${MINTY_MODULE_URL}/entity`;
}

/**
 * Leave by a top-level form POST (no body) - Minty's `/logout` answers a GET with 405 and takes a
 * POST only from a front end's `Origin`. Never `fetch` (the session cookie and the 302 belong to
 * the browser's navigation). The meta first: this app's `Referrer-Policy: same-origin` makes the
 * browser send `Origin: null` on a cross-origin POST, and `strict-origin` names only the origin -
 * what `Origin` says anyway, never a path or query. The page is leaving, so it stays.
 */
export function postNavigate(url: string): void {
  const meta = document.createElement("meta");
  meta.name = "referrer";
  meta.content = "strict-origin";
  document.head.appendChild(meta);
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  form.hidden = true;
  document.body.appendChild(form);
  form.submit();
}
