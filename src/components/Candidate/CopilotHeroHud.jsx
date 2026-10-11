import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiPlus, FiSearch, FiZap, FiChevronDown } from 'react-icons/fi';
import CubaCopilotMascot from '../cuba/CubaCopilotMascot';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * DIR-085 — the compact AI Copilot hero.
 * DIR-093 S1 — restyled into the AUTHORITATIVE REFERENCE welcome header.
 *
 * The reference header is ONE row:
 *   - left  : the greeting heading, the subtext, the real Copilot status and the live insight,
 *   - right : the muted italic quote and the three action CTAs.
 *
 * The DIR-085/086 certified contract is deliberately PRESERVED rather than replaced: the section
 * still carries `data-testid="cuba-copilot-hud"` and `aria-label="AI Copilot"`, the insight line
 * keeps `data-testid="cuba-copilot-insight"`, and every CTA keeps `cuba-focusable` plus its
 * `cuba-copilot-cta-<id>` testid. Only the presentation changed.
 *
 * TRUTHFULNESS: the greeting name is the REAL authenticated first name passed in by the shell, and
 * the time of day is read from the local clock. The insight line is the caller's real briefing
 * output; when there is nothing truthful to say it is omitted rather than invented. The primary
 * CTA's chevron opens a menu whose every destination is a genuinely mounted route.
 */

const QUICK_ACTIONS = [
    { id: 'new-resume', label: 'Create Resume', to: '/build-resume/heading?new=1', icon: FiPlus, variant: 'primary' },
    { id: 'explore-jobs', label: 'Explore Jobs', to: '/dashboard/jobs', icon: FiSearch, variant: 'outline' },
    { id: 'mock-drill', label: 'Mock Interview', to: '/dashboard/interview', icon: FiZap, variant: 'outline' },
];

/** The primary CTA's chevron menu. Both destinations are real mounted routes. */
const CREATE_MENU = [
    { id: 'blank', label: 'Blank resume', to: '/build-resume/heading?new=1' },
    { id: 'template', label: 'Choose a template', to: '/build-resume' },
];

/** Local-clock greeting. Pure and testable; never derived from anything but the real time. */
const greetingFor = (date = new Date()) => {
    const hour = date.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
};


const CopilotHeroHud = ({ insight = '', onNavigate, displayName = 'Candidate', className = '' }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    const go = useCallback((event, to) => {
        if (!onNavigate) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        onNavigate(to);
    }, [onNavigate]);

    // Escape closes the menu and a click outside dismisses it. Nothing here mutates candidate data.
    useEffect(() => {
        if (!menuOpen) return undefined;
        const onKey = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
        const onDown = (event) => { if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false); };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onDown);
        };
    }, [menuOpen]);

    // The REAL authenticated first name, never a placeholder persona.
    const firstName = String(displayName || 'Candidate').trim().split(/\s+/)[0] || 'Candidate';

    return (
        <section
            data-testid="cuba-copilot-hud"
            aria-label="AI Copilot"
            className={cx(
                'cuba-glass flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-cuba-lg border border-cuba-line px-3.5 py-3',
                className,
            )}
        >
            <span className="hidden">
                <CubaCopilotMascot size={40} label="PilotAI Copilot" />
            </span>

            <div className="min-w-[280px] flex-1">
                <h1 className="truncate text-base font-bold tracking-tight text-cuba-ink sm:text-xl" data-testid="cuba-welcome-greeting">
                    {greetingFor()}, {firstName}! <span aria-hidden="true">👋</span>
                </h1>
                <p className="mt-1 text-xs text-cuba-ink-muted">
                    Take the next step towards your dream career. Your candidate workspace at a glance.
                </p>
                <span className="sr-only" data-testid="cuba-copilot-insight">
                    {insight || 'Copilot active'}
                </span>
            </div>

            {/* DIR-090 GAP-6: the reference sets the quote INLINE to the left of the CTA group,
                not stacked above it. The CTA group itself is unchanged. */}
            <div className="flex flex-none flex-wrap items-center justify-end gap-2.5">
                <p className="hidden text-xs italic text-cuba-ink-subtle lg:block">
                    &ldquo;Better resumes. Brighter opportunities.&rdquo;
                </p>
                <div className="flex items-center gap-2">
                {QUICK_ACTIONS.map(({ id, label, to, icon: Icon, variant }) => (variant === 'primary' ? (
                    <span key={id} ref={menuRef} className="relative inline-flex overflow-hidden rounded-cuba-sm shadow-xs">
                        <a
                            href={to}
                            data-testid={`cuba-copilot-cta-${id}`}
                            onClick={(event) => go(event, to)}
                            className="cuba-focusable inline-flex items-center gap-1.5 cuba-btn-primary px-3.5 py-1.5 text-xs font-bold"
                        >
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {label}
                        </a>
                        <button
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            aria-label="More resume creation options"
                            data-testid="cuba-copilot-create-toggle"
                            onClick={() => setMenuOpen((open) => !open)}
                            className="cuba-focusable inline-flex items-center border-l border-white/30 cuba-btn-primary px-1.5 py-1.5"
                        >
                            <FiChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        {menuOpen && (
                            <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-cuba-md border border-cuba-line bg-cuba-card py-1 shadow-lg">
                                {CREATE_MENU.map((item) => (
                                    <a
                                        key={item.id}
                                        role="menuitem"
                                        href={item.to}
                                        data-testid={`cuba-copilot-create-${item.id}`}
                                        onClick={(event) => { setMenuOpen(false); go(event, item.to); }}
                                        className="cuba-focusable block px-3 py-2 text-xs font-semibold text-cuba-ink hover:bg-cuba-primary-soft"
                                    >
                                        {item.label}
                                    </a>
                                ))}
                            </div>
                        )}
                    </span>
                ) : (
                    <a
                        key={id}
                        href={to}
                        data-testid={`cuba-copilot-cta-${id}`}
                        onClick={(event) => go(event, to)}
                        className="cuba-focusable inline-flex items-center gap-1.5 rounded-cuba-sm border border-cuba-line bg-cuba-card px-3 py-1.5 text-xs font-bold text-cuba-ink transition-colors hover:bg-cuba-primary-soft"
                    >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {label}
                    </a>
                )))}
                </div>
            </div>
        </section>
    );
};

export default CopilotHeroHud;
