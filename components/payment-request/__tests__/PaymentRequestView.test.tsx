// The list screen (components/payment-request/PaymentRequestView.tsx).
//
// The list endpoint answers with a bare array and no count, so this screen WALKS it: a hundred
// rows at a time until a short page comes back, committing as it goes so the first page paints
// without waiting for the rest. That loop is what these tests are mostly about, because it has
// three stopping conditions and getting one wrong either truncates the list or spins forever.
//
// Queries are scoped to the table (see the note at the top of PaymentRequestTable.test.tsx:
// the table and the card list both render under jsdom).

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/Toast";
import { PaymentRequestView } from "@/components/payment-request/PaymentRequestView";
import { ALL_STATUSES, billList, billListItem, inDays } from "@/lib/__fixtures__/bills";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ ref: "360812e1", slug: "olive-and-vine" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

// pdf.js wants a canvas; the attachment preview reaches for it through this.
vi.mock("@/components/PdfJsCanvasPreview", () => ({
  PdfJsCanvasPreview: () => <div>pdf preview</div>,
}));

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Answers by path. `pages` is consulted in order for each `/bills/?page=N` the loop asks for,
 * so a test states the WHOLE conversation rather than queueing responses blind.
 */
function serve({ pages = [ALL_STATUSES], onBills }: { pages?: unknown[][]; onBills?: (page: number) => void } = {}) {
  const billsCalls: number[] = [];
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input));
    const path = url.pathname;
    if (path.endsWith("/auth/entitlements")) return answer(200, { billing_enabled: true });
    if (path.endsWith("/auth/entity-currency")) return answer(200, { currency_code: "HKD" });
    if (path.endsWith("/auth/xero-status")) return answer(200, { connected: true });
    if (path.endsWith("/profile/me")) return answer(200, { member_entity_ids: [ENTITY_ID] });
    if (path.includes("/payments")) return answer(200, { paid_total: "0.00", payments: [] });
    if (path.endsWith("/bills/")) {
      const page = Number(url.searchParams.get("page") ?? "1");
      billsCalls.push(page);
      onBills?.(page);
      return answer(200, pages[page - 1] ?? []);
    }
    return answer(200, {});
  });
  return { billsCalls };
}

const show = (easyView = false) =>
  render(
    <ToastProvider>
      <PaymentRequestView easyView={easyView} />
    </ToastProvider>,
  );

const table = () => within(screen.getByRole("table"));
/** A status chip (Part 14 Filter chip: a toggle button), by its status word. */
const statusChip = (name: string) =>
  within(screen.getByRole("group", { name: "Filter by status" })).getByRole("button", {
    name: new RegExp(`^${name}`),
  });
const bodyRows = () => screen.getByRole("table").querySelectorAll("tbody tr");

/**
 * Wait for the list to have finished loading. NOT `bodyRows().length > 0`: the loading state
 * draws five skeleton rows, so that condition is already true before a single bill has arrived.
 */
const loaded = () =>
  waitFor(() =>
    expect(screen.getByRole("table").querySelector("tbody")).toHaveAttribute("aria-busy", "false"),
  );

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("walking the list", () => {
  it("asks for a hundred rows at a time", async () => {
    serve();

    show();

    await loaded();
    const billsUrl = fetchMock.mock.calls
      .map(([u]) => new URL(String(u)))
      .find((u) => u.pathname.endsWith("/bills/"))!;
    expect(billsUrl.searchParams.get("page_size")).toBe("100");
  });

  it("stops at the page that comes back short", async () => {
    const { billsCalls } = serve({
      pages: [billList(100), billList(100, {}, 101), billList(3, {}, 201)],
    });

    show();

    await loaded();
    await waitFor(() => expect(billsCalls).toContain(3));
    expect(billsCalls).not.toContain(4);
  });

  it("stops rather than looping when the backend ignores the page and repeats itself", async () => {
    // A backend that returns the same hundred rows forever would otherwise be walked all the
    // way to the two-thousand-row cap.
    const same = billList(100);
    const { billsCalls } = serve({ pages: [same, same, same, same] });

    show();

    await loaded();
    expect(billsCalls).not.toContain(3);
  });

  // CHARACTERISATION, and a finding worth acting on separately.
  //
  // The whole walk runs TWICE on every load of this screen. `loadBills` lists `entityCurrency`
  // among its dependencies, and `useEntityCurrency()` reports "" on the first render and the
  // real code once its own read resolves - so the callback is rebuilt, the effect re-runs, and
  // every page is fetched again. The currency is used only to FORMAT the amounts; it does not
  // change which rows the server would send.
  //
  // Cost: 2N requests instead of N for a list of N hundred-row pages, on every visit. Pinned,
  // not fixed - changing a dependency list is a change to the screen's behaviour, not a test.
  it("walks the WHOLE list a second time when the currency arrives", async () => {
    const { billsCalls } = serve({ pages: [billList(100), billList(2, {}, 101)] });

    show();

    await loaded();
    await waitFor(() => expect(billsCalls.filter((p) => p === 1).length).toBe(2));
    expect(billsCalls.filter((p) => p === 2).length).toBe(2);
  });
});

