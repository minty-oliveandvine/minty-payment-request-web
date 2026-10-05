# Authentication — minty-payment-request-web's half

Nobody signs in here. Minty (Flask) authenticates the person, mints a short-lived JWT and
sends the browser to this app; everything after that is carrying that token to
minty-payment-request-api, and — for the subscription notice and the sidebar — straight to Minty and
minty-subscription-api. The system-wide picture
is `Minty/docs/features/authentication.md`; minty-payment-request-api's verification is
`minty-payment-request-api/docs/features/authentication.md`.

## Arriving: `/landing`

Minty links **Payments** to `/landing?token=<jwt>&entity_id=&entity_name=&next=&from=`
(`app/landing/page.tsx`). The page stores the token, the entity id and name in cookies
(`lib/auth.ts`: `billing_token`, `billing_entity_id`, `billing_entity_name`, `SameSite=Lax`,
`Secure` on https, **8 hours**) and forwards to `next` (the bill list by default; a path on this
origin only - `lib/safeNext.ts`, a COPY of minty-web's: no `//host`, backslash or control
character, which until 2026-10-05 let `next=/%5Cevil.com` leave the site); `from` is
ignored since 2026-10-01 (its `billing_from` cookie served only the deleted profile pages' back
links). Without a token the middleware sends every page except `/landing` and
`/module-selection` to `/module-selection` (`middleware.ts`), which offers the way back into
Minty.

The old profile and payer-portal addresses (`/profile/*`) are forwarded by the middleware
BEFORE that check - an old email link arrives with no cookie - to minty-web through Minty:
`/profile` to Flask's `/profile?from=bills` (its profile router), the portal pages to Flask's
`/handoff/minty-web?next=<minty-web page>`, the query string kept ([payer-portal.md](payer-portal.md)).

The cookies are readable by script on purpose (the app itself attaches the token); they
are cleared client-side on logout and by `POST /api/auth/logout` on the backend. **Logout** (the
sidebar's menu and My Profile — [sidebar.md](sidebar.md)) ends the session everywhere since
2026-09-30: after those two it leaves for Minty's `/logout`, where it used to land on Minty's
entity list with Minty still signed in.

## Using the token

`lib/api.ts::apiFetch` sends `Authorization: Bearer <token>` and `X-Entity-Id` on every
call to minty-payment-request-api (`PAYMENT_REQUEST_API_URL`). The JWT itself lives **30
minutes**; the cookie 8 hours; `lib/auth.ts::refreshToken` calls
`POST /api/auth/token/refresh` when the token is expiring soon (`isTokenExpiringSoon`) so
an open tab keeps working — a 401 that survives a refresh sends the person back to Minty
(`/entity/<id>/enter`).

The role and the module claims in the token (`lib/moduleClaims.ts`, `useUserRole`) are
read for the **first paint only**; `components/ModuleGate.tsx` then confirms the
entitlement from `GET /api/auth/entitlements` and the backend re-checks role and
membership on every call — the database decides, not the claim
(`e2e/01_handoff.spec.ts` proves it).

## What the role changes on screen

`useUserRole()` decides which actions render: cashiers and shop managers create and
edit; accountant / admin / super_admin (the *elevated* roles) also record payments,
return, void and publish. The backend refuses the rest regardless
(`minty-payment-request-api/core/permissions.py`).

## The subscription notice talks to Minty directly

The landing page's subscription notice (`lib/subscriptionNotice.ts`,
`components/SubscriptionNoticeModal.tsx`) fetches Flask's
`GET /api/entity/<id>/subscription-notice` with the same billing JWT (the origin from
`PETTY_CASH_URL`, `lib/mintyEnv.ts`): Minty signed it, so Minty verifies it. Two kinds come back, `past_due` and
`pending_cancel` (no trial kind since 2026-10-01). Its button opens `settings_path` - a Flask path
with its own query, e.g. `/handoff/minty-web?next=%2Fsubscription%2Fentities%2F<id>%2Fmodules&entity_id=<id>`
- through `/entity/<id>/enter` (`buildMintyEnterUrl`, which URL-encodes it whole as `next`). A
failed notice shows nothing.

## The sidebar talks to Flask and minty-subscription-api directly

My Profile reads and saves Flask's `/api/me/profile`, the header's initials read it once per
token, and the Subscriptions Overview reads minty-subscription-api's `/api/me/subscriptions` — all
with this app's token (`components/ui/sidebarHost.ts`; [sidebar.md](sidebar.md)).

## Configuration

`PAYMENT_REQUEST_API_URL` (minty-payment-request-api, default `http://localhost:8020`),
`PETTY_CASH_URL` (Minty, default `http://localhost:8010` — one variable, no environment-name
switch), `SUBSCRIPTION_API_URL` (minty-subscription-api, default `http://localhost:8000`); all
read in `lib/env.ts` and inlined at build time (`next.config.ts` `env`).

## Tests

`e2e/01_handoff.spec.ts` (no token → module selection; the hand-off sets the cookies; the
database entitlement decides). There is no unit-test runner in this repo — the Playwright
suite is the test suite, and it mints its own token with the shared `SECRET_KEY`
(`e2e/README.md`).
