import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

export const getFocusable = (root) => {
    if (!root) return [];
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
    );
};

/**
 * The shared modal/drawer accessibility contract (§14).
 *
 * Every overlay in the Cuba system routes through this hook so the contract can
 * only be satisfied once, audited once, and cannot drift per-component:
 *
 *   - semantic dialog role + accessible name (supplied by the caller)
 *   - Escape closes
 *   - focus trap (Tab / Shift+Tab wrap)
 *   - focus restoration to the trigger element
 *   - background scroll lock, reference-counted so nested overlays are safe
 *   - `inert`-style background isolation is intentionally NOT used: it is not
 *     supported in every target browser and would break existing focusable
 *     controls. Instead the trap keeps keyboard focus inside the overlay.
 */
export function useDialogA11y({ open, onClose, initialFocusRef }) {
    const panelRef = useRef(null);
    const returnFocusRef = useRef(null);
    const scrollLocks = useRef(0);

    const handleKeyDown = useCallback((event) => {
        if (!open) return;
        if (event.key === 'Escape') {
            event.stopPropagation();
            onClose?.();
            return;
        }
        if (event.key !== 'Tab') return;
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = getFocusable(panel);
        if (focusable.length === 0) {
            // A dialog with no focusable content must still hold focus.
            event.preventDefault();
            panel.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === panel)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }, [open, onClose]);

    useEffect(() => {
        if (!open) return undefined;
        const panel = panelRef.current;
        returnFocusRef.current = document.activeElement;

        const target = initialFocusRef?.current
            || (panel && getFocusable(panel)[0])
            || panel;
        // Defer so the element exists after the open transition commits.
        const raf = requestAnimationFrame(() => target?.focus?.());

        // Reference-counted scroll lock: nested overlays must not unlock early.
        scrollLocks.current += 1;
        const previousOverflow = document.body.style.overflow;
        const previousPadding = document.body.style.paddingRight;
        if (scrollLocks.current === 1) {
            const scrollbar = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.overflow = 'hidden';
            if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
        }

        document.addEventListener('keydown', handleKeyDown, true);

        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener('keydown', handleKeyDown, true);
            scrollLocks.current -= 1;
            if (scrollLocks.current <= 0) {
                scrollLocks.current = 0;
                document.body.style.overflow = previousOverflow;
                document.body.style.paddingRight = previousPadding;
            }
            // Restore focus to whatever opened the overlay (§14).
            const restore = returnFocusRef.current;
            if (restore && typeof restore.focus === 'function' && restore.isConnected) {
                restore.focus();
            }
        };
    }, [open, handleKeyDown, initialFocusRef]);

    return { panelRef };
}

/** Renders children into document.body so overlays escape any clipping/stacking ancestor. */
export function CubaPortal({ children }) {
    if (typeof document === 'undefined') return null;
    return createPortal(children, document.body);
}

export default useDialogA11y;
