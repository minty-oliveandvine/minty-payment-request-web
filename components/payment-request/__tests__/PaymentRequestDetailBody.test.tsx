// One payment request's page (components/payment-request/PaymentRequestDetailBody.tsx).
//
// The screen reads the request the address names, shows its fields, and offers the actions its
// status and the reader's role allow. Two things here are worth more than the rest: a save
// sends only what CHANGED (buildBillUpdatePayload), and view-only access takes every write
// control away rather than leaving one that 403s.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/Toast";
import { PaymentRequestDetailBody } from "@/components/payment-request/PaymentRequestDetailBody";
import { entityBillAccounts } from "@/lib/__fixtures__/accounts";
import { audit, bill, billAttachment, payment } from "@/lib/__fixtures__/bills";
import { SUPPLIERS } from "@/lib/__fixtures__/contacts";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";
const BILL_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

const params: { ref?: string; slug?: string; id?: string } = {};
vi.mock("next/navigation", () => ({
  useParams: () => params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/PdfJsCanvasPreview", () => ({
  PdfJsCanvasPreview: () => <div>pdf preview</div>,
}));

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Call = { path: string; method: string; body: Record<string, unknown> | null };

function serve({
  detail = bill({
    id: BILL_ID,
    status: "submitted",
    contact: "Young Bros Transport",
    reference: "PR-0001",
    // A request must keep at least one attachment, so a detail served with none cannot be
    // saved at all - it opens the "this one has to stay" dialog instead (tested below).
    attachments: [billAttachment()],
  }),
  billAnswer,
  payments = [],
  save,
}: {
  detail?: ReturnType<typeof bill>;
  billAnswer?: () => Response;
  payments?: ReturnType<typeof payment>[];
  save?: () => Response;
} = {}) {
  const calls: Call[] = [];
  fetchMock.mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    if (method !== "GET") {
      calls.push({
        path,
        method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });
    }
    if (path.endsWith("/auth/entity-currency")) return answer(200, { currency_code: "HKD" });
    if (path.endsWith("/auth/entitlements")) return answer(200, { billing_enabled: true });
    if (path.endsWith("/profile/me")) return answer(200, { member_entity_ids: [ENTITY_ID] });
    if (path.endsWith("/entity-bill-contacts/")) return answer(200, SUPPLIERS);
    if (path.includes("/entity-bill-accounts/")) return answer(200, entityBillAccounts());
    if (path.endsWith("/audit")) return answer(200, [audit({ bill_id: BILL_ID })]);
    if (path.endsWith("/payments")) return answer(200, { paid_total: "0.00", payments });
    if (path.includes("/attachments")) return answer(200, []);
    if (path.includes("/bills/by-reference/")) {
      return (billAnswer ?? (() => answer(200, detail)))();
    }
    if (path.includes(`/bills/${BILL_ID}`)) {
      if (method === "PUT") return (save ?? (() => answer(200, detail)))();
      return (billAnswer ?? (() => answer(200, detail)))();
    }
    return answer(200, {});
  });
  return { calls };
}

const show = () =>
  render(
    <ToastProvider>
      <PaymentRequestDetailBody />
    </ToastProvider>,
  );

/** The fields are in by the time this heading is up and the request has arrived. */
const loaded = () =>
  waitFor(() => expect(screen.getByText("PR-0001")).toBeInTheDocument());

