import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // pdf.js's worker, copied in from node_modules by next.config.ts (gitignored): not our code.
    "public/pdfjs/**",
  ]),
  {
    // eslint-config-next 16.4 turned these React Compiler checks into errors. This app has 42
    // setState-in-effect calls and one ref read during render; they are warnings until those
    // effects are reworked (a task of its own), so they stay visible without blocking the
    // toolchain upgrade.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);

export default eslintConfig;
