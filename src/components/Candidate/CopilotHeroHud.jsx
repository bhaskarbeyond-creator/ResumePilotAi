import React from 'react';
import { FiPlus, FiSearch, FiZap, FiArrowRight } from 'react-icons/fi';
import CubaCopilotMascot from '../cuba/CubaCopilotMascot';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * DIR-085 — the compact AI Copilot hero.
 *
 * Replaces the tall gradient banner. It is ONE horizontal glass row (~100px) carrying:
 *   - the friendly PilotAI mascot,
 *   - a live "Copilot Active" status pill,
 *   - a single dynamic career insight line, and
 *   - three compact quick CTAs.
 *
 * The insight is passed in by the caller from the REAL briefing output; when there is
 * nothing truthful to say the row simply omits the line rather than inventing one.
 */

const QUICK_ACTIONS = [
    { id: 'new-resume', label: 'New Resume', to: '/build-resume/heading?new=1', icon: FiPlus, variant: 'primary' },
    { id: 'explore-jobs', label: 'Explore Jobs', to: '/dashboard/jobs', icon: FiSearch, variant: 'outline' },
    { id: 'mock-drill', label: 'Mock Drill', to: '/dashboard/interview', icon: FiZap, variant: 'outline' },
];

const CopilotHeroHud = ({ insight = '', onNavigate, className = '' }) => {
    const go = (event, to) => {
        if (!onNavigate) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        onNavigate(to);
    };

    return (
        <section
            data-testid="cuba-copilot-hud"
            aria-label="AI Copilot"
            className={cx(
                'cuba-glass flex flex-wrap items-center gap-3 rounded-cuba-lg border border-cuba-line px-3 py-2.5',
                className,
            )}
        >
            <CubaCopilotMascot size={42} label="PilotAI Copilot" />

            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-cuba-success-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-cuba-success">
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cuba-success animate-pulse motion-reduce:animate-none" />
                        PilotAI Copilot Active
                    </span>
                </p>
                {insight && (
                    <p className="mt-0.5 truncate text-sm font-medium text-cuba-ink" data-testid="cuba-copilot-insight">
                        {insight}
                    </p>
                )}
            </div>

            <div className="flex flex-none flex-wrap items-center gap-2">
                {QUICK_ACTIONS.map(({ id, label, to, icon: Icon, variant }) => (
                    <a
                        key={id}
                        href={to}
                        data-testid={`cuba-copilot-cta-${id}`}
                        onClick={(event) => go(event, to)}
                        className={cx(
                            'cuba-focusable inline-flex items-center gap-1.5 rounded-cuba-sm px-3 py-1.5 text-xs font-bold transition-colors',
                            variant === 'primary'
                                ? 'cuba-btn-primary'
                                : 'border border-cuba-line bg-cuba-card text-cuba-ink hover:bg-cuba-primary-soft',
                        )}
                    >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {label}
                        {variant === 'primary' && <FiArrowRight className="h-3 w-3" aria-hidden="true" />}
                    </a>
                ))}
            </div>
        </section>
    );
};

export default CopilotHeroHud;
