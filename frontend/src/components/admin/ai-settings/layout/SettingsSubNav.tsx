import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAiSettingsContext } from '../context/AiSettingsContext';

export function SettingsSubNav() {
  const {
    activeSubtab,
    selectSubtab,
    configuredCount,
    providers,
    openDialog,
    resetModalDrafts,
    setModalSelectedId,
    setModalTab,
  } = useAiSettingsContext();

  const isDiscoveryOrModelsView = activeSubtab === 'discovery' || activeSubtab === 'models';
  const isMetricsOrQuotasView = activeSubtab === 'metrics' || activeSubtab === 'quotas';
  const isGatewayOrClaudeView = activeSubtab === 'unified-gateway' || activeSubtab === 'claude';

  return (
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-border pb-3">
      <div className="flex flex-wrap items-center gap-1.5" aria-label="AI Engine Views">
        <button
          type="button"
          onClick={() => selectSubtab('providers')}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer',
            activeSubtab === 'providers'
              ? 'bg-brand-600 text-white'
              : 'bg-canvas text-ink-secondary hover:text-ink border border-border'
          )}
        >
          Providers &amp; Keys ({configuredCount}/{providers.length})
        </button>
        <button
          type="button"
          onClick={() => selectSubtab('discovery')}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer',
            isDiscoveryOrModelsView
              ? 'bg-brand-600 text-white'
              : 'bg-canvas text-ink-secondary hover:text-ink border border-border'
          )}
        >
          Models &amp; Fallback Chains
        </button>
        <button
          type="button"
          onClick={() => selectSubtab('metrics')}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer',
            isMetricsOrQuotasView
              ? 'bg-brand-600 text-white'
              : 'bg-canvas text-ink-secondary hover:text-ink border border-border'
          )}
        >
          Quotas &amp; Telemetry
        </button>
        <button
          type="button"
          onClick={() => selectSubtab('unified-gateway')}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer',
            isGatewayOrClaudeView
              ? 'bg-brand-600 text-white'
              : 'bg-canvas text-ink-secondary hover:text-ink border border-border'
          )}
        >
          Claude Code &amp; Agents
        </button>
        <button
          type="button"
          onClick={() => selectSubtab('playground')}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer',
            activeSubtab === 'playground'
              ? 'bg-brand-600 text-white'
              : 'bg-canvas text-ink-secondary hover:text-ink border border-border'
          )}
        >
          Playground
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            resetModalDrafts();
            setModalSelectedId('');
            setModalTab('single');
            openDialog('configure-provider');
          }}
        >
          <Plus className="size-3.5 mr-1" />
          Configure Provider
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openDialog('key-pool')}
        >
          Manage key pools
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openDialog('cooldowns')}
        >
          Manage cooldowns
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openDialog('discovery')}
        >
          Discover models
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openDialog('snippets')}
        >
          Integration snippets
        </Button>
      </div>
    </div>
  );
}
