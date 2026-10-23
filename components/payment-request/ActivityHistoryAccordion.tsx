"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@minty/shared/money";
import { fetchAuditHistory, type AuditItem } from "@/lib/api";
import { billStatusToDisplayLabel } from "@/lib/billStatusDisplay";
import { formatLocalDateForDisplay } from "@/lib/dateDisplayFormat";

type ActivityHistoryItem = {
  id: string;
  initials: string;
  userName: string;
  verb: string;
  subjectBold: string;
  timeLabel: string;
  changes: string[];
};

type ActivityHistoryAccordionProps = {
  billId: string;
  /** The company's currency, for the amounts in payment entries. */
  currencyCode?: string;
  refreshSignal?: number;
};

/**
 * The backend logs first-publish and republish under the same `published_to_xero`
 * action, and distinguishes them only in the audit detail (see
 * `xero_publish_service.py`): a first publish writes "Published to Xero…", while
 * the two republish paths write "Updated Xero invoice…" or "Voided AUTHORISED
 * invoice and recreated…". Read the detail so the history says which one it was.
 */
function publishVerb(detail: string): string {
  const d = detail.trim();
  if (/^Updated Xero invoice/i.test(d)) return "republished";
  if (/^Voided AUTHORISED invoice and recreated/i.test(d)) return "republished";
  if (/^Update failed/i.test(d) || /^Recreate as DRAFT failed/i.test(d)) {
    return "failed to republish";
  }
  if (/^Publish failed/i.test(d)) return "failed to publish";
  return "published";
}

/** "a payment of HKD 1,200.00" from the backend's "Payment of 1200.00 …", else "a payment". */
function paymentSubject(detail: string, currencyCode: string): string {
  const m = detail.match(/Payment of ([\d,.]+)/);
  const amount = m ? formatMoney(m[1], currencyCode) : "";
  return amount ? `a payment of ${amount}` : "a payment";
}

/**
 * The History panel sits on the payment request's own page, so an entry about the request itself
 * has no subject ("" = none); the subject only names what is not the request: a file, a payment,
 * Xero.
 */
const ACTION_MAP: Record<
  string,
  {
    verb: string | ((detail: string) => string);
    subject: (detail: string, currencyCode: string) => string;
  }
> = {
  created: { verb: "created", subject: () => "" },
  edited: { verb: "updated", subject: () => "" },
  submitted: { verb: "submitted", subject: () => "" },
  marked_paid: { verb: "marked as paid", subject: () => "" },
  voided: { verb: "voided", subject: () => "" },
  cancelled: { verb: "cancelled", subject: () => "" },
  status_changed: { verb: "changed the status", subject: () => "" },
  published_to_xero: { verb: publishVerb, subject: () => "to Xero" },
  attachment_uploaded: {
    verb: "uploaded",
    subject: (d) => d.match(/File '(.+?)'/)?.[1] || "attachment",
  },
  attachment_deleted: {
    verb: "removed",
    subject: (d) => d.match(/Attachment '(.+?)'/)?.[1] || "attachment",
  },
  payment_created: { verb: "recorded", subject: paymentSubject },
  payment_updated: { verb: "updated", subject: () => "a payment" },
  payment_deleted: { verb: "deleted", subject: paymentSubject },
};

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  const day =
    formatLocalDateForDisplay(d) ||
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${day} \u2022 ${time}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAmountLikeAuditLabel(label: string): boolean {
  const t = label.trim().toLowerCase();
  return (
    t === "amount" ||
    t === "invoice amount" ||
    t === "amount due" ||
    t === "total amount" ||
    t === "invoice total" ||
    t === "total"
  );
}

