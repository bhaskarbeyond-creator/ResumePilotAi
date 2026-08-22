import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiCheck, FiChevronLeft, FiChevronRight, FiEdit3, FiEye, FiFilter,
  FiLoader, FiPlay, FiPlus, FiRefreshCw, FiSearch, FiServer,
  FiShieldOff, FiTrash2, FiX,
} from 'react-icons/fi';
import { fetchAdminWithReauth } from '../../../services/adminReauth';
import AdminDialog from '../shared/AdminDialog';

const PAGE_SIZE = 20;
const LIFECYCLE_ACTIONS = {
  SUSPENDED: { label: 'Suspend', verb: 'SUSPEND', nextPath: 'suspend', icon: FiShieldOff, tone: 'rose', impact: 'All tenant members and tenant-bound service credentials will lose access immediately.' },
  ACTIVE: { label: 'Reactivate', verb: 'REACTIVATE', nextPath: 'reactivate', icon: FiPlay, tone: 'emerald', impact: 'Tenant members and tenant-bound service credentials will be allowed to resolve active context again.' },
  DELETING: { label: 'Start decommission', verb: 'DECOMMISSION', nextPath: 'decommission', icon: FiTrash2, tone: 'rose', impact: 'The tenant enters DELETING. New tenant activity is blocked; this begins the controlled decommission lifecycle and does not silently erase data.' },
};

function apiMessage(response, data, fallback) {
  const nested = data?.error && typeof data.error === 'object' ? data.error : null;
  return nested?.message || data?.error || data?.message || `${fallback}${response?.status ? ` (HTTP ${response.status})` : ''}`;
}

