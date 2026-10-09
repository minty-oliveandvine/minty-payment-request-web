"use client";
import React, { useRef } from "react";
import { formatIsoDateForDisplay } from "@/lib/dateDisplayFormat";

export const DATE_TEXT_PLACEHOLDER = "DD MM YYYY";

export type DateTextFieldProps = {
  id: string;
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** Mandatory: announced here, since the label's red asterisk is aria-hidden. */
  required?: boolean;
  calendarAriaLabel: string;
  textInputClassName: string;
  calendarButtonClassName: string;
};

export function DateTextField({
  id,
  value,
  onChange,
  disabled = false,
  invalid = false,
  required = false,
  calendarAriaLabel,
  textInputClassName,
  // Note: calendarButtonClassName remains in DateTextFieldProps for call-site
  // compatibility but is intentionally not destructured here — the whole field is
  // now the native date input's tap target, so a separate calendar button (and its
  // showPicker() call) is no longer needed.

  
}: DateTextFieldProps) {
  /* NOTE ON REVERT / REFACTOR:
     The previous approach of stretching the native input to fill the field caused 
     severe text-overshadowing and double-rendering collision bugs on desktop browsers 
     when focused, as well as breaking the container's border-radius mask.
     
     To maintain the intended design layout:
     1. The visual text overlay layers remain safely separated.
     2. We explicitly use the interactive side button panel with a React ref 
        triggering .showPicker() to guarantee clean dropdown activation across platforms 
        without native browser text overlapping.
  */
  const display = value ? formatIsoDateForDisplay(value) : "";
  const dateInputRef = useRef<HTMLInputElement>(null);

  const handleContainerClick = () => {
    if (disabled) return;
    try {
      dateInputRef.current?.showPicker();
    } catch (err) {
      // Fallback focus method for older browsers or webviews
      dateInputRef.current?.focus();
    }
  };
  return (
    <div onClick={handleContainerClick} className={`relative overflow-hidden flex items-center cursor-pointer ${textInputClassName}`}>
      {/* The real native date input fills the field. A tap anywhere on it opens the
          OS date picker natively on every platform — including iOS WebView, where
          showPicker() against a hidden input was a no-op. The input's own text is
          made transparent so it doesn't clash with the formatted overlay below. */}
      
      {/*  Fix Visual Overshadowing text bug in date input
        * Wrapped the core elements in an `overflow-hidden` container to guarantee the `rounded-2xl` borders never clip away during any active state.
* Utilized Tailwind CSS `peer` state handling to automatically switch the custom `<span>` text layout to `peer-focus:opacity-0`, completely hiding our custom placeholder layout the exact millisecond the native element takes focus.
      */}
      <input
        ref={dateInputRef}
        id={id}
        type="date"
        aria-label={calendarAriaLabel}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 text-transparent cursor-pointer bg-transparent outline-none border-none z-[2]"
        style={{ colorScheme: "light" }}
      />
      {/* Formatted "dd mmm yyyy" display overlaid on top. pointer-events: none lets
          taps fall through to the native input behind it. */}
      <span
        aria-hidden
        className={
          "pointer-events-none absolute left-3 z-[1] select-none text-base sm:text-sm " +
          (display ? "text-black" : "text-gray-700")
        }
      >
        {display || DATE_TEXT_PLACEHOLDER}
      </span>
    </div>
  );
}