describe("the rows it shows", () => {
  it("are the company's payment requests, with their statuses in words", async () => {
    serve({ pages: [ALL_STATUSES] });

    show();

    await loaded();
    expect(table().getByText("Young Bros Transport")).toBeInTheDocument();
    // The API's `submitted` reads as "Payment Requested" on screen.
    expect(table().getByText("Payment Requested")).toBeInTheDocument();
    expect(table().getByText("Partially Paid")).toBeInTheDocument();
    expect(table().getByText("Paid")).toBeInTheDocument();
    expect(table().getByText("Draft")).toBeInTheDocument();
    expect(table().getByText("Returned")).toBeInTheDocument();
  });

  it("leave a voided request out until its status is asked for", async () => {
    serve({ pages: [ALL_STATUSES] });

    show();

    await loaded();
    expect(table().queryByText("Cancelled Order Inc")).not.toBeInTheDocument();

    await userEvent.click(statusChip("Voided"));

    await waitFor(() => expect(table().getByText("Cancelled Order Inc")).toBeInTheDocument());
  });

  it("show the amount due with the company's currency", async () => {
    serve({ pages: [[billListItem({ id: "b1", contact: "One Supplier", amount_due: "6000.00" })]] });

    show();

    await waitFor(() => expect(table().getByText("HKD 6,000.00")).toBeInTheDocument());
  });

  it("say so plainly when the company has none", async () => {
    serve({ pages: [[]] });

    show();

    await waitFor(() =>
      expect(table().getByText("No payment requests match this status.")).toBeInTheDocument(),
    );
  });

  it("open the request that was clicked, at its own address", async () => {
    serve({ pages: [[billListItem({ id: "b1", contact: "One Supplier", reference: "PR-0009" })]] });
    show();
    await loaded();
    expect(bodyRows()).toHaveLength(1);

    await userEvent.click(table().getByText("One Supplier"));

    expect(push).toHaveBeenCalledWith("/entity/360812e1/olive-and-vine/payment-request/PR-0009");
  });
});

describe("a list that did not load", () => {
  it("says what went wrong in the API's own words, not 'Failed to fetch'", async () => {
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/auth/entitlements")) return answer(200, { billing_enabled: true });
      if (path.endsWith("/auth/entity-currency")) return answer(200, { currency_code: "HKD" });
      if (path.endsWith("/bills/")) return answer(403, { detail: "You don't have access to that." });
      return answer(200, {});
    });

    show();

    expect(await screen.findByText("You don't have access to that.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("falls back to its own sentence when the failure is not the API's", async () => {
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/auth/entitlements")) return answer(200, { billing_enabled: true });
      if (path.endsWith("/auth/entity-currency")) return answer(200, { currency_code: "HKD" });
      if (path.endsWith("/bills/")) throw new TypeError("Failed to fetch");
      return answer(200, {});
    });

    show();

    expect(
      await screen.findByText("Your payments didn't come through. Mind trying again?"),
    ).toBeInTheDocument();
  });

  it("tries again when asked", async () => {
    let attempt = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname;
      if (path.endsWith("/auth/entitlements")) return answer(200, { billing_enabled: true });
      if (path.endsWith("/auth/entity-currency")) return answer(200, { currency_code: "HKD" });
      if (path.includes("/payments")) return answer(200, { paid_total: "0.00", payments: [] });
      if (path.endsWith("/bills/")) {
        attempt += 1;
        if (attempt === 1) return answer(500, { detail: "boom" });
        return answer(200, [billListItem({ id: "b1", contact: "One Supplier" })]);
      }
      return answer(200, {});
    });
    show();
    await screen.findByRole("button", { name: "Retry" });

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(table().getByText("One Supplier")).toBeInTheDocument());
  });
});

