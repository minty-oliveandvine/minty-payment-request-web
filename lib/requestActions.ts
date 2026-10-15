/**
 * Part 15.17 "Status × action matrix" - what can be done to a payment request in each status,
 * and which ONE action is a row's next step. The list's rows and the detail page's header both
 * read this, so the two can never offer different things.
 *
 * | Status            | Next (row)     | Also (detail header / overflow)                   |
 * |-------------------|----------------|---------------------------------------------------|
 * | Payment Requested | Record payment | Return (Secondary), Void (overflow → Destructive) |
 * | Partially Paid    | Record payment | View payments, Void (overflow)                    |
 * | Paid              | View payments  | -                                                 |
 * | Returned          | View           | (the requester edits and resubmits)               |
 * | Draft             | Continue       | (the requester's)                                 |
 * | Voided            | View           | -                                                 |
 *
 * Role-aware: money actions need an elevated role and a member's access (`canPay`); anything a
 * person cannot do is left out, never drawn dead without a reason (Part 15.2).
 */

export type RequestAction = "record" | "viewPayments" | "continue" | "view" | "return" | "void";

export type ActionContext = {
  /** Elevated role (accountant / admin / super admin) - may record, return and void. */
  isElevated: boolean;
  /** A system superuser on a company they are not a member of: reads only. */
  isViewOnly: boolean;
};

/** The ONE next action a row offers for this status, or null when the row is only opened. */
export function rowNextAction(displayStatus: string, ctx: ActionContext): RequestAction | null {
  const canPay = ctx.isElevated && !ctx.isViewOnly;
  switch (displayStatus) {
    case "Payment Requested":
    case "Partially Paid":
      return canPay ? "record" : "view";
    case "Paid":
      return "viewPayments";
    case "Draft":
      return ctx.isViewOnly ? "view" : "continue";
    case "Returned":
    case "Voided":
      return "view";
    default:
      return null;
  }
}

/** The detail header's extra actions for this status (besides the Primary). */
export function detailActions(displayStatus: string, ctx: ActionContext): RequestAction[] {
  const canPay = ctx.isElevated && !ctx.isViewOnly;
  if (!canPay) return displayStatus === "Paid" || displayStatus === "Partially Paid" ? ["viewPayments"] : [];
  switch (displayStatus) {
    case "Payment Requested":
      return ["return", "void"];
    case "Partially Paid":
      return ["viewPayments", "void"];
    case "Paid":
      return ["viewPayments"];
    default:
      return [];
  }
}

/** The words on the button - verb + object, never "OK" / "Submit" alone (Part 15.2). */
export const ACTION_LABEL: Record<RequestAction, string> = {
  record: "Record payment",
  viewPayments: "View payments",
  continue: "Continue",
  view: "View",
  return: "Return to requester",
  void: "Void",
};
