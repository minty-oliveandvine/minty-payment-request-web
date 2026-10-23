"use client";

import { useEffect, useState } from "react";

import { decodeJwtPayload, getAuth } from "./auth";
import { API_BASE } from "./apiBase";

export type ModuleClaims = {
  /** Petty cash module enabled for the entity carried in the JWT. */
  pettyCashEnabled: boolean;
  /** Bill module enabled for the entity carried in the JWT. */
  billingEnabled: boolean;
};

/**
 * Decode the billing JWT and return the module-visibility claims.
 *
 * Both flags default to TRUE when:
 *   - no token is present (standalone / pre-auth render),
 *   - the token is malformed,
 *   - the claim is missing (legacy tokens minted before module gating shipped).
 *
 * Defaulting to TRUE preserves backward compatibility: an old token never
 * silently hides nav. The backend writes explicit FALSE only when an entity's
 * entitlement map row says so, so "missing claim" reliably means "not gated"
 * rather than "intentionally off".
 */
export function getModuleClaims(): ModuleClaims {
  const fallback: ModuleClaims = { pettyCashEnabled: true, billingEnabled: true };
  try {
    const auth = getAuth();
    if (!auth?.token) return fallback;
    const payload = decodeJwtPayload(auth.token);
    if (!payload) return fallback;
    return {
      pettyCashEnabled:
        typeof payload.petty_cash_enabled === "boolean" ? payload.petty_cash_enabled : true,
      billingEnabled: typeof payload.billing_enabled === "boolean" ? payload.billing_enabled : true,
    };
  } catch {
    return fallback;
  }
}

/**
 * DB-fresh module entitlements for the current entity.
 *
 * First paint uses the cookie JWT's claims (`getModuleClaims`) — fast, but the
 * cookie can be hours stale (a CLI toggle or admin change won't be in it).
 * Then on mount we hit `/api/v1/auth/entitlements` for the authoritative
 * truth and update state when the response arrives. Consumers re-render
 * automatically when entitlements flip.
 *
 * The hook does NOT block — if the fetch errors or the user has no token,
 * the JWT-claim defaults stand. That's deliberate: nav must always reveal
 * something, even if the backend is unreachable.
 */
export function useEntitlements(): ModuleClaims {
  const initial = getModuleClaims();
  const [pettyCashEnabled, setPettyCashEnabled] = useState(initial.pettyCashEnabled);
  const [billingEnabled, setBillingEnabled] = useState(initial.billingEnabled);

  useEffect(() => {
    const auth = getAuth();
    if (!auth?.token || !auth?.entityId) return;
    fetch(`${API_BASE}/api/v1/auth/entitlements`, {
      headers: { Authorization: `Bearer ${auth.token}`, "X-Entity-Id": auth.entityId },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { petty_cash_enabled?: boolean; billing_enabled?: boolean } | null) => {
        if (!data) return;
        if (typeof data.petty_cash_enabled === "boolean") {
          setPettyCashEnabled(data.petty_cash_enabled);
        }
        if (typeof data.billing_enabled === "boolean") {
          setBillingEnabled(data.billing_enabled);
        }
      })
      .catch(() => {
        // Non-fatal: keep the JWT-claim values that seeded state.
      });
  }, []);

  return { pettyCashEnabled, billingEnabled };
}
