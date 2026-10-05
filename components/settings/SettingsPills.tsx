"use client";

import Link from "next/link";

import { useEntitlements } from "@/lib/moduleClaims";
import { useCompanyPages } from "@/lib/useCompanyPages";

export const SETTINGS_TAB_IDS = ["users", "xero", "entity", "bill", "modules"] as const;
export type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number];

const TABS: { id: SettingsTabId; label: string }[] = [
  { id: "users", label: "Users" },
  { id: "xero", label: "Entity & Integration" },
  { id: "entity", label: "Petty Cash Settings" },
  { id: "bill", label: "Payment Settings" },
  { id: "modules", label: "Module" },
];

export const SETTINGS_TAB_LABELS: Record<SettingsTabId, string> = {
  users: "Users",
  xero: "Entity & Integration",
  entity: "Petty Cash Settings",
  bill: "Payment Settings",
  modules: "Module",
};

export function getSettingsTabFromSearchParams(tab: string | null): SettingsTabId {
  if (tab && SETTINGS_TAB_IDS.includes(tab as SettingsTabId)) return tab as SettingsTabId;
  return "bill";
}

const pillClass = (isActive: boolean) =>
  `cursor-pointer shrink-0 rounded-full px-4 py-2 text-center text-sm font-medium transition-colors flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
    isActive ? "bg-secondary font-semibold text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
  }`;

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
  xero: (module1Url, entityId) =>
    `${module1Url}/entity/${encodeURIComponent(entityId)}/settings/integration`,
  entity: (module1Url, entityId) =>
    `${module1Url}/entity/${encodeURIComponent(entityId)}/settings/petty-cash`,
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
  const { pettyCashEnabled } = useEntitlements();
  const pages = useCompanyPages();
  const visibleTabs = TABS.filter((t) => t.id !== "entity" || pettyCashEnabled);

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 pb-1">
        {visibleTabs.map(({ id, label }) => {
          const isActive = activeTab === id;
          const flaskUrl = FLASK_REDIRECT_TABS[id];

          // A real link (no token in it), so Payment Settings' "Leave without saving?"
          // (lib/leaveGuard.ts) holds it like any other way out of the page.
          if (flaskUrl) {
            return (
              <a key={id} href={flaskUrl(module1Url, entityId)} className={pillClass(isActive)}>
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
    </div>
  );
}
