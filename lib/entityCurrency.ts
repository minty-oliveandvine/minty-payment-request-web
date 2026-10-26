"use client";

// The entity's selected currency (entities.currency_id -> currency_info),
// rendered across the billing UI as the ISO code — mirroring the pettycash
// modules. Fetched once per page load and cached module-wide; a failed fetch
// clears the cache so a later call retries.

import { useCallback, useEffect, useState } from "react";

import { fetchEntityCurrency } from "./api";
import { currencyLabelForCode } from "./currencyDisplay";

/** Places an amount has until the company's currency says otherwise. */
export const DEFAULT_CURRENCY_DECIMALS = 2;

type EntityCurrency = { code: string; decimals: number };

let cached: Promise<EntityCurrency> | null = null;

/** The code ("" = the company has none set) and its places; rejects when the read fails. */
function loadEntityCurrency(): Promise<EntityCurrency> {
  if (!cached) {
    cached = fetchEntityCurrency()
      .then((data) => ({
        code: currencyLabelForCode(data.currency_code || ""),
        decimals: data.decimals,
      }))
      .catch((err: unknown) => {
        cached = null;
        throw err;
      });
  }
  return cached;
}

function getEntityCurrency(): Promise<EntityCurrency> {
  return loadEntityCurrency().catch((err: unknown) => {
    console.error("Could not read the company's currency:", err);
    return { code: "", decimals: DEFAULT_CURRENCY_DECIMALS };
  });
}

/** Resolve the entity's ISO currency code ("" when unset/unavailable). */
export function getEntityCurrencyCode(): Promise<string> {
  return getEntityCurrency().then((c) => c.code);
}

/** ISO code of the entity's selected currency; "" until loaded (callers fall
 * back to their per-record currency code while empty). */
export function useEntityCurrency(): string {
  const [code, setCode] = useState("");
  useEffect(() => {
    let alive = true;
    getEntityCurrencyCode().then((c) => {
      if (alive && c) setCode(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return code;
}

/** Decimal places of the entity's currency (JPY 0) for amount fields and payloads; 2 until
 * loaded, and when unset or unreadable. */
export function useEntityCurrencyDecimals(): number {
  const [decimals, setDecimals] = useState(DEFAULT_CURRENCY_DECIMALS);
  useEffect(() => {
    let alive = true;
    getEntityCurrency().then((c) => {
      if (alive) setDecimals(c.decimals);
    });
    return () => {
      alive = false;
    };
  }, []);
  return decimals;
}

export type EntityCurrencyState = {
  code: string;
  /** The currency's decimal places (2 while loading or unset). */
  decimals: number;
  /** "unset": the company has no currency; "error": the read failed. */
  status: "loading" | "ready" | "unset" | "error";
  retry: () => void;
};

/** The currency for a form that must not go on without one: tells "none set"
 * apart from "could not read it", so neither shows as an empty box. */
export function useEntityCurrencyState(): EntityCurrencyState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<EntityCurrencyState, "retry">>({
    code: "",
    decimals: DEFAULT_CURRENCY_DECIMALS,
    status: "loading",
  });
  useEffect(() => {
    let alive = true;
    loadEntityCurrency().then(
      ({ code, decimals }) => {
        if (alive) setState({ code, decimals, status: code ? "ready" : "unset" });
      },
      (err: unknown) => {
        console.error("Could not read the company's currency:", err);
        if (alive) setState({ code: "", decimals: DEFAULT_CURRENCY_DECIMALS, status: "error" });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ code: "", decimals: DEFAULT_CURRENCY_DECIMALS, status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry };
}
