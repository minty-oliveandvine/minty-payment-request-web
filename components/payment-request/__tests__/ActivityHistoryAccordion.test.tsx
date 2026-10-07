// The audit trail on a payment request (components/payment-request/ActivityHistoryAccordion.tsx).
//
// The read is keyed by what was asked for - the bill, its reference, the refresh signal and the
// retry count - so a stale answer can never be mistaken for the current one. These tests pin
// that through what is shown rather than through the key itself.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityHistoryAccordion } from "@/components/payment-request/ActivityHistoryAccordion";
import { audit } from "@/lib/__fixtures__/bills";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";
const BILL_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const show = (props: Partial<Parameters<typeof ActivityHistoryAccordion>[0]> = {}) =>
  render(<ActivityHistoryAccordion billId={BILL_ID} billRef="PR-0001" {...props} />);

const header = () => screen.getByRole("button", { name: /History/ });
const list = () => screen.getByRole("region", { name: "Activity history list" });
const auditCalls = () =>
  fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.endsWith("/audit"));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin" }), ENTITY_ID, ENTITY_NAME);
  fetchMock.mockImplementation(async () =>
    answer(200, [
      audit({ id: "a1", action: "created", detail: "Payment request created", date: "2026-03-03T02:00:00Z" }),
      audit({ id: "a2", action: "submitted", detail: "", date: "2026-03-04T02:00:00Z", user_name: "Olive Vine" }),
    ]),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the accordion", () => {
  it("starts closed", () => {
    show();

    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Activity history list" })).not.toBeInTheDocument();
  });

  it("opens and closes again", async () => {
    show();

    await userEvent.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "false");
  });
});

describe("the read", () => {
  it("happens once for the request", async () => {
    show();

    await waitFor(() => expect(auditCalls()).toHaveLength(1));
    expect(auditCalls()[0]).toContain(`/bills/${BILL_ID}/audit`);
  });

  it("is not repeated when the accordion is opened and closed again", async () => {
    show();
    await waitFor(() => expect(auditCalls()).toHaveLength(1));

    await userEvent.click(header());
    await userEvent.click(header());
    await userEvent.click(header());

    expect(auditCalls()).toHaveLength(1);
  });

  it("does not happen at all without a request to read", async () => {
    show({ billId: "" });

    await userEvent.click(header());

    expect(auditCalls()).toHaveLength(0);
  });

  it("happens again when the page says something changed", async () => {
    const view = show({ refreshSignal: 0 });
    await waitFor(() => expect(auditCalls()).toHaveLength(1));

    view.rerender(<ActivityHistoryAccordion billId={BILL_ID} billRef="PR-0001" refreshSignal={1} />);

    await waitFor(() => expect(auditCalls()).toHaveLength(2));
  });
});

describe("what it shows", () => {
  it("is one entry per audit row, with who did what", async () => {
    show();
    await userEvent.click(header());

    await waitFor(() => expect(list()).toBeInTheDocument());
    expect(within(list()).getByText(/created/)).toBeInTheDocument();
    expect(within(list()).getAllByText(/Olive Vine/).length).toBeGreaterThan(0);
  });

  it("names the payment request the entry is about", async () => {
    show();
    await userEvent.click(header());

    await waitFor(() => expect(list()).toBeInTheDocument());
    expect(within(list()).getAllByText(/PR-0001/).length).toBeGreaterThan(0);
  });

  it("falls back to a short id when the request has no Payment No.", async () => {
    show({ billRef: "" });
    await userEvent.click(header());

    await waitFor(() => expect(list()).toBeInTheDocument());
    expect(within(list()).getAllByText(new RegExp(`#${BILL_ID.slice(0, 8)}`)).length).toBeGreaterThan(0);
  });

  it("says it is loading rather than showing an empty trail", async () => {
    // Initialised rather than left null: TypeScript cannot see the executor's assignment, so a
    // `null` start narrows the call site to `never`.
    let release = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(answer(200, []));
        }),
    );
    show();

    await userEvent.click(header());

    expect(screen.getByRole("status", { name: "Loading history" })).toBeInTheDocument();
    release();
  });

  it("says so plainly when there is no history", async () => {
    fetchMock.mockImplementation(async () => answer(200, []));
    show();

    await userEvent.click(header());

    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
  });
});

describe("a history that did not load", () => {
  it("says so and offers to try again", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      fetchMock.mockImplementation(async () => answer(500, { detail: "boom" }));
      show();

      await userEvent.click(header());

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("I couldn't load the history. Mind trying again?");
      expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("reads again when asked, and shows what came back", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let attempt = 0;
      fetchMock.mockImplementation(async () => {
        attempt += 1;
        if (attempt === 1) return answer(500, { detail: "boom" });
        return answer(200, [audit({ id: "a1", action: "created", detail: "Payment request created" })]);
      });
      show();
      await userEvent.click(header());
      const alert = await screen.findByRole("alert");

      await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));

      await waitFor(() => expect(list()).toBeInTheDocument());
      expect(auditCalls()).toHaveLength(2);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("says why on the console - a missing trail is never a silent one", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      fetchMock.mockImplementation(async () => answer(500, { detail: "boom" }));
      show();
      await userEvent.click(header());
      await screen.findByRole("alert");

      expect(
        consoleError.mock.calls.some(([first]) =>
          String(first).includes("[payment request] the history did not load"),
        ),
      ).toBe(true);
    } finally {
      consoleError.mockRestore();
    }
  });
});
