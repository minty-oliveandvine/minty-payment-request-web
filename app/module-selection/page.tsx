"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useRef, useEffect } from "react";
import { ModuleButton } from "@/components/ModuleButton";
import { LoadingScreen } from "@/components/LoadingScreen";
import { decodeJwtPayload, getAuth, setAuth } from "@/lib/auth";
import { MINTY_MODULE_URL } from "@/lib/mintyUrls";
import { API_BASE } from "@/lib/apiBase";
import { cookieCompanyPages } from "@/lib/useCompanyPages";

const MIN_LOADING_MS = 800;

function ModuleSelectionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Capture params into refs on first render so they survive the router.replace()
  // re-render that strips them from the URL (F8 fix). Plain consts derived from
  // searchParams become "" after the replace; refs hold the original values.
  //
  // URL-only at this stage — reading cookies during render is a hydration trap
  // (server has no document, client does, so they'd diverge). The cookie
  // fallback happens in the mount effect below, before the buttons reveal.
  const tokenRef = useRef(searchParams.get("token") ?? "");
  const entityIdRef = useRef(searchParams.get("entity_id") ?? "");
  const entityNameRef = useRef(searchParams.get("entity_name") ?? "");

  // Decode JWT once during initial state init — synchronous with the first
  // render so neither button briefly flashes before being hidden. Both flags
  // default to true (back-compat) when the claim is missing or the token is
  // malformed; only an explicit `false` hides the corresponding module.
  const initialClaims = useRef<{ billingEnabled: boolean; pettyCashEnabled: boolean } | null>(null);
  if (initialClaims.current === null) {
    const payload = tokenRef.current ? decodeJwtPayload(tokenRef.current) : null;
    initialClaims.current = {
      billingEnabled:
        payload && typeof payload.billing_enabled === "boolean"
          ? payload.billing_enabled
          : true,
      pettyCashEnabled:
        payload && typeof payload.petty_cash_enabled === "boolean"
          ? payload.petty_cash_enabled
          : true,
    };
    if (payload) {
      console.log(
        "Module selection: billing_enabled =", payload.billing_enabled,
        "petty_cash_enabled =", payload.petty_cash_enabled,
      );
    }
  }
  const [billingEnabled, setBillingEnabled] = useState(initialClaims.current.billingEnabled);
  const [pettyCashEnabled, setPettyCashEnabled] = useState(initialClaims.current.pettyCashEnabled);

  const module1Href =
    entityIdRef.current && tokenRef.current
      ? `${MINTY_MODULE_URL}/entity/${encodeURIComponent(entityIdRef.current)}/enter?token=${encodeURIComponent(tokenRef.current)}`
      : `${MINTY_MODULE_URL}/entity`;

  const acronym = entityNameRef.current
    ? entityNameRef.current
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const [showMinty, setShowMinty] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const navTimerRef = useRef<number | null>(null);
  const lastTouchTime = useRef(0);
  const lastPaymentTouchTime = useRef(0);
  const [loadingMintyPeek, setLoadingMintyPeek] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  // Gates the buttons until the DB-authoritative /entitlements fetch resolves.
  // Keeping the buttons hidden during the brief "JWT-claim ↔ DB" reconciliation
  // window is how we avoid flashing a card that the DB will hide a moment later.
  const [entitlementsReady, setEntitlementsReady] = useState(false);

  useEffect(() => {
    // URL had no token (this is a refresh after router.replace stripped the
    // params on a prior visit). Fall back to the persisted auth cookie and
    // re-seed the JWT-claim state so the buttons reveal in the right shape
    // instead of the all-defaults-true fallback.
    const hadUrlToken = !!tokenRef.current;
    if (!hadUrlToken) {
      const auth = getAuth();
      if (auth?.token) {
        tokenRef.current = auth.token;
        entityIdRef.current = auth.entityId;
        entityNameRef.current = auth.entityName;
        const payload = decodeJwtPayload(auth.token);
        if (payload) {
          if (typeof payload.billing_enabled === "boolean") {
            setBillingEnabled(payload.billing_enabled);
          }
          if (typeof payload.petty_cash_enabled === "boolean") {
            setPettyCashEnabled(payload.petty_cash_enabled);
          }
        }
      }
    }

    // Reveal banner + module buttons. Server rendered nothing for these, so
    // the first client paint after this state flip is also the first paint
    // that includes them — no SSR/CSR diff to hydrate.
    setHasMounted(true);

    // Original handoff path: when the URL had a token (initial landing from
    // Module 1), persist it to cookies and strip the params.
    if (hadUrlToken) {
      setAuth(tokenRef.current, entityIdRef.current, entityNameRef.current);
      const clean = new URLSearchParams(searchParams.toString());
      clean.delete("token");
      clean.delete("entity_id");
      clean.delete("entity_name");
      const qs = clean.toString();
      router.replace(`/module-selection${qs ? `?${qs}` : ""}`);
    }

    // Authoritative refresh from the backend. The DB is the only source of
    // truth for entitlements. We keep the buttons hidden (via entitlementsReady)
    // until this resolves so a cookie JWT that disagrees with the DB never
    // briefly paints a card the DB is about to hide.
    //
    // A safety timeout flips ready=true even if the network never responds,
    // so a slow backend can't strand the page on an empty button row forever.
    // In that fallback case the JWT-claim values are what get revealed —
    // imperfect, but better than a stuck screen.
    const fetchToken = tokenRef.current;
    const fetchEntityId = entityIdRef.current;
    if (!fetchToken || !fetchEntityId) {
      // Nothing to verify against (signed out, or no entity context) — reveal
      // immediately with whatever the JWT-claim defaults gave us.
      setEntitlementsReady(true);
    } else {
      const safetyTimer = window.setTimeout(() => setEntitlementsReady(true), 5000);
      fetch(`${API_BASE}/api/v1/auth/entitlements`, {
        headers: { Authorization: `Bearer ${fetchToken}`, "X-Entity-Id": fetchEntityId },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { petty_cash_enabled?: boolean; billing_enabled?: boolean } | null) => {
          if (data) {
            if (typeof data.petty_cash_enabled === "boolean") {
              setPettyCashEnabled(data.petty_cash_enabled);
            }
            if (typeof data.billing_enabled === "boolean") {
              setBillingEnabled(data.billing_enabled);
            }
          }
        })
        .catch(() => {
          // Non-fatal: reveal with the JWT-claim values painted above.
        })
        .finally(() => {
          window.clearTimeout(safetyTimer);
          setEntitlementsReady(true);
        });
    }
  }, []);

  // Back button out of a module = bfcache restore, not a fresh mount.
  //
  // Picking Petty Cash leaves this origin entirely (window.location.href to
  // Module 1), so the browser freezes this document with isNavigating === true
  // and the full-screen LoadingScreen painted over it. Coming back restores
  // that exact frame: no remount, no state reset, so the spinner sits there
  // forever with nothing left to navigate to. Clearing the flag on a persisted
  // pageshow is what ends it.
  //
  // Also kill any navigation timer the freeze caught mid-flight — bfcache
  // resumes pending timers on restore, and one firing here would throw the
  // user straight back into the module they just backed out of.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      if (navTimerRef.current !== null) {
        window.clearTimeout(navTimerRef.current);
        navTimerRef.current = null;
      }
      setIsNavigating(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    if (!isNavigating) {
      setLoadingMintyPeek(false);
      return;
    }
    const id = requestAnimationFrame(() => setLoadingMintyPeek(true));
    return () => cancelAnimationFrame(id);
  }, [isNavigating]);

  const toggleMinty = () => setShowMinty((prev) => !prev);

  const navigateToModule1 = () => {
    setIsNavigating(true);
    navTimerRef.current = window.setTimeout(() => {
      navTimerRef.current = null;
      window.location.href = module1Href;
    }, MIN_LOADING_MS);
  };

  const handleTouchEnd = () => {
    lastTouchTime.current = Date.now();
    navigateToModule1();
  };

  const handleClick = () => {
    if (Date.now() - lastTouchTime.current < 400) return;
    navigateToModule1();
  };

  const navigateToModule2 = () => {
    setIsNavigating(true);
    // setAuth() was already called in the mount effect before router.replace()
    // cleaned the URL. No need to repeat it here.
    navTimerRef.current = window.setTimeout(() => {
      navTimerRef.current = null;
      router.push(cookieCompanyPages()?.list ?? "/");
    }, MIN_LOADING_MS);
  };

  const handlePaymentTouchEnd = () => {
    lastPaymentTouchTime.current = Date.now();
    navigateToModule2();
  };

  const handlePaymentClick = () => {
    if (Date.now() - lastPaymentTouchTime.current < 400) return;
    navigateToModule2();
  };

  // Exactly one module entitled = nothing to choose between, so this page is a
  // dead click that asks the user to confirm the only option they have. Go
  // straight into that module instead. Minty's /entity/<id>/modules already
  // skips the handoff to this page in that case; this covers the paths that
  // arrive here anyway — a refresh after the mount effect stripped the URL
  // params, a bookmark, or a stale link.
  //
  // Gated on entitlementsReady so the decision is made against the
  // DB-authoritative answer, never the JWT claims alone: routing on a stale
  // cookie claim would fling the user into a module the DB is about to hide.
  // Both-off is left alone deliberately — there is nowhere to send them.
  const soloModule =
    hasMounted && entitlementsReady && billingEnabled !== pettyCashEnabled;
  const autoRoutedRef = useRef(false);
  useEffect(() => {
    if (!soloModule || autoRoutedRef.current) return;
    autoRoutedRef.current = true;
    if (billingEnabled) {
      navigateToModule2();
    } else {
      navigateToModule1();
    }
  }, [soloModule, billingEnabled]);

  return (
    <div className="flex min-h-dvh min-h-screen flex-col overflow-x-hidden bg-white">
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-6 sm:gap-6 sm:p-8 md:gap-8">
        <Image src="/minty-mark.png" alt="Logo" width={400} height={292} priority sizes="(max-width: 640px) 320px, (max-width: 768px) 400px, (max-width: 1024px) 480px, 560px" className="h-auto w-full max-w-[120px] sm:max-w-[150px] md:max-w-[180px] lg:max-w-[210px]" />

        {hasMounted && entityNameRef.current && (
          <div className="flex items-center gap-3 rounded-full border border-gray-100 bg-white px-4 py-2 shadow-sm">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ backgroundColor: "#E0F7FA", color: "#00838F" }}>
              {acronym}
            </span>
            <span className="text-sm font-semibold text-[#474747]">
              {entityNameRef.current}
            </span>
          </div>
        )}

        {!soloModule && (
          <>
          <h1 className="text-center text-lg font-bold text-black sm:text-xl md:text-2xl">
            Choose Module Type
          </h1>
          <div className="module-buttons-group mx-auto flex w-full max-w-[260px] flex-col items-center justify-center gap-4 sm:max-w-[400px] sm:flex-row sm:flex-nowrap sm:gap-6 md:max-w-[820px]">
            {hasMounted && entitlementsReady && pettyCashEnabled && (
              <ModuleButton iconSrc="/pettycash-icon.webp" iconAlt="Petty cash" imageScale={0.8} hoverBackImage="/minty-l.webp" onClick={handleClick} onTouchEnd={handleTouchEnd} />
            )}
            {hasMounted && entitlementsReady && billingEnabled && (
              <ModuleButton iconSrc="/payment-icon.webp" iconAlt="Payment request" imageScale={1.0} hoverBackImage="/minty-r.webp" hoverBackImagePosition="top-right" onClick={handlePaymentClick} onTouchEnd={handlePaymentTouchEnd} />
            )}
          </div>
          </>
        )}
      </main>

      <div className={`pointer-events-none fixed bottom-0 left-1/2 z-[100] block h-[260px] w-[280px] max-w-[85vw] -translate-x-1/2 transition-transform duration-300 ease-out md:hidden ${showMinty ? "translate-y-[25%]" : "translate-y-full"}`} aria-hidden><Image src="/minty.webp" alt="" fill className="object-contain object-bottom" sizes="280px" /></div>

      {isNavigating || soloModule ? (
        <div className="fixed inset-0 z-[200] flex flex-col bg-white">
          <LoadingScreen embedded>
            <div className={`pointer-events-none relative h-[260px] w-[280px] max-w-[85vw] shrink-0 self-center transition-transform duration-300 ease-out md:hidden ${loadingMintyPeek ? "translate-y-[25%]" : "translate-y-full"}`} aria-hidden><Image src="/minty.webp" alt="" fill className="object-contain object-bottom" sizes="280px" /></div>
          </LoadingScreen>
        </div>
      ) : null}
    </div>
  );
}

export default function ModuleSelection() {
  return (
    <Suspense>
      <ModuleSelectionContent />
    </Suspense>
  );
}
