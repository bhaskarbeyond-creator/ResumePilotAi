import React, { useCallback, useEffect, useMemo, useState } from 'react';
import fire from '../../../conf/fire';
import { Link } from 'react-router-dom';
import { FaServer, FaSpinner, FaTimes, FaRedo, FaLock, FaCheck, FaExclamationTriangle, FaExternalLinkAlt } from 'react-icons/fa';

const GROUPS = [
  ['infrastructure', 'Infrastructure & deployment', 'Values owned by the deployment or secret manager. They are intentionally read-only here.'],
  ['runtime', 'Runtime configuration', 'Startup/runtime settings whose operational owner is infrastructure.'],
  ['featureFlags', 'Feature flags', 'Runtime gates. Use the dedicated Feature Flags panel for approved Super Admin changes.'],
  ['integrations', 'Providers & integrations', 'Secret-free status of AI, payments, OAuth, email, SMS, and storage integrations.'],
  ['workers', 'Workers & queues', 'Worker enablement, cadence, and processing posture.'],
  ['security', 'Security controls', 'Network, authentication-age, rate-limit, and MFA configuration.'],
  ['governance', 'Governance', 'Platform ownership and editing policy.'],
];

function displayValue(item) {
  if (!item) return 'UNAVAILABLE';
  if (item.secret) return item.value || (item.configured ? 'CONFIGURED' : 'NOT_CONFIGURED');
  if (typeof item.value === 'boolean') return item.value ? 'ON' : 'OFF';
  if (item.value === null || item.value === undefined || item.value === '') return 'NOT_SET';
  return String(item.value);
}

