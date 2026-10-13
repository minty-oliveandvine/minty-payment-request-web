"use client";

// COPY of minty-web/features/profile/routes/ProfilePanel.tsx (2026-09-30) - lifted into
// @minty/shared at Part 3 step 4; change all three (minty-web, here, Flask's port).

/**
 * My Profile in the sidebar - the view the header's initials open, and the menu's name switches
 * to (the user's call, 2026-09-29: one sidebar, two views - `components/ui/Sidebar.tsx`). The
 * same body minty-web's `/profile` page draws (`ProfileBody`) under the panel's own titlebar:
 * ‹ back to the menu, "My Profile", and a close - on a phone the panel fills the screen, so
 * there is nothing beside it to click.
 *
 * The sidebar mounts it only once the view is asked for, so nothing is read before then. The
 * `subscriptions` slot is the shell's to fill (`app/layout.tsx`).
 */

import type { ReactNode } from "react";

import { useSidebar } from "@/components/ui/Sidebar";

import { ProfileBody } from "@/features/profile/components/ProfileBody";
import { ProfilePanelTitlebar } from "@/features/profile/components/ProfileParts";
import { useProfile } from "@/features/profile/hooks/useProfile";

export function ProfilePanel({ subscriptions }: { subscriptions?: ReactNode }) {
  const p = useProfile();
  const sidebar = useSidebar();

  return (
    <div className="flex min-h-full flex-col bg-surface-sunk">
      <ProfilePanelTitlebar onBack={sidebar?.showMenu} onClose={sidebar?.close} />
      <div className="flex flex-col px-4 pb-[max(2.5rem,env(safe-area-inset-bottom,0px))]">
        <ProfileBody model={p} subscriptions={subscriptions} />
      </div>
    </div>
  );
}
