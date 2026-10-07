// The DOM half of the setup, loaded by ./setup.ts whenever a test file has a window.
//
// jest-dom's matchers are imported from the '/vitest' entry point, not the bare package: the
// bare one registers against Jest's expect and silently adds nothing here, so
// `toBeInTheDocument` would come back as "not a function" at the call site rather than as a
// setup error.

import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { DEFAULT_TEST_WIDTH, setViewportMatches } from "./matchMedia";

// The header's badge and the side menu read the viewer from Flask on mount (lib/viewer.ts).
// A screen test queues its fetch answers in order and counts the calls - a read it never asked
// for would take one of them. So nobody is looking unless a test says who.
//
// Imported INSIDE the hook, not at the top of this file, and this is load-bearing. A top-level
// `import "@/lib/viewer"` pulls in components/ui/sidebarHost, and with it lib/useCompanyPages,
// lib/moduleClaims, lib/leaveGuard, lib/mintyUrls, lib/api and lib/auth - all of them loaded
// before any test file's `vi.mock` is registered, which binds their own imports (`useParams`
// from next/navigation, say) to the real modules for good. A test could then mock
// next/navigation and watch the mock be ignored by the very component it was for.
beforeEach(async () => {
  const { _setViewerLoaderForTests } = await import("@/lib/viewer");
  _setViewerLoaderForTests(() => Promise.resolve(null));
});

// findBy*/waitFor wait 2.5s, not the default 1s. The screens here read a list of bills and then
// a detail, and under a full-suite run that is regularly more than a second; the flake it
// produced was always "the element isn't there yet", never a real absence.
configure({ asyncUtilTimeout: 2500 });

// jsdom implements no ResizeObserver, and PaymentRequestDetailBody, PaymentRequestDetailedInfo
// and PaymentRequestEasyView each construct one on mount to fit a label to its column. A no-op
// stub rather than a real implementation on purpose: the fitting measures scrollWidth and
// getComputedStyle, both of which jsdom reports as 0 / empty, so any assertion about the
// observed value would be testing the stub. What these tests need is only for mount to survive.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// Several components scroll a row or a section into view on open, and the history accordion puts
// the page back where it was on close (inside a requestAnimationFrame, so a throw there is an
// UNHANDLED error rather than a failed assertion). jsdom implements neither call and has no
// layout to make them mean anything; that the browser actually scrolled is an e2e question.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}

// The attachment and bank-slip previews wrap a Blob in an object URL at mount. jsdom has
// neither function. The stub hands out a deterministic url so a test can assert WHICH blob was
// wrapped and that it was revoked once; whether the browser freed the memory it cannot say, so
// no test claims more than that.
let objectUrlSeq = 0;
beforeEach(() => {
  objectUrlSeq = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => `blob:jsdom/${(objectUrlSeq += 1)}`),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

// Every test starts at a desktop width; the ones that care say which width they mean.
beforeEach(() => {
  setViewportMatches(DEFAULT_TEST_WIDTH);
});

// `indexedDB` is deliberately NOT stubbed. lib/paymentRequestAttachmentStore.ts is the only
// user, its round-trip is proved in e2e/10_detail_attachments.spec.ts, and leaving the global
// undefined means an accidental use fails loudly instead of passing against a fake.

// RTL only auto-cleans when a global `afterEach` exists, and this project runs with globals
// disabled -- so without this, every render stacks up in the same document and `getByRole`
// starts finding two of everything.
afterEach(() => {
  cleanup();
  // Every test starts with an empty cookie jar; lib/auth.ts is cookie-backed on `billing_token`.
  for (const c of document.cookie.split("; ").filter(Boolean)) {
    document.cookie = `${c.split("=")[0]}=;path=/;max-age=0`;
  }
  // The list remembers its table/easy-view choice in localStorage and the subscription notice
  // claims a one-shot in sessionStorage; neither may leak into the next test.
  localStorage.clear();
  sessionStorage.clear();
});
