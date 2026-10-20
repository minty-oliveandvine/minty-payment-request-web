// Add payment request - a page since the Part 15 migration (components/PaymentRequestForm.tsx).
//
// e2e/02_bill_lifecycle.spec.ts walks the happy path in a browser. What the unit layer adds is
// the validation rules (CLAUDE.md "Validation while typing", owner 2026-10-13, Part 11 wording,
// Part 15.3) and the two ways out - Save as draft and Submit for payment - which post to
// different endpoints and must not be confused.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentRequestForm } from "@/components/PaymentRequestForm";
import { ToastProvider } from "@/components/Toast";
import { bill } from "@/lib/__fixtures__/bills";
import { SUPPLIERS } from "@/lib/__fixtures__/contacts";
import { entityBillAccounts } from "@/lib/__fixtures__/accounts";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ ref: "360812e1", slug: "olive-and-vine" }),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
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
  accounts,
  upload,
}: {
  submit?: () => Response;
  draft?: () => Response;
  currency?: () => Response;
  accounts?: unknown;
  /** `POST /bills/{id}/attachments`, given the names of the files in that one upload. */
  upload?: (names: string[]) => Response;
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
    if (path.includes("/entity-bill-accounts/")) return answer(200, accounts ?? entityBillAccounts());
    if (path.endsWith("/bills/suggested-reference/")) return answer(200, { reference: "MBIOVI-1" });
    if (path.endsWith("/currencies/")) return answer(200, []);
    if (init?.method === "POST") {
      // Only JSON bodies parse; an attachment upload is FormData, recorded as its file names.
      const names =
        init.body instanceof FormData ? init.body.getAll("files").map((f) => (f as File).name) : [];
      posted.push({
        path,
        body: typeof init.body === "string" ? JSON.parse(init.body) : init.body instanceof FormData ? names : null,
      });
      if (/\/bills\/[^/]+\/attachments$/.test(path)) return (upload ?? (() => answer(201, [])))(names);
      if (path.endsWith("/bills/draft/")) return (draft ?? (() => answer(201, bill())))();
      if (path.endsWith("/bills/submit/") || path.endsWith("/bills/")) {
        return (submit ?? (() => answer(201, bill())))();
      }
    }
    return answer(200, {});
  });
  return { posted };
}

const show = () =>
  render(
    <ToastProvider>
      <PaymentRequestForm />
    </ToastProvider>,
  );

const file = (name: string, type: string) => new File(["x"], name, { type });

/** Hand the input a file past its `accept` filter, the way a drag-drop does. */
const drop = (input: HTMLInputElement, f: File) => {
  Object.defineProperty(input, "files", { value: [f], configurable: true });
  fireEvent.change(input);
};

