// The house toast (components/Toast.tsx): one white card in every Minty app, the type carried
// by a bold label rather than a colour or an icon (the user's call, 2026-10-01).
//
// Nothing is stubbed here. The provider already uses useSyncExternalStore as its "am I on the
// client?" oracle instead of the usual mounted flag, so there is no effect to wait for.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast, type ToastType } from "@/components/Toast";

/** Buttons that raise one toast each, so a test says what it wants in its own words. */
function Harness() {
  const { showToast, dismissToast } = useToast();
  return (
    <>
      <button type="button" onClick={() => showToast("Your settings are saved.")}>
        Save
      </button>
      <button type="button" onClick={() => showToast("That didn't save.", "error")}>
        Fail
      </button>
      <button type="button" onClick={() => showToast("Check the amount.", "warning")}>
        Warn
      </button>
      <button type="button" onClick={() => showToast("Nothing to publish.", "info")}>
        Inform
      </button>
      <button type="button" onClick={() => dismissToast(showToast("Gone at once."))}>
        Show and dismiss
      </button>
    </>
  );
}

const show = () => render(<ToastProvider><Harness /></ToastProvider>);
const cards = () => Array.from(document.querySelectorAll("[data-toast-type]"));

afterEach(() => {
  vi.useRealTimers();
});

describe("a toast", () => {
  it("shows the message under a bold type label", async () => {
    show();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const card = screen.getByRole("status");
    expect(within(card).getByText("Success")).toBeInTheDocument();
    expect(within(card).getByText("Your settings are saved.")).toBeInTheDocument();
  });

  it.each([
    ["Save", "success", "Success"],
    ["Fail", "error", "Error"],
    ["Warn", "warning", "Warning"],
    ["Inform", "info", "Information"],
  ])("labels a %s toast %s", async (button, type, label) => {
    show();

    await userEvent.click(screen.getByRole("button", { name: button }));

    const card = cards()[0];
    expect(card.getAttribute("data-toast-type")).toBe(type);
    expect(within(card as HTMLElement).getByText(label)).toBeInTheDocument();
  });

  it("is announced as an alert when it is an error, and as a status otherwise", async () => {
    show();

    await userEvent.click(screen.getByRole("button", { name: "Fail" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("carries no colour or icon of its own - the label is the only difference", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const success = cards()[0].className;

    await userEvent.click(screen.getByRole("button", { name: "Fail" }));
    const error = cards()[1].className;

    expect(error).toBe(success);
    expect(success).toContain("bg-white");
  });
});

describe("several toasts", () => {
  it("stack in the order they were raised", async () => {
    show();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Fail" }));

    expect(cards().map((c) => c.getAttribute("data-toast-type"))).toEqual(["success", "error"]);
  });

  it("are dismissed one at a time, leaving the others standing", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Fail" }));

    await userEvent.click(within(cards()[0] as HTMLElement).getByRole("button", { name: "Dismiss" }));

    expect(cards()).toHaveLength(1);
    expect(cards()[0].getAttribute("data-toast-type")).toBe("error");
  });

  it("can be dismissed by the id showToast handed back", async () => {
    show();

    await userEvent.click(screen.getByRole("button", { name: "Show and dismiss" }));

    expect(cards()).toHaveLength(0);
  });
});

describe("the four-second life", () => {
  // fireEvent, not userEvent: userEvent waits on real time between its steps, and under
  // vi.useFakeTimers() that wait never comes back. fireEvent is synchronous, which is also what
  // lets the boundary be asserted to the millisecond.
  const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
  const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  it("clears the card at 4000ms, and not before", () => {
    vi.useFakeTimers();
    show();
    click("Save");
    expect(cards()).toHaveLength(1);

    tick(3999);
    expect(cards()).toHaveLength(1);

    tick(1);
    expect(cards()).toHaveLength(0);
  });

  it("times each card from when it was raised", () => {
    vi.useFakeTimers();
    show();
    click("Save");
    tick(2000);
    click("Fail");

    tick(2000);
    expect(cards().map((c) => c.getAttribute("data-toast-type"))).toEqual(["error"]);

    tick(2000);
    expect(cards()).toHaveLength(0);
  });
});

describe("useToast", () => {
  it("refuses to be used outside the provider, and says so", () => {
    function Orphan() {
      useToast();
      return null;
    }
    // React logs the thrown render; the message is the point, not the noise.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<Orphan />)).toThrow("useToast must be used within <ToastProvider>");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("defaults the type to success", async () => {
    function Bare() {
      const { showToast } = useToast();
      return (
        <button type="button" onClick={() => showToast("No type given")}>
          Go
        </button>
      );
    }
    render(<ToastProvider><Bare /></ToastProvider>);

    await userEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(cards()[0].getAttribute("data-toast-type")).toBe("success" satisfies ToastType);
  });
});
