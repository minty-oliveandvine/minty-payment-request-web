// The request opened inside easy view (components/payment-request/EasyViewDraftDetailBody.tsx):
// a draft that can be edited and submitted, and a settled one that can only be read.
//
// Two exports, one file, and the difference between them is the point - the read-only body must
// offer no field to type in at all.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/Toast";
import {
  EasyViewDraftDetailBody,
  EasyViewReadonlyBillDetailBody,
} from "@/components/payment-request/EasyViewDraftDetailBody";
import { entityBillAccounts } from "@/lib/__fixtures__/accounts";
import { bill, billAttachment } from "@/lib/__fixtures__/bills";
import { SUPPLIERS } from "@/lib/__fixtures__/contacts";
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

type Call = { path: string; method: string; body: Record<string, unknown> | null };

function serve({
  detail = bill({
    id: BILL_ID,
    status: "draft",
    contact: "Young Bros Transport",
    reference: "PR-0001",
    attachments: [billAttachment()],
  }),
  billAnswer,
}: { detail?: ReturnType<typeof bill>; billAnswer?: () => Response } = {}) {
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
    if (path.endsWith("/payments")) return answer(200, { paid_total: "0.00", payments: [] });
    if (path.includes("/attachments")) return answer(200, []);
    if (path.includes(`/bills/${BILL_ID}`)) return (billAnswer ?? (() => answer(200, detail)))();
    return answer(200, {});
  });
  return { calls };
}

const onRequestDelete = vi.fn();
const onRequestVoidBill = vi.fn();

const showDraft = (props: Partial<Parameters<typeof EasyViewDraftDetailBody>[0]> = {}) =>
  render(
    <ToastProvider>
      <EasyViewDraftDetailBody
        billId={BILL_ID}
        actions={{ onRequestDelete, deleteDisabled: false }}
        isElevated
        isViewOnly={false}
        {...props}
      />
    </ToastProvider>,
  );

const showReadonly = (props: Partial<Parameters<typeof EasyViewReadonlyBillDetailBody>[0]> = {}) =>
  render(
    <ToastProvider>
      <EasyViewReadonlyBillDetailBody
        billId={BILL_ID}
        listStatus="Paid"
        isElevated
        isViewOnly={false}
        onRequestVoidBill={onRequestVoidBill}
        {...props}
      />
    </ToastProvider>,
  );

const loaded = () => waitFor(() => expect(screen.getByText("PR-0001")).toBeInTheDocument());

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
  serve();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a draft opened in the list", () => {
  it("reads the request and shows its fields", async () => {
    serve();

    showDraft();

    await loaded();
    expect(screen.getByText("Young Bros Transport")).toBeInTheDocument();
    expect(screen.getByText("429 - General Expenses")).toBeInTheDocument();
  });

  it("reads it by its id", async () => {
    serve();

    showDraft();

    await loaded();
    expect(
      fetchMock.mock.calls.map(([u]) => String(u)).some((u) => u.endsWith(`/bills/${BILL_ID}`)),
    ).toBe(true);
  });

  it("says so in the API's own words when it will not load", async () => {
    serve({ billAnswer: () => answer(403, { detail: "You don't have access to that." }) });

    showDraft();

    expect(await screen.findByText("You don't have access to that.")).toBeInTheDocument();
  });

  it("offers a way to delete it, and reports the request to the list", async () => {
    serve();
    showDraft();
    await loaded();

    const remove = screen.getAllByRole("button", { name: /Delete/i })[0];
    await userEvent.click(remove);

    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it("will not offer the delete while the list is busy with one", async () => {
    serve();

    showDraft({ actions: { onRequestDelete, deleteDisabled: true } });

    await loaded();
    expect(screen.getAllByRole("button", { name: /Delete/i })[0]).toBeDisabled();
  });
});

