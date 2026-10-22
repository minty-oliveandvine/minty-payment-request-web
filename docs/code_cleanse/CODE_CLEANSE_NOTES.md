# Code Cleanse Notes — `lib/`

> Historical (July 2026). Branch `code-cleanse-lib` no longer exists; the work it
> records was merged. The current per-repo work document is
> `Minty/docs/code_cleanse/Code Cleanse - billing-frontend.md`.

Branch: `code-cleanse-lib`. Not pushed.

## Adaptation of the brief

The brief was written for a Python repo (pytest, ruff `F821`, isort, black,
`monkeypatch.setattr`, `patch("path.to.module.Name")`). This repo is
TypeScript/Next.js, so those tools have no analogue. Substitutions agreed with
the user:

| Brief (Python)             | Here (TypeScript)                                                 |
| -------------------------- | ----------------------------------------------------------------- |
| pytest baseline + diff     | `tsc --noEmit` + `npm run lint` + `npm run build`                 |
| `ruff check --select F821` | `npx tsc --noEmit` (whole-project undefined-name/type check)      |
| isort / black              | ESLint (`npm run lint`); no formatter run alongside logic changes |
| `monkeypatch.setattr` scan | module-boundary/import-coupling scan (below)                      |

**There is no test suite in this repo** — zero test files, no runner in
`package.json`. The "no test that passes today may start failing" rail is
therefore enforced via the three gates above instead.

## Baseline (recorded before any edit)

Captured in the session scratchpad (`baseline/tsc.txt`, `lint.json`,
`lint-summary.txt`, `build.txt`).

| Gate               | Result    | Detail                                   |
| ------------------ | --------- | ---------------------------------------- |
| `npx tsc --noEmit` | ✅ exit 0 | 0 errors                                 |
| `npm run lint`     | ❌ exit 1 | **55 problems (29 errors, 26 warnings)** |
| `npm run build`    | ✅ exit 0 | compiles, 9 static pages                 |

Pre-existing failures **inside `lib/`** — these are the frozen baseline, NOT to
be fixed as part of this work:

```
lib/fileAttachmentPreview.tsx:158:13  warn   @next/next/no-img-element
lib/useUserRole.ts:106:5              error  react-hooks/set-state-in-effect
```

Rule from here on: after every step, re-run the three gates and diff against the
baseline. No message may be _added_. Pre-existing ones stay untouched.

## Survey — `lib/`

24 files, 2,817 LOC.

| File                               | LOC |
| ---------------------------------- | --: |
| `api.ts`                           | 913 |
| `auth.ts`                          | 223 |
| `paymentRequestAttachmentStore.ts` | 186 |
| `fileAttachmentPreview.tsx`        | 184 |
| `useUserRole.ts`                   | 169 |
| `bankSlipEnrichment.ts`            | 165 |
| `amountFormat.ts`                  | 151 |
| `dateDisplayFormat.ts`             |  95 |
| `paymentRequestBillMap.ts`         |  89 |
| `moduleClaims.ts`                  |  89 |
| `compressImage.ts`                 |  69 |
| `paymentRequestDateSort.ts`        |  66 |
| `mintyEnv.ts`                      |  60 |
| `mintyUrls.ts`                     |  58 |
| `paymentRequestRowSort.ts`         |  55 |
| `extractEmail.ts`                  |  51 |
| `billFormSelectOptions.ts`         |  50 |
| `entityCurrency.ts`                |  42 |
| `billStatusDisplay.ts`             |  40 |
| `appScrollRoot.ts`                 |  23 |
| `billStatusRollback.ts`            |  15 |
| `openDatePicker.ts`                |  13 |
| `paymentHistoryDisplay.ts`         |   6 |
| `currencyDisplay.ts`               |   5 |

Only `api.ts` exceeds the ~1000-line reformatter threshold at 913 — under it,
but close enough that no formatter run will be mixed into its logic commits.

## Load-bearing name scan (the `monkeypatch`/`patch` analogue)

In TS the equivalent risk is **module-boundary coupling**: a name whose defining
module matters to importers, or whose module-level side effects move if the name
moves.

Findings:

- **No `import * as` namespace imports anywhere** in `app/`, `components/`, `lib/`.
- **No re-export barrels inside `lib/`** — the only barrels are
  `components/payment-request/index.ts` and `components/layout/index.ts`, and
  neither re-exports from `lib/`.
