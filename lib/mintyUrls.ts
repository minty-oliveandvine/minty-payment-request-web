import { mintyEntryUrl } from "@minty/shared/handoff";
import { withReturnOrigin } from "@minty/shared/previewSibling";

import { getAuth } from "@/lib/auth";
import { resolveMintyModuleUrl } from "@/lib/mintyEnv";

/** Minty (module 1) origin — same as Petty Cash / entity entry. */
export const MINTY_MODULE_URL = resolveMintyModuleUrl();
export { resolveMintyModuleUrl };

/**
 * Minty entry URL with optional `next` path (path on the Minty app, e.g. `/entity/…/settings`).
 * Like every way into Minty here, it names this app's origin (`return_origin`) so Flask can hand
 * back into a branch preview set; Flask ignores it everywhere else.
 *
 * The `/enter` address is `@minty/shared/handoff`'s `mintyEntryUrl` (owner 2026-10-21: one
 * shared module); with no company or no token in the cookie it is this app's fallback, Minty's
 * `/entity` (the entity list, or sign-in).
 */
export function buildMintyEnterUrl(nextPath?: string): string {
  const auth = getAuth();
  return (
    mintyEntryUrl({
      mintyBase: MINTY_MODULE_URL,
      entityId: auth?.entityId,
      token: auth?.token,
      next: nextPath,
    }) ?? withReturnOrigin(`${MINTY_MODULE_URL}/entity`)
  );
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
  return withReturnOrigin(`${MINTY_MODULE_URL}/profile`);
}
