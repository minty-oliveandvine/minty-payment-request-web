"use client";

/**
 * The Minty cat at the bottom right of every page, and its "Talk to Minty" chat - drawn by
 * `@minty/shared/contact` (v0.14, owner 2026-11-05), in the sidebar's look. This app hands it its
 * Flask call (`POST /api/me/contact` through `mintyFetch`, which mails the team with the person as
 * Reply-To) and its toast.
 */

import {
  ContactLauncher as SharedContactLauncher,
  type ContactMessage,
  type ContactReceipt,
} from "@minty/shared/contact";

import { useToast } from "@/components/Toast";
import { mintyFetch } from "@/components/ui/sidebarHost";

const send = (message: ContactMessage) =>
  mintyFetch<ContactReceipt>("/api/me/contact", { method: "POST", json: message });

export function ContactLauncher() {
  const { showToast } = useToast();
  return (
    <SharedContactLauncher send={send} notify={(message, kind) => void showToast(message, kind)} />
  );
}
