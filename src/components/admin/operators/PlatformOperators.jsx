import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  FiShield, FiRefreshCw, FiAlertTriangle, FiCheck, FiUserCheck, FiUsers, 
  FiLock, FiKey, FiCopy, FiSearch, FiSliders, FiLogOut, FiUserX, 
  FiInfo, FiExternalLink, FiX, FiCheckCircle, FiActivity, FiEye
} from 'react-icons/fi';
import { useAdminSession } from '../AdminContext';
import { getOperators, searchPlatform, setOperatorRole, revokeOperatorSessions } from '../../../services/platformApi';
import useConfirmDialog from '../../../hooks/useConfirmDialog';

const ASSIGNABLE = [
  { id: 'ADMIN', label: 'ADMIN — Platform Administrator (Full Console Access)', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'SUPPORT', label: 'SUPPORT — Support Agent (Read-Only Diagnostics)', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'USER', label: 'USER — Standard Consumer (Demote & Remove Admin Access)', badge: 'bg-slate-50 text-slate-700 border-slate-200' }
];

const ROLE_SCOPES = {
  SUPER_ADMIN: {
    title: 'SUPER_ADMIN (Root Security Authority)',
    description: 'Holds full unrestricted platform authority (*). Owns operator assignment, tenant decommission, platform maintenance mode, payment gateway credentials, and encrypted secrets vault. MFA is enforced on all mutations.',
    badge: 'bg-purple-100 text-purple-800 border-purple-300',
    color: 'purple',
    permissions: ['* (Root Unrestricted)', 'iam.operators', 'platform.maintenance', 'tenants.decommission', 'system.config.write', 'payments.manage', 'ai.governance']
  },
  ADMIN: {
    title: 'ADMIN (Platform Administrator)',
    description: 'Primary platform operational administrator. Manages resumes, users, CMS blog posts, templates, AI provider settings, support tickets, system health, and payments inspection.',
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    color: 'indigo',
    permissions: ['users.manage', 'resumes.manage', 'ai.settings.write', 'templates.manage', 'cms.manage', 'payments.read', 'support.read']
  },
  SUPPORT: {
    title: 'SUPPORT (Diagnostic Support Agent)',
    description: 'Support and customer service tier. Holds read-only access for user diagnostics, activity inspection, and resume troubleshooting. Cannot modify platform configuration, rotate secrets, or open sensitive settings.',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    color: 'amber',
    permissions: ['users.read', 'resumes.read', 'support.access', 'audit.read']
  },
  USER: {
    title: 'USER (Standard Retail Account)',
    description: 'Standard end-user or candidate account. Has zero administrative permissions and cannot access the /adm control plane.',
    badge: 'bg-slate-100 text-slate-800 border-slate-300',
    color: 'slate',
    permissions: ['Standard Resume Builder Access']
  }
};

