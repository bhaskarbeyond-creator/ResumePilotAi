import { useEffect } from 'react';

/**
 * `useHeaderPopover` — the shared dismiss contract for the header's anchored
 * popovers (user menu, notification centre).
 *
 * WHY THIS IS NOT `useDialogA11y`:
 *   A header popover is a NON-MODAL anchored menu. It must not lock background
 *   scrolling, must not trap Tab (the user has to be able to leave), and must not
 *   steal focus on open. Reusing the modal contract here would freeze the page
 *   behind a menu that is meant to be glanced at and dismissed.
 *
 * What it does provide — the parts a popover genuinely owes its user (§14):
 *   - Escape closes, from the document, not just when the panel has focus.
 *   - Pointer-down OUTSIDE dismisses. `pointerdown` (not `click`) so the menu
 *     closes before the click lands on whatever the user actually aimed at, and
 *     so a drag that merely starts outside does not close it.
 *   - Focus returns to the trigger on close, so a keyboard user is never dumped
 *     at the top of the document.
 *
 * The caller owns rendering and ARIA; this hook owns dismissal only. It lives in
 * its own module (rather than beside a component) so the react-refresh fast-path
 * contract is not broken by co-locating a hook export with a component export.
 *
 * @param {{open: boolean, onClose: () => void, triggerRef: import('react').RefObject<HTMLElement>, panelRef: import('react').RefObject<HTMLElement>}} args
 */
export function useHeaderPopover({ open, onClose, triggerRef, panelRef }) {
    useEffect(() => {
        if (!open) return undefined;

        const onPointerDown = (event) => {
            const trigger = triggerRef?.current;
            const panel = panelRef?.current;
            // A press on the trigger itself is the toggle's business, not ours.
            if (trigger && trigger.contains(event.target)) return;
            if (panel && panel.contains(event.target)) return;
            onClose?.();
        };

        const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            onClose?.();
            // Restore focus synchronously so the ring is visible immediately and
            // the next Tab continues from the trigger.
            triggerRef?.current?.focus?.();
        };

        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);

        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
        };
    }, [open, onClose, triggerRef, panelRef]);

    // On close, hand focus back to whatever opened the popover — but only if focus
    // was inside it, so we never steal focus from wherever the user has moved on.
    useEffect(() => {
        if (open) return;
        const trigger = triggerRef?.current;
        const panel = panelRef?.current;
        if (trigger && panel && panel.contains(document.activeElement)) {
            trigger.focus?.();
        }
    }, [open, triggerRef, panelRef]);
}

export default useHeaderPopover;