import React from 'react';
import { Button } from '@/components/ui/button';
import { useAiSettingsContext } from '../context/AiSettingsContext';

export function TopUsersTable() {
  const { quotaData, openDialog } = useAiSettingsContext();

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <h4 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
        Top Consumers Today
      </h4>
      {!quotaData?.topConsumers?.length ? (
        <p className="text-xs text-ink-muted py-3">
          No AI quota consumption recorded for today ({quotaData?.todayDate || 'UTC'}).
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-ink-secondary">
                <th className="py-2 pr-3 font-semibold">User</th>
                <th className="py-2 px-3 font-semibold">Tier</th>
                <th className="py-2 px-3 font-semibold">Used / Limit</th>
                <th className="py-2 pl-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {quotaData.topConsumers.map((consumer) => (
                <tr key={consumer.uid} className="border-b border-border/60">
                  <td className="py-2 pr-3 font-medium text-ink">
                    {consumer.email || consumer.uid}
                  </td>
                  <td className="py-2 px-3 text-ink-secondary">
                    {consumer.membership || 'Basic'}
                  </td>
                  <td className="py-2 px-3 font-mono text-ink">
                    {consumer.count} / {consumer.limit || '—'}
                  </td>
                  <td className="py-2 pl-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openDialog('confirm-reset-user-quota', consumer.uid)}
                    >
                      Reset Quota
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
