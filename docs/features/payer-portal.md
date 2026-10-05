# The payer portal (`/profile/*`) — moved to minty-web

On 2026-10-01 this app's My Profile and payer-portal pages (`app/profile/**`,
`components/profile/*`, `lib/payerPortal.ts`) were deleted: they live in minty-web. The
middleware (`middleware.ts`) forwards every old address, with or without the billing cookie
and with its query string, to minty-web through Minty (Flask):

| Old address | Goes to (307) |
|---|---|
| `/profile` (and any `/profile/*` not below) | `{MINTY}/profile[?query]` (an old `from=bills` is dropped) |
| `/profile/subscriptions` | `{MINTY}/handoff/minty-web?next=/subscription/subscriptions[?query]` |
| `/profile/subscriptions/incoming` | `…?next=/subscription/subscriptions/incoming[?query]` (minty-web reads `?transfer=`) |
| `/profile/subscriptions/subscriber` | `…?next=/subscription/subscriptions/subscriber[?query]` |
| `/profile/billing`, `/profile/invoices` | `…?next=/subscription/billing` |

`next` is URL-encoded. `public/profile/*` (the drawer's icons) is still served — the matcher
skips dotted paths. Pinned by `e2e/03_payer_portal.spec.ts`. What stays here: the sidebar's My
Profile panel and Subscriptions Overview ([sidebar.md](sidebar.md)) and Payment Request Settings
([settings.md](settings.md)).
