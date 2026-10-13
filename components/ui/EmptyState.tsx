/**
 * Part 14 "Empty state" (Part 15.11): at most 400 wide, centred. First use shows Minty (the
 * character is decoration - `alt=""`); No results shows NO character. Title, one line of
 * explanation, at most one action. Never "No data".
 */

import Image from "next/image";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  children,
  action,
  character = false,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** First use only - a filtered list that matched nothing gets no character. */
  character?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto flex w-full max-w-[400px] flex-col items-center gap-3 px-4 py-12 text-center${className ? ` ${className}` : ""}`}
    >
      {character ? (
        // Part 13 §13.11 wants the 3D Minty character (Figma Character 3604:233); this app holds
        // only the older 2D cat until that asset is exported - a known gap (docs/features/README.md).
        <Image
          src="/cat-hole.png"
          alt=""
          width={120}
          height={120}
          className="size-[120px] object-contain"
          unoptimized
        />
      ) : null}
      <p className="text-title-m text-text-primary">{title}</p>
      {children ? <p className="text-body-m text-text-secondary">{children}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
