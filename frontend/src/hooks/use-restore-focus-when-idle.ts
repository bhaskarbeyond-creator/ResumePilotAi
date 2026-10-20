import { useEffect, useRef, type RefObject } from 'react';

/**
 * Buttons that disable themselves while busy drop keyboard focus to <body>.
 * When the work finishes, put focus back on the button unless the user has
 * already moved it somewhere else.
 */
export function useRestoreFocusWhenIdle(busy: boolean, ref: RefObject<HTMLButtonElement | null>) {
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) {
      const active = document.activeElement;
      if (!active || active === document.body) ref.current?.focus();
    }
    wasBusy.current = busy;
  }, [busy, ref]);
}