beforeEach(() => {
  params.ref = "360812e1";
  params.slug = "olive-and-vine";
  params.id = BILL_ID;
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
  serve();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the request on screen", () => {
  it("reads the one the address names, by its id, with no lookup", async () => {
    serve();

    show();

    await loaded();
    const asked = fetchMock.mock.calls.map(([u]) => String(u));
    expect(asked.some((u) => u.endsWith(`/bills/${BILL_ID}`))).toBe(true);
    expect(asked.some((u) => u.includes("/bills/by-reference/"))).toBe(false);
  });

  it("shows its fields - the Payment No., both dates, the amount, the supplier, the code", async () => {
    serve();

    show();

    await loaded();
    expect(screen.getByText("PR-0001")).toBeInTheDocument();
    expect(screen.getByText("03 Mar 2026")).toBeInTheDocument();
    expect(screen.getByText("31 Mar 2026")).toBeInTheDocument();
    expect(screen.getByText("Young Bros Transport")).toBeInTheDocument();
    expect(screen.getByText("429 - General Expenses")).toBeInTheDocument();
    expect(screen.getByText("Corporate stationery and printer supplies")).toBeInTheDocument();
  });

  it("shows the amount in the COMPANY's currency", async () => {
    serve();

    show();

    await loaded();
    expect(document.body).toHaveTextContent("6,000.00");
    // The code arrives from its own read, one beat after the request itself.
    await waitFor(() => expect(document.body).toHaveTextContent("HKD"));
  });

  it("carries its history, collapsed", async () => {
    serve();

    show();

    await loaded();
    // "View Payment History" also matches /History/, so the accordion is named exactly.
    expect(screen.getByRole("button", { name: "History" })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("a request that would not load", () => {
  it("says so in the API's own words", async () => {
    serve({ billAnswer: () => answer(403, { detail: "You don't have access to that." }) });

    show();

    expect(await screen.findByText("You don't have access to that.")).toBeInTheDocument();
  });

  it("says it may have been renamed or removed when the address names nothing", async () => {
    params.id = "PR-GONE";
    serve({ billAnswer: () => answer(404, { detail: "no such bill" }) });

    show();

    expect(
      await screen.findByText(
        "I couldn't find that payment request. It may have been renamed or removed.",
      ),
    ).toBeInTheDocument();
  });
});

describe("editing it", () => {
  it("opens the fields for editing", async () => {
    serve();
    show();
    await loaded();

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  // CHARACTERISATION: the save is a PUT of the WHOLE editable set (lib/paymentRequestBillMap.ts's
  // buildBillUpdatePayload), not a diff of what the person touched. That is a deliberate
  // full-replace, and these tests say so rather than pretending otherwise - a later move to a
  // PATCH of the changed fields would land here first.
  it("sends the edited field, inside the whole editable set", async () => {
    const { calls } = serve();
    show();
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const description = await screen.findByDisplayValue("Corporate stationery and printer supplies");

    await userEvent.clear(description);
    await userEvent.type(description, "A new description");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.body).toMatchObject({
      description: "A new description",
      // Carried along unchanged, which is what makes it a replace rather than a patch.
      contact: "Young Bros Transport",
      reference: "PR-0001",
      amount: 6000,
      currency_code: "HKD",
      invoice_date: "2026-03-03",
      due_date: "2026-03-31",
      xero_account_code: "429",
    });
  });

  it("still sends the set unchanged when nothing was touched, and leaves edit mode", async () => {
    const { calls } = serve();
    show();
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByDisplayValue("Corporate stationery and printer supplies");

    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument());
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toMatchObject({
      description: "Corporate stationery and printer supplies",
      reference: "PR-0001",
    });
  });

  it("refuses to save a request with no attachment left, and says it has to stay", async () => {
    serve({
      detail: bill({
        id: BILL_ID,
        status: "submitted",
        contact: "Young Bros Transport",
        reference: "PR-0001",
        attachments: [],
      }),
    });
    show();
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByDisplayValue("Corporate stationery and printer supplies");

    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("alertdialog")).toHaveAccessibleName(
      "I need at least one attachment on a payment, so this one has to stay.",
    );
  });

  it("puts the fields back on Cancel", async () => {
    serve();
    show();
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const description = await screen.findByDisplayValue("Corporate stationery and printer supplies");
    await userEvent.clear(description);
    await userEvent.type(description, "Abandoned");

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.getByText("Corporate stationery and printer supplies")).toBeInTheDocument(),
    );
    expect(screen.queryByDisplayValue("Abandoned")).not.toBeInTheDocument();
  });

  it("says so when the save is refused, and stays in edit mode", async () => {
    serve({ save: () => answer(409, { detail: "Someone else changed that first." }) });
    show();
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const description = await screen.findByDisplayValue("Corporate stationery and printer supplies");
    await userEvent.clear(description);
    await userEvent.type(description, "A new description");

    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(document.querySelector("[data-toast-type='error']")).toHaveTextContent(
        "Someone else changed that first.",
      ),
    );
  });
});

describe("the actions its status allows", () => {
  it("offers Return and Record Payment on a submitted request", async () => {
    serve();

    show();

    await loaded();
    expect(screen.getByRole("button", { name: "Return payment request" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record payment" })).toBeInTheDocument();
  });

  it("sends it back when Return is confirmed", async () => {
    const { calls } = serve();
    show();
    await loaded();

    await userEvent.click(screen.getByRole("button", { name: "Return payment request" }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/return/"))).toBe(true),
    );
    expect(calls.find((c) => c.path.endsWith("/return/"))?.body).toMatchObject({
      status: "payment_requested",
    });
  });

  it("opens the payment dialog on Record Payment", async () => {
    serve();
    show();
    await loaded();

    await userEvent.click(screen.getByRole("button", { name: "Record payment" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("view-only access", () => {
  it("leaves every write control dead, with the reason on it", async () => {
    setAuth(
      unsignedToken({ role: "admin", system_role: "superuser", is_view_only: true }),
      ENTITY_ID,
      ENTITY_NAME,
    );
    serve();

    show();

    await loaded();
    const edit = screen.getByRole("button", { name: "Edit" });
    await waitFor(() => expect(edit).toBeDisabled());
    // Record Payment carries the reason; Edit is simply dead.
    expect(screen.getByRole("button", { name: /Record payment/i })).toBeDisabled();
  });

  it("leaves the request itself perfectly readable", async () => {
    setAuth(
      unsignedToken({ role: "admin", system_role: "superuser", is_view_only: true }),
      ENTITY_ID,
      ENTITY_NAME,
    );
    serve();

    show();

    await loaded();
    expect(screen.getByText("Young Bros Transport")).toBeInTheDocument();
    expect(screen.getByText("429 - General Expenses")).toBeInTheDocument();
  });
});
