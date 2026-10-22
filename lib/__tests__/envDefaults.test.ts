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

// Pins lib/env.ts's url(raw, fallback) before it moves to @minty/shared (the shared-code
// refactor, 2026-10-21). `url` is private, so it is read through `env`, one variable at a time.
describe("url(raw, fallback), through env", () => {
  async function freshEnv(vars: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
    return (await import("@/lib/env")).env;
  }

  it("defaults the payment-request API to 8020", async () => {
    const env = await freshEnv({ PAYMENT_REQUEST_API_URL: "" });
    expect(env.PAYMENT_REQUEST_API_URL).toBe("http://localhost:8020");
  });

  it("falls back when the variable is missing altogether, not only when it is empty", async () => {
    const env = await freshEnv({ PETTY_CASH_URL: undefined });
    expect(env.PETTY_CASH_URL).toBe("http://localhost:8000");
  });

  it("falls back for a whitespace-only value", async () => {
    const env = await freshEnv({ SUBSCRIPTION_API_URL: "   " });
    expect(env.SUBSCRIPTION_API_URL).toBe("http://localhost:8001");
  });

  it("uses a set value, trimmed, with every trailing slash stripped", async () => {
    const env = await freshEnv({
      PETTY_CASH_URL: "  https://accounts-api.dailyminty.com///  ",
      PAYMENT_REQUEST_API_URL: "https://payment-request-api.example.test/",
    });
    expect(env.PETTY_CASH_URL).toBe("https://accounts-api.dailyminty.com");
    expect(env.PAYMENT_REQUEST_API_URL).toBe("https://payment-request-api.example.test");
  });

  it("keeps a path, and does not validate the value at all", async () => {
    const env = await freshEnv({
      PETTY_CASH_URL: "https://minty.test/base/",
      SUBSCRIPTION_API_URL: "not a url",
    });
    expect(env.PETTY_CASH_URL).toBe("https://minty.test/base");
    expect(env.SUBSCRIPTION_API_URL).toBe("not a url");
  });

  it("is a plain object of exactly the three URLs", async () => {
    const env = await freshEnv({});
    expect(Object.keys(env)).toEqual([
      "PETTY_CASH_URL",
      "PAYMENT_REQUEST_API_URL",
      "SUBSCRIPTION_API_URL",
    ]);
  });
});

// owner 2026-10-21: one shared module (@minty/shared/env). `envUrl` reads a lone "/" as blank
// and falls back (the old `url` kept it and stripped it to "", an empty base), and a production
// build with a variable unset throws rather than quietly pointing at localhost.
describe("envUrl's two rules the old url() did not have", () => {
  async function freshEnv(vars: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
    return import("@/lib/env");
  }

  it("takes a lone '/' as unset", async () => {
    const { env } = await freshEnv({ PETTY_CASH_URL: "/" });
    expect(env.PETTY_CASH_URL).toBe("http://localhost:8000");
  });

  it("throws in a production build, naming the variable that is missing", async () => {
    await expect(
      freshEnv({
        NODE_ENV: "production",
        PETTY_CASH_URL: "https://a.test",
        PAYMENT_REQUEST_API_URL: "",
        SUBSCRIPTION_API_URL: "https://s.test",
      }),
    ).rejects.toThrow(/PAYMENT_REQUEST_API_URL is not set/);
  });
});
