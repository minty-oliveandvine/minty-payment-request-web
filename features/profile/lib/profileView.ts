// COPY of minty-web/features/profile/lib/profileView.ts (2026-09-30) - lifted into @minty/shared
// at Part 3 step 4; change all three (minty-web, here, Flask's port). `backHref` is not copied: it serves minty-web's `/profile` page,
// and this app draws the profile only in the sidebar.

/**
 * My Profile's rules, pure (Figma 10-A / 10-B, `43YI3MYtTfX5Xzz6dRoRuT` 1410:3314 / 1410:3364):
 * what the plan under the company says, and what the details card refuses before anything is
 * sent.
 */

import { EMAIL_ASCII_HINT, hasNonAsciiEmailChar } from "@minty/shared/emailInput";
import type { ProfileChanges, ProfileCompany } from "@/features/profile/api/profile";

export const PAGE_TITLE = "My Profile";
export const FIRST_NAME = "FIRST NAME";
export const LAST_NAME = "LAST NAME";
export const PASSWORD = "PASSWORD";
export const EDIT = "Edit";
export const CHANGE = "Change";
export const LOG_OUT = "Log Out";
export const SAVE = "Save";
export const CANCEL = "Cancel";
export const LOAD_FAILED = "Your profile didn't come through. Mind trying again?";
export const SAVE_FAILED = "That didn't quite save. Mind trying again?";
export const EMAIL_REQUIRED = "We'll need an email here.";
export const SAVED = "Your profile is saved.";

/**
 * Where "PASSWORD · Change" goes: the Xero account page, as the old profile did (the user's
 * call, 2026-09-29). Minty itself holds no password for most people - they sign in with an
 * email code or with Xero.
 */
export const CHANGE_PASSWORD_URL = "https://identity.xero.com/account";

export type PlanLabel = { text: string; tone: string; cat: boolean };

/**
 * The line under the company: its plan. Both modules on is "SuperMinty" (10-B, teal, with the
 * caped cat); one is that module's name in that module's colour - Payment Request's blue (10-A),
 * Petty Cash's amber (the pair the subscription screens draw the two in); none, nothing.
 */
export function planLabel(company: ProfileCompany | null): PlanLabel | null {
  if (!company) return null;
  const petty = company.modules.includes("PETTY_CASH");
  const payments = company.modules.includes("PAYMENT_REQUEST");
  if (petty && payments)
    return { text: "SuperMinty", tone: "font-bold text-teal-strong", cat: true };
  if (payments) return { text: "Payment Request", tone: "text-[#2e6ff2]", cat: false };
  if (petty) return { text: "Petty Cash", tone: "text-[#ea9713]", cat: false };
  return null;
}

/** Only what changed is sent; an emptied email is refused here, with the old profile's words. */
export function changesFrom(
  draft: Required<ProfileChanges>,
  saved: Required<ProfileChanges>,
): { changes: ProfileChanges; error: string | null } {
  if (!draft.email.trim()) return { changes: {}, error: EMAIL_REQUIRED };
  if (hasNonAsciiEmailChar(draft.email)) return { changes: {}, error: EMAIL_ASCII_HINT };
  const changes: ProfileChanges = {};
  for (const key of ["first_name", "last_name", "email"] as const) {
    if (draft[key].trim() !== saved[key]) changes[key] = draft[key];
  }
  return { changes, error: null };
}
