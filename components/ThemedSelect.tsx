"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ThemedSelectOption = { value: string; label: string };

type ThemedSelectProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: ThemedSelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  /** When false, trigger uses intrinsic width (e.g. currency cell). Default true. */
  fullWidth?: boolean;
  /** One filled control (e.g. currency) — no white + chevron strip split. */
  uniformFill?: boolean;
  /** For split style only: render chevron without gray boxed segment. */
  plainChevron?: boolean;
  /** Centers the selected value in the trigger (short values like a page size). */
  centerValue?: boolean;
  error?: boolean;
  /** Mandatory: announced here, since the label's red asterisk is aria-hidden. */
  required?: boolean;
  disabled?: boolean;
  /** Typable combobox: filter options as you type (e.g. long account code lists). */
  searchable?: boolean;
};

export function ThemedSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  className = "",
  triggerClassName = "",
  fullWidth = true,
  uniformFill = false,
  plainChevron = false,
  centerValue = false,
  error = false,
  required = false,
  disabled = false,
  searchable = false,
}: ThemedSelectProps) {
  /** Avoid uncontrolled→controlled warnings if parent ever passes undefined before data loads. */
  const selectedValue = value ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuPos, setMenuPos] = useState<{
    placement: "below" | "above";
    top: number;
    left: number;
    width: number;
    bottom: number;
    maxHeight: number;
  }>({ placement: "below", top: 0, left: 0, width: 0, bottom: 0, maxHeight: 240 });
  const controlRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  /** Positions the listbox and caps height so it stays within the viewport (fixed portal). */
  const updatePosition = useCallback(() => {
    const el = controlRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const edge = 8;
    const maxPreferred = 240;
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom - gap - edge;
    const spaceAbove = rect.top - gap - edge;
    const openAbove = spaceBelow < maxPreferred && spaceAbove > spaceBelow;
    const maxHeight = openAbove
      ? Math.min(maxPreferred, Math.max(48, spaceAbove))
      : Math.min(maxPreferred, Math.max(48, spaceBelow));
    if (openAbove) {
      setMenuPos({
        placement: "above",
        top: 0,
        left: rect.left,
        width: rect.width,
        bottom: vh - rect.top + gap,
        maxHeight,
      });
    } else {
      setMenuPos({
        placement: "below",
        top: rect.bottom + gap,
        left: rect.left,
        width: rect.width,
        bottom: 0,
        maxHeight,
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const onResizeOrScroll = () => updatePosition();
    window.addEventListener("resize", onResizeOrScroll);
    window.addEventListener("scroll", onResizeOrScroll, true);
    return () => {
      window.removeEventListener("resize", onResizeOrScroll);
      window.removeEventListener("scroll", onResizeOrScroll, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (controlRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOpen]);

  const menuOptions =
    placeholder !== undefined ? options.filter((o) => o.value !== "") : options;
  const placeholderShowing = placeholder !== undefined && selectedValue === "";
  const selected = options.find((o) => o.value === selectedValue);
  const displayLabel = placeholderShowing
    ? placeholder
    : selected?.label ?? (options[0]?.label ?? "");
  const displayTextClass = `${placeholderShowing ? "text-gray-700" : ""} ${centerValue ? "text-center" : ""}`;

  const closedInputValue = placeholderShowing ? "" : (selected?.label ?? "");

  const filteredMenuOptions = useMemo(() => {
    if (!searchable) return menuOptions;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return menuOptions;
    return menuOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [searchable, menuOptions, searchQuery]);

  const listOptions = searchable ? filteredMenuOptions : menuOptions;

  const inputDisplayValue =
    searchable && isOpen ? searchQuery : searchable ? closedInputValue : "";

  const handleSearchableFocus = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setSearchQuery(closedInputValue);
  }, [disabled, closedInputValue]);

  const uniformBase =
    "box-border flex h-11 min-h-[44px] min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border py-0 pl-3 pr-2 text-left text-base font-normal transition-colors focus:outline-none focus:ring-2 focus:ring-secondary/25 sm:min-h-11 sm:text-sm " +
    (fullWidth ? "w-full " : "w-auto ") +
    (error
      ? "border-red-500 bg-red-50 text-black focus:border-red-500 focus:ring-red-200/50 "
      : "border-gray-300 bg-[#EDEDED] text-[#656565] hover:bg-[#E4E4E4] focus:border-secondary focus:ring-secondary/25 ");

  const splitBase =
    "box-border flex h-11 min-h-[44px] min-w-0 cursor-pointer items-stretch gap-0 overflow-hidden rounded-lg border bg-white p-0 text-left text-base font-normal text-black transition-colors focus:outline-none focus:ring-2 focus:ring-secondary/25 sm:min-h-11 sm:text-sm " +
    (fullWidth ? "w-full " : "w-auto ") +
    (error
      ? "border-red-500 focus:border-red-500 focus:ring-red-200/50 "
      : "border-gray-300 focus:border-secondary focus:ring-secondary/25 ");

  const splitSearchableOuter =
    "box-border flex h-11 min-h-[44px] min-w-0 cursor-default items-stretch gap-0 overflow-hidden rounded-lg border bg-white p-0 text-left text-base font-normal text-black transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-secondary/25 sm:min-h-11 sm:text-sm " +
    (fullWidth ? "w-full " : "w-auto ") +
    (error
      ? "border-red-500 focus-within:border-red-500 focus-within:ring-red-200/50 "
      : "border-gray-300 focus-within:border-secondary focus-within:ring-secondary/25 ");

  const uniformSearchableOuter =
    "box-border flex h-11 min-h-[44px] min-w-0 cursor-default items-center justify-between gap-2 rounded-lg border py-0 pl-3 pr-2 text-left text-base font-normal transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-secondary/25 sm:min-h-11 sm:text-sm " +
    (fullWidth ? "w-full " : "w-auto ") +
    (error
      ? "border-red-500 bg-red-50 text-black focus-within:border-red-500 focus-within:ring-red-200/50 "
      : "border-gray-300 bg-[#EDEDED] text-[#656565] hover:bg-[#E4E4E4] focus-within:border-secondary focus-within:ring-secondary/25 ");

  const menu = isOpen ? (
    <ul
      ref={menuRef}
      id={listboxId}
      role="listbox"
      data-themed-select-menu
      className="fixed z-[400] overflow-auto rounded-lg border border-gray-300 bg-white py-1 shadow-lg ring-1 ring-black/5"
      style={{
        ...(menuPos.placement === "above"
          ? { top: "auto", bottom: menuPos.bottom }
          : { top: menuPos.top, bottom: "auto" }),
        left: menuPos.left,
        width: Math.max(menuPos.width, 120),
        maxHeight: menuPos.maxHeight,
      }}
    >
      {listOptions.length === 0 ? (
        <li className="px-3 py-2.5 text-sm text-gray-500" role="presentation">
          No matches
        </li>
      ) : (
        listOptions.map((opt) => {
          const isSelected = selectedValue === opt.value;
          return (
            <li
              key={opt.value === "" ? "__empty" : opt.value}
              role="option"
              aria-selected={isSelected}
              className={
                "cursor-pointer px-3 py-2.5 text-sm text-black transition-colors " +
                (isSelected
                  ? "bg-secondary/15 font-semibold text-secondary"
                  : "hover:bg-secondary/10")
              }
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              {opt.label}
            </li>
          );
        })
      )}
    </ul>
  ) : null;

  const chevron = (
    <span className="material-symbols-outlined shrink-0 text-[22px] leading-none text-primary" aria-hidden>
      {isOpen ? "expand_less" : "expand_more"}
    </span>
  );

  const inputClassName =
    "min-w-0 flex-1 border-0 bg-transparent p-0 text-base outline-none placeholder:text-gray-700 sm:text-sm " +
    (uniformFill ? "text-[#656565] " : "text-black ") +
    "disabled:cursor-not-allowed disabled:opacity-50";

  const chevronToggleMouseDown = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!disabled) setIsOpen((o) => !o);
  };

  return (
    <div ref={controlRef} className={`relative ${className}`}>
      {searchable ? (
        uniformFill ? (
          <div className={`${uniformSearchableOuter} ${triggerClassName}`}>
            <input
              id={id}
              type="text"
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={isOpen ? listboxId : undefined}
              aria-autocomplete="list"
              aria-label={ariaLabel}
              aria-invalid={error}
          aria-required={required || undefined}
              autoComplete="off"
              disabled={disabled}
              placeholder={placeholder}
              className={inputClassName}
              value={inputDisplayValue}
              onFocus={handleSearchableFocus}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsOpen(true);
              }}
            />
            <span
              className="flex shrink-0 cursor-pointer items-center pr-2"
              onMouseDown={chevronToggleMouseDown}
            >
              {chevron}
            </span>
          </div>
        ) : (
          <div className={`${splitSearchableOuter} ${triggerClassName}`}>
            <span className="flex min-h-[44px] min-w-0 flex-1 items-center py-0 pl-3 pr-2 sm:min-h-11">
              <input
                id={id}
                type="text"
                role="combobox"
                aria-expanded={isOpen}
                aria-controls={isOpen ? listboxId : undefined}
                aria-autocomplete="list"
                aria-label={ariaLabel}
                aria-invalid={error}
          aria-required={required || undefined}
                autoComplete="off"
                disabled={disabled}
                placeholder={placeholder}
                className={inputClassName}
                value={inputDisplayValue}
                onFocus={handleSearchableFocus}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsOpen(true);
                }}
              />
            </span>
            <span
              className={
                plainChevron
                  ? "flex shrink-0 cursor-pointer items-center justify-center px-3 sm:min-h-11"
                  : "flex w-11 min-w-[44px] shrink-0 cursor-pointer items-center justify-center border-l border-gray-300 bg-[#EDEDED] transition-colors hover:bg-[#E4E4E4] sm:min-h-11"
              }
              onMouseDown={chevronToggleMouseDown}
            >
              {chevron}
            </span>
          </div>
        )
      ) : uniformFill ? (
        <button
          type="button"
          id={id}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-label={ariaLabel}
          aria-invalid={error}
          aria-required={required || undefined}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((o) => !o)}
          className={`${uniformBase} ${triggerClassName}`}
        >
          <span className={`min-w-0 flex-1 truncate ${displayTextClass}`}>{displayLabel}</span>
          {chevron}
        </button>
      ) : (
        <button
          type="button"
          id={id}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-label={ariaLabel}
          aria-invalid={error}
          aria-required={required || undefined}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((o) => !o)}
          className={`${splitBase} ${triggerClassName}`}
        >
          <span className="flex min-h-[44px] min-w-0 flex-1 items-center py-0 pl-3 pr-2 sm:min-h-11">
            <span className={`min-w-0 flex-1 truncate ${displayTextClass}`}>{displayLabel}</span>
          </span>
          <span
            className={
              plainChevron
                ? "flex shrink-0 items-center justify-center px-3 sm:min-h-11"
                : "flex w-11 min-w-[44px] shrink-0 items-center justify-center border-l border-gray-300 bg-[#EDEDED] transition-colors hover:bg-[#E4E4E4] sm:min-h-11"
            }
          >
            {chevron}
          </span>
        </button>
      )}
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
