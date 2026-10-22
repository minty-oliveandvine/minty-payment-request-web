"use client";

import Link from "next/link";

import { useClientValue } from "@minty/shared/clientValue";
import { pettyCashSettingsUrl } from "@minty/shared/companyRef";

import { getAuth } from "@/lib/auth";
import { useEntitlements } from "@/lib/moduleClaims";
import { useCompanyPages } from "@/lib/useCompanyPages";

export const SETTINGS_TAB_IDS = ["users", "xero", "entity", "bill", "modules"] as const;
export type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number];

const TABS: { id: SettingsTabId; label: string }[] = [
  { id: "users", label: "Users" },
  { id: "xero", label: "Entity & Integration" },
  { id: "entity", label: "Petty Cash Settings" },
  { id: "bill", label: "Payment Request Settings" },
  { id: "modules", label: "Modules" },
];

export const SETTINGS_TAB_LABELS: Record<SettingsTabId, string> = {
  users: "Users",
  xero: "Entity & Integration",
  entity: "Petty Cash Settings",
  bill: "Payment Request Settings",
  modules: "Modules",
};

export function getSettingsTabFromSearchParams(tab: string | null): SettingsTabId {
  if (tab && SETTINGS_TAB_IDS.includes(tab as SettingsTabId)) return tab as SettingsTabId;
  return "bill";
}

// The settings pills every app shows (the owner, 2026-10-19): minty-web's look - 44px rounded-lg
// pills that wrap, as in minty-web's SettingsTabs and the Petty Cash app's - in Part 13 tokens.
// These change PAGE, so they stay links (`aria-current` on the one shown).
const pillClass = (isActive: boolean) =>
  `flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border px-4 py-2 text-center text-body-m font-semibold transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
    isActive
      ? "border-border-selected bg-state-selected text-text-link"
      : "border-border-default bg-surface-card text-text-secondary hover:bg-state-hover"
  }`;

// Petty Cash Settings is `@minty/shared/companyRef`'s `pettyCashSettingsUrl` (owner 2026-10-21:
// one shared module): the Petty Cash app's settings page (minty-petty-cash-web), through Flask's
// login-gated `/handoff/petty-cash-web`, which mints that app's token for this company and lands
// on `next` - as minty-web's pill does. No token in the address: the Flask session is the
// credential, as for the other pills. The other three keep this app's own builders below: the
// package's `settingsSectionUrl` would send them through a different Flask route.

/** Entity & Integration (where Xero is connected) - also the way there from a Xero-less card. */
export const integrationTabUrl = (module1Url: string, entityId: string) =>
  `${module1Url}/entity/${encodeURIComponent(entityId)}/settings/integration`;

/**
 * Tabs that redirect to Flask Module 1 rather than staying in this Next.js app.
 * The URL builder receives the entityId stored in the billing auth cookie.
 */
const FLASK_REDIRECT_TABS: Partial<
  Record<SettingsTabId, (module1Url: string, entityId: string) => string>
> = {
  // Flask's company addresses (/entity/<id>/settings/...). It shows them as
  // /entity/<shortid>/<name>/settings/... - this app knows only the id (2026-10-05).
  users: (module1Url, entityId) =>
    `${module1Url}/entity/${encodeURIComponent(entityId)}/settings/users`,
  xero: integrationTabUrl,
  modules: (module1Url, entityId) =>
    `${module1Url}/entity/${encodeURIComponent(entityId)}/settings/modules`,
};

type SettingsPillsProps = {
  activeTab: SettingsTabId;
  entityId: string;
  module1Url: string;
};

export function SettingsPills({ activeTab, entityId, module1Url }: SettingsPillsProps) {
  // The "Petty Cash Settings" pill bounces the user over to Module 1; it makes
  // no sense for entities that don't have the petty cash module turned on, and
  // would land them on a screen they can't use. Filter it out when disabled.
  const { pettyCash: pettyCashEnabled } = useEntitlements();
  const pages = useCompanyPages();
  const entityName = useClientValue(
    () => getAuth()?.entityName ?? "",
    () => "",
  );
  const visibleTabs = TABS.filter((t) => t.id !== "entity" || pettyCashEnabled);

  return (
    <nav className="w-full min-w-0" aria-label="Settings sections">
      {/* As every app's settings pills: one row that wraps, never a sideways scroll. */}
      <div className="flex min-w-0 flex-wrap gap-2">
        {visibleTabs.map(({ id, label }) => {
          const isActive = activeTab === id;
          const flaskUrl = FLASK_REDIRECT_TABS[id];
          const away =
            id === "entity"
              ? pettyCashSettingsUrl(module1Url, entityId, entityName)
              : flaskUrl?.(module1Url, entityId);

          // A real link (no token in it), so Payment Settings' "Leave without saving?"
          // (lib/leaveGuard.ts) holds it like any other way out of the page.
          if (away) {
            return (
              <a key={id} href={away} className={pillClass(isActive)}>
                {label}
              </a>
            );
          }

          return (
            <Link
              key={id}
              href={`${pages.settings}?tab=${id}`}
              scroll={false}
              className={pillClass(isActive)}
              aria-current={isActive ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
