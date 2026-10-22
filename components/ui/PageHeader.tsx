/**
 * Part 14 / 15.1 "Page header". One h1 per page; never repeats the module or the entity (the App
 * bar says those).
 *
 * - Type = Page: title, a purpose line of at most ~12 words, actions.
 * - Type = Record: a one-level back link ("‹ Payment Requests"), the record's name, its Status
 *   pill, ONE metadata line, actions.
 *
 * Actions, in order: [Secondary] [Primary] [More], right-aligned on a computer. Exactly one
 * Primary. On a phone the Primary becomes full width under the title, and the Secondaries share
 * the row below it with More at its end - which is why `actions`, `primary` and `more` are separate.
 * Header actions are role-aware: the caller leaves out what the person cannot do.
 *
 * `art` is the module's identity (Part 13 §13.10 Module art, 28-56px, on the module wash) beside
 * the title - identity, never a character (Part 15.4 retired the mascot beside lists).
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "./Icon";

export function PageHeader({
  title,
  art,
  purpose,
  back,
  status,
  meta,
  actions,
  primary,
  more,
  below,
}: {
  title: ReactNode;
  /** Module art drawn left of the title; decorative, so the caller hides it from assistive tech. */
  art?: ReactNode;
  purpose?: ReactNode;
  /** Record type only: the parent list. */
  back?: { href: string; label: string };
  status?: ReactNode;
  meta?: ReactNode;
  /** Secondary actions. */
  actions?: ReactNode;
  /** The ONE Primary action. */
  primary?: ReactNode;
  /** The More (overflow) menu - always last. */
  more?: ReactNode;
  /** A page-wide state (Page banner) - it goes straight under the header. */
  below?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-4 px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      {back ? (
        // From 768px; on a phone the App bar carries the way back (Part 15.1).
        <Link
          href={back.href}
          className="-ml-1 hidden min-h-11 w-fit items-center gap-1 rounded-lg pr-2 text-body-m font-medium text-text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus md:inline-flex"
        >
          <Icon name="chevron_left" size="md" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            {art}
            <h1 className="min-w-0 break-words text-display-m text-text-primary">{title}</h1>
            {status}
          </div>
          {purpose ? <p className="text-body-m text-text-secondary">{purpose}</p> : null}
          {meta ? <p className="text-body-s text-text-muted">{meta}</p> : null}
        </div>
        {actions || primary || more ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:flex-nowrap md:gap-3 lg:shrink-0 lg:justify-end">
            {primary ? (
              <div className="flex w-full md:order-2 md:w-auto [&>*]:w-full md:[&>*]:w-auto">
                {primary}
              </div>
            ) : null}
            {actions ? (
              <div className="flex min-w-0 grow flex-wrap gap-2 md:order-1 md:grow-0 md:flex-nowrap md:gap-3 [&>*]:grow md:[&>*]:grow-0">
                {actions}
              </div>
            ) : null}
            {more ? <div className="flex shrink-0 md:order-3">{more}</div> : null}
          </div>
        ) : null}
      </div>
      {below}
    </div>
  );
}
