// Browser tests for the payment-request module, its settings page and the sidebar. They run against a stack
// that is ALREADY UP (Next :3020, minty-payment-request-api :8020, Minty :8000) -- nothing is started here,
// for the reasons onboarding/e2e gives. See e2e/README.md.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3020',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
