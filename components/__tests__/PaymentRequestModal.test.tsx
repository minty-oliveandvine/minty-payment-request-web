// The Add Payment dialog (components/PaymentRequestModal.tsx).
//
// e2e/02_bill_lifecycle.spec.ts walks the happy path in a browser. What the unit layer adds is
// the refusals - every required field, one at a time - and the two ways out, Save as Draft and
// Confirm, which post to different endpoints and must not be confused.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentRequestModal } from "@/components/PaymentRequestModal";
import { ToastProvider } from "@/components/Toast";
import { bill, billAttachment } from "@/lib/__fixtures__/bills";
import { SUPPLIERS } from "@/lib/__fixtures__/contacts";
import { entityBillAccounts } from "@/lib/__fixtures__/accounts";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ ref: "360812e1", slug: "olive-and-vine" }),
  useRouter: () => router,
}));

vi.mock("@/components/PdfJsCanvasPreview", () => ({
  PdfJsCanvasPreview: () => <div>pdf preview</div>,
}));

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Posted = { path: string; body: unknown };

function serve({
  submit,
  draft,
  currency,
  upload,
}: {
  submit?: () => Response;
  draft?: () => Response;
  currency?: () => Response;
  /** `POST /bills/{id}/attachments`; given the one file the call carries. */
  upload?: (file: File) => Response;
} = {}) {
  const posted: Posted[] = [];
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname;
    if (path.endsWith("/auth/entity-currency")) {
      return (currency ?? (() => answer(200, { currency_code: "HKD" })))();
    }
    if (path.endsWith("/auth/entitlements")) return answer(200, { billing_enabled: true });
    if (path.endsWith("/profile/me")) return answer(200, { member_entity_ids: [ENTITY_ID] });
    if (path.endsWith("/entity-bill-contacts/")) return answer(200, SUPPLIERS);
    if (path.includes("/entity-bill-accounts/")) return answer(200, entityBillAccounts());
    if (path.endsWith("/bills/suggested-reference/")) return answer(200, { reference: "MBIOVI-1" });
    if (path.endsWith("/currencies/")) return answer(200, []);
    if (init?.method === "POST") {
      // An upload's body is FormData, which only a string body could be parsed from.
      posted.push({
        path,
        body: typeof init.body === "string" ? JSON.parse(init.body) : (init.body ?? null),
      });
      if (/\/bills\/[^/]+\/attachments$/.test(path)) {
        const sent = init.body instanceof FormData ? (init.body.get("files") as File) : null;
        return (upload ?? (() => answer(201, [billAttachment()])))(sent as File);
      }
      if (path.endsWith("/bills/draft/")) return (draft ?? (() => answer(201, bill())))();
      if (path.endsWith("/bills/submit/") || path.endsWith("/bills/")) {
        return (submit ?? (() => answer(201, bill())))();
      }
    }
    return answer(200, {});
  });
  return { posted };
}

const onClose = vi.fn();
const onConfirm = vi.fn();
const onSaveDraft = vi.fn();

const show = () =>
  render(
    <ToastProvider>
      <PaymentRequestModal open onClose={onClose} onConfirm={onConfirm} onSaveDraft={onSaveDraft} />
    </ToastProvider>,
  );

const dialog = () => screen.getAllByRole("dialog")[0];

const file = (name: string, type: string) => new File(["x"], name, { type });

/** Hand the input a file past its `accept` filter, the way a drag-drop does. */
const drop = (input: HTMLInputElement, f: File) => {
  Object.defineProperty(input, "files", { value: [f], configurable: true });
  fireEvent.change(input);
};

const filePicker = () => within(dialog()).getByLabelText("Choose files to attach");

/** The dashed box behind the (invisible, overlaid) file input. */
const dropZone = () => filePicker().parentElement!.querySelector(".border-dashed") as HTMLElement;

const attach = (f: File) =>
  userEvent.upload(within(dialog()).getByLabelText("Choose files to attach"), f);

/** The inline preview pane: found by the enlarge control it carries. */
const findPane = async () => {
  const button = await screen.findByRole("button", { name: `View full — ${"receipt.png"}` });
  return button.parentElement as HTMLElement;
};

