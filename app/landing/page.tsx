"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useLandingHandoff } from "@minty/shared/landing";
import { withReturnOrigin } from "@minty/shared/previewSibling";
import { setAuth } from "@/lib/auth";
import { MINTY_MODULE_URL } from "@/lib/mintyUrls";

/** Nothing to land with: back into Minty (its /entity - the entity list, or sign-in). */
function backToMinty() {
  window.location.replace(withReturnOrigin(`${MINTY_MODULE_URL}/entity`));
}

/**
 * Flask's hand-off lands here (`/landing?token=…&next=…&entity_id=…&entity_name=…`):
 * `@minty/shared/landing`'s hook (owner 2026-10-21: one shared module) stores the token and goes
 * to the safe `next` - "/" when there is none, which the middleware moves to the company's list.
 */
function LandingContent() {
  useLandingHandoff({
    searchParams: useSearchParams(),
    router: useRouter(),
    setAuth,
    home: "/",
    onNoToken: backToMinty,
  });

  return (
    <div className="flex min-h-dvh min-h-screen items-center justify-center bg-surface-card">
      <span className="text-sm text-text-muted">Loading…</span>
    </div>
  );
}

export default function Landing() {
  return (
    <Suspense>
      <LandingContent />
    </Suspense>
  );
}
