# Manual QA checklist — minty-payment-request-web

A manual walkthrough checklist for this app, to run alongside the automated suite
(`## Tests` in each doc below, and `e2e/README.md`). This is not a replacement for it — it
exists for exercising the app by hand in a browser before a release, and for checking the
sharp edges the docs call out explicitly. Run it against the seeded e2e entity
(`Minty/scripts/e2e_seed.py --print`), not a real company — Payment Request Settings writes
live account-code state and Publish writes a real Xero invoice when `E2E_XERO=1` is live.

## Handoff and auth ([authentication.md](authentication.md))

- [ ] Arriving at `/landing?token=<jwt>&entity_id=&entity_name=&next=` stores the token and
      entity cookies (`billing_token`, `billing_entity_id`, `billing_entity_name`) and forwards
      to `next`.
- [ ] No token on any page other than `/landing` → sent back into Minty's `/entity`.
- [ ] `next` pointing off-site (`//host`, a backslash, a control character) is refused by
      `safeNext.ts` — confirm it lands on the default page, not the attempted address.
- [ ] `from` on the landing URL is ignored (no back-link behaviour from it).
- [ ] The role/module claims in the token only decide the very first paint; reload or wait for
      `ModuleGate`'s `GET /api/auth/entitlements` call and confirm the database's answer wins
      over a stale claim.
- [ ] A token that is about to expire is silently refreshed (`POST /api/auth/token/refresh`)
      while the tab sits open; a 401 that survives a refresh sends the person back to Minty via
      `/entity/<id>/enter`.
- [ ] Logout (sidebar menu and My Profile) ends the session everywhere: cookies cleared,
      `POST /api/auth/logout` called, then landing on Minty's own `/logout` — not back on this
      app's or Minty's entity list still signed in.

## Company address resolution ([authentication.md](authentication.md#addresses))

- [ ] Opening another company's page while the cookie names a different company (stale tab,
      bookmark, expired cookie) redirects (307) through Flask, which re-mints a token for that
      company and lands on the same kind of page (list / one request / settings).
- [ ] A misspelt company name or wrong-case short id in the URL redirects (307) to the cookie
      company's exact spelling.
- [ ] The old addresses `/`, `/payment-request/<id>`, `/settings` redirect (307) to the current
      `/entity/<shortid>/<name>/...` form, query string kept.
- [ ] None of the above ever come back as a 308 — confirm with devtools' network tab (a cached
      308 would strand the next company opened in the same browser on the wrong address).
- [ ] An old `?request=<id>` hand-off link loads the right request, then the address bar
      updates itself to the Payment No. form via `router.replace` (Back is unaffected).

## The payment-request list ([payment-requests.md](payment-requests.md))

- [ ] All seven status chips (All, Payment Requested, Partially Paid, Returned, Paid, Draft,
      Voided) filter correctly, each shows its count, and several can be stacked; on a phone the
      chip row scrolls sideways rather than wrapping.
- [ ] Search (supplier, reference, description), the amount range, the invoice/due date range,
      and the Xero publish-state filter each narrow the rows as expected, and compose together.
- [ ] Table and Easy View show the same rows and totals; the Easy view | Table view control
      persists the choice, and is not shown below 768px (a phone always gets Easy view).
- [ ] Each row offers only its ONE next action (Record payment, View payments, Continue or
      View - `lib/requestActions.ts`); a cashier or a view-only visitor sees no Record payment at
      all, and Table view's Payment and Bankslip cells show "-" rather than a dead button.
- [ ] The totals banner reflects only the rows currently shown (after filtering), not the whole
      list.
- [ ] Every amount displays in the entity's own currency, never a bill's stored currency code.
- [ ] The Add page for a company with no currency: the alert under Invoice amount links to
      Entity & Integration, and Submit for payment / Save as draft are disabled with that
      reason as their title.
- [ ] Block `/payments` in devtools: the Bank Slip cell shows **Retry**, never **Upload**;
      unblock and press Retry → the real count appears.
