import { Layers, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAiSettingsContext } from '../context/AiSettingsContext';

export function KeyPoolTab() {
  const {
    providers,
    maskedKeys,
    openDialog,
    resetModalDrafts,
    setModalTab,
    setExpandedRowId,
    selectSubtab,
  } = useAiSettingsContext();

  return (
    <Card className="border-border bg-surface">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <Layers className="size-4 text-brand-600" />
              Key Pool Manager
            </h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Round-robin credential pools with automatic 429 cooldown isolation per key.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              resetModalDrafts();
              setModalTab('pool');
              openDialog('configure-provider');
            }}
          >
            <Plus className="size-3.5 mr-1" />
            Add Rotation Pool
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {providers.filter((p) => p.hasKey && !p.keyless).length === 0 ? (
            <p className="text-xs text-ink-muted py-4 col-span-2">
              No credential pools configured yet. Click &ldquo;Add Rotation Pool&rdquo; to add keys.
            </p>
          ) : (
            providers
              .filter((p) => p.hasKey && !p.keyless)
              .map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-border bg-canvas p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-ink">{p.name}</div>
                    <div className="text-xs font-mono text-ink-secondary mt-0.5">
                      {maskedKeys[p.id] || '••••••••'} ({p.keysCount} key
                      {p.keysCount === 1 ? '' : 's'})
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setExpandedRowId(p.id);
                      selectSubtab('providers');
                    }}
                  >
                    Edit Pool
                  </Button>
                </div>
              ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
