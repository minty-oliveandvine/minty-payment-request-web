// Where the token arrives (app/landing/page.tsx): Minty's hand-off lands here with
// `?token=&entity_id=&entity_name=&next=`, the cookies are written, and the browser moves on.
//
// Pins the landing logic before it moves to @minty/shared (the shared-code refactor,
// 2026-10-21). jsdom implements no navigation and will not let `location.replace` be spied on,
// so the no-token trip is read off `withReturnOrigin`, which builds its address.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { getAuth } from "@/lib/auth";
import { env } from "@/lib/env";

import Landing from "../page";

const TOKEN = unsignedToken();
const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams(),
  returnOriginCalls: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => nav.params,
}));

vi.mock("@minty/shared/previewSibling", async (importOriginal) => {
  const real = await importOriginal<typeof import("@minty/shared/previewSibling")>();
  return {
    ...real,
    withReturnOrigin: (url: string, origin?: string) => {
      nav.returnOriginCalls.push(url);
      return real.withReturnOrigin(url, origin);
    },
  };
});

function land(query: Record<string, string>) {
  nav.params = new URLSearchParams(query);
  return render(<Landing />);
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  nav.returnOriginCalls.length = 0;
  // jsdom reports the unimplemented navigation of the no-token case through console.error.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("Pins the landing page before it moves to @minty/shared (the shared-code refactor, 2026-10-21)", () => {
  it("stores the token and the company, then replaces the address with `next`", async () => {
    land({ token: TOKEN, entity_id: ENTITY_ID, entity_name: ENTITY_NAME, next: "/entity/360812e1/olive-and-vine/payment-request" });

    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
    expect(nav.replace).toHaveBeenCalledWith("/entity/360812e1/olive-and-vine/payment-request");
    expect(getAuth()).toEqual({ token: TOKEN, entityId: ENTITY_ID, entityName: ENTITY_NAME });
  });

  it("goes to / with no `next` - the middleware moves that to the company's list", async () => {
    land({ token: TOKEN, entity_id: ENTITY_ID, entity_name: ENTITY_NAME });

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"));
  });

  it("keeps the query and the hash of a safe `next`", async () => {
    land({ token: TOKEN, entity_id: ENTITY_ID, next: "/entity/360812e1/olive-and-vine/payment-request?view=easy#top" });

    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith("/entity/360812e1/olive-and-vine/payment-request?view=easy#top"),
    );
  });

  it.each([
    ["another origin", "https://evil.example/steal"],
    ["a protocol-relative address", "//evil.example/steal"],
    ["a backslash trick", "/\\evil.example"],
    ["a relative path", "entity/x"],
  ])("refuses %s as `next` and goes to / instead", async (_label, next) => {
    land({ token: TOKEN, entity_id: ENTITY_ID, entity_name: ENTITY_NAME, next });

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"));
  });

  it("stores empty strings for a company the hand-off did not name - it still lands", async () => {
    land({ token: TOKEN });

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"));
    expect(getAuth()).toEqual({ token: TOKEN, entityId: "", entityName: "" });
  });

  it("with no token goes back into Minty's /entity, named for this origin, and stores nothing", async () => {
    land({ entity_id: ENTITY_ID, entity_name: ENTITY_NAME, next: "/settings" });

    await waitFor(() => expect(nav.returnOriginCalls).toEqual([`${env.PETTY_CASH_URL}/entity`]));
    expect(nav.replace).not.toHaveBeenCalled();
    expect(getAuth()).toBeNull();
  });

  it("treats an empty token as no token", async () => {
    land({ token: "", entity_id: ENTITY_ID });

    await waitFor(() => expect(nav.returnOriginCalls).toEqual([`${env.PETTY_CASH_URL}/entity`]));
    expect(getAuth()).toBeNull();
  });

  it("shows a loading line while it works", () => {
    land({ token: TOKEN, entity_id: ENTITY_ID });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
