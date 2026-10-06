"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, fetchEntityBillAccounts, fetchXeroStatus, updateEntityBillAccount } from "@/lib/api";
import { useLeaveGuard } from "@/lib/leaveGuard";
import { useUserRole } from "@/lib/useUserRole";
import { useToast } from "@/components/Toast";
import { LeaveDialog } from "@/features/subscription/components/InterruptedDialogs";

const CHECKBOX_CLASS = "checkbox-secondary-white-tick h-4 w-4 shrink-0 rounded border border-primary/40 disabled:opacity-40";

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
        showToast(
          refused ? (refused.reason as ApiError).message : "Some of those changes didn't save. Mind trying again?",
          "error",
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
        <div
          role="status"
          aria-live="polite"
          className="mb-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600"
        >
          <span className="material-symbols-outlined shrink-0 text-[18px] leading-none text-gray-400" aria-hidden>
            visibility
          </span>
          <span>
            {isViewOnly
              ? "Read-only access — you are not a member of this entity."
              : "You have view-only access to these settings. Ask an Accountant or Admin to make changes."}
          </span>
        </div>
      ) : null}
      <div className={`overflow-hidden rounded-lg border border-gray-200 ${readOnly ? "bg-gray-100" : "bg-white"} shadow-sm`}>
        <button type="button" onClick={() => setExpanded((e) => !e)} className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left sm:px-5" aria-expanded={expanded}>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-800 sm:text-lg">Payment Account Code</h2>
            <p className="text-sm text-gray-600">Only selected account code will appear when adding a payment in Payment.</p>
          </div>
          <span
            className={`material-symbols-outlined shrink-0 cursor-pointer text-[24px] leading-none text-gray-400 transition-transform duration-200 ease-out ${expanded ? "rotate-0" : "rotate-180"}`}
            aria-hidden
          >
            expand_more
          </span>
        </button>

        {expanded && xeroConnected === false ? (
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            {/* Petty Cash Settings' notice (Minty static/css/settings_page.css `.pcs-notice-alert`), same values. */}
            <div role="status" className="flex items-start gap-2 rounded-lg border border-[#f3b6ad] bg-[#fff5f5] px-4 py-2.5 text-sm text-[#4a5565]">
              {/* `!`: material-symbols' own CSS (globals.css, unlayered) sets 24px over any utility. */}
              <span className="material-symbols-outlined shrink-0 text-[18px]! leading-5! text-[#d92d20]" aria-hidden>
                link_off
              </span>
              <span className="min-w-0">
                Xero isn&apos;t connected. Connect it in{" "}
                <a href={integrationHref} className="font-medium text-[#18c4c7] underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
                  Entity &amp; Integration
                </a>{" "}
                to set these up.
              </span>
            </div>
          </div>
        ) : expanded ? (
          <div className="flex flex-col gap-3 px-4 pb-4 sm:px-5 sm:pb-5">
            <div className="relative">
              <label htmlFor="settings-account-search" className="sr-only">
                Search account code
              </label>
              <input id="settings-account-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search account code" autoComplete="off" className="box-border h-11 w-full rounded-lg border border-gray-300 bg-white py-0 pl-3 pr-11 text-base text-black placeholder:text-gray-700 focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/25" />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center justify-center text-gray-300" aria-hidden>
                <span className="material-symbols-outlined inline-flex text-[22px] leading-none">search</span>
              </span>
            </div>

            {loading ? (
              <>
                <div className="flex items-center justify-between gap-3 px-3 sm:px-4">
                  <span className="min-w-0 flex-1 text-right text-base font-normal text-primary">Select all</span>
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
                <div className="flex flex-col gap-3 py-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex animate-pulse items-center justify-between gap-3 px-3 sm:px-4">
                      <div className="h-4 flex-1 rounded bg-gray-100" />
                      <div className="h-4 w-4 shrink-0 rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              </>
            ) : loadFailed ? (
              <p role="alert" className="py-8 text-center text-sm text-red-600">I couldn&apos;t load your account codes. Mind refreshing the page?</p>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-primary/60">No account codes yet - I&apos;ll show them here once Xero&apos;s connected.</p>
            ) : filtered.length === 0 ? (
              <>
                <div className="flex items-center justify-between gap-3 px-3 sm:px-4">
                  <span className="min-w-0 flex-1 text-right text-base font-normal text-primary">Select all</span>
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
                <p className="text-center text-sm text-primary/60">No codes match your search.</p>
              </>
            ) : (
              <ul
                className="visible-scrollbar max-h-[min(24rem,50vh)] overflow-y-auto overscroll-contain rounded-b-lg border-b border-r border-gray-100 [scrollbar-gutter:stable]"
                aria-label="Account codes"
              >
                <li className={`sticky top-0 z-10 flex items-center justify-between gap-3 ${readOnly ? "bg-gray-100" : "bg-white"} px-3 py-3 sm:px-4`}>
                  <span className="min-w-0 flex-1 text-right text-base font-normal text-primary">Select all</span>
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
                    <li key={row.id} className={`flex items-center justify-between gap-3 px-3 py-3 sm:px-4 ${index > 0 ? "border-t border-gray-100" : ""}`}>
                      <span className="min-w-0 flex-1 text-base font-normal text-gray-700">{row.label}</span>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleRow(row.id)} disabled={readOnly} className={CHECKBOX_CLASS} aria-label={`Include ${row.label} in payment account dropdown`}/>
                    </li>
                  );
                })}
              </ul>
            )}

          </div>
        ) : null}
      </div>

      {expanded && xeroConnected !== false ? (
        <div className="mt-3 flex w-full flex-col gap-3">
          <button type="button" onClick={handleSave} disabled={saving || readOnly || noneTicked || !hasChanges} aria-describedby={noneTicked && !readOnly ? "settings-account-none-ticked" : undefined} title={loading ? undefined : isViewOnly ? "Hmm, I can't let you in there. You have view-only access." : readOnly ? "That task is reserved for our Accountants and Admins." : undefined} className="box-border h-12 w-full cursor-pointer rounded-lg bg-secondary text-base font-bold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:text-sm">
            {saving ? "Saving…" : "Save Changes"}
          </button>
          {noneTicked && !readOnly ? (
            <p id="settings-account-none-ticked" className="-mt-1 text-sm text-primary/60">Pick at least one account code.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
