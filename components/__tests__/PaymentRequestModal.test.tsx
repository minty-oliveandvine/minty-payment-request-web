// The Add Payment dialog (components/PaymentRequestModal.tsx).
//
// e2e/02_bill_lifecycle.spec.ts walks the happy path in a browser. What the unit layer adds is
// the refusals - every required field, one at a time - and the two ways out, Save as Draft and
// Confirm, which post to different endpoints and must not be confused.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentRequestModal } from "@/components/PaymentRequestModal";
import { ToastProvider } from "@/components/Toast";
import { bill } from "@/lib/__fixtures__/bills";
import { SUPPLIERS } from "@/lib/__fixtures__/contacts";
import { entityBillAccounts } from "@/lib/__fixtures__/accounts";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

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

type Posted = { path: string; body: unknown };

function serve({ submit, draft }: { submit?: () => Response; draft?: () => Response } = {}) {
  const posted: Posted[] = [];
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname;
    if (path.endsWith("/auth/entity-currency")) return answer(200, { currency_code: "HKD" });
    if (path.endsWith("/auth/entitlements")) return answer(200, { billing_enabled: true });
    if (path.endsWith("/profile/me")) return answer(200, { member_entity_ids: [ENTITY_ID] });
    if (path.endsWith("/entity-bill-contacts/")) return answer(200, SUPPLIERS);
    if (path.includes("/entity-bill-accounts/")) return answer(200, entityBillAccounts());
    if (path.endsWith("/bills/suggested-reference/")) return answer(200, { reference: "MBIOVI-1" });
    if (path.endsWith("/currencies/")) return answer(200, []);
    if (init?.method === "POST") {
      posted.push({ path, body: init.body ? JSON.parse(String(init.body)) : null });
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

const dialog = () => screen.getByRole("dialog");
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

describe("the amount field", () => {
  it("takes digits and refuses the rest", async () => {
    show();
    const amount = within(dialog()).getByPlaceholderText("0.00");

    await userEvent.type(amount, "12abc34");

    expect(amount).toHaveValue("1234");
  });

  it("refuses a twelfth integer digit rather than truncating", async () => {
    show();
    const amount = within(dialog()).getByPlaceholderText("0.00");

    await userEvent.type(amount, "123456789012");

    expect(amount).toHaveValue("12345678901");
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
});
