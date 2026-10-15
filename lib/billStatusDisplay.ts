import { statusTone, TONE_CLASS } from "./statusTone";

/** Maps API bill `status` (lowercase) to list/detail display labels. */
export function billStatusToDisplayLabel(status: string): string {
  const k = status.trim().toLowerCase().replace(/-/g, "_");
  const map: Record<string, string> = {
    draft: "Draft",
    submitted: "Payment Requested",
    paid: "Paid",
    partially_paid: "Partially Paid",
    void: "Voided",
    returned: "Returned",
  };
  if (map[k]) return map[k];
  if (!k) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * The Status pill's classes for a display label (Part 14 "Status pill"; tones in
 * `lib/statusTone.ts`, Part 13 §13.4). The ONE place a status gets its colour - the detail
 * header, the table and Easy view all read it. Prefer `<StatusPill>`; this exists for the
 * elements that must stay a different tag.
 */
export function statusDisplayBadgeClass(displayLabel: string): string {
  return `inline-flex min-h-6 max-w-full items-center justify-center rounded-full px-3 py-1 text-label whitespace-nowrap ${TONE_CLASS[statusTone(displayLabel)]}`;
}
