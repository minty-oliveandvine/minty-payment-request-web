"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError, fetchBillByReference } from "@/lib/api";
import { decodeSegment } from "@/lib/companyPages";

/**
 * The payment request a details address names (2026-10-05): `.../payment-request/<Payment No.>`,
 * or `.../payment-request/<id>` (Flask's hand-off, an old link, a request with no Payment No.).
 * An id is used as it is; a Payment No. is looked up once (`GET /bills/by-reference/...`) and
 * remembered, so the body and the header badge share one call and a page that rewrote its own
 * address to the Payment No. (`rememberRequest`) does not look up what it already knows.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = "I couldn't find that payment request. It may have been renamed or removed.";

/** Payment No. -> id, per company in the address (`<ref>`), case-insensitive. */
const known = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

const keyOf = (company: string, reference: string) => `${company}|${reference.trim().toLowerCase()}`;

/** The page now shows `reference` for request `id`: remember it so the address change costs no lookup. */
export function rememberRequest(company: string, reference: string, id: string): void {
  if (reference.trim()) known.set(keyOf(company, reference), id);
}

function lookUp(key: string, reference: string): Promise<string> {
  let p = pending.get(key);
  if (!p) {
    p = fetchBillByReference(reference).then((bill) => {
      known.set(key, bill.id);
      return bill.id;
    });
    pending.set(key, p);
    p.catch(() => pending.delete(key));
  }
  return p;
}

export type RequestIdState = {
  /** The request's id; "" while a Payment No. is being looked up or when none is found. */
  requestId: string;
  /** A Payment No. lookup is under way. */
  pending: boolean;
  /** What to show when the address names no request of this company. */
  error: string | null;
};

export function useRequestId(): RequestIdState {
  const params = useParams<{ ref?: string; id?: string }>();
  const company = typeof params?.ref === "string" ? params.ref.toLowerCase() : "";
  const segment = decodeSegment(typeof params?.id === "string" ? params.id : "").trim();
  const isId = UUID.test(segment);
  const key = keyOf(company, segment);
  const [found, setFound] = useState<{ key: string; id: string; error: string | null } | null>(null);

  useEffect(() => {
    if (!segment || isId || known.has(key)) return;
    let live = true;
    lookUp(key, segment).then(
      (id) => live && setFound({ key, id, error: null }),
      (e: unknown) =>
        live &&
        setFound({ key, id: "", error: e instanceof ApiError && e.status !== 404 ? e.message : NOT_FOUND }),
    );
    return () => {
      live = false;
    };
  }, [key, segment, isId]);

  if (!segment) return { requestId: "", pending: false, error: null };
  if (isId) return { requestId: segment, pending: false, error: null };
  const remembered = known.get(key);
  if (remembered) return { requestId: remembered, pending: false, error: null };
  if (found?.key === key) return { requestId: found.id, pending: false, error: found.error };
  return { requestId: "", pending: true, error: null };
}
