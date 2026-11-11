# Manual QA checklist — minty-payment-request-web

A manual walkthrough checklist for this app, to run alongside the automated suite
(`## Tests` in each doc below, and `e2e/README.md`). This is not a replacement for it — it
exists for exercising the app by hand in a browser before a release, and for checking the
sharp edges the docs call out explicitly. Run it against the seeded e2e entity
(`Minty/scripts/e2e_seed.py --print`), not a real company — Payment Request Settings writes
live account-code state and Publish writes a real Xero invoice when `E2E_XERO=1` is live.

## Handoff and auth ([authentication.md](authentication.md))

- [ ] Arriving at `/landing?code=<one-time code>&entity_id=&entity_name=&next=` swaps the code,
      stores the token and entity cookies (`billing_token`, `billing_entity_id`,
      `billing_entity_name`) and forwards to `next`; opening the same address again says the link
      was used, with Continue (gap 4).
- [ ] No address the app builds carries a token (Select Entity, Manage subscriptions, Petty Cash
      links: `/entity/<id>/enter?next=` only).
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
      `POST /api/auth/logout` called, then a form POST to Minty's own `/logout` — not back on this
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

- [ ] All seven tabs (All, Payment Requested, Partially Paid, Returned, Paid, Draft, Voided)
      filter correctly; several can be stacked on desktop, only one at a time on mobile.
- [ ] Search (supplier, reference, description), the amount range, the invoice/due date range,
      and the Xero publish-state filter each narrow the rows as expected, and compose together.
- [ ] A min amount above the max, or a start date after the end date, says so under the pair
      as it is typed, and Apply is disabled with its reason beside it until it is put right.
- [ ] Table and Easy View show the same rows and totals; the toggle persists the choice.
- [ ] The totals banner reflects only the rows currently shown (after filtering), not the whole
      list.
- [ ] Every amount displays in the entity's own currency, never a bill's stored currency code.
- [ ] Add Payment Request for a company with no currency: the box shows "—", the message under
      Amount links to the hub's General tab ("Settings, under General"), and Confirm / Save as
      Draft are disabled.
- [ ] Block `/payments` in devtools: the Bank Slip cell shows **Retry**, never **Upload**;
      unblock and press Retry → the real count appears.
- [ ] Bulk-deleting drafts from the table removes exactly the selected rows.
- [ ] Pagination keeps filters and the active tab when moving between pages.

## Add Payment dialog ([payment-requests.md](payment-requests.md))

- [ ] Supplier picker searches the entity's synced Xero contacts; "create new" adds the
      contact in Xero itself.
- [ ] A new supplier's name of 101+ characters says "Keep the supplier's name to 100 characters
      or fewer." as it is typed, and the create option does nothing until it is shorter.
- [ ] A JPY company's amount fields refuse a "." and post `"1234"`; an HKD company's post
      `"1234.50"`.
- [ ] Creating a new supplier while the entity has no live Xero connection fails visibly: the
      picker closes, the field turns red, and the API's own message shows under it until the
      name is edited (not a silent no-op).
- [ ] The account-code combobox only offers `entity_bill_account_xero` codes already ticked on
      in Payment Request Settings.
- [ ] Bill number field pre-fills a suggested reference; it can still be overridden by hand.
- [ ] **Save as draft** succeeds with nothing filled in (no validation at all).
- [ ] **Confirm** validates amount, supplier, account code, both dates, and at least one
      attachment — each missing field shows its own inline alert (`role="alert"`), not one
      generic error.
- [ ] A Confirm refused for two or more fields shows a summary at the top that takes focus and
      links to each field; one refused field takes the focus itself. Messages read "The <field> is
      still empty. <Action> to continue." A screen reader hears "<Label> (required)".
- [ ] Attaching a PDF/JPEG/PNG reads it: empty fields (and today's date / the default account,
      untouched) fill as "Suggested from the invoice." with Clear; nothing typed is overwritten;
      a failed read says "I couldn't read this invoice. Enter the details yourself."
- [ ] Attachments accept pdf, jpg, png, html, xls(x); an added image is uploaded
      exactly as chosen (same size and type when opened again).
- [ ] Confirm uploads attachments only after the bill itself exists, then opens the new
      request's detail page.
- [ ] Block `/attachments` in devtools: Confirm still opens the request with a warning toast
      naming the file to add again; Save as draft opens the draft with the same kind of
      warning; the detail page's Save leaves edit mode and warns, never "didn't save".
