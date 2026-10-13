/**
 * A payment request's status -> its Part 13 tone (§13.4 status-tone mapping, D-07, D-27, S4-03).
 *
 * - Info:    Payment Requested (Treasury's to-do; Submitted is Info in every module).
 * - Warning: Partially Paid, Returned.
 * - Success: Paid.
 * - Neutral: Draft, Voided (a confirmed end state is not a failure - D-27; the Void ACTION and
 *            its confirmation stay Danger).
 * - Danger:  Payment failed / Upload failed only - no payment-request status is Danger.
 *
 * Keyed by the DISPLAY label (`billStatusToDisplayLabel`), the words the person sees, so the pill
 * and its tone can never disagree. Anything unknown is Neutral.
 */

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE: Record<string, StatusTone> = {
  "Payment Requested": "info",
  "Partially Paid": "warning",
  Returned: "warning",
  Paid: "success",
  Draft: "neutral",
  Voided: "neutral",
};

export function statusTone(displayLabel: string): StatusTone {
  return TONE[displayLabel] ?? "neutral";
}

/** The pill's colours: soft background + deep ink, no border (D-09). */
export const TONE_CLASS: Record<StatusTone, string> = {
  success: "bg-status-success-bg text-status-success-ink",
  warning: "bg-status-warning-bg text-status-warning-ink",
  danger: "bg-status-danger-bg text-status-danger-ink",
  info: "bg-status-info-bg text-status-info-ink",
  neutral: "bg-status-neutral-bg text-status-neutral-ink",
};
