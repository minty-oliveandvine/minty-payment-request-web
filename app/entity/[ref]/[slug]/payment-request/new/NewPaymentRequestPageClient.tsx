"use client";

import { Header } from "@/components/layout";
import { PaymentRequestForm } from "@/components/PaymentRequestForm";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAuthSnapshot } from "@/lib/auth";
import { useClientValue } from "@/lib/useClientValue";
import { useCompanyPages } from "@/lib/useCompanyPages";
import { useUserRole } from "@/lib/useUserRole";

export function NewPaymentRequestPageClient() {
  const auth = useClientValue(getAuthSnapshot, null);
  const pages = useCompanyPages();
  const { hasAnyRole, isViewOnly } = useUserRole();

  return (
    <div className="flex min-h-dvh min-h-screen min-w-0 max-w-full flex-col overflow-x-clip bg-surface-page">
      <Header
        title="Payment Request"
        backHref={pages.list}
        backLabel="Payment Requests"
        backInPage
        companyName={auth?.entityName || "Loading…"}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-[720px]">
          <PageHeader
            back={{ href: pages.list, label: "Payment Requests" }}
            title="New payment request"
            purpose="Add the supplier's invoice, then send it to Treasury to pay."
          />
        </div>
        {/* The role arrives from the cookie: a visitor who cannot add one is told so, not shown a form. */}
        {isViewOnly || (auth && !hasAnyRole) ? (
          <div className="mx-auto w-full max-w-[720px] px-4 pt-6 sm:px-6 lg:px-8">
            <InlineAlert tone="info">
              {isViewOnly
                ? "You have view-only access, so payment requests can't be added here."
                : "Your role can't add payment requests. Ask an Admin if you need to."}
            </InlineAlert>
          </div>
        ) : (
          <PaymentRequestForm />
        )}
      </main>
    </div>
  );
}
