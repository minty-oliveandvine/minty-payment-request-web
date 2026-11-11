import { redirect } from "next/navigation";

import { hubSettingsUrl } from "@/lib/mintyUrls";

/**
 * Payment Settings' old address, `/entity/<shortid>/<name>/settings/payment-request`. The page is
 * the hub's (minty-web's Payment Settings tab) since 2026-11-10 (owner), so this only sends the
 * person on - to the same path on accounts-api, whose gated hand-off mints the hub's token for the
 * company and opens the tab. Old links, bookmarks and `/settings?tab=` (proxy.ts) land here.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ ref: string; slug: string }>;
}): Promise<never> {
  const { ref, slug } = await params;
  redirect(hubSettingsUrl(`${ref}/${slug}`, "payment-request", { readable: true }));
}
