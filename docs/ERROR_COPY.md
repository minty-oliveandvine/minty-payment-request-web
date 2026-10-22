# Error copy

How a failure becomes something a user can read. The copy standard is shared
across Minty, minty-payment-request-api, minty-payment-request-web and minty-onboarding-web; the canonical
write-up lives in the Minty repo as `docs/features/ERROR_MESSAGE_LEAKS.md`.

## The standard

> `I couldn't <do the specific thing>. <Short next step>?`

1. Under two sentences.
2. First person -- not `Error:`, not `Failed to`.
3. Name the specific thing: *"that invoice"*, not *"the operation"*.
4. Warm close, no blame. Drop the apology when retrying won't help (a validation
   error, a hard limit) and state the requirement instead:
   `Files need to be under 10MB.`
5. No codes, stack text or HTTP statuses in the visible string. That goes to the log.
6. Sentence case, no `Error:` prefix, no exclamation marks on failures.

House fallback for unknown causes:
`Something went wrong on my end. Mind trying again?`

## The mechanism

Every client is `@minty/shared/apiClient`'s `createBearerClient`, and every refusal's copy is
`@minty/shared/errorCopy`'s (the shared-code refactor, owner 2026-10-21: one shared module for
every app). This app configures four:

| File | Talks to | Error type |
|---|---|---|
| `lib/api.ts` (`apiFetch`) | the Django billing backend (`API_BASE/api/v1`) | `ApiError` (the body's sentence, else the status's copy - `statusFallback`) |
| `components/ui/sidebarHost.ts` (`mintyApi`, `mintyQuietApi`, `subscriptionApi`) | Flask's `/api/me/profile` and minty-subscription-api's `/api/me/subscriptions` - the sidebar's reads | `ApiError` (the body's sentence, else `HOUSE_FALLBACK`) |

`lib/subscriptionNotice.ts` (Flask's subscription notice) is deliberately silent: a failed
notice shows nothing and never throws. This app's own payer-portal client (`lib/payerPortal.ts`,
`PortalError`) was deleted with the portal pages on 2026-10-01.

`friendlyError` decides what a user sees. It reads the body's `error`, then `detail`, then
`message` - the first that flattens to text is judged - and shows it only when it survives two
guards:

- **`normalizeApiErrorDetail`** flattens what the server sent into a string.
  django-ninja answers a schema failure with `detail: [{type, loc, msg}, ...]`;
  stringifying that put `{"type":"missing","loc":["body","email"]}` in front of
  payers. Pydantic entries are reduced to their `msg`, field-error maps to their
  values, and anything still object-shaped is dropped rather than rendered as
  `[object Object]`.
- **`readsAsProse`** rejects text that is machinery rather than a sentence:
  markup, braces, stack text, a single word or a bare machine code like `invalid_state`, an
  exception prefix (`ValueError: …`), a serialised `null,`, a bare HTTP reason phrase
  ("Internal Server Error" - whatever `statusText` said, as HTTP/2 sends none), browser network
  text, or anything over 200 characters.

Anything refused falls back to `STATUS_FALLBACK_MESSAGES` for the status (the payment-request
API) or the house line (the sidebar's reads). A 401 is not copy: a token that has run out (or
none) rejects with "Your session has ended. Signing you back in…" on the way back to Minty; on a
live token `lib/api.ts` says the server's sentence, else "You don't have access to that. If you've
just been added to a company, try picking it again from the company list."

### `ApiError.detail` vs `ApiError.message`

`message` is the scrubbed copy a user reads. `body` is what the server sent, and **`detail` is
the server's raw text** read out of it (a text body itself; an object's `error`, `detail` or
`message`, a non-string one as JSON; else `message`), kept because `isXeroAuthError` and `isDuplicateBillReferenceError` match
on shapes -- Xero rejection payloads, specifically -- that `message` is now
scrubbed of. Match on `detail`, render `message`.

## When you add a `fetch()`

Go through `apiFetch` (or the sidebar host's `mintyApi` / `subscriptionApi`). If you must catch directly,
narrow to `ApiError`:

```ts
// Wrong: apiFetch does not wrap network failures, so a dropped connection is a
// raw TypeError and the user reads "Failed to fetch".
err instanceof Error ? err.message : "I couldn't load that. Mind trying again?"

// Right:
err instanceof ApiError ? err.message : "I couldn't load that. Mind trying again?"
```

## Deliberate exceptions

None left here. The one there was - the card dialog showing Stripe.js `error.message`
verbatim, the issuer's decline text being the only account of what happened - left with the
payer portal for minty-web on 2026-10-01.
