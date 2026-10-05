/**
 * The one rule for a `next` taken from the address bar: a path on THIS app's origin.
 *
 * COPY of minty-web/lib/safeNext.ts - change both.
 *
 * `startsWith("/") && !startsWith("//")` alone is an open redirect (found 2026-10-05):
 * browsers read `\` as `/` and drop tab/CR/LF from a URL, so `/\evil.com` and
 * `/<TAB>/evil.com` both land on `https://evil.com/`. So: no backslash or control
 * character at all, and the value must still resolve to this origin.
 */
const PROBE_ORIGIN = "https://same-origin.invalid";

export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (ch === "\\" || code < 0x20 || code === 0x7f) return fallback;
  }
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  return url.origin === PROBE_ORIGIN ? url.pathname + url.search + url.hash : fallback;
}
