"use client";

/**
 * Toasts: `const { showToast } = useToast(); showToast("Payment recorded for Kwok Transport.")`.
 *
 * Part 14 "Toast" (v1.1, 7 Oct 2026; Part 14 wins over minty-web's look in this app, owner
 * 2026-10-13): one card on the raised surface (elevation 1), a bold type label and the message,
 * a close button; at most 480 wide, BOTTOM-LEFT of the page on desktop and bottom-centre on a
 * phone, never over the page's Primary action. No per-type colour or icon - the label carries
 * the type. 4s life; errors are role=alert.
 *
 * A toast confirms something that already happened. Errors belong in an Inline alert or Page
 * banner beside their cause (components/ui/InlineAlert.tsx) - the "error" type stays only for
 * the few call sites that have no surface to hold one.
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

import { Icon } from "@/components/ui/Icon";

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
              className="pointer-events-none fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-[500] mx-auto flex max-w-[480px] flex-col gap-2 sm:left-6 sm:right-auto sm:mx-0 sm:w-[min(480px,calc(100vw-3rem))]"
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
      className="pointer-events-auto flex items-start gap-3 rounded-lg border border-border-default bg-surface-raised p-3 text-body-m text-text-primary shadow-overlay"
    >
      <div className="min-w-0 flex-1 py-0.5">
        <p className="font-semibold">{LABEL[item.type] ?? LABEL.success}</p>
        <p className="break-words text-text-secondary">{item.message}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="-m-1 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary hover:bg-state-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
      >
        <Icon name="close" size="md" />
      </button>
    </div>
  );
}
