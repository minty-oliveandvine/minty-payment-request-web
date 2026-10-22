"use client";

import { Button } from "@/components/ui/Button";

export type BillDraftSubmitButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
};

/** A draft's (or a returned request's) Primary: "Submit for payment" (Part 15.16; verb + object). */
export function BillDraftSubmitButton({ onClick, disabled, pending }: BillDraftSubmitButtonProps) {
  return (
    <Button
      kind="primary"
      onClick={onClick}
      disabled={disabled}
      processing={pending}
      processingLabel="Submitting…"
    >
      Submit for payment
    </Button>
  );
}
