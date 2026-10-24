import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Brain, ChevronDown, RefreshCw, Sliders } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import type { SelectionMode } from '../types/ai-settings.types';

export function RuntimeModelStrip() {
  const {
    providers,
    primaryProvider,
    setPrimaryProvider,
    revision,
    selectionMode,
    setSelectionMode,
    pinnedModel,
    setPinnedModel,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    enableFallback,
    setEnableFallback,
    showTuning,
    setShowTuning,
    saving,
    discoveredModels,
    commitSettingsPatch,
    handleDiscoveryFetch,
  } = useAiSettingsContext();

  const pinnedProviderModels = useMemo(
    () => discoveredModels.filter((m) => m.providerId === primaryProvider),
    [discoveredModels, primaryProvider]
  );

  const handleSaveGlobalSettings = async () => {
    const payload: Record<string, any> = {
      selectionMode,
      provider: primaryProvider,
      temperature,
      maxTokens,
      enableFallback,
    };
    if (selectionMode === 'manual' && primaryProvider && pinnedModel) {
      payload[primaryProvider] = {
        ...payload[primaryProvider],
        model: pinnedModel,
        ...(providers.find((p) => p.id === primaryProvider)?.keyless ? { enabled: true } : {}),
      };
    }
    try {
      await commitSettingsPatch(payload, 'Runtime routing and generation parameters saved.');
    } catch {
      /* surfaced */
    }
  };

  const handleRefreshPinnedModels = async () => {
    if (!primaryProvider) return;
    await handleDiscoveryFetch(primaryProvider);
  };

  return (
    <Card className="border-border bg-surface" data-testid="runtime-model-strip">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Brain className="size-4 text-brand-600 shrink-0" />
              <h2 className="text-base font-extrabold text-ink tracking-tight">
                Runtime model selection
              </h2>
              <span className="rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                Primary: {primaryProvider}
              </span>
              <span className="text-xs text-ink-muted">Rev #{revision}</span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              Dispatch mode across {providers.length} registered providers. Resume Import toggle
              lives in{' '}
              <Link to="/admin/settings" className="font-semibold text-brand-700 underline">
                Platform Settings
              </Link>
              .
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
            <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
              <label htmlFor="ai-selection-mode" className="text-xs font-bold text-ink shrink-0">
                Selection mode
              </label>
              <select
                id="ai-selection-mode"
                aria-label="Selection mode"
                value={selectionMode}
                onChange={(e) => setSelectionMode(e.target.value as SelectionMode)}
                className="max-w-full min-w-0 rounded-xl border border-border bg-canvas px-2.5 py-1.5 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="auto">Auto / Recommended</option>
                <option value="quality">Quality First</option>
                <option value="speed">Speed First</option>
                <option value="balanced">Balanced</option>
                <option value="manual">Manual Pin</option>
              </select>
            </div>

            <label
              htmlFor="ai-enable-fallback"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink cursor-pointer"
            >
              <input
                id="ai-enable-fallback"
                type="checkbox"
                checked={enableFallback}
                onChange={(e) => setEnableFallback(e.target.checked)}
                className="rounded border-border text-brand-600 focus:ring-brand-500"
              />
              <span>Failover Mesh</span>
            </label>

            <button
              type="button"
              aria-expanded={showTuning}
              onClick={() => setShowTuning((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:text-ink cursor-pointer"
            >
              <Sliders className="size-3.5 shrink-0" />
              <span>
                Tuning ({temperature.toFixed(2)} · {maxTokens} tok)
              </span>
              <ChevronDown
                className={cn('size-3.5 transition-transform', showTuning && 'rotate-180')}
              />
            </button>

            <Button
              type="button"
              size="sm"
              onClick={() => void handleSaveGlobalSettings()}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save All Changes'}
            </Button>
          </div>
        </div>

        {/* Manual Pin Row */}
        {selectionMode === 'manual' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border">
            <div>
              <label
                htmlFor="ai-pinned-provider"
                className="block text-xs font-semibold text-ink mb-1"
              >
                Pinned provider
              </label>
              <select
                id="ai-pinned-provider"
                aria-label="Pinned provider"
                value={primaryProvider}
                onChange={(e) => {
                  setPrimaryProvider(e.target.value);
                  setPinnedModel('');
                }}
                className="w-full rounded-xl border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink"
              >
                {providers
                  .filter((p) => p.group !== 'search')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="ai-pinned-model"
                className="block text-xs font-semibold text-ink mb-1"
              >
                Pinned model
              </label>
              <select
                id="ai-pinned-model"
                aria-label="Pinned model"
                value={pinnedModel}
                onChange={(e) => setPinnedModel(e.target.value)}
                className="w-full rounded-xl border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink"
              >
                <option value="">Select discovered model...</option>
                {pinnedProviderModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRefreshPinnedModels()}
                className="w-full sm:w-auto"
              >
                <RefreshCw className="size-3.5 mr-1.5" />
                Refresh selectable models
              </Button>
            </div>
          </div>
        )}

        {/* Expandable Generation Parameters */}
        {showTuning && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="ai-temperature-slider" className="font-semibold text-ink">
                  Temperature (0.0 – 2.0)
                </label>
                <span className="font-mono font-bold text-ink">{temperature.toFixed(2)}</span>
              </div>
              <input
                id="ai-temperature-slider"
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full accent-brand-600"
              />
              <div className="flex justify-between text-[11px] text-ink-muted">
                <span>0.0 Deterministic</span>
                <span>1.0 Balanced</span>
                <span>2.0 High Variance</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="ai-max-tokens-slider" className="font-semibold text-ink">
                  Max Output Tokens (256 – 8192)
                </label>
                <span className="font-mono font-bold text-ink">{maxTokens} tok</span>
              </div>
              <input
                id="ai-max-tokens-slider"
                type="range"
                min={256}
                max={8192}
                step={128}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                className="w-full accent-brand-600"
              />
              <div className="flex justify-between text-[11px] text-ink-muted">
                <span>256</span>
                <span>4096</span>
                <span>8192</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
