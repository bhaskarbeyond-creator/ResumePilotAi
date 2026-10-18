/**
 * AiQuotaRing — Cuba Executive AI Quota Visualization
 *
 * Implements the Honesty Contract (§20, §46):
 * Renders ONLY numbers the tenant API actually returned:
 *   - measured: both used and limit known. A real percentage is shown.
 *   - unknown: limit or usage not reported. "—" is shown, never 0%.
 *   - error: failed to read. Shows explicit retry state.
 */

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEnterprise } from './EnterpriseContext';
import { enterpriseApi } from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

export const QUOTA_RING_STATES = Object.freeze({
  MEASURED: 'measured',
  UNKNOWN: 'unknown',
  ERROR: 'error',
} as const);

export type QuotaRingState = (typeof QUOTA_RING_STATES)[keyof typeof QUOTA_RING_STATES];

const toFinite = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export interface QuotaData {
  state: QuotaRingState;
  percent: number | null;
  used: number | null;
  limit: number | null;
  label: string;
}

export function deriveQuota({
  configuration,
  usage,
  error,
}: {
  configuration?: { configuration?: { quotaPolicy?: { aiRequestsPerDay?: number } } } | null;
  usage?: { requests?: number; totalRequests?: number; requestCount?: number } | null;
  error?: unknown;
}): QuotaData {
  if (error) {
    return {
      state: QUOTA_RING_STATES.ERROR,
      percent: null,
      used: null,
      limit: null,
      label: 'Quota unavailable',
    };
  }

  const limit = toFinite(configuration?.configuration?.quotaPolicy?.aiRequestsPerDay);
  const used = toFinite(usage?.requests ?? usage?.totalRequests ?? usage?.requestCount);

  if (limit === null || used === null) {
    return {
      state: QUOTA_RING_STATES.UNKNOWN,
      percent: null,
      used,
      limit,
      label: 'Quota not reported',
    };
  }

  if (limit === 0) {
    return {
      state: QUOTA_RING_STATES.MEASURED,
      percent: 100,
      used,
      limit,
      label: 'No daily AI allowance is configured for this tenant.',
    };
  }

  const percent = Math.min(100, Math.round((used / limit) * 100));
  return {
    state: QUOTA_RING_STATES.MEASURED,
    percent,
    used,
    limit,
    label: `${used} of ${limit} daily AI requests used (${percent}%).`,
  };
}

export function quotaTone(percent: number | null): 'neutral' | 'success' | 'warning' | 'danger' {
  if (percent === null) return 'neutral';
  if (percent >= 90) return 'danger';
  if (percent >= 75) return 'warning';
  return 'success';
}

const SIZE = 112;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function AiQuotaRing({ days = 30 }: { days?: number }) {
  const { tenant } = useEnterprise();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [configData, setConfigData] = useState<{ configuration?: { quotaPolicy?: { aiRequestsPerDay?: number } } } | null>(null);
  const [usageData, setUsageData] = useState<{ requests?: number } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchQuota = useCallback(async () => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [configRes, usageRes] = await Promise.all([
        enterpriseApi.getConfiguration(tenant.id).catch(() => null),
        enterpriseApi.getAiUsage(tenant.id, days).catch(() => null),
      ]);
      setConfigData(configRes);
      setUsageData(usageRes?.usage || null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id, days]);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota, refreshKey]);

  const quota = deriveQuota({
    configuration: configData,
    usage: usageData,
    error,
  });

  const tone = quotaTone(quota.percent);
  const measured = quota.state === QUOTA_RING_STATES.MEASURED;

  const toneColors: Record<string, string> = {
    success: 'text-emerald-500 stroke-emerald-500',
    warning: 'text-amber-500 stroke-amber-500',
    danger: 'text-rose-500 stroke-rose-500',
    neutral: 'text-ink-muted stroke-ink-muted',
  };

  return (
    <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs h-full">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold tracking-tight text-ink">AI Request Quota</h3>
            <p className="mt-0.5 text-xs text-ink-muted">Daily allowance for this organization</p>
          </div>
          {quota.state === QUOTA_RING_STATES.ERROR && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRefreshKey(k => k + 1)}
              className="size-7 p-0"
              aria-label="Retry quota read"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
            </Button>
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
              className="rotate-[-90deg]"
            >
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth={STROKE}
                className="text-edge"
              />
              {measured && quota.percent !== null && (
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={CIRCUMFERENCE * (1 - quota.percent / 100)}
                  className={cn(
                    'transition-[stroke-dashoffset] duration-500 ease-out',
                    toneColors[tone],
                  )}
                />
              )}
            </svg>
            <span
              className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums text-ink"
              aria-hidden="true"
            >
              {loading ? '…' : measured ? `${quota.percent}%` : '—'}
            </span>
          </div>

          <div className="min-w-0 text-sm">
            {loading ? (
              <span className="text-ink-muted">Reading tenant quota…</span>
            ) : (
              <>
                <p className={cn('font-medium leading-snug', measured ? 'text-ink' : 'text-ink-muted')}>
                  {quota.label}
                </p>
                {quota.state === QUOTA_RING_STATES.UNKNOWN && (
                  <p className="mt-1 text-xs text-ink-muted">
                    The tenant did not report a quota figure, so no percentage is shown.
                  </p>
                )}
                {quota.state === QUOTA_RING_STATES.ERROR && (
                  <p className="mt-1 text-xs text-rose-500">
                    The quota could not be read. Nothing is being inferred.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default AiQuotaRing;
