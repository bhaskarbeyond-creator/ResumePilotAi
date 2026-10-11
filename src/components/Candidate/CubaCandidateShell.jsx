import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    FiGrid, FiFileText, FiSearch, FiList, FiMessageSquare, FiAward,
    FiSettings, FiUser, FiShield, FiLifeBuoy, FiClipboard, FiBell, FiStar,
} from 'react-icons/fi';
import CubaAppShell from '../cuba/CubaAppShell';
import { ACCOUNT_PORTALS, accountLinksFor } from '../cuba/accountLinks';
// DIR-074: clean identity parsing (strips a parenthetical role from the name).
import { parseUserIdentity } from '../cuba/userIdentity';
import AiEngineStatus from '../cuba/AiEngineStatus';
import AiCareerBriefing from './AiCareerBriefing';
import CubaCandidateHero from './CubaCandidateHero';
// DIR-022 / AC-4: the renewal-recovery banner. It reads the candidate's own
// server-authoritative profile, so the deadline it shows is the same value
// `isMembershipActive` used to decide access — the banner and the entitlement
// gate can never disagree.
import PaymentGraceBanner from './PaymentGraceBanner';
import { getCurrentUserProfile } from '../../services/api/users';
import { resolveActiveItem } from './navigationState';
// DIR-055 S5: the FIRST production consumer of this predicate. It was authored
// for exactly this fix and until now was referenced only by its own test.
import { isApplicationShellRoute } from '../AppShell/applicationShell';
import { CANDIDATE_NAVIGATION } from '../cuba/candidateNavigation';
// DIR-073: live entity search (resumes / portfolios / cover letters) for ⌘K.
import { searchCandidateEntities } from './command/candidateEntitySearch';
// DIR-077: the executive right-rail intelligence column.
import CandidateExecutiveRail from './CandidateExecutiveRail';
import { useUnreadMessages } from '../../hooks/useUnreadMessages';
import { resolveMessagesVisibility } from '../../utils/moduleFlags';
import { getSystemSettings } from '../../services/api/platform';
import { useAiEngineStatus } from '../../hooks/useAiEngineStatus';
import { AuthContext } from '../../context/AuthContext';
import { generateUserAiContent } from '../../services/aiService';
import { COPILOT_PORTALS } from '../cuba/copilotActions';
import { buildCopilotPayload } from '../cuba/copilotPrompt';
import fire from '../../conf/fire';
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
    // DIR-073: the notifications workspace (DIR-072) and saved favourites are
    // real navigation targets, so they get authentic icons instead of the grid
    // fallback the palette previously rendered for every row.
    notifications: FiBell,
    favorites: FiStar,
};

export const buildCommands = (groups, navigate) =>
    groups.flatMap((group) => group.items.map((item) => ({
        id: item.id,
        label: item.label,
        group: group.label,
        // DIR-073: carry the item's authentic Cuba icon onto the command so the
        // palette can render it. This field was previously dropped, so every
        // navigation row rendered with no icon even though the shell already
        // resolves one (ICONS[item.id] || FiGrid) for the sidebar.
        icon: item.icon || null,
        keywords: `${item.label} ${item.to}`,
        run: () => navigate(item.to),
    })));

/**
 * DIR-021: projects a REAL saved resume into the grounding fields the copilot
 * operations read.
 *
 * Pure and framework-free so it can be asserted in Node. It performs NO
 * defaulting: a field the resume does not contain becomes '' or [], never a
 * plausible-looking placeholder, so `buildCopilotPayload` can correctly report
 * the context as missing and the palette can fail closed.
 */
export function buildCopilotContext(resume) {
    if (!resume || typeof resume !== 'object') return null;
    const source = (resume.data && typeof resume.data === 'object') ? resume.data : resume;

    const skills = Array.isArray(source.skills)
        ? source.skills
            .map((entry) => (typeof entry === 'string' ? entry : entry?.skillName || entry?.name || entry?.skill || ''))
            .filter((value) => typeof value === 'string' && value.trim())
        : [];

    const roles = Array.isArray(source.employments)
        ? source.employments
        : (Array.isArray(source.workExperiences) ? source.workExperiences : []);

    return {
        targetRole: String(source.targetRole || source.targetTitle || source.occupation || '').trim(),
        experience: String(source.summary || source.experience || '').trim(),
        existingSummary: String(source.summary || '').trim(),
        workHistory: roles
            .map((role) => {
                const title = role?.title || role?.jobTitle || role?.position || '';
                const employer = role?.employer || role?.company || '';
                return title && employer ? `${title} at ${employer}` : (title || employer);
            })
            .filter(Boolean)
            .join('; '),
        education: (Array.isArray(source.educations) ? source.educations : [])
            .map((entry) => {
                const degree = entry?.degree || entry?.qualification || '';
                const school = entry?.school || entry?.institution || entry?.university || '';
                return degree && school ? `${degree} from ${school}` : (degree || school);
            })
            .filter(Boolean)
            .join('; '),
        skills,
        existingSkills: skills,
    };
}

