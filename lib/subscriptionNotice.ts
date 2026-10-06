/**
 * Subscription notice — fetched from minty-subscription-api, the subscription engine.
 *
 * Everything else here goes through the payment request API (`API_BASE`), but
 * subscription state lives only in the subscription engine: the trials, the dunning
 * clock and the billing anchor are all its. So this calls `SUBSCRIPTION_API_URL`,
 * authenticating with the same JWT the app already holds — Petty Cash signs it with the
 * shared key, so the subscription API can verify it. A token that names no company is
 * held to the caller's membership of the company in the path.
 *
 * Deliberately quiet. A notice is an interruption, not a feature: if the request
 * fails, times out, or the user's token has aged out, the landing page shows
 * nothing rather than an error. Never throws.
 */
import {
  getAuth,
  getLoginSidFromToken,
  isTokenExpiringSoon,
  refreshToken,
} from "./auth";
import { env } from "./env";

export type NoticeSeverity = "critical" | "warning" | "info";

/**
 * The two kinds the engines still emit. No trial kind any more (`trial_ending`, `needs_card`,
 * `needs_consent` were retired - the user's decision, 2026-10-01).
 */
export type NoticeKind = "past_due" | "pending_cancel";

export type SubscriptionNoticeItem = {
  kind: NoticeKind;
  severity: NoticeSeverity;
  /** Display name of the module this is about, e.g. "Petty Cash". */
  module: string;
  module_code: string;
  title: string;
  detail: string;
  deadline: string | null;
};

export type SubscriptionNotice = {
  items: SubscriptionNoticeItem[];
  /** True only for the payer — anyone else is shown who to ask instead. */
  can_manage: boolean;
  payer: { name: string; email: string } | null;
  severity: NoticeSeverity | null;
  /** Minty PATH (not URL) for the subscription settings page. */
  settings_path: string | null;
};

/** How long to wait before giving up. A landing page must not block on this. */
const NOTICE_TIMEOUT_MS = 6000;

/**
 * Why nothing was shown. Silent in production — a notice failing is not the user's
 * problem — but logged in development, because "no modal appeared" is otherwise
 * indistinguishable from "nothing to say" and there is nowhere to look.
 */
function debugNotice(reason: string, extra?: unknown) {
  if (process.env.NODE_ENV === "production") return;
  console.warn(`[subscription-notice] ${reason}`, extra ?? "");
}

async function requestNotice(
  url: string,
  token: string,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTICE_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    debugNotice("request failed (network / CORS / timeout)", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches the entity's subscription notice, or null when there's nothing to show
 * (including every failure path — see the module comment).
 */
export async function fetchSubscriptionNotice(): Promise<SubscriptionNotice | null> {
  const auth = getAuth();
  if (!auth?.token || !auth.entityId) {
    debugNotice("no auth cookie — not signed in to an entity");
    return null;
  }

  const url = `${env.SUBSCRIPTION_API_URL}/api/entities/${encodeURIComponent(auth.entityId)}/subscription-notice`;

  // The billing JWT lives 30 minutes but its cookie lives 8 hours, so a tab left
  // open holds a token the API will reject long before the cookie disappears. Refresh
  // up front rather than burning the first attempt on a guaranteed 401.
  let token = auth.token;
  if (isTokenExpiringSoon()) {
    if (await refreshToken()) {
      token = getAuth()?.token ?? token;
    } else {
      debugNotice("token expiring and refresh failed — skipping");
    }
  }

  let res = await requestNotice(url, token);
  if (!res) return null;

  // One retry behind a refresh: the token may have aged out between the check above
  // and the request, and the API is the only judge of that.
  if (res.status === 401 && (await refreshToken())) {
    const fresh = getAuth()?.token;
    if (fresh) res = (await requestNotice(url, fresh)) ?? res;
  }

  if (!res.ok) {
    debugNotice(`server said ${res.status}`, await res.text().catch(() => ""));
    return null;
  }

  try {
    const data = (await res.json()) as SubscriptionNotice;
    if (!data || !Array.isArray(data.items)) {
      debugNotice("malformed response", data);
      return null;
    }
    if (data.items.length === 0) {
      debugNotice("nothing to report for this entity");
      return null;
    }
    return data;
  } catch (err) {
    debugNotice("could not parse response", err);
    return null;
  }
}

/** sessionStorage key holding the entries already shown in this tab. */
const SEEN_KEY = "subscription_notice_seen";

/**
 * What gets recorded as "seen": the sign-in, then the entity.
 *
 * Keying by entity ALONE made this flag per-tab rather than per-login — signing out
 * and back in without closing the tab left the notice suppressed here while Minty's
 * dashboard correctly showed it again, because Minty resets its own flag on login and
 * this one had nothing to reset against. The `sid` claim changes on every sign-in, so
 * including it retires every previous login's entries at once.
 *
 * Falls back to the bare entity id when the token carries no sid — an older token, or
 * one minted outside a request context. That is the previous per-tab behaviour, which
 * is the right thing to degrade to.
 */
function seenKeyFor(entityId: string): string {
  const sid = getLoginSidFromToken();
  return sid ? `${sid}:${entityId}` : entityId;
}

/**
 * Whether to show the notice now — and if so, mark it shown.
 *
 * Mirrors Minty's `claim_subscription_notice`: once per entity, per sign-in. The two
 * apps still keep SEPARATE flags — sessionStorage is partitioned by origin, and
 * Minty's lives in a server-side session this app cannot reach — so visiting both
 * surfaces shows the notice on each. What the sid buys is that both now reset on the
 * same event.
 */
export function claimSubscriptionNotice(entityId: string): boolean {
  if (!entityId) return false;
  const key = seenKeyFor(entityId);
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const seen: string[] = Array.isArray(parsed) ? parsed : [];
    if (seen.includes(key)) return false;
    // Drop entries from other sign-ins rather than appending forever: once the sid
    // changes they can never match again, so keeping them is pure growth.
    const sid = getLoginSidFromToken();
    const current = sid ? seen.filter((k) => k.startsWith(`${sid}:`)) : seen;
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...current, key]));
    return true;
  } catch {
    // Private mode / storage disabled: show it rather than suppress it. A repeated
    // warning is a smaller failure than a missed one.
    return true;
  }
}