describe("bank slip counts that did not load", () => {
  it("say so instead of offering an upload, and load again when asked", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let paymentsUp = false;
      fetchMock.mockImplementation(async (input) => {
        const url = new URL(String(input));
        const path = url.pathname;
        if (path.endsWith("/auth/entitlements")) return answer(200, { billing_enabled: true });
        if (path.endsWith("/auth/entity-currency")) return answer(200, { currency_code: "HKD" });
        if (path.endsWith("/attachments")) {
          return answer(200, [
            {
              id: "att-1", attachment_role: "bank_slip", sort_order: 0, note: "", created_at: "2026-10-12T02:00:00Z",
              attachment: {
                id: "f-1", original_name: "slip.pdf", mime_type: "application/pdf", file_size: 10,
                file_extension: "pdf", storage_provider: "s3", created_at: "2026-10-12T02:00:00Z", download_url: "",
              },
            },
          ]);
        }
        if (path.endsWith("/payments")) {
          if (!paymentsUp) return answer(500, { detail: "boom" });
          return answer(200, {
            paid_total: "0.00",
            payments: [{ id: "pay-1", bill_id: "b1", payment_status: "completed", amount: "1.00", currency_code: "HKD" }],
          });
        }
        if (path.endsWith("/bills/")) {
          return answer(200, [billListItem({ id: "b1", contact: "One Supplier", status: "submitted" })]);
        }
        return answer(200, {});
      });
      show();

      const retry = await table().findByRole("button", {
        name: "Bank slips didn't load for One Supplier — try again",
      });
      expect(table().queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
      expect(consoleError).toHaveBeenCalled();

      paymentsUp = true;
      await userEvent.click(retry);

      expect(await table().findByRole("button", { name: /View bank slip — 1 file uploaded/ })).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("the status filter", () => {
  it("asks the server for a single status rather than filtering in the browser", async () => {
    serve({ pages: [ALL_STATUSES] });
    show();
    await loaded();
    fetchMock.mockClear();

    await userEvent.click(statusChip("Draft"));

    await waitFor(() => {
      const asked = fetchMock.mock.calls
        .map(([u]) => new URL(String(u)))
        .filter((u) => u.pathname.endsWith("/bills/"));
      expect(asked.some((u) => u.searchParams.get("status") === "draft")).toBe(true);
    });
  });
});

describe("what needs attention", () => {
  // Due dates relative to now, so the fixture never drifts: the strip reckons "today" in Hong
  // Kong, and moving an instant by whole days moves its Hong Kong date by the same days.
  const ATTENTION = [
    billListItem({ id: "a-late", contact: "Late Supplier", status: "submitted", amount_due: "6000.00", due_date: inDays(-3) }),
    billListItem({ id: "a-part", contact: "Part Paid Late", status: "partially_paid", amount: "13000.50", amount_due: "1500.00", due_date: inDays(-1) }),
    billListItem({ id: "a-soon", contact: "Soon Supplier", status: "submitted", amount_due: "300.00", due_date: inDays(2) }),
    billListItem({ id: "a-later", contact: "Later Supplier", status: "submitted", amount_due: "50.00", due_date: inDays(20) }),
    billListItem({ id: "a-returned", contact: "Returned Supplier", status: "returned", amount_due: "80.00", due_date: inDays(20) }),
    billListItem({ id: "a-paid", contact: "Paid Supplier", status: "paid", amount_due: "0.00", due_date: inDays(-9) }),
  ];
  const strip = () => within(screen.getByRole("region", { name: "Needs attention" }));
  const tile = (name: string) => strip().getByRole("button", { name: new RegExp(`^${name}`) });

  it("counts the overdue and due-this-week requests with what is still unpaid, and the returned ones", async () => {
    serve({ pages: [ATTENTION] });
    show();
    await loaded();

    // Overdue: 6,000.00 + the 1,500.00 still owed on the part-paid one. Paid is never overdue.
    await waitFor(() => expect(tile("Overdue")).toHaveTextContent("2 requests"));
    expect(tile("Overdue")).toHaveTextContent("HKD 7,500.00 unpaid");
    expect(tile("Due in 7 days")).toHaveTextContent("1 request");
    expect(tile("Due in 7 days")).toHaveTextContent("HKD 300.00 unpaid");
    expect(tile("Returned")).toHaveTextContent("1 request");
    expect(tile("Overdue")).toHaveAttribute("aria-pressed", "false");
  });

  it("collapses to one calm line when nothing is overdue, due this week or returned", async () => {
    serve({ pages: [[billListItem({ id: "calm", contact: "Calm Supplier", due_date: inDays(30) })]] });
    show();
    await loaded();

    expect(await screen.findByText("Nothing is overdue or due this week.")).toBeInTheDocument();
    expect(strip().queryAllByRole("button")).toHaveLength(0);
  });

  it("narrows the list to the overdue requests when Overdue is pressed, and back again", async () => {
    serve({ pages: [ATTENTION] });
    show();
    await loaded();
    await waitFor(() => expect(tile("Overdue")).toHaveTextContent("2 requests"));
    fetchMock.mockClear();

    await userEvent.click(tile("Overdue"));

    expect(tile("Overdue")).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    expect(table().getByText("Late Supplier")).toBeInTheDocument();
    expect(table().getByText("Overdue 3 days")).toBeInTheDocument();
    expect(table().queryByText("Soon Supplier")).not.toBeInTheDocument();

    await userEvent.click(tile("Overdue"));

    expect(tile("Overdue")).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(bodyRows()).toHaveLength(ATTENTION.length));
    // A client-side filter: the list already in memory is narrowed, never fetched again.
    expect(fetchMock.mock.calls.some(([u]) => new URL(String(u)).pathname.endsWith("/bills/"))).toBe(false);
  });

  it("presses the Returned chip for the Returned tile, and keeps its figures from the whole list", async () => {
    serve({ pages: [ATTENTION] });
    show();
    await loaded();
    await waitFor(() => expect(tile("Returned")).toHaveTextContent("1 request"));
    fetchMock.mockClear();

    await userEvent.click(tile("Returned"));

    expect(statusChip("Returned")).toHaveAttribute("aria-pressed", "true");
    expect(tile("Returned")).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      const asked = fetchMock.mock.calls
        .map(([u]) => new URL(String(u)))
        .filter((u) => u.pathname.endsWith("/bills/"));
      expect(asked.some((u) => u.searchParams.get("status") === "returned")).toBe(true);
    });
    await loaded();
    // The single-status load answered with every row again here, but the strip does not re-count
    // from a filtered load: its numbers stay those of the last whole-list load.
    expect(tile("Overdue")).toHaveTextContent("2 requests");
  });

  it("draws the totals once, under the strip, rather than once per view", async () => {
    serve({ pages: [ATTENTION] });
    show();
    await loaded();

    await userEvent.click(table().getByRole("checkbox", { name: "Select row Late Supplier" }));

    expect(screen.getAllByText("Selected total unpaid amount")).toHaveLength(1);
    expect(strip().getByText("Selected total unpaid amount")).toBeInTheDocument();
  });
});

describe("a system superuser looking at a company they are not in", () => {
  it("is told the access is read-only", async () => {
    setAuth(
      unsignedToken({ role: "admin", system_role: "superadmin", is_view_only: true }),
      ENTITY_ID,
      ENTITY_NAME,
    );
    serve();

    show();

    expect(
      await screen.findByText("Read-only access — you are not a member of this entity."),
    ).toBeInTheDocument();
  });
});
