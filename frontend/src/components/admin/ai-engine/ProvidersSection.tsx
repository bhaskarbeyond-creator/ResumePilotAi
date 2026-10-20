/**
 * Providers — one card per runtime provider.
 *
 * The card is the parity replacement for the legacy per-provider panels, and it
 * keeps every legacy capability (enable, model, base URL, masked key, write-only
 * key entry, explicit clear, connectivity test, live model fetch) while adding
 * credential provenance, deployment-managed guards and discovery results.
 *
 * No credential ever reaches client state from the server: the only key-shaped
 * text rendered is the server's own mask (`maskedKey`).
 */

import { useId, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Link2, PlugZap, RefreshCw, ShieldCheck, Trash2, TriangleAlert, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProviderRuntimeState } from '@/hooks/use-ai-engine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CREDENTIAL_SOURCE_LABEL, PROVIDER_REGISTRY, providerMeta, type ProviderId } from './registry';
import { Field, InlineAlert, Panel, Spinner, StatusPill, relativeTime } from './primitives';
import type { EngineDraft, ProviderTestState } from './types';

const MODEL_PATTERN = /^[A-Za-z0-9._:/-]{1,150}$/;
const BASE_URL_PATTERN = /^https?:\/\/[A-Za-z0-9._:/-]{1,300}$/;

export interface ProvidersSectionProps {
  draft: EngineDraft;
  serverStates: Record<ProviderId, ProviderRuntimeState>;
  canEdit: boolean;
  saving: boolean;
  secretInputs: Partial<Record<ProviderId, string>>;
  revealed: Partial<Record<ProviderId, boolean>>;
  pendingClear: Partial<Record<ProviderId, boolean>>;
  tests: Partial<Record<ProviderId, ProviderTestState>>;
  discovering: Partial<Record<ProviderId, boolean>>;
  discoveredCounts: Partial<Record<ProviderId, number>>;
  /** `password` in normal use; the operator can reveal their own draft entry. */
  secretInputType?: 'text' | 'password';
  onProviderChange: (id: ProviderId, patch: { enabled?: boolean; model?: string; baseUrl?: string }) => void;
  onSecretChange: (id: ProviderId, value: string) => void;
  onToggleReveal: (id: ProviderId) => void;
  onRequestClear: (id: ProviderId) => void;
  onCancelClear: (id: ProviderId) => void;
  onTest: (id: ProviderId) => void;
  onDiscover: (id: ProviderId) => void;
}

