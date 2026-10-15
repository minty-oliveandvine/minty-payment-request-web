"use client";

// COPY of minty-web/features/subscription/routes/SubscriptionsOverviewCard.tsx (2026-09-30) -
// lifted into @minty/shared at Part 3 step 4; change all three (minty-web, here, Flask's port). Here *Manage Subscription* leaves for
// minty-web's portal (through Flask's re-handoff) - this app has no portal landing of its own.

/**
 * My Profile's "Subscriptions Overview" (Figma 10-A / 10-B): how many companies the person pays
 * for, how many have a trial ending, and *Manage Subscription* into the portal (08-A) - or, paying
 * for none, "It looks a little quiet here. No entity subscriptions yet."
 *
 * It is the subscription feature's, not the profile's: the figures are 08-A's own (`overview`
 * over the same `/api/me/subscriptions` read), so the profile and the portal can never disagree
 * about them. The shell composes it into the profile's slot (`app/layout.tsx`).
 *
 * A read that fails - a 404 included; there is no "dark" switch any more (2026-10-01) - says so
 * in the card, with Try again.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { links } from "@/components/ui/sidebarHost";
import { ApiError } from "@/lib/api";

import { fetchAllPayerSubscriptions, type PortalEntity } from "@/features/subscription/api/payerSubscriptions";
import {
  ACTIVE_SUBSCRIPTIONS,
  entityUnit,
  MANAGE_SUBSCRIPTION,
  overview,
  TRIAL_ENDING,
} from "@/features/subscription/lib/overview";

export const PROFILE_OVERVIEW_TITLE = "Subscriptions Overview";
export const NO_SUBSCRIPTIONS = "It looks a little quiet here. No entity subscriptions yet.";
export const OVERVIEW_LOAD_FAILED = "Your subscriptions didn't load. Mind trying again?";

type Loaded = { attempt: number; list: PortalEntity[] | null; error: string | null };

function Figure({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-caption leading-5 text-text-secondary">{label}</p>
      <p className={`mt-2.5 text-xl leading-5 font-bold ${tone}`}>{value}</p>
      <p className="text-caption leading-5 text-text-muted">{entityUnit(value)}</p>
    </div>
  );
}

/** Rendered by the shell into My Profile's `subscriptions` slot. `today`: tests only. */
export function SubscriptionsOverviewCard({ today }: { today?: Date } = {}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAllPayerSubscriptions(controller.signal)
      .then(({ entities }) => {
        if (!controller.signal.aborted) setLoaded({ attempt, list: entities, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) return; // re-authenticating
        setLoaded({ attempt, list: null, error: OVERVIEW_LOAD_FAILED });
      });
    return () => controller.abort();
  }, [attempt]);

  const status =
    loaded === null || loaded.attempt !== attempt ? "loading" : loaded.error ? "error" : "ready";
  const list = status === "ready" ? (loaded?.list ?? null) : null;
  const figures = useMemo(() => (list ? overview(list, today ?? new Date()) : null), [list, today]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return (
    <section className="mt-[27px] flex flex-col" aria-labelledby="profile-subscriptions-overview">
      <h2 id="profile-subscriptions-overview" className="pl-[9px] text-caption leading-5 font-bold text-text-secondary">
        {PROFILE_OVERVIEW_TITLE}
      </h2>
      <div className="mt-2.5 flex min-h-[165px] flex-col items-center justify-center rounded-lg bg-surface-card px-4 py-[18px]">
        {status === "loading" ? (
          <div className="h-[120px] w-full animate-pulse rounded-lg bg-surface-sunk" role="status" aria-label="Loading your subscriptions" />
        ) : null}
        {status === "error" ? (
          <div className="flex flex-col items-center gap-3 text-center" role="alert">
            <p className="text-xs text-text-secondary">{loaded?.error}</p>
            <button
              type="button"
              onClick={retry}
              className="cursor-pointer rounded-lg bg-action-primary px-5 py-1.5 text-sm font-medium text-action-on-primary hover:bg-action-primary"
            >
              Try again
            </button>
          </div>
        ) : null}
        {list && list.length === 0 ? (
          <p className="text-center text-caption leading-5 text-text-secondary">{NO_SUBSCRIPTIONS}</p>
        ) : null}
        {list && list.length > 0 && figures ? (
          <>
            <div className="flex justify-center gap-[39px]">
              <Figure label={ACTIVE_SUBSCRIPTIONS} value={figures.active} tone="text-text-muted" />
              <Figure label={TRIAL_ENDING} value={figures.trialEnding} tone="text-status-warning-ink" />
            </div>
            <a
              href={links.subscriptions()}
              className="mt-[19px] flex h-[38px] w-[242px] items-center justify-center rounded-lg bg-action-primary text-sm leading-[21px] font-medium text-action-on-primary hover:bg-action-primary"
            >
              {MANAGE_SUBSCRIPTION}
            </a>
          </>
        ) : null}
      </div>
    </section>
  );
}
