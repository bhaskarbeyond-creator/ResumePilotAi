import React, { useState, useEffect, useCallback } from 'react';
import fire from '../../../conf/fire';
import { useAdminSession } from '../AdminContext';
import {
  decommissionTenant, getTenantDetail, renameTenant,
  addTenantMember, removeTenantMember, updateTenantCommercials, updateTenantAiPolicy
} from '../../../services/platformApi';
import {
  FiServer, FiRefreshCw, FiPlus, FiSearch, FiShieldOff,
  FiPlay, FiCheck, FiAlertTriangle, FiX, FiEye, FiUserPlus,
  FiTrash2, FiUser, FiCpu, FiDollarSign, FiSave, FiLayers
} from 'react-icons/fi';


export default function PlatformTenants() {
  const { isSuperAdmin } = useAdminSession();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [busyTenant, setBusyTenant] = useState(null);
  const [notification, setNotification] = useState(null);
  // Action failures render inline next to the table. They used to be raised as
  // native alert() dialogs, which are unstyled, block the thread and cannot be
  // asserted against as page content.
  const [actionError, setActionError] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [decommissionReason, setDecommissionReason] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  // Provisioning Modal State
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [editingTenantName, setEditingTenantName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [isolationTier, setIsolationTier] = useState('STANDARD');
  const [provisioning, setProvisioning] = useState(false);

  // Member Management State
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('MEMBER');
  const [memberBusy, setMemberBusy] = useState(false);

  // Custom Agreement & AI Policy State
  const [policyDailyLimit, setPolicyDailyLimit] = useState(5000);
  const [policyPrimaryModel, setPolicyPrimaryModel] = useState('meta/llama-3.2-11b-vision-instruct');
  const [policyPlan, setPolicyPlan] = useState('Enterprise Standard');
  const [policySeats, setPolicySeats] = useState(50);
  const [policyCurrency, setPolicyCurrency] = useState('INR');
  const [policyBillingStatus, setPolicyBillingStatus] = useState('ACTIVE');
  const [showDedicatedKeys, setShowDedicatedKeys] = useState(false);
  const [nvidiaCustomKey, setNvidiaCustomKey] = useState('');
  const [geminiCustomKey, setGeminiCustomKey] = useState('');
  const [openaiCustomKey, setOpenaiCustomKey] = useState('');
  const [savingPolicy, setSavingPolicy] = useState(false);


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
      if (res.status === 404) {
        setTenants([]);
        setError('ENTERPRISE_DISABLED');
        return;
      }
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
      if (match) { setSelectedTenant(match); setEditingTenantName(match.displayName || ''); }
    }
  }, [tenants]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedTenant?.id) {
      setSelectedDetail(null);
      setDetailError(null);
      return undefined;
    }
    setDetailLoading(true);
    setDetailError(null);
    getTenantDetail(selectedTenant.id)
      .then(result => { if (!cancelled) setSelectedDetail(result); })
      .catch(error => { if (!cancelled) setDetailError(error.message || 'Tenant detail is unavailable.'); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTenant?.id, detailRefresh]);

  const handleRename = async () => {
    if (!selectedTenant || !isSuperAdmin || renaming) return;
    const name = editingTenantName.trim();
    if (name.length < 2 || name.length > 120) { setActionError('Tenant name must contain between 2 and 120 characters.'); return; }
    setRenaming(true);
    setActionError(null);
    try {
      const result = await renameTenant(selectedTenant.id, name);
      const updated = { ...selectedTenant, ...(result.tenant || {}), displayName: result.tenant?.displayName || name };
      setSelectedTenant(updated);
      setTenants(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item));
      setNotification(`Organization renamed to "${updated.displayName}".`);
    } catch (error) {
      setActionError(error.message || 'Tenant could not be renamed.');
    } finally {
      setRenaming(false);
    }
  };

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

      setActionError(null);
      setNotification(`Organization "${tenant.displayName}" has been ${nextState.toLowerCase()}.`);
      fetchTenants();
    } catch (err) {
      setActionError(err.message || 'The tenant action could not be completed.');
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
        const msg = errData.error?.message;
        const rem = errData.error?.remediation;
        const fullMsg = rem ? `${msg} (${rem})` : msg;
        throw new Error(fullMsg || `Failed to provision tenant (${res.status})`);
      }

      const created = await res.json();
      setNotification(`Tenant "${created.tenant?.displayName || displayName}" provisioned successfully.`);
      setShowProvisionModal(false);
      setDisplayName('');
      setSlug('');
      setIsolationTier('STANDARD');
      fetchTenants();
    } catch (err) {
      setActionError(err.message || 'Provisioning failed.');
    } finally {
      setProvisioning(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!memberEmail.trim() || !selectedTenant) return;
    setMemberBusy(true);
    setActionError(null);
    try {
      await addTenantMember(selectedTenant.id, { email: memberEmail.trim(), role: memberRole });
      setNotification(`Member "${memberEmail.trim()}" added to ${selectedTenant.displayName}.`);
      setMemberEmail('');
      setShowAddMember(false);
      setDetailRefresh(v => v + 1);
    } catch (err) {
      setActionError(err.message || 'Failed to add member to organization.');
    } finally {
      setMemberBusy(false);
    }
  };

  const handleRemoveMember = async (principalId, userLabel) => {
    if (!selectedTenant) return;
    if (confirmAction?.id !== `remove-member-${principalId}`) {
      setConfirmAction({
        id: `remove-member-${principalId}`,
        title: 'Remove Member',
        message: `Are you sure you want to remove member "${userLabel}" from organization "${selectedTenant.displayName}"?`,
        confirmText: 'Remove Member',
        danger: true,
        action: () => executeRemoveMember(principalId, userLabel)
      });
      return;
    }
  };

  const executeRemoveMember = async (principalId, userLabel) => {
    setConfirmAction(null);
    setMemberBusy(true);
    setActionError(null);
    try {
      await removeTenantMember(selectedTenant.id, principalId);
      setNotification(`Member "${userLabel}" removed from organization.`);
      setDetailRefresh(v => v + 1);
    } catch (err) {
      setActionError(err.message || 'Failed to remove member.');
    } finally {
      setMemberBusy(false);
    }
  };

  useEffect(() => {
    if (selectedTenant) {
      setPolicyDailyLimit(selectedTenant.aiPolicy?.dailyLimit || 5000);
      setPolicyPrimaryModel(selectedTenant.aiPolicy?.primaryModel || 'meta/llama-3.2-11b-vision-instruct');
      setPolicyPlan(selectedTenant.plan || 'Enterprise Standard');
      setPolicySeats(selectedTenant.seatLimit || 50);
      setPolicyCurrency(selectedTenant.currency || 'INR');
      setPolicyBillingStatus(selectedTenant.billingStatus || 'ACTIVE');
    }
  }, [selectedTenant]);

  const handleSaveAgreementPolicy = async (e) => {
    if (e) e.preventDefault();
    if (!selectedTenant || !isSuperAdmin || savingPolicy) return;
    setSavingPolicy(true);
    setActionError(null);
    try {
      const customProviderKeys = {};
      if (nvidiaCustomKey.trim()) customProviderKeys.nvidia = nvidiaCustomKey.trim();
      if (geminiCustomKey.trim()) customProviderKeys.gemini = geminiCustomKey.trim();
      if (openaiCustomKey.trim()) customProviderKeys.openai = openaiCustomKey.trim();

      await updateTenantAiPolicy(selectedTenant.id, {
        dailyLimit: Number(policyDailyLimit) || 5000,
        primaryModel: policyPrimaryModel.trim(),
        ...(Object.keys(customProviderKeys).length > 0 ? { customProviderKeys } : {}),
      });
      await updateTenantCommercials(selectedTenant.id, {
        plan: policyPlan.trim(),
        seatLimit: Number(policySeats) || 50,
        currency: policyCurrency.trim(),
        billingStatus: policyBillingStatus,
      });
      setNvidiaCustomKey('');
      setGeminiCustomKey('');
      setOpenaiCustomKey('');
      setNotification(`Custom agreement & dedicated AI keys updated for "${selectedTenant.displayName}".`);
      setDetailRefresh(v => v + 1);
      fetchTenants();
    } catch (err) {
      setActionError(err.message || 'Failed to save agreement and AI policy.');
    } finally {
      setSavingPolicy(false);
    }
  };


  const handleDecommission = async (tenant) => {
    if (!isSuperAdmin) return;
    if (decommissionReason.trim().length < 8) {
      setActionError('A decommission reason of at least 8 characters is required.');
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
      setActionError(err.message || 'Decommission failed.');
    } finally {
      setBusyTenant(null);
    }
  };

  const [lifecycleFilter, setLifecycleFilter] = useState('ALL');

  const otherCount = tenants.filter(t => t.lifecycleState !== 'ACTIVE' && t.lifecycleState !== 'SUSPENDED').length;

  const filteredTenants = tenants.filter(t => {
    if (lifecycleFilter === 'ACTIVE' && t.lifecycleState !== 'ACTIVE') return false;
    if (lifecycleFilter === 'SUSPENDED' && t.lifecycleState !== 'SUSPENDED') return false;
    if (lifecycleFilter === 'OTHER' && (t.lifecycleState === 'ACTIVE' || t.lifecycleState === 'SUSPENDED')) return false;

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
          {error !== 'ENTERPRISE_DISABLED' && (
            <>
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
            </>
          )}
        </div>
      </div>

      {notification && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2">
          <FiCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          data-testid="tenant-action-error"
          className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2"
        >
          <FiAlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="flex-1">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-700 underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {error === 'ENTERPRISE_DISABLED' ? (
        <div className="bg-slate-50 border border-slate-200 p-12 rounded-3xl text-center shadow-inner mt-8">
          <FiShieldOff className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Enterprise Tenancy Disabled</h2>
          <p className="text-sm text-slate-500 max-w-lg mx-auto">
            The enterprise tenant foundation is currently inactive in this environment. 
            Enable the 
            <code className="mx-1 px-1.5 py-0.5 bg-slate-200 rounded text-slate-700 font-mono font-bold text-xs">ENTERPRISE_TENANCY_ENABLED</code>
            feature flag from <strong className="text-indigo-600">Settings &gt; Feature Flags</strong> to manage tenants.
          </p>
        </div>
      ) : (
        <>
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

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Quick Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 text-xs">
            <button
              type="button"
              onClick={() => setLifecycleFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                lifecycleFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Organizations ({tenants.length})
            </button>
            <button
              type="button"
              onClick={() => setLifecycleFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                lifecycleFilter === 'ACTIVE'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-emerald-700 hover:text-emerald-900'
              }`}
            >
              Active ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setLifecycleFilter('SUSPENDED')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                lifecycleFilter === 'SUSPENDED'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-amber-700 hover:text-amber-900'
              }`}
            >
              Suspended ({suspendedCount})
            </button>
            {otherCount > 0 && (
              <button
                type="button"
                onClick={() => setLifecycleFilter('OTHER')}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  lifecycleFilter === 'OTHER'
                    ? 'bg-slate-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Other ({otherCount})
              </button>
            )}
          </div>

          <span className="text-xs text-slate-400 font-medium">
            Showing <strong className="text-slate-700 font-bold">{filteredTenants.length}</strong> of {tenants.length} organizations
          </span>
        </div>

        <div className="relative">
          <FiSearch className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500 transition"
            placeholder="Search tenants by organization name, slug, ID…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <FiX className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <FiRefreshCw className="animate-spin h-6 w-6 text-indigo-600 mx-auto mb-2" />
            Loading tenant registry…
          </div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-amber-800">Tenant registry is unavailable. No empty tenant result is inferred from the failed request.</div>
        ) : filteredTenants.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No enterprise tenants match your search and filter criteria.
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
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-black flex items-center justify-center text-xs shrink-0 shadow-2xs">
                          {(tenant.displayName || 'T').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">{tenant.displayName}</div>
                          <div className="text-[10px] text-slate-400 font-mono select-all truncate">{tenant.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                      {tenant.slug}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                        tenant.isolationTier === 'ENTERPRISE' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                        tenant.isolationTier === 'REGULATED' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {tenant.isolationTier}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        tenant.lifecycleState === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                        tenant.lifecycleState === 'SUSPENDED' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${tenant.lifecycleState === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {tenant.lifecycleState}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <button
                        type="button"
                        onClick={() => { setSelectedTenant(tenant); setEditingTenantName(tenant.displayName || ''); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 font-bold hover:bg-slate-100 text-xs transition shadow-2xs"
                      >
                        <FiEye /> Workspace 360
                      </button>
                      {tenant.lifecycleState === 'ACTIVE' ? (
                        <button
                          type="button"
                          onClick={() => handleLifecycle(tenant, 'SUSPENDED')}
                          disabled={busyTenant === `${tenant.id}:SUSPENDED`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 font-bold hover:bg-amber-100 text-xs transition shadow-2xs"
                        >
                          <FiShieldOff /> {busyTenant === `${tenant.id}:SUSPENDED` ? 'Suspending…' : 'Suspend'}
                        </button>
                      ) : tenant.lifecycleState === 'SUSPENDED' ? (
                        <button
                          type="button"
                          onClick={() => handleLifecycle(tenant, 'ACTIVE')}
                          disabled={busyTenant === `${tenant.id}:ACTIVE`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold hover:bg-emerald-100 text-xs transition shadow-2xs"
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

      {/* Centered Grand Tenant 360 Workspace Modal */}
      {selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in" onClick={() => setSelectedTenant(null)}>
          <div
            className="w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Tenant detail"
          >
            {/* Header Gradient Banner */}
            <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-6 py-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-xl text-indigo-300 shrink-0">
                  <FiServer />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-extrabold text-white truncate">{selectedTenant.displayName}</h3>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                      selectedTenant.lifecycleState === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {selectedTenant.lifecycleState}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                      {selectedTenant.isolationTier}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5 truncate select-all">{selectedTenant.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedTenant(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
                  aria-label="Close modal"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Rename Strip for SuperAdmin */}
              {isSuperAdmin && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-800">Organization Display Name</p>
                    <p className="text-[11px] text-slate-500">Update the public display name of this enterprise tenant.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="platform-tenant-name"
                      value={editingTenantName}
                      onChange={event => setEditingTenantName(event.target.value)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:border-indigo-500 min-w-[200px]"
                      maxLength={120}
                    />
                    <button
                      type="button"
                      onClick={handleRename}
                      disabled={renaming}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                    >
                      {renaming ? 'Saving…' : 'Rename'}
                    </button>
                  </div>
                </div>
              )}

              {/* Attributes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-slate-400">Slug / Namespace</p>
                  <p className="text-xs font-mono font-bold text-slate-900 mt-1 truncate">{selectedTenant.slug}</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-slate-400">Lifecycle State</p>
                  <p className="text-xs font-bold text-slate-900 mt-1">{selectedTenant.lifecycleState}</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-slate-400">Isolation Tier</p>
                  <p className="text-xs font-bold text-slate-900 mt-1">{selectedTenant.isolationTier}</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-slate-400">Hosting Region</p>
                  <p className="text-xs font-bold text-slate-900 mt-1">{selectedTenant.region || 'default'}</p>
                </div>
              </div>

              {detailLoading && (
                <div className="p-8 rounded-2xl border border-slate-200 bg-slate-50 text-center space-y-2" role="status">
                  <FiRefreshCw className="h-6 w-6 animate-spin text-indigo-600 mx-auto" />
                  <p className="text-xs font-bold text-slate-600">Loading tenant telemetry, users, usage metrics and audit trail…</p>
                </div>
              )}

              {detailError && (
                <div className="p-4 rounded-2xl border border-red-200 bg-red-50 text-xs text-red-800 flex items-center justify-between" role="alert">
                  <span>{detailError}</span>
                  <button type="button" className="font-bold underline" onClick={() => setDetailRefresh(value => value + 1)}>Retry</button>
                </div>
              )}

              {selectedDetail && (
                <div className="space-y-6" data-testid="tenant-detail-sections">
                  {/* Overview Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(selectedDetail.overview || {}).map(([key, item]) => (
                      <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{key.replaceAll('_', ' ')}</p>
                        <p className="mt-1 text-sm font-extrabold text-slate-900">{item?.value === null || item?.value === undefined ? 'Unavailable' : item.value}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item?.source || 'unknown'}</p>
                      </div>
                    ))}
                  </div>

                  {/* Users & Memberships Card */}
                  <div className="rounded-2xl border border-slate-200 p-5 bg-white space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                          <FiUser className="text-indigo-600" /> Users &amp; Memberships
                        </h4>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {selectedDetail.users?.source || 'unknown'} · {selectedDetail.memberships?.items?.length ?? (selectedDetail.users?.items?.length || 0)} registered members
                        </p>
                      </div>
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => setShowAddMember(prev => !prev)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition"
                        >
                          <FiUserPlus /> Add Member
                        </button>
                      )}
                    </div>

                    {/* Add Member Form */}
                    {showAddMember && (
                      <form onSubmit={handleAddMember} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-fade-in">
                        <p className="text-xs font-bold text-slate-900">Add User to Organization</p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="email"
                            required
                            placeholder="User email address"
                            value={memberEmail}
                            onChange={e => setMemberEmail(e.target.value)}
                            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-indigo-500 font-medium"
                          />
                          <select
                            value={memberRole}
                            onChange={e => setMemberRole(e.target.value)}
                            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                          >
                            <option value="MEMBER">Member</option>
                            <option value="ADMIN">Admin</option>
                            <option value="OWNER">Owner</option>
                          </select>
                          <button
                            type="submit"
                            disabled={memberBusy}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition disabled:opacity-50 shadow-xs"
                          >
                            {memberBusy ? 'Adding…' : 'Add Member'}
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto">
                      {(selectedDetail.users?.items || []).length === 0 ? (
                        <p className="col-span-2 text-xs text-slate-400 italic py-4 text-center">No assigned members in this organization.</p>
                      ) : (
                        (selectedDetail.users?.items || []).map(user => (
                          <div key={user.id} className="flex items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
                            <div className="truncate">
                              <span className="font-bold text-slate-900">{user.email || user.id}</span>
                              <span className="ml-2 px-2 py-0.5 rounded-md bg-indigo-100 text-[10px] font-black text-indigo-800">{user.roles?.join(', ') || user.role || 'MEMBER'}</span>
                            </div>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(user.id, user.email || user.id)}
                                disabled={memberBusy}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Remove member from tenant"
                              >
                                <FiTrash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Custom Commercial Agreement & AI Token Governance Card */}
                  {isSuperAdmin && (
                    <div className="rounded-2xl border border-indigo-100 bg-linear-to-br from-indigo-50/40 via-slate-50 to-white p-5 space-y-4 shadow-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100/60 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
                            <FiCpu className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                              Custom Commercial Agreement &amp; AI Token Governance
                              <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-[10px] font-black text-indigo-800 uppercase tracking-wider">
                                Custom SLA
                              </span>
                            </h4>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Configure contracted plan, seat capacity, daily AI request quotas, and primary LLM model.
                            </p>
                          </div>
                        </div>
                      </div>

                      <form onSubmit={handleSaveAgreementPolicy} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {/* Commercial Plan */}
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">Contracted Plan</label>
                            <input
                              type="text"
                              required
                              value={policyPlan}
                              onChange={e => setPolicyPlan(e.target.value)}
                              placeholder="e.g. Enterprise Custom SLA"
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500"
                            />
                          </div>

                          {/* Contracted Seats */}
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">Contracted Seats Limit</label>
                            <input
                              type="number"
                              min={1}
                              max={50000}
                              required
                              value={policySeats}
                              onChange={e => setPolicySeats(Number(e.target.value))}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500"
                            />
                          </div>

                          {/* Billing Currency */}
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">Contract Currency</label>
                            <select
                              value={policyCurrency}
                              onChange={e => setPolicyCurrency(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden focus:border-indigo-500"
                            >
                              <option value="INR">INR (₹)</option>
                              <option value="USD">USD ($)</option>
                              <option value="EUR">EUR (€)</option>
                              <option value="GBP">GBP (£)</option>
                            </select>
                          </div>

                          {/* Daily AI Operations Quota */}
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">Daily AI Operations Quota</label>
                            <input
                              type="number"
                              min={10}
                              max={500000}
                              required
                              value={policyDailyLimit}
                              onChange={e => setPolicyDailyLimit(Number(e.target.value))}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500"
                            />
                            <p className="text-[10px] text-slate-400 mt-0.5">Enforced atomically across all tenant members.</p>
                          </div>

                          {/* Primary LLM Model */}
                          <div className="lg:col-span-2">
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">Primary LLM Model Routing</label>
                            <input
                              type="text"
                              required
                              value={policyPrimaryModel}
                              onChange={e => setPolicyPrimaryModel(e.target.value)}
                              placeholder="e.g. meta/llama-3.2-11b-vision-instruct"
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500"
                            />
                            <p className="text-[10px] text-slate-400 mt-0.5">Active default: meta/llama-3.2-11b-vision-instruct</p>
                          </div>
                        </div>

                        {/* Dedicated BYOK API Keys Section */}
                        <div className="pt-2 border-t border-indigo-100/60">
                          <button
                            type="button"
                            onClick={() => setShowDedicatedKeys(prev => !prev)}
                            className="flex items-center justify-between w-full text-left py-1 text-xs font-bold text-indigo-900 hover:text-indigo-700 cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5">
                              <span>🔑</span> Dedicated Tenant AI Keys (BYOK — Bring Your Own Key)
                            </span>
                            <span className="text-[11px] text-indigo-600 font-semibold">
                              {showDedicatedKeys ? '▲ Hide Dedicated Keys' : '▼ Configure Dedicated Keys (Optional)'}
                            </span>
                          </button>
                          
                          {showDedicatedKeys && (
                            <div className="mt-2.5 p-3.5 bg-white border border-indigo-100 rounded-xl space-y-3 animate-fade-in">
                              <p className="text-[11px] text-slate-600 leading-relaxed">
                                Enter dedicated API keys for this tenant. When configured, AI operations from this organization are routed exclusively through these credentials and billed to the tenant's own provider account.
                              </p>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">NVIDIA NIM Dedicated Key</label>
                                  <input
                                    type="password"
                                    value={nvidiaCustomKey}
                                    onChange={e => setNvidiaCustomKey(e.target.value)}
                                    placeholder={selectedTenant.aiPolicy?.customProviderKeys?.nvidia ? '•••••••• (Active)' : 'nvapi-...'}
                                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:bg-white focus:outline-hidden focus:border-indigo-500"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Google Gemini Dedicated Key</label>
                                  <input
                                    type="password"
                                    value={geminiCustomKey}
                                    onChange={e => setGeminiCustomKey(e.target.value)}
                                    placeholder={selectedTenant.aiPolicy?.customProviderKeys?.gemini ? '•••••••• (Active)' : 'AIza...'}
                                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:bg-white focus:outline-hidden focus:border-indigo-500"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">OpenAI Dedicated Key</label>
                                  <input
                                    type="password"
                                    value={openaiCustomKey}
                                    onChange={e => setOpenaiCustomKey(e.target.value)}
                                    placeholder={selectedTenant.aiPolicy?.customProviderKeys?.openai ? '•••••••• (Active)' : 'sk-...'}
                                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:bg-white focus:outline-hidden focus:border-indigo-500"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            type="submit"
                            disabled={savingPolicy}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-xs cursor-pointer"
                          >
                            <FiSave /> {savingPolicy ? 'Saving Agreement…' : 'Save Agreement & AI Policy'}
                          </button>
                        </div>

                      </form>
                    </div>
                  )}

                  {/* 2-Column Telemetry & Security Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Usage */}
                    <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50/50 space-y-2">
                      <h4 className="text-xs font-extrabold text-slate-900">Usage &amp; Quotas</h4>
                      <p className="text-[11px] text-slate-500">Source: {selectedDetail.usage?.source || 'unknown'}</p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="p-3 bg-white border border-slate-200 rounded-xl">
                          <p className="text-[10px] font-black text-slate-400 uppercase">Requests</p>
                          <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedDetail.usage?.requests ?? 'Unavailable'}</p>
                        </div>
                        <div className="p-3 bg-white border border-slate-200 rounded-xl">
                          <p className="text-[10px] font-black text-slate-400 uppercase">Tokens</p>
                          <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedDetail.usage?.inputTokens === null ? 'Unavailable' : `${(selectedDetail.usage?.inputTokens || 0) + (selectedDetail.usage?.outputTokens || 0)}`}</p>
                        </div>
                      </div>
                    </div>

                    {/* Security & M2M */}
                    <div className="rounded-2xl border border-slate-200 p-4 bg-slate-50/50 space-y-2">
                      <h4 className="text-xs font-extrabold text-slate-900">Security &amp; M2M</h4>
                      <p className="text-[11px] text-slate-500">Security: {selectedDetail.security?.source || 'unknown'} · M2M: {selectedDetail.m2m?.source || 'unknown'}</p>
                      <div className="p-3 bg-white border border-slate-200 rounded-xl">
                        <p className="text-[10px] font-black text-slate-400 uppercase">Service Accounts</p>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedDetail.m2m?.accounts?.length ?? 'Unavailable'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Audit & Activity */}
                  <div className="rounded-2xl border border-slate-200 p-4 bg-white space-y-2">
                    <h4 className="text-xs font-extrabold text-slate-900">Recent Audit &amp; Activity Stream</h4>
                    <p className="text-[11px] text-slate-500">Source: {selectedDetail.audit?.source || 'unknown'}</p>
                    <div className="space-y-1.5 pt-1 max-h-36 overflow-y-auto">
                      {(selectedDetail.activity?.events || []).length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">No recent audit events recorded for this organization.</p>
                      ) : (
                        (selectedDetail.activity?.events || []).slice(0, 5).map(event => (
                          <div key={event.id} className="flex justify-between items-center p-2 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                            <span className="font-bold text-slate-800">{event.action}</span>
                            <span className="text-[11px] text-slate-400">{event.occurredAt ? new Date(event.occurredAt).toLocaleString() : 'time unavailable'}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Link Pills */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <a className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition" href={`/enterprise?tab=audit&tenant=${encodeURIComponent(selectedTenant.id)}`}>
                  Tenant Audit Trail →
                </a>
                <a className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition" href={`/enterprise?tab=usage&tenant=${encodeURIComponent(selectedTenant.id)}`}>
                  Usage Analytics →
                </a>
                <a className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition" href="/adm/security">
                  Security Events →
                </a>
              </div>

              {/* SuperAdmin Decommission Zone */}
              {isSuperAdmin && selectedTenant.lifecycleState !== 'DELETING' && selectedTenant.lifecycleState !== 'DELETED' && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 text-xs space-y-3">
                  <div className="flex items-center gap-2 text-rose-900 font-extrabold text-sm">
                    <FiShieldOff className="text-rose-600" /> Organization Decommissioning Zone
                  </div>
                  <p className="text-rose-800 leading-relaxed">
                    Uses the authoritative Enterprise lifecycle state machine to transition this organization to <strong>DELETING</strong>. 
                    Data will enter the enterprise retention grace period before hard deletion.
                  </p>
                  <textarea
                    className="w-full rounded-xl border border-rose-200 bg-white p-3 text-xs font-medium focus:outline-hidden focus:border-rose-500"
                    rows={2}
                    placeholder="Required decommission justification reason (minimum 8 characters)"
                    value={decommissionReason}
                    onChange={e => setDecommissionReason(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleDecommission(selectedTenant)}
                      disabled={busyTenant === `${selectedTenant.id}:DELETING`}
                      className="px-4 py-2 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition shadow-xs disabled:opacity-50"
                    >
                      {busyTenant === `${selectedTenant.id}:DELETING` ? 'Decommissioning…' : 'Decommission Organization'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
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
      </>
      )}
    </div>
  );
}