export function ProvidersSection({
  draft,
  serverStates,
  canEdit,
  saving,
  secretInputs,
  revealed,
  pendingClear,
  tests,
  discovering,
  discoveredCounts,
  secretInputType = 'password',
  onProviderChange,
  onSecretChange,
  onToggleReveal,
  onRequestClear,
  onCancelClear,
  onTest,
  onDiscover,
}: ProvidersSectionProps) {
  const configured = PROVIDER_REGISTRY.filter((p) => serverStates[p.id]?.credentialConfigured);
  const dirtyProviders = PROVIDER_REGISTRY.filter((p) => {
    const remote = serverStates[p.id];
    const local = draft.providers[p.id];
    return local.enabled !== remote?.enabled || local.model !== remote?.model || local.baseUrl !== (remote?.baseUrl ?? '');
  });

  return (
    <div className="space-y-4" data-testid="ai-engine-section-providers">
      <Panel
        title="Provider fleet"
        description="Six runtime adapters are compiled into this deployment. A provider becomes usable only when its credential resolves and its toggle is on."
        actions={
          <span className="text-[11px] font-semibold text-ink-muted">
            {configured.length} of {PROVIDER_REGISTRY.length} configured
            {dirtyProviders.length > 0 && ` · ${dirtyProviders.length} unsaved`}
          </span>
        }
      >
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PROVIDER_REGISTRY.map((provider) => {
            const state = serverStates[provider.id];
            return (
              <li
                key={provider.id}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-canvas-soft/50 px-2.5 py-2"
              >
                <span className={cn('size-2 shrink-0 rounded-full', state?.enabled ? provider.accent.dot : 'bg-neutral-300 dark:bg-neutral-600')} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{provider.name}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                  {state?.credentialConfigured ? 'key' : 'no key'}
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>

      {PROVIDER_REGISTRY.map((provider) => (
        <ProviderCard
          key={provider.id}
          providerId={provider.id}
          draft={draft}
          state={serverStates[provider.id]}
          isPrimary={draft.primaryProvider === provider.id}
          canEdit={canEdit}
          saving={saving}
          secretValue={secretInputs[provider.id] ?? ''}
          reveal={revealed[provider.id] === true}
          pendingClear={pendingClear[provider.id] === true}
          test={tests[provider.id]}
          discovering={discovering[provider.id] === true}
          discoveredCount={discoveredCounts[provider.id]}
          secretInputType={secretInputType}
          onProviderChange={onProviderChange}
          onSecretChange={onSecretChange}
          onToggleReveal={onToggleReveal}
          onRequestClear={onRequestClear}
          onCancelClear={onCancelClear}
          onTest={onTest}
          onDiscover={onDiscover}
        />
      ))}
    </div>
  );
}

function ProviderCard({
  providerId,
  draft,
  state,
  isPrimary,
  canEdit,
  saving,
  secretValue,
  reveal,
  pendingClear,
  test,
  discovering,
  discoveredCount,
  secretInputType,
  onProviderChange,
  onSecretChange,
  onToggleReveal,
  onRequestClear,
  onCancelClear,
  onTest,
  onDiscover,
}: {
  providerId: ProviderId;
  draft: EngineDraft;
  state?: ProviderRuntimeState;
  isPrimary: boolean;
  canEdit: boolean;
  saving: boolean;
  secretValue: string;
  reveal: boolean;
  pendingClear: boolean;
  test?: ProviderTestState;
  discovering: boolean;
  discoveredCount?: number;
  secretInputType: 'text' | 'password';
  onProviderChange: ProvidersSectionProps['onProviderChange'];
  onSecretChange: ProvidersSectionProps['onSecretChange'];
  onToggleReveal: ProvidersSectionProps['onToggleReveal'];
  onRequestClear: ProvidersSectionProps['onRequestClear'];
  onCancelClear: ProvidersSectionProps['onCancelClear'];
  onTest: ProvidersSectionProps['onTest'];
  onDiscover: ProvidersSectionProps['onDiscover'];
}) {
  const meta = providerMeta(providerId)!;
  const local = draft.providers[providerId];
  const baseId = useId();
  const [customModel, setCustomModel] = useState('');
  const modelError = local.model && !MODEL_PATTERN.test(local.model) ? 'Model ids may use letters, digits and . _ : / - only (max 150).' : null;
  const baseUrlError =
    local.baseUrl && !BASE_URL_PATTERN.test(local.baseUrl) ? 'Use an http(s) URL without spaces, e.g. https://api.provider.com/v1' : null;
  const keyConfigured = state?.credentialConfigured === true;
  const modelOptions = Array.from(new Set([...meta.seeds.map((seed) => seed.id), ...(local.model ? [local.model] : [])]));
  const selectValue = modelOptions.includes(local.model) ? local.model : '__custom__';

  return (
    <Panel
      testId={`ai-engine-provider-${providerId}`}
      className={cn(isPrimary && 'ring-1', isPrimary && meta.accent.ring)}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn('size-2.5 rounded-full', state?.enabled ? meta.accent.dot : 'bg-neutral-300 dark:bg-neutral-600')} aria-hidden="true" />
          {meta.name}
          <span className="text-[11px] font-medium text-ink-muted">{meta.vendor}</span>
          {isPrimary && (
            <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">primary</span>
          )}
          {keyConfigured ? (
            <StatusPill tone="ready">Credential present</StatusPill>
          ) : (
            <StatusPill tone="degraded">No credential</StatusPill>
          )}
          {state?.environmentManaged && <StatusPill tone="neutral" showDot={false}>Deployment-managed</StatusPill>}
          {pendingClear && <StatusPill tone="unavailable">Removal pending save</StatusPill>}
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[11px]">{meta.transport}</span>
          <span aria-hidden="true">·</span>
          <a href={meta.docsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">
            <Link2 className="size-3" aria-hidden="true" /> API docs
          </a>
          <span aria-hidden="true">·</span>
          <a href={meta.consoleUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">
            <KeyRound className="size-3" aria-hidden="true" /> Key console
          </a>
        </span>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            disabled={!canEdit || test?.status === 'running'}
            onClick={() => onTest(providerId)}
            data-testid={`ai-engine-test-${providerId}`}
          >
            {test?.status === 'running' ? <RefreshCw className="size-3 animate-spin" aria-hidden="true" /> : <PlugZap className="size-3" aria-hidden="true" />}
            {test?.status === 'running' ? 'Testing…' : 'Test connectivity'}
          </Button>
          <Button
            variant="secondary"
            size="xs"
            disabled={!canEdit || discovering}
            onClick={() => onDiscover(providerId)}
            data-testid={`ai-engine-discover-${providerId}`}
          >
            {discovering ? <RefreshCw className="size-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-3" aria-hidden="true" />}
            {discovering ? 'Discovering…' : 'Discover models'}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Behaviour ── */}
        <div className="space-y-3.5">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-canvas-soft/60 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Runtime enabled</p>
              <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
                The runtime only considers this adapter when it is enabled AND a credential resolves.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={local.enabled}
              aria-label={`${meta.name} runtime enabled`}
              disabled={!canEdit || saving}
              onClick={() => onProviderChange(providerId, { enabled: !local.enabled })}
              data-testid={`ai-engine-enable-${providerId}`}
              className={cn(
                'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50',
                local.enabled ? 'border-brand-600 bg-brand-600' : 'border-neutral-300 bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-700',
              )}
            >
              <span className={cn('pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform', local.enabled ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
          </div>

          <Field
            label="Active model"
            htmlFor={`${baseId}-model`}
            hint={modelError ?? 'Pick a configuration seed or paste any model id the provider serves.'}
          >
            <select
              id={`${baseId}-model`}
              value={selectValue}
              disabled={!canEdit || saving}
              onChange={(event) => {
                const value = event.target.value;
                if (value !== '__custom__') onProviderChange(providerId, { model: value });
              }}
              className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 font-mono text-xs text-ink focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {meta.seeds.map((seed) => (
                <option key={seed.id} value={seed.id}>
                  {seed.label} — {seed.id}
                  {seed.note ? ` (${seed.note})` : ''}
                </option>
              ))}
              {local.model && !meta.seeds.some((seed) => seed.id === local.model) && (
                <option value={local.model}>{local.model} (custom)</option>
              )}
              <option value="__custom__">Custom model id…</option>
            </select>

            <div className="mt-2 flex gap-1.5">
              <Input
                value={customModel}
                onChange={(event) => setCustomModel(event.target.value)}
                placeholder={`e.g. ${meta.modelPlaceholder}`}
                aria-label={`Custom model id for ${meta.name}`}
                disabled={!canEdit || saving}
                className="h-8 font-mono text-xs"
                data-testid={`ai-engine-custom-model-${providerId}`}
              />
              <Button
                variant="secondary"
                size="xs"
                disabled={!canEdit || saving || !MODEL_PATTERN.test(customModel.trim())}
                onClick={() => {
                  const next = customModel.trim();
                  if (!next) return;
                  onProviderChange(providerId, { model: next });
                  setCustomModel('');
                }}
                data-testid={`ai-engine-apply-model-${providerId}`}
              >
                Apply
              </Button>
            </div>
            {modelError && (
              <p className="mt-1 text-[11px] font-semibold text-error-600" role="alert">
                {modelError}
              </p>
            )}
          </Field>

          <Field
            label="Endpoint override"
            htmlFor={`${baseId}-baseurl`}
            hint={baseUrlError ?? (meta.supportsBaseUrl ? 'Optional. Blank keeps the provider default endpoint.' : 'This adapter does not accept an override.')}
            action={
              (state?.baseUrl || local.baseUrl) && canEdit ? (
                <button
                  type="button"
                  onClick={() => onProviderChange(providerId, { baseUrl: '__clear__' })}
                  className="text-[11px] font-bold text-brand-700 hover:underline dark:text-brand-300"
                >
                  Reset to default
                </button>
              ) : null
            }
          >
            <Input
              id={`${baseId}-baseurl`}
              value={local.baseUrl}
              onChange={(event) => onProviderChange(providerId, { baseUrl: event.target.value })}
              placeholder={state?.baseUrl || (providerId === 'openai' ? 'https://api.openai.com/v1' : 'provider default')}
              disabled={!canEdit || saving || !meta.supportsBaseUrl}
              className="h-8 font-mono text-xs"
              spellCheck={false}
              autoComplete="off"
            />
            {baseUrlError && (
              <p className="mt-1 text-[11px] font-semibold text-error-600" role="alert">
                {baseUrlError}
              </p>
            )}
          </Field>
        </div>

        {/* ── Credential ── */}
        <div className="space-y-3.5">
          <div className="rounded-xl border border-border bg-canvas-soft/60 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Credential provenance</p>
              <StatusPill tone={keyConfigured ? 'ready' : 'degraded'} showDot={false}>
                {CREDENTIAL_SOURCE_LABEL[state?.credentialSource ?? 'none'] ?? state?.credentialSource ?? 'Not configured'}
              </StatusPill>
            </div>
            <p className="mt-1 break-all font-mono text-[11px] text-ink-secondary">
              {keyConfigured ? state?.maskedKey || '•••• (mask issued by server)' : 'No server-side credential resolved.'}
            </p>
            <p className="mt-1 text-[10px] leading-snug text-ink-muted">
              {state?.environmentManaged
                ? 'Resolved from the deployment environment, which outranks stored secrets. It cannot be cleared from this panel.'
                : 'Stored server-side. This console only ever receives the mask above.'}
            </p>
          </div>

          <Field
            label={keyConfigured ? 'Replace API key (write-only)' : 'Add API key (write-only)'}
            htmlFor={`${baseId}-key`}
            hint="Sent once over TLS to the server, never stored in the browser, cleared from this form immediately after a successful save."
            action={
              keyConfigured && canEdit ? (
                pendingClear ? (
                  <button type="button" onClick={() => onCancelClear(providerId)} className="text-[11px] font-bold text-brand-700 hover:underline dark:text-brand-300">
                    Keep credential
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRequestClear(providerId)}
                    disabled={state?.environmentManaged}
                    title={state?.environmentManaged ? 'Deployment-managed credentials cannot be cleared here' : undefined}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-error-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`ai-engine-clear-${providerId}`}
                  >
                    <Trash2 className="size-3" aria-hidden="true" /> Revoke
                  </button>
                )
              ) : null
            }
          >
            <div className="relative">
              <Input
                id={`${baseId}-key`}
                type={reveal ? 'text' : secretInputType}
                value={secretValue}
                onChange={(event) => onSecretChange(providerId, event.target.value)}
                placeholder={keyConfigured ? 'Leave blank to keep the stored credential' : `Paste a ${meta.name} key to configure…`}
                disabled={!canEdit || saving || pendingClear}
                autoComplete="new-password"
                spellCheck={false}
                className="h-9 pr-16 font-mono text-xs"
                data-testid={`ai-engine-key-${providerId}`}
              />
              <button
                type="button"
                onClick={() => onToggleReveal(providerId)}
                aria-label={reveal ? `Hide ${meta.name} key` : `Show ${meta.name} key`}
                aria-pressed={reveal}
                className="absolute right-1 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-ink-muted hover:bg-neutral-100 hover:text-ink dark:hover:bg-neutral-800"
              >
                {reveal ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>
            {pendingClear && (
              <p className="mt-1 flex items-start gap-1 text-[11px] font-semibold text-error-600" role="status">
                <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                This credential is marked for removal and will be deleted when you save.
              </p>
            )}
          </Field>

          {test && (
            <div aria-live="polite">
              {test.status === 'running' ? (
                <div className="rounded-lg border border-border bg-canvas-soft/60 px-3 py-2">
                  <Spinner label={`Waiting for ${meta.name} to answer a real request…`} />
                </div>
              ) : test.status === 'ok' ? (
                <InlineAlert tone="success" title={`Reachable — ${meta.name} answered`}>
                  <span className="block break-words">{test.message}</span>
                  <span className="mt-0.5 block font-mono text-[10px] opacity-80">
                    {typeof test.clientDurationMs === 'number'
                      ? `${test.clientDurationMs} ms measured by this browser · ${relativeTime(test.at)}`
                      : relativeTime(test.at)}
                  </span>
                </InlineAlert>
              ) : (
                <InlineAlert tone="error" title={`Test failed${test.code ? ` (${test.code})` : ''}`}>
                  <span className="block break-words">{test.message}</span>
                  <span className="mt-0.5 block font-mono text-[10px] opacity-80">{relativeTime(test.at)}</span>
                </InlineAlert>
              )}
            </div>
          )}

          {typeof discoveredCount === 'number' && (
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
              {discoveredCount > 0 ? (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden="true" />
                  {discoveredCount} models returned by the provider’s catalogue endpoint.
                </>
              ) : (
                <>
                  <XCircle className="size-3.5 text-amber-600" aria-hidden="true" />
                  The catalogue answered with zero models.
                </>
              )}
            </p>
          )}

          {!keyConfigured && (
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-muted">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
              {secretValue.trim()
                ? 'A key is staged in this form. Connectivity and discovery can already use it; it is stored only when you save.'
                : 'Connectivity tests and model discovery need a resolvable credential. Add one above, or set the matching deployment secret.'}
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

export default ProvidersSection;