- [ ] Void a request: the address moves to its id, and a reload still shows it Voided (also
      after a new request takes the same Payment No.).
- [ ] **DB:** `SELECT status, contact_name, amount, xero_account_code FROM pettycashv3.bill
WHERE id = '<id>';` plus `SELECT * FROM pettycashv3.bill_line WHERE bill_id = '<id>';`
      — Save as draft inserts `status = 'draft'`; Confirm inserts `status = 'submitted'`
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
- [ ] Edit → Save / Cancel on the details card works for a submitted request; a draft shows the
      draft-specific body (`EasyViewDraftDetailBody`) with its own Submit button instead.
- [ ] Editing the supplier: an untouched older request with no Xero contact saves; a changed
      name picked from the list saves; a changed name typed but not picked is refused with
      "Pick the supplier from the list, or add them as a new supplier."
- [ ] Record Payment's date defaults to today on the person's clock, also just after local
      midnight (when UTC is still on yesterday).
- [ ] **Publish** shows a disabled, "Publishing…" state while in flight, and a failure surfaces
      as an error toast (not a silently stuck button).
- [ ] Once published, the same menu item reads **Republish** — including after a full page
      reload (not just in the current tab's memory).
- [ ] Publish / Republish / Void / Return / record-a-payment are available only to elevated
      roles (accountant / admin / super_admin) on screen — confirm a cashier/shop-manager
      session doesn't even render the controls (separately: hitting the API directly as a
      non-elevated role must still be refused server-side).
- [ ] A system super admin (`system_role` `superadmin`) on a company they are not a member of
      sees every write control dead.
- [ ] Recording a payment that would exceed the bill's outstanding amount shows the
      overpayment warning before it goes through.
- [ ] A bank-slip upload on a payment can also be pushed to the Xero invoice from the same
      modal.
- [ ] The attachment preview renders PDFs (pdf.js) and images inline, and upload/delete on an
      attachment works from the same card.
- [ ] **No file ever leaves the app.** On every preview surface — Add Payment Request, the
      upload-invoice modal, a bank slip (staged and saved), the detail page and easy view —
      **View full** opens a full-screen preview _in the same tab_: no new tab opens and
      nothing downloads. Check at 360, 768 and 1440 px. Try a PNG, a PDF and an HTML file.
- [ ] In the full-screen viewer: pinch-zoom and **Reset zoom** work, **Close** is at least
      44x44, Tab never escapes the overlay, and **one Escape** closes the viewer and leaves
      the modal underneath open (a second Escape closes the modal).
- [ ] After closing the viewer, focus is back on the **View full** button that opened it.
- [ ] Removing the file being viewed closes the viewer rather than leaving a broken image.
- [ ] **Mandatory fields say so up front.** Open Add Payment Request: Amount, Supplier,
      Account Code, Invoice Date, Due Date **and Uploaded files** each show a red `*`, and
      **nothing is red yet**. Press Confirm on an empty form: each refused field turns red
      with its own message, including the attachments drop zone. Attach a file - the red and
      the message clear together.
- [ ] A screen reader says "Amount, required", not "Amount star" (the asterisk is
      `aria-hidden`; the control carries `aria-required`).
- [ ] Add Payment Request does **not** offer spreadsheets: the picker filters `.xlsx` out,
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

## Payment Settings ([settings.md](settings.md))

Payment Settings is minty-web's tab since 2026-11-10 - its checklist (account codes, the leave guard
and the browser-Back sentinel) is minty-web's now (`docs/features/payment-settings.md`). Here:

- [ ] `/entity/<shortid>/<name>/settings/payment-request` (and `/settings?tab=...`) goes on to
      accounts-api's same path and lands on the hub's Payment Settings tab, signed in.
- [ ] The sidebar's Settings goes to the hub's Payment Settings tab; no menu item is marked current.

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
- [ ] _Manage Subscription_ from the overview card opens minty-web's portal.
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
- [payment-requests.md](payment-requests.md) — the list, Add Payment dialog, detail page.
- [settings.md](settings.md) — Payment Request Settings, the leave-guard, Xero-disconnected state.
- [payer-portal.md](payer-portal.md) — the old `/profile/*` redirects to minty-web.
- [sidebar.md](sidebar.md) — the menu, My Profile, the Subscriptions Overview.
- `e2e/README.md` — the automated Playwright suite this checklist complements, and the
  credentials/seed it needs.
