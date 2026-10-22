// Browser tests for the payment-request module, its settings page and the sidebar. They run against a stack
// that is ALREADY UP (Next :3020, minty-payment-request-api :8020, Minty :8000) -- nothing is started here,
// for the reasons onboarding/e2e gives. See e2e/README.md. The settings every app shares (one worker,
// traces on failure, E2E_BASE_URL) are @minty/shared/playwright's.
import { mintyPlaywright } from "@minty/shared/playwright";

export default mintyPlaywright({ port: 3020 });
