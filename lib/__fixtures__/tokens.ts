/**
 * The claims Minty puts in the module token it hands this app, in one place.
 *
 * Both layers build from here: Vitest uses `unsignedToken`, which is the right SHAPE but
 * carries a stub signature (nothing in a unit test verifies one), and Playwright's
 * `e2e/helpers.ts` signs the same claim set with the shared SECRET_KEY. That matters because
 * `billing_enabled`, `role`, `system_role`, `is_view_only` and `sid` drive the gate, the
 * read-only banner and the one-shot subscription notice on both sides - a claim set that
 * drifted between the two layers would quietly test two different apps.
 *
 * Typed data and builders only: no `page.route`, no @playwright/test import, no CORS header.
 */

export type ModuleTokenClaims = {
  user_id: string;
  entity_id: string;
  xero_org_id: string;
  role: string;
  system_role: string;
  module: string;
  sid: string;
  billing_enabled: boolean;
  petty_cash_enabled: boolean;
  exp: number;
  iat: number;
  [claim: string]: unknown;
};

export const TOKEN_LIFETIME_SECONDS = 1800;

/** The claims as Flask mints them, with `overrides` on top. */
export function moduleTokenClaims(overrides: Record<string, unknown> = {}): ModuleTokenClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    user_id: "070b40af-d5fc-4430-8e25-f11b3294d5f5",
    entity_id: "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f",
    xero_org_id: "",
    role: "admin",
    system_role: "normal",
    module: "billing",
    sid: "unit-test-sid",
    billing_enabled: true,
    petty_cash_enabled: true,
    exp: now + TOKEN_LIFETIME_SECONDS,
    iat: now,
    ...overrides,
  };
}

function b64url(text: string): string {
  const bytes =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(text)))
      : Buffer.from(text, "utf8").toString("base64");
  return bytes.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A token of the right shape with a stub signature. Nothing this app does client-side verifies
 * a signature - the API re-checks every call - so a unit test never needs a real one. A test
 * that cares about a FORGED token belongs in e2e, where a backend actually looks.
 */
export function unsignedToken(claims: Record<string, unknown> = moduleTokenClaims()): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  return `${header}.${b64url(JSON.stringify(claims))}.stub-signature`;
}

/** A token whose `exp` is `seconds` from now; negative puts it in the past. */
export function tokenExpiringIn(seconds: number, overrides: Record<string, unknown> = {}): string {
  return unsignedToken(
    moduleTokenClaims({ exp: Math.floor(Date.now() / 1000) + seconds, ...overrides }),
  );
}
