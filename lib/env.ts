/**
 * The three URLs this app reads - and the only place it reads them.
 *
 * next.config.ts's `env` block hands each plain name through (raw, "" when unset), so Next
 * inlines every literal `process.env.X` below into the client bundle AND middleware.ts at
 * build time. Spell each one out: a dynamic `process.env[name]` is never inlined and silently
 * reads undefined in the browser.
 *
 * Defaults are the local stack's ports (Petty Cash 8010, Payment Request API 8020, Subscription
 * API 8000); trailing slashes are stripped. The deployed app sets all three explicitly. No
 * environment-name switch - one variable, one URL.
 */

function url(raw: string | undefined, fallback: string): string {
  const value = (raw ?? "").trim();
  return (value || fallback).replace(/\/+$/, "");
}

export const env = {
  /** Petty Cash (Minty, Flask) - login, `/enter`, the re-handoff to minty-web, the profile. */
  PETTY_CASH_URL: url(process.env.PETTY_CASH_URL, "http://localhost:8010"),
  /** minty-payment-request-api - every `/api/v1` call this app makes. */
  PAYMENT_REQUEST_API_URL: url(process.env.PAYMENT_REQUEST_API_URL, "http://localhost:8020"),
  /**
   * minty-subscription-api - the sidebar's Subscriptions Overview (`/api/me/subscriptions`)
   * and the landing page's subscription notice (`/api/entities/{id}/subscription-notice`).
   */
  SUBSCRIPTION_API_URL: url(process.env.SUBSCRIPTION_API_URL, "http://localhost:8000"),
} as const;
