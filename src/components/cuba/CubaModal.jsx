import React from 'react';
import { FiX } from 'react-icons/fi';
import { CubaPortal, useDialogA11y } from './useDialogA11y';

/**
 * CubaModal — the single accessible dialog implementation (§12, §14, §35).
 *
 * Deliberately unopinionated about business logic: callers own their state and
 * their API calls. This component owns only the accessibility contract.
 */
const CubaModal = ({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    size = 'md',
    closeOnBackdrop = true,
    initialFocusRef,
    labelledBy,
    testId = 'cuba-modal',
}) => {
    const { panelRef } = useDialogA11y({ open, onClose, initialFocusRef });
    if (!open) return null;

    const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size] || 'max-w-lg';

    return (
        <CubaPortal>
            <div
                className="fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-6"
                style={{ zIndex: 'var(--cuba-z-modal)' }}
            >
                <div
                    className="absolute inset-0 bg-slate-950/45"
                    onClick={closeOnBackdrop ? onClose : undefined}
                    aria-hidden="true"
                />
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label={labelledBy ? undefined : (title || undefined)}
                    aria-labelledby={labelledBy}
                    aria-describedby={description ? `${testId}-description` : undefined}
                    tabIndex={-1}
                    data-testid={testId}
                    className={`cuba-glass-strong relative flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-b-none shadow-cuba-lg sm:rounded-cuba-xl`}
                >
                    {(title || description) && (
                        <header className="flex items-start gap-3 border-b border-cuba-line px-5 py-4">
                            <div className="min-w-0 flex-1">
                                {title && (
                                    <h2 id={`${testId}-title`} className="text-base font-semibold tracking-tight text-cuba-ink">
                                        {title}
                                    </h2>
                                )}
                                {description && (
                                    <p id={`${testId}-description`} className="mt-1 text-sm text-cuba-ink-muted">
                                        {description}
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close dialog"
                                className="cuba-focusable -mr-1 inline-flex h-9 w-9 flex-none items-center justify-center rounded-cuba-sm text-cuba-ink-muted transition-colors hover:bg-cuba-primary-soft hover:text-cuba-ink"
                            >
                                <FiX className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </header>
                    )}
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
                    {footer && (
                        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-cuba-line px-5 py-3.5">
                            {footer}
                        </footer>
                    )}
                </div>
            </div>
        </CubaPortal>
    );
};

export default CubaModal;
