import { withMintyDefaults } from "@minty/shared/next";
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
 * withMintyDefaults (@minty/shared/next) supplies what every Minty app sends and needs: the
 * security headers on every path (the URL security round, 2026-10-05), no X-Powered-By,
 * `transpilePackages: ["@minty/shared"]` (the package ships .ts source) and 127.0.0.1 as an
 * allowed dev origin. Only this app's own settings are below.
 */
export default withMintyDefaults({
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
});
