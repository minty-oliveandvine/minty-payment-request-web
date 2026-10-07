// Recording a payment against a payment request
// (components/payment-request/RecordPaymentModal.tsx).
//
// The money rules are the point. Full Pay is only available before any partial payment exists,
// a payment may never exceed what is left, and the currency on every payload comes from the
// COMPANY's selected currency rather than the bill's own code or a default.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/Toast";
import { RecordPaymentModal } from "@/components/payment-request/RecordPaymentModal";
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
  create?: () => Response;
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

type Props = Parameters<typeof RecordPaymentModal>[0];

const show = (props: Partial<Props> = {}) =>
  render(
    <ToastProvider>
      <RecordPaymentModal
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

const dialog = () => screen.getByRole("dialog");
const amountField = () => within(dialog()).getByPlaceholderText("0.00");
const addPayment = () => within(dialog()).getByRole("button", { name: /Add Payment/ });
const fullPay = () => within(dialog()).getByRole("button", { name: "Full Pay" });
const partialPay = () => within(dialog()).getByRole("button", { name: "Partial Pay" });

/** The modal reads its payments on open; wait for that before acting. */
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

describe("the dialog", () => {
  it("names what is being paid, and what it comes to", async () => {
    show();

    await loadedPayments();
    expect(dialog()).toHaveTextContent("Corporate stationery");
    expect(dialog()).toHaveTextContent("HKD 6,000.00");
    expect(dialog()).toHaveTextContent("Amount to be Paid");
  });

  it("offers both ways to pay", async () => {
    show();

    await loadedPayments();
    expect(fullPay()).toBeInTheDocument();
    expect(partialPay()).toBeInTheDocument();
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
  it("posts what is left, in the COMPANY's currency", async () => {
    const { posted } = serve();
    show();
    await loadedPayments();

    await userEvent.click(fullPay());
    await userEvent.click(addPayment());

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toMatchObject({ amount: 6000, currency_code: "HKD", payment_status: "completed" });
  });

  it("tells the page a payment was saved, so the list and the badge catch up", async () => {
    serve();
    show();
    await loadedPayments();

    await userEvent.click(fullPay());
    await userEvent.click(addPayment());

    await waitFor(() => expect(onPaymentSaved).toHaveBeenCalled());
  });

  // Not offered rather than refused: the button goes dead and carries the reason, so the
  // guard inside handleAddPayment is a second line that the UI never reaches.
  it("is not offered once the request is partially paid, and says why", async () => {
    serve({
      payments: [payment({ id: "p1", bill_id: BILL_ID, amount: "1500.00" })],
      paidTotal: "1500.00",
    });
    show({ billStatus: "partially_paid" });
    await loadedPayments();

    expect(fullPay()).toBeDisabled();
    expect(fullPay()).toHaveAttribute(
      "title",
      "Full Pay isn't available once a payment's Partially Paid - Partial Pay will cover the rest.",
    );
  });

  it("is not offered when a payment already exists, whatever the status says", async () => {
    serve({
      payments: [payment({ id: "p1", bill_id: BILL_ID, amount: "1000.00" })],
      paidTotal: "1000.00",
    });
    show({ billStatus: "submitted" });
    await loadedPayments();

    expect(fullPay()).toBeDisabled();
    expect(fullPay()).toHaveAttribute(
      "title",
      "Full Pay only works before any partial payment is recorded - Partial Pay will cover the rest.",
    );
  });
});

describe("paying part of it", () => {
  it("posts the amount that was typed", async () => {
    const { posted } = serve();
    show();
    await loadedPayments();
    await userEvent.click(partialPay());

    await userEvent.type(amountField(), "1500");
    await userEvent.click(addPayment());

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toMatchObject({ amount: 1500, currency_code: "HKD" });
  });

  it("refuses more than what is left, and says what the maximum is", async () => {
    const { posted } = serve();
    show();
    await loadedPayments();
    await userEvent.click(partialPay());

    await userEvent.type(amountField(), "9000");
    await userEvent.click(addPayment());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That's a bit more than what's left - HKD 6,000.00 is the max.",
    );
    expect(posted).toHaveLength(0);
  });

  it("counts what is already paid when working out what is left", async () => {
    const { posted } = serve({
      payments: [payment({ id: "p1", bill_id: BILL_ID, amount: "5000.00" })],
      paidTotal: "5000.00",
    });
    show({ billStatus: "partially_paid" });
    await loadedPayments();
    await userEvent.click(partialPay());

    await userEvent.type(amountField(), "2000");
    await userEvent.click(addPayment());

    expect(await screen.findByRole("alert")).toHaveTextContent("HKD 1,000.00 is the max.");
    expect(posted).toHaveLength(0);
  });

  it("refuses nothing, and zero", async () => {
    const { posted } = serve();
    show();
    await loadedPayments();
    await userEvent.click(partialPay());

    await userEvent.click(addPayment());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That amount doesn't look quite right.",
    );

    await userEvent.type(amountField(), "0");
    await userEvent.click(addPayment());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That amount doesn't look quite right.",
    );
    expect(posted).toHaveLength(0);
  });

  it("clears the field afterwards, ready for the next instalment", async () => {
    serve();
    show();
    await loadedPayments();
    await userEvent.click(partialPay());
    await userEvent.type(amountField(), "1500");

    await userEvent.click(addPayment());

    await waitFor(() => expect(amountField()).toHaveValue(""));
  });
});

