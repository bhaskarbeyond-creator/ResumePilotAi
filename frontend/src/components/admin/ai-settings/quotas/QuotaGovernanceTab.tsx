import { Link, useLocation } from 'react-router-dom';
import { Gauge, RefreshCw, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import { QuotaKpiCards } from './QuotaKpiCards';
import { QuotaLimitsForm } from './QuotaLimitsForm';
import { TopUsersTable } from './TopUsersTable';
import { QuotaResetConfirmDialog } from './QuotaResetConfirmDialog';

export function QuotaGovernanceTab() {
  const {
    quotaLoading,
    quotaSaving,
    quotaError,
    quotaRequiresReauth,
    loadQuotaAndTelemetry,
    openDialog,
  } = useAiSettingsContext();
  const location = useLocation();

  return (
    <Card className="border-border bg-surface">
      <CardContent className="p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <Gauge className="size-4 text-brand-600 shrink-0" />
              AI Quota Governance &amp; Daily Usage
            </h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Enforce tier daily request caps in MariaDB and reset exhausted individual or global daily counters.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadQuotaAndTelemetry()}
              disabled={quotaLoading}
            >
              <RefreshCw className={cn('size-3.5 mr-1.5', quotaLoading && 'animate-spin')} />
              Refresh Quotas
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openDialog('confirm-reset-all-quotas')}
              disabled={quotaSaving}
              className="text-error-700 border-error-100 hover:bg-error-50"
            >
              <RotateCcw className="size-3.5 mr-1.5" />
              Reset All Daily Quotas
            </Button>
          </div>
        </div>

        {quotaError && (
          <div
            role="alert"
            className="rounded-xl border border-error-100 bg-error-50 p-3 text-xs text-error-700 flex flex-wrap items-center justify-between gap-2"
          >
            <span>{quotaError}</span>
            {quotaRequiresReauth && (
              <Link
                to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
                className="font-bold underline text-error-700"
              >
                Reauthenticate Session
              </Link>
            )}
          </div>
        )}

        <QuotaKpiCards />
        <QuotaLimitsForm />
        <TopUsersTable />
        <QuotaResetConfirmDialog />
      </CardContent>
    </Card>
  );
}
