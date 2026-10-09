// The bank slip dialog (components/payment-request/BankSlipDetailsModal.tsx).
//
// Its inline upload has to decide WHICH payment the slip belongs to, and that decision is made
// by `pickExistingPaymentIdForBankSlipUpload` - a private function inside this 984-line file.
// It is covered here through the upload's target rather than called directly: slower, and it
// needs the dialog mounted, but it proves the same two rules (newest pending, else newest
// settled) through the thing that actually matters, which payment the file lands on.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BankSlipDetailsModal,
  type BankSlipDetails,
} from "@/components/payment-request/BankSlipDetailsModal";
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
  PdfJsCanvasPreview: ({ title }: { title?: string }) => <div>{`pdf: ${title}`}</div>,
}));

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Call = { path: string; method: string; body: Record<string, unknown> | null };

function serve({
  payments = [],
  upload,
}: { payments?: ReturnType<typeof payment>[]; upload?: () => Response } = {}) {
  const calls: Call[] = [];
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const method = init?.method ?? "GET";
    const isJson = typeof init?.body === "string";
    if (method !== "GET") {
      calls.push({ path, method, body: isJson ? JSON.parse(String(init!.body)) : null });
    }
    if (path.endsWith("/auth/entity-currency")) return answer(200, { currency_code: "HKD" });
    if (path.endsWith("/auth/entitlements")) return answer(200, { billing_enabled: true });
    if (path.endsWith("/profile/me")) return answer(200, { member_entity_ids: [ENTITY_ID] });
    if (path.endsWith("/payments") && method === "GET") {
      return answer(200, { paid_total: "0.00", payments });
    }
    if (path.endsWith("/payments") && method === "POST") {
      return answer(201, payment({ id: "payment-new", bill_id: BILL_ID, payment_status: "pending" }));
    }
    if (path.includes("/attachments") && method === "POST") {
      return (upload ?? (() => answer(201, {})))();
    }
    if (path.includes("/attachments")) return answer(200, []);
    return answer(200, {});
  });
  return { calls };
}

const DETAILS: BankSlipDetails = {
  createdBy: "Olive Vine",
  createdAt: "10 Mar 2026",
  toName: "Young Bros Transport",
  toAccount: "1234567890",
  amount: "HKD 1,500.00",
  fromName: "Olive & Vine Ltd",
  fromAccount: "0987654321",
  when: "10 Mar 2026",
  files: [],
};

const onClose = vi.fn();
const onInlineUploadSuccess = vi.fn();

type Props = Parameters<typeof BankSlipDetailsModal>[0];

const show = (props: Partial<Props> = {}) =>
  render(
    <BankSlipDetailsModal
      open
      onClose={onClose}
      details={DETAILS}
      onInlineUploadSuccess={onInlineUploadSuccess}
      {...props}
    />,
  );

const dialog = () => screen.getAllByRole("dialog")[0];
const uploadButton = () => within(dialog()).getByRole("button", { name: /^Upload/ });
const filePicker = () => within(dialog()).getByLabelText("Choose bank slips to attach");
/** The dashed box behind the (invisible, overlaid) file input. */
const dropZone = () => filePicker().parentElement!.querySelector(".border-dashed") as HTMLElement;

const slip = (name = "slip.pdf") => new File(["%PDF-1.4"], name, { type: "application/pdf" });
const attachmentPosts = (calls: Call[]) =>
  calls.filter((c) => c.method === "POST" && c.path.includes("/attachments"));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);
  serve();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the dialog", () => {
  it("draws nothing while closed", () => {
    show({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names who is being paid", () => {
    show();

    expect(dialog()).toHaveTextContent("Young Bros Transport");
  });

  it("is headed 'Bank Slip' when it is only showing one", () => {
    show();

    expect(dialog()).toHaveTextContent("Bank Slip");
    expect(dialog()).not.toHaveTextContent("Upload Bank Slip");
  });

  it("is headed 'Upload Bank Slip' when it can take one", () => {
    show({ inlineUploadBillContext: { billId: BILL_ID, currencyCode: "HKD" } });

    expect(dialog()).toHaveTextContent("Upload Bank Slip");
  });

  it("closes on its own control, on Cancel, on Escape and on the backdrop", async () => {
    show();

    await userEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(3);

    await userEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).toHaveBeenCalledTimes(4);
  });
});

