"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Header } from "@/components/layout";
import { PaymentRequestView } from "@/components/payment-request";
import { ModuleGate } from "@/components/ModuleGate";
import { SubscriptionNoticeModal } from "@/components/SubscriptionNoticeModal";
import { Button, buttonClass } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAuthSnapshot } from "@/lib/auth";
import { useCompanyPages } from "@/lib/useCompanyPages";
import { useUserRole } from "@/lib/useUserRole";
import {
  getEasyViewServerSnapshot,
  getEasyViewSnapshot,
  setEasyView,
  subscribeEasyView,
} from "@/lib/easyViewStore";
import { useClientValue } from "@/lib/useClientValue";
import { fetchXeroStatus } from "@/lib/api";
import {
  claimSubscriptionNotice,
  fetchSubscriptionNotice,
  type SubscriptionNotice,
} from "@/lib/subscriptionNotice";

export default function Home() {
  // Both come from the browser, so both are read as snapshots rather than seeded by an effect:
  // the cookie never changes under us, the Easy View preference does (the toggle writes it), so
  // only that one has a store with a subscribe.
  const auth = useClientValue(getAuthSnapshot, null);
  const easyView = useSyncExternalStore(
    subscribeEasyView,
    getEasyViewSnapshot,
    getEasyViewServerSnapshot,
  );

  const pages = useCompanyPages();
  const { hasAnyRole, isViewOnly } = useUserRole();
  const [xeroConnected, setXeroConnected] = useState<boolean>(false);
  const [notice, setNotice] = useState<SubscriptionNotice | null>(null);

  useEffect(() => {
    if (!auth?.token) return;
    fetchXeroStatus()
      .then(setXeroConnected)
      .catch((err: unknown) => console.error("[payment requests] the Xero status did not load", err));
  }, [auth?.token]);

  // Subscription notice — once per entity per session, so the claim is checked
  // before the request is made rather than after. Never blocks or breaks the page:
  // fetchSubscriptionNotice swallows every failure and returns null.
  //
  // The ref is load-bearing, not tidiness. React invokes effects twice in
  // development, and claimSubscriptionNotice CONSUMES a one-shot flag: the second
  // run finds it already spent and returns early. So the first run's response is the
  // only one there will ever be — cancelling it on cleanup (the usual pattern) threw
  // away the only result and the modal never appeared. Guarding on a ref instead
  // means the work happens exactly once and its result always lands; the ref
  // survives the simulated remount, so this cannot double-fetch either.
  // It also covers the hydration step now that `auth` is a snapshot rather than effect state:
  // this runs once with no token (nothing to do) and again on the render that carries it.
  const noticeStarted = useRef(false);
  useEffect(() => {
    if (noticeStarted.current) return;
    if (!auth?.token || !auth.entityId) return;
    if (!claimSubscriptionNotice(auth.entityId)) return;

    noticeStarted.current = true;
    fetchSubscriptionNotice().then((n) => setNotice(n));
  }, [auth?.token, auth?.entityId]);

  // Part 15.2: the page's ONE Primary - creating a request - in the page header. A view-only
  // visitor gets it dead, with the reason beside it rather than a hidden button.
  const canCreate = hasAnyRole && !isViewOnly;
  const createButton = canCreate ? (
    <Link href={pages.create} className={buttonClass("primary", { full: true })}>
      <Icon name="add" size="md" />
      Add payment request
    </Link>
  ) : (
    <Button kind="primary" full disabled title={isViewOnly ? "Hmm, I can't let you in there. You have view-only access." : undefined}>
      Add payment request
    </Button>
  );

  return (
    <ModuleGate>
    <div className="flex min-h-dvh min-h-screen min-w-0 max-w-full flex-col overflow-x-clip bg-surface-page pb-[env(safe-area-inset-bottom,0px)]">
      <Header
        title="Payment Request"
        companyName={auth?.entityName || "Loading…"}
        xeroConnected={xeroConnected}
      />
      <div className="mx-auto w-full max-w-[1200px]">
        <PageHeader
          title="Payment Requests"
          purpose="Supplier bills waiting to be paid, and what has been paid."
          primary={createButton}
          below={
            isViewOnly ? (
              <p className="text-body-s text-text-secondary">You have view-only access, so nothing can be added here.</p>
            ) : null
          }
        />
      </div>
      <div className="h-4" aria-hidden />
      <PaymentRequestView
        easyView={easyView}
        onEasyViewChange={setEasyView}
        createAction={canCreate ? createButton : undefined}
      />
      <SubscriptionNoticeModal notice={notice} onClose={() => setNotice(null)} />
    </div>
  </ModuleGate>
  );
}
