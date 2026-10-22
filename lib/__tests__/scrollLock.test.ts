// The page's scroll lock (@minty/shared/scrollLock since the shared-code refactor, 2026-10-21; it
// was lib/appScrollRoot.ts): reference counted, on #app-scroll-root when the
// layout has one and on <body> when it has not.
//
// The count lives at module level, so every case imports a fresh copy - a case that left a lock
// held would otherwise leak into the next one and pass or fail for the wrong reason.

import { afterEach, describe, expect, it, vi } from "vitest";

async function freshLock() {
  vi.resetModules();
  return import("@minty/shared/scrollLock");
}

function addScrollRoot(overflow = ""): HTMLElement {
  const root = document.createElement("div");
  root.id = "app-scroll-root";
  root.style.overflow = overflow;
  document.body.appendChild(root);
  return root;
}

afterEach(() => {
  document.getElementById("app-scroll-root")?.remove();
  document.body.style.overflow = "";
});

describe("the scroll lock, on this app's layout", () => {
  it("names the wrapper app/layout.tsx renders", async () => {
    const { APP_SCROLL_ROOT_ID, getAppScrollRoot } = await freshLock();
    expect(APP_SCROLL_ROOT_ID).toBe("app-scroll-root");
    expect(getAppScrollRoot()).toBeNull();
    const root = addScrollRoot();
    expect(getAppScrollRoot()).toBe(root);
  });

  it("locks #app-scroll-root, not the body, when the layout has one", async () => {
    const { pushAppScrollLock } = await freshLock();
    const root = addScrollRoot();

    const release = pushAppScrollLock();

    expect(root.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("");
    release();
    expect(root.style.overflow).toBe("");
  });

  it("falls back to the body when there is no #app-scroll-root", async () => {
    const { pushAppScrollLock } = await freshLock();

    const release = pushAppScrollLock();

    expect(document.body.style.overflow).toBe("hidden");
    release();
    expect(document.body.style.overflow).toBe("");
  });

  it("puts back whatever overflow was there before, not an empty string", async () => {
    const { pushAppScrollLock } = await freshLock();
    const root = addScrollRoot("auto");

    const release = pushAppScrollLock();
    expect(root.style.overflow).toBe("hidden");
    release();

    expect(root.style.overflow).toBe("auto");
  });

  it("holds until the LAST release, whichever order the layers let go in", async () => {
    // A file preview over the Add modal: React may run the parent's cleanup before the child's.
    const { pushAppScrollLock } = await freshLock();
    const root = addScrollRoot();

    const outer = pushAppScrollLock();
    const inner = pushAppScrollLock();
    outer();
    expect(root.style.overflow).toBe("hidden");
    inner();
    expect(root.style.overflow).toBe("");
  });

  it("counts a release that is called twice only once", async () => {
    const { pushAppScrollLock } = await freshLock();
    const root = addScrollRoot();

    const first = pushAppScrollLock();
    const second = pushAppScrollLock();
    first();
    first();
    expect(root.style.overflow).toBe("hidden");
    second();
    expect(root.style.overflow).toBe("");
  });

  it("releases the element the FIRST lock took, even if #app-scroll-root appeared since", async () => {
    const { pushAppScrollLock } = await freshLock();

    const outer = pushAppScrollLock(); // body: no root yet
    const root = addScrollRoot();
    const inner = pushAppScrollLock(); // count only - the root is never touched
    expect(root.style.overflow).toBe("");

    inner();
    outer();
    expect(document.body.style.overflow).toBe("");
    expect(root.style.overflow).toBe("");
  });

  it("locks again after a full release", async () => {
    const { pushAppScrollLock } = await freshLock();
    const root = addScrollRoot();

    pushAppScrollLock()();
    const again = pushAppScrollLock();

    expect(root.style.overflow).toBe("hidden");
    again();
    expect(root.style.overflow).toBe("");
  });
});