const findViewer = async () => {
  const close = await screen.findByRole("button", { name: "Close preview" });
  return close.closest('[role="dialog"]') as HTMLElement;
};
const confirm = () => screen.getByRole("button", { name: /^Confirm/ });
const saveDraft = () => screen.getByRole("button", { name: /Save as Draft/ });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
  serve();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the dialog", () => {
  it("is modal and has a name", () => {
    show();

    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(dialog()).toHaveAccessibleName();
  });

  it("offers both ways out: a draft, or a submitted request", () => {
    show();

    expect(saveDraft()).toBeInTheDocument();
    expect(confirm()).toBeInTheDocument();
  });

  it("closes without saving", async () => {
    show();

    await userEvent.click(screen.getByRole("button", { name: "Close dialog" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("marks the fields it insists on", () => {
    show();

    const required = Array.from(dialog().querySelectorAll("label"))
      .filter((l) => l.textContent?.includes("*"))
      .map((l) => l.textContent?.replace(/\s*\*$/, "").trim());
    expect(required).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Due Date"),
        expect.stringContaining("Amount"),
      ]),
    );
  });

  it("suggests a Payment No. so one need not be typed", async () => {
    show();

    await waitFor(() =>
      expect(within(dialog()).getByLabelText(/Payment No\./)).toHaveValue("MBIOVI-1"),
    );
  });
});

describe("what it refuses", () => {
  it("submits nothing at all when the form is empty", async () => {
    const { posted } = serve();
    show();

    await userEvent.click(confirm());

    expect(posted).toHaveLength(0);
  });

  it("asks for an amount", async () => {
    const { posted } = serve();
    show();

    await userEvent.click(confirm());

    expect(await screen.findByText("We'll need an amount here.")).toBeInTheDocument();
    expect(posted).toHaveLength(0);
  });

  it("asks for a supplier", async () => {
    serve();
    show();

    await userEvent.click(confirm());

    expect(await screen.findByText("We'll need a supplier here.")).toBeInTheDocument();
  });

  it("asks for an account code", async () => {
    serve();
    show();

    await userEvent.click(confirm());

    expect(await screen.findByText("We'll need an account code here.")).toBeInTheDocument();
  });

  it("asks for a due date", async () => {
    serve();
    show();

    await userEvent.click(confirm());

    expect(await screen.findByText("We'll need a due date here.")).toBeInTheDocument();
  });

  it("refuses an amount that is not one", async () => {
    serve();
    show();
    await userEvent.type(within(dialog()).getByPlaceholderText("0.00"), "0");

    await userEvent.click(confirm());

    expect(await screen.findByText("That amount doesn't look quite right.")).toBeInTheDocument();
  });
});

