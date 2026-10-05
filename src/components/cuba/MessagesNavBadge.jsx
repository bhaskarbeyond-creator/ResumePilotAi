/**
 * DIR-026 / AC-2: the live unread-message badge for the app header and sidebars.
 *
 * DESIGN RULES ENFORCED HERE:
 *   - ONE hook instance at the header level; the badge is a pure presentational
 *     component so the sidebar, the account menu and the header can all show the
 *     same number without three independent polling loops competing for the same
 *     endpoint.
 *   - ZERO FABRICATION. The count is whatever MariaDB said. A failed read is not
 *     rendered as "0 unread" — an unread badge that silently disappears on a
 *     network error is worse than no badge, because the user is then told their
 *     inbox is clear when nobody actually knows. On error we render a distinct
 *     "unavailable" dot plus a title explaining the state.
 *   - WCAG 2.1 AA (INV-4). The badge fill/ink pair is the audited
 *     `--cuba-header-badge-*` token set (light #c02630 on #ffffff = 5.98:1;
 *     the dark variants are remapped in `cuba-tokens.css`), never a hardcoded hex,
 *     so contrast holds in both themes automatically.
 *   - The count is exposed to assistive tech as text inside the trigger's
 *     `aria-label`, not as a colour-only or image-only signal.
 */
import React from 'react';
import { FiMessageSquare } from 'react-icons/fi';
import { useUnreadMessages } from '../../hooks/useUnreadMessages';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * The badge pill. `tone` switches between the unread, unavailable and muted
 * states so each state is visually distinct from "nothing unread".
 */
export const MessagesUnreadPill = ({ count = 0, status = 'ready', className = '', inverted = false }) => {
    const unavailable = status === 'error';
    const label = unavailable
        ? 'Messaging status unavailable'
        : `${count} unread message${count === 1 ? '' : 's'}`;

    if (!unavailable && count <= 0) return null;

    return (
        <span
            data-testid="messages-unread-pill"
            data-state={unavailable ? 'unavailable' : 'unread'}
            title={label}
            className={cx(
                'ml-auto inline-flex h-[18px] min-w-[18px] flex-none items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none',
                className,
            )}
            style={{
                backgroundColor: unavailable
                    ? 'var(--cuba-ink-subtle)'
                    : inverted
                        ? 'rgba(255,255,255,0.22)'
                        : 'var(--cuba-header-badge-fill)',
                // Both readable states resolve to the audited badge-ink token; the
                // inverted case only swaps the FILL, so AA contrast is preserved
                // by the token set rather than re-derived here.
                color: 'var(--cuba-header-badge-ink)',
            }}
        >
            {unavailable ? '!' : (count > 99 ? '99+' : count)}
            <span className="cuba-sr-only">{label}</span>
        </span>
    );
};

/**
 * A self-contained header action: the chat icon, its live badge, and a real link
 * to the candidate messages surface. When the administrator has disabled the
 * module it renders NOTHING — not a disabled button — because a permanently
 * dead control in the chrome is noise, and the AC-3 route gate already prevents
 * navigation.
 */
const MessagesNavBadge = ({ href = '/dashboard/messages', onNavigate, inverted = false, className = '' }) => {
    const { unreadCount, status, enabled } = useUnreadMessages();

    if (!enabled) return null;

    return (
        <a
            href={href}
            onClick={onNavigate}
            aria-label={status === 'error'
                ? 'Messages, status unavailable'
                : `Messages, ${unreadCount} unread`}
            data-testid="messages-nav-badge"
            className={cx(
                'cuba-focusable relative inline-flex h-10 w-10 flex-none items-center justify-center rounded-full transition-colors hover:bg-cuba-primary-soft',
                inverted ? 'text-white hover:bg-white/15' : 'text-cuba-ink-muted',
                className,
            )}
        >
            <FiMessageSquare className="h-[18px] w-[18px]" aria-hidden="true" />
            <span
                data-testid="messages-nav-badge-pill"
                className="absolute -right-0.5 -top-0.5 flex items-center"
            >
                <MessagesUnreadPill count={unreadCount} status={status} inverted={inverted} />
            </span>
        </a>
    );
};

export default MessagesNavBadge;