import Image from "next/image";
import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { NavMenu } from "@/components/ui/NavMenu";
import { ViewerBadge } from "@/components/ui/ViewerBadge";

/**
 * Part 14 "App bar" (v1.1): back (in a drill-down) · the Minty mark · entity name · avatar · menu.
 * The mark is minty-web's hub mark (`/minty-mark.png`, its AppHeader's `showLogo`, same size), in
 * place of the module name as text (the user, 2026-10-13); the module name stays for screen readers.
 * 60px on a computer, 56 on a phone; surface/card with a border/subtle rule; a `<header>`
 * landmark. It identifies WHERE you are - the page's own title, status and actions belong to
 * the page header (components/ui/PageHeader.tsx), and the module name here is never a heading.
 *
 * The entity name is spelled out, never an acronym; it truncates first, and below 360px it goes
 * (the avatar stays). The two sidebar doors - the initials (My Profile) and the ≡ (the menu) - are
 * the packaged @minty/shared sidebar's.
 */

type HeaderProps = {
  /** The module, e.g. "Payment Request" (Part 14: module names consistent everywhere). */
  title?: string;
  /** A drill-down's way back - shown as "‹ <backLabel>". */
  backHref?: string;
  backLabel?: string;
  companyName?: string;
  /** The page draws a Record page header with its own back link (from 768px) - hide this one there. */
  backInPage?: boolean;
  /** Kept for the callers that read it; the App bar draws no Xero state. */
  xeroConnected?: boolean;
};

export function Header({
  title = "Payment Request",
  backHref,
  backLabel = "Payment Requests",
  companyName = "Insert Company Here",
  backInPage = false,
}: HeaderProps) {
  return (
    <header className="border-b border-border-subtle bg-surface-card pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-2 px-4 sm:h-15 sm:gap-3 sm:px-6 lg:px-8">
        {/* Part 15.1: on a phone the App bar holds the way back; from 768px the page header's
            Record back link does, so the two never show together. */}
        {backHref ? (
          <Link
            href={backHref}
            className={`-ml-2 inline-flex min-h-11 min-w-11 shrink-0 items-center gap-1 rounded-lg px-2 text-body-m font-medium text-text-link hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${backInPage ? "md:hidden" : ""}`}
            aria-label={`Back to ${backLabel}`}
          >
            <Icon name="chevron_left" size="lg" />
            {backInPage ? null : <span className="hidden sm:inline">{backLabel}</span>}
          </Link>
        ) : null}
        <Image
          src="/minty-mark.png"
          alt="Minty"
          width={40}
          height={40}
          priority
          unoptimized
          className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10"
        />
        <span className="sr-only">{title}</span>
        <div className="ml-auto flex min-w-0 shrink items-center gap-1 sm:gap-2">
          <span className="hidden min-w-0 items-center gap-1.5 text-body-m text-text-secondary min-[360px]:flex">
            <Icon name="corporate_fare" size="md" />
            {/* A plain cap, not min(100%,…): a percentage counts as no cap while the shrink-0
                block around it is sized, and a long name covered the way back on a phone. */}
            <span className="min-w-0 max-w-[7rem] truncate sm:max-w-[12rem] lg:max-w-[20rem]">
              {companyName}
            </span>
          </span>
          <ViewerBadge />
          <NavMenu />
        </div>
      </div>
    </header>
  );
}
