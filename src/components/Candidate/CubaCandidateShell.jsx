import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    FiGrid, FiFileText, FiSearch, FiList, FiMessageSquare, FiAward,
    FiSettings, FiUser, FiShield, FiLifeBuoy, FiClipboard,
} from 'react-icons/fi';
import CubaAppShell from '../cuba/CubaAppShell';
import AiEngineStatus from '../cuba/AiEngineStatus';
import AiCareerBriefing from './AiCareerBriefing';
import CubaCandidateHero from './CubaCandidateHero';
import { resolveActiveItem } from './navigationState';
import { CANDIDATE_NAVIGATION } from '../cuba/candidateNavigation';
import { useAiEngineStatus } from '../../hooks/useAiEngineStatus';
import { AuthContext } from '../../context/AuthContext';
import logo from '../../assets/logo/logo.png';

/**
 * CubaCandidateShell â€” the Phase 4 candidate workspace chrome.
 *
 * CRITICAL SCOPE LIMIT, stated up front:
 *   This is a NEW, opt-in shell. It does NOT replace the existing
 *   `AuthenticatedAppShell` + `ProfileDisplay` candidate chrome, which remains the
 *   default and continues to serve every current user. That is deliberate
 *   (Â§47 feature preservation, Â§49 rollout safety): the legacy candidate shell
 *   carries a large amount of proven behaviour â€” module flags, notification
 *   badges, unread counters, persona switching, employer gating â€” and replacing it
 *   wholesale in one step would risk regressing real product behaviour.
 *
 *   The flag `ime365_cuba_shell_v2` selects between them. Default OFF (legacy).
 *   Rollback is a single localStorage write â€” no rebuild, no redeploy.
 *
 * Authorization is untouched: this component receives an already-authenticated
 * user from `AuthContext` and performs no permission checks of its own. RBAC
 * stays entirely server-authoritative (Â§7).
 */

const ICONS = {
    overview: FiGrid,
    resumes: FiFileText,
    'cover-letters': FiFileText,
    portfolios: FiGrid,
    jobs: FiSearch,
    tracker: FiList,
    applied: FiClipboard,
    interview: FiAward,
    messages: FiMessageSquare,
    plans: FiSettings,
    profile: FiUser,
    security: FiShield,
    support: FiLifeBuoy,
};

export const buildCommands = (groups, navigate) =>
    groups.flatMap((group) => group.items.map((item) => ({
        id: item.id,
        label: item.label,
        group: group.label,
        keywords: `${item.label} ${item.to}`,
        run: () => navigate(item.to),
    })));

const CubaCandidateShell = ({ children }) => {
    const user = useContext(AuthContext);
    const routerNavigate = useNavigate();
    const navigate = useCallback((to) => {
        if (/^(https?:)?\/\//i.test(String(to)) || String(to || '').startsWith('mailto:')) {
            window.location.assign(to);
            return;
        }
        routerNavigate(to);
    }, [routerNavigate]);
    const location = useLocation();
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

    const activeItem = useMemo(
        () => resolveActiveItem(location.pathname, CANDIDATE_NAVIGATION),
        [location.pathname]
    );

    const groups = useMemo(() => CANDIDATE_NAVIGATION.map((group) => ({
        ...group,
        items: group.items.map((item) => ({
            ...item,
            icon: ICONS[item.id] || FiGrid,
            href: item.to,
            active: activeItem?.id === item.id,
        })),
    })), [activeItem]);

    const commands = useMemo(() => buildCommands(groups, navigate), [groups, navigate]);

    const displayName = useMemo(() => {
        const raw = String(user?.displayName || user?.email || '').trim();
        if (!raw || raw === 'null null' || raw === 'undefined undefined') return 'Candidate';
        return raw.split(' ')[0];
    }, [user]);

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

    useEffect(() => {
        // The showcase owns its own toggle; keep them consistent.
        const onChange = (event) => {
            const next = event?.detail?.value;
            if (next === 'cuba' || next === 'legacy') {
                window.location.reload();
            }
        };
        window.addEventListener('cubaShellFlagChanged', onChange);
        return () => window.removeEventListener('cubaShellFlagChanged', onChange);
    }, []);

    return (
        <CubaAppShell
            navigation={groups}
            navigationLabel="Candidate workspace navigation"
            onNavigate={navigate}
            breadcrumb={<>Candidate Workspace <span aria-hidden="true">/</span> {activeItem?.label || 'Overview'}</>}
            theme={theme}
            onToggleTheme={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
            aiStatus={aiStatus}
            commands={commands}
            user={{ name: displayName }}
        >
            <div className="space-y-6">
                {(location.pathname === '/dashboard' || location.pathname === '/dashboard/') && (
                    <>
                        <CubaCandidateHero displayName={displayName} />
                        <AiCareerBriefing />
                    </>
                )}
                {children}
            </div>
        </CubaAppShell>
    );
};

export { AiEngineStatus };
export default CubaCandidateShell;
