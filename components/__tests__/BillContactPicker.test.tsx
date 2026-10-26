// Picking or creating a supplier (components/BillContactPicker.tsx), and the two dedupe helpers
// the list is built with (lib/api.ts).
//
// The dedupe matters because the API has sent the same supplier twice - once with its Xero
// ContactID in another case, once with doubled whitespace in the name - and a picker showing a
// supplier twice is a picker nobody trusts.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BillContactPicker } from "@/components/BillContactPicker";
import { ToastProvider } from "@/components/Toast";
import { SUPPLIERS, WITH_DUPLICATES, entityBillContact } from "@/lib/__fixtures__/contacts";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { dedupeEntityBillContactsByXeroId, dedupeEntityBillContactsForPicker } from "@/lib/api";
import { setAuth } from "@/lib/auth";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const onChange = vi.fn<(patch: { xero_contact_id: string; contact: string }) => void>();
const refetchContacts = vi.fn<() => Promise<void>>(async () => {});

const show = (props: Partial<Parameters<typeof BillContactPicker>[0]> = {}) =>
  render(
    <ToastProvider>
      <BillContactPicker
        id="supplier"
        contacts={SUPPLIERS}
        xeroContactId=""
        contactName=""
        onChange={onChange}
        refetchContacts={refetchContacts}
        {...props}
      />
    </ToastProvider>,
  );

