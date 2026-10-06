import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiBell, FiCheck, FiInbox } from 'react-icons/fi';
import { useHeaderPopover } from './useHeaderPopover';
import { apiJson } from '../../services/api/platform';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * M3NotificationCenter — the live notification bell and activity popover for the
 * universal app header (DIR-011).
 *
 * DATA SOURCE (no synthetic data, §40):
 *   Rows come from `GET /api/notifications-data`, the existing owner-scoped route
 *   that reads the authoritative MariaDB `notifications` table for the CURRENT
 *   uid. There is no second endpoint, no seed list and no "sample activity"
 *   fallback: if MariaDB has no rows for this user, the popover renders an honest
 *   empty state instead of inventing something to show.
 *
 * WHY THE UNREAD COUNT IS COMPUTED HERE:
 *   That route answers `{ success, notifications }` — it carries no server-side
 *   unread total. `MySQLRepository.getNotifications` already maps each row's
 *   `is_read` column onto a boolean `read`, so the count is derived with the SAME
 *   predicate the existing `getUnreadNotifications` service uses
 *   (`item.read !== true`). Deriving it client-side therefore cannot disagree with
 *   the rest of the product's notion of "unread".
 *
 * FAILURE IS VISIBLE, NOT HIDDEN:
 *   A failed read sets an explicit error state and never silently renders as
 *   "0 unread, all clear" — a transport error masquerading as good news is the
 *   exact failure mode this component must not have.
 */
const formatWhen = (value) => {
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) return '';
    const diffMs = Date.now() - when.getTime();
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diffMs < minute) return 'just now';
    if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
    if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
    if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
    return when.toLocaleDateString();
};

const M3NotificationCenter = ({ onNavigate, onOpenAll }) => {
    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const triggerRef = useRef(null);
    const panelRef = useRef(null);
    const mountedRef = useRef(true);

    useHeaderPopover({ open, onClose: () => setOpen(false), triggerRef, panelRef });

    useEffect(() => () => { mountedRef.current = false; }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await apiJson('/api/notifications-data');
            // Ignore a response that arrives after unmount.
            if (!mountedRef.current) return;
            setRows(Array.isArray(data?.notifications) ? data.notifications : []);
        } catch (loadError) {
            if (!mountedRef.current) return;
            setRows([]);
            setError(loadError?.message || 'Notifications are unavailable.');
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    // Load once on mount so the badge is real before the user ever opens it, and
    // refresh on each open so the popover never shows a stale count.
    useEffect(() => { load(); }, [load]);
    useEffect(() => { if (open) load(); }, [open, load]);

    const unread = rows.filter((item) => item.read !== true).length;

    return (
        <div className="relative flex-none">
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? 'cuba-notification-panel' : undefined}
                aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, none unread'}
                data-testid="cuba-notification-trigger"
                className={cx(
                    'cuba-focusable relative inline-flex h-10 w-10 items-center justify-center rounded-full text-cuba-ink-muted transition-colors hover:bg-cuba-primary-soft',
                    open && 'bg-cuba-primary-soft',
                )}
            >
                <FiBell className="h-[18px] w-[18px]" aria-hidden="true" />
                {unread > 0 && (
                    <span
                        data-testid="cuba-notification-badge"
                        className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
                        style={{
                            backgroundColor: 'var(--cuba-header-badge-fill)',
                            color: 'var(--cuba-header-badge-ink)',
                        }}
                    >
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>

            {/* DIR-048: the panel floats above scrolling content, so it carries the
                executive glass surface. `cuba-popover` composes the glass blur, the
                header-menu border, the xl elevation and the xl radius in one class
                (see cuba-tokens.css for why composition beats stacking `cuba-glass`
                with utility overrides) so the menu never loses its edge against a
                light backdrop. */}
            {open && (
                <div
                    ref={panelRef}
                    id="cuba-notification-panel"
                    role="dialog"
                    aria-label="Notifications"
                    data-testid="cuba-notification-panel"
                    style={{ zIndex: 'var(--cuba-z-popover)' }}
                    className="cuba-popover absolute right-0 top-[calc(100%+0.5rem)] flex max-h-[26rem] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden"
                >
                    <div className="flex flex-none items-center justify-between gap-3 px-4 py-3">
                        <h2 className="text-sm font-bold text-cuba-ink">Notifications</h2>
                        {unread > 0 && (
                            <span className="rounded-full bg-cuba-primary-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cuba-primary-ink-strong">
                                {unread} new
                            </span>
                        )}
                    </div>
                    <div className="h-px flex-none" style={{ backgroundColor: 'var(--cuba-header-divider)' }} />
                    {/* DIR-048: token-backed scrollbar — the OS default grey bar must
                        never paint inside the executive surface. */}
                    <div className="cuba-scrollbar min-h-0 flex-1 overflow-y-auto">
                        {error ? (
                            <p role="status" className="px-4 py-6 text-center text-sm text-cuba-danger">
                                {error}
                            </p>
                        ) : loading && rows.length === 0 ? (
                            <p role="status" className="px-4 py-6 text-center text-sm text-cuba-ink-muted">
                                Loading notifications…
                            </p>
                        ) : rows.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                                <FiInbox className="h-7 w-7 text-cuba-ink-subtle" aria-hidden="true" />
                                <p className="text-sm font-semibold text-cuba-ink">You are all caught up</p>
                                <p className="text-xs text-cuba-ink-subtle">
                                    Nothing unread. New activity will appear here.
                                </p>
                            </div>
                        ) : (
                            <ul className="divide-y" style={{ borderColor: 'var(--cuba-header-divider)' }}>
                                {rows.slice(0, 30).map((item) => {
                                    const isUnread = item.read !== true;
                                    const when = formatWhen(item.created_at || item.createdAt);
                                    return (
                                        <li key={item.id}>
                                            <button
                                                type="button"
                                                onClick={() => onNavigate?.(item.href)}
                                                className="cuba-focusable flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-cuba-primary-soft"
                                            >
                                                <span
                                                    className="mt-1.5 h-2 w-2 flex-none rounded-full"
                                                    style={{
                                                        backgroundColor: isUnread ? 'var(--cuba-header-badge-fill)' : 'transparent',
                                                    }}
                                                    aria-hidden="true"
                                                />
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex items-baseline justify-between gap-2">
                                                        <span className={cx(
                                                            'truncate text-sm',
                                                            isUnread ? 'font-semibold text-cuba-ink' : 'font-medium text-cuba-ink-muted',
                                                        )}>
                                                            {item.title || 'Notification'}
                                                        </span>
                                                        {when && (
                                                            <span className="flex-none text-[10px] text-cuba-ink-subtle">{when}</span>
                                                        )}
                                                    </span>
                                                    {item.message && (
                                                        <span className="mt-0.5 block truncate text-xs text-cuba-ink-muted">
                                                            {item.message}
                                                        </span>
                                                    )}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {onOpenAll && rows.length > 0 && (
                        <>
                            <div className="h-px flex-none" style={{ backgroundColor: 'var(--cuba-header-divider)' }} />
                            <button
                                type="button"
                                onClick={() => { setOpen(false); onOpenAll(); }}
                                className="cuba-focusable flex-none px-4 py-3 text-center text-sm font-semibold text-cuba-primary-ink-strong transition-colors hover:bg-cuba-primary-soft"
                            >
                                View all activity
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default M3NotificationCenter;