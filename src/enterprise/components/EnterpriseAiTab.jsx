import React, { useEffect, useMemo, useState } from 'react';
import {
  FiPlay, FiCheck, FiRefreshCw, FiLock
} from 'react-icons/fi';
import { useTenantApi } from '../useTenantApi';
import { enterpriseFetch } from '../enterpriseApi';

const PROVIDERS = [
  { key: 'nvidia', label: 'NVIDIA NIM', blurb: 'Hardware-accelerated llama models' },
  { key: 'gemini', label: 'Google Gemini', blurb: 'Long-context comprehension' },
  { key: 'openai', label: 'OpenAI GPT', blurb: 'Complex technical summaries' },
  { key: 'groq', label: 'Groq LPU', blurb: 'Ultra-fast inference' },
  { key: 'openrouter', label: 'OpenRouter', blurb: 'Multi-model routing gateway' },
  { key: 'deepseek', label: 'DeepSeek', blurb: 'Cost-efficient reasoning' },
];

const MODEL_OPTIONS = [
  'meta/llama-3.2-11b-vision-instruct',
  'gemini-2.0-flash',
  'gpt-4o-mini',
  'meta/llama-3.1-8b-instruct',
];

export default function EnterpriseAiTab() {
  const { request } = useTenantApi();
  const [configuration, setConfiguration] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [primaryModel, setPrimaryModel] = useState(MODEL_OPTIONS[0]);
  const [requestsPerMinute, setRequestsPerMinute] = useState(12);
  const [requestsPerDay, setRequestsPerDay] = useState(100);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [notification, setNotification] = useState(null);

  const allowed = useMemo(() => new Set((configuration?.aiPolicy?.allowedProviders || []).map(p => String(p).toLowerCase())), [configuration]);

  const loadConfiguration = async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const result = await request('/api/enterprise/configuration');
      const config = result.configuration;
      setConfiguration(config);
      setPrimaryModel(String(config?.aiPolicy?.primaryModel || MODEL_OPTIONS[0]));
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

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    if (busy || !configuration) return;
    setBusy(true);
    setConfigError(null);
    try {
      await request('/api/enterprise/configuration', {
        method: 'PATCH',
        body: {
          expectedRevision: configuration.revision,
          configuration: {
            aiPolicy: { allowedProviders: [...allowed], primaryModel },
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
              Tenant-isolated LLM provider allowlist and hard usage quotas
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
            <p>Prompts and candidate resume facts are processed ephemerally with tenant RLS isolation and no model-training retention.</p>
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

            <div className="enterprise-provider-grid">
              {PROVIDERS.map(provider => (
                <label key={provider.key} className={`enterprise-provider-card ${allowed.has(provider.key) ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={allowed.has(provider.key)}
                    onChange={() => toggleProvider(provider.key)}
                  />
                  <div className="enterprise-provider-content">
                    <div className="enterprise-provider-header">
                      <strong>{provider.label}</strong>
                      <span className="enterprise-pill enterprise-pill-secondary">{provider.blurb}</span>
                    </div>
                  </div>
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
                >
                  {MODEL_OPTIONS.map(model => <option key={model} value={model}>{model}</option>)}
                </select>
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
