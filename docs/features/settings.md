# Payment Settings (moved to the hub) and the maintenance page

## Payment Settings: minty-web's since 2026-11-10

Payment Settings (which of the company's bill account codes the module offers) is minty-web's tab
since 2026-11-10 (owner: every company setting lives in the hub) - `features/payment-settings`,
documented in minty-web `docs/features/payment-settings.md`, with its leave guard and both specs.
This app's old address, `/entity/<shortid>/<name>/settings/payment-request` (and `/settings?tab=`,
which proxy.ts still moves there), only redirects to the same path on accounts-api
(`lib/mintyUrls.ts` `hubSettingsUrl`), whose gated hand-off opens the hub's tab. The sidebar's
Settings goes there too (`components/ui/sidebarHost.ts`; it marks no item current any more), and
the bill form's no-currency line links to the hub's General tab ("Settings, under General").
`components/settings/`, its unit tests and `e2e/06_settings` / `07_settings_leave` were removed
with the move.

## `/maintenance`

A static page the Vercel apps can be pointed at during a cutover window (Minty has no
maintenance gate of its own yet; a real `MAINTENANCE_MODE` is a Part 2 deliverable in
`Minty/docs/modernisation/modernisation_plan.md`).

## Tests

`app/entity/[ref]/[slug]/settings/payment-request` has no page of its own to test; the redirect's
address is `lib/__tests__/mintyUrls.test.ts` (`hubSettingsUrl`), the sidebar's link
`components/ui/__tests__/sidebarHost.test.ts` and `Sidebar.test.tsx`.
