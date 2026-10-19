"use client";

/**
 * "Needs attention" - the list page's anchor, directly under the page header (Part 15.4a
 * Operational, Work Coordination: "What needs my attention next?"). Three tiles - Overdue,
 * Due in 7 days, Returned - each a toggle button that applies the list's own filters, with the
 * totals banner as the supporting figure beneath. With nothing to show it collapses to one calm
 * line rather than three zeros.
 *
 * Overdue carries the Warning tone on its surface, with an icon and words (never colour alone);
 * amounts stay text/primary (Part 13 §13.4). No character here (Part 15.4 retired the mascot
 * beside lists).
 */

import type { ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { currencyLabelForCode } from "@/lib/currencyDisplay";
import type { AttentionGroup, PaymentRequestAttention } from "@/lib/paymentRequestAttention";

import { formatTotal, MAX_CURRENCY_GROUPS } from "./PaymentRequestTotalsBanner";

export type AttentionTile = "overdue" | "dueSoon" | "returned";

export type PaymentRequestAttentionStripProps = {
  /** From the last whole-list load; `null` until one has finished. */
  attention: PaymentRequestAttention | null;
  /** The tile whose filter is applied now, if any. */
  active: AttentionTile | null;
  onSelect: (tile: AttentionTile) => void;
  /** The totals banner, when it is showing. */
  supporting?: ReactNode;
};

const TILE_BASE =
  // Phone: one compact row each (label + detail left, count right) so three tiles don't push
  // the list off the first screen; from 640px three stacked-content tiles side by side.
  "grid min-h-11 min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-lg border px-4 py-3 text-left sm:flex sm:flex-col sm:items-start sm:gap-1 sm:p-4 transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Per currency, at most two, then "+N more" - the totals banner's rule. */
function UnpaidLines({ group }: { group: AttentionGroup }) {
  if (group.count === 0) return null;
  const shown = group.unpaid.slice(0, MAX_CURRENCY_GROUPS);
  const hidden = Math.max(0, group.unpaid.length - MAX_CURRENCY_GROUPS);
  return (
    <span className="flex flex-col text-body-s text-text-primary tabular-nums" translate="no">
      {shown.map((u) => (
        <span key={u.code} className="whitespace-nowrap">
          {currencyLabelForCode(u.code)} {formatTotal(u.amount)} unpaid
        </span>
      ))}
      {hidden > 0 ? (
        <span className="text-caption text-text-muted">
          +{hidden} more {hidden === 1 ? "currency" : "currencies"}
        </span>
      ) : null}
    </span>
  );
}

function Tile({
  tile,
  label,
  icon,
  count,
  warning,
  active,
  onSelect,
  children,
}: {
  tile: AttentionTile;
  label: string;
  icon: string;
  count: number;
  warning?: boolean;
  active: boolean;
  onSelect: (tile: AttentionTile) => void;
  children?: ReactNode;
}) {
  // Pressed = the selection border (Part 13 state/selected), over whatever surface the tile has.
  const border = active
    ? "border-border-selected ring-1 ring-border-selected"
    : warning
      ? "border-status-warning-ink/30 hover:border-status-warning-ink/60"
      : "border-border-default";
  const fill = warning
    ? "bg-status-warning-bg"
    : active
      ? "bg-state-selected"
      : "bg-surface-card hover:bg-state-hover";
  return (
    <button
      type="button"
      aria-pressed={active}
      data-attention-tile={tile}
      onClick={() => onSelect(tile)}
      className={`${TILE_BASE} ${border} ${fill}`}
    >
      <span
        className={`flex items-center gap-1.5 text-label ${warning ? "text-status-warning-ink" : "text-text-secondary"}`}
      >
        <Icon name={icon} size="sm" />
        {label}
      </span>
      <span className="col-start-2 row-span-2 row-start-1 text-title-m text-text-primary tabular-nums sm:text-title-l">
        {plural(count, "request", "requests")}
      </span>
      {children}
    </button>
  );
}

export function PaymentRequestAttentionStrip({
  attention,
  active,
  onSelect,
  supporting,
}: PaymentRequestAttentionStripProps) {
  if (!attention) {
    return (
      <section aria-label="Needs attention" aria-busy="true" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </section>
    );
  }

  // A tile that is applied stays, even at zero, so its filter can be switched off again.
  if (attention.isQuiet && active === null) {
    return (
      <section aria-label="Needs attention" className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-body-m text-text-secondary">
          <Icon name="check_circle" size="md" />
          Nothing is overdue or due this week.
        </p>
        {supporting ? <div className="flex justify-end">{supporting}</div> : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="pr-attention-heading" className="flex flex-col gap-3">
      <h2 id="pr-attention-heading" className="text-label uppercase text-text-secondary">
        Needs attention
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          tile="overdue"
          label="Overdue"
          icon="event_busy"
          count={attention.overdue.count}
          warning={attention.overdue.count > 0}
          active={active === "overdue"}
          onSelect={onSelect}
        >
          <UnpaidLines group={attention.overdue} />
        </Tile>
        <Tile
          tile="dueSoon"
          label="Due in 7 days"
          icon="event_upcoming"
          count={attention.dueSoon.count}
          active={active === "dueSoon"}
          onSelect={onSelect}
        >
          <UnpaidLines group={attention.dueSoon} />
        </Tile>
        <Tile
          tile="returned"
          label="Returned"
          icon="assignment_return"
          count={attention.returned.count}
          active={active === "returned"}
          onSelect={onSelect}
        >
          {attention.returned.count > 0 ? (
            <span className="text-body-s text-text-secondary">Back with the requester</span>
          ) : null}
        </Tile>
      </div>
      {supporting ? <div className="flex justify-end">{supporting}</div> : null}
    </section>
  );
}