- Every `lib/` consumer imports named bindings directly from the defining file.

**Conclusion: consolidation within `lib/` is low-risk** — there is no indirection
layer that would silently stop intercepting. The constraint that remains is the
ordinary one: any name I move must have its import sites updated, and `tsc`
will catch a miss.

## Duplication found (reported before changing anything)

### 1. `API_BASE` constant — 7 identical copies

```
lib/useUserRole.ts:10   lib/moduleClaims.ts:8   lib/api.ts:13   lib/auth.ts:11
app/page.tsx:11   app/module-selection/page.tsx:13   components/PdfJsCanvasPreview.tsx:57
```

All seven are byte-identical:
`process.env.NEXT_PUBLIC_MODULE2_BACKEND_URL ?? "http://localhost:8000"`.

4 are in `lib/` (in scope); 3 are outside it. Extracting a shared constant that
`app/` and `components/` also import would make this a cross-subfolder change —
so per the brief it triggers the whole-folder `tsc` check.

### 2. JWT decode preamble — `getModuleClaims` vs `getPermissionClaims`

`lib/moduleClaims.ts:30-48` and `lib/useUserRole.ts:27-54`. The decode preamble
is logically identical in both:

```ts
const auth = getAuth();
if (!auth?.token) return <fallback>;
const parts = auth.token.split(".");
if (parts.length !== 3) return <fallback>;
const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
const payload = JSON.parse(payloadJson) as Record<string, unknown>;
// ...differs only in which claims are read...
// wrapped in try/catch returning <fallback>
```

**Behavioural difference (must be preserved, not merged away):** the two have
_different fallback shapes and different per-claim defaults_ —
`moduleClaims` defaults its booleans to `true` (documented backward-compat
decision: a legacy token must never silently hide nav), while
`useUserRole` defaults to `""` / `null` / `false`. A naive merge that picked one
default would be a behaviour change. Safe extraction = a generic
`decodeJwtPayload(): Record<string, unknown> | null` that returns the raw
payload, leaving each caller's claim-reading and defaults exactly as they are.

### 3. Auth-header construction — 3 sites in `api.ts`, 2 more outside

`api.ts:64-66`, `api.ts:166-169`, `api.ts:207-215`, plus `moduleClaims.ts:72`
and `useUserRole.ts:118-122`.

**These are NOT interchangeable — do not blind-merge:**

| Site                         | `Authorization` | `X-Entity-Id` | `Accept`           | `Content-Type`                     | Token absent                |
| ---------------------------- | --------------- | ------------- | ------------------ | ---------------------------------- | --------------------------- |
| `api.ts:64` (`apiFetch`)     | ✅              | ✅            | —                  | `application/json` unless FormData | throws 401 + redirect       |
| `api.ts:166`                 | ✅              | ✅            | `application/json` | —                                  | throws 401 + redirect       |
| `api.ts:207` (`authHeaders`) | conditional     | conditional   | `*/*`              | —                                  | **omits headers, no throw** |

The third deliberately tolerates a missing token and is used for a cross-origin
storage fetch that must _not_ send `Authorization` (comment at `api.ts:224`
explains presigned-URL/CORS breakage). A shared builder is still possible but
needs flags (`accept`, `requireAuth`) to preserve all three behaviours.

### 4. Preamble duplication — token-refresh guard

`api.ts:50-62` and `api.ts:152-164` are a byte-identical 13-line block
(expiry check → refresh → redirect → `getAuth()` → 401 throw). Straightforward
extraction with no behavioural difference found.

## Deliberately left alone

- The two pre-existing `lib/` lint failures (baseline, see above) — out of scope
  per the brief.
- `next.config.ts` pdf.js asset copying — outside `lib/`.

## Progress log

### Step 1 — dead code (DONE, verified green)

- **Deleted `lib/openDatePicker.ts`** (13 LOC, single export `openDatePicker`).
  - Referenced **nowhere** — the only mention in the whole repo was its own
    definition. Not imported by any file; never imported in git history.
  - **Checked it was dead, not a bug:** the helper existed to open the native
    date picker for `.pr-date-input` fields. Those fields are still styled in
    `app/globals.css`, but `components/DateTextField.tsx` now opens the picker
    itself via `dateInputRef.current?.showPicker()` (line 50) with the same
    fallback-to-`focus()` logic. Its comment (line 29) explicitly states the
    separate `showPicker()` call "is no longer needed." So the helper was
    superseded and orphaned — safe delete, no behaviour lost.
  - **Verify:** `tsc` identical to baseline (0), lint identical (55 for real
    source), build exit 0. `tsc` re-parse of all files OK.

