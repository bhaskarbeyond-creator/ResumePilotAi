import React, { useState } from 'react';
import { FiRefreshCw } from 'react-icons/fi';
import CubaCard from '../cuba/CubaCard';
import CubaButton from '../cuba/CubaButton';
import { useTenantApi, useAsyncResource } from './useTenantApi';
import { deriveQuota, quotaTone, QUOTA_RING_STATES } from './quotaRing';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const TONE_VAR = {
    success: 'var(--cuba-success)',
    warning: 'var(--cuba-warning)',
    danger: 'var(--cuba-danger)',
    neutral: 'var(--cuba-ink-subtle)',
};

const SIZE = 112;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * AiQuotaRing — Phase 6 organization quota visualisation.
 *
 * Reads the SAME tenant endpoints the existing Usage & Quotas tab already uses:
 *   GET /api/enterprise/configuration → quotaPolicy.aiRequestsPerDay (the limit)
 *   GET /api/enterprise/usage/ai     → the actual request count
 *
 * It therefore cannot disagree with the Usage tab, and it invents nothing: see
 * `quotaRing.js` for the three-state honesty contract (measured / unknown /
 * error). An unreadable quota is drawn as "—", never as 0%.
 */
// bs-quota-ring
const AiQuotaRing = ({ days = 30 }) => {
    const { request } = useTenantApi();
    const [refreshKey, setRefreshKey] = useState(0);
    const [configState, reloadConfig] = useAsyncResource(
        () => request('/api/enterprise/configuration'),
        [request, refreshKey],
    );
    const [usageState, reloadUsage] = useAsyncResource(
        () => request(`/api/enterprise/usage/ai?days=${days}`),
        [request, days, refreshKey],
    );

    const quota = deriveQuota({
        configuration: configState?.data || null,
        usage: usageState?.data || null,
        error: configState?.error || usageState?.error || null,
    });

    const loading = configState?.loading || usageState?.loading;
    const tone = quotaTone(quota.percent);
    const measured = quota.state === QUOTA_RING_STATES.MEASURED;
    const retry = () => { setRefreshKey((k) => k + 1); reloadConfig?.(); reloadUsage?.(); };

return (
        <CubaCard className="card bs-card-executive h-full">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold tracking-tight text-cuba-ink">AI request quota</h3>
                    <p className="mt-1 text-xs text-cuba-ink-muted">Daily allowance for this organization</p>
                </div>
                {quota.state === QUOTA_RING_STATES.ERROR && (
                    <CubaButton size="sm" variant="ghost" onClick={retry} aria-label="Retry quota read">
                        <FiRefreshCw className="h-4 w-4" aria-hidden="true" />
                    </CubaButton>
                )}
            </div>

            <div className="mt-4 flex items-center gap-5">
                <div className="relative flex-none" style={{ width: SIZE, height: SIZE }}>
                    <svg
                        width={SIZE}
                        height={SIZE}
                        viewBox={`0 0 ${SIZE} ${SIZE}`}
                        role="img"
                        aria-label={loading ? 'Reading AI quota' : quota.label}
                    >
                        <circle
                            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                            fill="none" stroke="var(--cuba-line)" strokeWidth={STROKE}
                        />
                        {measured && (
                            <circle
                                cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                                fill="none" stroke={TONE_VAR[tone]} strokeWidth={STROKE}
                                strokeLinecap="round"
                                strokeDasharray={CIRCUMFERENCE}
                                strokeDashoffset={CIRCUMFERENCE * (1 - quota.percent / 100)}
                                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                                className="transition-[stroke-dashoffset] duration-500 ease-cuba motion-reduce:transition-none"
                            />
                        )}
                    </svg>
                    <span
                        className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums text-cuba-ink"
                        aria-hidden="true"
                    >
                        {loading ? '…' : (measured ? `${quota.percent}%` : '—')}
                    </span>
                </div>

                <div className="min-w-0 text-sm">
                    {loading ? (
                        <span className="text-cuba-ink-muted">Reading tenant quota…</span>
                    ) : (
                        <>
                            <p className={cx('font-medium', measured ? 'text-cuba-ink' : 'text-cuba-ink-muted')}>
                                {quota.label}
                            </p>
                            {quota.state === QUOTA_RING_STATES.UNKNOWN && (
                                <p className="mt-1 text-xs text-cuba-ink-muted">
                                    The tenant did not report a quota figure, so no percentage is shown.
                                </p>
                            )}
                            {quota.state === QUOTA_RING_STATES.ERROR && (
                                <p className="mt-1 text-xs text-cuba-ink-muted">
                                    The quota could not be read. Nothing is being inferred.
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </CubaCard>
    );
};

export default AiQuotaRing;
