import { buttonClass } from "@/components/ui/Button";

/**
 * Part 15.2 action hierarchy for a payment request, as class strings for the places that still
 * render their own `<button>` (prefer `<Button>` in new code):
 *
 * - a ROW's one next action is Secondary - the page's only Primary is "Add payment request";
 * - on the detail page Record payment IS the Primary, and Return is Secondary (never coloured
 *   like a status, never Danger: Return is not destructive).
 */

/** List row - Record payment (Secondary: one Primary per context; 32px inside the compact table). */
export const recordPaymentButtonClass = buttonClass("secondary", { compact: true });

/** Detail page - Record payment, the page's Primary. */
export const recordPaymentDetailButtonClass = buttonClass("primary");

/** Detail page - Return to requester (Secondary). */
export const returnPaymentRequestButtonClass = buttonClass("secondary");
