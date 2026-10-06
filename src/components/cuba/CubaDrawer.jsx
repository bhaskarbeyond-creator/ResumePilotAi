import React, { useRef } from 'react';
import { FiX } from 'react-icons/fi';
import { CubaPortal, useDialogA11y } from './useDialogA11y';

/**
 * CubaDrawer — the single accessible slide-over panel (§14, §35).
 *
 * Reuses the exact same a11y contract as CubaModal (focus trap, Escape, focus
 * restoration, scroll lock) and differs only in geometry, so a drawer can never
 * drift from the modal contract.
 */
const CubaDrawer = ({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    side = 'right',
    width = 'max-w-md',
    initialFocusRef,
    testId = 'cuba-drawer',
}) => {
    const closeRef = useRef(null);
    const { panelRef } = useDialogA11y({
        open,
        onClose,
        initialFocusRef: initialFocusRef || closeRef,
    });
    if (!open) return null;

    const position = side === 'left'
        ? 'left-0 top-0 h-full max-h-none border-r'
        : 'right-0 top-0 h-full max-h-none border-l';

    /**
     * DIR-048 S10: below 640px the slide-over presents as a native bottom
     * sheet — anchored to the bottom edge, full width, top-rounded — while
     * sm+ keeps the side geometry. Presentation only: the a11y contract
     * (focus trap, Escape, restoration) is unchanged.
     */
    const MOBILE_SHEET = 'max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:h-auto max-sm:max-h-[85vh] max-sm:rounded-t-cuba-xl max-sm:border-x-0 max-sm:border-t';

    return (
        <CubaPortal>
            <div className="fixed inset-0" style={{ zIndex: 'var(--cuba-z-modal)' }}>
                <div className="absolute inset-0 bg-slate-950/45" onClick={onClose} aria-hidden="true" />
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={title ? `${testId}-title` : undefined}
                    aria-describedby={description ? `${testId}-description` : undefined}
                    tabIndex={-1}
                    data-testid={testId}
                    className={`cuba-glass-strong absolute ${position} flex w-full ${width} flex-col overflow-hidden shadow-cuba-lg ${MOBILE_SHEET}`}
                >
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
                            ref={closeRef}
                            type="button"
                            onClick={onClose}
                            aria-label="Close panel"
                            className="cuba-focusable -mr-1 inline-flex h-9 w-9 flex-none items-center justify-center rounded-cuba-sm text-cuba-ink-muted transition-colors hover:bg-cuba-primary-soft hover:text-cuba-ink"
                        >
                            <FiX className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </header>
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

export default CubaDrawer;
