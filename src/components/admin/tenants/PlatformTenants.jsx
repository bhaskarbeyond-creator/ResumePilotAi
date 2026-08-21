import React, { useState, useEffect, useCallback } from 'react';
import fire from '../../../conf/fire';
import { useAdminSession } from '../AdminContext';
import { decommissionTenant } from '../../../services/platformApi';
import {
  FiServer, FiRefreshCw, FiPlus, FiSearch, FiShieldOff,
  FiPlay, FiCheck, FiAlertTriangle, FiX, FiEye
} from 'react-icons/fi';

export default function PlatformTenants() {
  const { isSuperAdmin } = useAdminSession();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [busyTenant, setBusyTenant] = useState(null);
  const [notification, setNotification] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [decommissionReason, setDecommissionReason] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  // Provisioning Modal State
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [isolationTier, setIsolationTier] = useState('STANDARD');
  const [provisioning, setProvisioning] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = fire.auth().currentUser;
      if (!user) throw new Error('Authentication required');
      const token = await user.getIdToken();

      const res = await fetch('/api/enterprise/platform/tenants', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${res.status}`);
      }

      const result = await res.json();
      setTenants(result.tenants || []);
    } catch (err) {
      console.error('[PlatformTenants] Error:', err);
      setError(err.message || 'Failed to load enterprise tenants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get('focus');
    if (focus && tenants.length) {
      const match = tenants.find(item => item.id === focus);
      if (match) setSelectedTenant(match);
    }
  }, [tenants]);

  const handleLifecycle = async (tenant, nextState) => {
    const verb = nextState === 'SUSPENDED' ? 'Suspend' : 'Reactivate';
    
    if (confirmAction?.id !== `${tenant.id}-${nextState}`) {
      setConfirmAction({
        id: `${tenant.id}-${nextState}`,
        title: `${verb} Organization`,
        message: `Are you sure you want to ${verb.toLowerCase()} the organization "${tenant.displayName}" (${tenant.slug})?`,
        confirmText: verb,
        danger: nextState === 'SUSPENDED',
        action: () => executeLifecycle(tenant, nextState)
      });
      return;
    }
  };

  const executeLifecycle = async (tenant, nextState) => {
    const verb = nextState === 'SUSPENDED' ? 'Suspend' : 'Reactivate';
    setConfirmAction(null);
    setBusyTenant(`${tenant.id}:${nextState}`);
    try {
      const user = fire.auth().currentUser;
      if (!user) throw new Error('Authentication required');
      const token = await user.getIdToken();

      const actionPath = nextState === 'SUSPENDED' ? 'suspend' : 'reactivate';
      const res = await fetch(`/api/enterprise/platform/tenants/${encodeURIComponent(tenant.id)}/${actionPath}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Failed to ${verb.toLowerCase()} tenant`);
      }

      setNotification(`Organization "${tenant.displayName}" has been ${nextState.toLowerCase()}.`);
      fetchTenants();
    } catch (err) {
      alert(err.message || 'Action failed');
    } finally {
      setBusyTenant(null);
    }
  };

  const handleProvision = async (e) => {
    e.preventDefault();
    if (provisioning) return;
    setProvisioning(true);
    try {
      const user = fire.auth().currentUser;
      if (!user) throw new Error('Authentication required');
      const token = await user.getIdToken();

      const res = await fetch('/api/enterprise/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          slug: slug.trim().toLowerCase(),
          isolationTier
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Failed to provision tenant');
      }

      const created = await res.json();
      setNotification(`Tenant "${created.tenant?.displayName || displayName}" provisioned successfully.`);
      setShowProvisionModal(false);
      setDisplayName('');
      setSlug('');
      setIsolationTier('STANDARD');
      fetchTenants();
    } catch (err) {
      alert(err.message || 'Provisioning failed');
    } finally {
      setProvisioning(false);
    }
  };

  const handleDecommission = async (tenant) => {
    if (!isSuperAdmin) return;
    if (decommissionReason.trim().length < 8) {
      alert('A decommission reason of at least 8 characters is required.');
      return;
    }
    
    if (confirmAction?.id !== `decommission-${tenant.id}`) {
      setConfirmAction({
        id: `decommission-${tenant.id}`,
        title: 'Decommission Organization',
        message: `Are you sure you want to decommission "${tenant.displayName}"? This moves it to DELETING via the existing Enterprise lifecycle. It will be permanently deleted after the retention period.`,
        confirmText: 'Decommission',
        danger: true,
        action: () => executeDecommission(tenant)
      });
      return;
    }
  };

  const executeDecommission = async (tenant) => {
    setConfirmAction(null);
    setBusyTenant(`${tenant.id}:DELETING`);
    try {
      await decommissionTenant(tenant.id, decommissionReason.trim());
      setNotification(`Organization "${tenant.displayName}" marked DELETING.`);
      setDecommissionReason('');
      setSelectedTenant(null);
      fetchTenants();
    } catch (err) {
      alert(err.message || 'Decommission failed');
    } finally {
      setBusyTenant(null);
    }
  };

  const filteredTenants = tenants.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.displayName || '').toLowerCase().includes(q) ||
      (t.slug || '').toLowerCase().includes(q) ||
      (t.id || '').toLowerCase().includes(q)
    );
  });

  const activeCount = tenants.filter(t => t.lifecycleState === 'ACTIVE').length;
  const suspendedCount = tenants.filter(t => t.lifecycleState === 'SUSPENDED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FiServer className="text-indigo-600" /> Enterprise Tenants Registry
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Global multi-tenant directory, provisioning controls, and organizational lifecycle management.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchTenants}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
          >
            <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowProvisionModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition shadow-xs"
          >
            <FiPlus /> Provision Tenant
          </button>
        </div>
      </div>

      {notification && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2">
          <FiCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiAlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={fetchTenants} className="font-bold underline">Retry</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Tenants</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{tenants.length}</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <FiServer className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Organizations</p>
            <p className="text-2xl font-extrabold text-emerald-600 mt-1">{activeCount}</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <FiPlay className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Suspended</p>
            <p className="text-2xl font-extrabold text-amber-600 mt-1">{suspendedCount}</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <FiShieldOff className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500 transition"
            placeholder="Search tenants by name, slug, ID…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <FiRefreshCw className="animate-spin h-6 w-6 text-indigo-600 mx-auto mb-2" />
            Loading tenant registry…
          </div>
        ) : filteredTenants.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No enterprise tenants found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="py-3 px-4">Organization</th>
                  <th className="py-3 px-4">Slug / Namespace</th>
                  <th className="py-3 px-4">Isolation Tier</th>
                  <th className="py-3 px-4">Lifecycle State</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredTenants.map(tenant => (
                  <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{tenant.displayName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{tenant.id}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                      {tenant.slug}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-extrabold">
                        {tenant.isolationTier}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        tenant.lifecycleState === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                        tenant.lifecycleState === 'SUSPENDED' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {tenant.lifecycleState}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <button type="button" onClick={() => setSelectedTenant(tenant)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 font-bold hover:bg-slate-100 text-[11px]">
                        <FiEye /> Details
                      </button>
                      {tenant.lifecycleState === 'ACTIVE' ? (
                        <button
                          type="button"
                          onClick={() => handleLifecycle(tenant, 'SUSPENDED')}
                          disabled={busyTenant === `${tenant.id}:SUSPENDED`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 font-bold hover:bg-red-100 text-[11px] transition"
                        >
                          <FiShieldOff /> {busyTenant === `${tenant.id}:SUSPENDED` ? 'Suspending…' : 'Suspend'}
                        </button>
                      ) : tenant.lifecycleState === 'SUSPENDED' ? (
                        <button
                          type="button"
                          onClick={() => handleLifecycle(tenant, 'ACTIVE')}
                          disabled={busyTenant === `${tenant.id}:ACTIVE`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold hover:bg-emerald-100 text-[11px] transition"
                        >
                          <FiPlay /> {busyTenant === `${tenant.id}:ACTIVE` ? 'Reactivating…' : 'Reactivate'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provision Modal */}
      {showProvisionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={() => !provisioning && setShowProvisionModal(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <FiServer className="text-indigo-600" /> Provision Enterprise Tenant
              </h3>
              <button
                type="button"
                onClick={() => !provisioning && setShowProvisionModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <FiX />
              </button>
            </div>

            <form onSubmit={handleProvision} className="p-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Organization Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corporation"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Slug / Namespace</label>
                <input
                  type="text"
                  required
                  pattern="[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9]"
                  placeholder="e.g. acme-corp"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500"
                  value={slug}
                  onChange={e => setSlug(e.target.value)}
                />
                <p className="text-[10px] text-slate-400 mt-1">Immutable lowercase unique identifier.</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Isolation Tier</label>
                <select
                  value={isolationTier}
                  onChange={e => setIsolationTier(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700"
                >
                  <option value="STANDARD">Standard</option>
                  <option value="ENTERPRISE">Enterprise</option>
                  <option value="REGULATED">Regulated</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowProvisionModal(false)}
                  disabled={provisioning}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={provisioning}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-xs"
                >
                  {provisioning ? 'Provisioning…' : 'Create Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedTenant && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50" onClick={() => setSelectedTenant(null)}>
          <aside className="h-full w-full max-w-md bg-white shadow-2xl p-5 overflow-y-auto" onClick={e => e.stopPropagation()} aria-label="Tenant detail">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedTenant.displayName}</h3>
                <p className="text-xs font-mono text-slate-500">{selectedTenant.id}</p>
              </div>
              <button type="button" onClick={() => setSelectedTenant(null)} className="p-1 text-slate-400"><FiX /></button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div><dt className="uppercase text-[10px] font-extrabold text-slate-400">Slug</dt><dd className="font-semibold">{selectedTenant.slug}</dd></div>
              <div><dt className="uppercase text-[10px] font-extrabold text-slate-400">Lifecycle</dt><dd className="font-semibold">{selectedTenant.lifecycleState}</dd></div>
              <div><dt className="uppercase text-[10px] font-extrabold text-slate-400">Isolation</dt><dd className="font-semibold">{selectedTenant.isolationTier}</dd></div>
              <div><dt className="uppercase text-[10px] font-extrabold text-slate-400">Region</dt><dd className="font-semibold">{selectedTenant.region || 'default'}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <a className="px-3 py-1.5 rounded-lg bg-slate-100 font-bold" href={`/enterprise?tab=audit&tenant=${encodeURIComponent(selectedTenant.id)}`}>Tenant audit</a>
              <a className="px-3 py-1.5 rounded-lg bg-slate-100 font-bold" href={`/enterprise?tab=usage&tenant=${encodeURIComponent(selectedTenant.id)}`}>Usage</a>
              <a className="px-3 py-1.5 rounded-lg bg-slate-100 font-bold" href="/adm/security">Security events</a>
            </div>
            {isSuperAdmin && selectedTenant.lifecycleState !== 'DELETING' && selectedTenant.lifecycleState !== 'DELETED' && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-xs">
                <p className="font-bold text-red-800">Decommission (SUPER_ADMIN)</p>
                <p className="text-red-700 mt-1">Uses the existing Enterprise lifecycle transition to DELETING. This does not hard-delete data immediately.</p>
                <textarea className="mt-2 w-full rounded-lg border border-red-200 p-2" rows={3} placeholder="Required reason (min 8 characters)" value={decommissionReason} onChange={e => setDecommissionReason(e.target.value)} />
                <button type="button" onClick={() => handleDecommission(selectedTenant)} disabled={busyTenant === `${selectedTenant.id}:DELETING`} className="mt-2 px-3 py-1.5 rounded-lg bg-red-700 text-white font-bold">
                  {busyTenant === `${selectedTenant.id}:DELETING` ? 'Decommissioning…' : 'Decommission tenant'}
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
      {/* Confirmation Modal */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={() => setConfirmAction(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col transform transition-all"
            onClick={e => e.stopPropagation()}
          >
            <div className={`p-4 border-b border-slate-100 flex items-center gap-3 ${confirmAction.danger ? 'bg-red-50' : 'bg-slate-50'}`}>
              {confirmAction.danger ? <FiAlertTriangle className="text-red-600 h-5 w-5" /> : <FiServer className="text-indigo-600 h-5 w-5" />}
              <h3 className={`font-bold ${confirmAction.danger ? 'text-red-900' : 'text-slate-900'}`}>
                {confirmAction.title}
              </h3>
            </div>
            <div className="p-5 text-sm text-slate-600 leading-relaxed">
              {confirmAction.message}
            </div>
            <div className="p-4 pt-2 flex justify-end gap-3 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition shadow-2xs text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAction.action}
                className={`px-4 py-2 rounded-xl text-white font-bold transition shadow-xs text-xs ${
                  confirmAction.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {confirmAction.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
