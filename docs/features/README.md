# Features — the payment-request app

`minty-payment-request-web` is the Next.js browser of the bills module. People arrive from Minty
with a token, work on payment requests against minty-payment-request-api, set the payment account codes,
and see their profile and subscriptions overview in the sidebar drawer (managing subscriptions
is minty-web's). Nothing is decided here that a backend does not re-check.

| Feature                                                                                                                                                                                                                                                                                 | Document                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Arriving with Minty's token, the cookies, the company addresses (`/entity/<shortid>/<name>/...`), refresh, what the role changes on screen, the module gate                                                                                                                             | [authentication.md](authentication.md) — the system-wide picture is `Minty/docs/features/authentication.md` |
| The design system as applied here (Parts 13–15: tokens, `components/ui/` primitives, status tones, the status × action matrix), the list (status chips, filters, Easy / Table view), the Add page, the Record payment drawer, the detail page (attachments, payments, publish, history) | [payment-requests.md](payment-requests.md)                                                                  |
| Payment Request Settings (`/entity/<shortid>/<name>/settings/payment-request`), the maintenance page                                                                                                                                                                                    | [settings.md](settings.md)                                                                                  |
| The old payer portal (`/profile/*`) — moved to minty-web on 2026-10-01; its addresses forward there                                                                                                                                                                                     | [payer-portal.md](payer-portal.md)                                                                          |
| The sidebar on every page - the menu and My Profile, copied from minty-web for `@minty/shared`                                                                                                                                                                                          | [sidebar.md](sidebar.md)                                                                                    |
| Toasts - `components/Toast.tsx`, Part 14's toast since 2026-10-13 (bottom-left on a computer, bottom-centre on a phone; success only - errors are inline). In this app Part 14 wins over minty-web's card                                                                               | `Minty/docs/design/` (Part 14) - `Minty/docs/features/toasts.md` still describes minty-web's look           |
| User-facing error copy                                                                                                                                                                                                                                                                  | [../ERROR_COPY.md](../ERROR_COPY.md)                                                                        |
| Manual QA checklist to run by hand before a release                                                                                                                                                                                                                                     | [qa-checklist.md](qa-checklist.md)                                                                          |

**Shared non-UI code (the shared-code refactor, owner 2026-10-21: one shared module per concern,
in every app).** These come from `@minty/shared` and have no local copy; what is left in `lib/` is
this app's configuration of them:

| `@minty/shared/…`                                                                                                                                  | Here as                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apiClient` (`createBearerClient`, `ApiError`, `SESSION_ENDED`), `errorCopy`                                                                       | `lib/api.ts`'s `apiFetch`; `components/ui/sidebarHost.ts`'s `mintyApi`, `mintyQuietApi`, `subscriptionApi`                                                                           |
| `auth` (`createCookieAuth`, `decodeJwtPayload`, `isTokenExpired(token)`, `isTokenExpiringSoon(token)`, `moduleClaims`)                             | `lib/auth.ts` (the `billing_` cookies, 8 hours; keeps `setAuth(token, id, name)`, the role/sid claims, `refreshToken`, `redirectToLogin`); `lib/moduleClaims.ts`'s `useEntitlements` |
| `env` (`envUrl`)                                                                                                                                   | `lib/env.ts` - a production build with a URL unset throws                                                                                                                            |
| `dates` (`formatDay`, `formatInstantDay`, `isoDateInTimeZone(timeZone, date)`, `HK_TIME_ZONE`)                                                     | used directly; `lib/dateDisplayFormat.ts` keeps only `formatLocalDateForDisplay` and `parseDdMmmYyyyToIso`                                                                           |
| `handoff` (`hubHandoffUrl`, `mintyEntryUrl`), `landing` (`useLandingHandoff`)                                                                      | `middleware.ts` (old `/profile/*` links), `sidebarHost`'s `handoff`, `lib/mintyUrls.ts`'s `buildMintyEnterUrl` (with this app's fallback, Minty's `/entity`), `app/landing/page.tsx` |
| `portal` (`createProfileApi`, `fetchAllSubscriptions`, `loadViewer`)                                                                               | `features/profile/api/profile.ts`, `SubscriptionsOverviewCard`'s `loadSubscriptions`, `sidebarHost.loadViewer`                                                                       |
| `clientValue` (`useClientValue`), `scrollLock` (`pushAppScrollLock`), `companyRef` (`pettyCashSettingsUrl`), `safeNext`, `previewSibling`, `money` | used directly. The settings pills' other three builders stay in `SettingsPills.tsx`: the package's `settingsSectionUrl` would route them differently                                 |

**Config files on the package's presets (2026-10-22), the same in every Next.js app.**
`tsconfig.json` extends `@minty/shared/tsconfig.base.json` and keeps only `paths`, `include`,
`exclude` and this app's one difference, `"allowJs": true`; `eslint.config.mjs` is
`@minty/shared/eslint` with nothing added; `package.json`'s `"prettier"` key names
`@minty/shared/prettier` (with `format` / `format:check` scripts - `prettier` itself is not yet a
devDependency here); `vitest.config.ts` is `mintyVitest(import.meta.url, { exclude: ["public/**"] })`;
`playwright.config.ts` is `mintyPlaywright({ port: 3020 })`; `next.config.ts` wraps its `env` block
and the pdf.js asset copy in `withMintyDefaults`, which adds the security headers,
`poweredByHeader: false`, `transpilePackages` and `allowedDevOrigins: ["127.0.0.1"]`; and
`e2e/helpers.ts` takes `credentials`, `mintModuleToken`, `reachable` and `companyRef` from
`@minty/shared/e2e` (plain JS, so Playwright loads it - the old `e2e/companyRef.ts` copy and its pin
test are gone; `requireCredentials` stays local because it skips where the package's throws, and
`expectNoSideScroll(page, width)` because it takes the width). `.editorconfig` is the same file in
every app. A shared setting changes in the package and a pin bump, never here.

Link previews (owner, 2026-10-23): a link to any page of this app, pasted into a chat app, previews with one card - the Minty cat mark (`Minty/static/img/new_logo.png`, the flat drawing) centred on a white 1200x630 PNG. It is `app/opengraph-image.png` and `app/twitter-image.png` (alt text "Minty" in the `.alt.txt` beside each), which Next attaches to every route that sets no image of its own, plus `openGraph`/`twitter` in `app/layout.tsx`. The same file sits in minty-web, minty-petty-cash-web, minty-payment-request-web and minty-onboarding-web, and `app/__tests__/linkPreview.test.ts` pins its size and sha256 in each: a new card goes into all four, with the new hash. There is no `metadataBase`; on Vercel Next makes the image URL absolute from the deployment's own address. Previews never name a company or show report data.

Email fields take English only (2026-10-01): My Profile's email spreads `useEmailInput` from
`lib/emailInput.ts`, a copy of minty-web's. The input is `type="text" inputMode="email"`, anything
outside printable ASCII is dropped once an IME composition ends, and the field says why. Flask
refuses such an address again on save. See minty-web's `docs/features/README.md`.

Fonts (2026-10-12): **Inter**, self-hosted through `next/font` in `app/layout.tsx` and bound to
`--font-sans` in `app/globals.css`'s `@theme`. That block is a **copy of minty-web's, byte for
byte** — minty-web's `docs/features/README.md` carries the reasoning — so change the two together
until `@minty/shared` takes the tokens at Part 3 step 4. Two tokens only, `--font-sans` and
`--font-brand`; there is no `--font-mono` (nothing uses the mono utility, and Tailwind's own
default keeps it monospace) and no emoji tail. `--font-brand` is Plus Jakarta Sans for the "Minty"
name, and it is here only for parity: this app draws no lockup as text — its mark is
`public/menu/minty-logo.svg` in `components/ui/SideMenu.tsx` — so **Jakarta is not loaded** and the
token falls through to Inter. Adding a text lockup here means adding the `next/font` call in
`app/layout.tsx` too, not just the class. The icon font is the `material-symbols` npm package,
imported without `layer(base)`, so its own unlayered `font-size: 24px` wins and every glyph is
24px — the pixel font-size utilities on those spans have no effect. Do not write a bare
Tailwind class name in prose here: v4's source detection scans Markdown and CSS too, so naming a
class is enough to generate it.

Running it and the environment variables: the repo `README.md`. Tests: `npm test` (Vitest - unit
and component, no stack) and `npm run test:e2e`
(Playwright against a running stack — `e2e/README.md`; the Xero publish needs `E2E_XERO=1`). The cleanse log is in `../code_cleanse/`.
