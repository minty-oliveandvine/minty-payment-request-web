import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { NavMenu } from "@/components/ui/NavMenu";
import { ViewerBadge } from "@/components/ui/ViewerBadge";

type HeaderProps = {
  title?: string;
  showLogo?: boolean;
  brandHref?: string | null;
  /** When set, shows a back link to the payment request dashboard (Bills table). Title is not linked to home. */
  backHref?: string;
  backLabel?: string;
  statusBadge?: ReactNode;
  titleActions?: ReactNode;
  companyName?: string;
  /** When true, tints the company icon green to indicate an active Xero connection. */
  xeroConnected?: boolean;
  /** Omit top safe-area padding when a row above the header already applies it. */
  suppressTopSafeArea?: boolean;
  /** Drop the bottom border (separator) — e.g. when a sticky pills row sits directly below. */
  noBorder?: boolean;
};

export function Header({
  title = "Payment Request",
  showLogo = false,
  brandHref,
  backHref,
  backLabel = "Payments",
  statusBadge,
  titleActions,
  companyName = "Insert Company Here",
  xeroConnected,
  suppressTopSafeArea = false,
  noBorder = false,
}: HeaderProps) {
  const homeHref = brandHref === undefined ? "/" : brandHref;
  const showBack = Boolean(backHref);

  const brand = (
    <>
      {showLogo ? (
        <Image src="/minty-mark.png" alt="" width={40} height={40} priority className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10" />
      ) : null}
      <span className="min-w-0 cursor-default truncate text-base font-semibold text-black sm:text-lg">{title}</span>
    </>
  );

  const leftSection = showBack && backHref ? (
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 sm:gap-3">
      <Link href={backHref} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary transition-colors hover:text-secondary sm:text-base">
        <span className="material-symbols-outlined text-[22px] leading-none sm:text-[24px]" aria-hidden>
          chevron_left
        </span>
        {backLabel}
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {showLogo ? (
          <Image src="/minty-mark.png" alt="" width={40} height={40} priority className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10" />
        ) : null}
        <span className="min-w-0 cursor-default truncate text-base font-semibold text-black sm:text-lg">{title}</span>
        {titleActions ? <div className="flex shrink-0 items-center">{titleActions}</div> : null}
      </div>
    </div>
  ) : homeHref ? (
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
      {showLogo ? (
        <Link href={homeHref} className="shrink-0">
          <Image src="/minty-mark.png" alt="" width={40} height={40} priority className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10" />
        </Link>
      ) : null}
      <span className="min-w-0 cursor-default truncate text-base font-semibold text-black sm:text-lg">{title}</span>
      {titleActions ? <div className="flex shrink-0 items-center">{titleActions}</div> : null}
    </div>
  ) : (
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">{brand}</div>
  );

  return (
    <header
      className={`bg-white ${noBorder ? "" : "border-b border-gray-200"} ${suppressTopSafeArea ? "" : "pt-[env(safe-area-inset-top,0px)]"}`}
    >
      <div className="mx-auto flex w-full max-w-[1920px] flex-row flex-wrap items-center justify-between gap-2 px-4 py-3 sm:flex-nowrap sm:gap-3 sm:px-6 sm:py-4">
        <div className={`flex min-w-0 min-h-10 items-center sm:min-h-0 ${statusBadge ? "flex-1 sm:flex-initial" : "flex-1"}`}>{leftSection}</div>
        {/* Rendered once (it reads the bill): on a phone the row has no room for it beside the
            way back, so it takes its own line under the row; from sm it sits after the title. */}
        {statusBadge ? <div className="order-last flex w-full sm:order-none sm:w-auto sm:shrink-0">{statusBadge}</div> : null}
        <div className={`flex min-w-0 shrink-0 items-center justify-end gap-1.5 sm:gap-3 ${statusBadge ? "ml-auto" : ""}`}>
          <span className="relative inline-flex shrink-0">
            <span
              className="material-symbols-outlined text-[22px] leading-none text-primary sm:text-[26px]"
              aria-hidden
            >
              corporate_fare
            </span>
          </span>
          {/* A plain 6.5rem, not min(100%,6.5rem): a percentage cap counts as no cap while the
              shrink-0 block around it is sized, so on a phone a long name made it cover the way
              back (fixed in minty-web's AppHeader and Flask's port too). */}
          <span className="min-w-0 max-w-[6.5rem] truncate text-sm font-medium text-primary sm:max-w-[9rem] sm:text-base md:max-w-[14rem] lg:max-w-md">
            {companyName}
          </span>
          {/* The sidebar's two doors (components/ui/Sidebar.tsx, copied from minty-web): the
              initials open My Profile, the ≡ the menu. The menu's Logout is the app's. */}
          <div className="flex shrink-0 items-center gap-1.5 pl-0.5 sm:gap-2 sm:pl-2">
            <ViewerBadge />
            <NavMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
