import React, { useMemo } from 'react';
import { FiZap, FiArrowRight } from 'react-icons/fi';
import CubaCard from '../cuba/CubaCard';
import CubaEmptyState from '../cuba/CubaEmptyState';
import { getCopilotActions, COPILOT_PORTALS, resolveActionHref } from '../cuba/copilotActions';

/**
 * CandidateExecutiveRail — DIR-077 executive right rail for the candidate overview.
 *
 * Occupies the right void on >=1280px viewports with ONE high-value widget:
 *   Live Copilot Quick-Pitch — the REAL context-aware candidate actions
 *   (`getCopilotActions`) routed to their own mounted workspaces.
 *
 * DIR-086: the ATS Keyword Strength and Application Milestones widgets were REMOVED.
 * They repeated the Overview's metric capsule strip verbatim, so the rail both duplicated
 * the page's own headline numbers and overflowed the viewport. Their data reads (and the
 * 4s retry loop they carried) were removed with them, which also drops three API calls
 * from the Overview's first paint.
 *
 * TRUTHFULNESS (§46): the remaining action list is the platform's own
 * (`getCopilotActions`) and every destination is a REAL mounted route, resolved through
 * `resolveActionHref` so an action can never navigate to the page the user is already on.
 * An empty action list renders an explicit empty state — never a fabricated shortcut.
 */

const cx = (...parts) => parts.filter(Boolean).join(' ');

const WidgetCard = ({ title, icon, testId, children }) => (
    <CubaCard className="p-4" data-testid={testId}>
        <div className="mb-3 flex items-center gap-2">
            <span
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-cuba-primary-soft text-cuba-primary-ink-strong"
                aria-hidden="true"
            >
                {icon}
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-cuba-ink-subtle">{title}</h2>
        </div>
        {children}
    </CubaCard>
);

const CandidateExecutiveRail = ({ onNavigate }) => {
    // DIR-086: the ATS Keyword Strength and Application Milestones widgets were removed
    // because they repeated the Overview's metric capsule strip verbatim and pushed the
    // rail past the viewport. Their data reads (and the 4s retry loop) went with them.
    const quickPitch = useMemo(
        () => getCopilotActions({ portal: COPILOT_PORTALS.CANDIDATE, pathname: '/dashboard' }).slice(0, 3),
        [],
    );


    const go = (href) => { if (typeof onNavigate === 'function') onNavigate(href); };

    return (
        <div className="space-y-2.5" data-testid="cuba-executive-rail">
            <WidgetCard title="Live Copilot Quick-Pitch" icon={<FiZap className="h-3.5 w-3.5" />} testId="cuba-rail-copilot">
                {quickPitch.length === 0 ? (
                    <CubaEmptyState compact title="No quick actions" description="Copilot shortcuts appear once your workspace has activity." />
                ) : (
                    <ul className="space-y-2">
                        {quickPitch.map((action) => {
                            const href = resolveActionHref(action);
                            return (
                                <li key={action.id}>
                                    <button
                                        type="button"
                                        disabled={!href}
                                        onClick={() => href && go(href)}
                                        className={cx(
                                            'cuba-focusable flex w-full items-center gap-2 rounded-cuba-md border border-cuba-line px-3 py-2 text-left text-xs font-semibold text-cuba-ink transition-colors',
                                            href ? 'hover:bg-cuba-primary-soft' : 'opacity-50',
                                        )}
                                    >
                                        <span aria-hidden="true">{action.icon}</span>
                                        <span className="min-w-0 flex-1 truncate">{action.label}</span>
                                        <FiArrowRight className="h-3.5 w-3.5 flex-none text-cuba-ink-subtle" aria-hidden="true" />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </WidgetCard>

        </div>
    );
};

export default CandidateExecutiveRail;
