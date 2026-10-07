// What the person may do (lib/useUserRole.ts). This hook gates the write controls in the
// toolbar, the void and publish actions on the detail page, the Save in Payment Settings and
// the read-only banner - it is the most security-relevant piece of client logic in the repo and
// had no test at all.
//
// It is a SIGNPOST, not the boundary: the API re-checks entity membership and the role on every
// call. These tests pin what the screen offers, not what is permitted.
//
// Nothing here asserts render counts or effect ordering. The hook is refactor site #7 of the
// thirteen set-state-in-effect errors, and this file has to survive that unchanged.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { useUserRole } from "@/lib/useUserRole";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const OTHER_ENTITY = "99999999-0000-0000-0000-000000000000";
const ENTITY_NAME = "Olive & Vine";

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The hook's answers as text, so no test reaches into its state. */
function Probe() {
  const { role, isElevated, hasAnyRole, isViewOnly, memberEntityIds, isReadOnly } = useUserRole();
  return (
    <ul>
      <li aria-label="role">{role ?? "none"}</li>
      <li aria-label="elevated">{String(isElevated)}</li>
      <li aria-label="anyRole">{String(hasAnyRole)}</li>
      <li aria-label="viewOnly">{String(isViewOnly)}</li>
      <li aria-label="members">{memberEntityIds.join(",") || "none"}</li>
      <li aria-label="readOnlyHere">{String(isReadOnly(ENTITY_ID))}</li>
      <li aria-label="readOnlyThere">{String(isReadOnly(OTHER_ENTITY))}</li>
    </ul>
  );
}

const value = (label: string) => screen.getByLabelText(label).textContent;

