/**
 * My Profile's reads and its one write: Flask's `GET` / `PATCH /api/me/profile`, reached through
 * this app's host (`sidebarHost.mintyFetch`). The profile itself is `@minty/shared/profile`'s
 * since v0.6 (the owner, 2026-10-20: one implementation for every app - it was a copy of
 * minty-web's); `profileApi` is this app's part of it.
 *
 * `entityId` names the company the profile was opened from (`?entity=`); Flask refuses one the
 * person may not see (403) - the cookie's company is the only one ever sent.
 */

import type {
  Profile,
  ProfileApi,
  ProfileChanges,
} from "@minty/shared/profile";

import { mintyFetch } from "@/components/ui/sidebarHost";

const query = (entityId: string | null | undefined) => ({
  entity: entityId || undefined,
});

/** The two calls, as the packaged panel takes them. Module-level: a new object reads again. */
export const profileApi: ProfileApi = {
  load: (entityId, signal) =>
    mintyFetch<Profile>("/api/me/profile", { query: query(entityId), signal }),
  save: (changes: ProfileChanges, entityId) =>
    mintyFetch<Profile>("/api/me/profile", {
      method: "PATCH",
      json: changes,
      query: query(entityId),
    }),
};
