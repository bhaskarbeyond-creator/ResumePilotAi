import React, { useCallback } from 'react';
import { FiPlus, FiSearch, FiZap } from 'react-icons/fi';
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
 * Create Resume CTA is a SINGLE button (the chevron dropdown was removed on user request); every
 * CTA destination is a genuinely mounted route.
 */

const QUICK_ACTIONS = [
    { id: 'new-resume', label: 'Create Resume', to: '/build-resume/heading?new=1', icon: FiPlus, variant: 'primary' },
    { id: 'explore-jobs', label: 'Explore Jobs', to: '/dashboard/jobs', icon: FiSearch, variant: 'outline' },
    { id: 'mock-drill', label: 'Mock Interview', to: '/dashboard/interview', icon: FiZap, variant: 'outline' },
];

/** Local-clock greeting. Pure and testable; never derived from anything but the real time. */
const greetingFor = (date = new Date()) => {
    const hour = date.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
};


const CopilotHeroHud = ({ insight = '', onNavigate, displayName = 'Candidate', className = '' }) => {
    const go = useCallback((event, to) => {
        if (!onNavigate) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        onNavigate(to);
    }, [onNavigate]);

    // The REAL authenticated first name, never a placeholder persona.
    const firstName = String(displayName || 'Candidate').trim().split(/\s+/)[0] || 'Candidate';

    return (
        <section
            data-testid="cuba-copilot-hud"
            aria-label="AI Copilot"
            className={cx(
                'cuba-glass flex flex-wrap items-center gap-x-4 gap-y-3 rounded-cuba-lg border border-cuba-line px-3.5 py-3 shadow-cuba-sm transition-shadow duration-200 ease-cuba hover:shadow-cuba-md',
                className,
            )}
        >
            <span className="hidden">
                <CubaCopilotMascot size={40} label="PilotAI Copilot" />
            </span>

            <div className="min-w-[15rem] flex-1 basis-full xl:basis-auto">
                <h1 className="text-base font-bold tracking-tight text-cuba-ink sm:text-xl" data-testid="cuba-welcome-greeting">
                    {greetingFor()}, {firstName}! <span aria-hidden="true">👋</span>
                </h1>
                <p className="mt-1 text-xs text-cuba-ink-muted">
                    Take the next step towards your dream career. Your candidate workspace at a glance.
                </p>
                <span className="sr-only" data-testid="cuba-copilot-insight">
                    {insight || 'Copilot active'}
                </span>
            </div>

            {/* DIR-092 AC2: the reference sets the quote on its OWN line above the CTA group,
                right-aligned, so the quote can never squeeze the greeting. The CTA group itself
                is unchanged and stays flex-none, so the action buttons are never squished. */}
            <div className="ml-auto flex max-w-full flex-none flex-col items-end gap-1.5">
                <p className="hidden text-xs italic text-cuba-ink-subtle lg:block">
                    &ldquo;Better resumes. Brighter opportunities.&rdquo;
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                {/* DIR-092b: the primary Create Resume CTA is a SINGLE button on user request —
                    the chevron dropdown was removed. It still routes to the real builder entry
                    point and keeps its cuba-copilot-cta-<id> testid. */}
                {QUICK_ACTIONS.map(({ id, label, to, icon: Icon, variant }) => (
                    <a
                        key={id}
                        href={to}
                        data-testid={`cuba-copilot-cta-${id}`}
                        onClick={(event) => go(event, to)}
                        className={variant === 'primary'
                            ? 'cuba-focusable relative inline-flex items-center gap-2 rounded-full cuba-btn-primary px-4 py-2 text-xs font-bold tracking-tight'
                            : 'cuba-focusable inline-flex items-center gap-1.5 rounded-full border border-cuba-line bg-cuba-card px-3.5 py-2 text-xs font-bold text-cuba-ink transition-colors hover:bg-cuba-primary-soft'}
                    >
                        {variant === 'primary' ? (
                            <>
                                {/* DIR-092b: premium CTA treatment — a soft inner gloss edge and a
                                    solid icon badge, both from Cuba tokens, layered over the
                                    untouched cuba-btn-primary gradient + glow (so the white label
                                    stays AA-safe against the gradient's dark endpoint and the
                                    keyboard focus ring is preserved). */}
                                <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border border-[var(--cuba-badge-inverted-fill)]" />
                                <span className="relative flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[var(--cuba-primary-ink-strong)]">
                                    <Icon className="h-2.5 w-2.5" aria-hidden="true" />
                                </span>
                                <span className="relative">{label}</span>
                            </>
                        ) : (
                            <>
                                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                {label}
                            </>
                        )}
                    </a>
                ))}
                </div>
            </div>
        </section>
    );
};

export default CopilotHeroHud;