describe("the slips already on the payment", () => {
  it("are each offered for preview", () => {
    show({
      details: { ...DETAILS, files: [{ id: "f1", name: "slip-a.pdf" }, { id: "f2", name: "slip-b.pdf" }] },
    });

    expect(within(dialog()).getByRole("button", { name: "Preview slip-a.pdf" })).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "Preview slip-b.pdf" })).toBeInTheDocument();
  });

  it("can be deleted by default, and not when the caller says not to", () => {
    // `allowRemoveFiles` defaults to TRUE, so a caller that wants a view-only dialog has to
    // ask for it - worth knowing before adding a new call site.
    const files = [{ id: "f1", name: "slip-a.pdf" }];

    const view = show({ details: { ...DETAILS, files } });
    expect(within(dialog()).getByRole("button", { name: "Delete slip-a.pdf" })).toBeInTheDocument();
    view.unmount();

    show({ details: { ...DETAILS, files }, allowRemoveFiles: false });
    expect(within(dialog()).queryByRole("button", { name: "Delete slip-a.pdf" })).not.toBeInTheDocument();
  });

  it("ask before deleting, naming the file", async () => {
    show({ details: { ...DETAILS, files: [{ id: "f1", name: "slip-a.pdf" }] } });

    await userEvent.click(within(dialog()).getByRole("button", { name: "Delete slip-a.pdf" }));

    const confirm = screen.getByRole("alertdialog");
    expect(confirm).toHaveAccessibleName("Delete bank slip?");
    expect(confirm).toHaveTextContent("slip-a.pdf");
  });
});

describe("staging a slip to upload", () => {
  it("has nothing to upload until a file is chosen", () => {
    show({ inlineUploadBillContext: { billId: BILL_ID } });

    expect(uploadButton()).toBeDisabled();
  });

  it("offers the chosen file for preview and for removal", async () => {
    show({ inlineUploadBillContext: { billId: BILL_ID } });

    await userEvent.upload(filePicker(), slip());

    expect(within(dialog()).getByRole("button", { name: "Preview slip.pdf" })).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "Remove slip.pdf" })).toBeInTheDocument();
    expect(uploadButton()).toBeEnabled();
  });

  it("takes the file back off again", async () => {
    show({ inlineUploadBillContext: { billId: BILL_ID } });
    await userEvent.upload(filePicker(), slip());

    await userEvent.click(within(dialog()).getByRole("button", { name: "Remove slip.pdf" }));

    expect(uploadButton()).toBeDisabled();
  });
});

// The upload is mandatory when this dialog is taking one - but NOT when it is only listing
// slips a payment already has, which is why the marker is conditional.
describe("saying a slip is needed", () => {
  it("marks the upload mandatory and says so to a reader", () => {
    show({ inlineUploadBillContext: { billId: BILL_ID } });

    expect(within(dialog()).getByText(/Uploaded files/)).toHaveTextContent("*");
    expect(filePicker()).toHaveAttribute("aria-required", "true");
  });

  it("does not claim anything is mandatory when it is only showing saved slips", () => {
    show({ details: { ...DETAILS, files: [{ id: "f1", name: "paid.png" }] } });

    expect(within(dialog()).getByText(/Uploaded files/)).not.toHaveTextContent("*");
  });

  it("red-lines the drop zone when the file it was handed is refused", async () => {
    // Pressing Upload with nothing staged is not reachable - the button is disabled until a
    // file is staged (see "has nothing to upload until a file is chosen"), so the "I need at
    // least one bank slip" guard in handleCommitInlineUpload is belt-and-braces. A REFUSED
    // file is the path that actually leaves this dialog with an error and nothing staged.
    show({ inlineUploadBillContext: { billId: BILL_ID } });
    expect(dropZone()).toHaveClass("border-gray-300");

    const input = filePicker() as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [new File(["x"], "books.xlsx", { type: "application/vnd.ms-excel" })],
      configurable: true,
    });
    fireEvent.change(input);

    await waitFor(() => expect(dropZone()).toHaveClass("border-red-500"));
    expect(filePicker()).toHaveAttribute("aria-invalid", "true");
    expect(uploadButton()).toBeDisabled();
  });

  it("blames the server, not the drop zone, when the upload itself fails", async () => {
    // The files ARE staged, so this is not a "you forgot something" state and the box
    // must stay neutral - otherwise a failed POST looks like the user's mistake.
    serve({
      payments: [payment({ id: "p-done", bill_id: BILL_ID, payment_status: "completed" })],
      upload: () => answer(413, { detail: "Files need to be under 10MB." }),
    });
    show({ inlineUploadBillContext: { billId: BILL_ID } });
    await userEvent.upload(filePicker(), slip());

    await userEvent.click(uploadButton());

    expect(await within(dialog()).findByText("Files need to be under 10MB.")).toBeInTheDocument();
    expect(dropZone()).toHaveClass("border-gray-300");
    expect(filePicker()).not.toHaveAttribute("aria-invalid");
  });
});