function firstMoneyNumber(s: string): number | null {
  const compact = s.replace(/,/g, "");
  const m = compact.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number.parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function stripSameLabelPrefix(value: string, label: string): string {
  const v = value.trim();
  const re = new RegExp(`^${escapeRegExp(label)}\\s*:`, "i");
  return v.replace(re, "").trim() || v;
}

function toTitleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatStatusChangeLine(line: string): string {
  const arrow = line.indexOf("→");
  if (arrow === -1) return line;
  const left = line.slice(0, arrow).trim();
  const right = line.slice(arrow + 1).trim();
  const colon = left.indexOf(":");
  if (colon === -1) return line;
  const label = left.slice(0, colon).trim();
  if (!/^status$/i.test(label)) return line;
  const oldRaw = left.slice(colon + 1).trim();
  const newRaw = stripSameLabelPrefix(right, label);
  const oldDisp = toTitleCaseWords(billStatusToDisplayLabel(oldRaw));
  const newDisp = toTitleCaseWords(billStatusToDisplayLabel(newRaw));
  const labelDisp = `${label.charAt(0).toUpperCase()}${label.slice(1).toLowerCase()}`;
  return `${labelDisp}: ${oldDisp} → ${newDisp}`;
}

function parseChanges(detail: string): string[] {
  if (!detail || !detail.includes("→")) return [];
  return detail.split("; ").filter((s) => {
    const arrow = s.indexOf("→");
    if (arrow === -1) return false;
    const left = s.slice(0, arrow).trim();
    const right = s.slice(arrow + 1).trim();
    if (/^Xero Contact\s*:/i.test(left) || /^Xero Account Code\s*:/i.test(left)) return false;

    const colon = left.indexOf(":");
    if (colon !== -1) {
      const labelPart = left.slice(0, colon).trim();
      const oldRaw = left.slice(colon + 1).trim();
      const newRaw = stripSameLabelPrefix(right, labelPart);
      if (isAmountLikeAuditLabel(labelPart)) {
        if (oldRaw === newRaw) return false;
        const a = firstMoneyNumber(oldRaw);
        const b = firstMoneyNumber(newRaw);
        if (a != null && b != null && Object.is(a, b)) return false;
      }
    }
    return true;
  });
}

function initialsFromFirstLast(first: string, last: string): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const a = f.charAt(0);
  const b = l.charAt(0);
  if (a && b) return (a + b).toUpperCase();
  if (a) return a.toUpperCase();
  if (b) return b.toUpperCase();
  return "—";
}

function initialsFromDisplayName(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const first = words[0][0] ?? "";
    const lastW = words[words.length - 1][0] ?? "";
    const pair = (first + lastW).toUpperCase().slice(0, 2);
    return pair || "?";
  }
  if (words.length === 1) {
    const w = words[0];
    return w.length >= 2 ? w.slice(0, 2).toUpperCase() : (w[0]?.toUpperCase() ?? "?");
  }
  return "?";
}

function parseLastCommaFirst(userName: string): { first: string; last: string } | null {
  const t = userName.trim();
  const i = t.indexOf(",");
  if (i <= 0) return null;
  const last = t.slice(0, i).trim();
  const first = t.slice(i + 1).trim();
  if (!first && !last) return null;
  return { first, last };
}

function readAuditStringField(audit: AuditItem, keys: string[]): string {
  const r = audit as unknown as Record<string, unknown>;
  const nested =
    r.user && typeof r.user === "object" && r.user !== null
      ? (r.user as Record<string, unknown>)
      : null;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (nested) {
      const v2 = nested[k];
      if (typeof v2 === "string" && v2.trim()) return v2.trim();
    }
  }
  return "";
}

function mergeCompoundFirstNameFromUserName(
  fn: string,
  ln: string,
  userName: string,
): { fn: string; ln: string } {
  let outF = fn.trim();
  const outL = ln.trim();
  const u = userName.trim();
  const parts = u.split(/\s+/).filter(Boolean);
  if (!outL || parts.length < 2) return { fn: outF, ln: outL };
  const lastTok = parts[parts.length - 1]!;
  if (lastTok.toLowerCase() !== outL.toLowerCase()) return { fn: outF, ln: outL };
  const firstPart = parts.slice(0, -1).join(" ").trim();
  if (!firstPart) return { fn: outF, ln: outL };
  if (
    !outF ||
    firstPart.toLowerCase() === outF.toLowerCase() ||
    firstPart.toLowerCase().startsWith(outF.toLowerCase() + " ")
  ) {
    outF = firstPart;
  }
  return { fn: outF, ln: outL };
}

