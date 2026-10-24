import React from 'react';
import { Button } from '@/components/ui/button';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import { QuotaGovernanceTab } from '../quotas/QuotaGovernanceTab';

export function RollbackView() {
  const { isSuperAdmin, primaryProvider, enableFallback, handleRestoreV2Flag } =
    useAiSettingsContext();

  return (
    <div data-testid="ai-settings-rollback-view" className="space-y-4">
      <div
        role="status"
        className="rounded-2xl border border-warning-100 bg-warning-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-warning-700">
            Runtime Rollback Active (ai_settings_v2_enabled = false)
          </h2>
          <p className="text-xs text-ink-secondary">
            The v2 AI Multi-Provider Engine interface is currently disabled via runtime feature flag.
            Active primary provider: <strong className="text-ink">{primaryProvider}</strong> ·
            Fallback: <strong className="text-ink">{enableFallback ? 'Enabled' : 'Disabled'}</strong>.
          </p>
        </div>
        {isSuperAdmin && (
          <Button type="button" size="sm" onClick={() => void handleRestoreV2Flag()}>
            Restore v2 Engine UI
          </Button>
        )}
      </div>
      <QuotaGovernanceTab />
    </div>
  );
}
