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
    return nextPath
      ? `${base}&next=${encodeURIComponent(nextPath)}`
      : base;
  }
  return `${MINTY_MODULE_URL}/entity`;
}

/**
 * "My Profile" - through Minty's `/profile`, which opens minty-web's My Profile (this app has no
 * profile page since 2026-10-01). Opened inside a company it names it (`entity_id`); its back
 * arrow returns to the page the person came from (no `from=bills` since 2026-10-05). It enters
 * through
 * `/entity/<id>/enter` so a Minty session that lapsed while this app's longer token lived is
 * re-established from that token on the way.
 */
export function buildMintyProfileUrl(): string {
  const auth = getAuth();
  if (auth?.entityId) {
    const qs = new URLSearchParams({ entity_id: auth.entityId });
    return buildMintyEnterUrl(`/profile?${qs.toString()}`);
  }
  return `${MINTY_MODULE_URL}/profile`;
}
