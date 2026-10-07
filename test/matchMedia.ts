// jsdom implements no `window.matchMedia`, and PaymentRequestEasyView asks it
// `(max-width: 1023px)` to decide whether a card opens as a sheet or in place.
//
// Deliberately NOT a blanket always-false stub in test/setup.ts: that would silently pick the
// desktop branch and read as coverage of a choice no test had made. A test that cares about the
// branch calls `setViewportMatches(360)` or `setViewportMatches(1440)` and says so in its name.

/** The width every test starts at, so an unstated viewport is a desktop one. */
export const DEFAULT_TEST_WIDTH = 1440;

type Listener = (event: MediaQueryListEvent) => void;

/**
 * Install a `matchMedia` that answers `(max-width: Npx)` and `(min-width: Npx)` against
 * `width`. Returns the width it installed, so a test can assert what it asked for.
 */
export function setViewportMatches(width: number): number {
  const matches = (query: string): boolean => {
    const max = /\(\s*max-width:\s*(\d+(?:\.\d+)?)px\s*\)/.exec(query);
    if (max) return width <= Number(max[1]);
    const min = /\(\s*min-width:\s*(\d+(?:\.\d+)?)px\s*\)/.exec(query);
    if (min) return width >= Number(min[1]);
    // An unrecognised query is not quietly answered "no": a test asking something this stub
    // cannot evaluate should see it, not read a false as a layout decision.
    throw new Error(`test/matchMedia.ts cannot evaluate ${JSON.stringify(query)}`);
  };

  const matchMedia = (query: string): MediaQueryList => {
    const listeners = new Set<Listener>();
    const list: MediaQueryList = {
      media: query,
      matches: matches(query),
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
      // Deprecated pair, still what some code reaches for.
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
    return list;
  };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
  return width;
}
