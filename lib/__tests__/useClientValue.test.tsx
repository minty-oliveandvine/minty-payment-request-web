// A browser-only value read from a component that also renders on the server
// (@minty/shared/clientValue's useClientValue since the shared-code refactor, 2026-10-21; it was
// lib/useClientValue.ts, whose server snapshot was a value - the shared hook takes a getter).
//
// The server render shows `serverSnapshot`; a client render reads `getSnapshot`. Nothing
// subscribes, so a change underneath is only seen at the next render - which is the behaviour of
// the useState-in-an-effect pattern it replaced, and what a caller may rely on.

import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useClientValue } from "@minty/shared/clientValue";

function Probe({ read, server }: { read: () => string; server: string }) {
  return <p role="status">{useClientValue(read, () => server)}</p>;
}

describe("useClientValue, as this app uses it", () => {
  it("renders the server snapshot on the server, and never calls the browser read there", () => {
    let calls = 0;
    const read = () => {
      calls += 1;
      return "from the browser";
    };

    const html = renderToString(<Probe read={read} server="neutral" />);

    expect(html).toContain("neutral");
    expect(html).not.toContain("from the browser");
    expect(calls).toBe(0);
  });

  it("renders the browser's value on a client render", () => {
    render(<Probe read={() => "from the browser"} server="neutral" />);
    expect(screen.getByRole("status").textContent).toBe("from the browser");
  });

  it("does not notice a change by itself - nothing subscribes", () => {
    let value = "first";
    const read = () => value;
    const { rerender } = render(<Probe read={read} server="neutral" />);
    expect(screen.getByRole("status").textContent).toBe("first");

    act(() => {
      value = "second";
    });
    expect(screen.getByRole("status").textContent).toBe("first");

    rerender(<Probe read={read} server="neutral" />);
    expect(screen.getByRole("status").textContent).toBe("second");
  });
});
