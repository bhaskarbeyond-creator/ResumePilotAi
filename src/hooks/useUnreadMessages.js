/**
 * DIR-026 / AC-2: the live unread-message count for navigation badges.
 *
 * WHAT WAS ACTUALLY BROKEN:
 *   This hook returned a bare `number`, but every consumer destructured an
 *   object — `ProfileDisplay.jsx:34` does `const { unreadCount } = ...`, which
 *   destructures `undefined` from `0` and therefore rendered NO badge ever, on
 *   any conversation, for any user. The shell also had no polling cadence and no
 *   failure state at all. Both are fixed here.
 *
 * SHAPE (stable, object-returning):
 *   `unreadCount` — a real MariaDB count from `GET /api/messages/conversations`
 *                   (`totalUnread`), NOT a client-side guess.
 *   `error`       — a non-empty string when the last read failed.
 *   `status`      — 'loading' | 'ready' | 'error'.
 *   `enabled`     — the administrator's authoritative module flag.
 *   `refresh()`   — manual re-read, used on route focus.
 *
 * FAILURE IS VISIBLE, NOT HIDDEN (mirrors M3NotificationCenter):
 *   A transport error or a 403 MODULE_DISABLED sets `error` and leaves
 *   `unreadCount` at its last known value. It NEVER silently reports 0, because
 *   "I could not reach the server" and "you have no unread messages" are
 *   different facts and rendering the badge as though nothing is unread would be
 *   a fabricated claim about the user's own inbox.
 *
 * WHY IT NEVER POLLS A DISABLED MODULE:
 *   `getSystemSettings()` is the authoritative MariaDB read. While the flag is
 *   off the hook is inert, so a disabled module issues no messaging traffic at
 *   all — matching the AC-4 server gate rather than racing it with 403s.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiJson, getSystemSettings } from '../services/api/platform';
import { resolveMessagesVisibility } from '../utils/moduleFlags';

const POLL_INTERVAL_MS = 15000;
const MODULE_FLAG_POLL_MS = 60000;

export function useUnreadMessages({ enabled: enabledOverride } = {}) {
    const [unreadCount, setUnreadCount] = useState(0);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('loading');
    const [moduleEnabled, setModuleEnabled] = useState(false);
    const mountedRef = useRef(true);

    // `undefined` means "not resolved yet" and is distinct from a resolved
    // `false`, so the badge never polls before it knows the module is on.
    const [override, setOverride] = useState(enabledOverride);
    const enabled = override === undefined ? moduleEnabled : override === true;

    useEffect(() => () => { mountedRef.current = false; }, []);

    useEffect(() => { setOverride(enabledOverride); }, [enabledOverride]);

    const refresh = useCallback(async () => {
        try {
            const data = await apiJson('/api/messages/conversations');
            if (!mountedRef.current) return;
            // The server total is authoritative. `Number(...) || 0` is safe here
            // because a malformed value genuinely means "no readable count",
            // and unlike a transport failure it is NOT an unknown state.
            setUnreadCount(Number(data?.totalUnread) || 0);
            setError('');
            setStatus('ready');
        } catch (loadError) {
            if (!mountedRef.current) return;
            setError(loadError?.message || 'Messaging is unavailable.');
            setStatus('error');
        }
    }, []);

    // Resolve the administrator's authoritative module flag first.
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const settings = await getSystemSettings();
                if (cancelled) return;
                setModuleEnabled(resolveMessagesVisibility(settings) === true);
            } catch {
                // Fail CLOSED: an unreadable settings document must not enable a
                // module the administrator may have switched off.
                if (!cancelled) setModuleEnabled(false);
            }
        };
        load();
        const timer = setInterval(load, MODULE_FLAG_POLL_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, []);

    useEffect(() => {
        if (!enabled) {
            setUnreadCount(0);
            setError('');
            setStatus('ready');
            return undefined;
        }
        setStatus('loading');
        refresh();
        const timer = setInterval(refresh, POLL_INTERVAL_MS);
        // Re-read on route focus so the badge is correct the moment a user
        // navigates back to a shell that was mounted earlier.
        if (typeof window !== 'undefined') {
            window.addEventListener('focus', refresh);
        }
        return () => {
            clearInterval(timer);
            if (typeof window !== 'undefined') window.removeEventListener('focus', refresh);
        };
    }, [enabled, refresh]);

    return { unreadCount, error, status, enabled, refresh };
}

export default useUnreadMessages;