const CubaCandidateShell = ({ children, copilotResume = null }) => {
    const user = useContext(AuthContext);
    const routerNavigate = useNavigate();
    const navigate = useCallback((target) => {
        const to = typeof target === 'string' ? target : (target?.href || target?.to);
        if (!to) return;
        if (/^(https?:)?\/\//i.test(String(to)) || String(to).startsWith('mailto:')) {
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

    // DIR-026 / AC-3: the Messages & Chat navigation entry is gated on the
    // administrator's authoritative module flag. `undefined` means "not yet
    // resolved" and is deliberately treated as visible-not-yet-known rather than
    // hidden, so the nav does not flicker on every page load; `resolveMessagesVisibility`
    // itself still fails closed on any fallback/stale settings payload.
    const [messagesNavAllowed, setMessagesNavAllowed] = useState(undefined);
    useEffect(() => {
        let cancelled = false;
        getSystemSettings()
            .then((settings) => { if (!cancelled) setMessagesNavAllowed(resolveMessagesVisibility(settings) === true); })
            .catch(() => { if (!cancelled) setMessagesNavAllowed(false); });
        return () => { cancelled = true; };
    }, []);

    // DIR-026 / AC-2: one live unread total for the whole shell. `CubaAppShell`
    // already renders `item.badge`, so the nav gains a real count with no shell
    // rewrite (see CubaAppShell.jsx:82-91).
    const { unreadCount: unreadMessages, status: unreadStatus } = useUnreadMessages();

    // A failed read must never render as "0 unread / all clear" — that would be
    // a fabricated claim about the user's own inbox. '!' means "status unknown".
    const messagesBadge = unreadStatus === 'error'
        ? '!'
        : unreadMessages > 0
            ? (unreadMessages > 99 ? '99+' : String(unreadMessages))
            : null;

    const groups = useMemo(() => CANDIDATE_NAVIGATION.map((group) => ({
        ...group,
        items: group.items
            .filter((item) => item.id !== 'messages' || messagesNavAllowed !== false)
            .map((item) => ({
                ...item,
                icon: ICONS[item.id] || FiGrid,
                href: item.to,
                active: activeItem?.id === item.id,
                // The pill renders nothing at 0, so a normal shell pays no cost.
                ...(item.id === 'messages' && messagesBadge ? { badge: messagesBadge } : {}),
            })),
    })), [activeItem, messagesNavAllowed, messagesBadge]);

    const commands = useMemo(() => buildCommands(groups, navigate), [groups, navigate]);

    /**
     * DIR-073: candidate entity search for the command palette. Mirrors the
     * contract `CubaPortalShell` already uses — the provider returns
     * palette-shaped hits ({ id, label, group, to, icon }) and this shell maps
     * them to router-aware `run` handlers. Only REAL saved records are returned;
     * a lookup failure degrades to no hits, never to invented documents.
     */
    const entitySearch = useMemo(() => async (term) => {
        const hits = await searchCandidateEntities(term);
        return hits.map((hit) => ({ ...hit, run: () => navigate(hit.to) }));
    }, [navigate]);

    const displayName = useMemo(() => {
        const raw = String(user?.displayName || user?.email || '').trim();
        if (!raw || raw === 'null null' || raw === 'undefined undefined') return 'Candidate';
        return raw.split(' ')[0];
    }, [user]);

    /**
     * DIR-011: the header identity must be the REAL authenticated account.
     *
     * Previously this shell passed `user={{ name: displayName }}` — a first name
     * and nothing else — so the account menu had no email and no role to show.
     * These fields are read straight off the session object AuthContext already
     * publishes (`displayName`, `email`, `role`, `customClaims`); nothing is
     * synthesised, and a field the session does not carry is simply omitted so the
     * menu renders nothing rather than a placeholder.
     */
    const headerUser = useMemo(() => {
        const fullName = String(user?.displayName || '').trim();
        const email = String(user?.email || '').trim();
        // Prefer an explicit role claim over the coarse account kind, because it
        // is the value the server actually authorises on.
        const claimRole = String(
            user?.role
            || user?.customClaims?.role
            || user?.customClaims?.accountType
            || '',
        ).trim();

        // DIR-074: clean a parenthetical role out of the display name so the
        // account menu never renders 'Name (Role)'. The explicit claim stays
        // authoritative for the role; the parenthetical is only a fallback.
        const identity = parseUserIdentity({ name: fullName, email, role: claimRole });
        const name = identity.name;
        const role = claimRole || identity.role;

        if (!name && !email) return null;
        // DIR-025: resolved from the shared `accountLinks` table rather than
        // re-spelled here, so the candidate targets can never drift from the
        // table the crawler and the unit tests assert against.
        const account = accountLinksFor(ACCOUNT_PORTALS.CANDIDATE);
        return {
            name: name || displayName,
            email,
            role,
            profileHref: account.profile,
            settingsHref: account.settings,
            securityHref: account.security,
        };
    }, [user, displayName]);

    /**
     * DIR-021: real grounding context for the copilot payloads.
     *
     * The resume is loaded LAZILY, and only the first time a copilot action
     * actually needs it. Two reasons this is not done eagerly in an effect:
     *   - the dashboard already fetches `/api/resumes` several times during its
     *     own hydration, and a chrome component adding an unconditional fourth
     *     request would be a real performance regression on the default page;
     *   - most sessions never open the copilot, so most sessions should never
     *     pay for it.
     *
     * Only fields the candidate has actually saved are forwarded. Nothing is
     * defaulted to a placeholder: when the resume is absent or genuinely empty
     * the copilot fails closed with a clear message instead of asking a provider
     * to invent a career history.
     */
    const copilotContextRef = useRef(null);

    const loadCopilotContext = useCallback(async () => {
        // Supplied by the caller (the route already holding the saved resume).
        if (copilotResume && typeof copilotResume === 'object') {
            return buildCopilotContext(copilotResume);
        }
        if (copilotContextRef.current) return copilotContextRef.current;
        try {
            const { getResumeById } = await import('../../services/api/platform.js');
            const { getResumes } = await import('../../services/api/resumes.js');
            // Prefer the resume the candidate is actually working in; fall back
            // to the most recently updated one. Both are REAL server records.
            const currentId = (() => {
                try { return localStorage.getItem('currentResumeId'); } catch { return null; }
            })();
            let resume = null;
            if (currentId) {
                resume = await getResumeById(currentId).catch(() => null);
            }
            if (!resume) {
                const list = await getResumes().catch(() => []);
                const candidates = Array.isArray(list) ? list : [];
                const latest = candidates
                    .slice()
                    .sort((a, b) => String(b?.updatedAt || b?.updated_at || '').localeCompare(String(a?.updatedAt || a?.updated_at || '')));
                resume = latest[0]?.data || latest[0] || null;
            }
            const context = resume ? buildCopilotContext(resume) : null;
            copilotContextRef.current = context;
            return context;
        } catch {
            // A resume outage must degrade to "no context", never to a crash and
            // never to invented data.
            return null;
        }
    }, [copilotResume]);

    /**
     * The dispatcher the palette calls.
     *
     * It owns the whole grounding decision, because it is the only layer that
     * holds the candidate's real resume facts:
     *   1. resolve the REAL context (lazily, once per session);
     *   2. build the operation's payload from that context ONLY;
     *   3. fail CLOSED with a specific, actionable message when the context this
     *      operation genuinely requires is absent — never send a half-empty
     *      request and never invent a value to fill the hole;
     *   4. otherwise reach the AI runtime through the authenticated wrapper.
     *
     * INV-2: `generateUserAiContent` is the same authenticated, same-origin
     * wrapper every other AI surface uses, so the prompt travels only in the
     * POST body — never a URL query, storage key or third-party endpoint.
     * INV-3: quota is not reimplemented here; the server counts against this
     * authenticated user's MariaDB daily allowance and answers 429
     * `AI_DAILY_QUOTA_EXCEEDED`, which propagates untouched to the palette.
     */
    const copilotDispatch = useCallback(async (operation, { prompt } = {}) => {
        const context = (await loadCopilotContext()) || {};
        const { payload, missing } = buildCopilotPayload(operation, { ...context, prompt });
        if (missing.length) {
            const error = new Error(
                `Add ${missing.join(' and ')} to your resume first, then run this again.`,
            );
            error.code = 'COPILOT_CONTEXT_REQUIRED';
            throw error;
        }
        return generateUserAiContent(operation, payload);
    }, [loadCopilotContext]);

    /** Sign-out is delegated to the existing Firebase session, never re-implemented. */
    const signOut = useCallback(async () => {
        try {
            await fire.auth().signOut();
        } catch (error) {
            // Surface the real failure rather than pretending the user signed out;
            // a false "signed out" is worse than a visible error.
            console.error('Sign out failed', error);
            return;
        }
        navigate('/');
    }, [navigate]);

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

    /**
     * DIR-022 / AC-4: load the candidate's own billing entitlement ONCE per
     * mount, lazily, and only to decide whether the recovery banner is needed.
     *
     * Why not on every render: this is chrome, and the dashboard already fetches
     * profile data during its own hydration.
     * Why a silent failure: if this read fails we show NO banner. Warning a
     * customer that their renewal failed when the platform could not actually
     * confirm that would be a fabricated claim about someone's money.
     */
    const [entitlementProfile, setEntitlementProfile] = useState(null);

    useEffect(() => {
        let mounted = true;
        getCurrentUserProfile()
            .then((profile) => {
                if (mounted) setEntitlementProfile(profile || null);
            })
            .catch(() => {
                // Fail silent: absence of evidence is not evidence of a problem.
                if (mounted) setEntitlementProfile(null);
            });
        return () => { mounted = false; };
    }, []);

    const isOverview = location.pathname === '/dashboard' || location.pathname === '/dashboard/';

    return (
        <CubaAppShell
            navigation={groups}
            navigationLabel="Candidate workspace navigation"
            onNavigate={navigate}
            breadcrumbs={[
                { label: 'Candidate Workspace' },
                { label: activeItem?.label || 'Overview' },
            ]}
            theme={theme}
            onToggleTheme={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
            aiStatus={aiStatus}
            commands={commands}
            // DIR-073: live entity search for resumes / portfolios / cover letters.
            commandSearchProvider={entitySearch}
            user={headerUser}
            onSignOut={signOut}
            // DIR-021: the candidate copilot. The dispatcher resolves this
            // candidate's REAL saved resume lazily and fails closed when the
            // grounding an operation needs is genuinely absent.
            copilotPortal={COPILOT_PORTALS.CANDIDATE}
            copilotDispatch={copilotDispatch}
            // DIR-055 S5: on an application-shell route (the resume builder) that
            // surface renders its own full-featured header, so this shell skips
            // ONLY its top bar — sidebar, drawer, tab bar and palette all stay.
            hideTopBar={isApplicationShellRoute(location.pathname)}
            // DIR-026 / AC-2: the candidate shell owns the real destination.
            messagesHref="/dashboard/messages"
            // DIR-084: the candidate suite is the portal that adopts the SINGLE-VIEWPORT
            // lock, so its pages can never grow the document.
            viewportLock
        >
            <div className={isOverview ? 'space-y-2.5' : 'space-y-4 md:space-y-5'}>
                {/* DIR-022 / AC-4: renewal recovery. Renders only when the
                    server reports PAST_DUE with a live grace deadline. */}
                <PaymentGraceBanner profile={entitlementProfile} />
                {isOverview ? (
                    /* DIR-084 SINGLE-VIEWPORT OVERVIEW.
                       The grid is bounded to exactly one viewport minus the shell header and
                       the chrome above it, so the Hero, the four Stat Cards, the AI Briefing
                       and the Executive Rail are all visible together on a 1080p/1440p screen
                       with ZERO document scrollbar. The split lands at 2xl (1536px), which is
                       inside both target resolutions; narrower laptops keep the natural flow
                       instead of being squashed into a fixed height. The fold-critical blocks
                       are flex-none and only the Document Gallery / Onboarding region and the
                       rail scroll internally. */
                    <div className="grid min-h-0 grid-cols-1 gap-3 2xl:h-[calc(100dvh-var(--cuba-header-h)-3.75rem)] 2xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
                        <div className="flex min-h-0 min-w-0 flex-col gap-3">
                            <CubaCandidateHero displayName={displayName} />
                            <AiCareerBriefing />
                            <div className="min-h-0 flex-1 2xl:overflow-y-auto cuba-scrollbar [scrollbar-gutter:stable]">
                                {children}
                            </div>
                        </div>
                        <aside className="min-h-0 min-w-0 2xl:overflow-y-auto cuba-scrollbar [scrollbar-gutter:stable]" aria-label="Executive intelligence rail">
                            <CandidateExecutiveRail onNavigate={navigate} />
                        </aside>
                    </div>
                ) : (
                    children
                )}
            </div>
        </CubaAppShell>
    );
};

export { AiEngineStatus };
export default CubaCandidateShell;
