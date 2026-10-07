// The Subscriptions Overview card's two figures (features/subscription/lib/overview.ts).
//
// e2e/05_sidebar.spec.ts asserts the rendered "Active subscriptions1entity" / "Trial
// ending1entity"; this pins the counting under it, with the dates stated rather than seeded.

import { describe, expect, it } from "vitest";

import type { ModuleStatus, PortalEntity, PortalModule } from "@/features/subscription/api/payerSubscriptions";
import { TRIAL_ENDING_DAYS, entityUnit, overview, utcDay } from "@/features/subscription/lib/overview";

const TODAY = new Date("2026-10-07T09:30:00Z");

const mod = (status: ModuleStatus, dateIso: string | null = null): PortalModule => ({
  code: "PAYMENT_REQUEST",
  name: "Payment Request",
  status,
  status_label: status,
  date_label: null,
  date: null,
  date_iso: dateIso,
});

const entity = (modules: PortalModule[], id = "e1"): PortalEntity => ({
  entity_id: id,
  entity_name: `Company ${id}`,
  country: null,
  country_code: null,
  subscriber: { id: "p1", name: "Olive Vine", email: "olive@minty.test" },
  modules,
  settings_path: `/entity/${id}/settings/modules`,
});

const inDays = (n: number) =>
  new Date(TODAY.getTime() + n * 86_400_000).toISOString().slice(0, 10);

describe("TRIAL_ENDING_DAYS", () => {
  it("is thirty days - a whole trial, so in practice every trial going on", () => {
    expect(TRIAL_ENDING_DAYS).toBe(30);
  });
});

describe("utcDay", () => {
  it("reads an ISO day as that day's UTC midnight", () => {
    expect(utcDay("2026-10-07")?.toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(utcDay("2026-10-07T23:59:59Z")?.toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });

  it("falls back to Date.parse, so an RFC 822 date is not silently null", () => {
    // The portal's API has written dates this way; a reader of the ISO prefix alone made every
    // one of them null, and the card then showed nothing.
    expect(utcDay("Sun, 18 Oct 2026 12:00:00 GMT")?.toISOString()).toBe("2026-10-18T00:00:00.000Z");
  });

  it("is null for nothing, and for a date it cannot read", () => {
    expect(utcDay(null)).toBeNull();
    expect(utcDay(undefined)).toBeNull();
    expect(utcDay("")).toBeNull();
    expect(utcDay("nonsense")).toBeNull();
  });
});

describe("overview", () => {
  it("counts no companies for an empty list", () => {
    expect(overview([], TODAY)).toEqual({ active: 0, trialEnding: 0 });
  });

  it("counts a company being paid for as active - and a cancelled one too, until it ends", () => {
    expect(overview([entity([mod("active")])], TODAY).active).toBe(1);
    expect(overview([entity([mod("cancelled")])], TODAY).active).toBe(1);
  });

  it("does not count a trial as active - nothing is charged yet", () => {
    expect(overview([entity([mod("trialing", inDays(5))])], TODAY).active).toBe(0);
  });

  it.each(["past_due", "ended", "trial_expired", "not_subscribed"] as const)(
    "does not count a %s company as active",
    (status) => {
      expect(overview([entity([mod(status)])], TODAY).active).toBe(0);
    },
  );

  it("counts the COMPANY once, however many of its modules are paid for", () => {
    const both = entity([mod("active"), { ...mod("active"), code: "PETTY_CASH" }]);
    expect(overview([both], TODAY).active).toBe(1);
  });

  it("counts a trial ending inside the window, including on the last day", () => {
    expect(overview([entity([mod("trialing", inDays(0))])], TODAY).trialEnding).toBe(1);
    expect(overview([entity([mod("trialing", inDays(TRIAL_ENDING_DAYS))])], TODAY).trialEnding).toBe(1);
  });

  it("does not count a trial ending past the window", () => {
    expect(
      overview([entity([mod("trialing", inDays(TRIAL_ENDING_DAYS + 1))])], TODAY).trialEnding,
    ).toBe(0);
  });

  it("counts a trial whose end has already gone by - it is ending, not ended", () => {
    expect(overview([entity([mod("trialing", inDays(-3))])], TODAY).trialEnding).toBe(1);
  });

  it("does not count a trial with no date at all", () => {
    expect(overview([entity([mod("trialing", null)])], TODAY).trialEnding).toBe(0);
  });

  it("counts both figures across several companies", () => {
    const figures = overview(
      [
        entity([mod("active")], "paid"),
        entity([mod("trialing", inDays(4))], "trial"),
        entity([mod("active"), { ...mod("trialing", inDays(2)), code: "PETTY_CASH" }], "both"),
        entity([mod("ended")], "gone"),
      ],
      TODAY,
    );
    expect(figures).toEqual({ active: 2, trialEnding: 2 });
  });
});

describe("entityUnit", () => {
  it("is singular for one and plural otherwise", () => {
    expect(entityUnit(1)).toBe("entity");
    expect(entityUnit(0)).toBe("entities");
    expect(entityUnit(2)).toBe("entities");
  });
});