const filePicker = () => screen.getByLabelText("Choose files to attach");
const attach = (f: File) => userEvent.upload(filePicker(), f);
const amountField = () => screen.getByRole("textbox", { name: /Invoice amount/ });
const submit = () => screen.getByRole("button", { name: "Submit for payment" });
const saveDraft = () => screen.getByRole("button", { name: "Save as draft" });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
  serve();
  push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the form", () => {
  it("offers both ways out: a draft, or a request sent for payment", () => {
    show();
    expect(saveDraft()).toBeInTheDocument();
    expect(submit()).toBeInTheDocument();
  });

  it("puts the fields in the order the paper invoice is read in (Part 15.3)", () => {
    show();
    const order = [
      screen.getByLabelText("Choose files to attach"),
      screen.getByRole("combobox", { name: /Supplier/ }),
      amountField(),
      screen.getByLabelText("Invoice date"),
      screen.getByLabelText("Due date"),
      screen.getByRole("textbox", { name: "Description" }),
      screen.getByRole("combobox", { name: /Account code/ }),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("marks what it insists on - the red * from the start, and 'required' for a reader", () => {
    show();
    for (const field of [amountField(), screen.getByRole("combobox", { name: /Supplier/ })]) {
      expect(field).toHaveAttribute("aria-required", "true");
    }
    expect(screen.getAllByText("(required)").length).toBeGreaterThanOrEqual(6);
  });

  it("paints nothing red before anything is attempted", () => {
    show();
    expect(document.querySelectorAll("[aria-invalid='true']")).toHaveLength(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("suggests a Payment No. under More details, so one need not be typed", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: "More details" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Payment No." })).toHaveValue("MBIOVI-1"));
  });
});

describe("a refused submit (Part 15.3)", () => {
  it("submits nothing at all when the form is empty", async () => {
    const { posted } = serve();
    show();
    await userEvent.click(submit());
    expect(posted).toHaveLength(0);
  });

  it("lists every problem at the top, takes focus there, and links to each field", async () => {
    serve({ accounts: [] });
    show();

    await userEvent.click(submit());

    const summary = await screen.findByText(/details need a look before this can be sent/);
    const box = summary.closest("[role='alert']") as HTMLElement;
    expect(box).toHaveFocus();
    expect(within(box).getByRole("link", { name: "The supplier is still empty. Choose one to continue." })).toBeInTheDocument();
    expect(within(box).getByRole("link", { name: "The amount is still empty. Add the invoice amount to continue." })).toBeInTheDocument();
    expect(within(box).getByRole("link", { name: "The due date is still empty. Add it to continue." })).toBeInTheDocument();
    expect(within(box).getByRole("link", { name: "The account code is still empty. Choose one to continue." })).toBeInTheDocument();
    expect(within(box).getByRole("link", { name: /The invoice is still missing/ })).toBeInTheDocument();

    await userEvent.click(within(box).getByRole("link", { name: /amount is still empty/ }));
    expect(amountField()).toHaveFocus();
  });

  it("marks each field it is about, with the reason as its description", async () => {
    show();
    await userEvent.click(submit());
    await waitFor(() => expect(amountField()).toHaveAttribute("aria-invalid", "true"));
    expect(amountField()).toHaveAccessibleDescription("The amount is still empty. Add the invoice amount to continue.");
  });

  it("with only ONE problem, puts the person on that field instead of a summary", async () => {
    show();
    // Everything but the amount: a file, a supplier, a due date and an account code.
    await attach(file("invoice.png", "image/png"));
    await userEvent.type(screen.getByRole("combobox", { name: /Supplier/ }), SUPPLIERS[0].name);
    await userEvent.click(await screen.findByRole("option", { name: SUPPLIERS[0].name }));
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-11-30" } });
    await userEvent.click(screen.getByRole("combobox", { name: /Account code/ }));
    await userEvent.click((await screen.findAllByRole("option"))[0]);

    await userEvent.click(submit());

    await waitFor(() => expect(amountField()).toHaveFocus());
    expect(screen.queryByText(/details need a look/)).not.toBeInTheDocument();
  });

  it("refuses an amount of zero, in plain words", async () => {
    show();
    await userEvent.type(amountField(), "0");
    await userEvent.click(submit());
    await waitFor(() => expect(amountField()).toHaveAccessibleDescription("Enter an amount above zero."));
  });

  it("never says 'Invalid', 'Error' or 'Mandatory' (Part 11 §11.17)", async () => {
    show();
    await userEvent.click(submit());
    await screen.findByText(/details need a look/);
    expect(document.body.textContent).not.toMatch(/\b(Invalid|Error|Mandatory)\b/);
  });
});

describe("as you type (CLAUDE.md validation rule)", () => {
  it("takes digits and refuses the rest", async () => {
    show();
    await userEvent.type(amountField(), "12abc34");
    expect(amountField()).toHaveValue("1234");
  });

  it("refuses a twelfth integer digit rather than truncating", async () => {
    show();
    await userEvent.type(amountField(), "123456789012");
    expect(amountField()).toHaveValue("12345678901");
  });

  it("groups the amount once the field is left", async () => {
    show();
    await userEvent.type(amountField(), "6000");
    await userEvent.tab();
    expect(amountField()).toHaveValue("6,000.00");
  });

  it("clears a refused field's message the moment it is fixed", async () => {
    show();
    await userEvent.click(submit());
    await waitFor(() => expect(amountField()).toHaveAttribute("aria-invalid", "true"));
    await userEvent.type(amountField(), "500");
    expect(amountField()).not.toHaveAttribute("aria-invalid");
  });
});

describe("saving a draft", () => {
  it("posts to the draft endpoint, not the submit one, and goes back to the list", async () => {
    const { posted } = serve();
    show();
    await userEvent.type(amountField(), "6000");

    await userEvent.click(saveDraft());

    await waitFor(() => expect(posted.length).toBeGreaterThan(0));
    expect(posted[0].path).toContain("/bills/draft/");
    expect(posted.every((p) => !p.path.endsWith("/bills/submit/"))).toBe(true);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/entity/360812e1/olive-and-vine/payment-request"));
  });

  it("is never refused for missing fields - a draft is always allowed", async () => {
    const { posted } = serve();
    show();
    // Only the company's currency (which a draft is sent in) gates it - never the fields.
    await waitFor(() => expect(saveDraft()).toBeEnabled());

    await userEvent.click(saveDraft());

    await waitFor(() => expect(posted.length).toBeGreaterThan(0));
    expect(document.querySelectorAll("[aria-invalid='true']")).toHaveLength(0);
  });

  it("shows the API's own sentence when the draft is refused", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      serve({ draft: () => answer(500, { detail: "boom" }) });
      show();
      await userEvent.click(saveDraft());
      expect(await screen.findByText("Something went wrong on my end. Mind trying again?")).toBeInTheDocument();
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
      await userEvent.click(saveDraft());
      expect(await screen.findByText("That draft didn't save. Try saving it again.")).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("the invoice upload after the request is created", () => {
  // The request is created first, then each file is uploaded on its own (the API's multi-file
  // upload is not all-or-nothing). A file that did not arrive is named - never a silent success.
  const CREATED = bill({ id: "bill-new", reference: "PR-NEW" });
  const REQUEST_PAGE = "/entity/360812e1/olive-and-vine/payment-request/PR-NEW";

  async function fillAndSubmit(...files: File[]) {
    show();
    await userEvent.upload(filePicker(), files);
    await userEvent.type(screen.getByRole("combobox", { name: /Supplier/ }), SUPPLIERS[0].name);
    await userEvent.click(await screen.findByRole("option", { name: SUPPLIERS[0].name }));
    await userEvent.type(amountField(), "6000");
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-11-30" } });
    await userEvent.click(screen.getByRole("combobox", { name: /Account code/ }));
    await userEvent.click((await screen.findAllByRole("option"))[0]);
    await userEvent.click(submit());
  }

  const toast = (type: string) => document.querySelector(`[data-toast-type="${type}"]`);

  it("uploads the invoice to the new request and says it was sent", async () => {
    const { posted } = serve({ submit: () => answer(201, CREATED) });

    await fillAndSubmit(file("invoice.pdf", "application/pdf"));

    await waitFor(() => expect(push).toHaveBeenCalledWith(REQUEST_PAGE));
    expect(posted.find((p) => p.path.endsWith("/bills/bill-new/attachments"))?.body).toEqual(["invoice.pdf"]);
    expect(toast("success")).toHaveTextContent(`Payment request for ${SUPPLIERS[0].name} sent to Treasury.`);
    expect(toast("warning")).toBeNull();
  });

  it.each([
    ["a server failure", () => answer(500, { detail: "boom" })],
    ["a refusal", () => answer(422, { detail: "Files need to be under 10MB." })],
  ])("names the file that did not upload after %s, and still opens the request", async (_label, upload) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      serve({ submit: () => answer(201, CREATED), upload });

      await fillAndSubmit(file("invoice.pdf", "application/pdf"));

      await waitFor(() => expect(push).toHaveBeenCalledWith(REQUEST_PAGE));
      expect(toast("warning")).toHaveTextContent(
        `Payment request for ${SUPPLIERS[0].name} sent to Treasury, but invoice.pdf didn't upload. Edit the request and add it again.`,
      );
      expect(toast("success")).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("uploads each file on its own and names only the one that failed", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { posted } = serve({
        submit: () => answer(201, CREATED),
        upload: (names) => (names.includes("second.pdf") ? answer(500, { detail: "boom" }) : answer(201, [])),
      });

      await fillAndSubmit(file("first.pdf", "application/pdf"), file("second.pdf", "application/pdf"));

      await waitFor(() => expect(push).toHaveBeenCalledWith(REQUEST_PAGE));
      const uploads = posted.filter((p) => p.path.endsWith("/attachments")).map((p) => p.body);
      expect(uploads).toEqual([["first.pdf"], ["second.pdf"]]);
      const warning = toast("warning");
      expect(warning).toHaveTextContent("but second.pdf didn't upload");
      expect(warning).not.toHaveTextContent("first.pdf");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("opens a draft whose file did not upload, rather than the list, and says so", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      serve({
        draft: () => answer(201, bill({ id: "bill-new", reference: "PR-NEW", status: "draft" })),
        upload: () => answer(500, { detail: "boom" }),
      });
      show();
      await attach(file("invoice.pdf", "application/pdf"));

      await userEvent.click(saveDraft());

      await waitFor(() => expect(push).toHaveBeenCalledWith(REQUEST_PAGE));
      expect(toast("warning")).toHaveTextContent(
        "Draft saved, but invoice.pdf didn't upload. Edit the draft and add it again.",
      );
      expect(toast("success")).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("the company's currency", () => {
  // lib/entityCurrency.ts caches the code for the page's life, so each case takes fresh modules.
  async function showFresh() {
    vi.resetModules();
    const [{ PaymentRequestForm: Form }, { ToastProvider: Toasts }, { setAuth: auth }] = await Promise.all([
      import("@/components/PaymentRequestForm"),
      import("@/components/Toast"),
      import("@/lib/auth"),
    ]);
    auth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
    render(
      <Toasts>
        <Form />
      </Toasts>,
    );
  }

  it("is named in the amount's label", async () => {
    serve();
    await showFresh();
    expect(await screen.findByRole("textbox", { name: /Invoice amount \(HKD\)/ })).toBeInTheDocument();
    expect(saveDraft()).toBeEnabled();
  });

  it("says when the company has none, and sends nothing", async () => {
    const { posted } = serve({ currency: () => answer(200, { currency_code: "" }) });
    await showFresh();

    expect(await screen.findByText("Your company has no currency yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose one in Entity & Integration settings" })).toHaveAttribute(
      "href",
      expect.stringContaining(`/entity/${ENTITY_ID}/settings/integration`),
    );
    expect(submit()).toBeDisabled();
    expect(saveDraft()).toBeDisabled();
    expect(posted).toHaveLength(0);
  });

  it("tells a failed read apart from none set, and tries again", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let calls = 0;
      serve({
        currency: () => (++calls === 1 ? answer(500, { detail: "boom" }) : answer(200, { currency_code: "HKD" })),
      });
      await showFresh();

      expect(await screen.findByText("Your company's currency didn't load.")).toBeInTheDocument();
      expect(saveDraft()).toBeDisabled();

      await userEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByRole("textbox", { name: /Invoice amount \(HKD\)/ })).toBeInTheDocument();
      expect(saveDraft()).toBeEnabled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("the invoice files", () => {
  it("invites a file, says the limits up front, and names the control for a reader", () => {
    show();
    expect(screen.getByText("Add invoice photo or PDF")).toBeInTheDocument();
    expect(screen.getByText("PDF, JPEG, PNG or HTML · files up to 10 MB")).toBeInTheDocument();
    expect(filePicker()).toHaveAttribute("aria-required", "true");
  });

  it("is not red until a submit has been tried, and clears when a file arrives", async () => {
    show();
    expect(filePicker()).not.toHaveAttribute("aria-invalid");

    await userEvent.click(submit());
    await waitFor(() => expect(filePicker()).toHaveAttribute("aria-invalid", "true"));
    expect(filePicker()).toHaveAccessibleDescription(
      "The invoice is still missing. Add a photo or PDF of it to continue.",
    );

    await attach(file("receipt.png", "image/png"));
    await waitFor(() => expect(filePicker()).not.toHaveAttribute("aria-invalid"));
  });

  it("does not offer a spreadsheet in the picker at all", async () => {
    show();
    const accept = filePicker().getAttribute("accept") ?? "";
    expect(accept).not.toContain("xls");
    expect(accept).not.toContain("spreadsheet");
    await attach(file("books.xlsx", "application/vnd.ms-excel"));
    expect(screen.queryByText("books.xlsx")).toBeNull();
  });

  it("says at once, as it is dropped, that a spreadsheet can't be added", async () => {
    show();
    drop(filePicker() as HTMLInputElement, file("books.xlsx", "application/vnd.ms-excel"));
    expect(await screen.findByText("books.xlsx can't be added. Use a PDF, JPEG, PNG or HTML file.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview books.xlsx" })).toBeNull();
  });

  it("says at once that a file is over 10 MB", async () => {
    show();
    const big = file("huge.pdf", "application/pdf");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    drop(filePicker() as HTMLInputElement, big);
    expect(await screen.findByText("huge.pdf is over 10 MB. Files up to 10 MB can be added.")).toBeInTheDocument();
  });
});

// A staged file is PREVIEWED IN PLACE and enlarged full screen. It must never leave the app.
describe("previewing a staged file", () => {
  it("shows the file inline with no link out of the app", async () => {
    show();
    await attach(file("receipt.png", "image/png"));
    const pane = (await screen.findByRole("button", { name: "View full — receipt.png" })).parentElement as HTMLElement;
    expect(within(pane).getByAltText("receipt.png")).toBeInTheDocument();
    expect(within(pane).queryAllByRole("link")).toHaveLength(0);
    expect(pane.querySelector('[target="_blank"]')).toBeNull();
  });

  it("enlarges to a full-screen preview, and Escape closes only the preview", async () => {
    show();
    await attach(file("receipt.png", "image/png"));
    await userEvent.click(await screen.findByRole("button", { name: "View full — receipt.png" }));

    const close = await screen.findByRole("button", { name: "Close preview" });
    const viewer = close.closest('[role="dialog"]') as HTMLElement;
    expect(viewer).toHaveAttribute("aria-modal", "true");
    expect(within(viewer).queryAllByRole("link")).toHaveLength(0);

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Close preview" })).toBeNull());
    expect(submit()).toBeInTheDocument();
  });

  it("never offers a download for a file it cannot draw", async () => {
    show();
    await attach(file("payload.bin", "application/octet-stream"));
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
