/** Must match `id` on the scroll wrapper in `app/layout.tsx`. */
export const APP_SCROLL_ROOT_ID = "app-scroll-root";

export function getAppScrollRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(APP_SCROLL_ROOT_ID);
}

/**
 * The lock is REFERENCE COUNTED, not save-and-restore.
 *
 * Overlays stack (a file preview over the Add Payment Request modal), and React does not
 * guarantee that a parent's effect cleanup runs before its child's when both unmount in the
 * same commit. Under save-and-restore the out-of-order case writes "hidden" back after the
 * outer layer restored "", and the app never scrolls again. Counting makes release
 * order-independent: the first push locks, the last release restores.
 */
let lockCount = 0;
let lockedEl: HTMLElement | null = null;
let prevOverflow = "";

export function pushAppScrollLock(): () => void {
  const el = getAppScrollRoot() ?? document.body;
  if (lockCount === 0) {
    lockedEl = el;
    prevOverflow = el.style.overflow;
    el.style.overflow = "hidden";
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return; // a cleanup may be invoked more than once; only count it once
    released = true;
    lockCount -= 1;
    if (lockCount === 0 && lockedEl) {
      lockedEl.style.overflow = prevOverflow;
      lockedEl = null;
      prevOverflow = "";
    }
  };
}
