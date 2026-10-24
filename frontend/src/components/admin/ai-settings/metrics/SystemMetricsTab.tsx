import React from 'react';
import { Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import { QuotaGovernanceTab } from '../quotas/QuotaGovernanceTab';

export function SystemMetricsTab() {
  const {
    providers,
    configuredCount,
    cooldowns,
    engineStatus,
    engineMetrics,
  } = useAiSettingsContext();

  return (
    <div className="space-y-4 min-w-0">
      <Card className="border-border bg-surface">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <Activity className="size-4 text-brand-600" />
                Engine Metrics
              </h3>
              <p className="text-xs text-ink-muted mt-0.5">
                Live provider router inventory and durable SQLite execution counters.
              </p>
            </div>
            <span className="text-xs text-ink-muted">
              {engineStatus?.version || 'in-process router'}
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-canvas p-3.5">
              <div className="text-xs font-medium text-ink-muted">Total Providers</div>
              <div className="text-xl font-extrabold text-ink mt-1">{providers.length}</div>
            </div>
            <div className="rounded-xl border border-border bg-canvas p-3.5">
              <div className="text-xs font-medium text-ink-muted">Configured</div>
              <div className="text-xl font-extrabold text-ink mt-1">{configuredCount}</div>
            </div>
            <div className="rounded-xl border border-border bg-canvas p-3.5">
              <div className="text-xs font-medium text-ink-muted">Multi-Key Pools</div>
              <div className="text-xl font-extrabold text-ink mt-1">
                {providers.filter((p) => p.keysCount > 1).length}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-canvas p-3.5">
              <div className="text-xs font-medium text-ink-muted">Active Cooldowns</div>
              <div className="text-xl font-extrabold text-ink mt-1">
                {Object.keys(cooldowns).length}
              </div>
            </div>
          </div>

          {engineMetrics?.summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-border">
              <div className="rounded-xl border border-border bg-canvas p-3">
                <div className="text-xs text-ink-muted">Router Requests</div>
                <div className="text-base font-bold text-ink mt-0.5">
                  {engineMetrics.summary.totalRequests ?? 0}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-canvas p-3">
                <div className="text-xs text-ink-muted">Total Tokens</div>
                <div className="text-base font-bold text-ink mt-0.5">
                  {(engineMetrics.summary.totalTokens ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-canvas p-3">
                <div className="text-xs text-ink-muted">Avg Latency</div>
                <div className="text-base font-bold text-ink mt-0.5">
                  {engineMetrics.summary.avgLatencyMs
                    ? `${Math.round(engineMetrics.summary.avgLatencyMs)}ms`
                    : '—'}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-canvas p-3">
                <div className="text-xs text-ink-muted">Upstream Errors</div>
                <div className="text-base font-bold text-ink mt-0.5">
                  {engineMetrics.summary.errorCount ?? 0}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <QuotaGovernanceTab />
    </div>
  );
}
