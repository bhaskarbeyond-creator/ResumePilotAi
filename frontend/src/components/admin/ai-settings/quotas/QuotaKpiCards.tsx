import { useAiSettingsContext } from '../context/AiSettingsContext';

export function QuotaKpiCards() {
  const { quotaData } = useAiSettingsContext();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="rounded-xl border border-border bg-canvas p-3.5">
        <div className="text-xs font-medium text-ink-muted">Today&apos;s AI Requests</div>
        <div className="text-xl font-extrabold text-ink mt-1">
          {quotaData?.totalTodayRequests?.toLocaleString() ?? 0}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-canvas p-3.5">
        <div className="text-xs font-medium text-ink-muted">Active Users Today</div>
        <div className="text-xl font-extrabold text-ink mt-1">
          {quotaData?.activeUsersToday?.toLocaleString() ?? 0}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-canvas p-3.5">
        <div className="text-xs font-medium text-ink-muted">Historical Usage Rows</div>
        <div className="text-xl font-extrabold text-ink mt-1">
          {quotaData?.totalHistoricalRecords?.toLocaleString() ?? 0}
        </div>
      </div>
    </div>
  );
}
