import { ChevronDown, ChevronRight, Key, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import type { ProviderCatalogEntry } from '../types/ai-settings.types';
import { formatCredentialSource } from '../utils/masking';
import { ProviderRowExpanded } from './ProviderRowExpanded';

export function ProviderRow({ provider: p }: { provider: ProviderCatalogEntry }) {
  const {
    primaryProvider,
    cooldowns,
    maskedKeys,
    expandedRowId,
    setExpandedRowId,
    testingId,
    probeStoredProvider,
    handleToggleProvider,
    openDialog,
    resetModalDrafts,
    setModalSelectedId,
    setModalTab,
    modalKeyInputRef,
  } = useAiSettingsContext();

  const isExpanded = expandedRowId === p.id;
  const isPrimary = p.id === primaryProvider;
  const cooldown = cooldowns[p.id];
  const serverMask = maskedKeys[p.id] || p.maskedKey || '';

  const openQuickAddForProvider = (target: ProviderCatalogEntry) => {
    resetModalDrafts();
    setModalSelectedId(target.id);
    setModalTab('single');
    openDialog('configure-provider', target.id);
    requestAnimationFrame(() => {
      modalKeyInputRef.current?.focus();
    });
  };

  return (
    <div
      data-testid={`provider-row-${p.id}`}
      className={cn(
        'rounded-2xl border transition-colors bg-surface',
        isPrimary ? 'border-brand-300' : 'border-border'
      )}
    >
      <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <input
            id={`toggle-provider-${p.id}`}
            type="checkbox"
            aria-label={`Enable ${p.name}`}
            checked={Boolean(p.enabled)}
            onChange={(e) => void handleToggleProvider(p, e.target.checked)}
            className="mt-1 sm:mt-0 size-4 rounded border-border text-brand-600 focus:ring-brand-500 shrink-0 cursor-pointer"
          />

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-ink">{p.name}</span>
              {isPrimary && (
                <span className="rounded-md bg-brand-600 px-1.5 py-0.5 text-2xs font-extrabold uppercase text-white">
                  Primary
                </span>
              )}
              {p.group === 'search' && (
                <span className="rounded-md bg-canvas-soft border border-border px-1.5 py-0.5 text-2xs font-semibold text-ink-secondary">
                  web search
                </span>
              )}
              <span className="text-xs text-ink-muted">
                {p.keyless
                  ? 'Keyless'
                  : `${p.keysCount || 0} ${p.keysCount === 1 ? 'key' : 'keys'}`}
              </span>
              {serverMask && (
                <span
                  data-testid={`masked-key-${p.id}`}
                  className="rounded-md bg-canvas px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-secondary border border-border"
                >
                  {serverMask}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {cooldown || p.status === 'issues' || p.status === 'cooldown' ? (
                <span className="font-semibold text-error-700">
                  {cooldown
                    ? `Cooldown (${cooldown.remainingSeconds}s)`
                    : 'Connection Issue'}
                </span>
              ) : p.status === 'healthy' ? (
                <span className="font-semibold text-success-700">
                  Verified{p.latencyMs ? ` (${p.latencyMs}ms)` : ''}
                </span>
              ) : p.enabled && (p.configuredOnServer || p.keyless) ? (
                <span className="font-medium text-ink-secondary">
                  Configured ({formatCredentialSource(p.credentialSource, p.keyless)})
                </span>
              ) : p.hasKey ? (
                <span className="font-medium text-warning-700">
                  Disabled (Key Stored)
                </span>
              ) : (
                <span className="text-ink-muted">Not Configured</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!p.keyless && !p.hasKey && (
            <Button
              type="button"
              size="sm"
              onClick={() => openQuickAddForProvider(p)}
            >
              <Key className="size-3.5 mr-1" />
              Add key
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Test Connection for ${p.name}`}
            disabled={
              testingId === p.id || (!p.keyless && !p.hasKey && !p.configuredOnServer)
            }
            onClick={() => void probeStoredProvider(p.id)}
          >
            {testingId === p.id ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : null}
            Test Connection
          </Button>
          <button
            type="button"
            data-testid={`expand-provider-${p.id}`}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${p.name} settings`}
            onClick={() =>
              setExpandedRowId((curr) => (curr === p.id ? null : p.id))
            }
            className="rounded-xl border border-border bg-canvas p-2 text-ink-secondary hover:text-ink cursor-pointer"
          >
            {isExpanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        </div>
      </div>

      {isExpanded && <ProviderRowExpanded provider={p} />}
    </div>
  );
}
