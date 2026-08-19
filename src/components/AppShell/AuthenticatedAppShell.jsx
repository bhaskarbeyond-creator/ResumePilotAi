import React, { useContext, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthContext } from '../../main';
import ProfileDisplay from '../Dashboard/ProfileDisplay/ProfileDisplay';
import { getFullName } from '../../firestore/dbOperations';
import { resolveApplicationShell } from './applicationShell';

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

    return (
        <div className="dashboardWrapper" data-testid="application-shell" style={{ overflow: 'hidden' }}>
            <ProfileDisplay
                user={decision.userId}
                profile={profile}
                image={profile}
                sidebarCollapsed={sidebarCollapsed}
                onSidebarToggle={setSidebarCollapsed}
            />
            <div className={`dashboardContentWrapper ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} data-testid="application-shell-content">
                {children || <Outlet />}
            </div>
        </div>
    );
};

export default AuthenticatedAppShell;
