# Payment requests — the list, the dialog, the detail page

The screens of the bills module. Every write goes to minty-payment-request-api (`lib/api.ts`), and
that service's rules are the ones that hold (`minty-payment-request-api/docs/features/payment-requests.md`);
this page is what the person sees and where each piece of the screen lives.

## The list (`/entity/<shortid>/<name>/payment-request`, `components/payment-request/PaymentRequestView.tsx`)

- **Tabs** are the bill statuses (`PaymentRequestToolbar.PAYMENT_REQUEST_STATUS_FILTERS`):
  All, Payment Requested, Partially Paid, Returned, Paid, Draft, Voided — the display
  labels for `submitted`, `partially_paid`, `returned`, `paid`, `draft`, `void`
  (`lib/billStatusDisplay.ts`). On desktop several can be stacked; on mobile it is a
  single-select menu.
- **Filters**: search (supplier, reference, description), amount range, a date range on
  invoice or due date, Xero publish state (`lib/paymentRequestSearch.ts`, sorting in
  `lib/paymentRequestRowSort.ts`).
- Two renderings of the same rows: the **table** (`PaymentRequestTable.tsx`) and the
  **easy view** (`PaymentRequestEasyView.tsx`, cards with a row-actions menu —
  `role="menu"`, "More options for <supplier>"), toggled in the header
  (`components/layout/EasyViewToggle.tsx`); `PaymentRequestTotalsBanner` sums what is
  shown; pagination in `PaymentRequestPagination`. Bulk delete of drafts from the table.
- Every amount is shown in the **entity's currency** (`lib/entityCurrency.ts` from
  `GET /api/auth/entity-currency`), never the bill's stored code.

## Add Payment (`components/PaymentRequestModal.tsx`)

The dialog (`role="dialog"`, *Add Payment Request*): amount, description, the **supplier**
(a searchable input over the entity's synced contacts — `BillContactPicker.tsx`; "create
new" makes the contact in Xero; if that fails — e.g. the entity has no Xero connection —
the menu closes, the field turns red and the API's message shows under it until the name
is edited), the **account code** (a combobox over
`entity_bill_account_xero`), bill number (with a suggested reference from
`GET /api/bills/suggested-reference/`), invoice date and due date (`#pr-invoice-date`,
`#pr-due-date`, native date inputs behind a formatted overlay — `DateTextField.tsx`), and
the attachments drop zone (`input[aria-label="Choose files to attach"]`; pdf, jpg, png,
html — **no spreadsheets since 2026-10-09**, so every accepted type is one the browser can
draw; images compressed client-side — `lib/compressImage.ts`). The allowlist is the shared
`ATTACHMENT_ACCEPT` / `isAllowedAttachment` from `lib/fileAttachmentPreview.ts`, so this
modal, the upload-invoice modal and the bank-slip modal agree by construction. The server
(`attachment_service.py`) still accepts Excel — it is shared with bank slips and with Xero
re-publish of bills that already hold one — so narrowing it is a separate decision.

A staged file previews in place, and its top-right **View full** control opens the
full-screen viewer over the dialog.

Two buttons: **Save as draft** (`POST /api/bills/draft/`, nothing validated) and
**Confirm** (`POST /api/bills/submit/`): the form validates the amount, supplier, account,
both dates and *at least one attachment* before sending, shows each field's error inline
(`role="alert"`), uploads the files right after the bill exists, then opens the new
request's detail page.

## The detail page (`/entity/<shortid>/<name>/payment-request/<Payment No.>`)

