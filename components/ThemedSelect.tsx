"use client";

import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
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
  /** The Field's note (helper or error), so the control is described by it. */
  ariaDescribedBy?: string;
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
  ariaDescribedBy,
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
  const displayTextClass = `${placeholderShowing ? "text-text-muted" : ""} ${centerValue ? "text-center" : ""}`;

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

  // Part 14 Select: the Input's geometry - 44px, radius 12, border/input (>= 3:1), a 2px focus
  // border; an error is the 2px danger ring. The "uniform" variant is the sunk read-only look.
  const width = fullWidth ? "w-full " : "w-auto ";
  const ring = (within: boolean) =>
    error
      ? "border-2 border-action-danger "
      : within
        ? "border border-border-input focus-within:border-2 focus-within:border-border-focus "
        : "border border-border-input focus:border-2 focus:border-border-focus ";
  const control =
    "box-border flex h-11 min-w-0 items-center rounded-lg text-left text-body-m font-normal outline-none transition-colors duration-100 disabled:cursor-not-allowed disabled:text-text-disabled ";

  const uniformBase =
    control + "cursor-pointer justify-between gap-2 bg-surface-sunk py-0 pl-3 pr-2 text-text-primary hover:bg-state-hover " + width + ring(false);

  const splitBase =
    control + "cursor-pointer items-stretch gap-0 overflow-hidden bg-surface-card p-0 text-text-primary " + width + ring(false);

  const splitSearchableOuter =
    control + "cursor-default items-stretch gap-0 overflow-hidden bg-surface-card p-0 text-text-primary " + width + ring(true);

  const uniformSearchableOuter =
    control + "cursor-default justify-between gap-2 bg-surface-sunk py-0 pl-3 pr-2 text-text-primary " + width + ring(true);

  const menu = isOpen ? (
    <ul
      ref={menuRef}
      id={listboxId}
      role="listbox"
      data-themed-select-menu
      className="fixed z-[400] overflow-auto rounded-lg border border-border-default bg-surface-raised py-1 shadow-overlay"
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
        <li className="px-3 py-2.5 text-body-m text-text-muted" role="presentation">
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
                "flex min-h-11 cursor-pointer items-center px-3 text-body-m transition-colors " +
                (isSelected ? "bg-state-selected font-semibold text-text-link" : "text-text-primary hover:bg-state-hover")
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

  const chevron = <Icon name={isOpen ? "expand_less" : "expand_more"} size="md" className="text-text-secondary" />;

  const inputClassName =
    "min-w-0 flex-1 border-0 bg-transparent p-0 text-body-m text-text-primary outline-none placeholder:text-text-muted " +
    "disabled:cursor-not-allowed disabled:text-text-disabled";

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
          aria-describedby={ariaDescribedBy}
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
            <span className="flex min-w-0 flex-1 items-center py-0 pl-3 pr-2">
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
          aria-describedby={ariaDescribedBy}
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
                  : "flex w-11 shrink-0 cursor-pointer items-center justify-center border-l border-border-default bg-surface-sunk transition-colors hover:bg-state-hover"
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
          aria-describedby={ariaDescribedBy}
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
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((o) => !o)}
          className={`${splitBase} ${triggerClassName}`}
        >
          <span className="flex min-w-0 flex-1 items-center py-0 pl-3 pr-2">
            <span className={`min-w-0 flex-1 truncate ${displayTextClass}`}>{displayLabel}</span>
          </span>
          <span
            className={
              plainChevron
                ? "flex shrink-0 items-center justify-center px-3 sm:min-h-11"
                : "flex w-11 shrink-0 items-center justify-center border-l border-border-default bg-surface-sunk transition-colors hover:bg-state-hover"
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