function auditDisplayNameAndInitials(audit: AuditItem): { displayName: string; initials: string } {
  const userName =
    (audit.user_name ?? "").trim() ||
    readAuditStringField(audit, [
      "display_name",
      "full_name",
      "user_display_name",
      "displayName",
      "fullName",
    ]);

  let fn = readAuditStringField(audit, [
    "user_first_name",
    "first_name",
    "userFirstName",
    "firstName",
    "given_name",
    "givenName",
  ]);
  let ln = readAuditStringField(audit, [
    "user_last_name",
    "last_name",
    "userLastName",
    "lastName",
    "family_name",
    "familyName",
  ]);

  ({ fn, ln } = mergeCompoundFirstNameFromUserName(fn, ln, userName));

  if (fn || ln) {
    const displayName = [fn, ln].filter(Boolean).join(" ") || userName || "System";
    return { displayName, initials: initialsFromFirstLast(fn, ln) };
  }
  const parsed = parseLastCommaFirst(userName);
  if (parsed) {
    const displayName =
      [parsed.first, parsed.last].filter(Boolean).join(" ") || userName || "System";
    return { displayName, initials: initialsFromFirstLast(parsed.first, parsed.last) };
  }
  const displayName = userName || "System";
  return { displayName, initials: initialsFromDisplayName(displayName) };
}

function auditToItem(audit: AuditItem, currencyCode: string): ActivityHistoryItem {
  const { displayName, initials } = auditDisplayNameAndInitials(audit);

  const mapping = ACTION_MAP[audit.action];
  const mappedVerb = mapping?.verb;
  const verb =
    typeof mappedVerb === "function"
      ? mappedVerb(audit.detail)
      : (mappedVerb ?? audit.action.replace(/_/g, " "));
  const subject = mapping?.subject(audit.detail, currencyCode) ?? "";

  return {
    id: audit.id,
    initials,
    userName: displayName,
    verb,
    subjectBold: subject,
    timeLabel: formatTimeLabel(audit.date),
    changes: parseChanges(audit.detail).map(formatStatusChangeLine),
  };
}

type ScrollPosition = { el: Element; top: number };

/**
 * Every element that may scroll the page around `el`, with its offset: the app shell scrolls an
 * inner container on phones and the document on desktop, so all of them are saved and restored.
 */
function scrollPositionsAround(el: HTMLElement): ScrollPosition[] {
  const out: ScrollPosition[] = [];
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.scrollHeight > p.clientHeight) out.push({ el: p, top: p.scrollTop });
  }
  const doc = document.scrollingElement ?? document.documentElement;
  if (!out.some((s) => s.el === doc)) out.push({ el: doc, top: doc.scrollTop });
  return out;
}

