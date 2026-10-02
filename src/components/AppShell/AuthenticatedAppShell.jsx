import React, { Suspense, useContext, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import ProfileDisplay from '../Dashboard/ProfileDisplay/ProfileDisplay';
import { getFullName } from '../../services/api/platform';
import { resolveApplicationShell } from './applicationShell';
import { isCubaShellEnabled } from '../cuba/cubaShellFlag';
// Opt-in candidate shell (§49). Lazily loaded so the legacy path — the default —
// never pays for it.
const CubaCandidateShell = React.lazy(() => import('../Candidate/CubaCandidateShell'));
import './AuthenticatedAppShell.scss';

const readCollapsed = () => {
    try { return localStorage.getItem('sidebarCollapsed') === 'true'; } catch { return false; }
};

/**
 * Dashboard application chrome for authenticated builder routes.
 * Uses AuthContext (already resolved before routes render) so the sidebar
 * cannot wait on a second onAuthStateChanged or on profile/settings fetches.
 */
const AuthenticatedAppShell = ({ children }) => {
    const user = useContext(AuthContext);
    const decision = resolveApplicationShell({ authReady: true, user });
    const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsed);
    const [profile, setProfile] = useState({});
    const [cubaShell, setCubaShell] = useState(false);

    // Read the rollout flag after mount rather than during render: reading
    // localStorage during render would let the first paint differ between
    // server and client.
    useEffect(() => {
        setCubaShell(isCubaShellEnabled());
    }, []);

    useEffect(() => {
        if (!decision.userId) return undefined;
        let active = true;
        getFullName(decision.userId).then((value) => {
            if (!active || !value) return;
            setProfile({
                firstname: value.firstname || '',
                lastname: value.lastname || '',
                name: `${value.firstname || ''} ${value.lastname || ''}`.trim(),
                membership: value.membership || 'Basic',
                ...(value.profile || {}),
            });
        }).catch(() => {});
        return () => { active = false; };
    }, [decision.userId]);

    if (!decision.mountShell) return children || <Outlet />;

    // Rollout switch (§49). Default OFF, so every current user keeps the legacy
    // candidate chrome that passed the pre-flight gates. The Cuba candidate
    // shell is lazy-loaded, so a user who never opts in never downloads it.
    if (cubaShell) {
        return (
            <div data-testid="application-shell" data-shell-variant="cuba">
                {/* The candidate shell is a lazy chunk; this boundary keeps the
                    opt-in path from ever showing a blank frame. */}
                <Suspense fallback={<div className="min-h-screen bg-cuba-canvas" aria-busy="true" />}>
                    <CubaCandidateShell>{children || <Outlet />}</CubaCandidateShell>
                </Suspense>
            </div>
        );
    }

    return (
        <div className="dashboardWrapper" data-testid="application-shell" data-shell-variant="legacy" style={{ overflowX: 'clip' }}>
            <ProfileDisplay
                user={decision.userId}
                profile={profile}
                image={profile}
                sidebarCollapsed={sidebarCollapsed}
                onSidebarToggle={setSidebarCollapsed}
            />
            <div className={`dashboardContentWrapper ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} tabIndex={-1} data-testid="application-shell-content">
                {children || <Outlet />}
            </div>
        </div>
    );
};

export default AuthenticatedAppShell;
