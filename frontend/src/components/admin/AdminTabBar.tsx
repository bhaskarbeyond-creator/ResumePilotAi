/**
 * The console's tab strip (REC-018, REC-019, INV-1).
 *
 * ## What it guarantees
 *
 *  - **One tab stop.** Only the selected tab is in the tab order (`tabIndex={0}`); the rest are
 *    `-1` and reached with the arrow keys, which is the WAI-ARIA tablist pattern.
 *  - **Roving focus follows selection.** Activating a tab moves focus to it, so a screen reader
 *    announces the newly selected tab rather than the one it left.
 *  - **Home / End reach the ends.** They were a no-op until the browser keyboard script pressed
 *    `End` and found focus unchanged: `(index ± length) % length === index`.
 *  - **A blocked surface is still legible.** A tab the caller cannot open is rendered disabled
 *    with the reason in its accessible name (`needs audit.read`, `super-admin only`), because a
 *    tab that silently vanishes reads as a missing feature.
 *
 * @module components/admin/AdminTabBar
 */

import { useRef } from 'react';

import type { AdminTabId } from './admin-tab-id';

/** One entry as the console receives it from `GET /api/me/capabilities`. */
export interface AdminTabBarProps {
  tabs: { id: string; label: string; group: string; allowed: boolean; reason?: string | null; missing?: string[] }[];
  activeTab: AdminTabId | null;
  onSelect: (tabId: AdminTabId) => void;
}

/**
 * A real tablist: one tab stop, arrow keys move between tabs, Home/End jump to the
 * ends. Hidden surfaces are rendered as disabled items with the reason in their
 * accessible name, so a person can see that a capability exists and why they lack it
 * — rather than wondering whether the product has the feature.
 */
export function AdminTabBar({ tabs, activeTab, onSelect }: AdminTabBarProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  /**
   * Select a tab and move focus to it.
   *
   * Focus follows selection, which is what a tablist without `aria-activedescendant`
   * requires for a screen reader to announce the new tab.
   *
   * @param next the tab to activate
   */
  const activate = (next: { id: string }) => {
    onSelect(next.id as AdminTabId);
    requestAnimationFrame(() => {
      const element = listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`);
      element?.focus();
    });
  };

  /** Adjacent allowed tab, wrapping at both ends (roving focus). */
  const move = (delta: number) => {
    if (!activeTab) return;
    const selectable = tabs.filter((tab) => tab.allowed);
    const index = selectable.findIndex((tab) => tab.id === activeTab);
    if (index === -1 || selectable.length === 0) return;
    const next = selectable[(index + delta + selectable.length) % selectable.length];
    if (next) activate(next);
  };

  /**
   * First or last allowed tab.
   *
   * This exists because the previous implementation spelled Home/End as
   * `move(-length)` / `move(+length)`. That is a no-op: the modular index
   * arithmetic `(index ± length) % length` is `index`, so both keys selected the tab
   * that was already open and the end of the strip was unreachable except by
   * pressing the arrow key fourteen times. Found by the browser keyboard script
   * (the unit suite never pressed End), fixed here rather than in the test.
   *
   * @param end which end of the strip
   */
  const jump = (end: 'first' | 'last') => {
    // With nothing selected there is nothing to move *from*, and a key press must not
    // commit a navigation the caller never started. The console renders this state only
    // while the census is still resolving, which is also the moment the panel is empty.
    if (!activeTab) return;
    const selectable = tabs.filter((tab) => tab.allowed);
    const next = end === 'first' ? selectable[0] : selectable[selectable.length - 1];
    if (next) activate(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        jump('first');
        break;
      case 'End':
        event.preventDefault();
        jump('last');
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Control plane surfaces"
      aria-orientation="horizontal"
      data-testid="admin-tablist"
      onKeyDown={onKeyDown}
      className="-mx-4 flex snap-x snap-mandatory gap-1 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {tabs.map((tab) => {
        const selected = tab.id === activeTab;
        const reason = tab.reason === 'super-admin-only'
          ? 'super-admin only'
          : tab.missing?.length
            ? `needs ${tab.missing.join(', ')}`
            : null;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab-id={tab.id}
            id={`admin-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`admin-panel-${tab.id}`}
            aria-disabled={!tab.allowed || undefined}
            tabIndex={selected ? 0 : -1}
            disabled={!tab.allowed}
            title={reason ? `${tab.label} — ${reason}` : tab.label}
            onClick={() => tab.allowed && onSelect(tab.id as AdminTabId)}
            className={[
              // 44 px minimum height at every width: the smallest target a thumb
              // can hit reliably (WCAG 2.5.8 / platform HIG agree on 44).
              'inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
              selected
                ? 'bg-brand-600 text-white'
                : tab.allowed
                  ? 'text-ink-secondary hover:bg-muted hover:text-ink'
                  : 'cursor-not-allowed text-ink-muted/60 line-through decoration-1',
            ].join(' ')}
          >
            {tab.label}
            {!tab.allowed && reason && <span className="sr-only"> — unavailable: {reason}</span>}
          </button>
        );
      })}
    </div>
  );
}

