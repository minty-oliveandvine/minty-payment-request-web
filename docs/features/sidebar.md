# The sidebar — the menu and My Profile (copied from minty-web)

Since 2026-09-30 every page with the header carries minty-web's **one drawer with two views**
(the user's call, 2026-09-29; "build it now and transfer later to shared"):

- the header's **≡** opens the **menu** (Figma 02);
- the header's **initials** open **My Profile** (Figma 10-A / 10-B) over the page; the menu's
  name switches to it, its **‹** goes back to the menu, its **×** closes the drawer.

Nothing navigates to open it; Escape, a click beside it or a link inside it closes it. 353 px for
the menu; 440 px for My Profile from 640 px up and the whole screen on a phone.

## COPIES, to be lifted into `@minty/shared`

The files sit at minty-web's own paths, each headed `COPY of minty-web/<path> (2026-09-30) -
lifted into @minty/shared at Part 3 step 4; change all three (minty-web, here, Flask's port)`:

| File | minty-web's original |
|---|---|
| `components/ui/Sidebar.tsx` (`SidebarProvider`, `useSidebar`, `SidebarDrawer`) | the same |
| `components/ui/SideMenu.tsx` (the menu) | the same |
| `components/ui/ViewerBadge.tsx` (the initials) | the same |
| `components/ui/NavMenu.tsx` (the ≡) | the same; it replaced this app's `components/layout/NavMenu.tsx` |
| `lib/viewer.ts` (name and initials, read once per token) | the same |
| `features/profile/*` (`ProfilePanel` and its parts) | the same, without the `/profile` page |
| `features/subscription/*` (the Subscriptions Overview card) | `SubscriptionsOverviewCard.tsx`, `overview()` from `lib/billing.ts` |

**Everything that is this app's lives in ONE file, `components/ui/sidebarHost.ts`** — the company
and modules in the cookie, where the items lead from here, the scroll lock (`#app-scroll-root`),
Logout, and how Flask and minty-subscription-api are reached. It is the list of what the shared
package will take as injection; the lift deletes the copies and keeps the host.

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
