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

export function ModelDiscoveryDialog() {
  const {
    activeDialog,
    closeDialog,
    providers,
    discoveryProvider,
    setDiscoveryProvider,
    discoveryLoading,
    discoveryError,
    discoveryModels,
    handleDiscoveryFetch,
  } = useAiSettingsContext();

  return (
    <Dialog open={activeDialog === 'discovery'} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Model Discovery</DialogTitle>
          <DialogDescription>
            Refresh live models directly from an upstream provider endpoint.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label
              htmlFor="dialog-discovery-provider"
              className="block text-xs font-semibold text-ink mb-1"
            >
              Provider
            </label>
            <select
              id="dialog-discovery-provider"
              value={discoveryProvider}
              onChange={(e) => setDiscoveryProvider(e.target.value)}
              className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-xs font-semibold text-ink"
            >
              <option value="">Select provider...</option>
              {providers
                .filter((p) => p.group !== 'search')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!discoveryProvider || discoveryLoading}
            onClick={() => void handleDiscoveryFetch(discoveryProvider)}
          >
            {discoveryLoading ? 'Fetching...' : 'Fetch Live Models'}
          </Button>
          {discoveryError && (
            <p role="alert" className="text-xs font-semibold text-error-700">
              {discoveryError}
            </p>
          )}
          {discoveryModels.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1 border-t border-border pt-2">
              {discoveryModels.map((m) => (
                <div
                  key={`dlg-${m.providerId}-${m.id}`}
                  className="text-xs font-mono text-ink flex items-center justify-between py-1"
                >
                  <span className="truncate">{m.id}</span>
                  <span className="text-ink-muted ml-2 shrink-0">
                    {m.catalogStatus || 'fresh'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={closeDialog}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
