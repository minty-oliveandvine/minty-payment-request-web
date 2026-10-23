"use client";

type EasyViewToggleProps = {
  enabled: boolean;
  onChange: (next: boolean) => void;
};

/** Switch + label (matches header mock: toggle then “Easy view”). */
export function EasyViewToggle({ enabled, onChange }: EasyViewToggleProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Easy view"
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full px-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${
          enabled ? "bg-secondary" : "bg-gray-200"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full border bg-white shadow transition-transform duration-200 ease-out ${
            enabled ? "translate-x-5 border-secondary" : "translate-x-0.5 border-gray-200"
          }`}
          aria-hidden
        />
      </button>
      <span className="whitespace-nowrap text-xs font-normal text-primary sm:text-sm">
        Easy view
      </span>
    </div>
  );
}
