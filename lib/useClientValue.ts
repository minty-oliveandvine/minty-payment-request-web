"use client";

import { useSyncExternalStore } from "react";

/**
 * Read a browser-only value - a cookie, the JWT's claims, a `localStorage` entry - from a
 * component that also renders on the server.
 *
 * This replaces the pattern that was repeated across this app:
 *
 *     const [x, setX] = useState(neutral);
 *     useEffect(() => setX(read()), []);   // "read after mount so SSR and hydration agree"
 *
 * The intent was right and the mechanism was a setState inside an effect, which React now flags
 * (`react-hooks/set-state-in-effect`): it renders, commits, sets state and renders again, a
 * cascade React cannot batch away. `useSyncExternalStore` is the sanctioned form of the same
 * intent - `serverSnapshot` is what the server and hydration render, and React re-reads
 * `getSnapshot` itself once mounted, re-rendering only if the value actually differs.
 *
 * Two rules:
 *
 * - `getSnapshot` MUST return a referentially stable value while the underlying data is
 *   unchanged. A primitive is fine; an object must be cached, as `getAuthSnapshot()` is. A fresh
 *   object on every call makes React loop.
 * - Nothing subscribes. Cookies and `localStorage` do not notify this tab when they change, so
 *   there is no event to subscribe to - exactly as true of the effect this replaces. A value that
 *   really does change while the page is open needs its own store with a subscribe that emits
 *   (see `lib/easyViewStore.ts`).
 */
const noSubscribe = () => () => {};

export function useClientValue<T>(getSnapshot: () => T, serverSnapshot: T): T {
  return useSyncExternalStore(noSubscribe, getSnapshot, () => serverSnapshot);
}
