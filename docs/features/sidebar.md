# The sidebar — the menu and My Profile (`@minty/shared`)

Since 2026-09-30 every page with the header carries minty-web's **one drawer with two views**
(the user's call, 2026-09-29; "build it now and transfer later to shared"):

- the header's **≡** opens the **menu** (Figma 02);
- the header's **initials** open **My Profile** (Figma 10-A / 10-B) over the page; the menu's
  name switches to it, its **‹** goes back to the menu, its **×** closes the drawer.

Nothing navigates to open it; Escape, a click beside it or a link inside it closes it. 353 px for
the menu; 440 px for My Profile from 640 px up and the whole screen on a phone.

## Where it lives: `@minty/shared`, since 2026-10-12

It was a **copy** of minty-web's from 2026-09-30 ("build it now and transfer later to shared").
The copies are gone. The components now come from the package, pinned by git tag:

| Path here | What it is now |
|---|---|
| `components/ui/Sidebar.tsx` | a 17-line shim re-exporting `@minty/shared/sidebar` |
| `components/ui/SideMenu.tsx` | a shim |
| `components/ui/ViewerBadge.tsx` | a shim |
| `components/ui/NavMenu.tsx` | a shim (it replaced this app's `components/layout/NavMenu.tsx`) |
| `lib/viewer.ts` | a shim over `@minty/shared/viewer` |
| `features/profile/*`, `features/subscription/routes/SubscriptionsOverviewCard.tsx` | **the package's since v0.6** (`@minty/shared/profile`, the redesign here): this app keeps only its Flask calls (`features/profile/api/profile.ts` `profileApi`), its subscriptions read and its toast. No PASSWORD row. |

Each shim's first line is `import "@/components/ui/sidebarHost";`, and that is load-bearing: it
registers this app's host before anything renders. Keeping the paths is why no page, feature or
test had to change.

**Everything that is this app's lives in ONE file, `components/ui/sidebarHost.ts`** — the company
and modules in the cookie, where the items lead from here, this app's router, the scroll lock
(`#app-scroll-root`, not `body`: below 1280 px `html`/`body` are `position: fixed`, so a body lock
would do nothing), Logout, and how Flask and minty-subscription-api are reached. It was written in
2026-09-30 as the list of what a shared package would have to take as injection, and that is now
literally its job.

Three fields it gained when the package arrived:

- `app: "minty-payment-request-web"` — the "one page, one app" guard keys on this, not on object
  identity: Next re-evaluates the module per bundler layer and on every HMR edit, so identity threw
  on an ordinary dev reload.
- `usePathname()` — this app's router, imported **here** rather than in the package, because
  `vi.mock("next/navigation")` does not reach a module inside `node_modules`.
- `loadViewer()` — the `/api/me/profile` read, since the two apps' fetchers disagree about what a
  401 means (`"reauth"` here, `"handoff"` in minty-web).

`currentOf` now takes a pathname instead of reading `window.location` itself, so the packaged
sidebar can feed it. It never reports `"profile"` — that page is minty-web's — which is why the
menu's person block always opens the profile view here rather than just closing.

### Two config lines, one of which fails silently

`app/globals.css` carries `@import "@minty/shared/theme.css";` (the font tokens) and
`@source "../node_modules/@minty/shared/src";`. **Tailwind v4 never scans `node_modules`**, so
without that `@source` line every utility class in the packaged sidebar is dropped from the
generated CSS — unstyled, no error. `@source` must sit **after every `@import`** or it invalidates
the last one. `next.config.ts` carries `transpilePackages: ["@minty/shared"]` (the package ships
`.ts` source) and `vitest.config.ts` carries `server.deps.inline`, since Vitest does not read
`transpilePackages`. All of it is guarded by `app/__tests__/packagedStyles.test.ts`.

**The pin is `v0.5` since 2026-10-19** (the owner: every app on the latest shared sidebar),
the same tag as minty-web. v0.5 is v0.4 plus the `pettycash` preview label and a closed sheet
that casts no shadow onto the page's right edge. It draws minty-web's Minty v2 look: a 353px sheet, 44px rows in
`text-title-l`, the module headings with their icons on the right, and the 99px logo. Before
that, `v0.2` (2026-10-13) brought the token sheet (`@import "@minty/shared/tokens.css"` in
`app/globals.css`; the local copy is gone), Active by `aria-current`, and an opt-in `rail` (fixed
on the right from 1280px, `SIDEBAR_RAIL_OFFSET`). The rail was drawn for v0.2's compact look and
has not been checked with v0.4's geometry; this app doesn't turn it on. `packagedStyles.test.ts`
pins the v0.4 sidebar (353px panel, the nav's safe-area padding, the logo's offset).

The menu's 15 `/menu/*` images stay in **this app's `public/`** — Next cannot serve a static file
out of `node_modules`. `app/__tests__/packagedAssets.test.ts` asserts the package's
`SIDEBAR_ASSETS` list against it.

`app/layout.tsx` composes it, as minty-web's layout does:
`<SidebarProvider profile={<ProfilePanel subscriptions={<SubscriptionsOverviewCard />} />}>`.
`components/layout/Header.tsx` draws `ViewerBadge` and the ≡ on the right of every header.

## The menu from this app

| Item | Goes to |
|---|---|
| the person | My Profile, in place |
| Select Entity | Minty's `/entity` (minty-web's list wherever the hub is on), through `/entity/<id>/enter` |
| Manage subscriptions (always; no switch since 2026-10-01) | minty-web's portal, through Minty's `/handoff/minty-web` |
| Petty Cash › Dashboard, Reports (company has Petty Cash) | Minty, through `/entity/<id>/enter` |
| Payment Request › Bills | the company's list, `/entity/<shortid>/<name>/payment-request` |
| **Settings** | **this app's own Payment Request Settings** (`/entity/<shortid>/<name>/settings/payment-request`) — Settings opens the settings of the app it is pressed in (the user's call, 2026-09-30); minty-web's menu keeps its module page |
| Logout | ends the session everywhere: `POST /api/auth/logout` (presence), the cookies and the Easy view choice go, then Minty's `/logout` (the user's call, 2026-09-30 — it used to leave Minty signed in on its entity list). While Payment Request Settings has unsaved ticks it **asks first** ("Leave without saving?"): nothing runs until Discard changes; Go Back stays, signed in ([settings.md](settings.md)) |

