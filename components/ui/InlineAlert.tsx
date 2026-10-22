/**
 * Part 14 "Inline alert" and "Page banner". Tone Info | Success | Warning | Danger; icon, title,
 * body, at most one Link-style action. Radius 8, padding 12. They stay until the cause is
 * resolved - errors never go in a toast (Part 14 Toast: "never used for errors").
 *
 * `role=alert` for Danger (it interrupts), `role=status` otherwise. The icon repeats the tone so
 * meaning is never colour alone.
 *
 * PageBanner is the same piece at page width under the page header: one at a time, highest
 * consequence first, not dismissible while it blocks.
 */

import type { ReactNode } from "react";

import { Icon } from "./Icon";

export type AlertTone = "info" | "success" | "warning" | "danger";

const TONE: Record<AlertTone, { box: string; icon: string }> = {
  info: { box: "bg-status-info-bg text-status-info-ink", icon: "info" },
  success: { box: "bg-status-success-bg text-status-success-ink", icon: "check_circle" },
  warning: { box: "bg-status-warning-bg text-status-warning-ink", icon: "warning" },
  danger: { box: "bg-status-danger-bg text-status-danger-ink", icon: "error" },
};

export function InlineAlert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** One Link-kind action ("Try again", "Edit and resubmit"). */
  action?: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      data-tone={tone}
      className={`flex min-w-0 items-start gap-3 rounded-md p-3 ${t.box}${className ? ` ${className}` : ""}`}
    >
      <Icon name={t.icon} size="md" className="mt-px" />
      <div className="min-w-0 flex-1 text-body-m">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : ""}>{children}</div> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function PageBanner(props: Parameters<typeof InlineAlert>[0]) {
  return (
    <InlineAlert {...props} className={`w-full${props.className ? ` ${props.className}` : ""}`} />
  );
}
