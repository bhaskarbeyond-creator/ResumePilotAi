/**
 * DIR-026 / AC-3: the route-level administrator module gate.
 *
 * WHY A GATE COMPONENT AND NOT ONLY HIDDEN LINKS:
 *   Hiding a nav link stops discovery, but `/dashboard/messages` and
 *   `/employer/messages` are still directly typeable. A user with a bookmark, a
 *   stale browser history entry, or a shared link would otherwise land on a
 *   surface whose every API call is about to be rejected by the AC-4 backend
 *   guard. This gate closes that gap in the router, so the two layers agree.
 *
 * FAIL-CLOSED POLARITY:
 *   The flag is read from the authoritative MariaDB settings document through
 *   `resolveMessagesVisibility`, which returns false for a fallback/stale
 *   payload and requires an explicit `true`. "We could not determine whether
 *   messaging is enabled" therefore renders as DISABLED, matching the AC-4
 *   server guard's `!== true` rather than contradicting it.
 *
 * UX ON DISABLE:
 *   The visitor is redirected to their own portal home with an informational
 *   toast — never an error page and never a dead end. Nothing is fabricated:
 *   the message states only the one fact the server actually established, that
 *   an administrator has the module switched off.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSystemSettings } from '../../services/api/platform';
import { resolveMessagesVisibility } from '../../utils/moduleFlags';

const FALLBACK_HOME = '/dashboard';

// bs-module-gate
const MessagesModuleGate = ({ children, home = FALLBACK_HOME, notify = null }) => {
    const navigate = useNavigate();
    const [decision, setDecision] = useState('pending');
    const notifiedRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        const resolve = async () => {
            try {
                const settings = await getSystemSettings();
                if (cancelled) return;
                setDecision(resolveMessagesVisibility(settings) === true ? 'enabled' : 'disabled');
            } catch {
                // An unreadable settings document is NOT authorization to show
                // the surface. Fail closed exactly like the backend guard.
                if (!cancelled) setDecision('disabled');
            }
        };
        resolve();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (decision !== 'disabled' || notifiedRef.current) return;
        notifiedRef.current = true;
        const message = 'Messaging is currently disabled by the administrator.';
        // The hosts that render this gate (DashboardMain.showToast and
        // EmployerPortal.showToast) both use the platform-wide
        // `(type, title, text)` contract, and DashboardToast renders `title`
        // and `text` as its two visible lines. Calling `notify(message, 'info')`
        // would therefore have put the message into the `type` slot — the toast
        // would render the literal word "info" as its title and the actual
        // notice would never reach the user. `warning` is the platform's
        // closest neutral variant: it is one of the three types DashboardToast
        // actually styles, and an administrator-disabled feature is a notice
        // the user must act on, not a success.
        if (typeof notify === 'function') notify('warning', 'Messaging is disabled', message);
        else if (typeof window !== 'undefined') {
            // No toast host was supplied: announce it through the same channel
            // the rest of the platform uses rather than silently redirecting.
            window.dispatchEvent(new CustomEvent('moduleDisabled', { detail: { module: 'messages', message } }));
        }
        navigate(home, { replace: true });
    }, [decision, home, navigate, notify]);

    // `pending` and `disabled` both render nothing so the surface never flashes
    // before the authoritative flag is known — a brief flash of a disabled
    // feature is itself a (small) disclosure of configuration state.
    if (decision !== 'enabled') return null;

    return children;
};

export default MessagesModuleGate;
export const MessagesGateContainer = ({ children }) => (
    <div className="alert alert-warning container-fluid p-0 d-contents bs-gate-bridge">{children}</div>
);