- [ ] Bulk-deleting drafts from the table removes exactly the selected rows.
- [ ] Pagination keeps filters and the active chips when moving between pages; it reads
      "Showing 1–10 of N" and offers 10/25/50/100 rows per page.

## The Add page (`<list>/new`, [payment-requests.md](payment-requests.md))

- [ ] **Add payment request** on the list opens the Add page (a page, not a dialog), fields in
      invoice order: Invoice, Supplier, Invoice amount, the two dates, Description, Account code,
      then More details (Payment No.).

- [ ] Supplier picker searches the entity's synced Xero contacts; "create new" adds the
      contact in Xero itself.
- [ ] Creating a new supplier while the entity has no live Xero connection fails visibly: the
      picker closes, the field turns red, and the API's own message shows under it until the
      name is edited (not a silent no-op).
- [ ] The account-code combobox only offers `entity_bill_account_xero` codes already ticked on
      in Payment Request Settings.
- [ ] Payment No. (under More details) pre-fills a suggested reference; it can still be
      overridden by hand.
- [ ] **Save as draft** succeeds with nothing filled in (no validation at all), returns to the
      list and says so in a toast.
- [ ] **Submit for payment** validates amount, supplier, account code, both dates, and at least
      one attachment. Two or more problems: an error summary at the top takes focus and links
      to each field; one problem: focus goes straight to that field. Each field also shows its
      own message (`role="alert"`) in Part 11 wording ("The amount is still empty. Add the
      invoice amount to continue.").
- [ ] Attachments accept pdf, jpg, png, html (no spreadsheets since 2026-10-09); an added image
      is visibly compressed before upload.
- [ ] Submit uploads attachments only after the bill itself exists, then opens the new
      request's detail page.
- [ ] **DB:** `SELECT status, contact_name, amount, xero_account_code FROM pettycashv3.bill
      WHERE id = '<id>';` plus `SELECT * FROM pettycashv3.bill_line WHERE bill_id = '<id>';`
      — Save as draft inserts `status = 'draft'`; Submit inserts `status = 'submitted'`
      directly (no separate draft row first); either way a matching
      `pettycashv3.bill_audit` row is appended (`action = 'created'`/`'submitted'`).
- [ ] **DB:** an attachment upload inserts into both `pettycashv3.attachment` and
      `pettycashv3.bill_attachment`; deleting one is a **hard delete** of both rows (and the
      S3 object) when nothing else references the attachment — `is_deleted`/`deleted_at`
      columns exist on `attachment` but this path never sets them, so don't expect a
      soft-deleted row to show up instead.

## The detail page ([payment-requests.md](payment-requests.md))

- [ ] The Payment No. in the URL resolves to the right request (case-insensitive); an unknown
      Payment No. shows "I couldn't find that payment request" rather than a blank/crashed page.
- [ ] Editing a field that changes the Payment No. moves the address bar with it, and Back
      still works normally afterward.
- [ ] The header reads "‹ Payment Requests" (768px up), the supplier, the Status pill and one
      line "Payment No. X · Submitted d"; actions are [Secondary] [Primary] [More] from 1024px,
      and on a phone the Primary is full width first with the rest on the row below.
- [ ] Edit → Save Changes / Cancel works for a submitted request (with the "already submitted"
      banner); a draft or a returned request offers **Submit for payment** as its Primary.
- [ ] **Publish** shows a disabled, "Publishing…" state while in flight, and a failure surfaces
      as an inline danger alert under the header (not a toast, not a silently stuck button).
- [ ] Once published, the same menu item reads **Republish** — including after a full page
      reload (not just in the current tab's memory).
- [ ] Publish / Republish / Void / Return / record-a-payment are available only to elevated
      roles (accountant / admin / super_admin) on screen — confirm a cashier/shop-manager
      session doesn't even render the controls (separately: hitting the API directly as a
      non-elevated role must still be refused server-side).
- [ ] **Record payment** opens the drawer (480px; full screen on a phone): Pay in full | Part
      payment, the amount with "Unpaid: …" under it, "Unpaid after this payment" updating as you
      type, and **Record HKD …**. More than the unpaid amount says "Enter HKD X or less - that is
      what is unpaid." while typing; a double press records once; success is a toast and the
      drawer stays; Escape with an amount typed asks before discarding.
- [ ] Recording a payment that would exceed the bill's outstanding amount shows the
      overpayment warning before it goes through.
- [ ] A bank-slip upload on a payment can also be pushed to the Xero invoice from the same
      modal.
- [ ] The attachment preview renders PDFs (pdf.js) and images inline, and upload/delete on an
      attachment works from the same card.
- [ ] **No file ever leaves the app.** On every preview surface — the Add page, the
      upload-invoice modal, a bank slip (staged and saved), the detail page —
      **View full** opens a full-screen preview *in the same tab*: no new tab opens and
      nothing downloads. Check at 360, 768 and 1440 px. Try a PNG, a PDF and an HTML file.
- [ ] In the full-screen viewer: pinch-zoom and **Reset zoom** work, **Close** is at least
      44x44, Tab never escapes the overlay, and **one Escape** closes the viewer and leaves
      whatever is underneath (a modal, or the Add page) as it was.
- [ ] After closing the viewer, focus is back on the **View full** button that opened it.
- [ ] Removing the file being viewed closes the viewer rather than leaving a broken image.
- [ ] **Mandatory fields say so up front.** Open the Add page: Invoice, Supplier, Invoice
      amount, Invoice date, Due date and Account code each show a red `*`, and **nothing is red
      yet**. Press Submit for payment on an empty form: each refused field turns red with its
      own message, including the invoice drop zone. Attach a file - the red and the message
      clear together.
- [ ] A screen reader says "Invoice amount (HKD) (required)", not "star" (the asterisk is
      `aria-hidden`; the label carries a hidden "(required)" and the control `aria-required`).
- [ ] Typing an over-limit or malformed value says so at once and clears the moment it is
      fixed; a half-typed date waits until the field is left (the owner's 2026-10-13 rule).
- [ ] The Add page does **not** offer spreadsheets: the picker filters `.xlsx` out,
      and a dropped one is refused with a message that does not mention Excel.
- [ ] Activity history starts collapsed; opening it scrolls it into view, closing it scrolls
      back to where the page was.
- [ ] A failed activity-history read shows "I couldn't load the history…" with a working Try
      again — never a bare "No activity yet" (that wording is reserved for an actually-empty
      history).
- [ ] At a width below 640 px, the status badge sits on its own line under the header title
      (not crowding it).
- [ ] **DB:** Publish/Republish flips `pettycashv3.bill.published` (success → `'published'`,
      failure → `'failed'`) and writes a full `pettycashv3.xero_bill_sync` row (plus
      `xero_bill_sync_line`/`xero_bill_sync_payload`) tracking that round-trip — this is
      separate from `bill_audit`, which also gets an entry on the failure path (confirm the
      success path logs one too, not just the sync tables).
- [ ] **DB — known gap, confirm before relying on it:** Void and Return/un-return
      (`returnBill()`) update `pettycashv3.bill.status` directly with **no**
      `pettycashv3.bill_audit` row — unlike the separate delete-a-bill void path, which does
      log one. After voiding or returning a bill from this screen, check `SELECT * FROM
      pettycashv3.bill_audit WHERE bill_id = '<id>' ORDER BY created_at DESC;` — if nothing
      new appears, that's a silent audit-trail gap to report, not expected behaviour.
- [ ] **DB:** recording a payment inserts `pettycashv3.payment` (`bill_id`, `amount`,
      `payment_status`, `xero_payment_id`) and a `bill_audit` row; `bill.status` then flips to
      `paid`/`partially_paid` based on the SUM of completed payments — there is no stored
      `paid_amount`/`outstanding` column on `bill` itself, so don't look for one.

## Payment Request Settings — account codes ([settings.md](settings.md))

- [ ] The picker offers the entity's seeded Xero account codes with their default/order intact.
- [ ] With nothing changed, Save is disabled; ticking then un-ticking back to the saved state
      disables it again.
- [ ] Unticking every code greys Save and shows "Pick at least one account code." as plain text
      under it (not a tooltip).
- [ ] The save order is enforced: codes turning ON are sent before codes turning OFF, so the
      entity is never briefly left with zero active codes mid-save.
- [ ] Trying to untick an entity's last remaining active code is refused server-side with 409
      "Keep at least one account code ticked." and the inline alert above Save shows that exact
      sentence (errors are never a toast).
- [ ] A save where some rows succeed and some fail (`Promise.allSettled`) updates the saved
      baseline only for the rows that actually went through, and the inline alert says some
      changes didn't save.
- [ ] With no live Xero connection, the card shows only "Xero isn't connected yet." and the link
      **Connect it in Entity & Integration** — no search box, no codes, no Save control, and no
      attempt to read the codes (confirm no chart re-sync call fires to Minty in this state).
- [ ] A failed codes read (Xero connected) shows "I couldn't load your account codes. Mind
      refreshing the page?" — never "No account codes yet" for an actual read failure.
- [ ] The four other settings pills (Users, Entity & Integration, Petty Cash Settings, Modules)
      are plain links out to minty-web and the Petty Cash app, not functionality duplicated
      here. Petty Cash Settings lands on the Petty Cash app's settings, never Flask's own page.
      They are 44px pills that wrap at 360px, the same look as minty-web's.
- [ ] **DB:** `SELECT account_type, is_active, is_default, sort_order FROM
      pettycashv3.entity_bill_account_xero WHERE entity_id = '<id>';` — a save updates only
      the rows that changed (`is_active`/`is_default`/`sort_order`); this table is entirely
      separate from Petty Cash's `account_info.status` — never touched from this screen.
      Unticking the last active code in any of the 8 `account_type`s is refused 409
      server-side before anything is written.
- [ ] **DB:** deleting a code (not just unticking it) is a **soft delete** —
      `is_deleted = true` on the same row, never removed outright; confirm a "deleted" code
      doesn't reappear in the picker but the row itself is still there if you query for it.

## Sharp edge: "Leave without saving?" and the browser-Back sentinel ([settings.md](settings.md))

**This is the trickiest piece of UI in the repo — test it deliberately, not just in passing.**
While Payment Request Settings has unsaved ticks, every way off the page is meant to ask first,
including the ones browsers normally let through silently:

- [ ] Clicking a plain settings-pill link (e.g. to a Minty page) with unsaved ticks shows
      "Leave without saving?" before navigating anywhere.
- [ ] **Discard changes** restores the saved tick-set, then completes the *original* navigation
      the person tried (soft route change vs. full page load vs. drawer close — each by its own
      mechanism).
- [ ] **Go Back**, Escape, and clicking the backdrop all just close the dialog — the ticks are
      untouched and the person is still on the page.
- [ ] Escape with the sidebar drawer also open closes only the leave-dialog, not the drawer.
- [ ] A successful save clears the dirty flag (nothing asks on the next navigation); a failed
      save leaves it dirty (still asks).
- [ ] Reloading the tab, typing a new address in the bar, or closing the tab while dirty
      triggers the browser's native `beforeunload` prompt instead of the custom dialog.
- [ ] Logout from the sidebar or My Profile while dirty asks the custom dialog first; Go Back
      leaves the person on the page, still signed in — Logout must not fire before a decision.
- [ ] **Browser Back** while dirty shows the custom dialog (not a silent navigation away) —
      confirm specifically, since this used to leave without asking before 2026-10-01.
- [ ] After Back's dialog: Go Back/Escape re-arm the same guard (Back must ask again if tried a
      second time); Discard changes goes back exactly one page, and a subsequent Back from that
      next page does **not** bounce back onto Settings.
- [ ] After an actual save, browser Back leaves without asking at all (the guard is gone).
- [ ] A multi-entry jump (long-press the Back button's history menu, or equivalent) while dirty
      is also caught and asks — not just a single-step Back.
- [ ] In a browser without the Navigation API, confirm the documented fallback: a multi-entry
      jump leaves without asking (a known, accepted gap — not a regression to chase).
- [ ] Links that must NOT trigger the dialog at all: links inside the dialog itself, anything
      with `data-sidebar-open`, `download` links, links with a non-`_self` target, `#`/
      `javascript:` hrefs, and in-page fragment links — click each and confirm none of them
      pop the dialog.
- [ ] Re-clicking the exact same Settings link while already on Settings (e.g. the sidebar's
      Settings item) still asks and reloads the page on Discard.

## Sidebar and My Profile ([sidebar.md](sidebar.md))

- [ ] The header's ≡ opens the menu; the initials open My Profile directly (not via the menu).
- [ ] My Profile is 440 px wide on desktop/tablet, full-screen on a phone; its ‹ returns to the
      menu, × closes the drawer entirely.
- [ ] Menu items route correctly: the person's name → My Profile in place; Select Entity →
      Minty's entity list; Manage subscriptions → minty-web's portal via Minty's handoff;
      Petty Cash items only when the company has that module; Bills → this app's own list;
      **Settings → this app's own Payment Request Settings** (not minty-web's module page).
- [ ] My Profile's Edit → Save sends only the changed fields; a refusal from Flask shows its
      sentence in the card; the header's initials update immediately on a successful save.
- [ ] **DB:** `SELECT email, first_name, last_name, username FROM pettycashv3.user WHERE id =
      '<id>';` — same table/route as minty-web's profile (both call the same Flask service);
      `username` only follows `email` when it currently mirrors the old address.
- [ ] The Subscriptions Overview card shows the same figures as minty-web's portal; a failed
      read (404 included) shows the card's own error state with a working Try again, not a
      blank card.
- [ ] *Manage Subscription* from the overview card opens minty-web's portal.
- [ ] A 401 while reading My Profile/overview is retried once via refresh, then — if still
      failing — sends the browser back to Minty; the header initials' own read never redirects
      the page on failure.
- [ ] The subscription notice on landing (`past_due` / `pending_cancel` only — no trial kind)
      shows the right copy for each kind, and its button reaches the right module settings page
      through Minty's handoff; a failed notice fetch shows nothing (not an error banner).

## Payer-portal redirects ([payer-portal.md](payer-portal.md))

- [ ] `/profile` (and anything under it not otherwise listed) redirects (307) to Minty's
      `/profile`, query string kept, with an old `from=bills` param dropped.
- [ ] `/profile/subscriptions`, `/profile/subscriptions/incoming`, `/profile/subscriptions/subscriber`,
      `/profile/billing`, `/profile/invoices` each redirect (307) through Minty's
      `/handoff/minty-web?next=...` to the matching minty-web page, query string kept.
- [ ] These redirects fire whether or not the billing cookie is present (an old emailed link
      with no cookie still lands correctly).
- [ ] `public/profile/*` static assets (the drawer's icons) still load directly — not caught by
      the redirect.

## Out of scope for this checklist

- **Stripe card capture** — not exercised anywhere in this app; covered elsewhere.
- **A full submit-and-publish-to-Xero run** — only meaningful with a live connected Demo
  Company and `E2E_XERO=1`; without it, only the UI states around Publish/Republish (above) are
  checkable by hand.
- **minty-payment-request-api's own validation/permission rules** — this app only has to
  surface what the API returns; the rules themselves are that service's own checklist/tests.

## See also

- [authentication.md](authentication.md) — token handoff, cookies, company-address resolution.
- [payment-requests.md](payment-requests.md) — the list, the Add page, the Record payment drawer, the detail page.
- [settings.md](settings.md) — Payment Request Settings, the leave-guard, Xero-disconnected state.
- [payer-portal.md](payer-portal.md) — the old `/profile/*` redirects to minty-web.
- [sidebar.md](sidebar.md) — the menu, My Profile, the Subscriptions Overview.
- `e2e/README.md` — the automated Playwright suite this checklist complements, and the
  credentials/seed it needs.
