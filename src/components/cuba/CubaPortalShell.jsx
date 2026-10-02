import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import CubaAppShell from './CubaAppShell';
import { useAiEngineStatus } from '../../hooks/useAiEngineStatus';
import { resolveActiveItem } from '../Candidate/navigationState';
import { buildPortalCommands } from './portalCommands';

/**
 * CubaPortalShell — the shared chrome for the recruiter, organization and admin
 * consoles (Phases 5–7).
 *
 * WHAT IT IS: a thin wrapper that supplies the Cuba app bar, sidebar and content
 * stage around portal content that already exists and already works.
 *
 * WHAT IT IS NOT, and this matters:
 *   - It does NOT re-implement any portal. `EmployerPortal`, `EnterpriseConsole`
 *     and `Admin` remain the authority for their own routes, data, RBAC gates and
 *     mutations. Their internals are untouched.
 *   - It adds NO authorization. Routes stay behind `RequireAuthenticated` in
 *     `src/main.jsx`; admin stays behind `RequireTabPerm` + the backend policy
 *     engine; tenant visibility stays server-resolved via
 *     `/api/enterprise/context`. This shell cannot widen access (§7).
 *   - It issues NO data requests of its own beyond the public, secret-free
 *     availability probe used for the AI status beacon, which is the same probe
 *     the Admin Platform Health console is built on.
 *
 * It is opt-in via `ime365_cuba_shell_v2` and defaults to the existing chrome,
 * so no current user is affected and rollback is a single localStorage write.
 */
const CubaPortalShell = ({
    persona,
    navigation,
    user,
    title,
    toolbar = null,
    children,
}) => {
    const location = useLocation();
    const aiStatus = useAiEngineStatus();
    const [theme, setTheme] = useState('light');

    const groups = useMemo(() => navigation || [], [navigation]);

    const active = useMemo(
        () => resolveActiveItem(location.pathname, groups),
        [location.pathname, groups],
    );

    // Commands are generated from the SAME navigation the sidebar renders, so a
    // palette entry can never point somewhere the sidebar does not (§25).
    const commands = useMemo(
        () => buildPortalCommands(groups, active?.label),
        [groups, active],
    );

    const navigate = useCallback((to) => { window.location.assign(to); }, []);

    const onToggleTheme = useCallback(
        () => setTheme((value) => (value === 'dark' ? 'light' : 'dark')),
        [],
    );

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    return (
        <CubaAppShell
            navigation={groups}
            breadcrumb={(
                <>
                    {persona}
                    <span aria-hidden="true" className="mx-2 opacity-60">/</span>
                    {active?.label || title}
                </>
            )}
            theme={theme}
            onToggleTheme={onToggleTheme}
            aiStatus={aiStatus}
            commands={commands}
            toolbar={toolbar}
            user={user}
        >
            {children}
        </CubaAppShell>
    );
};

export default CubaPortalShell;
