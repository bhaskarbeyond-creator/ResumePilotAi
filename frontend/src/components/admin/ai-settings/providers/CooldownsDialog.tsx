import React from 'react';
import { Clock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAiSettingsContext } from '../context/AiSettingsContext';

export function CooldownsDialog() {
  const { activeDialog, closeDialog, cooldowns, loadSettings } = useAiSettingsContext();

  return (
    <Dialog open={activeDialog === 'cooldowns'} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cooldowns &amp; Rate-Limit Ledger</DialogTitle>
          <DialogDescription>
            Providers temporarily benched due to upstream 429 Retry-After or 5xx responses expire
            automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {Object.keys(cooldowns).length === 0 ? (
            <p className="text-xs text-ink-secondary py-3 flex items-center gap-2">
              <ShieldCheck className="size-4 text-success-700" />
              No active platform cooldowns. All enabled providers are eligible for routing.
            </p>
          ) : (
            Object.entries(cooldowns).map(([id, state]) => (
              <div
                key={id}
                className="rounded-xl border border-warning-100 bg-warning-50 p-3 text-xs flex items-center justify-between gap-2"
              >
                <div>
                  <span className="font-bold text-ink">{id}</span>
                  <span className="text-ink-secondary ml-2">{state.reason || 'Rate limit'}</span>
                </div>
                <span className="font-mono font-bold text-warning-700 flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {state.remainingSeconds}s
                </span>
              </div>
            ))
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadSettings()}>
            Refresh Cooldowns
          </Button>
          <Button type="button" size="sm" onClick={closeDialog}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