describe("saving a draft", () => {
  it("posts to the draft endpoint, not the submit one", async () => {
    const { posted } = serve();
    show();
    await userEvent.type(within(dialog()).getByPlaceholderText("0.00"), "6000");

    await userEvent.click(saveDraft());

    await waitFor(() => expect(posted.length).toBeGreaterThan(0));
    expect(posted[0].path).toContain("/bills/draft/");
    expect(posted.every((p) => !p.path.endsWith("/bills/submit/"))).toBe(true);
  });

  it("does not insist on the fields a submitted request needs", async () => {
    // A draft is a work in progress: it may be saved without a supplier or an account code.
    const { posted } = serve();
    show();
    await userEvent.type(within(dialog()).getByPlaceholderText("0.00"), "6000");

    await userEvent.click(saveDraft());

    await waitFor(() => expect(posted.length).toBeGreaterThan(0));
    expect(screen.queryByText("We'll need a supplier here.")).not.toBeInTheDocument();
  });

  it("shows the API's own sentence when the draft is refused", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      serve({ draft: () => answer(500, { detail: "boom" }) });
      show();
      await userEvent.type(within(dialog()).getByPlaceholderText("0.00"), "6000");

      await userEvent.click(saveDraft());

      // An ApiError already carries readable copy (lib/api.ts), so it is shown as it stands.
      expect(
        await screen.findByText("Something went wrong on my end. Mind trying again?"),
      ).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("falls back to its own sentence when the failure is not the API's", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      serve({
        draft: () => {
          throw new TypeError("Failed to fetch");
        },
      });
      show();
      await userEvent.type(within(dialog()).getByPlaceholderText("0.00"), "6000");

      await userEvent.click(saveDraft());

      expect(
        await screen.findByText("That draft didn't quite save. Mind trying again?"),
      ).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("uploading the invoice after the request exists", () => {
  const SENT = bill({ id: "bill-sent", reference: "PR-0100", contact: "ABC Furniture" });
  const REQUEST_PAGE = "/entity/360812e1/olive-and-vine/payment-request/PR-0100";

  /** Everything Confirm insists on, and the files to attach. */
  async function fillForConfirm(...files: File[]) {
    await userEvent.type(within(dialog()).getByPlaceholderText("0.00"), "6000");
    fireEvent.change(document.getElementById("pr-invoice-date")!, {
      target: { value: "2026-03-03" },
    });
    fireEvent.change(document.getElementById("pr-due-date")!, { target: { value: "2026-03-31" } });
    await userEvent.click(document.getElementById("pr-contact")!);
    await userEvent.click(await screen.findByRole("option", { name: "ABC Furniture" }));
    await userEvent.click(document.getElementById("pr-account")!);
    await userEvent.click(await screen.findByRole("option", { name: /^429 - / }));
    await userEvent.upload(filePicker(), files);
  }

  const uploads = (posted: Posted[]) => posted.filter((p) => p.path.endsWith("/attachments"));
  const warning = () => document.querySelector('[data-toast-type="warning"]');

  beforeEach(() => {
    router.push.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the file to the new request's attachments and opens it, with no warning", async () => {
    const { posted } = serve({ submit: () => answer(201, SENT) });
    show();
    await fillForConfirm(file("invoice.pdf", "application/pdf"));

    await userEvent.click(confirm());

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(REQUEST_PAGE));
    expect(uploads(posted).map((p) => p.path)).toEqual(["/api/v1/bills/bill-sent/attachments"]);
    expect(warning()).toBeNull();
  });

  it("says the file didn't upload when the server fails, and still opens the request", async () => {
    serve({ submit: () => answer(201, SENT), upload: () => answer(500, { detail: "boom" }) });
    show();
    await fillForConfirm(file("invoice.pdf", "application/pdf"));

    await userEvent.click(confirm());

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(REQUEST_PAGE));
    expect(warning()?.textContent).toContain(
      "Payment request for ABC Furniture sent, but invoice.pdf didn't upload. Edit the request and add it again.",
    );
  });

  it("says the same when the server refuses the file", async () => {
    serve({
      submit: () => answer(201, SENT),
      upload: () => answer(422, { detail: "Files need to be under 10MB." }),
    });
    show();
    await fillForConfirm(file("invoice.pdf", "application/pdf"));

    await userEvent.click(confirm());

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(REQUEST_PAGE));
    expect(warning()?.textContent).toContain("invoice.pdf didn't upload");
  });

  it("names only the file that failed when several were sent", async () => {
    const { posted } = serve({
      submit: () => answer(201, SENT),
      upload: (f) =>
        f.name === "second.pdf" ? answer(500, { detail: "boom" }) : answer(201, [billAttachment()]),
    });
    show();
    await fillForConfirm(
      file("first.pdf", "application/pdf"),
      file("second.pdf", "application/pdf"),
    );

    await userEvent.click(confirm());

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(REQUEST_PAGE));
    expect(uploads(posted)).toHaveLength(2);
    expect(warning()?.textContent).toContain("but second.pdf didn't upload");
    expect(warning()?.textContent).not.toContain("first.pdf");
  });

  it("opens a saved draft whose file didn't upload, so it can be added again", async () => {
    const draft = bill({ id: "bill-draft", reference: "PR-0101", status: "draft" });
    serve({ draft: () => answer(201, draft), upload: () => answer(500, { detail: "boom" }) });
    show();
    await userEvent.type(within(dialog()).getByPlaceholderText("0.00"), "6000");
    await attach(file("invoice.pdf", "application/pdf"));

    await userEvent.click(saveDraft());

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        "/entity/360812e1/olive-and-vine/payment-request/PR-0101",
      ),
    );
    expect(onClose).toHaveBeenCalled();
    expect(warning()?.textContent).toContain(
      "Draft saved, but invoice.pdf didn't upload. Edit the draft and add it again.",
    );
  });
});

