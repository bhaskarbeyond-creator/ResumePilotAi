import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    FiBell, FiCheck, FiInbox, FiMail, FiUserPlus, FiCalendar,
    FiXCircle, FiAward, FiTarget, FiCreditCard, FiFolder, FiShield, FiInfo, FiRotateCcw
} from 'react-icons/fi';
import { useHeaderPopover } from './useHeaderPopover';
import { apiJson } from '../../services/api/platform';
import { resolveNotificationHref, resolveNotificationKind } from './resolveNotificationHref';
import CubaSkeleton from './CubaSkeleton';
import CubaEmptyState from './CubaEmptyState';
import CubaErrorState from './CubaErrorState';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * Contextual icon per notification KIND (DIR-055 S2). `resolveNotificationKind`
 * maps the row's `type` to a semantic kind; this turns that into an icon. A kind
 * with no entry falls back to the neutral system icon, so a future producer type
 * can never render a blank row.
 */
const KIND_ICON = {
    message: FiMail,
    application: FiUserPlus,
    interview: FiCalendar,
    rejected: FiXCircle,
    offer: FiAward,
    match: FiTarget,
    payment: FiCreditCard,
    portfolio: FiFolder,
    security: FiShield,
    system: FiInfo
};

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
 *
 * NAVIGATION IS DERIVED, NOT STORED (DIR-055 S2):
 *   The `notifications` table has NO `href` column, so the old
 *   `onNavigate(item.href)` always navigated to `undefined` and every row click
 *   was silently dead. Rows now resolve a REAL mounted route from their `type`
 *   via `resolveNotificationHref`; a row with no honest target renders as a `div`
 *   rather than a dead button. The dead "View all activity" footer — which only
 *   re-navigated to the page you were already on — is gone.
 *
 * INTERACTIVE READ STATE (DIR-055 S2/S3/S8):
 *   Each row exposes a read toggle against the owner-scoped
 *   `PATCH /api/notifications-data/:id`, and the header exposes Mark-all-read
 *   against `POST /api/notifications-data/mark-all-read`. Both are OPTIMISTIC
 *   WITH ROLLBACK, so a rejected write can never leave the UI claiming a state
 *   the database does not hold. Loading uses CubaSkeleton, the zero-data state
 *   uses CubaEmptyState, and a hard failure uses CubaErrorState with Retry — a
 *   soft failure surfaces as an inline banner without hiding readable rows.
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

