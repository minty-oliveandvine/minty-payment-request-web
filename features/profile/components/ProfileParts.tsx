// COPY of minty-web/features/profile/components/ProfileParts.tsx (2026-09-30) - lifted into
// @minty/shared at Part 3 step 4; change all three (minty-web, here, Flask's port). `ProfileTitlebar` (minty-web's `/profile` page) is
// not copied: this app draws the profile only in the sidebar.

/**
 * My Profile's frame and its fixed pieces (Figma 10-A, 1410:3314): the sidebar panel's titlebar
 * (‹ back to the menu, "My Profile", close), the head (the company it was opened from and its
 * plan, the avatar, the name, the role), Log Out, and the loading and failed states.
 */

import Image from "next/image";

import { logOut } from "@/components/ui/sidebarHost";

import type { Profile } from "@/features/profile/api/profile";
import { LOG_OUT, PAGE_TITLE, planLabel } from "@/features/profile/lib/profileView";

/**
 * The sidebar's My Profile titlebar: ‹ goes back to the menu - the panel is the sidebar's
 * second view, not a page - and the close is the way out on a phone, where the panel fills the
 * screen. Heading level 2: the page underneath owns the level 1.
 */
export function ProfilePanelTitlebar({
  onBack,
  onClose,
}: {
  onBack?: () => void;
  onClose?: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between bg-surface-sunk px-4 py-1.5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to the menu"
        className="flex size-10 cursor-pointer items-center justify-center rounded-md hover:bg-state-hover"
      >
        <Image
          className="-scale-x-100"
          src="/profile/back.svg"
          alt=""
          width={24}
          height={24}
          unoptimized
        />
      </button>
      <h2 className="p-2.5 text-center text-base font-semibold whitespace-nowrap text-text-muted">
        {PAGE_TITLE}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close My Profile"
        className="flex size-10 cursor-pointer items-center justify-center rounded-md text-text-muted hover:bg-state-hover"
      >
        <span className="material-symbols-rounded text-[24px] leading-none" aria-hidden>
          close
        </span>
      </button>
    </header>
  );
}

export function ProfileHero({ profile }: { profile: Profile }) {
  const company = profile.entity;
  const plan = planLabel(company);
  return (
    <section className="flex flex-col items-center text-center" aria-label="Who you are">
      {company ? (
        // The caped cat hangs 74 px off the name's right (10-B), so beside it the name keeps 74 px
        // clear on BOTH sides - still centred, and wrapping before the cat can reach past the
        // edge (a long company name put a sideways scrollbar under the sidebar's profile).
        <div
          className={`relative mt-[21px] flex flex-col items-center ${plan?.cat ? "max-w-[calc(100%-148px)]" : "max-w-full"}`}
        >
          <p className="text-sm leading-5 text-text-muted">{company.name}</p>
          {plan ? <p className={`mt-2.5 text-caption leading-3 ${plan.tone}`}>{plan.text}</p> : null}
          {plan?.cat ? (
            <Image
              className="absolute -right-[74px] -top-[16px] h-[56px] w-[60px] object-contain"
              src="/profile/super-minty.png"
              alt=""
              width={240}
              height={240}
              unoptimized
            />
          ) : null}
        </div>
      ) : null}
      <span
        className={`${company ? "mt-[23px]" : "mt-[42px]"} flex h-[75px] w-[74px] items-center justify-center rounded-[91px] bg-[var(--avatar-bg)] text-[30px] font-medium text-[var(--avatar-fg)]`}
        aria-hidden
      >
        {profile.user.initials}
      </span>
      <h2 className="mt-[15px] text-[30px] leading-9 font-bold text-text-primary">
        {profile.user.name}
      </h2>
      {company?.role_label ? (
        <p className="mt-[9px] rounded-[25px] bg-state-selected px-[15px] text-caption leading-5 text-text-secondary">
          {company.role_label}
        </p>
      ) : null}
    </section>
  );
}

export function LogOutButton() {
  return (
    <button
      type="button"
      onClick={() => void logOut()}
      className="mx-auto mt-[74px] flex cursor-pointer items-center gap-[10px] rounded-md px-3 py-1 text-xs leading-[21px] text-text-muted hover:bg-surface-sunk"
    >
      <Image src="/profile/logout.svg" alt="" width={13} height={13} unoptimized aria-hidden />
      {LOG_OUT}
    </button>
  );
}

export function ProfileLoading() {
  return (
    <div
      className="mt-[42px] flex flex-col items-center gap-4"
      role="status"
      aria-label="Loading your profile"
    >
      <span className="h-[75px] w-[74px] animate-pulse rounded-full bg-surface-sunk" />
      <span className="h-8 w-56 animate-pulse rounded-lg bg-surface-sunk" />
      <span className="mt-6 h-[184px] w-full animate-pulse rounded-lg bg-surface-card" />
    </div>
  );
}

export function ProfileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-[42px] flex flex-col items-center gap-3 text-center" role="alert">
      <p className="text-sm text-text-secondary">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="cursor-pointer rounded-lg bg-action-primary px-5 py-2 text-sm font-medium text-action-on-primary hover:bg-action-primary"
      >
        Try again
      </button>
    </div>
  );
}
