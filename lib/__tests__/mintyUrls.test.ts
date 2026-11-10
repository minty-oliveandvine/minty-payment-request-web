// Where this app sends the browser when it leaves (lib/mintyUrls.ts + lib/useCompanyPages.ts).
//
// Every URL is asserted against `env.ACCOUNTS_API_URL`, never a literal port: .env.local puts
// Flask on 5001 for the Xero callback while lib/env.ts defaults to 8000, and Vitest loads the
// .env files, so a hardcoded port would pass on one machine and fail on another.

import { describe, expect, it, vi } from "vitest";

import { unsignedToken } from "@/lib/__fixtures__/tokens";
import { setAuth } from "@/lib/auth";
import { cookieCompanyPages } from "@/lib/useCompanyPages";
import { env } from "@/lib/env";
import { MINTY_MODULE_URL, buildMintyEnterUrl, postNavigate } from "@/lib/mintyUrls";

const TOKEN = unsignedToken();
const ENTITY_ID = "360812e1-9f3a-4c21-8e5b-1a2b3c4d5e6f";
const ENTITY_NAME = "Olive & Vine";

describe("MINTY_MODULE_URL", () => {
  it("is the one Petty Cash origin lib/env.ts resolved, with no trailing slash", () => {
    expect(MINTY_MODULE_URL).toBe(env.ACCOUNTS_API_URL);
    expect(MINTY_MODULE_URL.endsWith("/")).toBe(false);
  });
});

describe("buildMintyEnterUrl", () => {
  it("enters through the company on the accounts-api session, never carrying the token", () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);

    const url = new URL(buildMintyEnterUrl());

    expect(url.origin + url.pathname).toBe(`${env.ACCOUNTS_API_URL}/entity/${ENTITY_ID}/enter`);
    expect(url.searchParams.has("token")).toBe(false); // gap 4: the session carries it
    expect(url.searchParams.has("next")).toBe(false);
  });

  it("adds the page to land on", () => {
    setAuth(TOKEN, ENTITY_ID, ENTITY_NAME);

    const url = new URL(buildMintyEnterUrl("/entity/e1/petty-cash/reports"));

    expect(url.searchParams.get("next")).toBe("/entity/e1/petty-cash/reports");
  });

  it("falls back to Minty's entity list with no session", () => {
    expect(buildMintyEnterUrl()).toBe(`${env.ACCOUNTS_API_URL}/entity`);
    expect(buildMintyEnterUrl("/anywhere")).toBe(`${env.ACCOUNTS_API_URL}/entity`);
  });

  it("falls back when there is a token but no company", () => {
    setAuth(TOKEN, "", "");
    expect(buildMintyEnterUrl()).toBe(`${env.ACCOUNTS_API_URL}/entity`);
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

// Minty's /logout takes a POST only (a GET answers 405), from a front end's Origin: a top-level
// form POST, never fetch and never location.
describe("postNavigate", () => {
  it("submits a hidden, empty POST form to the address, with a referrer policy that keeps Origin", () => {
    const submitted: HTMLFormElement[] = [];
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (
      this: HTMLFormElement,
    ) {
      submitted.push(this);
    });

    postNavigate(`${MINTY_MODULE_URL}/logout`);

    expect(submitted).toHaveLength(1);
    const [form] = submitted;
    expect(form.getAttribute("method")).toBe("POST");
    expect(form.getAttribute("action")).toBe(`${MINTY_MODULE_URL}/logout`);
    expect(form.hidden).toBe(true);
    expect(form.elements).toHaveLength(0);
    expect(form.isConnected).toBe(true);
    const meta = document.head.querySelector('meta[name="referrer"]');
    expect(meta?.getAttribute("content")).toBe("strict-origin");
  });
});
