"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, fetchEntityBillAccounts, fetchXeroStatus, updateEntityBillAccount } from "@/lib/api";
import { useLeaveGuard } from "@minty/shared/leaveGuard";
import { useUserRole } from "@/lib/useUserRole";
import { useToast } from "@/components/Toast";
import { LeaveDialog } from "@/features/subscription/components/InterruptedDialogs";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Skeleton } from "@/components/ui/Skeleton";

// Part 14 Checkbox: 20px box, checked fill = border/selected (D14-02); the whole 44px row is the target.
const CHECKBOX_CLASS = "checkbox-secondary-white-tick size-5 shrink-0 cursor-pointer rounded-sm border border-border-input disabled:cursor-not-allowed disabled:opacity-40";

export type AccountCodeRow = { id: string; label: string };

/** `integrationHref`: Entity & Integration, where Xero is connected. */
export function AccountCodeSettings({ integrationHref }: { integrationHref: string }) {
  // Allowlist, not denylist. `isElevated` is {accountant, admin, super_admin}
  // minus view-only — the same set minty-payment-request-api enforces on these writes via
  // check_edit_bill_settings. A denylist of cashier/shop_manager let entity_base
  // through to an editable page whose every Save 403'd.
  const { isViewOnly, isElevated } = useUserRole();
  const readOnly = !isElevated;
  const [rows, setRows] = useState<AccountCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // The codes are the company's Xero chart: without a live connection the card shows only a
  // way to connect, and the codes are not read at all (nor the chart re-sync that read starts).
  const [xeroConnected, setXeroConnected] = useState<boolean | null>(null);
  /** A save the server refused, in its words - shown beside Save, never in a toast (Part 14). */
  const [saveError, setSaveError] = useState<string | null>(null);
  const { showToast } = useToast();
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchXeroStatus()
      .then((connected) => {
        if (cancelled) return;
        setXeroConnected(connected);
        if (!connected) return;
        return fetchEntityBillAccounts({ includeInactive: true }).then((accounts) => {
          if (cancelled) return;
          setRows(
            accounts.map((a) => ({
              id: a.id,
              label: `${a.account_code} - ${a.account_name}`,
            })),
          );
          const activeIds = new Set(accounts.filter((a) => a.is_active).map((a) => a.id));
          setSelectedIds(activeIds);
          setSavedIds(activeIds);
        });
      })
      .catch((err: unknown) => {
        // A failed read is not an empty list: say so, rather than "No account codes yet".
        console.error("[payment settings] the account codes did not load", err);
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const hasChanges = useMemo(() => {
    if (selectedIds.size !== savedIds.size) return true;
    for (const id of selectedIds) {
      if (!savedIds.has(id)) return true;
    }
    return false;
  }, [selectedIds, savedIds]);

  // "Leave without saving?" while ticks are unsaved (lib/leaveGuard.ts). A save that went through
  // makes `savedIds` the ticks, so `hasChanges` clears and the guard stands down; a failed one
  // leaves `savedIds` alone, so the page still asks.
  const discardTicks = useCallback(() => setSelectedIds(new Set(savedIds)), [savedIds]);
  const leave = useLeaveGuard(hasChanges, discardTicks);

  const changedIds = useMemo(() => {
    const ids: { id: string; is_active: boolean }[] = [];
    for (const row of rows) {
      const wasActive = savedIds.has(row.id);
      const isActive = selectedIds.has(row.id);
      if (wasActive !== isActive) ids.push({ id: row.id, is_active: isActive });
    }
    return ids;
  }, [rows, selectedIds, savedIds]);

  // The server refuses to untick its last ticked code (409), so the page never offers it:
  // with codes on the list and none ticked, Save is off and says why. It is off, too, with
  // nothing to save (`hasChanges`).
  const noneTicked = rows.length > 0 && selectedIds.size === 0;

  const handleSave = async () => {
    if (!hasChanges || saving || noneTicked) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Ticks ON first, then OFF: unticking A while ticking B must never pass through a
      // moment with nothing ticked, or the server's at-least-one rule refuses the untick.
      const turningOn = changedIds.filter((c) => c.is_active);
      const turningOff = changedIds.filter((c) => !c.is_active);
      const send = (batch: typeof changedIds) =>
        Promise.allSettled(batch.map(({ id, is_active }) => updateEntityBillAccount(id, { is_active })));
      const onResults = await send(turningOn);
      const offResults = await send(turningOff);
      const sent = [...turningOn, ...turningOff];
      const results = [...onResults, ...offResults];
      // Each row that went through IS saved, whatever happened to the others: the saved set
      // follows them, so the leave guard and "Discard changes" measure from what the server holds.
      const next = new Set(savedIds);
      results.forEach((result, i) => {
        if (result.status !== "fulfilled") return;
        const { id, is_active } = sent[i];
        if (is_active) next.add(id);
        else next.delete(id);
      });
      setSavedIds(next);
      const failed = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failed.length === 0) {
        showToast("Payment settings updated successfully", "success");
      } else {
        console.error("[payment settings] some account codes did not save", failed);
        // A refusal the server explained (409: "Keep at least one account code ticked.")
        // is shown in its own words; anything else gets the generic retry line.
        const refused = failed.find((f) => f.reason instanceof ApiError && f.reason.status === 409);
        setSaveError(
          refused ? (refused.reason as ApiError).message : "Some of those changes didn't save. Try saving again.",
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(q));
  }, [rows, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const someFilteredSelected = filtered.some((r) => selectedIds.has(r.id)) && !allFilteredSelected;

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = someFilteredSelected;
  }, [someFilteredSelected]);

  const visibleIds = useMemo(() => new Set(filtered.map((r) => r.id)), [filtered]);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="w-full pb-8 pt-2 sm:pt-3">
      {/* On <body>, at z-250: above the sidebar's drawer (z-200), whose links it also guards. */}
      {leave.open
        ? createPortal(
            <div data-leave-dialog="" className="relative z-[250]">
              <LeaveDialog onDiscard={leave.discard} onStay={leave.stay} />
            </div>,
            document.body,
          )
        : null}
      {/* Two different reasons the controls are dead, and they need different
          sentences — same split the Module section makes in Minty.
          Held until `loading` clears: the role arrives from the cookie one frame
          late, so an accountant would otherwise see this flash at them. */}
      {!loading && readOnly ? (
        <InlineAlert tone="info" className="mb-3">
          {isViewOnly
            ? "Read-only access — you are not a member of this entity."
            : "You have view-only access to these settings. Ask an Accountant or Admin to make changes."}
        </InlineAlert>
      ) : null}
      <section className={`overflow-hidden rounded-lg border border-border-default ${readOnly ? "bg-surface-sunk" : "bg-surface-card"}`}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex min-h-11 w-full cursor-pointer items-start justify-between gap-3 px-4 py-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus sm:px-5"
          aria-expanded={expanded}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-title-m text-text-primary">Payment Account Code</h2>
            <p className="text-body-s text-text-secondary">Only the codes you tick here are offered when someone adds a payment request.</p>
          </div>
          <Icon
            name="expand_more"
            size="lg"
            className={`text-text-muted transition-transform duration-200 ease-out motion-reduce:transition-none ${expanded ? "rotate-0" : "rotate-180"}`}
          />
        </button>

        {expanded && xeroConnected === false ? (
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <InlineAlert
              tone="warning"
              title="Xero isn't connected yet."
              action={
                <a
                  href={integrationHref}
                  className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                >
                  Connect it in Entity &amp; Integration
                </a>
              }
            >
              Account codes come from your Xero chart, so connect Xero to set them up.
            </InlineAlert>
          </div>
        ) : expanded ? (
          <div className="flex flex-col gap-3 px-4 pb-4 sm:px-5 sm:pb-5">
            <div className="relative">
              <label htmlFor="settings-account-search" className="sr-only">
                Search account code
              </label>
              <input
                id="settings-account-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search account code"
                autoComplete="off"
                className={`${inputClass()} pr-11`}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-text-muted">
                <Icon name="search" size="md" />
              </span>
            </div>

            {loading ? (
              <>
                <div className="flex items-center justify-between gap-3 px-3 sm:px-4">
                  <span className="min-w-0 flex-1 text-right text-body-m text-text-primary">Select all</span>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={false}
                    disabled
                    className={CHECKBOX_CLASS}
                    aria-label="Select all visible account codes"
                    aria-busy
                  />
                </div>
                <div className="flex flex-col gap-3 py-4" aria-busy="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 px-3 sm:px-4">
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="size-5 shrink-0" />
                    </div>
                  ))}
                </div>
              </>
            ) : loadFailed ? (
              <InlineAlert tone="danger" title="Your account codes didn't load.">
                Refresh the page to try again.
              </InlineAlert>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-body-m text-text-secondary">No account codes yet. They show here once Xero is connected.</p>
            ) : filtered.length === 0 ? (
              <>
                <div className="flex items-center justify-between gap-3 px-3 sm:px-4">
                  <span className="min-w-0 flex-1 text-right text-body-m text-text-primary">Select all</span>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    disabled
                    className={CHECKBOX_CLASS}
                    aria-label="Select all visible account codes"
                  />
                </div>
                <p className="text-center text-body-m text-text-secondary">No codes match your search.</p>
              </>
            ) : (
              <ul
                className="visible-scrollbar max-h-[min(24rem,50vh)] overflow-y-auto overscroll-contain rounded-b-lg border-b border-r border-border-subtle [scrollbar-gutter:stable]"
                aria-label="Account codes"
              >
                <li className={`sticky top-0 z-10 flex min-h-11 items-center justify-between gap-3 ${readOnly ? "bg-surface-sunk" : "bg-surface-card"} px-3 py-3 sm:px-4`}>
                  <span className="min-w-0 flex-1 text-right text-body-m text-text-primary">Select all</span>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    disabled={filtered.length === 0 || readOnly}
                    className={CHECKBOX_CLASS}
                    aria-label="Select all visible account codes"
                  />
                </li>
                {filtered.map((row, index) => {
                  const isChecked = selectedIds.has(row.id);
                  return (
                    <li key={row.id} className={`flex min-h-11 items-center justify-between gap-3 px-3 py-3 sm:px-4 ${index > 0 ? "border-t border-border-subtle" : ""}`}>
                      <span className="min-w-0 flex-1 text-body-m text-text-primary" translate="no">{row.label}</span>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleRow(row.id)} disabled={readOnly} className={CHECKBOX_CLASS} aria-label={`Include ${row.label} in payment account dropdown`}/>
                    </li>
                  );
                })}
              </ul>
            )}

          </div>
        ) : null}
      </section>

      {expanded && xeroConnected !== false ? (
        <div className="mt-3 flex w-full flex-col gap-3 md:items-end">
          {saveError ? (
            <InlineAlert tone="danger" className="w-full">
              {saveError}
            </InlineAlert>
          ) : null}
          <Button
            kind="primary"
            full
            className="md:w-auto"
            onClick={handleSave}
            disabled={readOnly || noneTicked || !hasChanges}
            processing={saving}
            processingLabel="Saving…"
            aria-describedby={noneTicked && !readOnly ? "settings-account-none-ticked" : undefined}
            title={loading ? undefined : isViewOnly ? "Hmm, I can't let you in there. You have view-only access." : readOnly ? "That task is reserved for our Accountants and Admins." : undefined}
          >
            Save Changes
          </Button>
          {noneTicked && !readOnly ? (
            <p id="settings-account-none-ticked" className="-mt-1 text-body-s text-text-secondary">Pick at least one account code.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