**Lesson / baseline correction:** the original lint baseline was captured
_before_ `npm run build`, so it predated the generated vendor bundle
`public/pdfjs/pdf.worker.min.mjs` (copied out of `node_modules` by
`next.config.ts`, gitignored). Once built, ESLint lints that minified file and
emits ~1450 messages. This is pre-existing noise unrelated to any cleanse
change. Fix applied: **all lint diffs filter out `public/pdfjs/`**, and the
canonical `baseline/lint-summary.txt` was re-saved in filtered form (55 real-
source messages). Separately worth noting for later: `public/pdfjs/` arguably
belongs in an ESLint ignore, but that's config work outside `lib/` and out of
scope here.

### Step 2 — duplication #4: token-refresh guard (DONE, verified green)

- Committed dead-code step as `b2be8fc`.
- Extracted `requireAuthenticatedSession(): Promise<AuthInfo>` in `lib/api.ts`,
  replacing the two byte-identical 13-line guard blocks (was `apiFetch` and
  `fetchAttachmentDownloadJson`).
  - **No behavioural difference between the two blocks** — confirmed byte-for-
    byte before merging. Only the guard was hoisted; the header construction
    _after_ the guard differs between the two callers and was left untouched.
  - The helper returns the validated `AuthInfo`, so callers no longer re-call
    `getAuth()`. Error strings / redirect calls preserved exactly.
  - Added `type AuthInfo` to the existing `./auth` import.
  - **Verify:** tsc identical (0), lint identical (55 real source), build 0.

### Step 3 — duplication #2: JWT decode (DONE, verified green)

Scope grew after a discovery (user approved "converge all 5"): `lib/auth.ts`
**already had** a canonical `decodeJwtPayload(token)` (used only by
`getEmailFromToken`), and **five** sites inlined their own copy.

**Behavioural difference found and reported before merging:** the canonical
`decodeJwtPayload` pads the base64 (`base64 += "=".repeat(4 - pad)`); all five
inline copies called `atob()` unpadded. On valid JWTs the browser/Node `atob`
tolerates missing padding, so behaviour is unchanged; the padded variant is
strictly more correct. Converging standardises on it — an improvement, not a
risky pick-a-winner.

Changes (each caller keeps its OWN claim reading + defaults; only the
split/atob/parse lines were replaced with `decodeJwtPayload(auth.token)` +
`if (!payload) return <that caller's fallback>`):

- `lib/auth.ts`: exported `decodeJwtPayload`; rewrote `getRoleFromToken`,
  `isTokenExpiringSoon`, `isTokenExpired`. **Kept each function's outer
  `try/catch`** — `getAuth()` can throw via `decodeURIComponent` on a malformed
  cookie, and the originals caught that. (`getEmailFromToken` already used the
  helper and keeps its catch too.) Removing the catch would have been a subtle
  behaviour narrowing, so it was preserved.
- `lib/moduleClaims.ts` (`getModuleClaims`): fallback `true`/`true` and per-claim
  boolean-or-true defaults unchanged.
- `lib/useUserRole.ts` (`getPermissionClaims`): `empty` fallback and per-claim
  defaults unchanged.

The inline `parts.length !== 3` guard each caller had is now performed inside
`decodeJwtPayload` (returns null), and every caller maps null → its fallback, so
the malformed-token path is preserved exactly.

**Verify:** tsc identical (0). Build 0. Lint: identical to baseline **ignoring
line/col** — the one frozen pre-existing error
(`lib/useUserRole.ts react-hooks/set-state-in-effect`) shifted 106→104 because
2 lines were removed above it. No message added or removed; the pre-existing
failure is untouched. Baseline line number re-synced to 104.

Committed #4 + #2 together as `c51c6ef`
("lib: dedupe JWT decode and auth-guard boilerplate").

### Step 4 — duplication #3: auth-header helper (SKIPPED, with reason)

