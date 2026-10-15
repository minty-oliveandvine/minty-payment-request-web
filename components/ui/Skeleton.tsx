/**
 * Part 14 skeleton row: shown when loading takes more than ~300ms; the region says `aria-busy`.
 * No shimmer under reduced motion (Part 13 §13.12).
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded-md bg-surface-sunk motion-reduce:animate-none ${className}`}
    />
  );
}
