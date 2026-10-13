"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ApiError, createEntityBillContact, type EntityBillContact } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { inputClass } from "@/components/ui/Field";

/**
 * Part 14 "Supplier picker": a 44px ARIA combobox; options 52px tall; "Add '…' as a new supplier"
 * comes LAST and is never automatic. Geometry and colours are the Field's (components/ui/Field.tsx).
 */
export type BillContactPickerProps = {
  id: string;
  /** The Field's note (helper or error), so the combobox is described by it. */
  ariaDescribedBy?: string;
  contacts: EntityBillContact[];
  xeroContactId: string;
  contactName: string;
  onChange: (patch: { xero_contact_id: string; contact: string }) => void;
  /** After GET, merges `ensureMerged` into the list when missing (e.g. new contact not yet in index). */
  refetchContacts: (ensureMerged?: EntityBillContact) => Promise<void>;
  disabled?: boolean;
  error?: boolean;
  /** Mandatory: announced here, since the label's red asterisk is aria-hidden. */
  required?: boolean;
};

export function BillContactPicker({
  id,
  ariaDescribedBy,
  contacts,
  xeroContactId,
  contactName,
  onChange,
  refetchContacts,
  disabled = false,
  error = false,
  required = false,
}: BillContactPickerProps) {
  const { showToast } = useToast();
  const listboxId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const trimmedName = contactName.trim();
  const q = trimmedName.toLowerCase();
  const filtered = contacts.filter(
    (c) => !q || c.name.toLowerCase().includes(q),
  );

  const nameMatchesExisting =
    trimmedName.length > 0 &&
    contacts.some((c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase());

  const showAddNewRow = trimmedName.length > 0 && !nameMatchesExisting;
  const menuHasContent = filtered.length > 0 || showAddNewRow;

  const updatePosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onResizeOrScroll = () => updatePosition();
    window.addEventListener("resize", onResizeOrScroll);
    window.addEventListener("scroll", onResizeOrScroll, true);
    return () => {
      window.removeEventListener("resize", onResizeOrScroll);
      window.removeEventListener("scroll", onResizeOrScroll, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const pick = (c: EntityBillContact) => {
    onChange({ xero_contact_id: c.xero_contact_id, contact: c.name });
    setOpen(false);
    setCreateError(null);
  };

  const handleAddToXero = async () => {
    const name = trimmedName;
    if (!name || creating || disabled) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createEntityBillContact({ name });
      await refetchContacts(created);
      onChange({
        xero_contact_id: created.xero_contact_id,
        contact: created.name,
      });
      setOpen(false);
      showToast("Supplier created successfully!", "success");
    } catch (e) {
      setCreateError(
        e instanceof ApiError ? e.message : "That supplier didn't quite make it over to Xero. Mind trying again?",
      );
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const invalid = error || createError !== null;
  const createErrorId = `${listboxId}-create-error`;

  const addRowText = creating
    ? "Creating supplier…"
    : `+ Add '${trimmedName}' as a new supplier`;

  const menu =
    open && menuHasContent ? (
      <ul
        ref={menuRef}
        id={listboxId}
        role="listbox"
        className="fixed z-[410] max-h-60 overflow-y-auto overflow-x-hidden rounded-lg border border-border-default bg-surface-raised py-1 shadow-overlay [-webkit-overflow-scrolling:touch]"
        style={{
          top: menuPos.top,
          left: menuPos.left,
          width: Math.max(menuPos.width, 120),
        }}
      >
        {filtered.map((c) => (
          <li
            key={c.xero_contact_id}
            role="option"
            aria-selected={xeroContactId === c.xero_contact_id}
            className={
              "flex min-h-13 cursor-pointer items-center px-3 text-body-m transition-colors " +
              (xeroContactId === c.xero_contact_id
                ? "bg-state-selected font-semibold text-text-link"
                : "text-text-primary hover:bg-state-hover")
            }
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => pick(c)}
          >
            {c.name}
          </li>
        ))}
        {showAddNewRow ? (
          <li
            role="option"
            aria-selected={false}
            aria-label={creating ? "Creating supplier in Xero" : `Add ${trimmedName} as a new supplier`}
            className={
              "flex min-h-13 cursor-pointer items-center px-3 text-left text-body-m font-semibold text-text-link transition-colors " +
              (filtered.length > 0 ? "border-t border-border-subtle " : "") +
              (creating || disabled ? "cursor-not-allowed text-text-disabled" : "hover:bg-state-hover")
            }
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              if (!disabled && !creating) void handleAddToXero();
            }}
          >
            {addRowText}
          </li>
        ) : null}
      </ul>
    ) : null;

  return (
    <div ref={wrapRef} className="w-full min-w-0">
      <div className="relative min-w-0">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          aria-describedby={[ariaDescribedBy, createError ? createErrorId : undefined].filter(Boolean).join(" ") || undefined}
          disabled={disabled || creating}
          value={contactName}
          placeholder="Search or add a supplier"
          onChange={(e) => {
            onChange({ xero_contact_id: "", contact: e.target.value });
            setCreateError(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className={inputClass(invalid)}
        />
      </div>
      {createError ? (
        <p id={createErrorId} className="mt-1.5 text-caption text-status-danger-ink" role="alert">
          {createError}
        </p>
      ) : null}
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
