import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "We'll be back soon",
  description: "Minty is down for scheduled maintenance.",
};

/** Set `MAINTENANCE_SHOW_NEW_LINK=1` (or `true`) when the new app link should appear in the footer. */
const showNewAppLink =
  process.env.MAINTENANCE_SHOW_NEW_LINK === "1" ||
  process.env.MAINTENANCE_SHOW_NEW_LINK === "true";

export default function MaintenancePage() {
  return (
    <div className="flex min-h-dvh min-h-screen flex-col bg-surface-card">
      <header className="flex w-full shrink-0 justify-center px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-2 sm:pt-8 sm:pb-3">
        <Image
          src="/minty-mark.png"
          alt="Logo"
          width={160}
          height={160}
          className="h-12 w-auto object-contain object-bottom sm:h-14"
        />
      </header>
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center px-6 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <Image
            src="/cat-hole.png"
            alt="Minty peeking through"
            width={480}
            height={480}
            priority
            className="mx-auto h-auto w-full max-w-[min(100%,20rem)] object-contain sm:max-w-[22rem]"
          />
          <h1 className="mt-8 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl md:text-5xl">
            We&apos;ll be back soon
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-text-secondary sm:text-base">
            Minty is down for a scheduled maintenance.
          </p>
        </div>
      </div>

      <footer
        className={`shrink-0 w-full px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-center sm:pb-6 sm:pt-4 ${showNewAppLink ? "" : "hidden"}`}
      >
        <p className="text-caption leading-snug text-text-muted sm:text-xs">
          This will be the new link for the app:{" "}
          <a
            href="https://www.minty.oliveandvinehk.com"
            className="font-medium text-text-secondary underline decoration-border-default underline-offset-2 transition-colors hover:text-text-link hover:decoration-text-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            https://www.minty.oliveandvinehk.com
          </a>
        </p>
      </footer>
    </div>
  );
}