## My Profile

The same reads minty-web makes, with this app's token:

- Flask's `GET /api/me/profile?entity=<company>` - the company, its plan line (Payment Request
  blue, Petty Cash amber, SuperMinty teal with the caped cat), the person's role, the details
  card. Flask's hub routes name `PAYMENT_REQUEST_WEB_URL` in their CORS for this.
- Edit → Save sends only what changed (`PATCH /api/me/profile`); Flask's refusal sentence is
  shown in the card; the header's initials change at once. PASSWORD · Change opens the Xero
  account page.
- The **Subscriptions Overview**: minty-subscription-api's `GET /api/me/subscriptions`
  (`SUBSCRIPTION_API_URL`, default `http://localhost:8000`), the same figures as
  minty-web's portal; a failed read (a 404 included - there is no dark switch since 2026-10-01)
  shows the card's error with Try again; *Manage Subscription* goes to minty-web's portal. Its
  types (`PortalEntity`, `PortalModule`) are minty-web's, in
  `features/subscription/api/payerSubscriptions.ts`.
- A 401 is refreshed once (`refreshToken`), then the browser goes back to Minty
  (`redirectToLogin`); the initials' read never moves the page.

This app has no profile PAGE since 2026-10-01: `/profile` and the old portal addresses forward
to minty-web through Minty ([payer-portal.md](payer-portal.md)). Where the initials or the
menu's name are drawn outside the drawer, they are plain links to Minty's `/profile`
(`links.profile`), which opens minty-web's.

## Tests

`e2e/05_sidebar.spec.ts` (Flask's profile and the billing API stubbed): the initials open My
Profile (440 px, plan line, role, the overview's figures, *Manage Subscription*'s way), ‹ and
Escape; the menu's links from here, Settings = this app's Payment Request Settings; a save sends only what changed and
the header follows; a refusal shown in the card; a failed subscriptions read shows the card's
error and Try again re-reads; Logout clears the cookies and leaves for Minty's `/logout`.
`e2e/07_settings_leave.spec.ts`: Logout over unsaved Payment Request Settings asks first, and Go Back
logs nobody out.
