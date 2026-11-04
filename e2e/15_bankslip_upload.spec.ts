// Uploading a bank slip from the list: the dialog closes once the slip is saved onto the
// request's payment, and the row shows its file count in place of the Upload button. A request
// with no payment yet is refused with what to do - the upload never creates a payment (2026-11-03:
// it used to make a 0.00 one with no date to hold the slip).
//
// STUBBED - every `/api/v1/**` call is answered here, so this needs `npm run dev` and nothing
// else, and no file ever reaches storage (the B2 bucket is shared with production).
//
// The desktop table also proves the Bankslip column ends on one right edge, so a row's (i)
// lines up whether it shows "Upload" or a file count.

import { expect, test, type Page, type Route } from "@playwright/test";

import { billListItem, payment } from "../lib/__fixtures__/bills";
import {
  cors,
  expectNoSideScroll,
  handoff,
  pagesOf,
  requireNextOnly,
  stubApi,
  stubCredentials,
  stubFlaskHub,
} from "./helpers";

const creds = () => stubCredentials();

const UPLOAD = billListItem({ id: "bill-up", contact: "Harbour Stationers", status: "submitted" });
const SLIP = billListItem({ id: "bill-slip", contact: "Kowloon Couriers", status: "submitted" });
const NONE = billListItem({ id: "bill-none", contact: "Lantau Printers", status: "submitted" });

const SLIP_FILE = {
  name: "slip.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4 e2e"),
};

const link = (id: string, name: string) => ({
  id,
  attachment_role: "bank_slip",
  sort_order: 0,
  note: "",
  created_at: "2026-10-12T02:00:00Z",
  attachment: {
    id: `file-${id}`,
    original_name: name,
    mime_type: "application/pdf",
    file_size: 12,
    file_extension: "pdf",
    storage_provider: "s3",
    created_at: "2026-10-12T02:00:00Z",
    download_url: "",
  },
});

/** Payments for the rows: one has a saved slip, one a payment that gains a slip when uploaded
 *  to, one no payment at all. Returns the payments created (there should never be any). */
async function stubPayments(page: Page) {
  let uploaded = false;
  const created: string[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      headers: cors(route),
      contentType: "application/json",
      body: JSON.stringify(body),
    });

  await page.route("**/api/v1/bills/bill-*/payments**", async (route) => {
    const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors(route) });
    const path = new URL(route.request().url()).pathname;

    if (path.includes("/bills/bill-slip/")) {
      if (path.endsWith("/attachments")) return json(route, [link("att-slip", "paid.pdf")]);
      return json(route, {
        paid_total: "6000.00",
        payments: [payment({ id: "pay-slip", bill_id: "bill-slip", payment_status: "completed" })],
      });
    }

    if (path.endsWith("/payments") && method === "POST") {
      created.push(path);
      return json(route, {}, 500);
    }
    if (path.includes("/bills/bill-none/")) {
      if (path.endsWith("/attachments")) return json(route, []);
      return json(route, { paid_total: "0.00", payments: [] });
    }

    const paid = payment({ id: "pay-up", bill_id: "bill-up", payment_status: "completed" });
    if (path.endsWith("/payments") && method === "GET") {
      return json(route, { paid_total: "1500.00", payments: [paid] });
    }
    if (path.endsWith("/attachments") && method === "POST") {
      uploaded = true;
      return json(route, link("att-up", SLIP_FILE.name), 201);
    }
    if (path.endsWith("/attachments"))
      return json(route, uploaded ? [link("att-up", SLIP_FILE.name)] : []);
    return json(route, {});
  });
  return created;
}

async function openList(page: Page, bills = [UPLOAD, SLIP]) {
  await stubFlaskHub(page);
  await stubApi(page, { bills });
  const created = await stubPayments(page);
  await handoff(page, creds(), pagesOf(creds()).list);
  await expect(
    page.getByRole("button", { name: /View bank slip — 1 file uploaded/ }).first(),
  ).toBeVisible();
  return created;
}

async function uploadFromRow(page: Page) {
  await page.getByRole("button", { name: "Upload", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: /Upload Bank Slip/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Choose bank slips to attach").setInputFiles(SLIP_FILE);
  await dialog.getByRole("button", { name: /^Upload/ }).click();
  return dialog;
}

test.beforeAll(async () => {
  await requireNextOnly();
});

for (const width of [360, 768, 1440]) {
  test(`the dialog closes once the slip is saved, and the row counts it (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const created = await openList(page);

    const dialog = await uploadFromRow(page);

    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: /View bank slip — 1 file uploaded/ }),
    ).toHaveCount(2);
    expect(created).toEqual([]);
    await expectNoSideScroll(page, width);
  });
}

test("a request with no payment yet asks for the payment first, and creates none", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  const created = await openList(page, [NONE, SLIP]);

  const dialog = await uploadFromRow(page);

  await expect(
    dialog.getByText(
      "This request has no payment yet. Record the payment first, then attach its bank slip.",
    ),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(created).toEqual([]);
  await expectNoSideScroll(page, 360);
});

test("the Bankslip column ends on one right edge, Upload or file count", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openList(page);

  // The (i) beside each row's control: the cell's last glyph.
  const infoRight = async (control: ReturnType<Page["getByRole"]>) => {
    const info = control
      .locator("xpath=../..")
      .locator("span.material-symbols-outlined", { hasText: "info" });
    const box = await info.boundingBox();
    if (!box) throw new Error("no (i) beside the control");
    return box.x + box.width;
  };
  const upload = page.getByRole("button", { name: "Upload", exact: true });
  const count = page.getByRole("button", { name: /View bank slip — 1 file uploaded/ });

  expect(Math.abs((await infoRight(upload)) - (await infoRight(count)))).toBeLessThanOrEqual(1);
});
