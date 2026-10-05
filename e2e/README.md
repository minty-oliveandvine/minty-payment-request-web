# Payment-request browser tests

```bash
npm install
npm run test:e2e        # against a stack that is already running
```

Real browser, stack already up (Next :3020 `npm run dev`, minty-payment-request-api :8020, Minty :8010,
Postgres). Nothing is started here. Specs skip with a reason when a service or the credentials
are missing.

Why this exists: this app had no tests of any kind, and phase C8 of `docs/modernisation/modernisation_plan.md`
(in the Minty repo) changes what it renders — `bill_status` (`voided → void`, dead members gone),
`publish_state` (`not_published → draft`) and the bill payload. The status tabs, the labels on
the action bar are pinned here first.

## Credentials

The specs arrive the way Minty sends people: `/landing?token=<jwt>`. They mint that JWT
themselves with the shared `SECRET_KEY` (see `e2e/helpers.ts` for why nothing is bypassed):

| Variable | What |
|---|---|
| `E2E_JWT_SECRET` | the `SECRET_KEY` shared by Minty and minty-payment-request-api |
| `E2E_MINTY_USER` / `E2E_MINTY_ENTITY` | the identity `Minty/scripts/e2e_seed.py --print` creates — the entity has the BILL module on, synced suppliers and bill account codes |
| `E2E_MINTY_ENTITY_NAME` | optional, default `E2E Petty Cash Shop` |
| `E2E_BASE_URL` / `E2E_PAYMENT_REQUEST_API_URL` / `E2E_PETTY_CASH_URL` | the three hosts; default the local ports (`http://localhost:3020` / `:8020` / `:8010`), set them to the deployed hosts for a run against a deployment. `E2E_PETTY_CASH_URL` must be the Minty origin the Next server itself resolves (`PETTY_CASH_URL`, `lib/env.ts`) - `03` and `05` compare links and redirects against it |
| `E2E_SUBSCRIPTION_API_URL` | minty-subscription-api, whose `/api/me/subscriptions` `05_sidebar` stubs (default `http://localhost:8000`) |
| `E2E_XERO` | `1` when the e2e entity is connected to a Xero organisation (a Demo Company, linked by hand): `04_xero_publish` runs and the supplier is `ABC Furniture` instead of the seed's placeholder; `E2E_SUPPLIER_QUERY` / `E2E_SUPPLIER` / `E2E_BILL_ACCOUNT_CODE` override the names |

Run the seed in the Minty repo before every run. Never commit any of these values.

## Specs

| File | Journeys |
|---|---|
| `01_handoff.spec.ts` | no token → module selection; the handoff sets the cookies and opens the list at the company's address; another company's page goes to Flask, an old or misspelt address to the company's own (307s); the seven status tabs; the database entitlement (not the JWT claim) decides whether the module shows |
| `02_bill_lifecycle.spec.ts` | Add Payment dialog: save as draft (supplier and account-code pickers) → listed under Draft; Confirm without attachment/due date shows both validation alerts; the draft's detail page |
| `03_payer_portal.spec.ts` | the old `/profile/*` addresses (the pages moved to minty-web on 2026-10-01): each answers a 307 to Minty's `/profile` or `/handoff/minty-web?next=<minty-web page>` with its query string, with and without the billing cookie; the drawer's `/profile/*.svg` assets are still served. Needs only Next |
| `04_xero_publish.spec.ts` | `E2E_XERO=1` only: a complete request (dates, attachment) confirmed → Payment Requested → Publish from the payment actions menu → Republish offered, also after a reload — the real ACCPAY invoice, attachment upload and the Minty token hand-off |
| `05_sidebar.spec.ts` | the sidebar copied from minty-web, over a stubbed Flask profile and billing API: initials → My Profile (440 px, plan, role, the overview), ‹ and Escape; the menu's links from here (Settings and Bills = the company's own addresses); a save sends only what changed and the header follows; a refusal in the card; a failed subscriptions read (a 404 too) shows the card's error and Try again re-reads; Logout clears the cookies and leaves for Minty's `/logout` |
| `06_settings.spec.ts` | Payment Settings: the account-code picker offers the entity's seeded codes |
| `07_settings_leave.spec.ts` | Payment Settings' "Leave without saving?" (only `**/entity-bill-accounts/**` stubbed; Flask's pages, its `/logout` and the backend's logout call caught): nothing changed leaves at once; a tick held by the back link - Go Back and Escape stay, the tick kept; a Flask pill (a real link) goes after Discard changes with no browser prompt; the sidebar's Settings asks ABOVE the drawer and Discard reloads the saved ticks; Logout asks first and Go Back logs nobody out; the browser's Back asks (Go Back stays, Discard goes to the page before, after a save it leaves without asking); a jump of several entries asks too (Discard goes where it was going, Go Back keeps the sentinel, an earlier entry at the same address counts as a jump); nothing ticked greys Save with "Pick at least one account code."; a 409 PUT shows the server's sentence, ON rows sent before OFF |

## Findings the suite records

- **F5** — FIXED in phase C7 (2026-09-17): `/api/me/subscriptions` answers 200 for a payer with no companies. The spec that recorded it left with this app's portal pages (2026-10-01); minty-web's suite covers the portal now.

## Not covered here

Stripe card capture. Submitting a request for real and publishing it are covered only by
`04_xero_publish` against a connected shop (`E2E_XERO=1`); without it the attachment upload
stays with minty-payment-request-api's API tests (storage stubbed).
