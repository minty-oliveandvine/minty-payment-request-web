// How dates are shown and reckoned: @minty/shared/dates (owner 2026-10-21: one shared module) as
// this app uses it, and the two helpers lib/dateDisplayFormat.ts keeps.
//
// Every case passes `timeZone` explicitly, so the suite says the same thing on a machine in
// Hong Kong and one in London. The one case that matters most is the UTC-to-Hong-Kong rollover:
// taking the first ten characters of an API timestamp is what once made the submitted-date
// column and its filter disagree.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HK_TIME_ZONE as BILLING_TIME_ZONE,
  formatDay as formatIsoDateForDisplay,
  formatInstantDay,
  isoDateInTimeZone,
} from "@minty/shared/dates";

import {
  formatLocalDateForDisplay,
  parseDdMmmYyyyToIso,
  todayLocalISODate,
} from "@/lib/dateDisplayFormat";

describe("todayLocalISODate", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("is the calendar day on the person's clock, not UTC's", () => {
    process.env.TZ = "Asia/Hong_Kong";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T18:00:00Z")); // 02:00 on 26 Oct in Hong Kong

    expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-25");
    expect(todayLocalISODate()).toBe("2026-10-26");
  });
});

describe("HK_TIME_ZONE", () => {
  it("is Hong Kong - display and date filtering must agree on it", () => {
    expect(BILLING_TIME_ZONE).toBe("Asia/Hong_Kong");
  });
});

describe("formatDay (was formatIsoDateForDisplay / formatIsoDateAsDdMmmYyyy)", () => {
  it.each([
    ["2026-03-03", "03 Mar 2026"],
    ["2026-12-31", "31 Dec 2026"],
    ["2026-01-01", "01 Jan 2026"],
    ["2024-02-29", "29 Feb 2024"],
  ])("shows %s as %s", (iso, shown) => {
    expect(formatIsoDateForDisplay(iso)).toBe(shown);
  });

  it("takes the date out of a full timestamp", () => {
    expect(formatIsoDateForDisplay("2026-03-03T23:59:59Z")).toBe("03 Mar 2026");
  });

  it("refuses a date the calendar has not got", () => {
    expect(formatIsoDateForDisplay("2026-02-30")).toBe("");
    expect(formatIsoDateForDisplay("2026-13-01")).toBe("");
    expect(formatIsoDateForDisplay("2026-00-10")).toBe("");
    expect(formatIsoDateForDisplay("2025-02-29")).toBe("");
  });

  it.each([
    ["", ""],
    ["blank", "   "],
    ["not a date", "03/03/2026"],
    ["short", "2026-3-3"],
  ])("is empty for %s", (_label, raw) => {
    expect(formatIsoDateForDisplay(raw)).toBe("");
  });
});

describe("formatLocalDateForDisplay", () => {
  it("reads the local calendar parts, so it never shifts a day", () => {
    // Built from local parts on purpose: a `new Date("2026-03-03")` is UTC midnight, which is
    // 2 March in any timezone behind UTC.
    expect(formatLocalDateForDisplay(new Date(2026, 2, 3, 0, 30))).toBe("03 Mar 2026");
    expect(formatLocalDateForDisplay(new Date(2026, 2, 3, 23, 30))).toBe("03 Mar 2026");
  });

  it("is empty for an invalid date", () => {
    expect(formatLocalDateForDisplay(new Date("nonsense"))).toBe("");
  });
});

