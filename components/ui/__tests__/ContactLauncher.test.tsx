// The "Talk to Minty" cat in this app: the chat (drawn by @minty/shared/contact) sends through
// THIS app's reach into Flask - `POST /api/me/contact` with the bearer, the app's id and the
// cookie's company - and confirms with the app's toast. A refusal is Flask's own sentence.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/entities" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { ContactLauncher } from "@/components/ui/ContactLauncher";
import { SidebarProvider } from "@/components/ui/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { MINTY_MODULE_URL } from "@/lib/mintyUrls";

import { _setViewerLoaderForTests } from "@/lib/viewer";

const TOKEN = unsignedToken();
const fetchMock = vi.fn<typeof fetch>();

function serve(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function show() {
  render(
    <ToastProvider>
      <SidebarProvider look="classic">
        <ContactLauncher />
      </SidebarProvider>
    </ToastProvider>,
  );
}

async function writeAndSend() {
  await userEvent.click(await screen.findByRole("button", { name: "Talk to Minty" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Talk to Minty" }));
  const chat = within(screen.getByRole("dialog", { name: "Talk to Minty" }));
  await userEvent.click(chat.getByRole("button", { name: "Contact Support" }));
  // the chat asks one thing at a time; each is sent as its own answer
  for (const [label, value] of [
    ["Your name", "Olive Vine"],
    ["Your email", "olive@test.com"],
    ["Your company", "Olive Tree Cafe"],
  ]) {
    await userEvent.type(chat.getByLabelText(label), value);
    await userEvent.click(chat.getByRole("button", { name: "Send answer" }));
  }
  await userEvent.click(chat.getByRole("button", { name: "Getting started" }));
  await userEvent.type(chat.getByLabelText("Your message"), "How do I add a cashier?");
  await userEvent.click(chat.getByRole("button", { name: "Send answer" }));
  await userEvent.click(chat.getByRole("button", { name: "Send" }));
  return chat;
}

describe("ContactLauncher", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);

    setAuth(TOKEN, "e-company-a", "Company A Limited");
    window.history.replaceState({}, "", "/entities");
    _setViewerLoaderForTests(() => Promise.resolve({ name: "Olive Vine", initials: "OV" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    _setViewerLoaderForTests(null);
  });

  it("posts the message to Flask with the bearer and confirms with the toast", async () => {
    serve({ sent: true, reply_to: "olive@test.com" });
    show();
    const chat = await writeAndSend();

    expect(await chat.findByText(/Sent! We'll reply to olive@test.com/)).toBeInTheDocument();
    expect(await screen.findByText("Message sent. We'll reply by email.")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${MINTY_MODULE_URL.replace(/\/+$/, "")}/api/me/contact`);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Olive Vine",
      email: "olive@test.com",
      company: "Olive Tree Cafe",
      topic: "Getting started",
      message: "How do I add a cashier?",
      app: "minty-payment-request-web",
      entity: "e-company-a",
    });
  });

  it("shows Flask's refusal in the chat, with Try again", async () => {
    serve({ error: "That's a lot of messages in one hour. Try again later." }, 429);
    show();
    const chat = await writeAndSend();

    expect(
      await chat.findByText("That's a lot of messages in one hour. Try again later."),
    ).toBeInTheDocument();
    await waitFor(() => expect(chat.getByRole("button", { name: "Try again" })).toHaveFocus());
  });
});
