import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronDown, FiGrid, FiBriefcase, FiLayers, FiShield, FiCheck } from 'react-icons/fi';
import { AuthContext } from '../../context/AuthContext';
import { checkIfAdmin } from '../../services/api/platform';
import { enterpriseFetch } from '../../enterprise/enterpriseApi';
import { signOutUser } from '../../utils/signOut';

export const ACTIVE_PORTAL_STORAGE_KEY = 'ime365_active_portal';

export const PORTALS = Object.freeze({
    CANDIDATE: 'candidate',
    RECRUITER: 'recruiter',
    ORGANIZATION: 'organization',
    ADMIN: 'admin',
});

export const PORTAL_META = {
    [PORTALS.CANDIDATE]: { id: PORTALS.CANDIDATE, label: 'Candidate Dashboard', path: '/dashboard', icon: FiGrid },
    [PORTALS.RECRUITER]: { id: PORTALS.RECRUITER, label: 'Recruiter & Hiring Portal', path: '/employer', icon: FiBriefcase },
    [PORTALS.ORGANIZATION]: { id: PORTALS.ORGANIZATION, label: 'Organization Workspace', path: '/org', icon: FiLayers },
    [PORTALS.ADMIN]: { id: PORTALS.ADMIN, label: 'Platform Admin Console', path: '/admin', icon: FiShield },
};

export const isKnownPortal = (value) => Object.prototype.hasOwnProperty.call(PORTAL_META, String(value || ''));

const readStoredPortal = () => {
    try {
        const raw = localStorage.getItem(ACTIVE_PORTAL_STORAGE_KEY);
        return isKnownPortal(raw) ? raw : null;
    } catch { return null; }
};

const writeStoredPortal = (portal) => {
    try {
        if (portal) localStorage.setItem(ACTIVE_PORTAL_STORAGE_KEY, portal);
        else localStorage.removeItem(ACTIVE_PORTAL_STORAGE_KEY);
    } catch { /* preference storage is optional and never authorization */ }
};

/**
 * Resolve the set of portals the signed-in principal may actually enter.
 *
 * Candidate and recruiter surfaces are available to any authenticated account.
 * The organization workspace is only offered when the server reports an enabled
 * tenancy service, and the admin console is only offered when the ID token
 * actually carries a platform role. A stale or hand-edited localStorage value
 * can therefore never surface a portal the server would refuse.
 */
export function usePortalAvailability() {
    const user = useContext(AuthContext);
    const [availability, setAvailability] = useState({
        loading: true,
        isAuthenticated: false,
        isAdmin: false,
        enterpriseEnabled: false,
        hasTenant: false,
        tenantSlug: '',
    });

    const resolve = useCallback(async () => {
        if (!user?.getIdTokenResult) {
            setAvailability({ loading: false, isAuthenticated: false, isAdmin: false, enterpriseEnabled: false, hasTenant: false, tenantSlug: '' });
            return;
        }
        let isAdmin = false;
        try {
            const result = await user.getIdTokenResult();
            const role = String(result?.claims?.role || '').toUpperCase();
            isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(role);
        } catch { isAdmin = false; }

        // checkIfAdmin is the existing server-backed admin check; it is a second,
        // independent signal rather than a second role assumption.
        let serverIsAdmin = false;
        try { serverIsAdmin = Boolean(await checkIfAdmin(user.uid)); } catch { serverIsAdmin = false; }

        let enterpriseEnabled = false;
        let hasTenant = false;
        let tenantSlug = '';
        try {
            const status = await enterpriseFetch('/api/enterprise/status');
            enterpriseEnabled = status?.enabled === true;
        } catch { enterpriseEnabled = false; }

        if (enterpriseEnabled) {
            try {
                const context = await enterpriseFetch('/api/enterprise/context', { method: 'POST', body: { tenantId: '', workspaceId: '' } });
                hasTenant = Boolean(context?.tenant);
                tenantSlug = String(context?.tenant?.slug || '');
            } catch { hasTenant = false; }
        }

        setAvailability({ loading: false, isAuthenticated: true, isAdmin: isAdmin || serverIsAdmin, enterpriseEnabled, hasTenant, tenantSlug });
    }, [user]);

    useEffect(() => {
        let active = true;
        setAvailability(prev => ({ ...prev, loading: true }));
        resolve().catch(() => {
            if (active) setAvailability(prev => ({ ...prev, loading: false, isAdmin: false, enterpriseEnabled: false, hasTenant: false }));
        });
        return () => { active = false; };
    }, [resolve]);

    const allowed = useMemo(() => {
        if (!availability.isAuthenticated) return [];
        const portals = [PORTALS.CANDIDATE, PORTALS.RECRUITER];
        if (availability.enterpriseEnabled) portals.push(PORTALS.ORGANIZATION);
        if (availability.isAdmin) portals.push(PORTALS.ADMIN);
        return portals;
    }, [availability]);

    return { ...availability, allowed };
}

