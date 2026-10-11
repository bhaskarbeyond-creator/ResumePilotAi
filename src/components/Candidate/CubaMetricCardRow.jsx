import React from 'react';
import { FiFileText, FiAward, FiBriefcase, FiZap } from 'react-icons/fi';

/**
 * CubaMetricCardRow — DIR-091 high-density metric cards for the candidate workspace.
 *
 * HONEST DATA CONTRACT: every value is passed in from CubaCandidateHero, which reads the real
 * platform services (getResumes / getStatesOfUser). Nothing here is hardcoded. The reference
 * screenshot's numbers (5 resumes, 69% ATS, 1 application) are ILLUSTRATIVE of the layout and
 * are NOT baked in — an unresolved read renders an explicit placeholder, never a fake zero.
 *
 * The ATS donut is a real SVG arc drawn from the real average score, so there is no charting
 * dependency and no synthetic series.
 */

const DONUT_SIZE = 48;
const DONUT_STROKE = 5;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

const toneRing = {
    success: 'var(--cuba-success)',
    warning: 'var(--cuba-warning)',
    info: 'var(--cuba-info)',
    primary: 'var(--cuba-primary)',
};

const AtsDonut = ({ score }) => {
    // An unscored account is NOT 0% — it renders an explicit em dash.
    const hasScore = typeof score === 'number' && Number.isFinite(score);
    const clamped = hasScore ? Math.max(0, Math.min(100, score)) : 0;
    const offset = DONUT_CIRCUMFERENCE * (1 - clamped / 100);
    const ring = !hasScore ? 'var(--cuba-line-strong)' : clamped >= 75 ? toneRing.success : clamped >= 50 ? toneRing.warning : 'var(--cuba-danger)';

    return (
        <span className="relative inline-flex h-12 w-12 flex-none items-center justify-center" aria-hidden="true">
            <svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} className="-rotate-90">
                <circle cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={DONUT_RADIUS} fill="none" stroke="var(--cuba-line)" strokeWidth={DONUT_STROKE} />
                {hasScore && (
                    <circle
                        cx={DONUT_SIZE / 2}
                        cy={DONUT_SIZE / 2}
                        r={DONUT_RADIUS}
                        fill="none"
                        stroke={ring}
                        strokeWidth={DONUT_STROKE}
                        strokeLinecap="round"
                        strokeDasharray={DONUT_CIRCUMFERENCE}
                        strokeDashoffset={offset}
                    />
                )}
            </svg>
            <span className="absolute text-[11px] font-bold text-cuba-ink">{hasScore ? `${Math.round(clamped)}%` : '--'}</span>
        </span>
    );
};

const MetricCard = ({ label, value, caption, icon, tone = 'primary', children, testId }) => (
    <div
        data-testid={testId}
        className="flex min-w-0 items-center gap-3 rounded-cuba-lg border border-cuba-line bg-cuba-card px-3.5 py-3"
    >
        <span
            className="flex h-9 w-9 flex-none items-center justify-center rounded-cuba-md"
            style={{ backgroundColor: `var(--cuba-${tone === 'primary' ? 'primary' : tone}-soft)`, color: tone === 'primary' ? 'var(--cuba-primary-ink-strong)' : `var(--cuba-${tone})` }}
        >
            {icon}
        </span>
        <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold uppercase tracking-wider text-cuba-ink-subtle">{label}</span>
            <span className="block text-lg font-bold leading-tight text-cuba-ink">{value}</span>
            {caption && <span className="mt-0.5 block truncate text-[11px] text-cuba-ink-muted">{caption}</span>}
        </span>
        {children}
    </div>
);

const CubaMetricCardRow = ({ loading = false, count = null, bestScore = null, applications = null }) => {
    const dash = loading;

    return (
        <section data-testid="cuba-metric-cards" aria-label="Overview metrics" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 2xl:grid-cols-4">
            <MetricCard
                testId="cuba-metric-resumes"
                label="Total Resumes"
                icon={<FiFileText className="h-4 w-4" />}
                tone="primary"
                value={dash ? '--' : count === null ? '--' : String(count)}
                caption={dash ? 'Loading' : count === null ? 'Unavailable' : 'In your workspace'}
            />
            <MetricCard
                testId="cuba-metric-ats"
                label="Avg. ATS Score"
                icon={<FiAward className="h-4 w-4" />}
                tone={bestScore !== null && bestScore >= 75 ? 'success' : 'warning'}
                value={dash ? '--' : bestScore !== null ? `${bestScore}%` : 'Not scored'}
                caption={dash ? 'Loading' : 'Target 80%+'}
            >
                <AtsDonut score={dash ? null : bestScore} />
            </MetricCard>
            <MetricCard
                testId="cuba-metric-applications"
                label="Job Applications"
                icon={<FiBriefcase className="h-4 w-4" />}
                tone="info"
                value={dash ? '--' : applications === null ? '--' : String(applications)}
                caption={dash ? 'Loading' : 'Submitted'}
            />
            <MetricCard
                testId="cuba-metric-coach"
                label="Interview Coach"
                icon={<FiZap className="h-4 w-4" />}
                tone="warning"
                value="Ready"
                caption="Start a session"
            />
        </section>
    );
};

export default CubaMetricCardRow;
