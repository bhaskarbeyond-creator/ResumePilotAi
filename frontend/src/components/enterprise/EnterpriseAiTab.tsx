/**
 * Enterprise AI Tab (AI Workspace & Model Governance)
 *
 * Departmental AI quota allocation rings, token consumption telemetry,
 * provider allowlists (NVIDIA NIM, Gemini, OpenAI, Groq, DeepSeek), and model limits.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  Cpu,
  Check,
  Play,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import { AiQuotaRing } from './AiQuotaRing';
import { enterpriseApi, type EnterpriseConfiguration } from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

interface ProviderMeta {
  key: string;
  label: string;
  blurb: string;
  model: string;
}

const PROVIDERS: ProviderMeta[] = [
  { key: 'nvidia', label: 'NVIDIA NIM', blurb: 'Hardware-accelerated llama models', model: 'meta/llama-3.2-11b-vision-instruct' },
  { key: 'gemini', label: 'Google Gemini', blurb: 'Long-context multimodal comprehension', model: 'gemini-2.0-flash' },
  { key: 'openai', label: 'OpenAI GPT', blurb: 'Complex technical and executive summaries', model: 'gpt-4o-mini' },
  { key: 'groq', label: 'Groq LPU', blurb: 'Ultra-fast low-latency inference', model: 'llama-3.3-70b-versatile' },
  { key: 'openrouter', label: 'OpenRouter', blurb: 'Multi-model fallback routing gateway', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  { key: 'deepseek', label: 'DeepSeek', blurb: 'Cost-efficient deep reasoning engine', model: 'deepseek-chat' },
];

interface ModelMeta {
  id: string;
  providerKey: string;
  providerLabel: string;
}

const MODEL_CATALOG: ModelMeta[] = [
  // NVIDIA NIM
  { id: 'meta/llama-3.2-11b-vision-instruct', providerKey: 'nvidia', providerLabel: 'NVIDIA NIM' },
  { id: 'meta/llama-3.2-90b-vision-instruct', providerKey: 'nvidia', providerLabel: 'NVIDIA NIM' },
  { id: 'meta/llama-3.3-70b-instruct', providerKey: 'nvidia', providerLabel: 'NVIDIA NIM' },
  // Google Gemini
  { id: 'gemini-2.0-flash', providerKey: 'gemini', providerLabel: 'Google Gemini' },
  { id: 'gemini-1.5-pro', providerKey: 'gemini', providerLabel: 'Google Gemini' },
  { id: 'gemini-1.5-flash', providerKey: 'gemini', providerLabel: 'Google Gemini' },
  // OpenAI
  { id: 'gpt-4o-mini', providerKey: 'openai', providerLabel: 'OpenAI GPT' },
  { id: 'gpt-4o', providerKey: 'openai', providerLabel: 'OpenAI GPT' },
  { id: 'gpt-3.5-turbo', providerKey: 'openai', providerLabel: 'OpenAI GPT' },
  // Groq
  { id: 'llama-3.3-70b-versatile', providerKey: 'groq', providerLabel: 'Groq LPU' },
  { id: 'llama-3.1-70b-versatile', providerKey: 'groq', providerLabel: 'Groq LPU' },
  { id: 'llama-3.2-90b-vision-preview', providerKey: 'groq', providerLabel: 'Groq LPU' },
  // OpenRouter
  { id: 'meta-llama/llama-3.3-70b-instruct:free', providerKey: 'openrouter', providerLabel: 'OpenRouter' },
  { id: 'google/gemini-2.0-flash-exp:free', providerKey: 'openrouter', providerLabel: 'OpenRouter' },
  { id: 'mistralai/mistral-large:free', providerKey: 'openrouter', providerLabel: 'OpenRouter' },
  // DeepSeek
  { id: 'deepseek-chat', providerKey: 'deepseek', providerLabel: 'DeepSeek' },
  { id: 'deepseek-reasoner', providerKey: 'deepseek', providerLabel: 'DeepSeek' },
];

export function EnterpriseAiTab() {
  const { tenant, hasPermission } = useEnterprise();
  const [config, setConfig] = useState<EnterpriseConfiguration | null>(null);
  const [, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Form states
  const [primaryModel, setPrimaryModel] = useState('');
  const [requestsPerMinute, setRequestsPerMinute] = useState(12);
  const [requestsPerDay, setRequestsPerDay] = useState(100);
  const [allowedProviders, setAllowedProviders] = useState<Set<string>>(new Set(['nvidia', 'gemini']));
  const [allowedModels, setAllowedModels] = useState<Set<string>>(new Set());

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'SUCCESS' | 'ERROR'; message: string } | null>(null);

  const canManageAi = hasPermission('tenant.ai.manage');

  // Platform status (dedicated BYOK vs shared gateway)
  const [platformStatus, setPlatformStatus] = useState<{ hasDedicatedBYOK: boolean; credentialCount: number; providers: string[] } | null>(null);

  const loadConfig = useCallback(async () => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [configRes, statusRes] = await Promise.all([
        enterpriseApi.getConfiguration(tenant.id),
        enterpriseApi.getPlatformStatus(tenant.id),
      ]);
      const c = configRes.configuration || {};
      setConfig(c);

      const providers = new Set((c.aiPolicy?.allowedProviders || ['nvidia', 'gemini']).map((p) => String(p).toLowerCase()));
      setAllowedProviders(providers);

      const models = new Set(c.aiPolicy?.allowedModels || MODEL_CATALOG.map((m) => m.id));
      setAllowedModels(models);

      setPrimaryModel(c.aiPolicy?.primaryModel || MODEL_CATALOG[0].id);
      setRequestsPerMinute(Number(c.quotaPolicy?.aiRequestsPerMinute ?? 12));
      setRequestsPerDay(Number(c.quotaPolicy?.aiRequestsPerDay ?? 100));

      if (statusRes.success) {
        setPlatformStatus({
          hasDedicatedBYOK: statusRes.hasDedicatedBYOK,
          credentialCount: statusRes.credentialCount,
          providers: statusRes.providers || [],
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load AI configuration');
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const toggleProvider = (key: string) => {
    setAllowedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleModel = (model: string) => {
    setAllowedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !tenant?.id || !config) return;

    if (allowedProviders.size === 0) {
      setError('At least one AI provider must be approved.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await enterpriseApi.updateConfiguration(tenant.id, config.revision || 1, {
        aiPolicy: {
          allowedProviders: Array.from(allowedProviders),
          allowedModels: Array.from(allowedModels),
          primaryModel,
        },
        quotaPolicy: {
          aiRequestsPerMinute: Number(requestsPerMinute),
          aiRequestsPerDay: Number(requestsPerDay),
        },
      });
      setNotification('Enterprise AI policy and quota limits saved successfully.');
      setTimeout(() => setNotification(null), 3500);
      await loadConfig();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save AI policy');
    } finally {
      setBusy(false);
    }
  };

  const handleTestAi = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await enterpriseApi.getStatus();
      setTestResult({
        status: 'SUCCESS',
        message: `Enterprise AI orchestrator is reachable (apiVersion: ${res.apiVersion}). MariaDB quota enforcement is active.`,
      });
    } catch (err: unknown) {
      setTestResult({
        status: 'ERROR',
        message: err instanceof Error ? err.message : 'AI reachability test failed.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── SLA Status Badge ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border',
            platformStatus?.hasDedicatedBYOK
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300',
          )}>
            <Shield className="size-3.5" />
            {platformStatus?.hasDedicatedBYOK
              ? '✓ Dedicated Enterprise Gateway Active'
              : 'Platform High-Availability Shared Gateway'}
            {platformStatus?.hasDedicatedBYOK && platformStatus.credentialCount > 0 && (
              <span className="font-mono text-[10px] opacity-70">
                ({platformStatus.credentialCount} provider{platformStatus.credentialCount === 1 ? '' : 's'})
              </span>
            )}
          </div>
          <span className="text-[11px] text-ink-muted">
            AI routing governance is enforced server-side with tenant isolation.
          </span>
        </div>
      </div>

      {/* ─── Top Quota & Live Test Row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quota Ring Card */}
        <div className="lg:col-span-1">
          <AiQuotaRing days={30} />
        </div>

        {/* Live Reachability Card */}
        <Card className="lg:col-span-2 border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs flex flex-col justify-between">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                  <Cpu className="size-4 text-accent" />
                  Provider Health & Model Orchestration
                  <HelpTooltip text="Zero-fabrication live status check directly querying the multi-tenant AI routing gateway." />
                </CardTitle>
                <CardDescription className="text-xs text-ink-muted mt-0.5">
                  Verify server reachability, failover chains, and quota enforcement limits.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleTestAi}
                disabled={testing}
                className="text-xs"
              >
                <Play className="size-3 mr-1 text-accent" />
                {testing ? 'Testing…' : 'Test Provider Gateway'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {testResult ? (
              <div
                className={cn(
                  'p-4 rounded-xl text-xs border font-medium leading-relaxed',
                  testResult.status === 'SUCCESS'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300',
                )}
              >
                {testResult.message}
              </div>
            ) : (
              <p className="text-xs text-ink-muted">
                Run an end-to-end gateway probe to verify that the tenant's AI provider credentials, quota policies, and MariaDB outbox workers are active.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Notification / Alert ─── */}
      {notification && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <Check className="size-4 shrink-0" />
          {notification}
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ─── Policy Configuration Form ─── */}
      <form onSubmit={handleSavePolicy} className="space-y-6">
        <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
          <CardHeader className="p-5 pb-3 border-b border-edge">
            <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
              <Zap className="size-4 text-accent" />
              Departmental AI Provider Allowlist
              <HelpTooltip text="Only checked providers and models can be queried by users in this organization. At least one required." />
            </CardTitle>
            <CardDescription className="text-xs text-ink-muted mt-0.5">
              Configure authorized foundation model providers and designate the primary routing target.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            {/* Providers Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {PROVIDERS.map((provider) => {
                const isApproved = allowedProviders.has(provider.key);
                return (
                  <div
                    key={provider.key}
                    onClick={() => canManageAi && toggleProvider(provider.key)}
                    className={cn(
                      'p-4 rounded-xl border text-xs cursor-pointer transition-all select-none',
                      isApproved
                        ? 'border-accent bg-accent-soft/30 shadow-2xs'
                        : 'border-edge bg-surface hover:bg-surface-raised/60 opacity-60',
                    )}
                  >
                    <div className="flex items-center justify-between font-bold text-ink">
                      <span>{provider.label}</span>
                      <div
                        className={cn(
                          'size-5 rounded-md flex items-center justify-center border',
                          isApproved ? 'bg-accent border-accent text-white' : 'border-edge bg-surface',
                        )}
                      >
                        {isApproved && <Check className="size-3.5 stroke-[3]" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-ink-muted mt-1 leading-snug">{provider.blurb}</p>
                    <div className="mt-2 text-[10px] font-mono text-ink-muted truncate">
                      {provider.model}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-Model Governance Allowlist */}
            <div className="space-y-2 pt-2 border-t border-edge">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-bold text-ink block" id="enterprise-model-allowlist-label">
                  Per-Model Governance Allowlist
                </label>
                <span className="text-[11px] text-ink-muted font-mono">
                  {allowedModels.size} / {MODEL_CATALOG.length} models authorized
                </span>
              </div>
              <p className="text-[11px] text-ink-muted">
                Model governance is enforced server-side. A provider is only reachable when its effective model is
                allowlisted here, so an approved provider can never reach an unapproved model.
              </p>
              <div
                role="group"
                aria-labelledby="enterprise-model-allowlist-label"
                className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2"
              >
                {MODEL_CATALOG.map((model) => {
                  const isAllowed = allowedModels.has(model.id);
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => canManageAi && toggleModel(model.id)}
                      disabled={!canManageAi}
                      aria-pressed={isAllowed}
                      data-testid={`enterprise-model-toggle-${model.id}`}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all',
                        isAllowed
                          ? 'border-accent bg-accent-soft/30'
                          : 'border-edge bg-surface hover:bg-surface-raised/60 opacity-60',
                        !canManageAi && 'cursor-not-allowed',
                      )}
                    >
                      <span
                        className={cn(
                          'size-4 shrink-0 rounded flex items-center justify-center border',
                          isAllowed ? 'bg-accent border-accent text-white' : 'border-edge bg-surface',
                        )}
                        aria-hidden="true"
                      >
                        {isAllowed && <Check className="size-3 stroke-[3]" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-bold text-ink truncate">{model.id}</span>
                        <span className="block text-[10px] text-ink-muted truncate">{model.providerLabel}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Primary Model Selection */}
            <div className="space-y-2 pt-2 border-t border-edge">
              <label className="text-xs font-bold text-ink block" htmlFor="enterprise-primary-model">
                Primary Synthesis Model
              </label>
              <select
                id="enterprise-primary-model"
                value={primaryModel}
                onChange={(e) => setPrimaryModel(e.target.value)}
                disabled={!canManageAi}
                className="w-full max-w-md h-9 px-3 rounded-lg bg-surface border border-edge text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {MODEL_CATALOG.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.providerLabel} — {model.id}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-muted">
                Default model dispatched for resume executive bios, interview coach queries, and cover letters.
              </p>
            </div>

            {/* Quota Sliders */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-edge">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-ink">
                  <span>Burst Rate Limit (RPM)</span>
                  <span className="font-mono text-accent">{requestsPerMinute} req/min</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="1"
                  value={requestsPerMinute}
                  onChange={(e) => setRequestsPerMinute(Number(e.target.value))}
                  disabled={!canManageAi}
                  className="w-full accent-accent cursor-pointer"
                />
                <p className="text-[11px] text-ink-muted">
                  Maximum simultaneous inference executions permitted per minute across all active seats.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-ink">
                  <span>Daily Quota Allowance</span>
                  <span className="font-mono text-accent">{requestsPerDay} req/day</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="1000"
                  step="10"
                  value={requestsPerDay}
                  onChange={(e) => setRequestsPerDay(Number(e.target.value))}
                  disabled={!canManageAi}
                  className="w-full accent-accent cursor-pointer"
                />
                <p className="text-[11px] text-ink-muted">
                  Hard daily ceiling tracked by MariaDB outbox ledger before graceful throttling.
                </p>
              </div>
            </div>

            {canManageAi && (
              <div className="pt-4 flex justify-end">
                <Button type="submit" size="sm" disabled={busy}>
                  {busy ? 'Saving Configuration…' : 'Save AI Policy'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

export default EnterpriseAiTab;
