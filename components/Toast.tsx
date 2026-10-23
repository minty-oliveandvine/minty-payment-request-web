"use client";

/**
 * Toasts: `const { showToast } = useToast(); showToast("Saved", "success")`.
 *
 * The house toast, the same card in every Minty app (minty-web's
 * components/ui/Toast.tsx is the reference): a white card, a bold type label
 * (Success / Error / Warning / Information), the message in grey and a close
 * button, stacked at the top-right. No per-type colour or icon by decision -
 * the label carries the type. Auto-dismisses after 4s; errors are role=alert.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ToastType = "success" | "error" | "warning" | "info";

const LABEL: Record<ToastType, string> = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Information",
};

const DEFAULT_DURATION_MS = 4000;

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  /** Show a toast. `type` defaults to "success". Returns the toast id. */
  showToast: (message: string, type?: ToastType) => number;
  /** Dismiss a specific toast early (optional). */
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return ctx;
}

const noSubscribe = () => () => {};
const clientTrue = () => true;
const serverFalse = () => false;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // The portal needs document.body, which only exists on the client.
  const mounted = useSyncExternalStore(noSubscribe, clientTrue, serverFalse);
  const idRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = (idRef.current += 1);
      setToasts((prev) => [...prev, { id, message, type }]);
      window.setTimeout(() => dismissToast(id), DEFAULT_DURATION_MS);
      return id;
    },
    [dismissToast],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              className="pointer-events-none fixed right-4 top-4 z-[500] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
              aria-live="polite"
              aria-atomic="false"
            >
              {toasts.map((t) => (
                <ToastCard key={t.id} item={t} onClose={() => dismissToast(t.id)} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  return (
    <div
      role={item.type === "error" ? "alert" : "status"}
      data-toast-type={item.type}
      className="pointer-events-auto flex items-start gap-3 rounded border border-[#e5e7eb] bg-white p-3 text-sm text-[#171717] shadow"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{LABEL[item.type] ?? LABEL.success}</p>
        <p className="break-words text-[#6b7280]">{item.message}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="cursor-pointer text-[#6b7280] hover:text-[#171717] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      >
        ×
      </button>
    </div>
  );
}
