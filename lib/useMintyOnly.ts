"use client";

// Whether the company keeps its books in Minty with no Xero (Xero optional, 2026-11-10): the API's
// `GET /auth/xero-status` says `minty_only`. Such a company has nothing to publish - the Publish
// buttons go - and its bill codes are its own. Asked once per company per page load; a failed read
// is "not Minty-only" (the API still refuses a publish with its own sentence).

import { useEffect, useState } from "react";
import { fetchConnection } from "./api";
import { getEntityIdSnapshot } from "./auth";

let cached: { entityId: string; answer: Promise<boolean> } | null = null;

export function mintyOnlyFor(entityId: string): Promise<boolean> {
  if (!cached || cached.entityId !== entityId) {
    cached = {
      entityId,
      answer: fetchConnection()
        .then((c) => c.mintyOnly)
        .catch((err: unknown) => {
          console.error("[payment requests] the connection status did not load", err);
          return false;
        }),
    };
  }
  return cached.answer;
}

/** Test seam: forget the cached answer. */
export function forgetMintyOnly(): void {
  cached = null;
}

export function useMintyOnly(): boolean {
  const [mintyOnly, setMintyOnly] = useState(false);
  useEffect(() => {
    const entityId = getEntityIdSnapshot();
    if (!entityId) return;
    let live = true;
    void mintyOnlyFor(entityId).then((value) => {
      if (live) setMintyOnly(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return mintyOnly;
}
