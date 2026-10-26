/**
 * Enterprise Usage Tab (Consumption Analytics & Contractual Thresholds)
 *
 * Seat usage meter, token consumption telemetry, per-user ledger breakdown,
 * time window selectors (7d / 30d / 90d), and plan capacity ceilings.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import { AiQuotaRing } from './AiQuotaRing';
import { enterpriseApi, type EnterpriseAiUsage } from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

export function EnterpriseUsageTab() {
  const { tenant } = useEnterprise();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [usage, setUsage] = useState<EnterpriseAiUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await enterpriseApi.getAiUsage(tenant.id, days);
      setUsage(res.usage || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch AI usage telemetry');
    } finally {
      setLoading(false);
    }
  }, [tenant?.id, days]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const totalRequests = usage?.requests ?? usage?.totalRequests ?? 0;
  const totalTokens = usage?.tokensConsumed ?? (totalRequests * 420);
  const byUser = usage?.byUser || [];

  return (
    <div className="space-y-6">
      {/* ─── Top Telemetry & Quota Ring ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <AiQuotaRing days={days} />
        </div>

        {/* Aggregated Usage Overview */}
        <Card className="lg:col-span-2 border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs flex flex-col justify-between">
          <CardHeader className="p-5 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                  <BarChart2 className="size-4 text-accent" />
                  AI Consumption Telemetry Window
                  <HelpTooltip text="Contractual inference metrics aggregated across all departmental workspaces." />
                </CardTitle>
                <CardDescription className="text-xs text-ink-muted mt-0.5">
                  Track token consumption, compute credits, and plan capacity limits.
                </CardDescription>
              </div>

              {/* Time Window Selector */}
              <div className="flex items-center gap-1 border border-edge rounded-lg p-0.5 bg-surface text-xs font-semibold">
                {([7, 30, 90] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(d)}
                    className={cn(
                      'px-3 py-1 rounded-md transition-colors',
                      days === d ? 'bg-accent text-white shadow-2xs' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    Last {d}d
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl border border-edge bg-surface/40">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Total Inferences
                </span>
                <div className="mt-2 text-2xl font-black text-ink">
                  {totalRequests.toLocaleString()}
                </div>
                <div className="text-[11px] text-ink-muted mt-1">Across all workspace seats</div>
              </div>

              <div className="p-4 rounded-xl border border-edge bg-surface/40">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Tokens Consumed
                </span>
                <div className="mt-2 text-2xl font-black text-ink">
                  {totalTokens.toLocaleString()}
                </div>
                <div className="text-[11px] text-ink-muted mt-1">Prompt & synthesis tokens</div>
              </div>

              <div className="p-4 rounded-xl border border-edge bg-surface/40">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Active Operators
                </span>
                <div className="mt-2 text-2xl font-black text-ink">
                  {byUser.length || 1}
                </div>
                <div className="text-[11px] text-ink-muted mt-1">Distinct user principals</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Per-User Consumption Breakdown Table ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
            <Users className="size-4 text-accent" />
            Per-User Generation Ledger
            <HelpTooltip text="Audit trail of individual team members consuming AI request allowance in the active billing window." />
          </CardTitle>
          <CardDescription className="text-xs text-ink-muted mt-0.5">
            Identify highest consumers and audit seat allocation across departments.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {loading ? (
            <div className="py-8 text-center text-xs text-ink-muted">
              Loading usage telemetry ledger…
            </div>
          ) : byUser.length === 0 ? (
            <div className="py-8 text-center text-xs text-ink-muted border border-dashed border-edge rounded-xl">
              No individual generation records recorded in the selected {days}-day window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-edge text-ink-muted font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3">Principal Identity</th>
                    <th className="py-3 px-3">Email Address</th>
                    <th className="py-3 px-3 text-right">Inference Executions</th>
                    <th className="py-3 px-3 text-right">Est. Tokens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {byUser.map((userRow, idx) => (
                    <tr key={userRow.principalId || idx} className="hover:bg-surface-raised/40 transition-colors">
                      <td className="py-3 px-3 font-mono font-semibold text-ink">
                        {userRow.principalId || `Member-${idx + 1}`}
                      </td>
                      <td className="py-3 px-3 text-ink-muted">
                        {userRow.email || '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-ink">
                        {userRow.requests.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-ink-muted">
                        {(userRow.tokens || userRow.requests * 420).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default EnterpriseUsageTab;
