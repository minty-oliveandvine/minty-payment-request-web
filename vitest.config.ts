// Unit and component tests. Playwright lives in e2e/ and is NOT run from here -- `test.exclude`
// keeps the two runners apart, because a .spec.ts written against Playwright's `test`/`expect`
// would otherwise be collected by vitest and fail with an error about the wrong runner rather
// than about the code. (minty-web's and minty-onboarding-web's configs, same reasoning.)
//
//   npm test          once, no browser -- the per-commit gate
//   npm run test:watch
//   npm run test:e2e  Playwright, needs the stack up (see e2e/README.md)

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      // Mirrors the `@/*` -> `./*` mapping in tsconfig.json.
      "@": dirname(fileURLToPath(import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "e2e/**", "public/**"],
    // Explicit imports from 'vitest' in every test file instead. Globals would need a
    // matching "types" entry in tsconfig, and the repo type-checks its tests.
    globals: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
