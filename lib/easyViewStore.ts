"use client";

/**
 * The payment-request list's "Easy View" preference, as an external store.
 *
 * It lives in `localStorage` - per browser, never sent anywhere - and unlike the auth cookie it
 * genuinely changes while the page is open, because the toggle writes it. That is what
 * `useSyncExternalStore` wants a `subscribe` for: the setter writes storage and then tells every
 * mounted reader, rather than each one keeping its own copy in state and an effect to seed it.
 *
 * `getEasyViewSnapshot` reads storage on every call and returns a boolean. A primitive compares
 * by value, so there is nothing to cache and no stale snapshot to leak between tests.
 */
const STORAGE_KEY = "payment-request-easy-view";

/** Easy View is on unless this browser has said otherwise - also the server/hydration answer. */
const DEFAULT_EASY_VIEW = true;

const listeners = new Set<() => void>();

function read(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "0" || raw === "false") return false;
    if (raw === "1" || raw === "true") return true;
  } catch {
    /* private mode / unavailable */
  }
  return DEFAULT_EASY_VIEW;
}

export function subscribeEasyView(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getEasyViewSnapshot(): boolean {
  return read();
}

export function getEasyViewServerSnapshot(): boolean {
  return DEFAULT_EASY_VIEW;
}

export function setEasyView(next: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
  for (const listener of listeners) listener();
}
