// The invoice reader in the Add Payment dialog (owner, 2026-11-04): an attached invoice is read
// (`POST /bills/extract/`, lib/invoiceReader.ts) and the form's EMPTY fields are filled as
// suggestions - or a field still at its untouched default (today's date, the default account).
// What the person set is never overwritten; a failed read says so in one quiet line.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentRequestModal } from "@/components/PaymentRequestModal";
import { ToastProvider } from "@/components/Toast";
import { bill } from "@/lib/__fixtures__/bills";
import { SUPPLIERS } from "@/lib/__fixtures__/contacts";
import { entityBillAccount, entityBillAccounts } from "@/lib/__fixtures__/accounts";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { INVOICE_LATCH } from "@/lib/invoiceReader";
import { todayLocalISODate, formatIsoDateAsDdMmmYyyy } from "@/lib/dateDisplayFormat";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";

vi.mock("next/navigation", () => ({
  useParams: () => ({ ref: "360812e1", slug: "olive-and-vine" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/PdfJsCanvasPreview", () => ({
  PdfJsCanvasPreview: () => <div>pdf preview</div>,
}));

const fetchMock = vi.fn<typeof fetch>();
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const field = (value: string, band: "high" | "medium" | "low" = "high", extra = {}) => ({
  value,
  confidence: band === "high" ? 0.95 : band === "medium" ? 0.7 : 0.3,
  band,
  applied: band !== "low" && value !== "",
  ...extra,
});

const READ = {
  suggestions: {
    supplier: field("ABC Furniture", "high", { contact_id: "XERO-2" }),
    account: field("429 - General Expenses", "medium", { code: "429", name: "General Expenses" }),
    amount: field("1200.50"),
    description: field("Office chairs"),
    invoice_date: field("2026-10-20"),
    due_date: field("2026-11-19"),
    currency: "HKD",
    entity_currency: "HKD",
  },
  reason: null,
};

type Seen = { extracts: FormData[]; submits: unknown[] };

function serve({
  extract = () => json(200, READ),
  accounts = entityBillAccounts(),
}: { extract?: () => Response | Promise<Response>; accounts?: unknown[] } = {}): Seen {
  const seen: Seen = { extracts: [], submits: [] };
  fetchMock.mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/auth/entity-currency")) return json(200, { currency_code: "HKD" });
    if (path.endsWith("/entity-bill-contacts/")) return json(200, SUPPLIERS);
    if (path.includes("/entity-bill-accounts/")) return json(200, accounts);
    if (path.endsWith("/bills/suggested-reference/")) return json(200, { reference: "MBIOVI-1" });
    if (path.endsWith("/bills/extract/")) {
      seen.extracts.push(init?.body as FormData);
      return extract();
    }
    if (path.endsWith("/bills/submit/")) {
      seen.submits.push(JSON.parse(String(init?.body)));
      return json(201, bill());
    }
    if (/\/attachments$/.test(path)) return json(201, []);
    return json(200, {});
  });
  return seen;
}

const show = () =>
  render(
    <ToastProvider>
      <PaymentRequestModal open onClose={vi.fn()} onConfirm={vi.fn()} onSaveDraft={vi.fn()} />
    </ToastProvider>,
  );
const dialog = () => screen.getAllByRole("dialog")[0];
const byId = (id: string) => document.getElementById(id) as HTMLInputElement;
const pdf = (name = "invoice.pdf") => new File(["%PDF-1.4"], name, { type: "application/pdf" });
const attach = (f: File) =>
  userEvent.upload(within(dialog()).getByLabelText("Choose files to attach"), f);
const shown = (iso: string) => formatIsoDateAsDdMmmYyyy(iso);
const FAILED = "I couldn't read this invoice. Enter the details yourself.";

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, "Olive & Vine");
  INVOICE_LATCH.reset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  INVOICE_LATCH.reset();
});

