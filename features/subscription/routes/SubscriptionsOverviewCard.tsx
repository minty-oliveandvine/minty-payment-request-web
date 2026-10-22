"use client";

/**
 * My Profile's "Subscriptions Overview" (Figma 10-A / 10-B): how many companies the person pays
 * for, how many have a trial ending, and *Manage Subscription* into minty-web's portal - or,
 * paying for none, "It looks a little quiet here. No entity subscriptions yet."
 *
 * The card is `@minty/shared/profile`'s since v0.6 (the owner, 2026-10-20: one implementation for
 * every app - it was a copy of minty-web's); its figures are minty-web's `overview`, lifted into
 * the package. This file is this app's part: the read over `/api/me/subscriptions`, every page -
 * `@minty/shared/portal`'s `fetchAllSubscriptions` (owner 2026-10-21: one shared module) over this
 * app's subscription-api client, a wrong-shaped page refused as this app's ApiError(502).
 * Manage Subscription is the host's `links.subscriptions()` - minty-web's portal, through Flask.
 */

import {
  SubscriptionsOverviewCard as SharedSubscriptionsOverviewCard,
  type SubscriptionsList,
} from "@minty/shared/profile";

import { ApiError } from "@minty/shared/apiClient";
import { fetchAllSubscriptions, type AllSubscriptions } from "@minty/shared/portal";

import { subscriptionApi } from "@/components/ui/sidebarHost";

/** Every company the person is responsible for, every page walked. */
export function loadSubscriptions(signal?: AbortSignal): Promise<AllSubscriptions> {
  return fetchAllSubscriptions(subscriptionApi.json, {
    signal,
    shapeError: (status, message) => new ApiError(status, message),
  });
}

const load = (signal: AbortSignal): Promise<SubscriptionsList> => loadSubscriptions(signal);

/** Rendered by the shell into My Profile's `subscriptions` slot. `today`: tests only. */
export function SubscriptionsOverviewCard({ today }: { today?: Date } = {}) {
  return <SharedSubscriptionsOverviewCard load={load} today={today} />;
}
