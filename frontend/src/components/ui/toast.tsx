/**
 * Toast component + application-wide toast service
 *
 * WHY THIS EXISTS
 * ---------------
 * `@radix-ui/react-toast` was a declared production dependency with zero usages
 * in `frontend/src`, while error feedback in the shipped app fell back to the
 * native `window.alert()`. Native alerts block the main thread, cannot be
 * styled with the design tokens, are not announced consistently, and break the
 * visual language of the rest of the product.
 *
 * This module makes the declared dependency the single authoritative feedback
 * primitive: accessible (Radix manages the `aria-live` region and focus),
 * non-blocking, token-styled, and usable from any component through
 * `useToast()` or, outside React, through the imperative `toast()` helper.
 */

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. `0` keeps the toast until dismissed. */
  duration?: number;
}

interface ToastRecord extends Required<Pick<ToastInput, 'title' | 'tone' | 'duration'>> {
  id: string;
  description?: string;
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-success-200 bg-success-50 text-success-800',
  error: 'border-error-200 bg-error-50 text-error-800',
  warning: 'border-warning-200 bg-warning-50 text-warning-800',
  info: 'border-info-200 bg-info-50 text-info-800',
};

const TONE_ICONS: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: TriangleAlert,
  info: Info,
};

const DEFAULT_DURATION = 6000;

interface ToastContextValue {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `toast-${sequence}`;
}

// Imperative bridge so non-component modules (api client, upload helpers) can
// report failures through the same accessible region.
let activeDispatch: ((record: ToastRecord) => void) | null = null;

/** Imperative toast for use outside the React tree. No-op before the provider mounts. */
export function toast(input: ToastInput): string {
  const record: ToastRecord = {
    id: nextId(),
    title: input.title,
    description: input.description,
    tone: input.tone ?? 'info',
    duration: input.duration ?? DEFAULT_DURATION,
  };
  if (activeDispatch) activeDispatch(record);
  return record.id;
}

export const toastSuccess = (title: string, description?: string) =>
  toast({ title, description, tone: 'success' });
export const toastError = (title: string, description?: string) =>
  toast({ title, description, tone: 'error', duration: 9000 });
export const toastWarning = (title: string, description?: string) =>
  toast({ title, description, tone: 'warning' });
export const toastInfo = (title: string, description?: string) =>
  toast({ title, description, tone: 'info' });

/** Read a user-presentable message from an unknown thrown value. */
export function toastMessageFromError(err: unknown, fallback: string): string {
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object') {
    const candidate = (err as { message?: unknown }).message;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = React.useState<ToastRecord[]>([]);

  React.useEffect(() => {
    activeDispatch = (record) => setRecords((prev) => [...prev, record]);
    return () => {
      activeDispatch = null;
    };
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setRecords((prev) => prev.filter((record) => record.id !== id));
  }, []);

  const value = React.useMemo<ToastContextValue>(() => ({ toast, dismiss }), [dismiss]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {records.map((record) => {
          const Icon = TONE_ICONS[record.tone];
          return (
            <ToastPrimitive.Root
              key={record.id}
              duration={record.duration}
              onOpenChange={(open) => {
                if (!open) dismiss(record.id);
              }}
              className={cn(
                'pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border p-4 shadow-lg',
                'data-[state=open]:animate-in data-[state=closed]:animate-out',
                'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                'data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full',
                TONE_STYLES[record.tone],
              )}
            >
              <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className="text-sm font-semibold leading-5">
                  {record.title}
                </ToastPrimitive.Title>
                {record.description ? (
                  <ToastPrimitive.Description className="mt-1 text-sm leading-5 opacity-90">
                    {record.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close
                className="shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label="Dismiss notification"
              >
                <X className="size-4" aria-hidden="true" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex max-h-[100dvh] flex-col gap-2 p-4 sm:inset-x-auto sm:right-0 sm:max-w-sm"
          aria-label="Notifications"
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

/** Access the toast service from inside the React tree. */
export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    // Falling back to the imperative service keeps callers safe if a tree is
    // rendered without the provider (for example in isolated unit tests).
    return { toast, dismiss: () => undefined };
  }
  return context;
}
