import type { NextConfig } from "next";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Copy the pdf.js runtime assets (worker, cMaps, standard fonts) out of the
 * installed pdfjs-dist package into /public/pdfjs so they are served
 * same-origin instead of from a third-party CDN. Runs here (rather than via a
 * package.json script) because next.config is evaluated by Node at the start of
 * both `next dev` and `next build`. The copied assets always match the
 * installed pdfjs-dist version, and /public/pdfjs is gitignored.
 */
function copyPdfjsAssets() {
  const root = process.cwd();
  const src = join(root, "node_modules", "pdfjs-dist");
  if (!existsSync(src)) return; // deps not installed yet — skip quietly
  const dest = join(root, "public", "pdfjs");
  const items: [string, string][] = [
    ["build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
    ["cmaps", "cmaps"],
    ["standard_fonts", "standard_fonts"],
  ];
  try {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    for (const [from, to] of items) {
      cpSync(join(src, from), join(dest, to), { recursive: true });
    }
  } catch (err) {
    console.warn("[next.config] failed to copy pdf.js assets:", err);
  }
}

copyPdfjsAssets();

/**
 * Sent with every response (the URL security round, 2026-10-05). Same values in minty-web,
 * minty-payment-request-web and minty-onboarding-web, and in Flask (pettycash/core/http_hardening.py).
 * - Referrer-Policy same-origin: another site never sees a path or query from here (tokens).
 * - frame-ancestors / X-Frame-Options: only this app may frame its pages (clickjacking).
 * - HSTS in production builds only; a browser ignores it over plain http anyway.
 */
const securityHeaders = [
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  /** Slightly smaller responses; security-through-obscurity only. */
  poweredByHeader: false,
  /**
   * The plain-named variables this app reads, inlined at build time into the client bundle,
   * the server and middleware.ts. Raw values only ("" when unset - Next skips an undefined
   * key, leaving `process.env.X` un-inlined); defaults and the trailing-slash strip live in
   * lib/env.ts. MAINTENANCE_SHOW_NEW_LINK is the maintenance page's optional footer flag.
   */
  env: {
    PETTY_CASH_URL: process.env.PETTY_CASH_URL ?? "",
    PAYMENT_REQUEST_API_URL: process.env.PAYMENT_REQUEST_API_URL ?? "",
    SUBSCRIPTION_API_URL: process.env.SUBSCRIPTION_API_URL ?? "",
    MAINTENANCE_SHOW_NEW_LINK: process.env.MAINTENANCE_SHOW_NEW_LINK ?? "",
  },
};

export default nextConfig;
