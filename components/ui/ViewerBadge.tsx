"use client";

// The sidebar lives in @minty/shared (Part 3 step 4, 2026-10-12) - it was a copy of
// minty-web's here from 2026-09-30. This file stays for two reasons: the side-effect import below
// registers THIS app's host before anything renders, and keeping the path means no page, feature
// or test had to change. What differs per app is components/ui/sidebarHost.ts - that file alone.

import "@/components/ui/sidebarHost";

export { ViewerBadge } from "@minty/shared/sidebar";
