// Which payment request a details address names (lib/useRequestId.ts).
//
// The address can carry either an id or a Payment No., and a Payment No. costs a lookup - so
// the rules that matter are about not paying for it twice: once per company+reference, shared
// between the body and the header badge, and never at all once the page has told the module
// what it is showing.
//
// Each case uses a reference of its own, because `known` and `pending` are module-level maps
// that outlive a single test.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bill } from "@/lib/__fixtures__/bills";
import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { rememberRequest, useRequestId } from "@/lib/useRequestId";

const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const COMPANY = "360812e1";
const A_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

const params: { ref?: string; id?: string } = {};
vi.mock("next/navigation", () => ({
  useParams: () => params,
}));

const fetchMock = vi.fn<typeof fetch>();

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Renders the hook's three fields as text, so nothing here reads internal state. */
function Probe({ label = "probe" }: { label?: string }) {
  const { requestId, pending, error } = useRequestId();
  return (
    <p aria-label={label}>{`id=${requestId} pending=${pending} error=${error ?? ""}`}</p>
  );
}

const shown = (label = "probe") => screen.getByLabelText(label).textContent;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  setAuth(unsignedToken(), ENTITY_ID, "Olive & Vine");
  params.ref = COMPANY;
  params.id = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("an address carrying an id", () => {
  it("is used as it is, with no lookup at all", () => {
    params.id = A_UUID;

    render(<Probe />);

    expect(shown()).toBe(`id=${A_UUID} pending=false error=`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is recognised whatever the case of its hex", () => {
    params.id = A_UUID.toUpperCase();

    render(<Probe />);

    expect(shown()).toBe(`id=${A_UUID.toUpperCase()} pending=false error=`);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("an address carrying a Payment No.", () => {
  it("looks it up once and reports the id", async () => {
    params.id = "PR-LOOKUP-1";
    fetchMock.mockResolvedValueOnce(answer(200, bill({ id: "bill-1", reference: "PR-LOOKUP-1" })));

    render(<Probe />);

    expect(shown()).toContain("pending=true");
    await waitFor(() => expect(shown()).toBe("id=bill-1 pending=false error="));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${env.PAYMENT_REQUEST_API_URL}/api/v1/bills/by-reference/PR-LOOKUP-1`,
    );
  });

  it("remembers it, so a later mount costs nothing", async () => {
    params.id = "PR-LOOKUP-2";
    fetchMock.mockResolvedValueOnce(answer(200, bill({ id: "bill-2", reference: "PR-LOOKUP-2" })));

    const first = render(<Probe />);
    await waitFor(() => expect(shown()).toContain("id=bill-2"));
    first.unmount();

    render(<Probe />);

    expect(shown()).toBe("id=bill-2 pending=false error=");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is looked up ONCE for two readers mounting together - the body and the header badge", async () => {
    params.id = "PR-LOOKUP-3";
    fetchMock.mockResolvedValueOnce(answer(200, bill({ id: "bill-3", reference: "PR-LOOKUP-3" })));

    render(
      <>
        <Probe label="body" />
        <Probe label="badge" />
      </>,
    );

    await waitFor(() => expect(shown("body")).toContain("id=bill-3"));
    expect(shown("badge")).toContain("id=bill-3");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is read percent-decoded and sent encoded again", async () => {
    params.id = encodeURIComponent("PR/LOOKUP/4");
    fetchMock.mockResolvedValueOnce(answer(200, bill({ id: "bill-4" })));

    render(<Probe />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${env.PAYMENT_REQUEST_API_URL}/api/v1/bills/by-reference/PR%2FLOOKUP%2F4`,
    );
  });

  it("keys the lookup per company, so two companies' same Payment No. do not collide", async () => {
    params.id = "PR-SHARED";
    fetchMock.mockResolvedValueOnce(answer(200, bill({ id: "bill-here" })));
    const first = render(<Probe />);
    await waitFor(() => expect(shown()).toContain("id=bill-here"));
    first.unmount();

    params.ref = "99999999";
    fetchMock.mockResolvedValueOnce(answer(200, bill({ id: "bill-there" })));
    render(<Probe />);

    await waitFor(() => expect(shown()).toContain("id=bill-there"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("rememberRequest", () => {
  it("means the address change to a Payment No. costs no lookup", () => {
    rememberRequest(COMPANY, "PR-REMEMBERED", "bill-remembered");
    params.id = "PR-REMEMBERED";

    render(<Probe />);

    expect(shown()).toBe("id=bill-remembered pending=false error=");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("matches case-insensitively, as the API does", () => {
    rememberRequest(COMPANY, "PR-CASE", "bill-case");
    params.id = "pr-case";

    render(<Probe />);

    expect(shown()).toBe("id=bill-case pending=false error=");
  });

  it("remembers nothing for a blank reference", () => {
    rememberRequest(COMPANY, "   ", "bill-blank");
    params.id = "PR-BLANK";
    fetchMock.mockResolvedValueOnce(answer(404, { detail: "no such bill" }));

    render(<Probe />);

    expect(shown()).toContain("pending=true");
  });
});

describe("a Payment No. that names nothing", () => {
  it("says it may have been renamed or removed", async () => {
    params.id = "PR-GONE";
    fetchMock.mockResolvedValueOnce(answer(404, { detail: "no such bill" }));

    render(<Probe />);

    await waitFor(() =>
      expect(shown()).toBe(
        "id= pending=false error=I couldn't find that payment request. It may have been renamed or removed.",
      ),
    );
  });

  it("shows the server's own trouble for anything that is not a 404", async () => {
    params.id = "PR-BROKEN";
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Internal Server Error" }), {
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    render(<Probe />);

    await waitFor(() =>
      expect(shown()).toBe("id= pending=false error=Something went wrong on my end. Mind trying again?"),
    );
  });

  it("is tried again on a later mount - a failure is not remembered", async () => {
    params.id = "PR-RETRY";
    fetchMock.mockResolvedValueOnce(answer(404, { detail: "no" }));
    const first = render(<Probe />);
    await waitFor(() => expect(shown()).toContain("error=I couldn't find"));
    first.unmount();

    fetchMock.mockResolvedValueOnce(answer(200, bill({ id: "bill-retry" })));
    render(<Probe />);

    await waitFor(() => expect(shown()).toContain("id=bill-retry"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("an address naming no request at all", () => {
  it("reports nothing and asks nothing", () => {
    params.id = undefined;

    render(<Probe />);

    expect(shown()).toBe("id= pending=false error=");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
