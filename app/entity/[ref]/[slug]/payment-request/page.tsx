"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EasyViewToggle, Header } from "@/components/layout";
import { PaymentRequestView } from "@/components/payment-request";
import { ModuleGate } from "@/components/ModuleGate";
import { SubscriptionNoticeModal } from "@/components/SubscriptionNoticeModal";
import { getAuth, type AuthInfo } from "@/lib/auth";
import { fetchXeroStatus } from "@/lib/api";
import {
  claimSubscriptionNotice,
  fetchSubscriptionNotice,
  type SubscriptionNotice,
} from "@/lib/subscriptionNotice";

const EASY_VIEW_STORAGE_KEY = "payment-request-easy-view";

function readStoredEasyView(): boolean | null {
  try {
    const raw = localStorage.getItem(EASY_VIEW_STORAGE_KEY);
    if (raw === "0" || raw === "false") return false;
    if (raw === "1" || raw === "true") return true;
  } catch {
    /* private mode / unavailable */
  }
  return null;
}

export default function Home() {
  const [auth, setAuthState] = useState<AuthInfo | null>(null);
  const [xeroConnected, setXeroConnected] = useState<boolean>(false);
  const [easyView, setEasyViewState] = useState(true);
  const [notice, setNotice] = useState<SubscriptionNotice | null>(null);

  useEffect(() => {
    const stored = readStoredEasyView();
    if (stored !== null) setEasyViewState(stored);
  }, []);

  const setEasyView = useCallback((next: boolean) => {
    setEasyViewState(next);
    try {
      localStorage.setItem(EASY_VIEW_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const a = getAuth();
    setAuthState(a);
    if (a?.token) {
      fetchXeroStatus()
        .then(setXeroConnected)
        .catch((err: unknown) => console.error("[payment requests] the Xero status did not load", err));
    }
  }, []);

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
  const noticeStarted = useRef(false);
  useEffect(() => {
    if (noticeStarted.current) return;
    const a = getAuth();
    if (!a?.token || !a.entityId) return;
    if (!claimSubscriptionNotice(a.entityId)) return;

    noticeStarted.current = true;
    fetchSubscriptionNotice().then((n) => setNotice(n));
  }, []);

  return (
    <ModuleGate>
    <div className="flex min-h-dvh min-h-screen min-w-0 max-w-full flex-col overflow-x-clip bg-white pb-[env(safe-area-inset-bottom,0px)]">
      <Header
        title="Payment Request"
        showLogo={false}
        companyName={auth?.entityName || "Loading…"}
        titleActions={
          <div className="hidden shrink-0 items-center lg:flex">
            <EasyViewToggle enabled={easyView} onChange={setEasyView} />
          </div>
        }
        xeroConnected={xeroConnected}
      />
      <PaymentRequestView easyView={easyView} />
      <SubscriptionNoticeModal notice={notice} onClose={() => setNotice(null)} />
    </div>
  </ModuleGate>
  );
}
