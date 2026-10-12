import React, { useMemo } from 'react';
import { MdLightbulbOutline, MdCheckCircle, MdErrorOutline } from 'react-icons/md';
import { analyseStep } from './inlineAtsLogic';

/**
 * InlineAtsGuidance — DIR-088 Rezi-grade inline ATS feedback for the Resume Builder steps.
 *
 * The derivation lives in ./inlineAtsLogic.js so this module only exports a component, and
 * every hint comes from the project's own ATS engine (src/utils/atsScore.js) - see that file
 * for the exact provenance of the action-verb, bullet-length and keyword cues. Nothing is
 * fabricated: when the engine has nothing to say the panel says so explicitly.
 */

const InlineAtsGuidance = ({ resumeData = {}, targetJd = '', stepPath = 'heading' }) => {
    const analysis = useMemo(() => analyseStep(resumeData, targetJd, stepPath), [resumeData, targetJd, stepPath]);
    const { section, bulletCount, weakBullets, missingKeywords, keywords, hasJd } = analysis;

    const findings = section?.findings || [];
    const unmet = findings.filter((finding) => !finding.ok);
    const met = findings.filter((finding) => finding.ok);
    const nothingToFlag = !section && bulletCount === 0 && keywords.length === 0;

    return (
        <section
            aria-label="Inline ATS guidance"
            data-testid="builder-inline-ats"
            className="rounded-[var(--cuba-radius-lg)] border border-[var(--cuba-line)] bg-[var(--cuba-card)] p-3"
        >
            <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--cuba-ink-subtle)]">
                <MdLightbulbOutline className="h-3.5 w-3.5" aria-hidden="true" />
                ATS guidance for this step
            </h2>

            {nothingToFlag ? (
                <p className="text-[11px] text-[var(--cuba-ink-muted)]">
                    Nothing to flag yet — add content to this step and live guidance will appear here.
                </p>
            ) : (
                <div className="space-y-2.5">
                    {unmet.length > 0 && (
                        <ul className="space-y-1.5">
                            {unmet.slice(0, 3).map((finding, index) => (
                                <li key={`unmet-${index}`} className="flex gap-1.5 text-[11px] leading-snug text-[var(--cuba-ink)]">
                                    <MdErrorOutline className="mt-0.5 h-3.5 w-3.5 flex-none text-[var(--cuba-danger)]" aria-hidden="true" />
                                    <span>{finding.text}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {met.length > 0 && (
                        <ul className="space-y-1.5">
                            {met.slice(0, 2).map((finding, index) => (
                                <li key={`met-${index}`} className="flex gap-1.5 text-[11px] leading-snug text-[var(--cuba-ink-muted)]">
                                    <MdCheckCircle className="mt-0.5 h-3.5 w-3.5 flex-none text-[var(--cuba-success)]" aria-hidden="true" />
                                    <span>{finding.text}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {weakBullets.length > 0 && (
                        <div>
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--cuba-ink-subtle)]">Bullet strength</p>
                            <ul className="space-y-1.5">
                                {weakBullets.map((item, index) => (
                                    <li key={`bullet-${index}`} className="text-[11px] leading-snug text-[var(--cuba-ink-muted)]">
                                        {item.issues.join(' · ')}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {hasJd && missingKeywords.length > 0 && (
                        <div>
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--cuba-ink-subtle)]">Missing target keywords</p>
                            <ul className="flex flex-wrap gap-1">
                                {missingKeywords.map((term) => (
                                    <li
                                        key={term}
                                        className="rounded-full bg-[var(--cuba-pill-warning-fill)] px-2 py-0.5 text-[10px] font-semibold text-[var(--cuba-pill-warning-ink)]"
                                    >
                                        {term}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {!hasJd && (
                        <p className="text-[11px] text-[var(--cuba-ink-subtle)]">
                            Add a target job description to unlock keyword matching.
                        </p>
                    )}

                    <div className="border-t border-[var(--cuba-line)] pt-2">
                        <div className="flex items-center justify-between text-[10px] font-bold text-[var(--cuba-ink-subtle)]">
                            <span className="uppercase tracking-wider">Bullet Strength</span>
                            <span className="text-[var(--cuba-ink)]">
                                {bulletCount === 0
                                    ? 'Pending experience bullets'
                                    : weakBullets.length === 0
                                    ? 'Strong'
                                    : `${ Math.max(0, bulletCount - weakBullets.length) }/${bulletCount} strong`}
                            </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--cuba-surface)]">
                            <div
                                className="h-full rounded-full bg-[var(--cuba-primary)] transition-all"
                                style={{
                                    width: `${
                                        bulletCount === 0
                                            ? Math.min(100, Math.max(20, met.length * 35))
                                            : Math.round(((bulletCount - weakBullets.length) / Math.max(1, bulletCount)) * 100)
                                    }%`,
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default InlineAtsGuidance;
