// Recording a payment against a payment request - the Part 15.17 Drawer
// (components/payment-request/RecordPaymentDrawer.tsx, D15-11).
//
// The money rules are the point. Pay in full is only available before any part payment exists,
// a payment may never exceed what is unpaid (the browser says so AS YOU TYPE - CLAUDE.md's
// validation rule - and the server refuses anyway), and the currency on every payload is the
// COMPANY's selected currency rather than the bill's own code or a default. Part 15.2: the
// Primary names the amount and guards against a double submit; a refusal stays in the drawer.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/Toast";
import { RecordPaymentDrawer } from "@/components/payment-request/RecordPaymentDrawer";
import { payment } from "@/lib/__fixtures__/bills";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";
const BILL_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

vi.mock("next/navigation", () => ({
  useParams: () => ({ ref: "360812e1", slug: "olive-and-vine" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/PdfJsCanvasPreview", () => ({
  PdfJsCanvasPreview: () => <div>pdf preview</div>,
}));

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Posted = { path: string; method: string; body: Record<string, unknown> | null };

function serve({
  payments = [],
  paidTotal = "0.00",
  create,
}: {
  payments?: ReturnType<typeof payment>[];
  paidTotal?: string;
  create?: () => Response | Promise<Response>;
} = {}) {
  const posted: Posted[] = [];
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const method = init?.method ?? "GET";
    if (path.endsWith("/auth/entity-currency")) return answer(200, { currency_code: "HKD" });
    if (path.endsWith("/auth/entitlements")) return answer(200, { billing_enabled: true });
    if (path.endsWith("/profile/me")) return answer(200, { member_entity_ids: [ENTITY_ID] });
    if (path.endsWith("/payments") && method === "GET") {
      return answer(200, { paid_total: paidTotal, payments });
    }
    if (path.endsWith("/payments") && method === "POST") {
      posted.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      return (create ?? (() => answer(201, payment())))();
    }
    if (method === "DELETE" || method === "PUT") {
      posted.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      return answer(200, {});
    }
    if (path.includes("/attachments")) return answer(200, []);
    return answer(200, {});
  });
  return { posted };
}

const onPaymentSaved = vi.fn();
const onClose = vi.fn();

type Props = Parameters<typeof RecordPaymentDrawer>[0];

const show = (props: Partial<Props> = {}) =>
  render(
    <ToastProvider>
      <RecordPaymentDrawer
        open
        onClose={onClose}
        billId={BILL_ID}
        billStatus="submitted"
        invoiceAmount={6000}
        contactTitle="Young Bros Transport"
        description="Corporate stationery"
        onPaymentSaved={onPaymentSaved}
        {...props}
      />
    </ToastProvider>,
  );

const drawer = () => screen.getByRole("dialog", { name: /Record payment|Payments/ });
const amountField = () => within(drawer()).getByRole("textbox", { name: /Payment amount/ });
const record = () => within(drawer()).getByRole("button", { name: /^Record/ });
const fullPay = () => within(drawer()).getByRole("radio", { name: "Pay in full" });
const partPay = () => within(drawer()).getByRole("radio", { name: "Part payment" });

/** The drawer reads its payments on open; wait for that before acting. */
const loadedPayments = () =>
  waitFor(() => expect(screen.queryByRole("status", { name: "Loading payments" })).not.toBeInTheDocument());

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
  serve();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the drawer", () => {
  it("names what is being paid, and what is owed", async () => {
    show();

    await loadedPayments();
    expect(drawer()).toHaveTextContent("Young Bros Transport");
    expect(drawer()).toHaveTextContent("Corporate stationery");
    expect(drawer()).toHaveTextContent("Invoice amount");
    expect(drawer()).toHaveTextContent("HKD 6,000.00");
    expect(drawer()).toHaveTextContent("Unpaid");
  });

  it("offers both ways to pay, and a Primary that names the amount", async () => {
    show();

    await loadedPayments();
    expect(fullPay()).toHaveAttribute("aria-checked", "true");
    expect(partPay()).toBeInTheDocument();
    expect(record()).toHaveAccessibleName("Record HKD 6,000.00");
  });

  it("reads the payments already on the request", async () => {
    serve({ payments: [payment({ id: "p1", bill_id: BILL_ID, amount: "1500.00" })], paidTotal: "1500.00" });

    show();

    await loadedPayments();
    const asked = fetchMock.mock.calls.map(([u]) => String(u));
    expect(asked.some((u) => u.endsWith(`/bills/${BILL_ID}/payments`))).toBe(true);
  });
});

describe("paying in full", () => {
  it("posts what is unpaid, in the COMPANY's currency", async () => {
    const { posted } = serve();
    show();
    await loadedPayments();

    await userEvent.click(record());

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toMatchObject({ amount: 6000, currency_code: "HKD", payment_status: "completed" });
  });

  it("tells the page a payment was saved, and says so in a toast", async () => {
    serve();
    show();
    await loadedPayments();

    await userEvent.click(record());

    await waitFor(() => expect(onPaymentSaved).toHaveBeenCalled());
    expect(await screen.findByText("Payment of HKD 6,000.00 recorded for Young Bros Transport.")).toBeInTheDocument();
  });

  it("cannot be sent twice while the first is in flight", async () => {
    let release!: () => void;
    const { posted } = serve({
      create: () => new Promise<Response>((r) => (release = () => r(answer(201, payment())))),
    });
    show();
    await loadedPayments();

    await userEvent.click(record());
    const busy = within(drawer()).getByRole("button", { name: "Recording…" });
    expect(busy).toBeDisabled();
    await userEvent.click(busy);
    release();

    await waitFor(() => expect(onPaymentSaved).toHaveBeenCalled());
    expect(posted).toHaveLength(1);
  });

  it("is not offered once part of it is paid, and says why", async () => {
    serve({
      payments: [payment({ id: "p1", bill_id: BILL_ID, amount: "1500.00" })],
      paidTotal: "1500.00",
    });
    show({ billStatus: "partially_paid" });
    await loadedPayments();

    expect(fullPay()).toBeDisabled();
    expect(partPay()).toHaveAttribute("aria-checked", "true");
    expect(drawer()).toHaveTextContent("Part of this is paid already, so record the rest as a part payment.");
  });
});