// A slip is previewed in place and enlarged over the dialog. It never opens in a new tab -
// every one of these panes used to be wrapped in a target="_blank" link.
describe("previewing a slip", () => {
  it("enlarges a staged slip in-app, with no link out", async () => {
    show({ inlineUploadBillContext: { billId: BILL_ID } });
    await userEvent.upload(filePicker(), slip());
    await userEvent.click(within(dialog()).getByRole("button", { name: "Preview slip.pdf" }));

    const enlarge = await screen.findByRole("button", { name: "View full — slip.pdf" });
    expect(within(dialog()).queryAllByRole("link")).toHaveLength(0);

    await userEvent.click(enlarge);

    const viewer = (await screen.findByRole("button", { name: "Close preview" })).closest(
      '[role="dialog"]',
    ) as HTMLElement;
    expect(viewer).toHaveAttribute("aria-modal", "true");
    expect(within(viewer).queryAllByRole("link")).toHaveLength(0);
  });

  it("offers a saved slip the same enlarge control, not a new tab", async () => {
    show({
      details: { ...DETAILS, files: [{ id: "f1", name: "paid.png", previewUrl: "blob:paid" }] },
    });

    await userEvent.click(within(dialog()).getByRole("button", { name: "Preview paid.png" }));

    expect(await screen.findByRole("button", { name: "View full — paid.png" })).toBeInTheDocument();
    expect(within(dialog()).queryAllByRole("link")).toHaveLength(0);
  });
});