Decided **not** to extract. After #4 landed, the shared core shrank to the
2-line `Authorization` + `X-Entity-Id` pair across only **two** viable sites
(`api.ts` `apiFetch` and `fetchAttachmentDownloadJson`) — both now run after
`requireAuthenticatedSession()`, so `auth` is non-null there. The third site
(the cross-origin `authHeaders` closure) was always out of scope: it tolerates a
missing token and must omit auth to avoid breaking presigned URLs / CORS. The
two hook sites (`moduleClaims`, `useUserRole`) use a plain-object header literal,
not a `Headers` instance — converting them would add more glue than it removes.
Extracting 2 lines behind a function call is indirection without payoff, so it
was left alone. (User approved skip.)

### Step 5 — duplication #1: API_BASE constant (DONE, verified green)

Cross-subfolder change (`lib/`, `app/`, `components/`).

- New `lib/apiBase.ts` exports `API_BASE`
  (`process.env.NEXT_PUBLIC_MODULE2_BACKEND_URL ?? "http://localhost:8000"`,
  byte-identical to the 7 originals).
- Replaced the local `const API_BASE = …` in all 7 files with an import
  (`./apiBase` in `lib/`, `@/lib/apiBase` in `app/` + `components/`, matching
  each area's existing import convention). The identifier stays `API_BASE`, so
  no downstream usage changed.
- `NEXT_PUBLIC_*` is build-time-inlined, so centralising the read doesn't change
  resolution semantics — every site still resolves the same value at build.
- **Whole-folder `tsc` check run** (brief's F821 analogue for cross-subfolder
  edits): exit 0, identical to baseline. Confirmed zero `const API_BASE`
  declarations remain and all 7 consumers import it.
- **Verify:** tsc identical (0). Build 0. Lint identical to baseline **ignoring
  line/col** — deltas are pure position shifts from removing the 2-line const in
  three files (frozen pre-existing errors in `app/module-selection/page.tsx`,
  `app/page.tsx`, `lib/useUserRole.ts` moved up 2 lines). No message added or
  removed. Baseline re-synced.

## Status — `lib/` subfolder COMPLETE

All planned steps done and verified green:

1. Dead code — removed `openDatePicker.ts` (`b2be8fc`).
2. Duplication #4 (auth guard) + #2 (JWT decode) — `c51c6ef`.
3. Duplication #3 (headers) — skipped with reason.
4. Duplication #1 (API_BASE) — in working tree, **uncommitted**.

No formatter/reformatter was run (no black-equivalent applied; ESLint was only
used as a gate, `--fix` never invoked). `api.ts` is the only near-1000-line file
(down slightly now) and had logic changes, so no bulk reformat was mixed in.

`lib/` cleanse finished; API_BASE committed by user as `b633815`.

---

# Code Cleanse — `components/` (slice 1: payment-request confirm modals)

Same gates (`tsc` + filtered `lint` + `build`), same baseline. Only `api.ts`
was the >1000-line concern in `lib/`; in `components/` several files exceed 900
LOC (the reformatter rule still applies — no bulk reformat mixed with logic).

## Load-bearing / dead-code scan for `components/`

- **0 dead exports** across all of `components/` (every exported name is
  referenced by another file) — so there is no dead-code step for this folder.
- Duplication signal that motivated the slice: ~13 files hand-roll modal
  scaffolding (`createPortal` + `fixed inset-0` overlay + Escape `useEffect`).
  Started with the tightest cluster: the 4 delete/confirm modals.

## Slice 1 — extract `ConfirmDialog` (DONE, verified green)

Created `components/payment-request/ConfirmDialog.tsx` — a presentational parent
owning the shared scaffold (portal, backdrop overlay, `pushAppScrollLock`,
Escape-to-close, accessible `alertdialog` wrapper, button row + the 5 shared
style constants). The 4 modals became thin wrappers passing their own strings:

- `BulkDeleteConfirmModal` (z-300), `RowDeleteConfirmModal` (z-420),
  `PaymentDeleteConfirmModal` (z-430), `AttachmentDeleteConfirmModal` (z-430).
- **Public props and every user-facing string unchanged** — verified each
  file's human phrases are byte-for-byte identical to HEAD (4/4 ✓). Callers
  untouched.

**Behavioural differences preserved via props (reported before merging, per the
rules), not merged away:**

- **z-index** differs per modal → `zIndex` prop (each keeps its historical
  value; `overlayClassFor(zIndex)` rebuilds the exact class string).
- **Confirm button variant**: red destructive (`danger`, default) vs the
  secondary-color acknowledge button. The `AttachmentDeleteConfirmModal`
  `minimumAttachment` case is a single-button acknowledge dialog → modelled as
  `acknowledgeOnly` (one primary "OK" button, no Cancel/Confirm pair), matching
  the original exactly.
- **Backdrop `!pending` guard**: 3 modals + the attachment non-minimum variant
  guarded backdrop-close with `!pending`; the original `minimumAttachment`
  branch omitted it. In acknowledge-only mode `pending` is always false, so the
  unified `&& !pending` guard is behaviourally identical. Documented so it is
  not mistaken for a silent change.
- **`onConfirm` call style**: originals for Bulk/Payment/Row used
  `onClick={onConfirm}`; Attachment used `onClick={() => onConfirm?.()}`. Parent
  uses the optional-call form uniformly — identical when `onConfirm` is defined,
  and safe (no-op) when omitted in acknowledge-only mode.

**Verify:** tsc identical to baseline (0). Lint identical — exact match, no
shifts (none of these files had baseline lint entries). Build exit 0 (also
confirms all 5 files parse as JSX + type-check). Human-phrase diff vs HEAD: 4/4
identical.

Net: 4 files went from ~85–155 LOC of mostly-duplicated scaffold to ~30–75 LOC
wrappers; scaffold now lives once in `ConfirmDialog.tsx` (~150 LOC).

## Status — `components/` slice 1 complete

**Paused for user review + commit.** Working tree (uncommitted):

- NEW `components/payment-request/ConfirmDialog.tsx`
- MOD `components/payment-request/{Bulk,Payment,Row,Attachment}DeleteConfirmModal.tsx`
- MOD `CODE_CLEANSE_NOTES.md`

Committed by user as `e9ea1a0`
("components: extract shared ConfirmDialog for delete-confirm modals").

## Slice 2 — larger modals: DELIBERATELY LEFT ALONE (with reasons)

Investigated `OverpaymentWarningModal` (201), `UploadInvoiceAttachmentModal`
(271), `RecordPaymentModal` (907), `BankSlipDetailsModal` (984) for adopting
`ConfirmDialog` / a general `Modal`. Decision (user-approved): **stop here.**

Why these are NOT the same as the confirm-modal duplication:

- **The big three are stateful form panels, not confirm dialogs.**
  `useState` count 6 / 15 / 13; they contain form inputs; they use
  `role="dialog"` (NOT `alertdialog`); widths differ (480–520px). They share
  only the outermost ~8 lines of scaffold (portal + overlay + scroll-lock),
  which is smaller than the glue a general primitive would need — the same
  below-threshold call made for `lib/` #3.
- **`OverpaymentWarningModal` is the closest**, but adopting `ConfirmDialog`
  would require new props (`maxWidth`, a title-icon slot, rich `children`) AND
  it has _real_ differences that must not be silently normalised:
  - shell width `max-w-[440px]` vs `ConfirmDialog`'s hardcoded `max-w-[400px]`
    (40px visual difference);
  - its primary button uses `transition-opacity duration-200 ease-out
hover:opacity-80`, whereas `ConfirmDialog`'s primary uses
    `transition-opacity hover:opacity-90` (different easing + hover opacity);
  - body is title-with-icon + scrollable payment list + second paragraph, not
    a single description.
    Merging would mean generalising `ConfirmDialog` into a broad `Modal` with
    header/body/footer slots + configurable width/role/button styles — a design
    decision with drift risk across ~12 call sites that cannot be visually
    verified in this environment. Out of scope for a mechanical cleanse.

**Rule applied:** "never merge functions that only look similar; if they
genuinely differ, preserve both." Here they genuinely differ, and the honest
call is to leave them rather than bend a confirm-dialog primitive to fit form
panels.

## Status — `components/` cleanse COMPLETE (for this pass)

Done + committed:

- Slice 1: `ConfirmDialog` extracted, 4 confirm modals deduped (`e9ea1a0`).

Deliberately left alone (documented above):

- The 4 larger form/warning modals — genuinely different, not duplication.
- 0 dead exports in `components/` (nothing to remove).
- No reformatter run (ESLint gate-only, `--fix` never used); the 900+ LOC files
  were never bulk-reformatted.

If a future pass wants to go further, the only real candidate is a general
`Modal` primitive (slice-2 "generalize" option) — treat as a design task with
visual review, not a mechanical dedupe.