const portalPath = (portalId, availability) => {
    const meta = PORTAL_META[portalId];
    if (!meta) return '/dashboard';
    if (portalId === PORTALS.ORGANIZATION && availability.tenantSlug) {
        return `/org/${encodeURIComponent(availability.tenantSlug)}`;
    }
    return meta.path;
};


/**
 * Global persona / workspace switcher.
 *
 * A single component is shared by the candidate sidebar, the employer header,
 * the admin header, and the enterprise shell, so the platform never ships two
 * competing context switchers. Selection is persisted for convenience only;
 * every switch re-validates against server-derived availability before
 * navigating, so a stale, invalid, or revoked stored value degrades to a safe
 * default instead of granting access.
 */
const ContextSwitcher = ({ variant = 'sidebar', onNavigate, className = '' }) => {
    const navigate = useNavigate();
    const { loading, allowed, ...availability } = usePortalAvailability();
    const [open, setOpen] = useState(false);
    const [activePortal, setActivePortal] = useState(() => readStoredPortal());
    const containerRef = useRef(null);
    const buttonRef = useRef(null);

    // Reconcile the persisted selection against what the server actually allows.
    // A logged-out user, a revoked admin role, a disabled tenancy service, or a
    // deleted tenant all fall back to the candidate portal.
    useEffect(() => {
        if (loading) return;
        if (allowed.length === 0) {
            if (activePortal !== null) { setActivePortal(null); writeStoredPortal(null); }
            return;
        }
        if (!activePortal || !allowed.includes(activePortal)) {
            const fallback = allowed.includes(PORTALS.CANDIDATE) ? PORTALS.CANDIDATE : allowed[0];
            setActivePortal(fallback);
            writeStoredPortal(fallback);
        }
    }, [loading, allowed, activePortal]);

    // Close on outside click and on Escape; restore focus to the trigger.
    useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setOpen(false);
                buttonRef.current?.focus();
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const selectPortal = useCallback((portalId) => {
        if (!allowed.includes(portalId)) return;
        setActivePortal(portalId);
        writeStoredPortal(portalId);
        setOpen(false);
        onNavigate?.();
        navigate(portalPath(portalId, availability));
    }, [allowed, availability, navigate, onNavigate]);

    if (loading) return null;
    // A single available portal needs no switcher, and showing an empty control
    // in the signed-out state would be misleading chrome.
    if (allowed.length < 2) return null;

    const currentMeta = PORTAL_META[activePortal] || PORTAL_META[allowed[0]];
    const CurrentIcon = currentMeta.icon;

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen(prev => !prev)}
                aria-haspopup="menu"
                aria-expanded={open}
                data-testid="context-switcher-trigger"
                className={`flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${variant === 'header' ? 'px-2.5 py-1.5 text-xs font-bold' : 'px-3 py-2.5 text-xs font-bold'}`}
            >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <CurrentIcon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-left">{currentMeta.label}</span>
                <FiChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>

            {open && (
                <div
                    role="menu"
                    aria-label="Switch workspace"
                    data-testid="context-switcher-menu"
                    className={`absolute z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ${variant === 'header' ? 'right-0' : 'left-0'}`}
                >
                    <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                        Switch workspace
                    </p>
                    <ul className="p-1.5">
                        {allowed.map((portalId) => {
                            const meta = PORTAL_META[portalId];
                            const Icon = meta.icon;
                            const selected = portalId === currentMeta.id;
                            return (
                                <li key={portalId} role="none">
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => selectPortal(portalId)}
                                        aria-current={selected ? 'true' : undefined}
                                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors ${selected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}
                                    >
                                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                            <Icon className="h-4 w-4" aria-hidden="true" />
                                        </span>
                                        <span className="min-w-0 flex-1 truncate">{meta.label}</span>
                                        {selected && <FiCheck className="h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden="true" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="border-t border-slate-100 px-3 py-2">
                        <button
                            type="button"
                            onClick={async () => {
                                setOpen(false);
                                writeStoredPortal(null);
                                setActivePortal(null);
                                await signOutUser();
                                navigate('/');
                            }}
                            className="text-[11px] font-bold text-rose-600 transition-colors hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                        >
                            Sign out of all workspaces
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ContextSwitcher;
