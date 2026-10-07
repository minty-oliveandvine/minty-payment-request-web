"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout";
import { PaymentRequestDetailSkeleton } from "@/components/payment-request/PaymentRequestDetailSkeleton";
import { PaymentRequestDetailStatusBadge } from "@/components/payment-request/PaymentRequestDetailStatusBadge";
import { getAuthSnapshot } from "@/lib/auth";
import { fetchXeroStatus } from "@/lib/api";
import { useClientValue } from "@/lib/useClientValue";
import { useUserRole } from "@/lib/useUserRole";
import { useCompanyPages } from "@/lib/useCompanyPages";

const PaymentRequestDetailBody = dynamic(
  () => import("@/components/payment-request/PaymentRequestDetailBody").then((m) => ({ default: m.PaymentRequestDetailBody })),
  { loading: () => <PaymentRequestDetailSkeleton /> },
);

export function PaymentRequestDetailPageClient() {
  // The cookie is client-only: "" on the server and at hydration, the real company once mounted.
  const auth = useClientValue(getAuthSnapshot, null);
  const [xeroConnected, setXeroConnected] = useState<boolean>(false);
  const [billStatusRefresh, setBillStatusRefresh] = useState(0);
  const bumpBillStatusInHeader = useCallback(() => setBillStatusRefresh((n) => n + 1), []);
  const { isViewOnly, isReadOnly } = useUserRole();
  const pages = useCompanyPages();

  useEffect(() => {
    if (!auth?.token) return;
    fetchXeroStatus()
      .then(setXeroConnected)
      .catch((err: unknown) => console.error("[payment request] the Xero status did not load", err));
  }, [auth?.token]);

  const showReadOnlyBanner = isViewOnly && isReadOnly(auth?.entityId ?? "");

  return (
    <div className="flex min-h-dvh min-h-screen min-w-0 max-w-full flex-col overflow-x-clip bg-white">
      <Header
        title="Payment Request Details"
        showLogo={false}
        brandHref={null}
        backHref={pages.list}
        backLabel="Payments"
        companyName={auth?.entityName || "Loading…"}
        statusBadge={<PaymentRequestDetailStatusBadge refreshSignal={billStatusRefresh} />}
        xeroConnected={xeroConnected}
      />
      {showReadOnlyBanner ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 sm:px-6"
        >
          <span className="material-symbols-outlined shrink-0 text-[18px] leading-none text-amber-600" aria-hidden>
            visibility
          </span>
          <span>Read-only access — you are not a member of this entity.</span>
        </div>
      ) : null}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden pt-2 sm:pt-3 lg:pt-4">
        <PaymentRequestDetailBody onBillUpdated={bumpBillStatusInHeader} />
      </main>
    </div>
  );
}
