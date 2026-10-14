import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FiCheck, FiInbox, FiMail, FiUserPlus, FiCalendar,
    FiXCircle, FiAward, FiTarget, FiCreditCard, FiFolder, FiShield, FiInfo, FiRotateCcw
} from 'react-icons/fi';
import { apiJson } from '../../../services/api/platform';
import { resolveNotificationHref, resolveNotificationKind } from '../../cuba/resolveNotificationHref';
import CubaPageHeader from '../../cuba/CubaPageHeader';
import CubaCard from '../../cuba/CubaCard';
import CubaButton from '../../cuba/CubaButton';
import CubaSkeleton from '../../cuba/CubaSkeleton';
import CubaEmptyState from '../../cuba/CubaEmptyState';
import CubaErrorState from '../../cuba/CubaErrorState';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * Contextual icon per notification KIND, mirroring the header bell so a row
 * reads identically in both surfaces. A kind with no entry falls back to the
 * neutral system icon, so a future producer type can never render a blank row.
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

const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' }
];

/** A timestamp is rendered ONLY when it parses, so "Invalid Date" never ships. */
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

/**
 * DashboardNotifications — DIR-072 S3, the dedicated full-page notifications
 * workspace mounted at `/dashboard/notifications`.
 *
 * DATA SOURCE (no synthetic data): rows come from `GET /api/notifications-data`,
 * the existing owner-scoped route that reads the authoritative MariaDB
 * `notifications` table for the CURRENT uid. If MariaDB has no rows the page
 * renders an honest empty state rather than inventing activity.
 *
 * INTERACTIVE READ STATE: each row toggles read against the owner-scoped
 * `PATCH /api/notifications-data/:id`; the header marks every unread row read via
 * `POST /api/notifications-data/mark-all-read`. Both are OPTIMISTIC WITH
 * ROLLBACK, so a rejected write can never leave the UI claiming a state the
 * database does not hold.
 *
 * NAVIGATION IS DERIVED: a row resolves a REAL mounted route from its `type`
 * (`resolveNotificationHref`); a row with no honest target renders as a `div`
 * rather than a dead button (zero dead hrefs).
 */
