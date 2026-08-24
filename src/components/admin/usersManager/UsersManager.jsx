import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FiUsers, FiUser, FiUserCheck, FiShield, FiCreditCard, FiAlertTriangle,
  FiSearch, FiFilter, FiPlus, FiDownload, FiRefreshCw, FiMoreVertical,
  FiEdit2, FiTrash2, FiLock, FiUnlock, FiBriefcase, FiCpu, FiCheck,
  FiChevronLeft, FiChevronRight, FiSliders, FiDollarSign, FiKey, FiCopy
} from 'react-icons/fi';
import fire from '../../../conf/fire';
import { getAdminUsers, getUser360, getPlatformTenants, sendUserPasswordReset } from '../../../services/platformApi';
import {
  setUserAdminStatus, updateUserSubscription, toggleUserSuspension,
  deleteUserByAdmin, checkIfAdmin
} from '../../../firestore/dbOperations';
import useConfirmDialog from '../../../hooks/useConfirmDialog';
import User360Drawer from './User360Drawer';
import CreateUserModal from './CreateUserModal';

export default function UsersManager() {
  const { confirm, confirmationDialog } = useConfirmDialog();
  // Directory & Pagination state
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [pageToken, setPageToken] = useState(undefined);
  const [tokenHistory, setTokenHistory] = useState([undefined]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextPageToken, setNextPageToken] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [tenantFilter, setTenantFilter] = useState('');

  // Tenants catalog
  const [availableTenants, setAvailableTenants] = useState([]);

  // Multi-selection for bulk operations
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());

  // Modals & Drawers
  const [inspectUid, setInspectUid] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionMenuUid, setActionMenuUid] = useState(null);
  const [resetLinkData, setResetLinkData] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Current admin session
  const [currentUser, setCurrentUser] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Action busy states
  const [busyUser, setBusyUser] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Verify auth session
  useEffect(() => {
    const unsub = fire.auth().onAuthStateChanged(async (auth) => {
      setCurrentUser(auth);
      if (auth) {
        try {
          const tokenResult = await auth.getIdTokenResult();
          const role = String(tokenResult.claims?.role || '').toUpperCase();
          setIsSuperAdmin(role === 'SUPER_ADMIN' || tokenResult.claims?.permissions?.includes('*'));
        } catch (_) {}
      }
    });
    return () => unsub();
  }, []);

  // Fetch available tenants for filter & modal from authoritative platform API
  const fetchTenants = useCallback(async () => {
    try {
      const res = await getPlatformTenants();
      const list = (res?.tenants || []).map(d => ({
        id: d.id,
        displayName: d.displayName || d.name || d.id,
        slug: d.slug || d.id
      }));
      setAvailableTenants(list);
    } catch (_) {
      setAvailableTenants([]);
    }
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  // Load authoritative user directory with server-side pagination & filtering
  const loadUsers = useCallback(async (token = pageToken) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        limit: pageSize,
        pageToken: token || undefined,
        q: searchQuery.trim(),
        status: statusFilter,
        role: roleFilter,
        plan: planFilter,
        tenantId: tenantFilter,
      };

      const res = await getAdminUsers(params);
      if (res.success && Array.isArray(res.users)) {
        setUsers(res.users);
        setNextPageToken(res.nextPageToken || null);
      } else {
        setError(res.error || 'Failed to load user directory.');
      }
    } catch (err) {
      setError(err.message || 'Error communicating with user directory.');
    } finally {
      setLoading(false);
    }
  }, [pageSize, pageToken, searchQuery, statusFilter, roleFilter, planFilter, tenantFilter]);

  useEffect(() => {
    loadUsers(pageToken);
  }, [loadUsers, pageToken]);

  // Pagination navigation handlers
  const handleNextPage = () => {
    if (!nextPageToken) return;
    const nextIndex = currentPageIndex + 1;
    const newHistory = [...tokenHistory.slice(0, nextIndex), nextPageToken];
    setTokenHistory(newHistory);
    setCurrentPageIndex(nextIndex);
    setPageToken(nextPageToken);
    setSelectedUserIds(new Set());
  };

  const handlePrevPage = () => {
    if (currentPageIndex <= 0) return;
    const prevIndex = currentPageIndex - 1;
    const prevToken = tokenHistory[prevIndex];
    setCurrentPageIndex(prevIndex);
    setPageToken(prevToken);
    setSelectedUserIds(new Set());
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setRoleFilter('ALL');
    setPlanFilter('ALL');
    setTenantFilter('');
    setPageToken(undefined);
    setTokenHistory([undefined]);
    setCurrentPageIndex(0);
    setSelectedUserIds(new Set());
  };

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedUserIds.size === users.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map(u => u.id)));
    }
  };

  const handleToggleSelectUser = (id) => {
    const next = new Set(selectedUserIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedUserIds(next);
  };

  // Quick Action: Suspension
  const handleToggleSuspension = async (user) => {
    if (user.id === currentUser?.uid) {
      setError('Self-suspension is prohibited.');
      return;
    }
    const willSuspend = !user.suspended;
    setBusyUser(`${user.id}:suspend`);
    setActionMenuUid(null);
    try {
      await toggleUserSuspension(user.id, willSuspend, { expectedSuspended: Boolean(user.suspended) });
      setSuccess(willSuspend ? `Suspended account for ${user.email}.` : `Restored account for ${user.email}.`);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Suspension failed.');
    } finally {
      setBusyUser('');
    }
  };

  // Quick Action: Delete User
  const handleDeleteUser = async (user) => {
    if (user.id === currentUser?.uid) {
      setError('Self-deletion is prohibited.');
      return;
    }
    setActionMenuUid(null);
    const confirmed = await confirm({
      title: 'Permanently Delete User',
      message: `Are you sure you want to permanently delete ${user.displayName || user.email} (${user.id})? All owned resumes, applications, and settings will be permanently removed. The current target state will be verified before executing this administrative change. This cannot be undone.`,
      confirmText: 'Delete User',
      danger: true,
    });
    if (!confirmed) return;

    setBusyUser(`${user.id}:delete`);
    try {
      await deleteUserByAdmin(user.id, user.email, { expectedRole: user.role });
      setSuccess(`User ${user.email} deleted successfully.`);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Deletion failed.');
    } finally {
      setBusyUser('');
    }
  };

  // Administrative Password Reset
  const handleSendPasswordReset = async (user) => {
    setActionMenuUid(null);
    const confirmed = await confirm({
      title: 'Send Password Reset Link',
      message: `Generate and dispatch a secure password reset link for ${user.displayName || user.email}?`,
      confirmText: 'Send Reset Link',
      danger: false,
    });
    if (!confirmed) return;

    setBusyUser(`${user.id}:reset`);
    setError('');
    try {
      const res = await sendUserPasswordReset(user.id);
      if (res.success) {
        setSuccess(`Password reset link generated for ${res.email}.`);
        setResetLinkData({ email: res.email, resetLink: res.resetLink });
        setCopiedLink(false);
      } else {
        setError(res.error || 'Failed to generate password reset link.');
      }
    } catch (err) {
      setError(err.message || 'Error communicating with server.');
    } finally {
      setBusyUser('');
    }
  };


  // Bulk Actions
  const handleBulkSuspend = async (willSuspend) => {
    if (selectedUserIds.size === 0) return;
    const targetUids = Array.from(selectedUserIds).filter(id => id !== currentUser?.uid);
    setBulkBusy(true);
    setError('');
    setSuccess('');
    let succeeded = 0;
    const failed = [];
    for (const id of targetUids) {
      try {
        await toggleUserSuspension(id, willSuspend);
        succeeded++;
      } catch (err) {
        failed.push(err.message || id);
      }
    }
    setBulkBusy(false);
    setSelectedUserIds(new Set());
    if (failed.length > 0) {
      setError(`Some accounts could not be updated: ${failed.join(', ')}`);
    } else {
      setSuccess(`Bulk action completed: ${succeeded} user(s) ${willSuspend ? 'suspended' : 'restored'}.`);
    }
    await loadUsers();
  };

  // Export CSV (neutralizes spreadsheet formulas to prevent CSV injection)
  const sanitizeCsvCell = (value) => {
    const text = String(value === null || value === undefined ? '' : value);
    const neutralized = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${neutralized.replace(/"/g, '""')}"`;
  };

  const handleExportCsv = () => {
    if (!users.length) return;
    const headers = ['UID', 'Email', 'Name', 'Role', 'Status', 'Plan', 'Currency', 'Primary Tenant', 'All Tenants', 'Email Verified', 'MFA', 'Created At', 'Last Login'];
    const rows = users.map(u => [
      sanitizeCsvCell(u.id),
      sanitizeCsvCell(u.email),
      sanitizeCsvCell(u.displayName),
      sanitizeCsvCell(u.role),
      sanitizeCsvCell(u.suspended ? 'SUSPENDED' : 'ACTIVE'),
      sanitizeCsvCell(u.membership),
      sanitizeCsvCell(u.preferredCurrency),
      sanitizeCsvCell(u.primaryTenant?.displayName),
      sanitizeCsvCell(u.tenantMemberships?.map(t => t.displayName || t.slug).join('; ')),
      sanitizeCsvCell(u.emailVerified ? 'YES' : 'NO'),
      sanitizeCsvCell(u.mfaEnabled ? 'YES' : 'NO'),
      sanitizeCsvCell(u.createdAt),
      sanitizeCsvCell(u.lastLoginAt)
    ]);

    const csvBody = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `resumepilot_users_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Computed summary metrics
  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter(u => ['SUPER_ADMIN', 'ADMIN'].includes(u.role)).length;
    const premium = users.filter(u => u.membership === 'Premium').length;
    const suspended = users.filter(u => u.suspended).length;
    const withTenants = users.filter(u => u.tenantCount > 0).length;
    return { total, admins, premium, suspended, withTenants };
  }, [users]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5 animate-fade-in font-sans text-slate-800">
      {/* Header & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              <FiUsers className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Users Control-Plane</h1>
              <p className="text-xs text-slate-500 font-medium">Authoritative directory, multi-tenant governance, User 360, and AI entitlements.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loading || users.length === 0}
            className="px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-200 transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
          >
            <FiDownload /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition flex items-center gap-1.5 shadow-xs"
          >
            <FiPlus /> Provision User
          </button>
          <button
            type="button"
            onClick={() => loadUsers()}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition"
            title="Refresh Directory"
            aria-label="Refresh"
          >
            <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Page Users</p>
          <p className="text-xl font-black text-slate-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-500">In Organizations</p>
          <p className="text-xl font-black text-indigo-600 mt-1">{stats.withTenants}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-500">Admins</p>
          <p className="text-xl font-black text-amber-600 mt-1">{stats.admins}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-500">Premium Pro</p>
          <p className="text-xl font-black text-emerald-600 mt-1">{stats.premium}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-red-400">Suspended</p>
          <p className="text-xl font-black text-red-600 mt-1">{stats.suspended}</p>
        </div>
      </div>

      {/* Persistent Feedback Banners */}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between shadow-2xs animate-fade-in" role="alert">
          <div className="flex items-center gap-2 font-semibold">
            <FiAlertTriangle className="text-red-600 shrink-0 h-4 w-4" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')} className="text-red-500 hover:text-red-700 font-bold ml-2">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-2xs animate-fade-in" role="status">
          <div className="flex items-center gap-2 font-semibold">
            <FiCheck className="text-emerald-600 shrink-0 h-4 w-4" />
            <span>{success}</span>
          </div>
          <button type="button" onClick={() => setSuccess('')} className="text-emerald-500 hover:text-emerald-700 font-bold ml-2">Dismiss</button>
        </div>
      )}

      {/* Filter & Command Control Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* Search Box */}
          <div className="relative lg:col-span-2">
            <input
              type="text"
              placeholder="Search name, email, UID, organization…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500 text-xs font-semibold"
            />
            <FiSearch className="absolute left-3 top-2.5 text-slate-400" />
          </div>

          {/* Tenant Selector */}
          <div>
            <select
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500 text-xs font-bold text-slate-700"
            >
              <option value="">🏢 All Organizations</option>
              {availableTenants.map(t => (
                <option key={t.id} value={t.id}>{t.displayName}</option>
              ))}
            </select>
          </div>

          {/* Role Selector */}
          <div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500 text-xs font-bold text-slate-700"
            >
              <option value="ALL">⚡ All Roles</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              <option value="ADMIN">ADMIN</option>
              <option value="AUDITOR">AUDITOR</option>
              <option value="SUPPORT">SUPPORT</option>
              <option value="ENTERPRISE_ADMIN">ENTERPRISE_ADMIN</option>
              <option value="ENTERPRISE_MEMBER">ENTERPRISE_MEMBER</option>
              <option value="EMPLOYER">EMPLOYER</option>
              <option value="USER">USER</option>
            </select>
          </div>

          {/* Status & Plan Quick Filters */}
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-1/2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
            >
              <option value="all">Status: All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="w-1/2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
            >
              <option value="ALL">Plan: All</option>
              <option value="PREMIUM">Premium</option>
              <option value="BASIC">Basic</option>
            </select>
          </div>
        </div>

        {/* Active Filter Indicators & Reset */}
        {(searchQuery || statusFilter !== 'all' || roleFilter !== 'ALL' || planFilter !== 'ALL' || tenantFilter) && (
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
            <span className="text-slate-500">Filters active</span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-indigo-600 font-bold hover:underline"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* Floating Bulk Action Ribbon */}
      {selectedUserIds.size > 0 && (
        <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg flex items-center justify-between flex-wrap gap-2 text-xs animate-slide-down">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500 font-black text-[11px]">
              {selectedUserIds.size} selected
            </span>
            <span className="text-slate-300 font-medium">Bulk operations on selected users:</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleBulkSuspend(true)}
              disabled={bulkBusy}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50"
            >
              Suspend Selected
            </button>
            <button
              type="button"
              onClick={() => handleBulkSuspend(false)}
              disabled={bulkBusy}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50"
            >
              Restore Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedUserIds(new Set())}
              className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* User Directory Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading && !users.length ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-3">
            <FiRefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
            <p className="text-xs font-bold uppercase tracking-wider">Fetching directory records…</p>
          </div>
        ) : users.length === 0 ? (
          <div className="py-20 text-center text-slate-400 space-y-2">
            <FiUsers className="h-10 w-10 mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No users found matching current filters.</p>
            <p className="text-xs text-slate-400">Try adjusting your search terms or resetting filters.</p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-2 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="p-3.5 pl-4 w-8">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.size === users.length && users.length > 0}
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      aria-label="Select all users"
                    />
                  </th>
                  <th className="p-3.5">User Identity</th>
                  <th className="p-3.5">Organization / Tenant</th>
                  <th className="p-3.5">Platform Role</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Plan &amp; Currency</th>
                  <th className="p-3.5">Registered</th>
                  <th className="p-3.5 text-right pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => {
                  const isSelected = selectedUserIds.has(user.id);
                  const isSelf = user.id === currentUser?.uid;

                  return (
                    <tr
                      key={user.id}
                      onClick={() => setInspectUid(user.id)}
                      className={`hover:bg-slate-50/80 cursor-pointer transition ${
                        isSelected ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3.5 pl-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectUser(user.id)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label={`Select ${user.displayName || user.email}`}
                        />
                      </td>

                      {/* User Identity */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-indigo-700 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                            {user.displayName ? user.displayName.charAt(0).toUpperCase() : <FiUser />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 truncate">
                                {user.displayName || 'Unnamed User'}
                              </span>
                              {isSelf && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase">
                                  You
                                </span>
                              )}
                            </div>
                            <p className="text-slate-400 text-[11px] truncate font-mono">{user.email || 'No email'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Organization / Tenant */}
                      <td className="p-3.5">
                        {user.primaryTenant ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800 truncate">
                                {user.primaryTenant.displayName}
                              </span>
                            </div>
                            <span className="font-mono text-[10px] text-slate-400">
                              {user.primaryTenant.slug}
                              {user.tenantCount > 1 && ` (+${user.tenantCount - 1} more)`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Individual</span>
                        )}
                      </td>

                      {/* Platform Role */}
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${
                          user.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                          user.role === 'ADMIN' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          user.role === 'AUDITOR' ? 'bg-cyan-100 text-cyan-800 border border-cyan-200' :
                          user.role === 'SUPPORT' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {user.role}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                          user.suspended
                            ? 'bg-red-100 text-red-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${user.suspended ? 'bg-red-500' : 'bg-emerald-500'}`} />
                          {user.suspended ? 'Suspended' : 'Active'}
                        </span>
                      </td>

                      {/* Plan & Currency */}
                      <td className="p-3.5">
                        <div>
                          <span className={`font-bold ${user.membership === 'Premium' ? 'text-indigo-600' : 'text-slate-700'}`}>
                            {user.membership}
                          </span>
                          <span className="text-slate-400 ml-1 text-[10px] font-mono">
                            • {user.preferredCurrency || 'INR'}
                          </span>
                        </div>
                      </td>

                      {/* Created At */}
                      <td className="p-3.5 text-slate-500 text-[11px]">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                      </td>

                      {/* Actions Menu */}
                      <td className="p-3.5 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={() => setActionMenuUid(actionMenuUid === user.id ? null : user.id)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
                            aria-label="User actions"
                          >
                            <FiMoreVertical className="h-4 w-4" />
                          </button>

                          {actionMenuUid === user.id && (
                            <div
                              className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 animate-fade-in text-left text-xs font-semibold"
                              role="menu"
                            >
                              <button
                                type="button"
                                onClick={() => { setInspectUid(user.id); setActionMenuUid(null); }}
                                className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 text-left"
                                role="menuitem"
                              >
                                <FiEdit2 className="text-indigo-600" /> Inspect User 360
                              </button>

                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleSuspension(user)}
                                  className={`w-full px-3 py-2 text-left flex items-center gap-2 ${
                                    user.suspended ? 'text-emerald-600 hover:bg-emerald-50' : 'text-red-600 hover:bg-red-50'
                                  }`}
                                  role="menuitem"
                                >
                                  {user.suspended ? <><FiUnlock /> Restore Access</> : <><FiLock /> Suspend Account</>}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleSendPasswordReset(user)}
                                disabled={busyUser === `${user.id}:reset`}
                                className="w-full px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 text-left"
                                role="menuitem"
                              >
                                <FiKey className="text-amber-600" /> Send Password Reset
                              </button>


                              {isSuperAdmin && !isSelf && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(user)}
                                  className="w-full px-3 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2 text-left border-t border-slate-100"
                                  role="menuitem"
                                >
                                  <FiTrash2 /> Delete User
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-Side Pagination Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-medium">
          <div className="flex items-center gap-2">
            <span>Showing {users.length} users on page {currentPageIndex + 1}</span>
            <span>•</span>
            <label className="flex items-center gap-1">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPageToken(undefined);
                  setTokenHistory([undefined]);
                  setCurrentPageIndex(0);
                }}
                className="px-2 py-1 bg-white border border-slate-200 rounded-lg font-bold"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={currentPageIndex <= 0 || loading}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-40 transition flex items-center gap-1 shadow-2xs"
            >
              <FiChevronLeft /> Previous
            </button>
            <span className="px-2 font-bold text-slate-900">{currentPageIndex + 1}</span>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={!nextPageToken || loading}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-40 transition flex items-center gap-1 shadow-2xs"
            >
              Next <FiChevronRight />
            </button>
          </div>
        </div>
      </div>

      {/* User 360 Drawer */}
      {inspectUid && (
        <User360Drawer
          uid={inspectUid}
          onClose={() => setInspectUid(null)}
          onUserMutated={loadUsers}
          isSuperAdmin={isSuperAdmin}
          currentAdminUid={currentUser?.uid}
          availableTenants={availableTenants}
        />
      )}

      {/* Provision User Modal */}
      {showCreateModal && (
        <CreateUserModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onUserCreated={() => {
            loadUsers();
            setSuccess('New user account provisioned successfully.');
          }}
          availableTenants={availableTenants}
        />
      )}

      {/* Password Reset Link Modal */}
      {resetLinkData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-lg shrink-0">
                <FiKey />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Password Reset Link Generated</h3>
                <p className="text-xs text-slate-500 font-mono">{resetLinkData.email}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              The user can use this secure, one-time link to set a new password. You can copy and share it directly:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={resetLinkData.resetLink}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono select-all text-slate-800"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(resetLinkData.resetLink);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 3000);
                }}
                className={`px-3 py-2 rounded-lg font-bold text-xs shrink-0 flex items-center gap-1 transition ${
                  copiedLink ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {copiedLink ? <><FiCheck /> Copied</> : <><FiCopy /> Copy</>}
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setResetLinkData(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal (role="alertdialog") */}
      {confirmationDialog}
    </div>
  );
}