// owner 2026-10-21: one shared module (@minty/shared/dates) - the zone comes FIRST now.
describe("isoDateInTimeZone(timeZone, date)", () => {
  it("rolls a UTC evening into the next Hong Kong day", () => {
    expect(isoDateInTimeZone(BILLING_TIME_ZONE, new Date("2026-08-31T18:00:00Z"))).toBe(
      "2026-09-01",
    );
  });

  it("keeps a UTC morning on the same Hong Kong day", () => {
    expect(isoDateInTimeZone(BILLING_TIME_ZONE, new Date("2026-08-31T02:00:00Z"))).toBe(
      "2026-08-31",
    );
  });

  it("is the UTC day when asked for UTC", () => {
    expect(isoDateInTimeZone("UTC", new Date("2026-08-31T18:00:00Z"))).toBe("2026-08-31");
  });

  it("compares correctly with a plain string comparison against a date input", () => {
    const day = isoDateInTimeZone(BILLING_TIME_ZONE, new Date("2026-08-31T18:00:00Z"));
    expect(day >= "2026-09-01").toBe(true);
    expect(day <= "2026-09-01").toBe(true);
  });

  it("is empty for an invalid date", () => {
    expect(isoDateInTimeZone(BILLING_TIME_ZONE, new Date("nonsense"))).toBe("");
  });
});

describe("formatInstantDay (was formatDateInTimeZoneForDisplay)", () => {
  it("shows the Hong Kong calendar day, padded, with no trailing dot on the month", () => {
    const shown = formatInstantDay(new Date("2026-02-28T18:00:00Z"), BILLING_TIME_ZONE);
    expect(shown).toBe("01 Mar 2026");
    expect(shown).not.toContain(".");
  });

  it("pads a single-digit day", () => {
    expect(formatInstantDay(new Date("2026-03-03T02:00:00Z"), BILLING_TIME_ZONE)).toBe(
      "03 Mar 2026",
    );
  });

  it("is empty for an invalid date", () => {
    expect(formatInstantDay(new Date("nonsense"), BILLING_TIME_ZONE)).toBe("");
  });

  // owner 2026-10-21: one shared module (@minty/shared/dates). The instant formatter took its
  // month from Intl's en-GB "short" month, which spells September "Sept" - so one September day
  // read two ways depending on the column, and the Intl spelling did not parse back. Both
  // formatters now take the month from one table: "Sep", and it reads back.
  it("spells September 'Sep', as formatDay does, and that spelling parses back", () => {
    const viaInstant = formatInstantDay(new Date("2026-09-01T02:00:00Z"), BILLING_TIME_ZONE);
    expect(viaInstant).toBe("01 Sep 2026");
    expect(viaInstant).toBe(formatIsoDateForDisplay("2026-09-01"));
    expect(parseDdMmmYyyyToIso(viaInstant)).toBe("2026-09-01");
  });
});

describe("parseDdMmmYyyyToIso", () => {
  it.each([
    ["01 Jan 2026", "2026-01-01"],
    ["1 Jan 2026", "2026-01-01"],
    ["03 Mar 2026", "2026-03-03"],
    ["31 Dec 2026", "2026-12-31"],
    ["1/Jan/2026", "2026-01-01"],
    ["03/Mar/2026", "2026-03-03"],
    ["  03 Mar 2026  ", "2026-03-03"],
    ["03 mar 2026", "2026-03-03"],
    ["29 Feb 2024", "2024-02-29"],
  ])("reads %s as %s", (raw, iso) => {
    expect(parseDdMmmYyyyToIso(raw)).toBe(iso);
  });

  it("passes an ISO date through, and an ISO prefix of a timestamp", () => {
    expect(parseDdMmmYyyyToIso("2026-03-03")).toBe("2026-03-03");
    expect(parseDdMmmYyyyToIso("2026-03-03T10:00:00Z")).toBe("2026-03-03");
  });

  it.each([
    ["an impossible day", "31 Feb 2026"],
    ["a 29 Feb outside a leap year", "29 Feb 2025"],
    ["an unknown month", "03 Mal 2026"],
    ["a numeric month", "03/03/2026"],
    ["an invalid ISO date", "2026-02-30"],
    ["words", "not a date"],
  ])("is null for %s", (_label, raw) => {
    expect(parseDdMmmYyyyToIso(raw)).toBeNull();
  });

  it("returns an empty string, NOT null, for a blank value - callers tell the two apart", () => {
    expect(parseDdMmmYyyyToIso("")).toBe("");
    expect(parseDdMmmYyyyToIso("   ")).toBe("");
  });
});
