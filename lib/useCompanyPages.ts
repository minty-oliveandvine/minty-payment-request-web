"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";

import { getAuth } from "@/lib/auth";
import { companyPages, decodeSegment, pagesUnder, type CompanyPages } from "@/lib/companyPages";

/** A segment as `useParams` gives it, written for a path again. */
function segment(value: string | string[] | undefined): string {
  return encodeURIComponent(decodeSegment(typeof value === "string" ? value : ""));
}

/**
 * The pages of the company in the address, for links on a company page. Read from the address,
 * not the cookie, so the server's first render and the browser's agree (the middleware has
 * already made the address the cookie's company).
 */
export function useCompanyPages(): CompanyPages {
  const params = useParams<{ ref?: string; slug?: string }>();
  const ref = segment(params?.ref);
  const slug = segment(params?.slug);
  return useMemo(() => pagesUnder(`/entity/${ref}/${slug}`), [ref, slug]);
}

/** The same pages for the company in the cookie, for code off a company page (null when none). */
export function cookieCompanyPages(): CompanyPages | null {
  const auth = getAuth();
  return auth?.entityId ? companyPages(auth.entityId, auth.entityName) : null;
}
