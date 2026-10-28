// @minty/shared/eslint: next/core-web-vitals + typescript and the folders no app lints (pdf.js's
// worker, copied into public/pdfjs/ by next.config.ts, among them).
import { defineConfig, globalIgnores } from "eslint/config";
import minty from "@minty/shared/eslint";

export default defineConfig([
  ...minty,
  {
    // eslint-config-next 16.4 turned these React Compiler checks into errors. This app has 30
    // setState-in-effect calls and one ref read during render across 8 payment-request
    // components; they are warnings until those effects are reworked (a task of its own), so
    // they stay visible without blocking the toolchain upgrade.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
  // The Cloudflare Workers build (OpenNext) and wrangler's local state: generated, not ours.
  globalIgnores([".open-next/**", ".wrangler/**"]),
]);