const M3NotificationCenter = ({ onNavigate }) => {
    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pendingIds, setPendingIds] = useState(() => new Set());
    const [markingAll, setMarkingAll] = useState(false);
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

    /**
     * Per-row read toggle (DIR-055 S2) against the existing owner-scoped
     * `PATCH /api/notifications-data/:id` route. Optimistic with rollback (S8):
     * the badge must react instantly, but a rejected write must NEVER leave the
     * UI claiming a state the database does not hold.
     */
    const toggleRead = useCallback(async (item) => {
        const id = item?.id;
        if (!id || pendingIds.has(id)) return;
        const nextRead = item.read !== true;
        setError('');
        setPendingIds((prev) => new Set(prev).add(id));
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, read: nextRead } : r)));
        try {
            await apiJson(`/api/notifications-data/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ read: nextRead })
            });
        } catch (patchError) {
            if (!mountedRef.current) return;
            // Roll back ONLY this row — a full reload would discard sibling edits.
            setRows((prev) => prev.map((r) => (r.id === id ? { ...r, read: !nextRead } : r)));
            setError(patchError?.message || 'Could not update that notification.');
        } finally {
            if (mountedRef.current) {
                setPendingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
            }
        }
    }, [pendingIds]);

    /**
     * Mark every unread row read in ONE owner-scoped statement (DIR-055 S3).
     * Optimistic with rollback, and guarded so a double click cannot race two
     * concurrent writes.
     */
    const markAllRead = useCallback(async () => {
        if (markingAll || unread === 0) return;
        const snapshot = rows;
        setError('');
        setMarkingAll(true);
        setRows((prev) => prev.map((r) => ({ ...r, read: true })));
        try {
            await apiJson('/api/notifications-data/mark-all-read', { method: 'POST' });
        } catch (markError) {
            if (!mountedRef.current) return;
            setRows(snapshot);
            setError(markError?.message || 'Could not mark notifications as read.');
        } finally {
            if (mountedRef.current) setMarkingAll(false);
        }
    }, [markingAll, rows, unread]);

    /**
     * Row click → a REAL mounted route derived from the row's `type`
     * (`resolveNotificationHref`). The `notifications` table has NO `href`
     * column, so the previous `item.href` was always `undefined` and every click
     * was silently dead. A row with no honest target does not navigate at all.
     */
    const openRow = useCallback((item) => {
        const href = resolveNotificationHref(item);
        if (!href) return;
        setOpen(false);
        onNavigate?.(href);
    }, [onNavigate]);

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
                        <div className="flex flex-none items-center gap-2">
                            {unread > 0 && (
                                <span
                                    data-testid="cuba-notification-unread-count"
                                    className="rounded-full bg-cuba-primary-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cuba-primary-ink-strong"
                                >
                                    {unread} new
                                </span>
                            )}
                            {unread > 0 && (
                                <button
                                    type="button"
                                    onClick={markAllRead}
                                    disabled={markingAll}
                                    data-testid="cuba-notification-mark-all"
                                    className="cuba-focusable rounded-full border border-cuba-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cuba-primary-ink-strong transition-colors hover:bg-cuba-primary-soft disabled:opacity-50"
                                >
                                    {markingAll ? 'Marking…' : 'Mark all read'}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="h-px flex-none" style={{ backgroundColor: 'var(--cuba-header-divider)' }} />
                    {/* A SOFT failure (e.g. a rejected mark-read that was rolled back)
                        must surface WITHOUT hiding rows the user can still read. */}
                    {error && rows.length > 0 && (
                        <p
                            role="status"
                            data-testid="cuba-notification-error"
                            className="flex-none px-4 py-2 text-xs font-medium text-cuba-danger"
                        >
                            {error}
                        </p>
                    )}
                    {/* DIR-048: token-backed scrollbar — the OS default grey bar must
                        never paint inside the executive surface. */}
                    <div className="cuba-scrollbar min-h-0 flex-1 overflow-y-auto">
                        {error && rows.length === 0 ? (
                            <CubaErrorState
                                title="Notifications unavailable"
                                message={error}
                                onRetry={load}
                                retrying={loading}
                                className="m-3"
                            />
                        ) : loading && rows.length === 0 ? (
                            <div className="space-y-3 px-4 py-4">
                                <CubaSkeleton height="0.8rem" width="72%" text="Loading notifications" />
                                <CubaSkeleton height="0.7rem" width="92%" text="Loading notifications" />
                                <CubaSkeleton height="0.8rem" width="58%" text="Loading notifications" />
                            </div>
                        ) : rows.length === 0 ? (
                            <CubaEmptyState
                                compact
                                className="m-3"
                                icon={<FiInbox className="h-5 w-5" aria-hidden="true" />}
                                title="You are all caught up"
                                description="Nothing unread. New activity will appear here."
                            />
                        ) : (
                            <ul className="divide-y" style={{ borderColor: 'var(--cuba-header-divider)' }}>
                                {rows.slice(0, 30).map((item) => {
                                    const isUnread = item.read !== true;
                                    const when = formatWhen(item.created_at || item.createdAt);
                                    const href = resolveNotificationHref(item);
                                    const Icon = KIND_ICON[resolveNotificationKind(item)] || FiInfo;
                                    const isPending = pendingIds.has(item.id);
                                    const label = item.title || 'Notification';
                                    // A row with no honest destination is NOT a button:
                                    // a dead link is worse than no link (zero dead hrefs).
                                    const RowTag = href ? 'button' : 'div';
                                    return (
                                        <li key={item.id} className="flex items-start">
                                            <RowTag
                                                {...(href ? { type: 'button', onClick: () => openRow(item) } : {})}
                                                data-testid="cuba-notification-row"
                                                data-navigable={href ? 'true' : 'false'}
                                                className={cx(
                                                    'flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left transition-colors',
                                                    href ? 'cuba-focusable hover:bg-cuba-primary-soft' : '',
                                                )}
                                            >
                                                <span
                                                    className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full"
                                                    style={isUnread
                                                        ? { backgroundColor: 'var(--cuba-header-badge-fill)', color: 'var(--cuba-header-badge-ink)' }
                                                        : { backgroundColor: 'var(--cuba-header-divider)', color: 'var(--cuba-ink-subtle)' }}
                                                    aria-hidden="true"
                                                >
                                                    <Icon className="h-3.5 w-3.5" />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex items-baseline justify-between gap-2">
                                                        <span className={cx(
                                                            'truncate text-sm',
                                                            isUnread ? 'font-semibold text-cuba-ink' : 'font-medium text-cuba-ink-muted',
                                                        )}>
                                                            {label}
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
                                            </RowTag>
                                            <button
                                                type="button"
                                                onClick={() => toggleRead(item)}
                                                disabled={isPending}
                                                data-testid="cuba-notification-toggle"
                                                aria-pressed={!isUnread}
                                                aria-label={isUnread ? `Mark "${label}" as read` : `Mark "${label}" as unread`}
                                                className="cuba-focusable mt-3 mr-3 flex h-7 w-7 flex-none items-center justify-center rounded-full text-cuba-ink-subtle transition-colors hover:bg-cuba-primary-soft hover:text-cuba-primary-ink-strong disabled:opacity-50"
                                            >
                                                {isPending
                                                    ? <CubaSkeleton width="0.75rem" height="0.75rem" rounded="rounded-full" text="Saving read state" />
                                                    : isUnread
                                                        ? <FiCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                                        : <FiRotateCcw className="h-3 w-3" aria-hidden="true" />}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {/* DIR-072: a real, working footer CTA into the dedicated
                        full-page notifications workspace. Wired through the
                        EXISTING `onNavigate` prop, so the DIR-055 dead-footer
                        regression guard still holds. */}
                    <div className="h-px flex-none" style={{ backgroundColor: 'var(--cuba-header-divider)' }} />
                    <div className="flex-none p-2">
                        <button
                            type="button"
                            onClick={() => { setOpen(false); onNavigate?.('/dashboard/notifications'); }}
                            data-testid="cuba-notification-view-all"
                            className="cuba-focusable w-full rounded-cuba-sm px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-cuba-primary-ink-strong transition-colors hover:bg-cuba-primary-soft"
                        >
                            View all notifications
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default M3NotificationCenter;