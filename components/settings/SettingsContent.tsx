"use client";

import { useSearchParams } from "next/navigation";
import { getEntityIdSnapshot } from "@/lib/auth";
import { useClientValue } from "@/lib/useClientValue";
import { AccountCodeSettings } from "./AccountCodeSettings";
import { getSettingsTabFromSearchParams, integrationTabUrl, SETTINGS_TAB_LABELS, SettingsPills } from "./SettingsPills";
import { SettingsPlaceholder } from "./SettingsPlaceholder";
import { MINTY_MODULE_URL } from "@/lib/mintyUrls";

export function SettingsContent() {
  const searchParams = useSearchParams();
  const tab = getSettingsTabFromSearchParams(searchParams.get("tab"));
  // Cookies are client-only, so this is read through useClientValue: "" on the server and at
  // hydration, the real company once mounted.
  const entityId = useClientValue(getEntityIdSnapshot, "");

  return (
    <div className="mx-auto w-full max-w-[1024px] px-4 sm:px-6">
      <h1 className="pt-6 text-display-m text-text-primary lg:pt-8">Settings</h1>
      <div className="sticky top-0 z-10 bg-surface-page pt-4 pb-3 sm:pb-4">
        <SettingsPills activeTab={tab} entityId={entityId} module1Url={MINTY_MODULE_URL} />
      </div>
      {tab === "bill" ? (
        <AccountCodeSettings integrationHref={integrationTabUrl(MINTY_MODULE_URL, entityId)} />
      ) : (
        <SettingsPlaceholder title={SETTINGS_TAB_LABELS[tab]} />
      )}
    </div>
  );
}