export default function PlatformOperators() {
  const { isSuperAdmin } = useAdminSession();
  const { confirm, confirmationDialog } = useConfirmDialog();
  
  const [operators, setOperators] = useState([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Assignment State
  const [uid, setUid] = useState('');
  const [role, setRole] = useState('ADMIN');
  const [saving, setSaving] = useState(false);
  const [lookupState, setLookupState] = useState({ loading: false, user: null, message: '' });
  
  // Search & Filter Tabs
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'suspended'
  const [copiedId, setCopiedId] = useState(null);
  
  // Operator 360 Drawer State
  const [selectedOperator, setSelectedOperator] = useState(null);
  const [drawerActionBusy, setDrawerActionBusy] = useState(false);
  const [drawerNotice, setDrawerNotice] = useState(null);
  const [drawerError, setDrawerError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getOperators();
      setOperators(result.operators || []);
      setNote(result.note || '');
    } catch (err) {
      setError(err.message || 'Operators unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Copy helper with visual indicator
  const handleCopy = (text, id) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Live lookup of target user before role assignment
  const handleLookup = async (inputVal) => {
    const needle = String(inputVal || uid).trim();
    if (!needle) {
      setLookupState({ loading: false, user: null, message: '' });
      return;
    }
    setLookupState(prev => ({ ...prev, loading: true, message: '' }));
    try {
      const result = await searchPlatform(needle);
      const matched = (result.users || []).find(u => 
        u.id === needle || String(u.email || '').toLowerCase() === needle.toLowerCase()
      ) || (result.users || [])[0];

      if (matched) {
        setLookupState({
          loading: false,
          user: matched,
          message: `Resolved: ${matched.displayName || matched.email || matched.id}`
        });
        if (needle !== matched.id && needle.includes('@')) {
          setUid(matched.id);
        }
      } else {
        setLookupState({ loading: false, user: null, message: 'No registered user matched that identifier.' });
      }
    } catch (err) {
      setLookupState({ loading: false, user: null, message: err.message });
    }
  };

  const changeRole = async (targetUid, nextRole, expectedRole = '') => {
    if (!isSuperAdmin) return;
    const accepted = await confirm({
      title: `Assign Role: ${nextRole}`,
      message: `Assign role ${nextRole} to ${targetUid}? Their refresh tokens will be immediately revoked, signing them out of all active browser sessions for security. SUPER_ADMIN cannot be assigned or removed here.`,
      confirmLabel: `Confirm & Assign ${nextRole}`,
      variant: nextRole === 'USER' ? 'danger' : 'primary',
    });
    if (!accepted) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await setOperatorRole(targetUid, nextRole, expectedRole);
      setNotice(`Role ${nextRole} successfully assigned to ${targetUid}. Active sessions were revoked.`);
      setUid('');
      setLookupState({ loading: false, user: null, message: '' });
      if (selectedOperator && selectedOperator.id === targetUid) {
        setSelectedOperator(prev => prev ? { ...prev, role: nextRole } : null);
      }
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update operator role.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeSessions = async (targetOperator) => {
    if (!isSuperAdmin || !targetOperator) return;
    const accepted = await confirm({
      title: 'Emergency Session Revocation',
      message: `Revoke all active sessions and refresh tokens for operator "${targetOperator.email || targetOperator.id}"? They will be immediately logged out of all active web and API clients.`,
      confirmLabel: 'Revoke All Sessions',
      variant: 'danger',
    });
    if (!accepted) return;
    setDrawerActionBusy(true);
    setDrawerNotice(null);
    setDrawerError(null);
    try {
      const res = await revokeOperatorSessions(targetOperator.id);
      setDrawerNotice(res.message || 'All active sessions and refresh tokens have been revoked.');
      setNotice(`Sessions revoked for ${targetOperator.email || targetOperator.id}.`);
    } catch (err) {
      setDrawerError(err.message || 'Session revocation failed.');
    } finally {
      setDrawerActionBusy(false);
    }
  };

  const assign = async (event) => {
    event.preventDefault();
    if (!uid.trim()) return;
    await changeRole(uid.trim(), role);
  };

  // Computed Security KPI Metrics
  const stats = useMemo(() => {
    const total = operators.length;
    const superAdmins = operators.filter(o => o.role === 'SUPER_ADMIN').length;
    const platformAdmins = operators.filter(o => o.role === 'ADMIN').length;
    const support = operators.filter(o => o.role === 'SUPPORT').length;
    const mfaEnrolled = operators.filter(o => o.mfaEnabled).length;
    const mfaRate = total > 0 ? Math.round((mfaEnrolled / total) * 100) : 100;
    const suspended = operators.filter(o => o.suspended).length;
    return { total, superAdmins, platformAdmins, support, mfaEnrolled, mfaRate, suspended };
  }, [operators]);

  // Tab Filtering & Query Search
  const filtered = useMemo(() => {
    let list = operators;
    if (activeTab === 'SUPER_ADMIN') list = list.filter(o => o.role === 'SUPER_ADMIN');
    else if (activeTab === 'ADMIN') list = list.filter(o => o.role === 'ADMIN');
    else if (activeTab === 'SUPPORT') list = list.filter(o => o.role === 'SUPPORT');
    else if (activeTab === 'suspended') list = list.filter(o => o.suspended);

    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(op => 
      [op.id, op.email, op.displayName, op.role].some(val => 
        String(val || '').toLowerCase().includes(q)
      )
    );
  }, [operators, activeTab, query]);

  return (
    <div className="space-y-6 animate-fade-in text-xs">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 shadow-xs">
            <FiShield className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Platform Operators &amp; IAM Security</h1>
              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase tracking-wider">
                RBAC Control Plane
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Authoritative management of root SuperAdmins, Platform Admins (ADMIN), and Support Agents (SUPPORT).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button 
            type="button" 
            onClick={load} 
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> 
            {loading ? 'Refreshing…' : 'Refresh Operators'}
          </button>
        </div>
      </div>

      {/* 2. Top Security Posture & KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold">Total Operators</span>
            <FiUsers className="text-slate-400 h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-slate-900">{stats.total}</p>
          <p className="text-[10px] text-slate-400 font-medium">Authoritative claims verified</p>
        </div>

        <div className="p-4 bg-purple-50/50 rounded-2xl border border-purple-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-purple-700">
            <span className="text-[11px] font-bold">Super Admins</span>
            <FiShield className="text-purple-500 h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-purple-900">{stats.superAdmins}</p>
          <p className="text-[10px] text-purple-600 font-medium">Root security authorities</p>
        </div>

        <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-indigo-700">
            <span className="text-[11px] font-bold">Platform Admins</span>
            <FiKey className="text-indigo-500 h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-indigo-900">{stats.platformAdmins}</p>
          <p className="text-[10px] text-indigo-600 font-medium">Console management</p>
        </div>

        <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200/80 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[11px] font-bold">Support Agents</span>
            <FiActivity className="text-amber-500 h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-amber-900">{stats.support}</p>
          <p className="text-[10px] text-amber-600 font-medium">Diagnostics &amp; helpdesk</p>
        </div>

        <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/80 shadow-2xs space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[11px] font-bold">MFA Compliance</span>
            <FiLock className="text-emerald-500 h-4 w-4" />
          </div>
          <p className="text-2xl font-black text-emerald-900">{stats.mfaRate}%</p>
          <p className="text-[10px] text-emerald-600 font-medium">{stats.mfaEnrolled} of {stats.total} enrolled</p>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2 font-semibold">
            <FiAlertTriangle className="text-red-600 shrink-0 h-4 w-4" />
            <span>{error}</span>
          </div>
          <button type="button" className="font-bold underline cursor-pointer" onClick={load}>Retry</button>
        </div>
      )}

      {notice && (
        <div role="status" className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2 font-semibold">
            <FiCheckCircle className="text-emerald-600 shrink-0 h-4 w-4" />
            <span>{notice}</span>
          </div>
          <button type="button" onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-800 font-bold ml-2 cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* 3. Assign / Elevate Operator Card */}
      {isSuperAdmin && (
        <div className="bg-white rounded-2xl border border-indigo-100 p-5 space-y-4 shadow-xs">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <FiUserCheck className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Elevate User to Platform Operator</h2>
              <p className="text-[11px] text-slate-500">
                Grant ADMIN or SUPPORT claims to a registered user. This immediately revokes their active refresh tokens across all sessions.
              </p>
            </div>
          </div>

          <form onSubmit={assign} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-6">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Target User Identifier</label>
                <div className="relative">
                  <input 
                    required 
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-mono text-xs focus:outline-hidden focus:border-indigo-500 transition" 
                    placeholder="Enter Firebase UID or exact email (e.g. user@domain.com)" 
                    value={uid} 
                    onChange={e => setUid(e.target.value)} 
                    onBlur={() => handleLookup(uid)} 
                  />
                  {lookupState.loading && (
                    <div className="absolute right-3 top-2.5">
                      <FiRefreshCw className="h-4 w-4 animate-spin text-indigo-600" />
                    </div>
                  )}
                </div>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Assigned Role</label>
                <select 
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-bold text-slate-800 text-xs focus:outline-hidden focus:border-indigo-500 bg-white" 
                  value={role} 
                  onChange={e => setRole(e.target.value)}
                >
                  {ASSIGNABLE.map(item => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 flex items-end">
                <button 
                  type="submit" 
                  disabled={saving || !uid.trim()} 
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {saving ? <><FiRefreshCw className="animate-spin" /> Saving…</> : <><FiKey /> Assign Role</>}
                </button>
              </div>
            </div>

            {/* Resolved User Preview Card */}
            {lookupState.user && (
              <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl flex items-center justify-between animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center text-xs">
                    {(lookupState.user.displayName || lookupState.user.email || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{lookupState.user.displayName || 'Unnamed User'}</span>
                      <span className="text-slate-500 font-mono text-[11px]">({lookupState.user.email})</span>
                      {lookupState.user.emailVerified && (
                        <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold">Verified</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono">UID: {lookupState.user.id}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Current Role: </span>
                  <span className="font-extrabold text-slate-800">{lookupState.user.role || 'USER'}</span>
                </div>
              </div>
            )}

            {lookupState.message && !lookupState.user && (
              <p className="text-[11px] text-amber-700 font-semibold">{lookupState.message}</p>
            )}

            <p className="text-[11px] text-slate-400">
              <span className="font-bold text-slate-600">Security Invariant:</span> SUPER_ADMIN is immutable through standard role management. SUPPORT users have read-only diagnostic capability and cannot open sensitive configuration consoles.
            </p>
          </form>
        </div>
      )}

      {/* 4. Filter Tabs & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3.5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Quick Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            {[
              { id: 'all', label: `All Operators (${stats.total})` },
              { id: 'SUPER_ADMIN', label: `Super Admins (${stats.superAdmins})` },
              { id: 'ADMIN', label: `Platform Admins (${stats.platformAdmins})` },
              { id: 'SUPPORT', label: `Support (${stats.support})` },
              { id: 'suspended', label: `Suspended (${stats.suspended})` },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative min-w-[260px]">
            <FiSearch className="absolute left-3 top-3 text-slate-400" />
            <input 
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:border-indigo-500 focus:bg-white transition" 
              placeholder="Search by name, email, UID or role…" 
              value={query} 
              onChange={e => setQuery(e.target.value)} 
            />
          </div>
        </div>

        {/* 5. Operators Table */}
        <div className="border border-slate-200/80 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500 space-y-2">
              <FiRefreshCw className="h-6 w-6 animate-spin mx-auto text-indigo-600" />
              <p className="font-semibold">Loading authoritative operator claims…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500 space-y-1">
              <FiUsers className="h-8 w-8 mx-auto text-slate-300 mb-1" />
              <p className="font-bold text-slate-700">No operator records match this filter</p>
              <p className="text-xs text-slate-400">Try adjusting your search query or role filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 uppercase text-[10px] font-black text-slate-500 tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Operator Identity</th>
                    <th className="py-3 px-4">Firebase UID</th>
                    <th className="py-3 px-4">Verified Role Claim</th>
                    <th className="py-3 px-4">Security Posture</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(op => {
                    const roleMeta = ROLE_SCOPES[op.role] || ROLE_SCOPES.USER;
                    return (
                      <tr key={op.id} className="hover:bg-slate-50/80 transition group">
                        {/* Operator Identity */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-2xs ${
                              op.role === 'SUPER_ADMIN' ? 'bg-purple-600' :
                              op.role === 'ADMIN' ? 'bg-indigo-600' : 'bg-amber-600'
                            }`}>
                              {(op.displayName || op.email || 'O')[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-slate-900">{op.displayName || 'Unnamed Operator'}</span>
                                {op.emailVerified && (
                                  <span title="Email Verified" className="text-emerald-600 font-bold">✓</span>
                                )}
                              </div>
                              <span className="text-slate-500 font-medium text-[11px] block">{op.email || 'No email associated'}</span>
                            </div>
                          </div>
                        </td>

                        {/* UID with copy button */}
                        <td className="py-3 px-4">
                          <div className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md font-mono text-[11px] text-slate-700">
                            <span>{op.id.slice(0, 10)}…{op.id.slice(-4)}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(op.id, op.id)}
                              className="text-slate-400 hover:text-indigo-600 transition cursor-pointer p-0.5"
                              title="Copy full UID"
                            >
                              {copiedId === op.id ? <FiCheck className="text-emerald-600" /> : <FiCopy />}
                            </button>
                          </div>
                        </td>

                        {/* Verified Role Claim */}
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border uppercase tracking-wider ${roleMeta.badge}`}>
                            {op.role === 'SUPER_ADMIN' && <FiShield className="h-3 w-3" />}
                            {op.role === 'ADMIN' && <FiKey className="h-3 w-3" />}
                            {op.role === 'SUPPORT' && <FiActivity className="h-3 w-3" />}
                            {op.role}
                          </span>
                        </td>

                        {/* Security Posture */}
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            {op.mfaEnabled ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold">
                                <FiLock className="h-2.5 w-2.5" /> MFA Enrolled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-extrabold">
                                <FiAlertTriangle className="h-2.5 w-2.5" /> No MFA
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Account Status */}
                        <td className="py-3 px-4">
                          {op.suspended ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-black uppercase">
                              ● Suspended
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                              ● Active
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOperator(op);
                              setDrawerNotice(null);
                              setDrawerError(null);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-bold text-xs transition cursor-pointer"
                          >
                            Manage 360
                          </button>

                          {op.role === 'SUPER_ADMIN' ? (
                            <span className="text-slate-400 font-bold text-[11px]">Protected</span>
                          ) : isSuperAdmin ? (
                            <select 
                              disabled={saving} 
                              defaultValue="" 
                              onChange={e => { 
                                const next = e.target.value; 
                                e.target.value = ''; 
                                if (next) changeRole(op.id, next, op.role); 
                              }} 
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold bg-white text-slate-700 hover:border-indigo-500 cursor-pointer"
                            >
                              <option value="">Role…</option>
                              {ASSIGNABLE.filter(item => item.id !== op.role).map(item => (
                                <option key={item.id} value={item.id}>{item.id}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Super Admin only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 6. Operator 360 Security Drawer Modal */}
      {selectedOperator && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Drawer Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-11 w-11 rounded-2xl flex items-center justify-center font-black text-sm text-white shadow-md ${
                  selectedOperator.role === 'SUPER_ADMIN' ? 'bg-purple-600' :
                  selectedOperator.role === 'ADMIN' ? 'bg-indigo-600' : 'bg-amber-600'
                }`}>
                  {(selectedOperator.displayName || selectedOperator.email || 'O')[0].toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black tracking-tight">{selectedOperator.displayName || 'Unnamed Operator'}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      ROLE_SCOPES[selectedOperator.role]?.badge || 'bg-slate-100 text-slate-800'
                    }`}>
                      {selectedOperator.role}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-mono mt-0.5">{selectedOperator.email || 'No email associated'}</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedOperator(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="p-6 space-y-5 overflow-y-auto">
              {drawerNotice && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 font-semibold animate-fade-in">
                  <FiCheckCircle className="text-emerald-600 shrink-0" />
                  <span>{drawerNotice}</span>
                </div>
              )}
              {drawerError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2 font-semibold animate-fade-in">
                  <FiAlertTriangle className="text-red-600 shrink-0" />
                  <span>{drawerError}</span>
                </div>
              )}

              {/* IAM Overview Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Authoritative Firebase UID</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-800">{selectedOperator.id}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedOperator.id, 'drawer-uid')}
                      className="text-slate-400 hover:text-indigo-600 transition cursor-pointer p-1"
                    >
                      {copiedId === 'drawer-uid' ? <FiCheck className="text-emerald-600" /> : <FiCopy />}
                    </button>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Email Verification</p>
                  <p className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    {selectedOperator.emailVerified ? (
                      <span className="text-emerald-600 flex items-center gap-1">✓ Verified Email Address</span>
                    ) : (
                      <span className="text-amber-600 flex items-center gap-1">⚠ Unverified Email Address</span>
                    )}
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Multi-Factor Authentication</p>
                  <p className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    {selectedOperator.mfaEnabled ? (
                      <span className="text-emerald-600 flex items-center gap-1"><FiLock /> Multi-Factor Enrolled (TOTP/SMS)</span>
                    ) : (
                      <span className="text-amber-600 flex items-center gap-1"><FiAlertTriangle /> No Second Factor Configured</span>
                    )}
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Account Status</p>
                  <p className="font-bold text-xs text-slate-800">
                    {selectedOperator.suspended ? 'Suspended (Disabled)' : 'Active (Healthy)'}
                  </p>
                </div>
              </div>

              {/* Role Scope & Authority Card */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-2">
                    <FiShield className="text-indigo-600" />
                    {ROLE_SCOPES[selectedOperator.role]?.title || 'Operator Role'}
                  </h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {ROLE_SCOPES[selectedOperator.role]?.description}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(ROLE_SCOPES[selectedOperator.role]?.permissions || []).map(perm => (
                    <span key={perm} className="px-2 py-0.5 bg-white border border-slate-200 rounded-md font-mono text-[10px] font-bold text-slate-700">
                      {perm}
                    </span>
                  ))}
                </div>
              </div>

              {/* Security Actions */}
              {isSuperAdmin && (
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <h4 className="font-extrabold text-xs text-slate-900">Privileged IAM Security Actions</h4>
                  
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    {/* Revoke All Sessions Button */}
                    <button
                      type="button"
                      disabled={drawerActionBusy}
                      onClick={() => handleRevokeSessions(selectedOperator)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-800 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <FiLogOut /> {drawerActionBusy ? 'Revoking…' : 'Revoke All Active Sessions'}
                    </button>

                    {/* Change Role Selector */}
                    {selectedOperator.role !== 'SUPER_ADMIN' && (
                      <div className="flex-1">
                        <select
                          disabled={saving || drawerActionBusy}
                          value={selectedOperator.role}
                          onChange={e => changeRole(selectedOperator.id, e.target.value, selectedOperator.role)}
                          className="w-full px-3 py-2.5 rounded-xl border border-indigo-200 bg-white font-bold text-slate-800 text-xs focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                        >
                          {ASSIGNABLE.map(item => (
                            <option key={item.id} value={item.id}>{item.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedOperator(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmationDialog}
    </div>
  );
}
