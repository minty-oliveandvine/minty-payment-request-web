# Payment requests — the list, the Add page, the detail page

The screens of the bills module. Every write goes to minty-payment-request-api (`lib/api.ts`), and
that service's rules are the ones that hold (`minty-payment-request-api/docs/features/payment-requests.md`);
this page is what the person sees and where each piece of the screen lives.

**The look is the owner's design system** (Parts 13–15, `Minty/docs/design/`), applied here on
2026-10-13 — PRW is the first app on it; minty-web, onboarding and Flask keep their current look
until they migrate. Its pieces:

- **Tokens:** `@minty/shared/tokens.css` (imported by `app/globals.css` since the `v0.2` pin,
  2026-10-13) — `--minty-*` primitives in
  `:root`, semantic `--color-*` roles in `@theme`, so the utilities are `bg-action-primary`,
  `text-text-primary`, `bg-status-info-bg`, `border-border-input`, `bg-overlay-scrim`, and so on;
  radius sm/md/lg/xl = 4/8/12/16; text styles `text-display-m`/`title-l`/`title-m`/`body-m`/
  `body-s`/`label`/`caption`/`button`. Dark values exist only under `:root[data-theme="dark"]`,
  which nothing sets (Light at launch). `__tests__/no_raw_colours.test.ts` fails on any `#hex`
  or Tailwind palette colour in the app's source.
- **Primitives** (`components/ui/`): `Button` / `buttonClass` (primary, secondary, ghost, danger,
  link; 44px, radius 12, `processing`), `Icon` (Material Symbols **Rounded**), `StatusPill`,
  `Field` + `inputClass`, `ErrorSummary`, `InlineAlert` / `PageBanner`, `FilterChip`,
  `SegmentedControl`, `EmptyState`, `Skeleton`, `Overlay` (`Modal` 440px / phone sheet, `Drawer`
  480px / full screen on phones — focus trap, capture-phase Escape, scroll lock, focus back to the
  opener, only the top overlay answers keys) and `PageHeader` ([Secondary] [Primary] [More] from
  1024px, under the title below that; on a phone the Primary is full width first and the rest
  share the row below it, More at its end).
- **Status tones** (`lib/statusTone.ts`): Payment Requested = info, Partially Paid and Returned =
  warning, Paid = success, Draft and Voided = neutral. Amounts are never coloured.
- **What a request offers** comes from one table, `lib/requestActions.ts` (Part 15.17's status ×
  action matrix): a row's ONE next action (`rowNextAction`) and the detail header's extras
  (`detailActions`). Easy view, Table view and the detail page all read it, and what a person
  cannot do is left out, never drawn dead (Part 15.2) — the Table's Payment and Bankslip cells
  show "-" instead.
- **The App bar** (`components/layout/Header.tsx`) shows the Minty mark (`/minty-mark.png`, the
  same image and size as minty-web's hub header) where the module name used to be written (the
  user, 2026-10-13); the module name stays as screen-reader text.
- **Errors are inline**, never a toast (`InlineAlert`); a toast (`components/Toast.tsx`,
  bottom-left on a computer, bottom-centre on a phone) only confirms something that worked.