const DashboardNotifications = ({ showToast }) => {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all');
    const [pendingIds, setPendingIds] = useState(() => new Set());
    const [markingAll, setMarkingAll] = useState(false);
    const mountedRef = useRef(true);

    const generationRef = useRef(0);
    const loadRequestRef = useRef(0);
    // Synchronous locks also cover two events before React commits disabled state.
    const pendingIdsRef = useRef(new Set());
    const markingAllRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        generationRef.current += 1;
        return () => {
            mountedRef.current = false;
            generationRef.current += 1;
        };
    }, []);

    const load = useCallback(async () => {
        const generation = generationRef.current;
        const request = ++loadRequestRef.current;
        const isCurrent = () => mountedRef.current && generation === generationRef.current && request === loadRequestRef.current;
        setLoading(true);
        setError('');
        try {
            const data = await apiJson('/api/notifications-data');
            if (!isCurrent()) return;
            if (!Array.isArray(data?.notifications)) throw new Error('Notifications could not be loaded. Please retry.');
            setRows(data.notifications);
        } catch (loadError) {
            if (!isCurrent()) return;
            setRows([]);
            setError(loadError?.message || 'Notifications are unavailable.');
        } finally {
            if (isCurrent()) setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const unreadCount = useMemo(() => rows.filter((item) => item.read !== true).length, [rows]);
    const visibleRows = useMemo(
        () => (filter === 'unread' ? rows.filter((item) => item.read !== true) : rows),
        [rows, filter]
    );

    /** Per-row read toggle against the owner-scoped PATCH route. */
    const toggleRead = useCallback(async (item) => {
        const id = item?.id;
        if (!id || loading || markingAllRef.current || pendingIdsRef.current.has(id)) return;
        const generation = generationRef.current;
        const isCurrent = () => mountedRef.current && generation === generationRef.current;
        pendingIdsRef.current.add(id);
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
            if (!isCurrent()) return;
            setRows((prev) => prev.map((r) => (r.id === id ? { ...r, read: !nextRead } : r)));
            setError(patchError?.message || 'Could not update that notification.');
        } finally {
            pendingIdsRef.current.delete(id);
            if (isCurrent()) {
                setPendingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
            }
        }
    }, [loading]);

    /** Mark every unread row read in ONE owner-scoped statement. */
    const markAllRead = useCallback(async () => {
        if (loading || markingAllRef.current || pendingIdsRef.current.size > 0 || unreadCount === 0) return;
        const generation = generationRef.current;
        const isCurrent = () => mountedRef.current && generation === generationRef.current;
        markingAllRef.current = true;
        const snapshot = rows;
        setError('');
        setMarkingAll(true);
        setRows((prev) => prev.map((r) => ({ ...r, read: true })));
        try {
            await apiJson('/api/notifications-data/mark-all-read', { method: 'POST' });
            if (isCurrent()) showToast?.('success', 'Notifications', 'All notifications marked as read.');
        } catch (markError) {
            if (!isCurrent()) return;
            setRows(snapshot);
            setError(markError?.message || 'Could not mark notifications as read.');
        } finally {
            markingAllRef.current = false;
            if (isCurrent()) setMarkingAll(false);
        }
    }, [loading, rows, unreadCount, showToast]);

    const openRow = useCallback((item) => {
        const href = resolveNotificationHref(item);
        if (!href) return;
        navigate(href);
    }, [navigate]);

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8" data-testid="dashboard-notifications">
            <CubaPageHeader
                eyebrow="Activity"
                title="Notifications"
                subtitle={loading ? 'Loading notifications…' : error && rows.length === 0 ? 'Unable to load notifications.' : unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up.'}
                actions={
                    <CubaButton
                        variant="outline"
                        size="sm"
                        icon={<FiCheck className="h-4 w-4" aria-hidden="true" />}
                        onClick={markAllRead}
                        disabled={loading || markingAll || pendingIds.size > 0 || unreadCount === 0}
                        loading={markingAll}
                        data-testid="notifications-mark-all"
                    >
                        Mark all read
                    </CubaButton>
                }
            />

            {/* The live count is announced, not colour-only. */}
            <p className="cuba-sr-only" role="status" aria-live="polite">
                {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
            </p>

            <div className="mt-4 flex items-center gap-2" role="group" aria-label="Filter notifications">
                {FILTERS.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        onClick={() => setFilter(entry.id)}
                        aria-pressed={filter === entry.id}
                        data-testid={`notifications-filter-${entry.id}`}
                        className={cx(
                            'cuba-focusable min-h-11 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors',
                            filter === entry.id
                                ? 'bg-cuba-primary-soft text-cuba-primary-ink-strong'
                                : 'text-cuba-ink-muted hover:bg-cuba-primary-soft'
                        )}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>

            {/* A SOFT failure (e.g. a rejected mark-read that was rolled back) must
                surface WITHOUT hiding rows the user can still read. */}
            {error && rows.length > 0 && (
                <p role="status" data-testid="notifications-error" className="mt-3 text-xs font-medium text-cuba-danger">
                    {error}
                </p>
            )}

            <CubaCard className="mt-4 overflow-hidden" padded={false}>
                {error && rows.length === 0 ? (
                    <CubaErrorState
                        title="Notifications unavailable"
                        message={error}
                        onRetry={load}
                        retrying={loading}
                        className="m-3"
                    />
                ) : loading && rows.length === 0 ? (
                    <div className="space-y-3 p-5">
                        <CubaSkeleton height="0.9rem" width="60%" text="Loading notifications" />
                        <CubaSkeleton height="0.7rem" width="88%" text="Loading notifications" />
                        <CubaSkeleton height="0.9rem" width="46%" text="Loading notifications" />
                    </div>
                ) : visibleRows.length === 0 ? (
                    <CubaEmptyState
                        compact
                        className="m-3"
                        icon={<FiInbox className="h-5 w-5" aria-hidden="true" />}
                        title={filter === 'unread' ? 'Nothing unread' : 'You are all caught up'}
                        description={filter === 'unread'
                            ? 'Every notification here has been read.'
                            : 'New activity will appear here.'}
                    />
                ) : (
                    <ul className="divide-y" style={{ borderColor: 'var(--cuba-header-divider)' }}>
                        {visibleRows.map((item) => {
                            const isUnread = item.read !== true;
                            const when = formatWhen(item.created_at || item.createdAt);
                            const href = resolveNotificationHref(item);
                            const Icon = KIND_ICON[resolveNotificationKind(item)] || FiInfo;
                            const isPending = pendingIds.has(item.id);
                            const label = item.title || 'Notification';
                            const RowTag = href ? 'button' : 'div';
                            return (
                                <li key={item.id} className="flex items-start" data-testid="notifications-row">
                                    <RowTag
                                        {...(href ? { type: 'button', onClick: () => openRow(item) } : {})}
                                        data-navigable={href ? 'true' : 'false'}
                                        className={cx(
                                            'flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left transition-colors',
                                            href ? 'cuba-focusable hover:bg-cuba-primary-soft' : ''
                                        )}
                                    >
                                        <span
                                            className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full"
                                            style={isUnread
                                                ? { backgroundColor: 'var(--cuba-header-badge-fill)', color: 'var(--cuba-header-badge-ink)' }
                                                : { backgroundColor: 'var(--cuba-header-divider)', color: 'var(--cuba-ink-subtle)' }}
                                            aria-hidden="true"
                                        >
                                            <Icon className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-baseline justify-between gap-2">
                                                <span className={cx(
                                                    'min-w-0 truncate text-sm',
                                                    isUnread ? 'font-semibold text-cuba-ink' : 'font-medium text-cuba-ink-muted'
                                                )}>
                                                    {label}
                                                </span>
                                                {when && <span className="flex-none text-[11px] text-cuba-ink-subtle">{when}</span>}
                                            </span>
                                            {item.message && (
                                                <span data-notification-message className="mt-0.5 block text-xs text-cuba-ink-muted [overflow-wrap:anywhere]">{item.message}</span>
                                            )}
                                        </span>
                                    </RowTag>
                                    <button
                                        type="button"
                                        onClick={() => toggleRead(item)}
                                        disabled={loading || markingAll || isPending}
                                        data-testid="notifications-toggle"
                                        aria-pressed={!isUnread}
                                        aria-label={isUnread ? `Mark "${label}" as read` : `Mark "${label}" as unread`}
                                        className="cuba-focusable mt-1.5 mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-full text-cuba-ink-subtle transition-colors hover:bg-cuba-primary-soft hover:text-cuba-primary-ink-strong disabled:opacity-50"
                                    >
                                        {isPending
                                            ? <CubaSkeleton width="0.75rem" height="0.75rem" rounded="rounded-full" text="Saving read state" />
                                            : isUnread
                                                ? <FiCheck className="h-4 w-4" aria-hidden="true" />
                                                : <FiRotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </CubaCard>
        </div>
    );
};

export default DashboardNotifications;
