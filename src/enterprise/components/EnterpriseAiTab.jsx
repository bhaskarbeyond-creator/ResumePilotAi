import React, { useEffect, useMemo, useState } from 'react';
import {
  FiPlay, FiCheck, FiRefreshCw, FiLock, FiCpu
} from 'react-icons/fi';
import { useTenantApi } from '../useTenantApi';
import { enterpriseFetch } from '../enterpriseApi';

const PROVIDERS = [
  { key: 'nvidia', label: 'NVIDIA NIM', blurb: 'Hardware-accelerated llama models', model: 'meta/llama-3.2-11b-vision-instruct' },
  { key: 'gemini', label: 'Google Gemini', blurb: 'Long-context comprehension', model: 'gemini-2.0-flash' },
  { key: 'openai', label: 'OpenAI GPT', blurb: 'Complex technical summaries', model: 'gpt-4o-mini' },
  { key: 'groq', label: 'Groq LPU', blurb: 'Ultra-fast inference', model: 'llama-3.3-70b-versatile' },
  { key: 'openrouter', label: 'OpenRouter', blurb: 'Multi-model routing gateway', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  { key: 'deepseek', label: 'DeepSeek', blurb: 'Cost-efficient reasoning', model: 'deepseek-chat' },
];

// Known platform model catalogue: each entry maps to the provider that serves
// it. The tenant model allowlist is enforced against these identifiers.
const MODEL_CATALOGUE = PROVIDERS.map(provider => ({ model: provider.model, provider: provider.key }));

export default function EnterpriseAiTab() {
  const { request } = useTenantApi();
  const [configuration, setConfiguration] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [primaryModel, setPrimaryModel] = useState('');
  const [requestsPerMinute, setRequestsPerMinute] = useState(12);
  const [requestsPerDay, setRequestsPerDay] = useState(100);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [notification, setNotification] = useState(null);

  const allowed = useMemo(() => new Set((configuration?.aiPolicy?.allowedProviders || []).map(p => String(p).toLowerCase())), [configuration]);
  const allowedModels = useMemo(() => new Set((configuration?.aiPolicy?.allowedModels || []).map(m => String(m))), [configuration]);

  const loadConfiguration = async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const result = await request('/api/enterprise/configuration');
      const config = result.configuration;
      setConfiguration(config);
      setPrimaryModel(String(config?.aiPolicy?.primaryModel || ''));
      setRequestsPerMinute(Number(config?.quotaPolicy?.aiRequestsPerMinute ?? 12));
      setRequestsPerDay(Number(config?.quotaPolicy?.aiRequestsPerDay ?? 100));
    } catch (err) {
      setConfigError(err?.message || 'AI policy configuration could not be loaded.');
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    loadConfiguration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleProvider = (key) => {
    setConfiguration(prev => {
      if (!prev) return prev;
      const current = new Set((prev.aiPolicy?.allowedProviders || []).map(p => String(p).toLowerCase()));
      if (current.has(key)) current.delete(key); else current.add(key);
      return { ...prev, aiPolicy: { ...prev.aiPolicy, allowedProviders: [...current] } };
    });
  };

  const toggleModel = (model) => {
    setConfiguration(prev => {
      if (!prev) return prev;
      const current = new Set(prev.aiPolicy?.allowedModels || []);
      if (current.has(model)) current.delete(model); else current.add(model);
      const nextModels = [...current];
      return {
        ...prev,
        aiPolicy: {
          ...prev.aiPolicy,
          allowedModels: nextModels,
          // A primary model that is no longer allowed cannot stay selected.
          primaryModel: nextModels.includes(prev.aiPolicy?.primaryModel) ? prev.aiPolicy.primaryModel : (nextModels[0] || ''),
        },
      };
    });
  };

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    if (busy || !configuration) return;
    if (allowed.size === 0) {
      setConfigError('At least one provider must be approved — an empty allowlist denies all AI generation.');
      return;
    }
    setBusy(true);
    setConfigError(null);
    try {
      await request('/api/enterprise/configuration', {
        method: 'PATCH',
        body: {
          expectedRevision: configuration.revision,
          configuration: {
            aiPolicy: {
              allowedProviders: [...allowed],
              allowedModels: [...allowedModels],
              primaryModel: allowedModels.size === 0 ? '' : primaryModel,
            },
            quotaPolicy: {
              aiRequestsPerMinute: requestsPerMinute,
              aiRequestsPerDay: requestsPerDay,
            },
          },
        },
      });
      setNotification('Enterprise AI policy and quota configuration saved.');
      await loadConfiguration();
    } catch (err) {
      setConfigError(err?.message || 'AI policy could not be saved.');
    } finally {
      setBusy(false);
      setTimeout(() => setNotification(null), 3500);
    }
  };

  const handleTestAi = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Real server reachability + policy report; no fabricated latency or model claims.
      const response = await enterpriseFetch('/api/enterprise/status');
      setTestResult({
        status: 'SUCCESS',
        message: `Enterprise AI policy endpoint is reachable (apiVersion ${response.apiVersion}). Provider generation requires configured AI keys and the RLS data plane.`,
        enabled: response.enabled === true,
      });
    } catch (err) {
      setTestResult({
        status: 'ERROR',
        message: err?.message || 'AI policy endpoint could not be reached.',
      });
    } finally {
      setTesting(false);
    }
  };

  const effectivePrimary = allowedModels.size === 0
    ? 'Any model served by an approved provider'
    : primaryModel || 'First allowed model';

  return (
    <div className="enterprise-tab-content">
      {notification && (
        <div className="enterprise-toast enterprise-toast-success">
          <FiCheck aria-hidden="true" /> {notification}
        </div>
      )}

      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">Enterprise AI Policy & Quota Console</h2>
            <p className="enterprise-tab-subtitle">
              Tenant-isolated LLM provider allowlist, model governance, and hard usage quotas
            </p>
          </div>
          <button
            type="button"
            className="enterprise-button enterprise-button-secondary"
            onClick={handleTestAi}
            disabled={testing}
          >
            {testing ? <FiRefreshCw className="enterprise-spin" /> : <FiPlay />} Test AI Policy
          </button>
        </div>

        <div className="enterprise-security-banner">
          <div className="enterprise-security-banner-icon">
            <FiLock />
          </div>
          <div>
            <strong>Zero-Leakage Enterprise Data Boundary</strong>
            <p>Prompts and candidate resume facts are processed ephemerally with tenant RLS isolation and no model-training retention. Provider and model eligibility are enforced server-side at generation time.</p>
          </div>
        </div>

        {testResult && (
          <div className={`enterprise-test-box ${testResult.status === 'SUCCESS' ? 'success' : 'error'}`}>
            <div className="enterprise-test-box-header">
              <strong>{testResult.status === 'SUCCESS' ? '✓ AI Policy Endpoint Reachable' : '✗ AI Policy Test Failed'}</strong>
            </div>
            <p>{testResult.message}</p>
          </div>
        )}

        {configLoading ? (
          <div className="enterprise-loading-row"><span className="enterprise-spinner" aria-hidden="true" /><span className="text-muted">Loading AI policy…</span></div>
        ) : configError ? (
          <div className="enterprise-card" role="alert">
            <div className="enterprise-error-row">
              <span className="enterprise-error-icon" aria-hidden="true">⚠</span>
              <div>
                <strong>AI policy unavailable</strong>
                <p className="text-muted">{configError}</p>
                <button type="button" className="enterprise-button enterprise-button-secondary enterprise-button-sm" onClick={loadConfiguration} style={{ marginTop: '0.75rem' }}>
                  Retry
                </button>
              </div>
            </div>
          </div>
        ) : configuration ? (
          <form onSubmit={handleSavePolicy}>
            <h3 className="enterprise-card-title" style={{ marginTop: '1.5rem' }}>Approved Provider Allowlist</h3>
            <p className="enterprise-card-subtitle">Only providers enabled below receive tenant generation requests. An empty allowlist denies all providers (fail closed).</p>

            <div className="enterprise-provider-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {PROVIDERS.map(provider => {
                const isActive = allowed.has(provider.key);
                return (
                  <label key={provider.key} className={`enterprise-provider-card enterprise-card ${isActive ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', border: isActive ? '2px solid var(--enterprise-primary-active)' : '1px solid var(--enterprise-border)', background: isActive ? 'var(--enterprise-primary-soft)' : 'var(--enterprise-surface)', transition: 'all 0.2s ease', margin: 0, padding: '16px' }}>
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => toggleProvider(provider.key)}
                      style={{ marginTop: '4px', cursor: 'pointer', width: '18px', height: '18px', accentColor: 'var(--enterprise-primary-active)' }}
                    />
                    <div className="enterprise-provider-content" style={{ flex: 1 }}>
                      <div className="enterprise-provider-header" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <strong style={{ fontSize: '1.05rem', color: isActive ? 'var(--enterprise-primary-active)' : 'var(--enterprise-ink)' }}>{provider.label}</strong>
                        <span className={`enterprise-pill ${isActive ? 'enterprise-pill-primary' : 'enterprise-pill-secondary'}`} style={{ alignSelf: 'flex-start' }}>{provider.blurb}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <h3 className="enterprise-card-title" style={{ marginTop: '1.75rem' }}><FiCpu aria-hidden="true" /> Model Allowlist</h3>
            <p className="enterprise-card-subtitle">
              When at least one model is approved, providers serving a non-approved model are disabled at generation time — even if the provider itself is approved. An empty model allowlist permits every model of the approved providers.
            </p>

            <div className="enterprise-checkbox-list" style={{ marginTop: '0.75rem' }}>
              {MODEL_CATALOGUE.map(entry => (
                <label key={entry.model} className="enterprise-checkbox">
                  <input
                    type="checkbox"
                    checked={allowedModels.has(entry.model)}
                    onChange={() => toggleModel(entry.model)}
                  />
                  <span>
                    <code>{entry.model}</code>
                    <small className="text-muted"> · served by {entry.provider}{allowed.has(entry.provider) ? '' : ' (provider not approved)'}</small>
                  </span>
                </label>
              ))}
            </div>

            <div className="enterprise-two-column-grid" style={{ marginTop: '1.5rem' }}>
              <div className="enterprise-form-group">
                <label htmlFor="primary-model">Primary Production Model</label>
                <select
                  id="primary-model"
                  value={primaryModel}
                  onChange={(e) => setPrimaryModel(e.target.value)}
                  className="enterprise-select"
                  disabled={allowedModels.size === 0}
                >
                  <option value="">First allowed model (no explicit preference)</option>
                  {[...allowedModels].map(model => <option key={model} value={model}>{model}</option>)}
                </select>
                <small className="text-muted">
                  Enforced through provider selection: generation prefers the approved provider that serves this model. Current effective primary: <strong>{effectivePrimary}</strong>.
                </small>
              </div>
              <div className="enterprise-form-group">
                <label htmlFor="req-limit">Tenant Rate Limit (Requests / Minute)</label>
                <input
                  id="req-limit"
                  type="number"
                  min="1"
                  max="10000"
                  value={requestsPerMinute}
                  onChange={(e) => setRequestsPerMinute(Number(e.target.value))}
                  className="enterprise-input"
                />
                <small className="text-muted">Enforced per principal through durable atomic quota counters before any provider call.</small>
              </div>
            </div>

            <div className="enterprise-form-group">
              <label htmlFor="token-quota">Daily Request Allowance ({requestsPerDay.toLocaleString()} / day)</label>
              <input
                id="token-quota"
                type="range"
                min="100"
                max="1000000"
                step="100"
                value={requestsPerDay}
                onChange={(e) => setRequestsPerDay(Number(e.target.value))}
                className="enterprise-range"
              />
              <small className="text-muted">Consumption is visible in Usage &amp; Quotas with per-workspace and per-user breakdowns.</small>
            </div>

            <div className="enterprise-form-actions">
              <button type="submit" className="enterprise-button enterprise-button-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save AI Policy Changes'}
              </button>
            </div>
          </form>
        ) : (
          <p className="enterprise-empty">No AI policy is available for this tenant.</p>
        )}
      </div>
    </div>
  );
}
