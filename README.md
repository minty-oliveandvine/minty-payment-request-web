# minty-payment-request-web

The Payment Request (Module 2) app: the bill list and detail screens, publishing to Xero, Payment
Settings, all under the company's address (`/entity/<shortid>/<name>/...`), and the sidebar drawer (menu, My Profile panel, Subscriptions Overview)
copied from minty-web. The profile and subscription PAGES live in minty-web since 2026-10-01; the
old `/profile/*` addresses forward there through Minty (`middleware.ts`).
Next.js 16 (App Router) + React 19, on **port 3020**.

```bash
npm install
cp .env.example .env.local   # optional - the defaults are the local stack's ports
npm run dev                  # http://localhost:3020, bound to 0.0.0.0
```

People do not sign in here. Minty sends them to `/landing?token=<jwt>` and
[`lib/auth.ts`](lib/auth.ts) keeps that token, the entity id and name in cookies; every
call to the Payment Request API carries it as a bearer token.

## What it talks to

Every URL is read in one place, [`lib/env.ts`](lib/env.ts) (default + trailing-slash strip);
[`next.config.ts`](next.config.ts) lists them under `env` so Next inlines them.

| What                                            | Service                                    | Variable (default)                                                          |
| ----------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `/api/*` — bills, payments, Xero                | minty-payment-request-api (Django, port 8020) | `PAYMENT_REQUEST_API_URL` (`http://localhost:8020`), via [`lib/apiBase.ts`](lib/apiBase.ts) |
| links back to Minty (users, Xero, settings, logout, the `/profile/*` forwards), the subscription notice, My Profile's `/api/me/profile` | Petty Cash — Minty (Flask, port 8010) | `PETTY_CASH_URL` (`http://localhost:8010`), via [`lib/mintyEnv.ts`](lib/mintyEnv.ts) |
| the sidebar's Subscriptions Overview (`/api/me/subscriptions`) | minty-subscription-api (Django, port 8000) | `SUBSCRIPTION_API_URL` (`http://localhost:8000`), via [`components/ui/sidebarHost.ts`](components/ui/sidebarHost.ts) |

These are inlined at build time, so set them in the deployed environment before building; an
unset URL silently means `localhost`. One variable per service, no environment-name switch.
`MAINTENANCE_SHOW_NEW_LINK=1` (optional) shows the new-app link on `/maintenance`.
[`.env.example`](.env.example) lists the whole surface.

## Scripts

|                     |                                                                                  |
| ------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`       | dev server on 3020                                                               |
| `npm run build`     | production build                                                                 |
| `npm run start`     | serve the production build                                                       |
| `npm run lint`      | eslint                                                                           |
| `npm run typecheck` | `tsc --noEmit`                                                                   |
| `npm run test:e2e`  | Playwright, against a stack that is already running — see [e2e/README.md](e2e/README.md) |

There is no CI in this repo (the two workflows that used to be here targeted branches that no
longer exist), so a gate is a command somebody runs: `lint`, `typecheck` and `build` before a
commit, `test:e2e` before a merge.

## Testing

The only tests are the Playwright specs in `e2e/`. They need Next, minty-payment-request-api, Minty and
Postgres all up, mint their own JWT from the shared `SECRET_KEY`, and sign in as the entity
`Minty/scripts/e2e_seed.py` creates — [e2e/README.md](e2e/README.md) has the variables and
the reason nothing is bypassed. Specs skip with a reason when a service is missing.

## Before changing anything

- [`docs/features/README.md`](docs/features/README.md) — one page per feature: how a person
  arrives with Minty's token, the list / dialog / detail page, settings, the sidebar.
- [`docs/ERROR_COPY.md`](docs/ERROR_COPY.md) — the user-facing error standard shared across the
  Minty repos. A failure is a sentence, not a status; `detail` from the backend is rendered as
  is when it reads as one.
- [`docs/code_cleanse/CODE_CLEANSE_NOTES.md`](docs/code_cleanse/CODE_CLEANSE_NOTES.md) — the
  July cleanse of `lib/` and `components/`: what was deliberately kept and why. Historical, but
  several things that look like dead code are explained there.

## Docker

[`docker/Dockerfile`](docker/Dockerfile) is the dev image — dependencies only, source is
bind-mounted by `docker/stack/docker-compose.yml` in the Minty repo.
