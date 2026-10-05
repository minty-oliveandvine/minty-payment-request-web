"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { setAuth } from "@/lib/auth";
import { MINTY_MODULE_URL } from "@/lib/mintyUrls";
import { safeNextPath } from "@/lib/safeNext";

function LandingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token") ?? "";
    const entityId = searchParams.get("entity_id") ?? "";
    const entityName = searchParams.get("entity_name") ?? "";
    // No `next`: "/" - the middleware moves it to the company's own list.
    const next = safeNextPath(searchParams.get("next"), "/");

    if (!token) {
      // Nothing to land with: back into Minty (its /entity - the entity list, or sign-in).
      window.location.replace(`${MINTY_MODULE_URL}/entity`);
      return;
    }

    setAuth(token, entityId, entityName);
    router.replace(next);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-dvh min-h-screen items-center justify-center bg-white">
      <span className="text-sm text-gray-400">Loading…</span>
    </div>
  );
}

export default function Landing() {
  return (
    <Suspense>
      <LandingContent />
    </Suspense>
  );
}
