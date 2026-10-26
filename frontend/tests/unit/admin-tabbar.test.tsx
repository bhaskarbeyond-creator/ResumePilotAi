/**
 * The console tab strip — the keyboard contract, as a unit test.
 *
 * ## Why this file exists
 *
 * `Home` and `End` were implemented as `move(-length)` / `move(+length)`, and `move` computes
 * `(index ± length) % length`, which is `index`. Both keys therefore re-selected the tab that was
 * already open. The browser script in `tests/admin-console-ux.spec.ts` caught it by pressing `End`
 * and asserting focus moved; the fast tier had no test for the strip at all, because the strip
 * lived inside the page component.
 *
 * The strip is now `components/admin/AdminTabBar.tsx` and this file pins all four rules:
 * roving focus, wrapping arrows, Home/End, and a blocked tab that explains itself.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AdminTabBar, type AdminTabBarProps } from '@/components/admin/AdminTabBar';

/** A four-tab strip with the third one blocked, which is what a delegated admin sees. */
function tabs(): AdminTabBarProps['tabs'] {
  return [
    { id: 'dashboard', label: 'Command Center', group: 'observability', allowed: true },
    { id: 'health', label: 'Health', group: 'observability', allowed: true },
    { id: 'rbac', label: 'Roles', group: 'governance', allowed: false, reason: 'super-admin-only', missing: ['*'] },
    { id: 'audit', label: 'Audit', group: 'governance', allowed: true },
  ];
}

/** Render the strip and return the user-event handle plus the select spy. */
function setup(activeTab: AdminTabBarProps['activeTab'] = 'dashboard') {
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(<AdminTabBar tabs={tabs()} activeTab={activeTab} onSelect={onSelect} />);
  // Keyboard events bubble from the focused tab, which is where a real user's focus is; the
  // `role="tablist"` container itself is deliberately not focusable.
  const focusTarget = screen.getAllByRole('tab')[activeTab === 'audit' ? 3 : 0]!;
  return { onSelect, user, list: focusTarget };
}

describe('AdminTabBar', () => {
  it('exposes one tab stop: only the selected tab is tabbable', () => {
    setup('health');
    const all = screen.getAllByRole('tab');
    expect(all.filter((tab) => tab.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: /health/i })).toHaveAttribute('tabindex', '0');
  });

  it('moves to the next allowed tab with ArrowRight and wraps at the end', async () => {
    const { onSelect, user, list } = setup('audit');
    list.focus();
    await user.keyboard('{ArrowRight}');
    // Audit is last; the next allowed tab is the first one, because 'rbac' is blocked.
    expect(onSelect).toHaveBeenCalledWith('dashboard');
  });

  it('moves backwards with ArrowLeft and skips the blocked tab', async () => {
    const { onSelect, user, list } = setup('audit');
    list.focus();
    await user.keyboard('{ArrowLeft}');
    // 'rbac' is disallowed, so backwards from 'audit' is 'health'.
    expect(onSelect).toHaveBeenCalledWith('health');
  });

  it('End selects the last allowed tab — the defect this file exists for', async () => {
    const { onSelect, user, list } = setup('dashboard');
    list.focus();
    await user.keyboard('{End}');
    expect(onSelect).toHaveBeenCalledWith('audit');
  });

  it('Home selects the first allowed tab', async () => {
    const { onSelect, user, list } = setup('audit');
    list.focus();
    await user.keyboard('{Home}');
    expect(onSelect).toHaveBeenCalledWith('dashboard');
  });

  it('renders a blocked tab as disabled, with the reason in its text, not only its title', () => {
    setup();
    const blocked = screen.getAllByRole('tab').find((tab) => tab.textContent?.includes('Roles'));
    expect(blocked).toBeDefined();
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    // The reason is announced: a `title` alone is unreachable by keyboard and by most
    // screen readers, which is the defect the strip was rewritten to fix.
    expect(blocked?.textContent).toMatch(/unavailable: super-admin only/i);
  });

  it('selects an allowed tab on click and ignores a click on a blocked one', async () => {
    const { onSelect, user } = setup('dashboard');
    await user.click(screen.getByRole('tab', { name: /health/i }));
    expect(onSelect).toHaveBeenCalledWith('health');

    onSelect.mockClear();
    await user.click(screen.getAllByRole('tab').find((tab) => tab.textContent?.includes('Roles'))!);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('moves focus to the newly selected tab, so a screen reader announces it', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<AdminTabBar tabs={tabs()} activeTab="dashboard" onSelect={onSelect} />);
    screen.getAllByRole('tab')[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenCalledWith('health');
    // The page re-renders with the new selection; focus must follow it rather than stay behind.
    rerender(<AdminTabBar tabs={tabs()} activeTab="health" onSelect={onSelect} />);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(screen.getByRole('tab', { name: /health/i })).toHaveFocus();
  });

  it('does nothing when the active tab is not in the list, rather than wrapping to a guess', async () => {
    // A capability response can arrive for a tab the caller has since lost. The strip must
    // not silently jump to a neighbour when the index cannot be resolved.
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<AdminTabBar tabs={tabs()} activeTab={'modules' as never} onSelect={onSelect} />);
    screen.getAllByRole('tab')[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does nothing when no tab is active, rather than guessing a destination', async () => {
    const { onSelect, user, list } = setup(null);
    list.focus();
    await user.keyboard('{End}');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
