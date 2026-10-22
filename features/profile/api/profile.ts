/**
 * My Profile's reads and its one write: Flask's `GET` / `PATCH /api/me/profile`. The profile
 * itself is `@minty/shared/profile`'s since v0.6 (the owner, 2026-10-20: one implementation for
 * every app), and so are these two calls - `createProfileApi` (@minty/shared/portal; owner
 * 2026-10-21: one shared module) over this app's Flask client (`sidebarHost.mintyApi`: one
 * refresh on a 401, then back to Minty).
 *
 * `entityId` names the company the profile was opened from (`?entity=`); Flask refuses one the
 * person may not see (403) - the cookie's company is the only one ever sent.
 */

import { createProfileApi } from "@minty/shared/portal";

import { mintyApi } from "@/components/ui/sidebarHost";

/** The two calls, as the packaged panel takes them. Module-level: a new object reads again. */
export const profileApi = createProfileApi(mintyApi.json);
