/**
 * AI Multi-Provider Engine — Super Admin control surface.
 *
 * This tab is the modern replacement for the legacy
 * `src/components/admin/settings/AiSettings.jsx` panel. It keeps every legacy
 * capability and adds discovery, provenance, deep links and honest failure
 * states. It renders REAL data only:
 *
 *   GET  /api/admin/ai-settings              configuration, revision, credential provenance
 *   POST /api/admin/ai-settings              revisioned save (write-only secrets)
 *   POST /api/admin/ai/test-provider         one real provider round-trip
 *   POST /api/admin/ai/fetch-models          live per-provider catalogue
 *   GET  /api/admin/ai/quota-stats           usage ledger (MariaDB)
 *   POST /api/admin/ai/quota-limits          tier limits (revisioned)
 *   POST /api/admin/ai/reset-quota           per-user / global reset
 *   GET  /api/platform/operational-status/ai-providers   authoritative health row
 *   GET  /api/service-availability           public boolean beacon
 *
 * SECRET CONTRACT: API keys are write-only. Inputs use `type="password"`
 * (`secretInputType` below) until the operator reveals them, the server returns
 * only a mask, and the client clears the field after a successful save. No key
 * is ever written to localStorage/sessionStorage by this surface.
 *
 * DEEP LINKS: `?section=overview|providers|catalog|usage|telemetry` selects a
 * view directly, so an operator can bookmark or share an exact surface.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Brain, CloudOff, Lock, RefreshCw, Save, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import {
  engineStatusFrom,
  normaliseProviderStates,
  toApiError,
  useAiAvailability,
  useAiEngineSettings,
  useAiPlatformService,
  useAiQuota,
  useFetchModels,
  useResetQuota,
  useSaveAiSettings,
  useSaveQuotaLimits,
  useTestProvider,
  type AiSettingsResponse,
  type ProviderCatalogState,
  type QuotaStats,
} from '@/hooks/use-ai-engine';
import { OverviewSection } from './ai-engine/OverviewSection';
import { ProvidersSection } from './ai-engine/ProvidersSection';
import { CatalogSection } from './ai-engine/CatalogSection';
import { UsageSection } from './ai-engine/UsageSection';
import { TelemetrySection } from './ai-engine/TelemetrySection';
import { ConfirmDialog, ModelDetailDialog, ReauthDialog, type PendingAuthOperation } from './ai-engine/dialogs';
import { InlineAlert, Panel, Spinner, StatusPill, formatTime } from './ai-engine/primitives';
import { PROVIDER_IDS, providerMeta, type ProviderId } from './ai-engine/registry';
import {
  SECTIONS,
  changedFieldLabels,
  draftEquals,
  draftFromSettings,
  type CatalogMap,
  type EngineDraft,
  type SectionId,
  type TestMap,
} from './ai-engine/types';

const SECRET_INPUT_TYPE = 'password' as const;

const SECTION_ALIASES: Record<string, SectionId> = {
  overview: 'overview',
  posture: 'overview',
  routing: 'overview',
  providers: 'providers',
  credentials: 'providers',
  catalog: 'catalog',
  catalogue: 'catalog',
  models: 'catalog',
  usage: 'usage',
  quota: 'usage',
  quotausage: 'usage',
  telemetry: 'telemetry',
  observability: 'telemetry',
  health: 'telemetry',
};

function resolveSection(value: string | null): SectionId {
  if (!value) return 'overview';
  return SECTION_ALIASES[value.toLowerCase()] ?? 'overview';
}

type Toast = { tone: 'success' | 'error' | 'warning' | 'info'; title: string; text?: string } | null;

type ConfirmState =
  | { kind: 'clear'; provider: ProviderId }
  | { kind: 'reset-user'; uid: string; label: string }
  | { kind: 'reset-all' }
  | null;

export function AdminAiSettingsTab() {
  const { isSuperAdmin, claims } = useAuth();
  const canEdit = isSuperAdmin;
  const [searchParams, setSearchParams] = useSearchParams();
  const section = resolveSection(searchParams.get('section'));

  const settingsQuery = useAiEngineSettings();
  const serviceQuery = useAiPlatformService();
  const availabilityQuery = useAiAvailability();
  const quotaQuery = useAiQuota();
  const saveMutation = useSaveAiSettings();
  const testMutation = useTestProvider();
  const discoverMutation = useFetchModels();
  const quotaLimitMutation = useSaveQuotaLimits();
  const resetQuotaMutation = useResetQuota();

  const [draft, setDraft] = useState<EngineDraft | null>(null);
  const [baseline, setBaseline] = useState<EngineDraft | null>(null);
  const dirtyRef = useRef(false);
  const [secretInputs, setSecretInputs] = useState<Partial<Record<ProviderId, string>>>({});
  const [revealed, setRevealed] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [pendingClear, setPendingClear] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [clearedBaseUrls, setClearedBaseUrls] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [tests, setTests] = useState<TestMap>({});
  const [catalog, setCatalog] = useState<CatalogMap>({});
  const [toast, setToast] = useState<Toast>(null);
  const [saveError, setSaveError] = useState<{ code?: string; message: string } | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [quotaMessage, setQuotaMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [pendingAuth, setPendingAuth] = useState<PendingAuthOperation | null>(null);
  const [reauth, setReauth] = useState<{ open: boolean; code?: string; message?: string }>({ open: false });
  const [modelDetail, setModelDetail] = useState<{ id: string; name?: string; owned_by?: string; provider: ProviderId; source: string; fetchedAt?: string } | null>(null);

  const settings: AiSettingsResponse | undefined = settingsQuery.data;
  const serverStates = useMemo(() => normaliseProviderStates(settings), [settings]);
  const settingsError = settingsQuery.error ? toApiError(settingsQuery.error) : null;
  const forbidden = settingsError?.status === 403;
  const dirty = Boolean(draft && baseline && !draftEquals(draft, baseline));
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Adopt the server state on first load and whenever an untouched panel
  // reloads. Local edits are never discarded by a background refetch.
  useEffect(() => {
    if (!settings) return;
    if (dirtyRef.current) return;
    const next = draftFromSettings(settings);
    setDraft(next);
    setBaseline(next);
  }, [settings]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  const setSection = useCallback(
    (next: SectionId) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'overview') params.delete('section');
      else params.set('section', next);
      params.delete('tab');
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  /**
   * Tablist keyboard contract (WAI-ARIA authoring practices): Left/Right move
   * between sections, Home/End jump to the ends, and selection follows focus so
   * the deep link stays in sync with what the operator is looking at. Focus is
   * moved *to the panel* only on Enter/Space, so arrow-key scrubbing does not
   * yank the viewport on tall sections.
   */
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const order = SECTIONS.map((item) => item.id);
      // Derive the origin from the focused tab, not from the rendered `section`.
      // Selection follows focus, and React commits that state asynchronously —
      // so during a fast key repeat the closure's `section` is still the previous
      // value and would send the operator backwards instead of onwards.
      const focusedIndex = tabRefs.current.indexOf(event.target as HTMLButtonElement);
      const current = focusedIndex >= 0 ? focusedIndex : Math.max(0, order.indexOf(section));
      let next = current;
      if (event.key === 'ArrowRight') next = (current + 1) % order.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + order.length) % order.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = order.length - 1;
      else if (event.key === 'Enter' || event.key === ' ') {
        document.getElementById('ai-engine-panel')?.focus();
        return;
      } else {
        return;
      }
      event.preventDefault();
      setSection(order[next]);
      tabRefs.current[next]?.focus();
    },
    [section, setSection],
  );

  const reloadAll = useCallback(() => {
    settingsQuery.refetch();
    serviceQuery.refetch();
    availabilityQuery.refetch();
    quotaQuery.refetch();
  }, [settingsQuery, serviceQuery, availabilityQuery, quotaQuery]);

  const openReauth = (operation: PendingAuthOperation, code?: string, message?: string) => {
    setPendingAuth(operation);
    setReauth({ open: true, code, message });
  };

  const handleSave = async (): Promise<boolean> => {
    if (!draft || !settings) return false;
    if (!canEdit) {
      setSaveError({ code: 'FORBIDDEN', message: 'Only a Super Admin may change AI provider settings.' });
      return false;
    }
    setSaveError(null);
    try {
      const providers = Object.fromEntries(
        PROVIDER_IDS.map((id) => [
          id,
          {
            ...draft.providers[id],
            baseUrl: clearedBaseUrls[id] ? '__clear__' : draft.providers[id].baseUrl,
          },
        ]),
      ) as EngineDraft['providers'];
      const response = await saveMutation.mutateAsync({
        primaryProvider: draft.primaryProvider,
        enableFallback: draft.enableFallback,
        temperature: draft.temperature,
        maxTokens: draft.maxTokens,
        enableImportModule: draft.enableImportModule,
        providers,
        secrets: secretInputs,
        clearSecrets: pendingClear,
        expectedRevision: settings.revision,
      });
      const next = draftFromSettings(response);
      setDraft(next);
      setBaseline(next);
      setSecretInputs({});
      setPendingClear({});
      setClearedBaseUrls({});
      setRevealed({});
      setLastSavedAt(Date.now());
      setToast({
        tone: 'success',
        title: `Saved · revision ${response.revision}`,
        text: `Secrets were cleared from this form. Persistence: ${response.persistence === 'in-memory-certification' ? 'in-memory certification store (non-production)' : 'MariaDB'}.`,
      });
      return true;
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'RECENT_AUTH_REQUIRED' || apiError.code === 'SUPER_ADMIN_MFA_REQUIRED') {
        openReauth({ kind: 'save', label: 'Save AI engine configuration' }, apiError.code, apiError.message);
        return false;
      }
      setSaveError(apiError);
      if (apiError.code === 'AI_SETTINGS_CONFLICT') {
        setToast({ tone: 'warning', title: 'Revision conflict', text: apiError.message });
        await settingsQuery.refetch();
      }
      return false;
    }
  };

  const handleDiscard = () => {
    if (!settings) return;
    const next = draftFromSettings(settings);
    setDraft(next);
    setBaseline(next);
    setSecretInputs({});
    setPendingClear({});
    setClearedBaseUrls({});
    setRevealed({});
    setSaveError(null);
    setToast({ tone: 'info', title: 'Unsaved edits discarded', text: 'The form now matches the last server response.' });
  };

  const handleTest = async (provider: ProviderId): Promise<void> => {
    if (!draft) return;
    setTests((prev) => ({ ...prev, [provider]: { status: 'running', message: 'Waiting for the provider to answer…', at: new Date().toISOString() } }));
    try {
      const result = await testMutation.mutateAsync({
        provider,
        model: draft.providers[provider].model,
        apiKey: secretInputs[provider],
      });
      setTests((prev) => ({
        ...prev,
        [provider]: {
          status: 'ok',
          message: result.message ?? 'The provider answered the connectivity request.',
          clientDurationMs: result.clientDurationMs,
          at: result.testedAt,
        },
      }));
    } catch (error) {
      const apiError = toApiError(error);
      setTests((prev) => ({
        ...prev,
        [provider]: { status: 'error', message: apiError.message, at: new Date().toISOString(), code: apiError.code },
      }));
      if (apiError.code === 'RECENT_AUTH_REQUIRED' || apiError.code === 'SUPER_ADMIN_MFA_REQUIRED') {
        openReauth({ kind: 'test', label: `Test ${providerMeta(provider)?.name ?? provider} connectivity`, provider }, apiError.code, apiError.message);
      }
    }
  };

  const handleDiscover = async (provider: ProviderId): Promise<void> => {
    setCatalog((prev) => ({ ...prev, [provider]: { status: 'loading' } as ProviderCatalogState }));
    try {
      const result = await discoverMutation.mutateAsync({ provider, apiKey: secretInputs[provider] });
      setCatalog((prev) => ({ ...prev, [provider]: { status: 'ready', result } }));
    } catch (error) {
      const apiError = toApiError(error);
      setCatalog((prev) => ({
        ...prev,
        [provider]: { status: 'error', error: { code: apiError.code, message: apiError.message } },
      }));
      if (apiError.code === 'RECENT_AUTH_REQUIRED' || apiError.code === 'SUPER_ADMIN_MFA_REQUIRED') {
        openReauth({ kind: 'discover', label: `Discover ${providerMeta(provider)?.name ?? provider} models`, provider }, apiError.code, apiError.message);
      }
    }
  };

  const handleDiscoverAll = async () => {
    const targets = PROVIDER_IDS.filter((id) => serverStates[id]?.credentialConfigured || (secretInputs[id] ?? '').trim().length > 0);
    if (targets.length === 0) {
      setToast({
        tone: 'warning',
        title: 'No provider can be discovered',
        text: 'Discovery needs a resolvable credential. Add a key to a provider card first.',
      });
      return;
    }
    for (const id of targets) {
      // Sequential: keeps the provider round-trips (and any rate limits) legible.
      await handleDiscover(id);
    }
  };

  const handleQuotaLimits = async (limits: { basic: number; premium: number; admin: number }) => {
    setQuotaMessage(null);
    try {
      const result = await quotaLimitMutation.mutateAsync({
        basicDailyLimit: limits.basic,
        premiumDailyLimit: limits.premium,
        adminDailyLimit: limits.admin,
        expectedRevision: quotaQuery.data?.quotaRevision ?? 0,
      });
      setQuotaMessage({ tone: 'success', text: result.message ?? `Tier limits saved at revision ${result.revision ?? '—'}.` });
    } catch (error) {
      const apiError = toApiError(error);
      setQuotaMessage({ tone: 'error', text: `${apiError.message}${apiError.code ? ` (${apiError.code})` : ''}` });
      if (apiError.code === 'AI_QUOTA_CONFLICT') quotaQuery.refetch();
      if (apiError.code === 'RECENT_AUTH_REQUIRED' || apiError.code === 'SUPER_ADMIN_MFA_REQUIRED') {
        openReauth({ kind: 'quota', label: 'Save AI quota limits' }, apiError.code, apiError.message);
      }
    }
  };

  const performReset = async (input: { uid?: string; all?: boolean }) => {
    setQuotaMessage(null);
    try {
      const result = await resetQuotaMutation.mutateAsync(input);
      setQuotaMessage({ tone: 'success', text: result.message ?? 'AI quota reset completed.' });
    } catch (error) {
      const apiError = toApiError(error);
      setQuotaMessage({ tone: 'error', text: `${apiError.message}${apiError.code ? ` (${apiError.code})` : ''}` });
      if (apiError.code === 'RECENT_AUTH_REQUIRED' || apiError.code === 'SUPER_ADMIN_MFA_REQUIRED') {
        openReauth({ kind: 'quota', label: 'Reset AI quota' }, apiError.code, apiError.message);
      }
    }
  };

  const retryPendingOperation = async (): Promise<boolean> => {
    if (!pendingAuth) return false;
    if (pendingAuth.kind === 'save') return handleSave();
    if (pendingAuth.kind === 'test' && pendingAuth.provider) {
      await handleTest(pendingAuth.provider);
      const result = tests[pendingAuth.provider];
      return result?.status === 'ok';
    }
    if (pendingAuth.kind === 'discover' && pendingAuth.provider) {
      await handleDiscover(pendingAuth.provider);
      return catalog[pendingAuth.provider]?.status === 'ready';
    }
    return false;
  };

  const onConfirm = async () => {
    if (!confirmState) return;
    if (confirmState.kind === 'clear') {
      const provider = confirmState.provider;
      setPendingClear((prev) => ({ ...prev, [provider]: true }));
      setSecretInputs((prev) => ({ ...prev, [provider]: '' }));
      setConfirmState(null);
      setToast({
        tone: 'warning',
        title: `${providerMeta(provider)?.name ?? provider} credential marked for removal`,
        text: 'Nothing has been deleted yet. The credential is removed when you save, so the change stays reviewable and revision-checked.',
      });
      return;
    }
    if (confirmState.kind === 'reset-all') {
      await performReset({ all: true });
      setConfirmState(null);
      return;
    }
    if (confirmState.kind === 'reset-user') {
      await performReset({ uid: confirmState.uid });
      setConfirmState(null);
    }
  };

  // ── Render guards ──────────────────────────────────────────────────────────
  if (settingsQuery.isLoading && !settings) {
    return (
      <div className="space-y-3" data-testid="ai-engine-loading" aria-busy="true">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-canvas-soft" />
        <div className="h-40 animate-pulse rounded-2xl bg-canvas-soft" />
        <div className="h-24 animate-pulse rounded-2xl bg-canvas-soft" />
        <Spinner label="Loading AI engine configuration…" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 py-6" data-testid="ai-engine-forbidden">
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Lock className="size-4 text-amber-600" aria-hidden="true" />
              Super Admin required
            </span>
          }
          description="GET /api/admin/ai-settings is restricted to the Super Admin role. Your session is authenticated, but the server refused the projection."
        >
          <div className="space-y-3 text-sm text-ink-secondary">
            <p>
              Signed in as <strong>{claims?.role || 'unknown role'}</strong>. AI provider credentials and their
              masks are never exposed to lower roles.
            </p>
            <InlineAlert tone="info" title="Server response">
              {settingsError?.code ? `${settingsError.code}: ` : ''}
              {settingsError?.message}
            </InlineAlert>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => settingsQuery.refetch()}>
                <RefreshCw className="size-3.5" aria-hidden="true" /> Retry
              </Button>
              <Button variant="secondary" size="sm" onClick={() => window.location.assign('/admin/health')}>
                Open Platform Health
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  if (settingsError && !settings) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 py-6" data-testid="ai-engine-settings-error">
        <Panel title="AI engine configuration is unavailable" description="GET /api/admin/ai-settings did not return a usable projection.">
          <InlineAlert tone="error" title={settingsError.code || 'Request failed'} onRetry={() => settingsQuery.refetch()} retryLabel="Retry load">
            {settingsError.message}
          </InlineAlert>
        </Panel>
      </div>
    );
  }

  if (!draft || !settings) {
    return (
      <div className="py-6" data-testid="ai-engine-settings-empty">
        <Panel title="No configuration returned">
          <EmptyFallback onRetry={() => settingsQuery.refetch()} />
        </Panel>
      </div>
    );
  }

  const status = engineStatusFrom(serviceQuery.data?.service, availabilityQuery.data);
  const configuredCount = PROVIDER_IDS.filter((id) => serverStates[id]?.credentialConfigured).length;
  const changed = baseline ? changedFieldLabels(draft, baseline) : [];
  const secretsPending = Object.entries(secretInputs).filter(([, value]) => (value ?? '').trim().length > 0).length;
  const clearsPending = Object.values(pendingClear).filter(Boolean).length;
  const dirtyCount = changed.length + secretsPending + clearsPending + Object.values(clearedBaseUrls).filter(Boolean).length;
  const busy = saveMutation.isPending;

  return (
    // `pb-32` reserves room for the sticky unsaved-changes bar at every width:
    // the bar wraps onto two rows on phones, so the page must always be able to
    // scroll its last card clear of it.
    <div className="space-y-4 pb-32" data-testid="ai-engine-page">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Brain className="size-5" aria-hidden="true" />
            </span>
            <h2 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
              AI Multi-Provider Engine
              {/* The subsystem's long-standing name, kept visible so operators and
                  documentation that refer to "AI Provider Orchestration" still
                  recognise this console. */}
              <span className="ml-2 align-middle text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
                AI Provider Orchestration
              </span>
            </h2>
            <span data-testid="ai-engine-status">
              <StatusPill tone={status.tone === 'ready' ? 'ready' : status.tone === 'degraded' ? 'degraded' : status.tone === 'unavailable' ? 'unavailable' : status.tone === 'unconfigured' ? 'unconfigured' : 'unknown'}>
                {status.label}
              </StatusPill>
            </span>
            {!canEdit && (
              <span data-testid="ai-engine-readonly">
                <StatusPill tone="unknown" showDot={false}>Read only</StatusPill>
              </span>
            )}
          </div>
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-ink-muted sm:text-sm">
            Six runtime adapters, one revisioned configuration. Credentials are write-only, model catalogues are discovered
            live, and every number on this page comes from a real server response.
          </p>
          <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted">
            <div className="flex items-center gap-1">
              <dt className="font-semibold">Revision</dt>
              <dd className="font-mono font-bold text-ink" data-testid="ai-engine-revision">{settings.revision}</dd>
            </div>
            <div className="flex items-center gap-1">
              <dt className="font-semibold">Configured on Server</dt>
              <dd className="font-bold text-ink">{configuredCount} / {PROVIDER_IDS.length}</dd>
            </div>
            <div className="flex items-center gap-1">
              <dt className="font-semibold">Persistence</dt>
              <dd className="font-bold text-ink" data-testid="ai-engine-persistence">
                {settings.persistence === 'in-memory-certification' ? 'Certification store' : 'MariaDB'}
              </dd>
            </div>
            <div className="flex items-center gap-1">
              <dt className="font-semibold">Loaded</dt>
              <dd className="font-mono text-ink">{settingsQuery.dataUpdatedAt ? formatTime(new Date(settingsQuery.dataUpdatedAt).toISOString()) : '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={reloadAll}
            disabled={settingsQuery.isFetching && !settings}
            data-testid="ai-engine-reload"
          >
            <RefreshCw className={cn('size-4', settingsQuery.isFetching && 'animate-spin')} aria-hidden="true" />
            Reload
          </Button>
          <Button
            // A clean form must not look like an armed primary action: the
            // header button only turns solid once there is something to save.
            variant={dirtyCount > 0 ? 'primary' : 'outline'}
            size="sm"
            onClick={handleSave}
            loading={busy}
            disabled={!canEdit || busy || dirtyCount === 0}
            data-testid="ai-engine-save"
          >
            <Save className="size-4" aria-hidden="true" />
            {dirtyCount > 0
              ? `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}`
              : lastSavedAt
                ? 'Saved'
                : 'No unsaved changes'}
          </Button>
        </div>
      </header>

      {/* ── Section navigation (deep-linkable) ─────────────────────────── */}
      <nav
        role="tablist"
        aria-label="AI engine sections"
        aria-orientation="horizontal"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-testid="ai-engine-tabs"
        onKeyDown={handleTabKeyDown}
      >
        {SECTIONS.map((item, index) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`ai-engine-tab-${item.id}`}
              aria-selected={active}
              aria-controls="ai-engine-panel"
              // Roving tabindex: one stop for the whole tablist, arrow keys inside.
              tabIndex={active ? 0 : -1}
              onClick={() => setSection(item.id)}
              title={item.hint}
              data-testid={`ai-engine-tab-${item.id}`}
              className={cn(
                // 36px minimum hit area on phones (Apple/Material guidance), tightening
                // to the denser desktop rhythm from `sm` upward.
                'inline-flex shrink-0 items-center justify-center rounded-xl px-3 py-2.5 text-xs font-bold transition-colors min-h-9 sm:py-1.5 sm:min-h-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                active
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-ink-secondary hover:bg-neutral-100 hover:text-ink dark:hover:bg-neutral-800',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* ── Transient feedback ─────────────────────────────────────────── */}
      <div aria-live="polite" className="space-y-2">
        {toast && (
          <InlineAlert
            tone={toast.tone}
            title={toast.title}
            className="animate-[fade-in_150ms_ease-out]"
            action={
              <button type="button" onClick={() => setToast(null)} className="text-[11px] font-bold underline underline-offset-2">
                Dismiss
              </button>
            }
          >
            {toast.text}
          </InlineAlert>
        )}
        {saveError && (
          <InlineAlert
            tone="error"
            title={`Save failed${saveError.code ? ` (${saveError.code})` : ''}`}
            onRetry={() => handleSave()}
            retryLabel="Retry save"
          >
            {saveError.message}
            {saveError.code === 'AI_SETTINGS_CONFLICT' && ' The panel has been reloaded with the newest server state; review before retrying.'}
          </InlineAlert>
        )}
        {settingsQuery.isError && settings && (
          <InlineAlert tone="warning" title="Showing the last successful projection" onRetry={() => settingsQuery.refetch()}>
            {toApiError(settingsQuery.error).message}
          </InlineAlert>
        )}
        {!canEdit && (
          <InlineAlert tone="info" title="Read-only session">
            Signed in as {claims?.role || 'a non-Super-Admin role'}. Credential writes require the Super Admin role; every control below is disabled.
          </InlineAlert>
        )}
      </div>

      {/* ── Active section ─────────────────────────────────────────────── */}
      <main
        className="min-w-0"
        id="ai-engine-panel"
        role="tabpanel"
        aria-labelledby={`ai-engine-tab-${section}`}
        // The panel is programmatically focusable so a keyboard operator lands on
        // the content (not back in the tablist) after arrow-key navigation.
        tabIndex={-1}
      >
        {section === 'overview' && (
          <OverviewSection
            draft={draft}
            serverStates={serverStates}
            service={serviceQuery.data?.service}
            serviceError={serviceQuery.error ? toApiError(serviceQuery.error).message : undefined}
            serviceLoading={serviceQuery.isLoading}
            availability={availabilityQuery.data}
            revision={settings.revision}
            persistence={settings.persistence}
            canEdit={canEdit}
            saving={busy}
            onDraftChange={(patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
            onNavigate={setSection}
          />
        )}
        {section === 'providers' && (
          <ProvidersSection
            draft={draft}
            serverStates={serverStates}
            canEdit={canEdit}
            saving={busy}
            secretInputs={secretInputs}
            revealed={revealed}
            pendingClear={pendingClear}
            tests={tests}
            discovering={Object.fromEntries(
              PROVIDER_IDS.map((id) => [id, catalog[id]?.status === 'loading' || (discoverMutation.isPending && discoverMutation.variables?.provider === id)]),
            ) as Partial<Record<ProviderId, boolean>>}
            discoveredCounts={Object.fromEntries(
              PROVIDER_IDS.map((id) => [id, catalog[id]?.status === 'ready' ? catalog[id]?.result?.count : undefined]),
            ) as Partial<Record<ProviderId, number>>}
            secretInputType={SECRET_INPUT_TYPE}
            onProviderChange={(id, patch) => {
              setDraft((prev) => {
                if (!prev) return prev;
                const nextProvider = { ...prev.providers[id], ...patch } as EngineDraft['providers'][ProviderId];
                if (patch.baseUrl === '__clear__') {
                  nextProvider.baseUrl = '';
                  setClearedBaseUrls((current) => ({ ...current, [id]: true }));
                } else if (typeof patch.baseUrl === 'string') {
                  setClearedBaseUrls((current) => ({ ...current, [id]: false }));
                }
                return { ...prev, providers: { ...prev.providers, [id]: nextProvider } };
              });
            }}
            onSecretChange={(id, value) => setSecretInputs((prev) => ({ ...prev, [id]: value }))}
            onToggleReveal={(id) => setRevealed((prev) => ({ ...prev, [id]: !prev[id] }))}
            onRequestClear={(id) => setConfirmState({ kind: 'clear', provider: id })}
            onCancelClear={(id) => setPendingClear((prev) => ({ ...prev, [id]: false }))}
            onTest={(id) => { void handleTest(id); }}
            onDiscover={(id) => { void handleDiscover(id); }}
          />
        )}
        {section === 'catalog' && (
          <CatalogSection
            catalog={catalog}
            discovering={Object.fromEntries(
              PROVIDER_IDS.map((id) => [id, catalog[id]?.status === 'loading' || (discoverMutation.isPending && discoverMutation.variables?.provider === id)]),
            ) as Partial<Record<ProviderId, boolean>>}
            canEdit={canEdit}
            onDiscover={(id) => { void handleDiscover(id); }}
            onDiscoverAll={() => { void handleDiscoverAll(); }}
            onOpenModel={(model) => setModelDetail(model)}
          />
        )}
        {section === 'usage' && (
          <UsageSection
            data={quotaQuery.data as QuotaStats | undefined}
            loading={quotaQuery.isLoading}
            error={quotaQuery.error ? toApiError(quotaQuery.error) : undefined}
            canEdit={canEdit}
            onRetry={() => quotaQuery.refetch()}
            savingLimits={quotaLimitMutation.isPending}
            resetting={resetQuotaMutation.isPending}
            message={quotaMessage}
            onSaveLimits={(limits) => { void handleQuotaLimits(limits); }}
            onResetUser={(uid, label) => setConfirmState({ kind: 'reset-user', uid, label })}
            onResetAll={() => setConfirmState({ kind: 'reset-all' })}
          />
        )}
        {section === 'telemetry' && (
          <TelemetrySection
            service={serviceQuery.data?.service}
            relatedEndpoints={serviceQuery.data?.relatedEndpoints ?? []}
            availability={availabilityQuery.data}
            loading={serviceQuery.isLoading}
            error={serviceQuery.error ? toApiError(serviceQuery.error).message : undefined}
            availabilityError={availabilityQuery.error ? toApiError(availabilityQuery.error).message : undefined}
            sessionTests={tests}
            serverStates={serverStates}
            onRefresh={reloadAll}
          />
        )}
      </main>

      {/* ── Sticky unsaved-changes bar ─────────────────────────────────── */}
      {dirtyCount > 0 && canEdit && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-200 bg-surface/95 px-3 py-2.5 shadow-[0_-8px_24px_-12px_rgba(16,24,64,0.28)] backdrop-blur supports-[backdrop-filter]:bg-surface/80 dark:border-brand-800"
          data-testid="ai-engine-unsaved"
          role="region"
          aria-label="Unsaved AI engine changes"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex min-w-0 items-start gap-2 text-xs text-ink-secondary">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden="true" />
              <span className="min-w-0">
                <strong className="font-bold text-ink">{dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}</strong>
                {changed.length > 0 && <span className="ml-1 hidden text-ink-muted sm:inline">· {changed.slice(0, 4).join(', ')}{changed.length > 4 ? ` +${changed.length - 4}` : ''}</span>}
                {secretsPending > 0 && <span className="ml-1 text-ink-muted">· {secretsPending} new secret{secretsPending === 1 ? '' : 's'} staged</span>}
                {clearsPending > 0 && <span className="ml-1 text-error-600">· {clearsPending} credential removal{clearsPending === 1 ? '' : 's'}</span>}
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="xs" onClick={handleDiscard} disabled={busy}>
                <Undo2 className="size-3" aria-hidden="true" /> Discard
              </Button>
              <Button variant="primary" size="xs" onClick={handleSave} loading={busy} data-testid="ai-engine-save-sticky">
                <Save className="size-3" aria-hidden="true" /> Save changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Popups ─────────────────────────────────────────────────────── */}
      <ReauthDialog
        open={reauth.open}
        operation={pendingAuth}
        reasonCode={reauth.code}
        reasonMessage={reauth.message}
        onOpenChange={(open) => {
          setReauth((prev) => ({ ...prev, open }));
          if (!open) setPendingAuth(null);
        }}
        onRetry={retryPendingOperation}
      />

      <ConfirmDialog
        open={confirmState !== null}
        title={
          confirmState?.kind === 'clear'
            ? `Revoke ${providerMeta(confirmState.provider)?.name ?? confirmState.provider} credential?`
            : confirmState?.kind === 'reset-all'
              ? 'Reset the AI quota for every user?'
              : `Reset AI quota for ${confirmState?.kind === 'reset-user' ? confirmState.label : 'this account'}?`
        }
        description={
          confirmState?.kind === 'clear'
            ? 'The stored key is removed when you save, and the provider stops being routable until a new key is configured. The key itself is never displayed again.'
            : 'The daily usage counter returns to zero immediately for the affected account(s). This is recorded in the admin audit trail by the backend.'
        }
        confirmLabel={confirmState?.kind === 'clear' ? 'Mark for removal' : 'Reset quota'}
        tone={confirmState?.kind === 'clear' ? 'warning' : 'danger'}
        busy={resetQuotaMutation.isPending}
        onOpenChange={(open) => { if (!open) setConfirmState(null); }}
        onConfirm={() => { void onConfirm(); }}
      />

      <ModelDetailDialog open={modelDetail !== null} model={modelDetail} onOpenChange={(open) => { if (!open) setModelDetail(null); }} />
    </div>
  );
}

function EmptyFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <CloudOff className="size-7 text-ink-subtle" aria-hidden="true" />
      <p className="text-sm font-semibold text-ink">The server returned no configuration body</p>
      <p className="max-w-md text-xs text-ink-muted">
        This console does not invent defaults. Reload the projection from the server to continue.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="size-3.5" aria-hidden="true" /> Reload
      </Button>
    </div>
  );
}

export default AdminAiSettingsTab;