describe("a payment that would not save", () => {
  it("says so in the API's own words", async () => {
    serve({ create: () => answer(409, { detail: "Someone else paid this a moment ago." }) });
    show();
    await loadedPayments();

    await userEvent.click(fullPay());
    await userEvent.click(addPayment());

    await waitFor(() =>
      expect(document.querySelector("[data-toast-type='error']")?.textContent).toContain(
        "Someone else paid this a moment ago.",
      ),
    );
  });

  it("falls back to its own sentence when the failure is not the API's", async () => {
    serve({
      create: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    show();
    await loadedPayments();

    await userEvent.click(fullPay());
    await userEvent.click(addPayment());

    await waitFor(() =>
      expect(document.querySelector("[data-toast-type='error']")?.textContent).toContain(
        "That payment didn't quite go through. Mind trying again?",
      ),
    );
  });
});

describe("the payments already recorded", () => {
  it("are listed, with what is left to pay", async () => {
    serve({
      payments: [payment({ id: "p1", bill_id: BILL_ID, amount: "1500.00", payment_date: "2026-03-10" })],
      paidTotal: "1500.00",
    });

    show({ billStatus: "partially_paid" });

    await loadedPayments();
    expect(dialog()).toHaveTextContent("1,500.00");
  });

  it("can be removed by somebody allowed to", async () => {
    serve({
      payments: [payment({ id: "p1", bill_id: BILL_ID, amount: "1500.00" })],
      paidTotal: "1500.00",
    });

    show({ billStatus: "partially_paid" });

    await loadedPayments();
    expect(within(dialog()).getByRole("button", { name: "Remove this payment" })).toBeEnabled();
  });

  it("cannot be removed by somebody who may not", async () => {
    setAuth(unsignedToken({ role: "cashier", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
    serve({
      payments: [payment({ id: "p1", bill_id: BILL_ID, amount: "1500.00" })],
      paidTotal: "1500.00",
    });

    show({ billStatus: "partially_paid" });

    await loadedPayments();
    expect(within(dialog()).queryByRole("button", { name: "Remove this payment" })).not.toBeInTheDocument();
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
    expect(within(dialog()).queryByRole("button", { name: /Add Payment/ })).not.toBeInTheDocument();
    expect(within(dialog()).queryByRole("button", { name: "Full Pay" })).not.toBeInTheDocument();
  });
});
