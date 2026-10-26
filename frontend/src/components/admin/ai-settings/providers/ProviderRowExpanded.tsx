import { ExternalLink, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAiSettingsContext } from '../context/AiSettingsContext';
import type { ProviderCatalogEntry } from '../types/ai-settings.types';
import { formatCredentialSource, splitKeys } from '../utils/masking';

export function ProviderRowExpanded({ provider: p }: { provider: ProviderCatalogEntry }) {
  const {
    primaryProvider,
    maskedKeys,
    singleKeyDrafts,
    setSingleKeyDrafts,
    poolKeyDrafts,
    setPoolKeyDrafts,
    showRowKey,
    setShowRowKey,
    modelDrafts,
    setModelDrafts,
    baseUrlDrafts,
    setBaseUrlDrafts,
    saving,
    openDialog,
    handleSaveRowSingleKey,
    handleSaveRowPool,
    handleSaveRowConfig,
    handleSetPrimaryImmediate,
  } = useAiSettingsContext();

  const isPrimary = p.id === primaryProvider;
  const serverMask = maskedKeys[p.id] || p.maskedKey || '';
  const poolDraftCount = splitKeys(poolKeyDrafts[p.id] || '').length;

  return (
    <div className="border-t border-border bg-canvas p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-4 rounded-b-2xl">
      {/* Credentials Column */}
      <div className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
            Server Credential Vault
          </h3>
          <span className="text-xs font-semibold text-ink-secondary">
            Source: {formatCredentialSource(p.credentialSource, p.keyless)}
          </span>
        </div>

        {serverMask && (
          <div className="rounded-xl border border-border bg-surface px-3 py-2 flex items-center justify-between gap-2 text-xs">
            <span className="text-ink-muted">Active Server Key:</span>
            <span className="font-mono font-bold text-ink">{serverMask}</span>
          </div>
        )}

        {!p.keyless && (
          <div className="space-y-2">
            <label
              htmlFor={`row-key-input-${p.id}`}
              className="block text-xs font-semibold text-ink"
            >
              {p.hasKey ? 'Replace API Key (write-only)' : 'Enter API Key'}
            </label>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  id={`row-key-input-${p.id}`}
                  type={showRowKey[p.id] ? 'text' : 'password'}
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={
                    p.hasKey
                      ? `${serverMask || '••••••••'} (Leave blank to keep)`
                      : `Paste API Key for ${p.name}...`
                  }
                  value={singleKeyDrafts[p.id] || ''}
                  onChange={(e) =>
                    setSingleKeyDrafts((prev) => ({
                      ...prev,
                      [p.id]: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 pr-9 text-xs text-ink font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="button"
                  aria-label={
                    showRowKey[p.id]
                      ? `Hide API key for ${p.name}`
                      : `Show API key for ${p.name}`
                  }
                  onClick={() =>
                    setShowRowKey((prev) => ({
                      ...prev,
                      [p.id]: !prev[p.id],
                    }))
                  }
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                >
                  {showRowKey[p.id] ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </button>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!singleKeyDrafts[p.id]?.trim() || saving}
                onClick={() => void handleSaveRowSingleKey(p)}
              >
                Save Key
              </Button>
            </div>

            {p.hasKey && p.credentialSource !== 'environment' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openDialog('confirm-clear-key', p.id)}
                className="text-error-700 border-error-100 hover:bg-error-50"
              >
                <Trash2 className="size-3.5 mr-1.5" />
                Remove Stored Key
              </Button>
            )}

            <div className="pt-2 space-y-1.5">
              <label
                htmlFor={`row-pool-input-${p.id}`}
                className="block text-xs font-semibold text-ink"
              >
                Multi-Key Rotation Pool (one key per line or comma-separated)
              </label>
              <textarea
                id={`row-pool-input-${p.id}`}
                rows={2}
                spellCheck={false}
                placeholder="Enter multiple keys for automatic 429 rotation..."
                value={poolKeyDrafts[p.id] || ''}
                onChange={(e) =>
                  setPoolKeyDrafts((prev) => ({
                    ...prev,
                    [p.id]: e.target.value,
                  }))
                }
                className="w-full rounded-xl border border-border bg-surface p-2.5 text-xs font-mono text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink-muted">
                  {poolDraftCount > 0
                    ? `${poolDraftCount} key(s) staged for server vault`
                    : 'Keys are never echoed in plaintext after save.'}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={poolDraftCount === 0 || saving}
                  onClick={() => void handleSaveRowPool(p)}
                >
                  Save Key Pool
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Routing, Model & Custom Endpoint Column */}
      <div className="space-y-3 min-w-0">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
          Model &amp; Endpoint Override
        </h3>

        <div>
          <label
            htmlFor={`row-model-input-${p.id}`}
            className="block text-xs font-semibold text-ink mb-1"
          >
            Default Model Target
          </label>
          <Input
            id={`row-model-input-${p.id}`}
            value={modelDrafts[p.id] ?? p.defaultModel ?? ''}
            onChange={(e) =>
              setModelDrafts((prev) => ({
                ...prev,
                [p.id]: e.target.value,
              }))
            }
            placeholder={p.defaultModel || 'auto'}
          />
        </div>

        <div>
          <label
            htmlFor={`row-baseurl-input-${p.id}`}
            className="block text-xs font-semibold text-ink mb-1"
          >
            Custom Endpoint Base URL (optional)
          </label>
          <Input
            id={`row-baseurl-input-${p.id}`}
            value={baseUrlDrafts[p.id] ?? ''}
            onChange={(e) =>
              setBaseUrlDrafts((prev) => ({
                ...prev,
                [p.id]: e.target.value,
              }))
            }
            placeholder={p.baseUrl || 'https://api.example.com/v1'}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void handleSaveRowConfig(p)}
          >
            Save Provider Config
          </Button>
          {p.group !== 'search' && !isPrimary && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => void handleSetPrimaryImmediate(p)}
            >
              Set as Primary
            </Button>
          )}
          {p.docUrl && (
            <a
              href={p.docUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline ml-auto"
            >
              Provider Docs
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
