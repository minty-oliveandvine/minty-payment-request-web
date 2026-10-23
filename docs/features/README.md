# Features — the payment-request app

`minty-payment-request-web` is the Next.js browser of the bills module. People arrive from Minty
with a token, work on payment requests against minty-payment-request-api, set the payment account codes,
and see their profile and subscriptions overview in the sidebar drawer (managing subscriptions
is minty-web's). Nothing is decided here that a backend does not re-check.

| Feature                                                                                                                                                     | Document                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Arriving with Minty's token, the cookies, the company addresses (`/entity/<shortid>/<name>/...`), refresh, what the role changes on screen, the module gate | [authentication.md](authentication.md) — the system-wide picture is `Minty/docs/features/authentication.md` |
| The list (tabs, filters, table / easy view), the Add Payment dialog, the detail page (attachments, payments, publish, activity)                             | [payment-requests.md](payment-requests.md)                                                                  |
| Payment Request Settings (`/entity/<shortid>/<name>/settings/payment-request`), the maintenance page                                                        | [settings.md](settings.md)                                                                                  |
| The old payer portal (`/profile/*`) — moved to minty-web on 2026-10-01; its addresses forward there                                                         | [payer-portal.md](payer-portal.md)                                                                          |
| The sidebar on every page - the menu and My Profile, copied from minty-web for `@minty/shared`                                                              | [sidebar.md](sidebar.md)                                                                                    |
| Toasts - `components/Toast.tsx`, minty-web's card (white, a bold label, no colour or icon)                                                                  | `Minty/docs/features/toasts.md` - the system-wide rule and the look, value for value                        |
| User-facing error copy                                                                                                                                      | [../ERROR_COPY.md](../ERROR_COPY.md)                                                                        |
| Manual QA checklist to run by hand before a release                                                                                                         | [qa-checklist.md](qa-checklist.md)                                                                          |

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
