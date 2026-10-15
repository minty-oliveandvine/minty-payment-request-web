/**
 * Part 13 §13.9 icons: Material Symbols ROUNDED, weight 400, grade 0 (D-20), one of three sizes -
 * sm 16 (in pills and 12-13px text), md 20 (buttons, inputs, rows), lg 24 (app bar, nav, empty
 * state). Colour comes from the surrounding text role (`currentColor`).
 *
 * The package's own CSS sets `font-size: 24px` unlayered, which beats any utility class, so the
 * size goes on `style` - the one thing that reliably wins over it.
 *
 * Decorative by default (`aria-hidden`); give `label` when the icon alone carries meaning, and
 * only on the controls Part 13 allows to be icon-only: close, back, menu, search, more.
 */

import type { CSSProperties } from "react";

const PX = { sm: 16, md: 20, lg: 24 } as const;

export type IconSize = keyof typeof PX;

export function Icon({
  name,
  size = "md",
  filled = false,
  label,
  className,
}: {
  /** The Material Symbols ligature, e.g. `close`, `upload_file`. */
  name: string;
  size?: IconSize;
  filled?: boolean;
  label?: string;
  className?: string;
}) {
  const style: CSSProperties = {
    fontSize: PX[size],
    lineHeight: 1,
    fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${PX[size]}`,
  };
  return (
    <span
      className={`material-symbols-rounded inline-block shrink-0 select-none${className ? ` ${className}` : ""}`}
      style={style}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {name}
    </span>
  );
}