function statusClass(item) {
  const value = displayValue(item);
  if (value === 'CONFIGURED' || value === 'ON') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (value === 'NOT_CONFIGURED' || value === 'NOT_SET' || value === 'OFF' || value === 'DISABLED') return 'bg-slate-100 text-slate-600 border-slate-200';
  if (value === 'PARTIALLY_CONFIGURED') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

function ConfigRow({ item }) {
  const value = displayValue(item);
  return (
    <article className="bg-white px-4 py-4 hover:bg-slate-50/60 transition-colors">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all text-xs font-bold text-slate-800">{item.key}</code>
            {item.secret && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">SECRET STATUS ONLY</span>}
            {item.requiresRestart && <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800"><FaExclamationTriangle className="h-2.5 w-2.5" /> RESTART REQUIRED</span>}
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-700">{item.label}</p>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-500">{item.description}</p>
          {item.impact && <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-500"><strong className="text-slate-700">Impact:</strong> {item.impact}</p>}
          {Array.isArray(item.dependencies) && item.dependencies.length > 0 && <p className="mt-1 text-[10px] text-slate-400"><strong className="text-slate-500">Dependencies:</strong> {item.dependencies.join(' · ')}</p>}
        </div>
        <div className="flex min-w-0 flex-col items-start gap-2 lg:w-64 lg:items-end">
          <span className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-bold ${statusClass(item)}`} title={item.secret ? 'Raw secret values are never returned.' : value}>
            {item.secret ? <FaLock className="h-3 w-3" /> : value === 'CONFIGURED' || value === 'ON' ? <FaCheck className="h-3 w-3" /> : null}
            <span className="break-all text-right">{value}</span>
          </span>
          <span className="text-[10px] text-slate-400">Source: <strong className="text-slate-600">{item.source || 'unknown'}</strong> · Owner: <strong className="text-slate-600">{item.owner || 'unknown'}</strong></span>
          <span className="text-[10px] text-slate-400">Runtime: {item.runtime || 'unknown'} · Last changed: {item.lastChangedAt ? new Date(item.lastChangedAt).toLocaleString() : 'not recorded'}</span>
          {item.changedBy && <span className="max-w-full truncate text-[10px] text-slate-400" title={item.changedBy}>Changed by: {item.changedBy}</span>}
        </div>
      </div>
    </article>
  );
}

export default function PlatformConfigSettings() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = fire.auth().currentUser;
      if (!user) throw new Error('Authentication required');
      const token = await user.getIdToken(true);
      const response = await fetch('/api/platform/configuration', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const next = new Error(data.error?.message || (response.status === 403 ? 'Super Admin access is required to view platform configuration.' : `Configuration census unavailable (HTTP ${response.status}).`));
        next.status = response.status;
        throw next;
      }
      setConfig(data);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const groups = useMemo(() => GROUPS.map(([key, title, description]) => ({ key, title, description, items: Object.values(config?.groups?.[key] || {}) })), [config]);

  if (loading) return <div className="flex items-center justify-center p-12" role="status"><FaSpinner className="mr-3 h-6 w-6 animate-spin text-slate-400" /><span className="text-sm text-slate-500">Loading secret-free configuration census…</span></div>;
  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center" role="alert"><FaTimes className="mx-auto mb-2 h-6 w-6 text-red-500" /><p className="text-sm font-semibold text-red-800">{error.status === 403 ? 'Super Admin access required' : 'Configuration census unavailable'}</p><p className="mt-1 text-xs text-red-700">{error.message}</p><button type="button" onClick={loadConfig} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700"><FaRedo /> Retry</button></div>;

  return (
    <div className="space-y-5" data-testid="platform-configuration">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FaServer className="text-indigo-600" /> Platform Configuration Census</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">A server-derived inventory of runtime, infrastructure, feature-flag, and integration posture. Raw secrets never cross this API boundary. Infrastructure-owned values remain read-only and must be changed through deployment or Secret Manager.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold text-slate-600"><span className="rounded-full bg-slate-100 px-2 py-1">{config?.summary?.totalItems ?? '—'} items</span><span className="rounded-full bg-slate-100 px-2 py-1">{config?.summary?.secretItems ?? '—'} secret statuses only</span><span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">{config?.summary?.editableItems ?? '—'} governed runtime items</span></div>
        </div>
        <div className="flex shrink-0 items-center gap-2"><Link to="/adm/settings?tab=featureFlagsSettings" className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100">Feature Flags <FaExternalLinkAlt className="h-3 w-3" /></Link><button type="button" onClick={loadConfig} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50" title="Refresh census" aria-label="Refresh configuration census"><FaRedo /></button></div>
      </div>

      {config?.sourceStatus?.firestore === 'PARTIAL' && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900" role="status"><p className="font-extrabold">Configuration census is partial</p><p className="mt-1">Some server-side documents could not be read. Values from those sources are shown as unavailable and must not be treated as defaults or healthy.</p>{config.sourceStatus.unavailableDocuments?.length > 0 && <p className="mt-1 font-mono text-[10px]">Unavailable: {config.sourceStatus.unavailableDocuments.join(', ')}</p>}</div>}
      {config?.policy?.enterpriseTenancy && <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 text-xs text-purple-950"><p className="font-extrabold">ENTERPRISE_TENANCY_ENABLED: {config.policy.enterpriseTenancy.value ? 'ON' : 'OFF'} · {config.policy.enterpriseTenancy.source}</p><p className="mt-1 leading-5">{config.policy.enterpriseTenancy.impact}</p><p className="mt-1 leading-5"><strong>Restart:</strong> {config.policy.enterpriseTenancy.requiresRestart ? 'Required for this source.' : 'Not required for the runtime override.'} <strong>Last changed:</strong> {config.policy.enterpriseTenancy.lastChangedAt ? new Date(config.policy.enterpriseTenancy.lastChangedAt).toLocaleString() : 'not recorded'}.</p></div>}

      {groups.map(group => group.items.length > 0 && <section key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xs"><header className="border-b border-slate-200 bg-slate-100/80 px-4 py-3"><h3 className="text-sm font-bold text-slate-900">{group.title}</h3><p className="mt-0.5 text-[11px] text-slate-500">{group.description}</p></header><div className="divide-y divide-slate-200">{group.items.map(item => <ConfigRow key={item.key} item={item} />)}</div></section>)}

      <p className="text-center text-[10px] text-slate-400">Generated {config?.generatedAt ? new Date(config.generatedAt).toLocaleString() : 'unknown'} · Firestore source: {config?.sourceStatus?.firestore || 'unknown'} · <Link to="/adm/health" className="font-bold underline">Review operational evidence</Link></p>
    </div>
  );
}