describe("the company's currency", () => {
  // lib/entityCurrency.ts caches the code for the page's life, so each case takes fresh modules.
  async function showFresh() {
    vi.resetModules();
    const [{ PaymentRequestModal: Modal }, { ToastProvider: Toasts }, { setAuth: auth }] =
      await Promise.all([
        import("@/components/PaymentRequestModal"),
        import("@/components/Toast"),
        import("@/lib/auth"),
      ]);
    auth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
    render(
      <Toasts>
        <Modal open onClose={onClose} onConfirm={onConfirm} onSaveDraft={onSaveDraft} />
      </Toasts>,
    );
  }

  it("stands beside the amount", async () => {
    serve();
    await showFresh();

    await waitFor(() =>
      expect(within(dialog()).getByLabelText("Currency")).toHaveTextContent("HKD"),
    );
    expect(saveDraft()).toBeEnabled();
  });

  it("says when the company has none, and sends nothing", async () => {
    const { posted } = serve({ currency: () => answer(200, { currency_code: "" }) });
    await showFresh();

    expect(await screen.findByText(/Your company has no currency set/)).toBeInTheDocument();
    expect(within(dialog()).getByLabelText("Currency")).toHaveTextContent("—");
    expect(screen.getByRole("link", { name: "Entity & Integration settings" })).toHaveAttribute(
      "href",
      expect.stringContaining(`/entity/${ENTITY_ID}/settings/integration`),
    );
    expect(confirm()).toBeDisabled();
    expect(saveDraft()).toBeDisabled();
    expect(posted).toHaveLength(0);
  });

  it("takes no point for a 0-place currency (JPY), and posts whole yen", async () => {
    const { posted } = serve({
      currency: () => answer(200, { currency_code: "JPY", decimal_places: 0 }),
    });
    await showFresh();
    await waitFor(() =>
      expect(within(dialog()).getByLabelText("Currency")).toHaveTextContent("JPY"),
    );
    const amount = within(dialog()).getByPlaceholderText("0.00");

    await userEvent.type(amount, "12.5");
    expect(amount).toHaveValue("125");

    await userEvent.clear(amount);
    await userEvent.type(amount, "1234");
    await userEvent.click(saveDraft());

    await waitFor(() => expect(posted.length).toBeGreaterThan(0));
    expect(posted[0].body).toMatchObject({ amount: "1234" });
  });

  it("tells a failed read apart from none set, and tries again", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let calls = 0;
      serve({
        currency: () =>
          ++calls === 1 ? answer(500, { detail: "boom" }) : answer(200, { currency_code: "HKD" }),
      });
      await showFresh();

      expect(await screen.findByText(/couldn.t load your company.s currency/)).toBeInTheDocument();
      expect(saveDraft()).toBeDisabled();

      await userEvent.click(screen.getByRole("button", { name: "Try again" }));

      await waitFor(() =>
        expect(within(dialog()).getByLabelText("Currency")).toHaveTextContent("HKD"),
      );
      expect(saveDraft()).toBeEnabled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("the amount field", () => {
  it("takes digits and refuses the rest", async () => {
    show();
    const amount = within(dialog()).getByPlaceholderText("0.00");

    await userEvent.type(amount, "12abc34");

    expect(amount).toHaveValue("1,234");
  });

  it("refuses a twelfth integer digit rather than truncating", async () => {
    show();
    const amount = within(dialog()).getByPlaceholderText("0.00");

    await userEvent.type(amount, "123456789012");

    expect(amount).toHaveValue("12,345,678,901");
  });

  it("puts the commas in as the person types", async () => {
    show();
    const amount = within(dialog()).getByPlaceholderText("0.00");

    await userEvent.type(amount, "1234567.8");

    expect(amount).toHaveValue("1,234,567.8");
  });

  it("still posts the amount as a plain decimal string", async () => {
    const { posted } = serve();
    show();
    await userEvent.type(within(dialog()).getByPlaceholderText("0.00"), "1234567.5");

    await userEvent.click(saveDraft());

    await waitFor(() => expect(posted.length).toBeGreaterThan(0));
    expect(posted[0].body).toMatchObject({ amount: "1234567.50" });
  });

  it("groups the amount once the field is left", async () => {
    show();
    const amount = within(dialog()).getByPlaceholderText("0.00");

    await userEvent.type(amount, "6000");
    await userEvent.tab();

    expect(amount).toHaveValue("6,000.00");
  });
});

describe("the attachments", () => {
  it("invites a file, and names the control for a reader", () => {
    show();

    expect(within(dialog()).getByText("Click or drag files here to upload")).toBeInTheDocument();
    expect(within(dialog()).getByLabelText("Choose files to attach")).toBeInTheDocument();
  });

  // The upload is mandatory, and it used to say so only after Confirm. The marker goes up
  // front; the red border waits for a failed Confirm, like every other field here.
  it("says it is mandatory before anything is attempted", () => {
    show();

    expect(within(dialog()).getByText(/Uploaded files/)).toHaveTextContent("*");
    expect(filePicker()).toHaveAttribute("aria-required", "true");
  });

  it("is not red until Confirm has been tried", async () => {
    show();

    expect(dropZone()).toHaveClass("border-gray-300");
    expect(filePicker()).not.toHaveAttribute("aria-invalid");

    await userEvent.click(confirm());

    await waitFor(() => expect(dropZone()).toHaveClass("border-red-500"));
    expect(dropZone()).not.toHaveClass("border-gray-300");
    expect(filePicker()).toHaveAttribute("aria-invalid", "true");
  });

  it("ties the refusal to the control it is about", async () => {
    show();

    await userEvent.click(confirm());

    const message = await screen.findByText("We'll need at least one attachment.");
    expect(filePicker()).toHaveAttribute("aria-describedby", message.id);
    expect(message.id).toBeTruthy();
  });

  it("clears the red as soon as a file arrives", async () => {
    show();
    await userEvent.click(confirm());
    await waitFor(() => expect(dropZone()).toHaveClass("border-red-500"));

    await attach(file("receipt.png", "image/png"));

    await waitFor(() => expect(dropZone()).toHaveClass("border-gray-300"));
    expect(filePicker()).not.toHaveAttribute("aria-invalid");
  });

  it("does not offer a spreadsheet in the picker at all", async () => {
    show();
    const input = within(dialog()).getByLabelText("Choose files to attach");

    expect(input.getAttribute("accept")).not.toContain("xls");
    expect(input.getAttribute("accept")).not.toContain("excel");
    expect(input.getAttribute("accept")).not.toContain("spreadsheet");

    // The picker filters it out, so it never even reaches the handler.
    await attach(file("books.xlsx", "application/vnd.ms-excel"));

    expect(screen.queryByText("books.xlsx")).toBeNull();
  });

  it("refuses a spreadsheet dropped past the picker, without naming Excel", async () => {
    show();
    const input = within(dialog()).getByLabelText("Choose files to attach") as HTMLInputElement;

    // Drag-drop bypasses `accept`, so this is the path the error copy is actually for.
    drop(input, file("books.xlsx", "application/vnd.ms-excel"));

    const refusal = await screen.findByText(/I can't open this one/);
    expect(refusal).toHaveTextContent("try PDF, JPEG, PNG, or HTML");
    expect(refusal).not.toHaveTextContent("Excel");
    expect(screen.queryByText("books.xlsx")).toBeNull();
  });
});

// A staged file is PREVIEWED IN PLACE and enlarged over the dialog. It must never leave the
// app: an anchor here was the bug (the whole pane used to be a target="_blank" link), so the
// absence of one is the thing worth asserting.
describe("previewing a staged file", () => {
  it("shows the file inline with no link out of the app", async () => {
    show();

    await attach(file("receipt.png", "image/png"));

    const pane = await findPane();
    expect(within(pane).getByAltText("receipt.png")).toBeInTheDocument();
    expect(within(pane).queryAllByRole("link")).toHaveLength(0);
    expect(pane.querySelector('[target="_blank"]')).toBeNull();
  });

  it("enlarges to a full-screen preview over the dialog", async () => {
    show();
    await attach(file("receipt.png", "image/png"));

    await userEvent.click(await screen.findByRole("button", { name: "View full — receipt.png" }));

    const viewer = await findViewer();
    expect(viewer).toHaveAttribute("aria-modal", "true");
    expect(within(viewer).getByAltText("receipt.png")).toBeInTheDocument();
    expect(within(viewer).queryAllByRole("link")).toHaveLength(0);
  });

  it("unwinds one layer per Escape: the viewer first, then the dialog", async () => {
    show();
    await attach(file("receipt.png", "image/png"));
    await userEvent.click(await screen.findByRole("button", { name: "View full — receipt.png" }));
    await findViewer();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("button", { name: "Close preview" })).toBeNull());
    expect(screen.getByText("Add Payment Request")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says so, rather than offering a download, for a file it cannot draw", async () => {
    show();

    await attach(file("payload.bin", "application/octet-stream"));

    // Refused at the gate - the point is that no download link appears anywhere.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
