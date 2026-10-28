// OpenNext's Cloudflare adapter: `npm run cf:build` turns the Next.js build into a Worker
// (.open-next/). No incremental cache: nothing here uses ISR or revalidation.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
