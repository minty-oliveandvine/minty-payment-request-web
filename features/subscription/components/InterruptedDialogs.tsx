"use client";

// Payment Settings' "Leave without saving?" (lib/leaveGuard.ts), on the Part 14 Confirmation
// modal (components/ui/Overlay.tsx). It WAS a copy of minty-web's InterruptedDialogs on minty-web's
// ConfirmDialog/ModalFrame; Part 14 wins in this app since 2026-10-13 (owner), so the copied frame
// is gone and only the words are shared - minty-web keeps its look until it migrates.

/**
 * `LeaveDialog` (Figma 06·B A-11, "Leaving with changes not confirmed"): "Leave without saving?"
 * when the page has ticks pending and the person goes elsewhere - "Discard changes" drops them and
 * goes, "Go Back" stays (the Primary: staying is the safe choice). Escape and the scrim stay too.
 */

import { useRef } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Overlay";

export const LEAVE_TITLE = "Leave without saving?";
export const LEAVE_BODY_1 = "You have unsaved changes.";
export const LEAVE_BODY_2 = "Your changes will be lost if you leave this page.";
export const DISCARD_CHANGES = "Discard changes";
export const GO_BACK_UPPER = "Go Back";

export function LeaveDialog({ onDiscard, onStay }: { onDiscard: () => void; onStay: () => void }) {
  const stay = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open
      role="alertdialog"
      zIndex={250}
      title={<span data-modal="leave">{LEAVE_TITLE}</span>}
      description={
        <>
          <p>{LEAVE_BODY_1}</p>
          <p>{LEAVE_BODY_2}</p>
        </>
      }
      initialFocus={stay}
      onRequestClose={onStay}
      footer={
        <>
          <Button kind="secondary" onClick={onDiscard}>
            {DISCARD_CHANGES}
          </Button>
          <Button ref={stay} kind="primary" onClick={onStay}>
            {GO_BACK_UPPER}
          </Button>
        </>
      }
    />
  );
}
