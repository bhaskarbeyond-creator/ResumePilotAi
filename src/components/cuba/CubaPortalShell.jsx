import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    FiGrid, FiBriefcase, FiUsers, FiMessageSquare, FiHome, FiSettings,
    FiActivity, FiHeart, FiCpu, FiSliders, FiAlertTriangle, FiFileText,
    FiShield, FiHelpCircle, FiUserCheck, FiSend, FiCheckSquare, FiLayers,
    FiDatabase, FiEdit3, FiLayout, FiStar, FiAward, FiGlobe, FiZap,
    FiLock, FiBarChart2, FiMail
} from 'react-icons/fi';
import CubaAppShell from './CubaAppShell';
import { useAiEngineStatus } from '../../hooks/useAiEngineStatus';
import { resolveActiveItem } from '../Candidate/navigationState';
import { buildPortalCommands } from './portalCommands';

/**
 * Modern icon map for recruiter, enterprise, and platform admin navigation items.
 */
const ICON_MAP = {
    // Recruiter / Employer
    'employer-overview': FiGrid,
    'employer-jobs': FiBriefcase,
    'employer-applicants': FiUsers,
    'employer-messages': FiMessageSquare,
    'employer-company': FiHome,
    'employer-settings': FiSettings,

    // Platform Admin
    'admin-dashboard': FiActivity,
    'admin-health': FiHeart,
    'admin-queues': FiCpu,
    'admin-operations': FiSliders,
    'admin-attention': FiAlertTriangle,
    'admin-audit-logs': FiFileText,
    'admin-security': FiShield,
    'admin-help-desk': FiHelpCircle,
    'admin-users': FiUsers,
    'admin-operators': FiUserCheck,
    'admin-messages': FiSend,
    'admin-employer-applications': FiCheckSquare,
    'admin-jobs-manager': FiBriefcase,
    'admin-company-management': FiLayers,
    'admin-tenants': FiDatabase,
    'admin-blog-management': FiEdit3,
    'admin-landing-pages': FiLayout,
    'admin-reviews': FiStar,
    'admin-trustedby': FiAward,
    'admin-phrases': FiGlobe,
    'admin-settings': FiSettings,

    // Enterprise / Organization
    overview: FiActivity,
    resumes: FiFileText,
    members: FiUsers,
    teams: FiUsers,
    workspaces: FiSliders,
    access: FiShield,
    ai: FiZap,
    security: FiLock,
    usage: FiBarChart2,
    email: FiMail,
    audit: FiFileText,
    support: FiHelpCircle,
    settings: FiSettings,
};

/**
 * CubaPortalShell — the shared chrome for the recruiter, organization and admin
 * consoles (Phases 5–7).
 */
const CubaPortalShell = ({
    persona,
    navigation,
    navigationLabel,
    user,
    title,
    toolbar = null,
    children,
}) => {
    const location = useLocation();
    const routerNavigate = useNavigate();
    const aiStatus = useAiEngineStatus();
    const [theme, setTheme] = useState(() => {
        try {
            const saved = localStorage.getItem('cuba_theme') || localStorage.getItem('theme');
            if (saved === 'dark' || saved === 'light') return saved;
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        } catch (_) {
            return 'light';
        }
    });

    const defaultNavLabel = useMemo(() => {
        if (navigationLabel) return navigationLabel;
        if (/recruiter|hiring|employer/i.test(persona || '')) return 'Employer navigation';
        if (/admin/i.test(persona || '')) return 'Platform admin navigation';
        if (/enterprise|organization/i.test(persona || '')) return 'Organization navigation';
        return 'Portal navigation';
    }, [navigationLabel, persona]);

    const groups = useMemo(() => navigation || [], [navigation]);

    const active = useMemo(
        () => resolveActiveItem(location.pathname, groups),
        [location.pathname, groups],
    );

    const decoratedGroups = useMemo(() => groups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({
            ...item,
            icon: item.icon || ICON_MAP[item.id] || FiGrid,
            href: item.href || item.to,
            active: active?.id === item.id,
        })),
    })), [groups, active]);

    // Commands are generated from the SAME navigation the sidebar renders, so a
    // palette entry can never point somewhere the sidebar does not (§25).
    //
    // The `run` handlers use react-router navigation exclusively (no full page
    // reload): the shell is mounted inside a <Router>, so internal targets stay
    // client-side. Anything that looks external is still assigned directly.
    const commands = useMemo(
        () => buildPortalCommands(groups, active?.label).map((command) => {
            const target = command.to || command.href;
            return {
                ...command,
                run: target ? () => {
                    if (/^(https?:)?\/\//i.test(String(target)) || String(target).startsWith('mailto:')) {
                        window.location.assign(target);
                    } else {
                        routerNavigate(target);
                    }
                } : undefined,
            };
        }),
        [groups, active, routerNavigate],
    );

    const navigate = useCallback((target) => {
        const to = typeof target === 'string' ? target : (target?.href || target?.to);
        if (!to) return;
        if (/^(https?:)?\/\//i.test(String(to)) || String(to).startsWith('mailto:')) {
            window.location.assign(to);
            return;
        }
        routerNavigate(to);
    }, [routerNavigate]);

    const onToggleTheme = useCallback(
        () => setTheme((value) => (value === 'dark' ? 'light' : 'dark')),
        [],
    );

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        try {
            localStorage.setItem('cuba_theme', theme);
        } catch (_) {}
    }, [theme]);

    return (
        <CubaAppShell
            navigation={decoratedGroups}
            navigationLabel={defaultNavLabel}
            onNavigate={navigate}
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
            <div className="cuba-portal-stage flex-1 min-w-0">
                {children}
            </div>
        </CubaAppShell>
    );
};

export default CubaPortalShell;