/** Render and wait until the claims have been read, so no case reads a first frame. */
async function show() {
  render(<Probe />);
  await waitFor(() => expect(screen.getByLabelText("role")).toBeInTheDocument());
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("with no token", () => {
  it("offers nothing, and asks nothing of the network", async () => {
    await show();

    await waitFor(() => expect(value("role")).toBe("none"));
    expect(value("anyRole")).toBe("false");
    expect(value("elevated")).toBe("false");
    expect(value("viewOnly")).toBe("false");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the five bill roles", () => {
  it.each([
    ["cashier", false],
    ["shop_manager", false],
    ["accountant", true],
    ["admin", true],
    ["super_admin", true],
  ])("%s is a bill role; elevated: %s", async (role, elevated) => {
    setAuth(unsignedToken({ role, system_role: "normal" }), ENTITY_ID, ENTITY_NAME);

    await show();

    await waitFor(() => expect(value("role")).toBe(role));
    expect(value("anyRole")).toBe("true");
    expect(value("elevated")).toBe(String(elevated));
  });

  it("reads a role written with spaces, hyphens or capitals", async () => {
    setAuth(unsignedToken({ role: "  Shop-Manager " }), ENTITY_ID, ENTITY_NAME);

    await show();

    await waitFor(() => expect(value("anyRole")).toBe("true"));
    // `role` is reported as the token wrote it; only the matching is normalised.
    expect(value("role")).toBe("  Shop-Manager ");
  });

  it("does not recognise a role outside the five", async () => {
    setAuth(unsignedToken({ role: "auditor" }), ENTITY_ID, ENTITY_NAME);

    await show();

    await waitFor(() => expect(value("role")).toBe("auditor"));
    expect(value("anyRole")).toBe("false");
    expect(value("elevated")).toBe("false");
  });

  it("reports no role for an empty one - Minty stamps '' for a non-member", async () => {
    setAuth(unsignedToken({ role: "" }), ENTITY_ID, ENTITY_NAME);

    await show();

    await waitFor(() => expect(value("anyRole")).toBe("false"));
    expect(value("role")).toBe("none");
  });
});

describe("the token's is_view_only claim", () => {
  it("is trusted when it is there - the backend computed it per entity", async () => {
    setAuth(
      unsignedToken({ role: "admin", system_role: "superuser", is_view_only: true }),
      ENTITY_ID,
      ENTITY_NAME,
    );
    fetchMock.mockResolvedValue(answer(200, { member_entity_ids: [ENTITY_ID] }));

    await show();

    await waitFor(() => expect(value("viewOnly")).toBe("true"));
    // And it costs an admin their write controls, membership list or not.
    expect(value("elevated")).toBe("false");
  });

  it("is trusted when it says the superuser is NOT view-only", async () => {
    setAuth(
      unsignedToken({ role: "super_admin", system_role: "superuser", is_view_only: false }),
      ENTITY_ID,
      ENTITY_NAME,
    );
    fetchMock.mockResolvedValue(answer(200, { member_entity_ids: [] }));

    await show();

    await waitFor(() => expect(value("role")).toBe("super_admin"));
    expect(value("viewOnly")).toBe("false");
    expect(value("elevated")).toBe("true");
    expect(value("readOnlyHere")).toBe("false");
  });

  it("leaves an ordinary member alone whatever the claim says about superusers", async () => {
    setAuth(unsignedToken({ role: "cashier", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);

    await show();

    await waitFor(() => expect(value("role")).toBe("cashier"));
    expect(value("viewOnly")).toBe("false");
    expect(value("readOnlyHere")).toBe("false");
    expect(value("readOnlyThere")).toBe("false");
  });
});

describe("a system superuser on a token without the claim", () => {
  const legacySuperuser = () =>
    setAuth(unsignedToken({ role: "admin", system_role: "superuser" }), ENTITY_ID, ENTITY_NAME);

  it("asks the profile endpoint which companies they are a member of", async () => {
    legacySuperuser();
    fetchMock.mockResolvedValue(answer(200, { member_entity_ids: [ENTITY_ID] }));

    await show();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${env.PAYMENT_REQUEST_API_URL}/api/v1/profile/me`);
    expect(new Headers(init?.headers).get("X-Entity-Id")).toBe(ENTITY_ID);
  });

  it("keeps their write controls on a company they are a member of", async () => {
    legacySuperuser();
    fetchMock.mockResolvedValue(answer(200, { member_entity_ids: [ENTITY_ID] }));

    await show();

    await waitFor(() => expect(value("viewOnly")).toBe("false"));
    expect(value("readOnlyHere")).toBe("false");
    // ...and takes them away on one they are not.
    expect(value("readOnlyThere")).toBe("true");
  });

  it("is view-only on a company they are not a member of", async () => {
    legacySuperuser();
    fetchMock.mockResolvedValue(answer(200, { member_entity_ids: [OTHER_ENTITY] }));

    await show();

    await waitFor(() => expect(value("viewOnly")).toBe("true"));
    expect(value("readOnlyHere")).toBe("true");
    expect(value("readOnlyThere")).toBe("false");
  });

  it("falls back to the most restrictive answer when the list does not load", async () => {
    // Non-fatal by design: an empty list means read-only everywhere rather than open.
    legacySuperuser();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await show();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(value("viewOnly")).toBe("true");
    expect(value("readOnlyHere")).toBe("true");
    expect(value("readOnlyThere")).toBe("true");
  });

  it("falls back the same way for a refused or unusable answer", async () => {
    legacySuperuser();
    fetchMock.mockResolvedValue(answer(403, { detail: "nope" }));

    await show();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(value("viewOnly")).toBe("true");
  });

  it("is view-only when no company is in the cookie at all", async () => {
    setAuth(unsignedToken({ role: "admin", system_role: "superuser" }), "", "");
    fetchMock.mockResolvedValue(answer(200, { member_entity_ids: [] }));

    await show();

    await waitFor(() => expect(value("viewOnly")).toBe("true"));
  });

  it("reports the membership list it was given", async () => {
    legacySuperuser();
    fetchMock.mockResolvedValue(answer(200, { member_entity_ids: [ENTITY_ID, OTHER_ENTITY] }));

    await show();

    await waitFor(() => expect(value("members")).toBe(`${ENTITY_ID},${OTHER_ENTITY}`));
  });
});

describe("the superuser check", () => {
  it("does not ask the profile endpoint for an ordinary member", async () => {
    setAuth(unsignedToken({ role: "admin", system_role: "normal" }), ENTITY_ID, ENTITY_NAME);

    await show();

    await waitFor(() => expect(value("role")).toBe("admin"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads 'superuser' whatever its case or padding", async () => {
    setAuth(unsignedToken({ role: "admin", system_role: "  SUPERUSER " }), ENTITY_ID, ENTITY_NAME);
    fetchMock.mockResolvedValue(answer(200, { member_entity_ids: [ENTITY_ID] }));

    await show();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});

describe("a malformed token", () => {
  it("offers nothing rather than crashing the page", async () => {
    setAuth("nonsense", ENTITY_ID, ENTITY_NAME);

    await show();

    await waitFor(() => expect(value("role")).toBe("none"));
    expect(value("anyRole")).toBe("false");
    expect(value("elevated")).toBe("false");
    expect(value("viewOnly")).toBe("false");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