const field = () => screen.getByPlaceholderText("Select a supplier");
const options = () => within(screen.getByRole("listbox")).getAllByRole("option");

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken(), ENTITY_ID, ENTITY_NAME);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dedupeEntityBillContactsByXeroId", () => {
  it("keeps the first of two rows sharing a Xero ContactID, whatever the case or padding", () => {
    const deduped = dedupeEntityBillContactsByXeroId(WITH_DUPLICATES);

    expect(deduped.map((c) => c.id)).not.toContain("c-1-dup");
    expect(deduped.map((c) => c.id)).toContain("c-1");
  });

  it("keeps every row that has no Xero ContactID at all", () => {
    const rows = [
      entityBillContact({ id: "a", xero_contact_id: "", name: "One" }),
      entityBillContact({ id: "b", xero_contact_id: "", name: "Two" }),
    ];

    expect(dedupeEntityBillContactsByXeroId(rows).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("leaves a list with no duplicates alone", () => {
    expect(dedupeEntityBillContactsByXeroId(SUPPLIERS)).toHaveLength(SUPPLIERS.length);
  });
});

describe("dedupeEntityBillContactsForPicker", () => {
  it("collapses a repeated display name, however its whitespace is written", () => {
    const deduped = dedupeEntityBillContactsForPicker(WITH_DUPLICATES);

    expect(deduped.map((c) => c.id)).not.toContain("c-2-dup");
    expect(deduped.filter((c) => c.name.trim().startsWith("ABC"))).toHaveLength(1);
  });

  it("dedupes by id first, then by name", () => {
    const deduped = dedupeEntityBillContactsForPicker(WITH_DUPLICATES);

    expect(deduped.map((c) => c.id)).toEqual(["c-1", "c-2", "c-3", "c-blank"]);
  });

  it("keeps every nameless row rather than collapsing them into one", () => {
    const rows = [
      entityBillContact({ id: "a", xero_contact_id: "X1", name: "   " }),
      entityBillContact({ id: "b", xero_contact_id: "X2", name: "" }),
    ];

    expect(dedupeEntityBillContactsForPicker(rows).map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("the picker", () => {
  it("opens on focus and offers every supplier", async () => {
    show();

    await userEvent.click(field());

    expect(options().map((o) => o.textContent)).toEqual(SUPPLIERS.map((s) => s.name));
  });

  it("narrows the list as the name is typed, ignoring case", async () => {
    show({ contactName: "furn" });

    await userEvent.click(field());

    // A partial name is also a name the company has not got, so the create option stands
    // beside the one match - matched by its accessible name, which is what a reader hears.
    expect(screen.getByRole("option", { name: "ABC Furniture" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Add furn as a new supplier" })).toBeInTheDocument();
    expect(options()).toHaveLength(2);
  });

  it("reports the supplier that was picked, with its Xero id", async () => {
    show();
    await userEvent.click(field());

    await userEvent.click(screen.getByRole("option", { name: "ABC Furniture" }));

    expect(onChange).toHaveBeenCalledWith({ xero_contact_id: "XERO-2", contact: "ABC Furniture" });
  });

  it("offers to create a supplier the company has not got", async () => {
    show({ contactName: "Brand New Supplier" });

    await userEvent.click(field());

    expect(
      screen.getByRole("option", { name: "Add Brand New Supplier as a new supplier" }),
    ).toBeInTheDocument();
  });

  it("does not offer to create one that already exists", async () => {
    show({ contactName: "ABC Furniture" });

    await userEvent.click(field());

    expect(screen.queryByRole("option", { name: /as a new supplier/ })).not.toBeInTheDocument();
  });

  it("creates the supplier in Xero and reports it as chosen", async () => {
    const created = entityBillContact({
      id: "c-new",
      xero_contact_id: "XERO-NEW",
      name: "Brand New Supplier",
    });
    fetchMock.mockResolvedValueOnce(answer(201, created));
    show({ contactName: "Brand New Supplier" });
    await userEvent.click(field());

    await userEvent.click(screen.getByRole("option", { name: /as a new supplier/ }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        xero_contact_id: "XERO-NEW",
        contact: "Brand New Supplier",
      }),
    );
    expect(refetchContacts).toHaveBeenCalledWith(created);
  });

  it("says so when creating the supplier is refused, and chooses nothing", async () => {
    fetchMock.mockResolvedValueOnce(
      answer(422, { detail: "A supplier with that name already exists in Xero." }),
    );
    show({ contactName: "Brand New Supplier" });
    await userEvent.click(field());

    await userEvent.click(screen.getByRole("option", { name: /as a new supplier/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A supplier with that name already exists in Xero.",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  describe("a new supplier's name is capped at 100 characters", () => {
    const TOO_LONG = "Keep the supplier's name to 100 characters or fewer.";

    // Controlled like the real forms, so typing moves the value.
    function Typed({ initial }: { initial: string }) {
      const [name, setName] = useState(initial);
      return (
        <ToastProvider>
          <BillContactPicker
            id="supplier"
            contacts={SUPPLIERS}
            xeroContactId=""
            contactName={name}
            onChange={(p) => setName(p.contact)}
            refetchContacts={refetchContacts}
          />
        </ToastProvider>
      );
    }

    it("says so as the 101st character is typed, and clears it when one is removed", async () => {
      const { container } = render(<Typed initial={"A".repeat(100)} />);
      await userEvent.click(field());
      expect(screen.queryByText(TOO_LONG)).not.toBeInTheDocument();

      await userEvent.type(field(), "B");
      // Under the field (the open menu is portalled to <body>, so not inside the container)...
      expect(within(container).getByText(TOO_LONG)).toBeInTheDocument();
      expect(field()).toHaveAttribute("aria-invalid", "true");

      await userEvent.type(field(), "{Backspace}");
      expect(screen.queryByText(TOO_LONG)).not.toBeInTheDocument();
    });

    it("says why on the greyed-out option itself, so the open menu never hides the reason", async () => {
      show({ contactName: "A".repeat(101) });
      await userEvent.click(field());

      const add = within(screen.getByRole("listbox")).getByRole("option", {
        name: /as a new supplier/,
      });
      expect(add).toHaveAttribute("aria-disabled", "true");
      expect(within(add).getByText(TOO_LONG)).toBeInTheDocument();
      expect(add).toHaveAccessibleName(expect.stringContaining(TOO_LONG));
    });

    it("drops the reason from the option once the name fits again", async () => {
      show({ contactName: "A".repeat(100) });
      await userEvent.click(field());

      const add = within(screen.getByRole("listbox")).getByRole("option", {
        name: /as a new supplier/,
      });
      expect(add).not.toHaveAttribute("aria-disabled");
      expect(within(add).queryByText(TOO_LONG)).not.toBeInTheDocument();
    });

    it("will not create a supplier while the name is too long", async () => {
      const { container } = show({ contactName: "A".repeat(101) });
      await userEvent.click(field());

      await userEvent.click(screen.getByRole("option", { name: /as a new supplier/ }));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
      expect(within(container).getByText(TOO_LONG)).toBeInTheDocument();
    });

    it("creates one of exactly 100 characters", async () => {
      const name = "A".repeat(100);
      fetchMock.mockResolvedValueOnce(
        answer(201, entityBillContact({ id: "c-100", xero_contact_id: "XERO-100", name })),
      );
      show({ contactName: name });
      await userEvent.click(field());

      await userEvent.click(screen.getByRole("option", { name: /as a new supplier/ }));

      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith({ xero_contact_id: "XERO-100", contact: name }),
      );
    });
  });

  it("takes no input while disabled", async () => {
    show({ disabled: true });

    expect(field()).toBeDisabled();
    await userEvent.click(field());

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("says when the field is wrong", () => {
    show({ error: true });

    expect(field()).toHaveAttribute("aria-invalid", "true");
  });
});
