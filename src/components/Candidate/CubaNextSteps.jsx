import React from 'react';
import { FiCheck, FiChevronRight } from 'react-icons/fi';
import { completionPercent } from './analyticsLogic';

/**
 * CubaNextSteps — DIR-094 S4 (candidate Overview, bottom-right column).
 *
 * REAL DEFECT FIXED HERE — please read before changing this component:
 *   DIR-058 shipped a four-step onboarding checklist on DashboardHomepage whose
 *   completion is derived from MEASURED counts (`applyOnboardingProgress`: profileComplete,
 *   resumes, coverLetters, applications) and whose steps carry real deep-link routes.
 *   That state was ORPHANED — it was initialised at DashboardHomepage.jsx:73, rewritten
 *   at :372 and mutated by handleStepClick/completeStep at :547-:562, but RENDERED
 *   NOWHERE. A repo-wide grep confirmed no component consumed it, so the candidate could
 *   never see the checklist and completeStep() was unreachable. This component is its
 *   first real consumer: it renders the existing real state instead of introducing a new
 *   hardcoded checklist.
 *
 * HONEST DATA CONTRACT:
 *   • This component owns NO state and fetches NOTHING. Every step, its title, its
 *     description, its route and its completed flag arrive as props from the real
 *     DashboardHomepage state. There is no fallback step list here on purpose: if the
 *     caller passes nothing we render an explicit empty state rather than invent steps.
 *   • Progress is the real completed/total COUNT of those steps — not a decorative bar.
 *     Before the first successful measurement every step is simply `completed: false`,
 *     which reads as "pending", never as a fabricated 100%.
 */

const CubaNextSteps = ({ steps = [], onStepClick }) => {
    const list = Array.isArray(steps) ? steps.filter(Boolean) : [];
    const total = list.length;
    const completed = list.filter((step) => step.completed === true).length;
    const percent = completionPercent(list);
    const go = (step) => { if (typeof onStepClick === 'function') onStepClick(step.id); };

    return (
        <section
            data-testid="cuba-next-steps"
            aria-labelledby="cuba-next-steps-title"
            className="card bs-card-executive flex min-w-0 flex-col rounded-cuba-lg border border-cuba-line bg-cuba-card p-3.5 shadow-xs shadow-sm h-100"
        >
            <header className="mb-2">
                <div className="flex items-center justify-between">
                    <h2 id="cuba-next-steps-title" className="text-sm font-bold text-cuba-ink flex items-center gap-1.5">
                        <span className="text-[#10b981]">✔</span> Your Next Steps
                    </h2>
                    <button
                        type="button"
                        onClick={() => list[0] && go(list[0])}
                        className="text-[11px] font-bold text-[#7366ff] hover:underline cursor-pointer"
                    >
                        View All
                    </button>
                </div>
                <p className="text-[11px] text-cuba-ink-subtle mt-0.5" data-testid="cuba-next-steps-progress-label">
                    {total === 0 ? 'Nothing to track yet' : `${completed} of ${total} complete`}
                </p>
                {total > 0 && (
                    <div
                        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-cuba-line"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                        aria-label="Setup progress"
                        data-testid="cuba-next-steps-progressbar"
                    >
                        <div className="h-full rounded-full bg-cuba-primary transition-[width]" style={{ width: `${percent}%` }} />
                    </div>
                )}
            </header>

            {total === 0 && (
                <p className="py-8 text-center text-[11px] text-cuba-ink-subtle" data-testid="cuba-next-steps-empty">
                    Your checklist will appear once your workspace is measured.
                </p>
            )}

            {total > 0 && (
                <ol className="flex min-h-0 flex-col gap-1.5" data-testid="cuba-next-steps-list">
                    {list.map((step) => {
                        const done = step.completed === true;
                        return (
                            <li key={step.id}>
                                <button
                                    type="button"
                                    onClick={() => go(step)}
                                    aria-label={`${step.title}${done ? ' — completed' : ' — not started'}`}
                                    data-testid={`cuba-next-step-${step.key || step.id}`}
                                    className="cuba-focusable flex w-full items-start gap-2 rounded-cuba-md border border-cuba-line px-2.5 py-2 text-left hover:bg-cuba-primary-soft"
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border ${
                                            done
                                                ? 'border-transparent bg-cuba-success text-cuba-ink-inverse'
                                                : 'border-cuba-line-strong text-transparent'
                                        }`}
                                    >
                                        <FiCheck className="h-2.5 w-2.5" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className={`block truncate text-xs font-semibold ${done ? 'text-cuba-ink-subtle line-through' : 'text-cuba-ink'}`}>
                                            {step.title}
                                        </span>
                                        {step.description && (
                                            <span className="mt-0.5 block line-clamp-2 text-[11px] text-cuba-ink-subtle">
                                                {step.description}
                                            </span>
                                        )}
                                    </span>
                                    <FiChevronRight className="mt-0.5 h-3.5 w-3.5 flex-none text-cuba-ink-subtle" aria-hidden="true" />
                                </button>
                            </li>
                        );
                    })}

                </ol>
            )}
        </section>
    );
};

export default CubaNextSteps;