describe("the invoice reader", () => {
  it("reads an attached invoice and fills the empty fields, marked as suggestions", async () => {
    const seen = serve();
    show();
    await waitFor(() => expect(byId("pr-invoice-date").value).toBe(todayLocalISODate()));

    await attach(pdf());

    await waitFor(() => expect(byId("pr-amount")).toHaveValue("1,200.50"));
    expect((seen.extracts[0].get("invoice") as File).name).toBe("invoice.pdf");
    expect(byId("pr-due-date").value).toBe("2026-11-19");
    // today's date was the form's untouched default: it counts as empty
    expect(byId("pr-invoice-date").value).toBe("2026-10-20");
    expect(byId("pr-description")).toHaveValue("Office chairs");
    expect(byId("pr-contact")).toHaveValue("ABC Furniture");
    expect(byId("pr-account")).toHaveValue("429 - General Expenses");
    expect(byId("pr-amount")).toHaveAccessibleDescription("Suggested from the invoice.");
    expect(byId("pr-amount")).toHaveClass("ring-[#54D3DA]");
    expect(
      within(dialog()).getAllByText("Suggested from the invoice. Check it before you submit."),
    ).toHaveLength(1); // the medium-band account
    expect(screen.getByText(/Minty read the invoice and filled 6 fields/)).toBeInTheDocument();
  });

  it("never overwrites what the person set - a touched default included - but offers it", async () => {
    serve();
    show();
    await waitFor(() => expect(byId("pr-invoice-date").value).toBe(todayLocalISODate()));
    // picking a date and then today's again makes it the person's, though it ends where it began
    fireEvent.change(byId("pr-invoice-date"), { target: { value: "2026-10-01" } });
    fireEvent.change(byId("pr-invoice-date"), { target: { value: todayLocalISODate() } });
    await userEvent.type(byId("pr-amount"), "99");

    await attach(pdf());

    const note = await screen.findByText(
      `The invoice reads ${shown("2026-10-20")}, not ${shown(todayLocalISODate())}.`,
    );
    expect(byId("pr-invoice-date").value).toBe(todayLocalISODate());
    expect(byId("pr-amount")).toHaveValue("99.00");
    expect(screen.getByText("The invoice reads 1,200.50, not 99.00.")).toBeInTheDocument();
    const box = note.parentElement as HTMLElement;
    await userEvent.click(
      within(box).getByRole("button", { name: "Use the value from the invoice" }),
    );
    expect(byId("pr-invoice-date").value).toBe("2026-10-20");
  });

  it("an untouched default account is replaced, and Clear puts the default back", async () => {
    serve({
      accounts: [
        { ...entityBillAccount({ code: "200", name: "Sales", active: true }, 0), is_default: true },
        entityBillAccount({ code: "429", name: "General Expenses", active: true }, 1),
      ],
    });
    show();
    await waitFor(() => expect(byId("pr-account")).toHaveValue("200 - Sales"));

    await attach(pdf());

    await waitFor(() => expect(byId("pr-account")).toHaveValue("429 - General Expenses"));
    const line = screen.getByText("Suggested from the invoice. Check it before you submit.");
    await userEvent.click(
      within(line.parentElement as HTMLElement).getByRole("button", {
        name: "Clear the suggested value for this field",
      }),
    );
    expect(byId("pr-account")).toHaveValue("200 - Sales");
  });

  it("Confirm sends what the form shows, the suggested supplier by its Xero id", async () => {
    const seen = serve();
    show();
    await attach(pdf());
    await waitFor(() => expect(byId("pr-amount")).toHaveValue("1,200.50"));

    await userEvent.click(screen.getByRole("button", { name: /^Confirm/ }));

    await waitFor(() => expect(seen.submits).toHaveLength(1));
    expect(seen.submits[0]).toMatchObject({
      contact: "ABC Furniture",
      xero_contact_id: "XERO-2",
      amount: "1200.50",
      invoice_date: "2026-10-20",
      due_date: "2026-11-19",
      xero_account_code: "429",
    });
  });

  it("a failed read says so in one quiet line; the form is untouched", async () => {
    serve({ extract: () => json(200, { suggestions: null, reason: "timeout" }) });
    show();
    await attach(pdf());

    expect(await screen.findByText(FAILED)).toHaveAttribute("role", "status");
    expect(byId("pr-amount")).toHaveValue("");
  });

  it("switched off, it says nothing and is not asked again this session", async () => {
    const seen = serve({ extract: () => json(200, { suggestions: null, reason: "disabled" }) });
    show();
    await attach(pdf("one.pdf"));
    await waitFor(() => expect(seen.extracts).toHaveLength(1));
    await attach(pdf("two.pdf"));

    expect(seen.extracts).toHaveLength(1);
    expect(screen.queryByText(FAILED)).toBeNull();
    expect(screen.queryByText("Minty is reading the invoice details.")).toBeNull();
  });

  it("an HTML attachment is not read", async () => {
    const seen = serve();
    show();
    await attach(new File(["<html>"], "invoice.html", { type: "text/html" }));
    await screen.findByRole("button", { name: "Remove invoice.html" });
    expect(seen.extracts).toHaveLength(0);
  });

  it("removing the file that was read takes its suggestions with it", async () => {
    serve();
    show();
    await attach(pdf());
    await waitFor(() => expect(byId("pr-amount")).toHaveValue("1,200.50"));

    await userEvent.click(within(dialog()).getByRole("button", { name: /Remove invoice\.pdf/ }));

    expect(byId("pr-amount")).toHaveValue("");
    expect(byId("pr-invoice-date").value).toBe(todayLocalISODate());
    expect(byId("pr-contact")).toHaveValue("");
  });
});