describe("a settled request opened in the list", () => {
  it("shows its fields with nothing to type in", async () => {
    serve({
      detail: bill({
        id: BILL_ID,
        status: "paid",
        contact: "Paid In Full Co",
        reference: "PR-0001",
        attachments: [billAttachment()],
      }),
    });

    showReadonly();

    await loaded();
    expect(screen.getByText("Paid In Full Co")).toBeInTheDocument();
    // Read-only means read-only: no input, no textarea, no select to change anything with.
    expect(document.querySelectorAll("input:not([type='checkbox']), textarea")).toHaveLength(0);
  });

  it("offers the void to somebody allowed to, and reports it", async () => {
    serve({
      detail: bill({
        id: BILL_ID,
        status: "returned",
        contact: "Returned Supplies Ltd",
        reference: "PR-0001",
        attachments: [billAttachment()],
      }),
    });

    showReadonly({ listStatus: "Returned" });

    await loaded();
    // The paid/returned action bar only appears for those two statuses.
    const voidButton = screen.getAllByRole("button", { name: /Void/i })[0];

    await userEvent.click(voidButton);

    expect(onRequestVoidBill).toHaveBeenCalledTimes(1);
  });

  it("carries no action bar for a status that has no actions", async () => {
    serve({
      detail: bill({
        id: BILL_ID,
        status: "submitted",
        contact: "Young Bros Transport",
        reference: "PR-0001",
        attachments: [billAttachment()],
      }),
    });

    showReadonly({ listStatus: "Payment Requested" });

    await loaded();
    expect(screen.queryByRole("button", { name: /Void/i })).not.toBeInTheDocument();
  });

  it("says so in the API's own words when it will not load", async () => {
    serve({ billAnswer: () => answer(500, { detail: "boom" }) });

    showReadonly();

    expect(
      await screen.findByText("Something went wrong on my end. Mind trying again?"),
    ).toBeInTheDocument();
  });
});

describe("the supplier on edit", () => {
  // Owner's decision: a pick from the list is needed only when the supplier text changed.
  const PICK = "Pick the supplier from the list, or add them as a new supplier.";
  const OLD_BILL = bill({
    id: BILL_ID,
    status: "draft",
    contact: "Young Bros Transport",
    reference: "PR-0001",
    xero_contact_id: "", // an older request saved before suppliers came from Xero
    attachments: [billAttachment()],
  });
  const supplierField = () => screen.getByPlaceholderText("Select a supplier");
  const startEditing = async () => {
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByDisplayValue("Young Bros Transport");
  };

  it("saves an untouched older request that has no Xero supplier", async () => {
    const { calls } = serve({ detail: OLD_BILL });
    showDraft();
    await startEditing();

    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(screen.queryByText(PICK)).not.toBeInTheDocument();
  });

  it("saves a changed supplier that was picked from the list", async () => {
    const { calls } = serve({ detail: OLD_BILL });
    showDraft();
    await startEditing();

    await userEvent.clear(supplierField());
    await userEvent.type(supplierField(), "ABC");
    await userEvent.click(await screen.findByRole("option", { name: "ABC Furniture" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({
      contact: "ABC Furniture",
      xero_contact_id: "XERO-2",
    });
  });

  it("refuses a changed supplier that was typed but not picked, and says so", async () => {
    const { calls } = serve({ detail: OLD_BILL });
    showDraft();
    await startEditing();

    await userEvent.clear(supplierField());
    await userEvent.type(supplierField(), "Someone Unlisted");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByText(PICK)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });
});

describe("editing a draft for a company whose currency has no decimal places (JPY)", () => {
  it("shows and sends the amount with no decimals", async () => {
    const { calls } = serve();
    const inner = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      new URL(String(input)).pathname.endsWith("/auth/entity-currency")
        ? answer(200, { currency_code: "JPY", decimal_places: 0 })
        : inner(input, init),
    );
    vi.resetModules();
    const [{ EasyViewDraftDetailBody: Body }, { ToastProvider: Toasts }, { setAuth: auth }] =
      await Promise.all([
        import("@/components/payment-request/EasyViewDraftDetailBody"),
        import("@/components/Toast"),
        import("@/lib/auth"),
      ]);
    auth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
    render(
      <Toasts>
        <Body
          billId={BILL_ID}
          actions={{ onRequestDelete, deleteDisabled: false }}
          isElevated
          isViewOnly={false}
        />
      </Toasts>,
    );
    await loaded();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/auth/entity-currency"))).toBe(
        true,
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const amount = await screen.findByDisplayValue("6,000");

    await userEvent.type(amount, ".5");
    expect(amount).toHaveValue("60,005");
    await userEvent.clear(amount);
    await userEvent.type(amount, "1234");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.body).toMatchObject({ amount: "1234" });
  });
});
