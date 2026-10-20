// The local defaults are the owner's port layout (2026-10-16, Documents\dev.ps1): Flask (accounts-api)
// on 8000, minty-subscription-api on 8001. An app started without .env.local must reach the same
// services the e2e helpers stub and the dev launcher starts.

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("local defaults", () => {
  it("Flask on 8000 and subscription-api on 8001 when nothing is set", async () => {
    vi.resetModules();
    vi.stubEnv("PETTY_CASH_URL", "");
    vi.stubEnv("SUBSCRIPTION_API_URL", "");
    const { env } = await import("@/lib/env");
    expect(env.PETTY_CASH_URL).toBe("http://localhost:8000");
    expect(env.SUBSCRIPTION_API_URL).toBe("http://localhost:8001");
  });
});
