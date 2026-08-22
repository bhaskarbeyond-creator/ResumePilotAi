import React, { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Shared accessible modal primitive for the Admin control plane.
 *
 * It deliberately keeps product copy and actions with the caller while owning
 * the safety baseline every privileged dialog needs: Escape/backdrop dismissal
 * when permitted, focus containment, and focus restoration.
 */
export default function AdminDialog({
  open,
  title,
  description,
  children,
  onClose,
  dismissible = true,
  labelledBy,
  describedBy,
  className = '',
}) {
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const titleId = labelledBy || 'admin-dialog-title';
  const descriptionId = describedBy || 'admin-dialog-description';

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocusedRef.current = document.activeElement;
    const focusInitialControl = () => {
      const controls = dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
      (controls?.[0] || dialogRef.current)?.focus?.();
    };
    const frame = window.requestAnimationFrame(focusInitialControl);

    const onKeyDown = event => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const controls = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || []);
      if (!controls.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [dismissible, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={event => {
        if (dismissible && event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        className={`max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        {(title || description) && (
          <header className="border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
            {title && <h2 id={titleId} className="text-base font-extrabold text-slate-900">{title}</h2>}
            {description && <p id={descriptionId} className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}
          </header>
        )}
        {children}
      </section>
    </div>
  );
}