**The Figma frames are a reference, not the spec** (owner, 2026-10-13). The Part 15.G export
("Templates · Page shells & layouts — 7 Oct 2026") draws these screens, and where it disagrees
with the written Part 15 the text wins: invoice upload first on the Add page, a row's next action
Secondary, the detail header's Edit and More, "Continue" for a draft. Table view keeps its
Submitted, Paid date, Bankslip, Xero and ⋮ columns, and money stays in the currency CODE
("HKD 4,800.00"), not the Figma's "HK$". **Drawn in the Figma, not built** (follow-ups, some need
API work): Export CSV; draft autosave ("Saved 2 min ago"); the Table selection bar ("2 requests
selected · HKD 6,040.00 unpaid · Clear · Download slips · Record payment for 2"); invoice rows
nested under a request ("Invoice INV-… · 2 bank slips").

## The list (`/entity/<shortid>/<name>/payment-request`, `components/payment-request/PaymentRequestView.tsx`)

- **Page header:** the Payment Request module art (`public/menu/payment-request.svg`, the
  sidebar's module chip, 40px on `module-payment-wash`; `PageHeader`'s `art` slot - identity, not
  a character), "Payment Requests", a purpose line, and the Primary link **Add payment
  request** (to the Add page). Without the role it is a disabled button with its reason; a
  view-only visitor gets a note instead.
- **Needs attention** (`PaymentRequestAttentionStrip.tsx`, 2026-10-19), straight under the header:
  three toggle tiles (`aria-pressed`) - **Overdue** (count + unpaid total, Warning surface with an
  icon), **Due in 7 days** (due today to 7 days ahead; count + unpaid total) and **Returned**
  (count). Paid, Voided and Draft are never overdue or due; unpaid = the row's unpaid amount, per
  currency (at most two, then "+N more"). Overdue / Due in 7 days apply a client-side due filter
  (cleared by Clear filters); Returned presses the Returned chip. "Today" is the Hong Kong date
  (`lib/paymentRequestAttention.ts`). The figures come from the last whole-list load, like the
  chip counts, never from a single-chip server load. With nothing to show it is one line,
  "Nothing is overdue or due this week." The **totals banner** now sits under the strip, once
  for both views (same visibility rule; a due tile alone does not open it - the tile already
  shows that total). Both views' row meta add "Overdue N days" / "Due today" / "Due in N days"
  (`PaymentRequestDueMeta.tsx`) for unpaid requests due within a week.
- **Toolbar** (`PaymentRequestToolbar.tsx`): search in a `role="search"` box ("Search supplier,
  description or amount"), the **Easy view | Table view** segmented control (radios; from 768px
  only — a phone always gets Easy view), Filter, Bulk Actions, and the status **chips** — a
  `role="group"` "Filter by status" of `aria-pressed` buttons, each with its count: All,
  Payment Requested, Partially Paid, Returned, Paid, Draft, Voided — the display labels for
  `submitted`, `partially_paid`, `returned`, `paid`, `draft`, `void` (`lib/billStatusDisplay.ts`).
  Several can be stacked.
- **Filters**: search (supplier, reference, description), amount range, a date range on
  invoice or due date, Xero publish state (`lib/paymentRequestSearch.ts`, sorting in
  `lib/paymentRequestRowSort.ts`).
- **Easy view** (`PaymentRequestEasyView.tsx`): record rows at most 960px wide — the supplier is
  the row's link (stretched over it), then the Unpaid amount in a 160px track, then the Status
  pill and the one next action in a 360px track (from 1024px; stacked below). Five skeleton
  rows while loading; one empty state for first use and another for "nothing matches", with
  Clear filters.
- **Table view** (`PaymentRequestTable.tsx`): compact cells, a 40px header naming the currency
  once ("Unpaid (HKD)"), sortable columns. It has no phone card layout any more.
- **Widths, elevation, sizes** (fidelity pass, 2026-10-16): the list's content and the header
  bar's inner row are capped at 1200 (Easy rows 960 inside it), the detail and its skeleton at
  1440, the new-request form at 720. Resting surfaces (cards, rows, previews, buttons) carry a
  border, never a shadow: `shadow-overlay` only on menus, popovers, tooltips and toasts,
  `shadow-modal` on modals and drawers. Controls are 44px everywhere but the desktop table's
  compact cells and the pointer-only filter chips and view switch; the small remove-file buttons
  keep their 32px look with a 44px hit area on touch.
- **Record payment** opens one drawer, `RecordPaymentDrawer.tsx`, from either view (below).
- Every amount is shown in the **entity's currency** (`lib/entityCurrency.ts` from
  `GET /api/auth/entity-currency`), never the bill's stored code.
