"use client";

import { Suspense } from "react";
import { Header } from "@/components/layout";
import { ModuleGate } from "@/components/ModuleGate";
import { SettingsContent } from "@/components/settings/SettingsContent";
import { Skeleton } from "@/components/ui/Skeleton";
import { getAuthSnapshot } from "@/lib/auth";
import { useClientValue } from "@/lib/useClientValue";
import { useCompanyPages } from "@/lib/useCompanyPages";

export default function SettingsPage() {
  // The Xero status is read by the account-code card, the one part that depends on it.
  const auth = useClientValue(getAuthSnapshot, null);
  const pages = useCompanyPages();

  return (
    <ModuleGate>
    <div className="flex h-dvh h-screen min-w-0 max-w-full flex-col overflow-hidden bg-surface-page">
      <Header
        title="Payment Request"
        backHref={pages.list}
        backLabel="Payment Requests"
        companyName={auth?.entityName || "Loading…"}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-[env(safe-area-inset-bottom,0px)]">
        <Suspense
          fallback={
            <div className="mx-auto w-full max-w-[1024px] px-4 py-6 sm:px-6" aria-busy="true">
              <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />
                ))}
              </div>
              <Skeleton className="mt-6 h-48 rounded-lg" />
            </div>
          }
        >
          <SettingsContent />
        </Suspense>
      </main>
    </div>
    </ModuleGate>
  );
}
