import React from 'react';
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

export function KeyPoolManagerDialog() {
  const {
    activeDialog,
    closeDialog,
    providers,
    maskedKeys,
    setExpandedRowId,
    selectSubtab,
  } = useAiSettingsContext();

  return (
    <Dialog open={activeDialog === 'key-pool'} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Key Pool Manager</DialogTitle>
          <DialogDescription>
            Configured server key pools across all {providers.length} providers. Secrets are
            masked to last-4 characters.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {providers.filter((p) => p.hasKey && !p.keyless).length === 0 ? (
            <p className="text-xs text-ink-muted py-3">
              No multi-key pools configured on server yet.
            </p>
          ) : (
            providers
              .filter((p) => p.hasKey && !p.keyless)
              .map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-border bg-canvas px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-ink">{p.name}</div>
                    <div className="font-mono text-ink-secondary">
                      {maskedKeys[p.id] || '••••••••'} · {p.keysCount} key(s)
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      closeDialog();
                      setExpandedRowId(p.id);
                      selectSubtab('providers');
                    }}
                  >
                    Manage
                  </Button>
                </div>
              ))
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={closeDialog}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