- **One money rule** (owner, 2026-10-21): every amount goes through `@minty/shared/money`
  (this app's own `lib/amountFormat.ts` is gone) - "HKD 1,234.50": the ISO code, a non-breaking
  space (U+00A0, so a line never splits the code from its amount), two places, never a symbol;
  a negative is "-HKD 120.00"; extra decimals are cut, not rounded ("9.999" → "9.99"); with no
  currency yet the number stands alone. Payment requests always show
  the places (`formatMoney`, never `formatPrice`). The totals banner's figures carry no code
  (`formatAmount`; a mixed set names each currency above its group). Typing keeps plain digits,
  capped at 11 before the point and 2 after, and groups on blur.
- **Bank slip counts** load per visible row (`lib/bankSlipEnrichment.ts`). An unknown count is
  never shown as zero: while loading the row shows "…", and a failed lookup is logged and shows
  **Retry** (`BankSlipLoadState.tsx`, re-reads the rows on screen) — never **Upload**, which
  could hide slips that already exist. Easy view shows nothing while loading, Retry on failure.
- Pagination (`PaymentRequestPagination.tsx`): "Showing 1–10 of 41", rows per page 10/25/50/100,
  36px targets for a mouse and 44px for touch (`pointer-coarse:`), page numbers hidden on phones.

## Record payment (`components/payment-request/RecordPaymentDrawer.tsx`)

A drawer (480px; full screen on a phone): Invoice amount, Paid so far and **Unpaid** as
description rows, then **Pay in full | Part payment** (Pay in full disabled, with its reason,
once something has been paid), the amount (helper "Unpaid: …"; above the unpaid amount it says
"Enter HKD X or less - that is what is unpaid." as you type), the payment date, an optional bank
slip, the payments already recorded, and the Primary **Record HKD …** ("Recording…" while it
runs; pressed twice it sends once). Success is a toast and the row's new status, no navigation; a
failure stays in the drawer. Escape with an amount typed asks before discarding.
`OverpaymentWarningModal` still guards a sum above the bill.

## Add payment request (`/entity/<shortid>/<name>/payment-request/new`, `components/PaymentRequestForm.tsx`)

A page (max 720px), not a dialog, since 2026-10-13 (`PaymentRequestModal.tsx` is gone;
`middleware.ts` treats `new` as the list for Flask's hand-off). In invoice order:

1. **Invoice** — the drop zone (`input[aria-label="Choose files to attach"]`; pdf, jpg, png,
   html — **no spreadsheets since 2026-10-09**, so every accepted type is one the browser can
   draw; images compressed at upload — `lib/compressImage.ts`; "files up to 10 MB"). The
   allowlist is the shared `ATTACHMENT_ACCEPT` / `isAllowedAttachment` from
   `lib/fileAttachmentPreview.ts`, so this page, the upload-invoice modal and the bank-slip
   modal agree by construction. The server (`attachment_service.py`) still accepts Excel — it is
   shared with bank slips and with Xero re-publish of bills that already hold one — so narrowing
   it is a separate decision. A staged file previews in place; **View full** opens the
   full-screen viewer.
2. **Supplier** — `BillContactPicker.tsx`, a `role="combobox"` over the entity's synced
   contacts ("Search or add a supplier"); "create new" makes the contact in Xero, and if that
   fails — e.g. no Xero connection — the API's message shows under the field until the name is
   edited.
3. **Invoice amount** in the entity's currency. With no currency set an alert says so (linking
   to Entity & Integration settings) and both buttons are disabled with that reason; a failed
   read says so with **Try again**.
4. **Invoice date · Due date** (`#pr-invoice-date`, `#pr-due-date`, `DateTextField.tsx`).
5. **Description**, then the **account code** (a combobox over `entity_bill_account_xero`).
6. **More details** (collapsed): Payment No., filled from `GET /api/bills/suggested-reference/`.

**Save as draft** (`POST /api/bills/draft/`, nothing validated; back to the list with a toast)
and **Submit for payment** (`POST /api/bills/submit/`: validates amount, supplier, account, both
dates and at least one attachment, uploads the files once the bill exists, then opens its detail
page).

**The upload after create is never silent** (2026-10-20). The files go up ONE PER CALL
(`lib/attachmentUploads.ts` `uploadEachAttachment` - the API's multi-file upload is not
all-or-nothing, so only one call per file can say which arrived). If any did not, the success
toast is replaced by a warning naming them - "Payment request for X sent to Treasury, but
invoice.pdf didn't upload. Edit the request and add it again." / "Draft saved, but invoice.pdf
didn't upload. Edit the draft and add it again." - and a draft then opens its own page rather
than the list. The detail page's Save / Submit for payment do the same: the changes are saved,
edit mode closes, and an inline warning names the file ("Your changes are saved, but … didn't
upload …") instead of the old "Your changes didn't save".

### Validation (Part 14 + the owner's 2026-10-13 decisions)

Every PRW form — Add/Edit, the Record payment drawer, bank slip, attachments, Settings' account
codes — follows these:

- **As you type**, not on blur (the owner's exception to Part 14): a format, length or range
  message appears and clears at once; a "not finished yet" message (a half-typed date) waits
  until the field is left. Submit re-checks everything, and the API still refuses.
- **Required:** a red `*` from the moment the form opens plus a screen-reader "(required)" in
  the label (`Field`), and `aria-required` on the control; the control turns red only after a
  refused submit. An untouched form is never shown as an error. `components/RequiredMark.tsx`
  (the `aria-hidden` star) remains in `UploadInvoiceAttachmentModal` and `BankSlipDetailsModal`.
- **Error summary** (`ErrorSummary`): with two or more problems on a refused submit, a summary at
  the top ("N details need a look before this can be sent.") takes focus and links to each
  field; with one, focus goes straight to that field.
- **Save as draft is never disabled** for missing fields (only the currency gate above stops
  it, with its reason shown).
- **Part 11 wording:** issue → action, e.g. "The amount is still empty. Add the invoice amount
  to continue." Never "Error", "Invalid", "Mandatory" or "required field". Optional fields never
  warn.
- In the bank-slip dialog, pressing Upload with nothing staged is **not reachable** — the button
  is disabled until a file is staged — so the red there comes from a _refused_ file (wrong type
  or too big). That dialog and the upload-invoice one red-line off `uploadError && <staged> === 0`,
  never `uploadError` alone, since that also carries **API failures**.

## The detail page (`/entity/<shortid>/<name>/payment-request/<Payment No.>`)

Addressed by the Payment No. (the bill's `reference`) since 2026-10-05, the id when there is none
(`lib/companyPaths.ts` `pages.request(id, reference, status)`). **A void request is always
addressed by its id** (status `void`/`Voided`, 2026-10-20): void requests do not hold their
Payment No. against reuse and `GET /bills/by-reference/` prefers the live request, so the Payment
No. would open a different one. Every link passes the status (the list's rows and links, Easy
view, payment history, the Add page's hand-over), a void request reached by its Payment No. moves
to its id address, and the page `forgetRequest`s the cached Payment No. → id pairing. A Payment
No. of `new` is addressed by id too (that address is the Add page). `lib/useRequestId.ts` turns the address
into the bill id: an id as it is, a Payment No. through `GET /bills/by-reference/...` (case-
insensitive; once, shared by the body and the header). Once the request has loaded, an id
address (Flask's `?request=<id>` hand-off, an old link) is replaced by the Payment No. one, and an
edit that changes the Payment No. moves the address with it (`router.replace`, so Back is
unchanged). A Payment No. the company does not have shows "I couldn't find that payment request".

`PaymentRequestDetailBody.tsx` draws every status, drafts included (the Easy View draft panel is
gone). What it holds:

- the **record header** (`PageHeader`): "‹ Payment Requests" (from 768px; the App bar's back
  arrow below that), the supplier as the h1, the Status pill, one line "Payment No. X · Submitted
  d", and the actions — Edit, **Return to requester** (Secondary, through a confirm), View
  payments, the Primary (**Record payment**; **Submit for payment** for a draft or a returned
  request; **Save Changes** while editing) and More (`BillActionBar.tsx`: `aria-label="More
payment actions"` → `role="menu"` "Payment actions" with **Publish** / **Republish** and
  **Void** / Delete; while a publish runs a `role="status"` "Publishing…" shows and the trigger
  is disabled). Elevated roles only for publish, void, return and payments (`useUserRole`).
  Under it: the Returned banner ("Edit and resubmit"), or - for a request with **no invoice
  attached** that this person can edit (not void, not while editing) - a warning banner "This
  request has no invoice attached." with "Edit and add the invoice" (one banner at a time,
  Returned wins); the already-submitted banner while editing; a file that did not upload during a
  save; any action error inline; and the error summary.
- **document and record side by side** (1:1, max 1440px; stacked below 1024px):
  - the attachment preview (`InvoiceAttachmentPreview.tsx`, PDFs rendered with pdf.js from
    `/public/pdfjs` — `PdfJsCanvasPreview.tsx`; images inline) with upload / delete
    (`UploadInvoiceAttachmentModal`, `AttachmentDeleteConfirmModal`) — the bytes are fetched
    through the backend's `…/preview/` proxy;
  - the details (`PaymentRequestDetailedInfo.tsx`): description rows (`dl`, "Not set yet" when
    empty) — Supplier, Description, Invoice amount, Paid so far, **Unpaid**, the dates, Account
    code, Payment No. — and `Field`s in the same order while editing;
  - **Payments** (`#payment-history`, `PaymentHistoryCard.tsx`; `BankSlipDetailsModal.tsx`
    uploads a slip and can push it to the Xero invoice, then closes once the caller has
    refreshed — a failed refresh is logged, never rolled back; `PaymentDeleteConfirmModal`);
  - **History** (`ActivityHistoryAccordion.tsx`) rendering the backend's audit rows — "submitted",
    "published to Xero", "uploaded receipt.pdf", "recorded a payment of HKD 1,200.00". It sits on
    the request's own page, so an entry never repeats the request's name. It starts collapsed;
    opening it scrolls the section into view, closing it scrolls back. A failed read says so
    ("I couldn't load the history…") with Try again, never "No activity yet".

Return / un-return / void go through the backend's transitions; `lib/billStatusRollback.ts` keeps
the optimistic status honest when a call fails.

## Previewing a file: full screen, never a new tab

**The rule (the user's, 2026-10-09): a file always opens a full-screen preview in-app. It
never opens a new tab and it never downloads.** Every preview surface used to be wrapped in
an `<a target="_blank">` (`FullFilePreviewLink`), so clicking a staged receipt left the app;
that component is gone, along with the unused `FileAttachmentPreviewLayer` and the
"Open PDF in new tab" link in `PdfJsCanvasPreview`'s error state.

- **One component:** `components/payment-request/AttachmentFullScreenViewer.tsx`. It owns
  `PreviewBlock` (image / pdf.js canvas / sandboxed iframe / "Preview is not available for
  this file type."), `usePinchZoom`, the `ViewFullButton` every inline pane puts in its
  top-right corner, and the overlay itself — a portal at `z-[340]`, above the modals'
  `z-[300]`, `role="dialog" aria-modal`, with Reset zoom and a 44px Close.
- **Escape unwinds one layer at a time.** The viewer listens on `window` in the **capture
  phase** and calls `stopImmediatePropagation()`. The three modals it opens over each keep a
  bubble-phase `window` listener registered earlier, and a window capture listener runs
  before every window bubble listener whatever the order — so one Escape closes the viewer
  and leaves the modal open. Those modals deliberately have **no** `viewerOpen` branch.
- **Focus** starts on Close, is trapped, and returns to the opener on unmount (with a
  fallback: the opener may have been removed, e.g. the file was deleted).
- **The scroll lock is reference counted** (`@minty/shared/scrollLock`, lifted from this app's
  old `lib/appScrollRoot.ts`). Save-and-restore was
  only safe if cleanups ran strictly LIFO, which React does not guarantee when a parent and
  child unmount in one commit; the out-of-order case left `overflow: hidden` on for good.
- **The viewer creates no object URL.** The caller owns the URL's lifetime and renders the
  viewer only while `previewFile && previewObjectUrl` hold, so removing a file mid-view
  unmounts it in the same commit as the revoke.
- **A reported mime is not trusted** (`resolvePreviewMime` / `nameToPreviewMime`): drag-drop
  can leave `File.type` empty and B2 calls a PDF `application/octet-stream`. Either would
  send a perfectly drawable file to the "cannot preview" card, so the extension decides.
- Surfaces: the Add page, `UploadInvoiceAttachmentModal` (which had no
  enlarge control at all), `BankSlipDetailsModal` (staged, saved and auth-proxy-fetched), and
  `InvoiceAttachmentPreview` on the detail page.

## Tests

`__tests__/no_new_tab_file_links.test.ts` is the regression lock: it reads `components/`,
`lib/`, `features/` and `app/` and fails on any `target="_blank"`, `window.open` or
`download=` outside a short, self-checking list of genuine external links. Plus
`AttachmentFullScreenViewer.test.tsx` (the dialog contract, the capture-phase Escape, focus
return, mime resolution) and the preview cases in `PaymentRequestForm.test.tsx`,
`BankSlipDetailsModal.test.tsx` and `InvoiceAttachmentPreview.test.tsx`.

The design system's own locks: `components/ui/__tests__/primitives.test.tsx` (every primitive's
contract - roles, focus, Escape, the error summary), `lib/__tests__/requestActions.test.ts` (the
status × action matrix), `RecordPaymentDrawer.test.tsx`, `PaymentRequestForm.test.tsx` (field
order, the validation rules above, draft vs submit) and `__tests__/no_raw_colours.test.ts`.

`e2e/02_bill_lifecycle.spec.ts` (draft from the Add page → back on the list, under Draft; the
amount is required; without attachment/due date the error summary takes focus and names both;
the draft's detail page), `e2e/09_detail_payments.spec.ts` (the Record payment drawer, live) and
`e2e/04_xero_publish.spec.ts` with `E2E_XERO=1` (a complete request submitted → Payment
Requested → Publish → Republish offered, also after a reload).
