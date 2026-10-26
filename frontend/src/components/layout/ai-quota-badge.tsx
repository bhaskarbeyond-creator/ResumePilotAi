/**
 * AiQuotaBadge Component
 *
 * Real-time daily AI allowance meter mounted in CubaAppShell:
 * - Calls GET /api/ai-usage
 * - Displays live remaining AI generations with visual progress ring/bar
 * - Discloses plan tier, tenant scope, and reset countdown
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Sparkles, Zap, ArrowUpRight, Clock } from 'lucide-react';
import { fetchAiUsage, type AiUsageData } from '@/lib/ai-content';
import { cn } from '@/lib/utils';

export function AiQuotaBadge() {
  const [usage, setUsage] = useState<AiUsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchAiUsage()
      .then((data) => {
        if (active && data) setUsage(data);
      })
      .catch((err) => {
        console.warn('[AiQuotaBadge fetch error]', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  if (loading || !usage) return null;

  const used = usage.usedToday || 0;
  const limit = usage.effectiveLimit || 10;
  const remaining = usage.remainingToday !== undefined ? usage.remainingToday : Math.max(0, limit - used);
  const percentUsed = Math.min(100, Math.round((used / limit) * 100));

  const isLow = remaining <= 2;
  const isExhausted = usage.isExhausted || remaining === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="ai-quota-badge"
          aria-label={`${remaining} / ${limit} AI — Daily AI allowance (${remaining} of ${limit} remaining today)`}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer shadow-2xs',
            isExhausted
              ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
              : isLow
              ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
              : 'bg-brand-50/80 border-brand-200/80 text-brand-800 hover:bg-brand-100'
          )}
        >
          <Sparkles className={cn('size-3.5', isExhausted ? 'text-rose-600' : 'text-brand-600')} />
          <span className="tabular-nums font-bold">{remaining}</span>
          <span className="text-xs text-ink-muted">/{limit} AI</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 p-3.5 bg-surface/95 backdrop-blur-xl border-border shadow-xl rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center border border-brand-200">
              <Zap className="size-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-ink">Daily AI Quota</p>
              <p className="text-xs text-brand-700 font-semibold">{usage.plan} Plan</p>
            </div>
          </div>
          <span className={cn(
            'px-2 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide border',
            isExhausted ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          )}>
            {isExhausted ? 'Depleted' : 'Active'}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-muted">Generations today</span>
            <span className="font-bold text-ink tabular-nums">{used} / {limit} used</span>
          </div>
          <div className="h-2 w-full rounded-full bg-neutral-200/80 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                isExhausted ? 'bg-rose-500' : isLow ? 'bg-amber-500' : 'bg-brand-600'
              )}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-neutral-50/50 p-2.5 space-y-1 text-xs text-ink-muted">
          <div className="flex items-center gap-1.5 text-ink font-semibold">
            <Clock className="size-3 text-ink-subtle" />
            <span>Resets daily at midnight UTC</span>
          </div>
          <p className="leading-relaxed text-xs">
            Grounded summaries, role bullets, and ATS tailoring consume 1 token per request.
          </p>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild className="p-0">
          <Link
            to="/pricing"
            className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-bold text-brand-700 hover:bg-brand-50 hover:text-brand-800 transition-colors"
          >
            <span>Upgrade for higher quota</span>
            <ArrowUpRight className="size-3.5" />
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