function tenantStateTone(state) {
  const key = String(state || '').toUpperCase();
  if (key === 'ACTIVE') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (key === 'SUSPENDED') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (key === 'DELETING' || key === 'DELETED') return 'bg-rose-100 text-rose-800 border-rose-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export default function PlatformTenants({ isSuperAdmin = false }) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [detailTenant, setDetailTenant] = useState(null);
  const [actionTarget, setActionTarget] = useState(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [editTenant, setEditTenant] = useState(null);
  const [form, setForm] = useState({ displayName: '', slug: '', isolationTier: 'STANDARD' });

  const fetchTenants = useCallback(async () => {
    if (!isSuperAdmin) {
      setTenants([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { response, data } = await fetchAdminWithReauth('/api/platform/tenants?limit=200', { cache: 'no-store' });
      if (!response.ok) throw new Error(apiMessage(response, data, 'Unable to load the platform tenant registry.'));
      setTenants(Array.isArray(data.tenants) ? data.tenants : []);
    } catch (err) {
      setError(err.message || 'Unable to load the platform tenant registry.');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);
  useEffect(() => { setPage(1); }, [query, stateFilter]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tenants.filter(tenant => {
      const matchesQuery = !normalized || [tenant.displayName, tenant.slug, tenant.id]
        .some(value => String(value || '').toLowerCase().includes(normalized));
      const matchesState = stateFilter === 'ALL' || tenant.lifecycleState === stateFilter;
      return matchesQuery && matchesState;
    });
  }, [query, stateFilter, tenants]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((Math.min(page, totalPages) - 1) * PAGE_SIZE, Math.min(page, totalPages) * PAGE_SIZE);
  const activeCount = tenants.filter(tenant => tenant.lifecycleState === 'ACTIVE').length;
  const suspendedCount = tenants.filter(tenant => tenant.lifecycleState === 'SUSPENDED').length;
  const decommissioningCount = tenants.filter(tenant => ['DELETING', 'DELETED'].includes(tenant.lifecycleState)).length;

  const openProvision = () => {
    setForm({ displayName: '', slug: '', isolationTier: 'STANDARD' });
    setProvisionOpen(true);
  };

  const provision = async event => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const { response, data } = await fetchAdminWithReauth('/api/platform/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, displayName: form.displayName.trim(), slug: form.slug.trim().toLowerCase() }),
      });
      if (!response.ok) throw new Error(apiMessage(response, data, 'Tenant provisioning failed.'));
      setProvisionOpen(false);
      setNotice({ type: 'success', text: `Provisioned ${data.tenant?.displayName || form.displayName}. The registry has been refreshed.` });
      await fetchTenants();
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Tenant provisioning failed.' });
    } finally {
      setBusy(false);
    }
  };

  const saveTenantProfile = async event => {
    event.preventDefault();
    if (!editTenant) return;
    setBusy(true);
    setNotice(null);
    try {
      const { response, data } = await fetchAdminWithReauth(`/api/platform/tenants/${encodeURIComponent(editTenant.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: form.displayName.trim() }),
      });
      if (!response.ok) throw new Error(apiMessage(response, data, 'Tenant profile update failed.'));
      setEditTenant(null);
      setNotice({ type: 'success', text: `Updated ${data.tenant?.displayName || 'the tenant'} and recorded the platform audit event.` });
      await fetchTenants();
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Tenant profile update failed.' });
    } finally {
      setBusy(false);
    }
  };

  const executeLifecycle = async () => {
    if (!actionTarget) return;
    const config = LIFECYCLE_ACTIONS[actionTarget.action];
    const phrase = `${config.verb} ${actionTarget.tenant.slug}`;
    if (confirmation !== phrase) return;
    setBusy(true);
    setNotice(null);
    try {
      const { response, data } = await fetchAdminWithReauth(
        `/api/platform/tenants/${encodeURIComponent(actionTarget.tenant.id)}/${config.nextPath}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation }) },
      );
      if (!response.ok) throw new Error(apiMessage(response, data, `${config.label} failed.`));
      setActionTarget(null);
      setConfirmation('');
      setNotice({ type: 'success', text: `${actionTarget.tenant.displayName} is now ${data.tenant?.lifecycleState || 'updated'}.` });
      await fetchTenants();
    } catch (err) {
      setNotice({ type: 'error', text: err.message || `${config.label} failed.` });
    } finally {
      setBusy(false);
    }
  };

  const openEdit = tenant => {
    setDetailTenant(null);
    setForm({ displayName: tenant.displayName || '', slug: tenant.slug || '', isolationTier: tenant.isolationTier || 'STANDARD' });
    setEditTenant(tenant);
  };

  const lifecycleOptions = tenant => {
    if (tenant.lifecycleState === 'ACTIVE') return ['SUSPENDED', 'DELETING'];
    if (tenant.lifecycleState === 'SUSPENDED') return ['ACTIVE', 'DELETING'];
    return [];
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo-600">Platform control plane</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-slate-900"><FiServer className="text-indigo-600" aria-hidden="true" />Tenant registry</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Provision, inspect, and manage enterprise tenant lifecycle state from the Super Admin control plane. This registry is independent of the feature-gated Enterprise UI route.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={fetchTenants} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />Refresh</button>
          {isSuperAdmin && <button type="button" onClick={openProvision} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"><FiPlus aria-hidden="true" />Provision tenant</button>}
        </div>
      </header>

      {!isSuperAdmin && <div role="status" className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><FiShieldOff className="mt-0.5 shrink-0" aria-hidden="true" /><span>Tenant registry access and lifecycle actions require a SUPER_ADMIN server claim. No tenant control actions are shown for your current role.</span></div>}
      {notice && <div role={notice.type === 'success' ? 'status' : 'alert'} aria-live="polite" className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>{notice.type === 'success' ? <FiCheck className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" /> : <FiX className="mt-0.5 shrink-0 text-red-600" aria-hidden="true" />}<span>{notice.text}</span></div>}
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><span>{error}</span><button type="button" onClick={fetchTenants} className="font-bold underline">Retry</button></div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[['Registered tenants', tenants.length, 'text-indigo-700'], ['Suspended', suspendedCount, 'text-amber-700'], ['Decommissioning / deleted', decommissioningCount, 'text-rose-700']].map(([label, value, tone]) => <section key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-2xl font-extrabold ${tone}`}>{loading ? '—' : !isSuperAdmin ? 'RESTRICTED' : error ? 'UNAVAILABLE' : value}</p>{label === 'Registered tenants' && <p className="mt-1 text-[11px] text-slate-500">{loading ? 'Loading observed state' : !isSuperAdmin ? 'SUPER_ADMIN access required' : error ? 'Registry query failed' : `${activeCount} active`}</p>}</section>)}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1"><span className="sr-only">Search tenants</span><FiSearch className="absolute left-3 top-3 text-slate-400" aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, slug, or tenant ID" className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white" /></label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><FiFilter aria-hidden="true" />Lifecycle<select value={stateFilter} onChange={event => setStateFilter(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"><option value="ALL">All states</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="DELETING">Decommissioning</option><option value="DELETED">Deleted</option></select></label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs" aria-label="Tenant registry results">
        {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-slate-600" role="status"><FiLoader className="animate-spin text-indigo-600" aria-hidden="true" />Loading observed tenant state…</div> : !isSuperAdmin ? <div className="p-10 text-center text-sm text-slate-600">The tenant control plane does not disclose platform-wide tenant data to this role.</div> : filtered.length === 0 ? <div className="p-10 text-center text-sm text-slate-600">No tenants match the current search and lifecycle filter.</div> : <><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Slug</th><th className="px-4 py-3">Isolation</th><th className="px-4 py-3">Lifecycle</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(tenant => <tr key={tenant.id} className="hover:bg-slate-50/70"><td className="px-4 py-3"><p className="font-bold text-slate-900">{tenant.displayName}</p><p className="mt-0.5 max-w-48 truncate font-mono text-[11px] text-slate-500" title={tenant.id}>{tenant.id}</p></td><td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">{tenant.slug}</td><td className="px-4 py-3"><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-extrabold text-slate-700">{tenant.isolationTier}</span></td><td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${tenantStateTone(tenant.lifecycleState)}`}>{tenant.lifecycleState}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => setDetailTenant(tenant)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-700" aria-label={`View ${tenant.displayName}`} title="View tenant"><FiEye /></button><button type="button" onClick={() => openEdit(tenant)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-indigo-700" aria-label={`Edit ${tenant.displayName}`} title="Edit display name"><FiEdit3 /></button>{lifecycleOptions(tenant).map(action => { const config = LIFECYCLE_ACTIONS[action]; const Icon = config.icon; return <button key={action} type="button" onClick={() => { setConfirmation(''); setActionTarget({ tenant, action }); }} className={`rounded-lg p-2 ${config.tone === 'emerald' ? 'text-emerald-700 hover:bg-emerald-50' : 'text-rose-700 hover:bg-rose-50'}`} aria-label={`${config.label} ${tenant.displayName}`} title={config.label}><Icon /></button>; })}</div></td></tr>)}</tbody></table></div><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-600"><span>Showing {Math.min(filtered.length, (page - 1) * PAGE_SIZE + 1)}–{Math.min(filtered.length, page * PAGE_SIZE)} of {filtered.length}</span><div className="flex items-center gap-2"><button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1} className="rounded-lg border border-slate-300 p-1.5 disabled:opacity-40" aria-label="Previous page"><FiChevronLeft /></button><span className="font-semibold">Page {Math.min(page, totalPages)} of {totalPages}</span><button type="button" onClick={() => setPage(current => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="rounded-lg border border-slate-300 p-1.5 disabled:opacity-40" aria-label="Next page"><FiChevronRight /></button></div></footer></>}
      </section>

      <AdminDialog open={Boolean(detailTenant)} onClose={() => setDetailTenant(null)} title="Tenant detail" description="Read-only control-plane identity and lifecycle state." className="max-w-lg"><div className="space-y-3 p-5 text-sm"><dl className="space-y-3">{[['Display name', detailTenant?.displayName], ['Slug', detailTenant?.slug], ['Tenant ID', detailTenant?.id], ['Lifecycle', detailTenant?.lifecycleState], ['Isolation tier', detailTenant?.isolationTier], ['Region', detailTenant?.region || 'Not recorded']].map(([label, value]) => <div key={label} className="grid grid-cols-[8rem_1fr] gap-3"><dt className="font-bold text-slate-500">{label}</dt><dd className="break-all font-medium text-slate-800">{value}</dd></div>)}</dl><div className="flex justify-end border-t border-slate-100 pt-4"><button type="button" onClick={() => setDetailTenant(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">Close</button></div></div></AdminDialog>

      <AdminDialog open={provisionOpen} onClose={() => !busy && setProvisionOpen(false)} dismissible={!busy} title="Provision enterprise tenant" description="Creates a new organization, default workspace, and audited platform registry record." className="max-w-lg"><form onSubmit={provision} className="space-y-4 p-5"><label className="block text-sm font-bold text-slate-800">Organization name<input required minLength="2" maxLength="120" value={form.displayName} onChange={event => setForm(current => ({ ...current, displayName: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" placeholder="Acme Corporation" /></label><label className="block text-sm font-bold text-slate-800">Immutable slug<input required pattern="[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9]" value={form.slug} onChange={event => setForm(current => ({ ...current, slug: event.target.value.toLowerCase() }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono font-normal" placeholder="acme-corporation" /><span className="mt-1 block text-[11px] font-normal text-slate-500">Lowercase letters, digits, and hyphens only. The slug cannot be renamed.</span></label><label className="block text-sm font-bold text-slate-800">Isolation tier<select value={form.isolationTier} onChange={event => setForm(current => ({ ...current, isolationTier: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal"><option value="STANDARD">Standard</option><option value="ENTERPRISE">Enterprise</option><option value="REGULATED">Regulated</option></select></label><div className="flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" disabled={busy} onClick={() => setProvisionOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Cancel</button><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy && <FiLoader className="animate-spin" />}{busy ? 'Provisioning…' : 'Create tenant'}</button></div></form></AdminDialog>

      <AdminDialog open={Boolean(editTenant)} onClose={() => !busy && setEditTenant(null)} dismissible={!busy} title="Edit tenant profile" description="Only the display name can be changed. Tenant slug, isolation tier, and routing are immutable after provisioning." className="max-w-lg"><form onSubmit={saveTenantProfile} className="space-y-4 p-5"><label className="block text-sm font-bold text-slate-800">Display name<input required minLength="2" maxLength="120" value={form.displayName} onChange={event => setForm(current => ({ ...current, displayName: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-normal" /></label><p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Slug: <span className="font-mono font-bold">{editTenant?.slug}</span></p><div className="flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" disabled={busy} onClick={() => setEditTenant(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Cancel</button><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy && <FiLoader className="animate-spin" />}{busy ? 'Saving…' : 'Save name'}</button></div></form></AdminDialog>

      <AdminDialog open={Boolean(actionTarget)} onClose={() => !busy && setActionTarget(null)} dismissible={!busy} title={actionTarget ? `${LIFECYCLE_ACTIONS[actionTarget.action].label} tenant` : ''} description={actionTarget ? LIFECYCLE_ACTIONS[actionTarget.action].impact : ''} className="max-w-lg"><div className="space-y-4 p-5"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><p><strong>Target:</strong> {actionTarget?.tenant.displayName}</p><p className="mt-1 font-mono text-xs text-slate-600">{actionTarget?.tenant.id}</p></div><label className="block text-sm font-bold text-slate-800">Type <span className="font-mono text-rose-700">{actionTarget ? `${LIFECYCLE_ACTIONS[actionTarget.action].verb} ${actionTarget.tenant.slug}` : ''}</span> to confirm<input autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm" /></label><div className="flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" disabled={busy} onClick={() => setActionTarget(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Cancel</button><button type="button" onClick={executeLifecycle} disabled={busy || !actionTarget || confirmation !== `${LIFECYCLE_ACTIONS[actionTarget?.action]?.verb} ${actionTarget?.tenant.slug}`} className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy && <FiLoader className="animate-spin" />}{busy ? 'Applying…' : 'Confirm action'}</button></div></div></AdminDialog>
    </div>
  );
}
