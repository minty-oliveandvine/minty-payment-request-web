// "Leave without saving?" (lib/leaveGuard.ts) - the link rules and the two answers.
//
// SCOPE, stated on purpose: the Back/Forward sentinel and the several-entry jump are NOT tested
// here. They turn on `navigation.currentEntry.index`, which jsdom does not implement, so a test
// of them would be measuring the absence of the Navigation API rather than the code. Those paths
// are covered in a real browser by e2e/07_settings_leave.spec.ts, which is the best-covered file
// in this repo.
//
// What is tested here is the part a browser test cannot enumerate cheaply: which links are held
// and which are let straight through.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { guardLeave, useLeaveGuard } from "@/lib/leaveGuard";

/** Records a click instead of letting jsdom try to navigate. */
const followed = vi.fn<(href: string) => void>();

function swallowNavigation(event: MouseEvent) {
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (anchor instanceof HTMLAnchorElement) {
    event.preventDefault();
    followed(anchor.getAttribute("href") ?? "");
  }
}

type HarnessProps = { dirty: boolean; reset?: () => void };

/**
 * A page with unsaved changes and the links the guard has to tell apart. The dialog is a plain
 * region marked the way the real one is, so a link inside it is the real exemption.
 */
function Harness({ dirty, reset = () => {} }: HarnessProps) {
  const guard = useLeaveGuard(dirty, reset);
  return (
    <>
      <a href="/elsewhere">Away</a>
      <a href="#section">To a section of this page</a>
      <a href="/report.pdf" download>
        Download
      </a>
      <a href="https://xero.example/account" target="_blank" rel="noreferrer">
        New tab
      </a>
      <a href="javascript:void 0">Script</a>
      <a href="mailto:olive@minty.test">Mail</a>
      <a href="/menu" data-sidebar-open>
        Open the menu
      </a>
      {guard.open && (
        <div role="dialog" aria-label="Leave without saving?" data-leave-dialog>
          <a href="/inside-the-dialog">A link in the dialog</a>
          <button type="button" onClick={guard.discard}>
            Discard changes
          </button>
          <button type="button" onClick={guard.stay}>
            Go Back
          </button>
        </div>
      )}
    </>
  );
}

const dialog = () => screen.queryByRole("dialog", { name: "Leave without saving?" });

beforeEach(() => {
  window.addEventListener("click", swallowNavigation);
});

afterEach(() => {
  window.removeEventListener("click", swallowNavigation);
});

describe("a link while the page is dirty", () => {
  it("is held, and the dialog asks", async () => {
    render(<Harness dirty />);

    await userEvent.click(screen.getByRole("link", { name: "Away" }));

    expect(dialog()).toBeInTheDocument();
    expect(followed).not.toHaveBeenCalled();
  });

  it("is not followed when the person goes back to the page", async () => {
    render(<Harness dirty />);
    await userEvent.click(screen.getByRole("link", { name: "Away" }));

    await userEvent.click(screen.getByRole("button", { name: "Go Back" }));

    expect(dialog()).not.toBeInTheDocument();
    expect(followed).not.toHaveBeenCalled();
  });

  it("is replayed, after the ticks are put back, when the person discards", async () => {
    const reset = vi.fn();
    render(<Harness dirty reset={reset} />);
    await userEvent.click(screen.getByRole("link", { name: "Away" }));

    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(reset).toHaveBeenCalledTimes(1);
    // The sentinel comes off first, so Back from the next page lands here once, not twice -
    // which is why the replay waits for the browser to move.
    await waitFor(() => expect(followed).toHaveBeenCalledWith("/elsewhere"));
    expect(dialog()).not.toBeInTheDocument();
  });

  it("is let through on the replay and not held a second time", async () => {
    render(<Harness dirty />);
    await userEvent.click(screen.getByRole("link", { name: "Away" }));
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    await waitFor(() => expect(followed).toHaveBeenCalledTimes(1));
    expect(dialog()).not.toBeInTheDocument();
  });

  it("closes on Escape alone, without leaving", async () => {
    render(<Harness dirty />);
    await userEvent.click(screen.getByRole("link", { name: "Away" }));

    await userEvent.keyboard("{Escape}");

    expect(dialog()).not.toBeInTheDocument();
    expect(followed).not.toHaveBeenCalled();
  });

  it("does not ask again after Escape until another link is clicked", async () => {
    render(<Harness dirty />);
    await userEvent.click(screen.getByRole("link", { name: "Away" }));
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("link", { name: "Away" }));

    expect(dialog()).toBeInTheDocument();
    expect(followed).not.toHaveBeenCalled();
  });
});

describe("the links that are never held", () => {
  it.each([
    ["a fragment of this very page", "To a section of this page"],
    ["a download", "Download"],
    ["another tab", "New tab"],
    ["a javascript: address", "Script"],
    ["an address the browser handles itself", "Mail"],
    ["the sidebar's own trigger", "Open the menu"],
  ])("lets %s through", async (_label, name) => {
    render(<Harness dirty />);

    await userEvent.click(screen.getByRole("link", { name }));

    expect(dialog()).not.toBeInTheDocument();
  });

  it("lets a link inside the open dialog through", async () => {
    render(<Harness dirty />);
    await userEvent.click(screen.getByRole("link", { name: "Away" }));

    await userEvent.click(screen.getByRole("link", { name: "A link in the dialog" }));

    // The dialog is still the thing on screen; its own link was not re-held.
    expect(followed).toHaveBeenCalledWith("/inside-the-dialog");
  });

  it.each([
    ["a middle click", { button: 1 }],
    ["ctrl-click", { ctrlKey: true }],
    ["meta-click", { metaKey: true }],
    ["shift-click", { shiftKey: true }],
    ["alt-click", { altKey: true }],
  ])("lets %s through - the person is opening it elsewhere", async (_label, modifiers) => {
    render(<Harness dirty />);
    const link = screen.getByRole("link", { name: "Away" });

    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...modifiers }));

    expect(dialog()).not.toBeInTheDocument();
  });
});

describe("a clean page", () => {
  it("holds nothing at all", async () => {
    render(<Harness dirty={false} />);

    await userEvent.click(screen.getByRole("link", { name: "Away" }));

    expect(dialog()).not.toBeInTheDocument();
    expect(followed).toHaveBeenCalledWith("/elsewhere");
  });
});

describe("guardLeave", () => {
  it("goes straight on when no page is asking", () => {
    const proceed = vi.fn();
    guardLeave(proceed);
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it("goes straight on when the page that is asking has nothing unsaved", () => {
    render(<Harness dirty={false} />);
    const proceed = vi.fn();

    guardLeave(proceed);

    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it("asks first for an exit that is not a link, like Logout", async () => {
    render(<Harness dirty />);
    const proceed = vi.fn();

    guardLeave(proceed);

    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(proceed).not.toHaveBeenCalled();
  });

  it("never goes on when the person stays - Logout then leaves them signed in", async () => {
    render(<Harness dirty />);
    const proceed = vi.fn();
    guardLeave(proceed);
    await waitFor(() => expect(dialog()).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Go Back" }));

    expect(proceed).not.toHaveBeenCalled();
  });

  it("goes on once the person discards", async () => {
    const reset = vi.fn();
    render(<Harness dirty reset={reset} />);
    const proceed = vi.fn();
    guardLeave(proceed);
    await waitFor(() => expect(dialog()).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(reset).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(proceed).toHaveBeenCalledTimes(1));
  });
});
