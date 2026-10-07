// Where this app sends the browser when it leaves (lib/mintyUrls.ts + lib/useCompanyPages.ts).
//
// Every URL is asserted against `env.PETTY_CASH_URL`, never a literal port: .env.local puts
// Flask on 5001 for the Xero callback while lib/env.ts defaults to 8010, and Vitest loads the
// .env files, so a hardcoded port would pass on one machine and fail on another.

import { describe, expect, it } from "vitest";

import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { cookieCompanyPages } from "@/lib/useCompanyPages";
import { env } from "@/lib/env";
import { MINTY_MODULE_URL, buildMintyEnterUrl, buildMintyProfileUrl } from "@/lib/mintyUrls";

const TOKEN = unsignedToken();
const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

describe("MINTY_MODULE_URL", () => {
  it("is the one Petty Cash origin lib/env.ts resolved, with no trailing slash", () => {
    expect(MINTY_MODULE_URL).toBe(env.PETTY_CASH_URL);
    expect(MINTY_MODULE_URL.endsWith("/")).toBe(false);
  });
});

describe("buildMintyEnterUrl", () => {
  it("enters through the company, carrying the token, so a lapsed Flask session is remade", () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);

    const url = new URL(buildMintyEnterUrl());

    expect(url.origin + url.pathname).toBe(`${env.PETTY_CASH_URL}/entity/${ENTITY_ID}/enter`);
    expect(url.searchParams.get("token")).toBe(TOKEN);
    expect(url.searchParams.has("next")).toBe(false);
  });

  it("adds the page to land on", () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);

    const url = new URL(buildMintyEnterUrl("/entity/e1/petty-cash/reports"));

    expect(url.searchParams.get("next")).toBe("/entity/e1/petty-cash/reports");
  });

  it("falls back to Minty's entity list with no session", () => {
    expect(buildMintyEnterUrl()).toBe(`${env.PETTY_CASH_URL}/entity`);
    expect(buildMintyEnterUrl("/anywhere")).toBe(`${env.PETTY_CASH_URL}/entity`);
  });

  it("falls back when there is a token but no company", () => {
    setAuth(TOKEN, "", "");
    expect(buildMintyEnterUrl()).toBe(`${env.PETTY_CASH_URL}/entity`);
  });
});

describe("buildMintyProfileUrl", () => {
  it("names the company it was opened in, through /enter", () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);

    const url = new URL(buildMintyProfileUrl());
    const next = new URLSearchParams(url.search).get("next")!;

    expect(url.pathname).toBe(`/entity/${ENTITY_ID}/enter`);
    expect(next).toBe(`/profile?entity_id=${ENTITY_ID}`);
  });

  it("carries no from=bills - the profile's Back returns where the person came from", () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);
    expect(buildMintyProfileUrl()).not.toContain("from=bills");
  });

  it("goes straight to Minty's profile router with no company in the cookie", () => {
    expect(buildMintyProfileUrl()).toBe(`${env.PETTY_CASH_URL}/profile`);
  });
});

describe("cookieCompanyPages", () => {
  it("is the cookie company's three pages", () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);

    const pages = cookieCompanyPages()!;

    expect(pages.list).toBe("/entity/360812e1/olive-and-vine/payment-request");
    expect(pages.settings).toBe("/entity/360812e1/olive-and-vine/settings/payment-request");
    expect(pages.request("bill-1", "PR-0001")).toBe(
      "/entity/360812e1/olive-and-vine/payment-request/PR-0001",
    );
  });

  it("is null with no session, and null with a token but no company", () => {
    expect(cookieCompanyPages()).toBeNull();
    setAuth(TOKEN, "", "");
    expect(cookieCompanyPages()).toBeNull();
  });
});