describe("which payment the slip lands on", () => {
  it("is the newest PENDING payment when there is one", async () => {
    const { calls } = serve({
      payments: [
        payment({ id: "p-settled-new", bill_id: BILL_ID, payment_status: "completed", payment_date: "2026-03-20" }),
        payment({ id: "p-pending-old", bill_id: BILL_ID, payment_status: "pending", payment_date: "2026-03-01" }),
        payment({ id: "p-pending-new", bill_id: BILL_ID, payment_status: "pending", payment_date: "2026-03-10" }),
      ],
    });
    show({ inlineUploadBillContext: { billId: BILL_ID } });
    await userEvent.upload(filePicker(), slip());

    await userEvent.click(uploadButton());

    await waitFor(() => expect(attachmentPosts(calls)).toHaveLength(1));
    expect(attachmentPosts(calls)[0].path).toContain("/payments/p-pending-new/attachments");
  });

  it("is the newest SETTLED payment when none is pending", async () => {
    const { calls } = serve({
      payments: [
        payment({ id: "p-old", bill_id: BILL_ID, payment_status: "completed", payment_date: "2026-03-01" }),
        payment({ id: "p-new", bill_id: BILL_ID, payment_status: "completed", payment_date: "2026-03-20" }),
      ],
    });
    show({ inlineUploadBillContext: { billId: BILL_ID } });
    await userEvent.upload(filePicker(), slip());

    await userEvent.click(uploadButton());

    await waitFor(() => expect(attachmentPosts(calls)).toHaveLength(1));
    expect(attachmentPosts(calls)[0].path).toContain("/payments/p-new/attachments");
  });

  it("ignores payments belonging to another request", async () => {
    const { calls } = serve({
      payments: [
        payment({ id: "p-other", bill_id: "another-bill", payment_status: "pending", payment_date: "2026-03-30" }),
        payment({ id: "p-ours", bill_id: BILL_ID, payment_status: "completed", payment_date: "2026-03-02" }),
      ],
    });
    show({ inlineUploadBillContext: { billId: BILL_ID } });
    await userEvent.upload(filePicker(), slip());

    await userEvent.click(uploadButton());

    await waitFor(() => expect(attachmentPosts(calls)).toHaveLength(1));
    expect(attachmentPosts(calls)[0].path).toContain("/payments/p-ours/attachments");
  });

  it("is a NEW pending payment when the request has none, then settled once the file is on", async () => {
    const { calls } = serve({ payments: [] });
    show({ inlineUploadBillContext: { billId: BILL_ID, currencyCode: "HKD" } });
    await userEvent.upload(filePicker(), slip());

    await userEvent.click(uploadButton());

    await waitFor(() => expect(attachmentPosts(calls)).toHaveLength(1));
    const created = calls.find((c) => c.method === "POST" && c.path.endsWith("/payments"));
    expect(created?.body).toMatchObject({ payment_status: "pending", currency_code: "HKD" });
    expect(attachmentPosts(calls)[0].path).toContain("/payments/payment-new/attachments");
    // The slip is what the payment was waiting for, so it is completed afterwards.
    const finalised = calls.find((c) => c.method === "PUT");
    expect(finalised?.body).toMatchObject({ payment_status: "completed" });
  });

  it("leaves a settled payment settled rather than updating it again", async () => {
    const { calls } = serve({
      payments: [payment({ id: "p-done", bill_id: BILL_ID, payment_status: "completed" })],
    });
    show({ inlineUploadBillContext: { billId: BILL_ID } });
    await userEvent.upload(filePicker(), slip());

    await userEvent.click(uploadButton());

    await waitFor(() => expect(attachmentPosts(calls)).toHaveLength(1));
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("uploads every staged slip to the same payment", async () => {
    const { calls } = serve({
      payments: [payment({ id: "p-done", bill_id: BILL_ID, payment_status: "completed" })],
    });
    show({ inlineUploadBillContext: { billId: BILL_ID } });
    await userEvent.upload(filePicker(), [slip("a.pdf"), slip("b.pdf")]);

    await userEvent.click(uploadButton());

    await waitFor(() => expect(attachmentPosts(calls)).toHaveLength(2));
    expect(new Set(attachmentPosts(calls).map((c) => c.path)).size).toBe(1);
  });

  it("says so when it saved", async () => {
    serve({ payments: [payment({ id: "p-done", bill_id: BILL_ID, payment_status: "completed" })] });
    show({ inlineUploadBillContext: { billId: BILL_ID } });
    await userEvent.upload(filePicker(), slip());

    await userEvent.click(uploadButton());

    await waitFor(() => expect(onInlineUploadSuccess).toHaveBeenCalledTimes(1));
  });
});

describe("an upload that failed", () => {
  it("says so in the API's own words", async () => {
    serve({
      payments: [payment({ id: "p-done", bill_id: BILL_ID, payment_status: "completed" })],
      upload: () => answer(413, { detail: "Files need to be under 10MB." }),
    });
    show({ inlineUploadBillContext: { billId: BILL_ID } });
    await userEvent.upload(filePicker(), slip());

    await userEvent.click(uploadButton());

    expect(await within(dialog()).findByText("Files need to be under 10MB.")).toBeInTheDocument();
    expect(onInlineUploadSuccess).not.toHaveBeenCalled();
  });

  it("takes back the payment it had to create, so no empty payment is left behind", async () => {
    const { calls } = serve({
      payments: [],
      upload: () => answer(500, { detail: "boom" }),
    });
    show({ inlineUploadBillContext: { billId: BILL_ID } });
    await userEvent.upload(filePicker(), slip());

    await userEvent.click(uploadButton());

    await waitFor(() =>
      expect(calls.some((c) => c.method === "DELETE" && c.path.includes("/payments/payment-new"))).toBe(
        true,
      ),
    );
  });
});
