"use client";

// The entity's selected currency (entities.currency_id -> currency_info),
// rendered across the billing UI as the ISO code — mirroring the pettycash
// modules. Fetched once per page load and cached module-wide; a failed fetch
// clears the cache so a later call retries.

import { useCallback, useEffect, useState } from "react";

import { fetchEntityCurrency } from "./api";
import { currencyLabelForCode } from "./currencyDisplay";

let cached: Promise<string> | null = null;

/** The code ("" = the company has none set); rejects when the read fails. */
function loadEntityCurrencyCode(): Promise<string> {
  if (!cached) {
    cached = fetchEntityCurrency()
      .then((data) => currencyLabelForCode(data.currency_code || ""))
      .catch((err: unknown) => {
        cached = null;
        throw err;
      });
  }
  return cached;
}

/** Resolve the entity's ISO currency code ("" when unset/unavailable). */
export function getEntityCurrencyCode(): Promise<string> {
  return loadEntityCurrencyCode().catch((err: unknown) => {
    console.error("Could not read the company's currency:", err);
    return "";
  });
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

export type EntityCurrencyState = {
  code: string;
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
    status: "loading",
  });
  useEffect(() => {
    let alive = true;
    loadEntityCurrencyCode().then(
      (code) => {
        if (alive) setState({ code, status: code ? "ready" : "unset" });
      },
      (err: unknown) => {
        console.error("Could not read the company's currency:", err);
        if (alive) setState({ code: "", status: "error" });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ code: "", status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry };
}