describe("paying part of it", () => {
  it("posts the amount that was typed", async () => {
    const { posted } = serve();
    show();
    await loadedPayments();
    await userEvent.click(partPay());

    await userEvent.type(amountField(), "1500");
    expect(drawer()).toHaveTextContent("Unpaid after this payment: HKD 4,500.00");
    await userEvent.click(record());

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toMatchObject({ amount: 1500, currency_code: "HKD" });
  });

  it("says the limit AS YOU TYPE past it, and clears it the moment it fits", async () => {
    const { posted } = serve();
    show();
    await loadedPayments();
    await userEvent.click(partPay());

    await userEvent.type(amountField(), "9000");
    expect(amountField()).toHaveAccessibleDescription("Enter HKD 6,000.00 or less - that is what is unpaid.");
    expect(amountField()).toHaveAttribute("aria-invalid", "true");
    expect(record()).toBeDisabled();

    await userEvent.clear(amountField());
    await userEvent.type(amountField(), "900");
    expect(amountField()).not.toHaveAttribute("aria-invalid");
    expect(posted).toHaveLength(0);
  });

  it("counts what is already paid when working out what is left", async () => {
    serve({
      payments: [payment({ id: "p1", bill_id: BILL_ID, amount: "5000.00" })],
      paidTotal: "5000.00",
    });
    show({ billStatus: "partially_paid" });
    await loadedPayments();

    await userEvent.type(amountField(), "2000");

    expect(amountField()).toHaveAccessibleDescription("Enter HKD 1,000.00 or less - that is what is unpaid.");
  });

  it("asks for an amount when there is none, after the attempt - not before", async () => {
    const { posted } = serve();
    show();
    await loadedPayments();
    await userEvent.click(partPay());
    expect(amountField()).not.toHaveAttribute("aria-invalid");

    await userEvent.click(record());

    expect(amountField()).toHaveAccessibleDescription(
      "The amount is still empty. Add the amount you paid to continue.",
    );
    expect(amountField()).toHaveFocus();
    expect(posted).toHaveLength(0);
  });

  it("clears the field afterwards, ready for the next instalment", async () => {
    serve();
    show();
    await loadedPayments();
    await userEvent.click(partPay());
    await userEvent.type(amountField(), "1500");

    await userEvent.click(record());

    await waitFor(() => expect(amountField()).toHaveValue(""));
  });

  it("asks before Escape throws a typed amount away", async () => {
    serve();
    show();
    await loadedPayments();
    await userEvent.click(partPay());
    await userEvent.type(amountField(), "1500");

    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("alertdialog", { name: "Discard this payment?" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Discard payment" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("a payment that would not save", () => {
  it("says so in the API's own words, in the drawer - not a toast", async () => {
    serve({ create: () => answer(409, { detail: "Someone else paid this a moment ago." }) });
    show();
    await loadedPayments();

    await userEvent.click(record());

    expect(await within(drawer()).findByRole("alert")).toHaveTextContent("Someone else paid this a moment ago.");
    expect(document.querySelector("[data-toast-type='error']")).toBeNull();
  });

  it("falls back to its own sentence when the failure is not the API's", async () => {
    serve({
      create: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    show();
    await loadedPayments();

    await userEvent.click(record());

    expect(await within(drawer()).findByRole("alert")).toHaveTextContent(
      "That payment didn't go through. Try recording it again.",
    );
  });
});

describe("the payments already recorded", () => {
  it("are listed", async () => {
    serve({
      payments: [payment({ id: "p1", bill_id: BILL_ID, amount: "1500.00", payment_date: "2026-03-10" })],
      paidTotal: "1500.00",
    });

    show({ billStatus: "partially_paid" });

    await loadedPayments();
    expect(drawer()).toHaveTextContent("1,500.00");
  });

  it("can be removed by somebody allowed to", async () => {
    serve({
      payments: [payment({ id: "p1", bill_id: BILL_ID, amount: "1500.00" })],
      paidTotal: "1500.00",
    });

    show({ billStatus: "partially_paid" });

    await loadedPayments();
    expect(within(drawer()).getByRole("button", { name: "Remove this payment" })).toBeEnabled();
  });

  it("cannot be removed by somebody who may not", async () => {
    setAuth(unsignedToken({ role: "cashier", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
    serve({
      payments: [payment({ id: "p1", bill_id: BILL_ID, amount: "1500.00" })],
      paidTotal: "1500.00",
    });

    show({ billStatus: "partially_paid" });

    await loadedPayments();
    expect(within(drawer()).queryByRole("button", { name: "Remove this payment" })).not.toBeInTheDocument();
  });
});

describe("read-only", () => {
  it("offers no way to add a payment at all", async () => {
    serve({
      payments: [payment({ id: "p1", bill_id: BILL_ID, amount: "1500.00" })],
      paidTotal: "1500.00",
    });

    show({ readOnly: true });

    await loadedPayments();
    expect(screen.getByRole("dialog", { name: "Payments" })).toBeInTheDocument();
    expect(within(drawer()).queryByRole("button", { name: /^Record/ })).not.toBeInTheDocument();
    expect(within(drawer()).queryByRole("radio", { name: "Pay in full" })).not.toBeInTheDocument();
  });
});
