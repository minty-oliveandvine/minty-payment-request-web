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

const inputClassBase =
  "box-border h-11 min-h-[44px] w-full border bg-white px-3 text-base text-black placeholder:text-gray-700 focus:outline-none focus:ring-2 sm:min-h-11 sm:text-sm ";

export type BillContactPickerProps = {
  id: string;
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
  /** Corner radius on the text field (default matches bill modal). */
  controlRoundedClassName?: string;
};

export function BillContactPicker({
  id,
  contacts,
  xeroContactId,
  contactName,
  onChange,
  refetchContacts,
  disabled = false,
  error = false,
  required = false,
  controlRoundedClassName = "rounded-2xl",
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
  const borderTone = invalid
    ?"border-red-500 focus:border-red-500 focus:ring-red-200/50 "
    : "border-gray-300 focus:border-secondary focus:ring-secondary/25 ";

  const addRowText = creating
    ? "Creating supplier…"
    : `+ Add '${trimmedName}' as a new supplier`;

  const menu =
    open && menuHasContent ? (
      <ul
        ref={menuRef}
        id={listboxId}
        role="listbox"
        className="fixed z-[410] max-h-60 overflow-y-auto overflow-x-hidden rounded-lg border border-gray-300 bg-white py-1 shadow-lg ring-1 ring-black/5 [-webkit-overflow-scrolling:touch]"
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
              "cursor-pointer px-3 py-2.5 text-sm text-black transition-colors " +
              (xeroContactId === c.xero_contact_id
                ? "bg-secondary/15 font-semibold text-secondary"
                : "hover:bg-secondary/10")
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
              "cursor-pointer px-3 py-2.5 text-left text-sm font-medium text-primary transition-colors " +
              (filtered.length > 0 ? "border-t border-gray-100 " : "") +
              (creating || disabled
                ? "cursor-not-allowed opacity-60"
                : "hover:bg-secondary/10")
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
          autoComplete="off"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
        aria-required={required || undefined}
          disabled={disabled || creating}
          value={contactName}
          placeholder="Select a supplier"
          onChange={(e) => {
            onChange({ xero_contact_id: "", contact: e.target.value });
            setCreateError(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className={`${inputClassBase} ${controlRoundedClassName} ${borderTone}`}
        />
      </div>
      {createError ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {createError}
        </p>
      ) : null}
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