function ActivityHistoryTimelineSkeleton() {
  return (
    <div className="min-h-0 max-h-[min(14rem,38dvh)] overflow-hidden pr-1 sm:max-h-[min(17.5rem,45vh)]">
      <div className="relative pb-0.5">
        <div className="absolute bottom-3 left-[7px] top-3 w-px bg-border-subtle" aria-hidden />
        <ul className="relative flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={`activity-sk-${i}`} className="relative flex gap-3" aria-hidden>
              <div className="relative z-[1] flex w-4 shrink-0 justify-center pt-[18px]">
                <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-border-default ring-[3px] ring-surface-card" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col rounded-lg bg-surface-sunk px-4 py-3.5 sm:px-5 sm:py-4">
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                    <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-accent-avatar-bg" />
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="h-4 max-w-[min(100%,20rem)] animate-pulse rounded bg-border-subtle" />
                    </div>
                  </div>
                  <div className="h-3 w-[7.5rem] shrink-0 animate-pulse rounded bg-surface-sunk pl-10 sm:pl-0 sm:ml-0" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ActivityHistoryAccordion({
  billId,
  currencyCode = "",
  refreshSignal = 0,
}: ActivityHistoryAccordionProps) {
  const [open, setOpen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  /** The last read, keyed by what was asked for: a newer key means that read is still loading. */
  const [loaded, setLoaded] = useState<{
    key: string;
    items: ActivityHistoryItem[];
    failed: boolean;
  } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const key = `${billId}|${currencyCode}|${refreshSignal}|${retryCount}`;
  const current = loaded?.key === key ? loaded : null;
  const loading = Boolean(billId) && !current;
  const items = current?.items ?? [];
  const failed = current?.failed ?? false;

  useEffect(() => {
    if (!billId) return;
    let cancelled = false;
    fetchAuditHistory(billId)
      .then((audits) => {
        if (!cancelled)
          setLoaded({ key, items: audits.map((a) => auditToItem(a, currencyCode)), failed: false });
      })
      .catch((err: unknown) => {
        console.error("[payment request] the history did not load", err);
        if (!cancelled) setLoaded({ key, items: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [billId, currencyCode, key]);

  /** Where the page was scrolled before History opened, so closing it can go back there. */
  const returnScrollRef = useRef<ScrollPosition[] | null>(null);

  /** Starts closed, so this only runs after the user toggles it: opening brings the section into view, closing returns to where the user was. */
  useEffect(() => {
    if (open) {
      window.requestAnimationFrame(() => {
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    const back = returnScrollRef.current;
    if (!back) return;
    returnScrollRef.current = null;
    window.requestAnimationFrame(() => {
      for (const { el, top } of back) el.scrollTo({ top, behavior: "smooth" });
    });
  }, [open]);

  const toggle = () => {
    if (!open && sectionRef.current)
      returnScrollRef.current = scrollPositionsAround(sectionRef.current);
    setOpen((v) => !v);
  };

  return (
    <section
      ref={sectionRef}
      className="scroll-mt-4 rounded-lg border border-border-default bg-surface-card"
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left sm:px-5 sm:py-4"
        onClick={toggle}
        aria-expanded={open}
      >
        <h2 className="text-base font-semibold text-text-secondary sm:text-lg">History</h2>
        <span className="material-symbols-rounded text-text-secondary" aria-hidden>
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>
      {open ? (
        <div className="px-4 pb-5 pt-3 sm:px-5">
          {loading ? (
            <div role="status" aria-busy="true" aria-label="Loading history">
              <ActivityHistoryTimelineSkeleton />
            </div>
          ) : failed ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center" role="alert">
              <p className="text-sm text-text-secondary">
                I couldn&apos;t load the history. Mind trying again?
              </p>
              <button
                type="button"
                onClick={() => setRetryCount((n) => n + 1)}
                className="min-h-11 cursor-pointer rounded-lg bg-action-primary px-5 text-sm font-medium text-action-on-primary hover:bg-action-primary"
              >
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-sm text-text-muted">
              No activity yet
            </div>
          ) : (
            <div
              className="min-h-0 max-h-[min(14rem,38dvh)] overflow-y-auto overscroll-y-contain pr-1 [scrollbar-gutter:stable] sm:max-h-[min(17.5rem,45vh)]"
              role="region"
              aria-label="Activity history list"
            >
              <div className="relative pb-0.5">
                <div
                  className="absolute bottom-3 left-[7px] top-3 w-px bg-border-subtle"
                  aria-hidden
                />
                <ul className="relative flex flex-col gap-3">
                  {items.map((item) => (
                    <li key={item.id} className="relative flex gap-3">
                      <div className="relative z-[1] flex w-4 shrink-0 justify-center pt-[18px]">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full bg-surface-sunk ring-[3px] ring-surface-card"
                          aria-hidden
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col rounded-lg bg-surface-sunk px-4 py-3.5 sm:px-5 sm:py-4">
                        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                            <div
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-avatar-bg text-[12px] font-semibold leading-none text-accent-avatar-ink"
                              aria-hidden
                              title={item.userName}
                            >
                              {item.initials}
                            </div>
                            <p className="min-w-0 flex-1 text-sm leading-snug">
                              <span className="font-bold text-text-primary">{item.userName}</span>
                              <span className="font-normal text-text-secondary"> {item.verb}</span>
                              {item.subjectBold ? (
                                <>
                                  {" "}
                                  <span className="font-bold text-text-secondary">
                                    {item.subjectBold}
                                  </span>
                                </>
                              ) : null}
                            </p>
                          </div>
                          <time
                            className="shrink-0 pl-10 text-xs font-normal tabular-nums text-text-muted sm:pl-0 sm:text-right sm:text-sm"
                            dateTime={item.timeLabel}
                          >
                            {item.timeLabel}
                          </time>
                        </div>
                        {item.changes.length > 0 ? (
                          <ul className="mt-2 flex flex-col gap-1 pl-10">
                            {item.changes.map((c, i) => (
                              <li key={i} className="text-xs leading-relaxed text-text-muted">
                                <span className="text-text-secondary">
                                  {c.split("→")[0]?.trim()}
                                </span>
                                <span className="mx-1">→</span>
                                <span className="font-medium text-text-primary">
                                  {c.split("→")[1]?.trim()}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
