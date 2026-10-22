"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout";
import { PaymentRequestDetailSkeleton } from "@/components/payment-request/PaymentRequestDetailSkeleton";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { getAuthSnapshot } from "@/lib/auth";
import { fetchXeroStatus } from "@/lib/api";
import { useClientValue } from "@minty/shared/clientValue";
import { useUserRole } from "@/lib/useUserRole";
import { useCompanyPages } from "@/lib/useCompanyPages";

const PaymentRequestDetailBody = dynamic(
  () =>
    import("@/components/payment-request/PaymentRequestDetailBody").then((m) => ({
      default: m.PaymentRequestDetailBody,
    })),
  { loading: () => <PaymentRequestDetailSkeleton /> },
);

/**
 * A payment request's page: the App bar (with the way back), then the Record page itself -
 * header, status, actions, document and details - which the body draws, because it holds the
 * request (Part 15.17).
 */
export function PaymentRequestDetailPageClient() {
  // The cookie is client-only: "" on the server and at hydration, the real company once mounted.
  const auth = useClientValue(getAuthSnapshot, () => null);
  const [xeroConnected, setXeroConnected] = useState<boolean>(false);
  const { isViewOnly, isReadOnly } = useUserRole();
  const pages = useCompanyPages();

  useEffect(() => {
    if (!auth?.token) return;
    fetchXeroStatus()
      .then(setXeroConnected)
      .catch((err: unknown) =>
        console.error("[payment request] the Xero status did not load", err),
      );
  }, [auth?.token]);

  const showReadOnlyBanner = isViewOnly && isReadOnly(auth?.entityId ?? "");

  return (
    <div className="flex min-h-dvh min-h-screen min-w-0 max-w-full flex-col overflow-x-clip bg-surface-page">
      <Header
        title="Payment Request"
        backHref={pages.list}
        backLabel="Payment Requests"
        backInPage
        companyName={auth?.entityName || "Loading…"}
        xeroConnected={xeroConnected}
      />
      {showReadOnlyBanner ? (
        <div className="mx-auto w-full max-w-[1440px] px-4 pt-4 sm:px-6 lg:px-8">
          <InlineAlert tone="info">
            Read-only access — you are not a member of this entity.
          </InlineAlert>
        </div>
      ) : null}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        <PaymentRequestDetailBody />
      </main>
    </div>
  );
}
