/**
 * The Minty (Petty Cash, module 1) origin. Lives in its own file (importing only `lib/env.ts`)
 * so any module - including ``lib/auth.ts`` and ``middleware.ts`` - can consume it without
 * creating circular imports.
 *
 * One variable, one URL: ``ACCOUNTS_API_URL`` (default http://localhost:8002), read in
 * ``lib/env.ts``. No deployment-environment switch.
 */
import { env } from "./env";

export function resolveMintyModuleUrl(): string {
  return env.ACCOUNTS_API_URL;
}
