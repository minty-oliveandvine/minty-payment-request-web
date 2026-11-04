/**
 * The bill forms' messages, one wording for every form that asks for the same thing (owner,
 * 2026-11-04): the new-bill dialog, the bill detail and draft edit forms, and the upload-invoice
 * and bank-slip dialogs. Part 11 §11.18: the issue, then the action - calm, never "Error",
 * "Invalid", "Mandatory" or "required field"; a limit names the allowed value.
 */

import { MAX_AMOUNT_INT_DIGITS } from "@minty/shared/money";

export const AMOUNT_EMPTY = "The amount is still empty. Add the amount to continue.";
export const AMOUNT_TOO_LONG = `The amount is too long. Use up to ${MAX_AMOUNT_INT_DIGITS} digits before the decimal point.`;
export const AMOUNT_ZERO = "The amount is zero. Add an amount above 0 to continue.";
export const SUPPLIER_EMPTY = "The supplier is still empty. Choose a supplier to continue.";
export const ACCOUNT_EMPTY = "The account is still empty. Choose the Xero account to continue.";
export const INVOICE_DATE_EMPTY =
  "The invoice date is still empty. Add the invoice date to continue.";
export const DUE_DATE_EMPTY = "The due date is still empty. Add the due date to continue.";
export const ATTACHMENT_MISSING =
  "The invoice is still missing. Attach at least one file to continue.";

/** One or more files over the 10 MB limit, by name. */
export function filesTooBig(names: string[]): string {
  return names.length > 1
    ? `These files are over 10 MB: ${names.join(", ")}. Choose files up to 10 MB.`
    : `${names[0]} is over 10 MB. Choose a file up to 10 MB.`;
}

/** One or more files of a type the forms can't open, by name. */
export function filesNotOpenable(names: string[]): string {
  return `I can't open ${names.join(", ")}. Choose a PDF, JPEG, PNG or HTML file.`;
}

/** A new supplier, created in the company's Xero organisation. */
export const SUPPLIER_ADDED = "Supplier added to Xero.";
