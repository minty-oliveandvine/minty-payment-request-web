# Payment Request Settings (`/entity/<shortid>/<name>/settings/payment-request`) and the maintenance page

Moved out of `payer-portal.md` on 2026-10-01, when the profile and payer-portal pages left this
app for minty-web.

## Payment Request Settings (`components/settings/`)

At `/entity/<shortid>/<name>/settings/payment-request` since 2026-10-05 (`/settings` moves there -
[authentication.md](authentication.md#addresses-entityshortidname-2026-10-05)).

The settings pills mirror Minty's tabs (Users, Entity & Integration, Petty Cash
Settings, Payment Request Settings ("Payment Settings" until 2026-10-05), Modules — `SettingsPills.tsx`). Only **Payment Settings** lives here:
the account-code picker (`AccountCodeSettings.tsx` — which of the entity's bill account
codes are offered, default and order; elevated roles, backed by
`/api/entity-bill-accounts/*`). The other four are plain links (`<a href>`, no token in
them) to Minty's settings pages for the entity (`lib/mintyUrls.ts`; Users, Entity & Integration
and Module hand over to minty-web, whose tabs they are since phase 2 - 2026-10-05), with a
placeholder while unresolved. The sidebar's **Settings** opens this page
([sidebar.md](sidebar.md)).

### "Leave without saving?" (2026-10-01)

While Payment Request Settings has ticks not saved yet (`hasChanges` in `AccountCodeSettings.tsx`),
every way out of the page asks first (`lib/leaveGuard.ts`, `useLeaveGuard`): minty-web's
`LeaveDialog` (Figma A-11), portaled to `<body>` at z-250 so it sits above the sidebar's drawer
(z-200).

- **Discard changes** puts the ticks back to the saved set and goes where the person was going:
  the same link is clicked again, so each keeps its own way (a soft move, a full load, the drawer
  closing).
- **Go Back**, Escape and the backdrop close the dialog; the ticks stay. Escape answers the
  dialog alone (caught on `window` on the way down): a drawer open under it stays open.
- A successful save clears `hasChanges`, so nothing asks; a failed save keeps it. A save that
  partly went through moves the saved set by each row that did (`Promise.allSettled`), so the
  guard and "Discard changes" measure from what the server holds, and the toast says some
  changes didn't save - or, for a 409, the server's own sentence.
- A reload, a typed address or a closed tab get the browser's own prompt (`beforeunload`, on
  only while dirty and removed before Discard leaves, so the two never both show).
- **Logout** (the sidebar's and My Profile's, `sidebarHost.ts` `logOut()`) asks the same way
  before anything runs; Go Back leaves the person on the page, signed in (`guardLeave`).

Which clicks ask - a left click with no modifier key on an `<a href>`, unless:

- the link is inside the dialog, or carries `data-sidebar-open` (Flask's openers);
- it has `download`, or a `target` other than `_self`;
- its `href` attribute starts with `#` or `javascript:`, or its address is not http(s);
- it is a fragment of this very page (`<settings>#x`).

A link to exactly this address (the sidebar's Settings on Payment Request Settings) DOES ask: it reloads.

**The browser's Back** (2026-10-01; it used to leave without asking) is held by a SENTINEL: when
the page turns dirty it pushes one history entry at its own address (Next's state object kept).
Back pops only that entry - a `popstate` caught on `window` in the capture phase, ahead of the
app router's listener - so the page pushes it again and asks. Discard changes takes the sentinel
off and goes back once more; Go Back and Escape stay. Forward needs nothing (the push cut the
forward entries off). When the page is clean again - saved, ticks put back by hand, or discarded
through a link - the sentinel is taken off with `history.back()` (that `popstate` is swallowed,
the router never sees it) and a discarded link is replayed only after it, so Back from the next
page lands on Payment Request Settings once.

**A jump of several entries at once** (the long-press history menu, `history.go(-3)`) is held
too, since 2026-10-01. The Navigation API's entry index (`navigation.currentEntry.index`) says
how far it went: the page swallows that `popstate`, jumps straight back onto the sentinel
(`history.go(n)`, its own pop, swallowed) and asks. Discard changes takes the sentinel off and
goes the rest of the way. The index, not the address, decides what a pop was, so an earlier entry
at this same address counts as a jump. A jump into another document's entry unloads the page and
gets the browser's `beforeunload` prompt. In a browser without the Navigation API a several-entry
jump still leaves without asking; the page warns once in the console.

### At least one code ticked (2026-10-01)

With nothing changed (`hasChanges` false - since 2026-10-05), **Save is off**; ticks put back by
hand turn it off again. With codes on the list and none ticked, **Save is off** and "Pick at least one account code."
shows under it (plain text, never a `title`). A save sends the rows turning ON first, then the
rows turning OFF (each batch `Promise.allSettled`), so it never passes through a moment with
nothing ticked. minty-payment-request-api enforces the same rule: unticking the entity's last ticked code
answers **409** "Keep at least one account code ticked." and writes nothing; the toast shows
that sentence. These ticks are the payment module's own (`entity_bill_account_xero.is_active`);
they no longer touch Petty Cash's `account_info.status` (that mirror was removed 2026-10-01 - it
unticked codes in Petty Cash, whose publish refuses them).

**The dialog is a COPY** of minty-web's, at its own paths, each headed `COPY of minty-web/<path>
... change all three (minty-web, here, Flask's port: Minty static/js/minty_dialog.js +
static/css/minty_dialog.css)`: `features/subscription/components/ModalFrame.tsx`,
`ConfirmDialog.tsx` (its image table trimmed to `public/portal/minty-dont.png`),
`InterruptedDialogs.tsx` (`LeaveDialog` only) and `features/subscription/lib/changeModal.ts`
(the two types). `--ink-soft` in `app/globals.css` is minty-web's token. Change all three.

A failed read of the codes says so ("I couldn't load your account codes. Mind refreshing the
page?", logged on the console) instead of "No account codes yet" (fixed 2026-10-01; it was
swallowed).

**The header on a phone** (`components/layout/Header.tsx`, fixed 2026-10-01): the company name's
cap is a plain `max-w-[6.5rem]`, not `max-w-[min(100%,6.5rem)]` - a percentage cap counts as no
cap while the `shrink-0` block around it is sized, so at 375px a long name made that block 336px
wide, over "‹ Payments" (which could not be tapped). minty-web's `AppHeader` and Flask's port
were fixed the same way.

## `/maintenance`

A static page the Vercel apps can be pointed at during a cutover window (Minty has no
maintenance gate of its own yet; a real `MAINTENANCE_MODE` is a Part 2 deliverable in
`Minty/docs/modernisation/modernisation_plan.md`).

## Tests

`e2e/06_settings.spec.ts`: the account-code picker offers the entity's seeded codes.

`e2e/07_settings_leave.spec.ts` (the code list stubbed): nothing changed leaves at once; a tick
held by the back link (Go Back and Escape stay); a Flask pill goes after Discard with no browser
prompt; the sidebar's Settings asks above the drawer, Escape closes only the dialog, and Discard
reloads the saved ticks; Logout asks, and Go Back logs nobody out; the browser's Back asks (Go
Back and Escape stay, the sentinel kept), Back then Discard goes to the page before, and after a
save Back leaves without asking (the sentinel gone); Save is off until a tick changes, and off
again when it is put back; nothing ticked greys Save with the hint; a
409 shows the server's sentence, with the ON rows sent before the OFF ones.