Addressed by the Payment No. (the bill's `reference`) since 2026-10-05, the id when there is none
(`lib/companyPages.ts` `pages.request(id, reference)`). `lib/useRequestId.ts` turns the address
into the bill id: an id as it is, a Payment No. through `GET /bills/by-reference/...` (case-
insensitive; once, shared by the body and the header badge). Once the request has loaded, an id
address (Flask's `?request=<id>` hand-off, an old link) is replaced by the Payment No. one, and an
edit that changes the Payment No. moves the address with it (`router.replace`, so Back is
unchanged). A Payment No. the company does not have shows "I couldn't find that payment request".

`PaymentRequestDetailBody.tsx` for a submitted-or-later request,
`EasyViewDraftDetailBody.tsx` for a draft. What it holds:

- the header with the status badge (`PaymentRequestDetailStatusBadge`) and the **action
  bar** (`BillActionBar.tsx`): Edit / Save / Cancel, the draft's Submit button, and the
  *payment actions* menu (`aria-label="More payment actions"` → `role="menu"` "Payment
  actions") with **Publish** (or **Republish** once `bill.published === "published"`) and
  **Void** / Delete; while a publish runs, a `role="status"` "Publishing…" is shown and
  the trigger is disabled; a failure is an error toast (`components/Toast.tsx`,
  `role="alert"`). Elevated roles only for publish, void, return and payments
  (`useUserRole`).
- the attachment preview (`InvoiceAttachmentPreview.tsx`, PDFs rendered with pdf.js from
  `/public/pdfjs` — `PdfJsCanvasPreview.tsx`; images inline) with upload / delete
  (`UploadInvoiceAttachmentModal`, `AttachmentDeleteConfirmModal`) — the bytes are fetched
  through the backend's `…/preview/` proxy;
- the details card (`PaymentRequestDetailedInfo.tsx`, editable in place);
- **payments** (`PaymentHistoryCard.tsx`, `RecordPaymentModal.tsx` — date, amount, method,
  reference; `OverpaymentWarningModal` when the sum would exceed the bill;
  `BankSlipDetailsModal.tsx` uploads the slip and can push it to the Xero invoice;
  `PaymentDeleteConfirmModal`);
- the **Activity history** (`ActivityHistoryAccordion.tsx`) rendering the backend's audit
  rows — "published Payment Request #… to Xero", "uploaded receipt.pdf", "submitted …".
  It starts collapsed; opening it scrolls the section into view, closing it scrolls
  back to where the page was. A failed read says so ("I couldn't load the history…") with
  Try again, never "No activity yet". The header's status badge sits after the title, and
  on its own line under the header below 640 px.

Return / un-return / void go through the same action bar with the backend's transitions;
`lib/billStatusRollback.ts` keeps the optimistic status honest when a call fails.

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
- **The scroll lock is reference counted** (`lib/appScrollRoot.ts`). Save-and-restore was
  only safe if cleanups ran strictly LIFO, which React does not guarantee when a parent and
  child unmount in one commit; the out-of-order case left `overflow: hidden` on for good.
- **The viewer creates no object URL.** The caller owns the URL's lifetime and renders the
  viewer only while `previewFile && previewObjectUrl` hold, so removing a file mid-view
  unmounts it in the same commit as the revoke.
- **A reported mime is not trusted** (`resolvePreviewMime` / `nameToPreviewMime`): drag-drop
  can leave `File.type` empty and B2 calls a PDF `application/octet-stream`. Either would
  send a perfectly drawable file to the "cannot preview" card, so the extension decides.
- Surfaces: the Add Payment Request modal, `UploadInvoiceAttachmentModal` (which had no
  enlarge control at all), `BankSlipDetailsModal` (staged, saved and auth-proxy-fetched), and
  `InvoiceAttachmentPreview` on the detail page and easy view.

## Tests

`__tests__/no_new_tab_file_links.test.ts` is the regression lock: it reads `components/`,
`lib/`, `features/` and `app/` and fails on any `target="_blank"`, `window.open` or
`download=` outside a short, self-checking list of genuine external links. Plus
`AttachmentFullScreenViewer.test.tsx` (the dialog contract, the capture-phase Escape, focus
return, mime resolution) and the preview cases in `PaymentRequestModal.test.tsx`,
`BankSlipDetailsModal.test.tsx` and `InvoiceAttachmentPreview.test.tsx`.

`e2e/02_bill_lifecycle.spec.ts` (draft → listed under Draft; the amount is required;
Confirm without attachment/due date shows both alerts; the draft's detail page) and
`e2e/04_xero_publish.spec.ts` with `E2E_XERO=1` (a complete request confirmed → Payment
Requested → Publish → Republish offered, also after a reload).
