import React, { useState, useEffect, useCallback } from 'react';
import {
  FiX, FiUser, FiMail, FiShield, FiBriefcase, FiCreditCard,
  FiCpu, FiActivity, FiCheck, FiAlertTriangle, FiRefreshCw,
  FiLock, FiUnlock, FiPlus, FiTrash2, FiClock, FiDollarSign,
  FiCalendar, FiExternalLink, FiKey
} from 'react-icons/fi';
import {
  getUser360, assignUserTenant, removeUserTenant,
  updateUserAiEntitlement, removeUserAiEntitlement, resetUserAiQuota
} from '../../../services/platformApi';
import { setUserAdminStatus, updateUserSubscription, toggleUserSuspension } from '../../../firestore/dbOperations';
import useConfirmDialog from '../../../hooks/useConfirmDialog';

export default function User360Drawer({
  uid,
  onClose,
  onUserMutated,
  isSuperAdmin,
  currentAdminUid,
  availableTenants = []
}) {
  const { confirm, confirmationDialog } = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userData, setUserData] = useState(null);
  const [activeTab, setActiveTab] = useState('identity');
  const [busyAction, setBusyAction] = useState('');

  // Edit sub-states
  const [selectedRole, setSelectedRole] = useState('USER');
  const [selectedPlan, setSelectedPlan] = useState('Basic');
  const [planDuration, setPlanDuration] = useState(12);
  const [aiCustomLimit, setAiCustomLimit] = useState(100);
  const [aiOverrideReason, setAiOverrideReason] = useState('');
  const [aiOverrideExpires, setAiOverrideExpires] = useState('');
  const [showAiOverrideForm, setShowAiOverrideForm] = useState(false);
  const [showAddTenantModal, setShowAddTenantModal] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [selectedTenantRole, setSelectedTenantRole] = useState('ENTERPRISE_MEMBER');

  const loadData = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError('');
    try {
      const res = await getUser360(uid);
      if (res.success && res.user360) {
        setUserData(res.user360);
        setSelectedRole(res.user360.identity.role || 'USER');
        setSelectedPlan(res.user360.billing.membership || 'Basic');
        if (res.user360.aiEntitlement?.customOverride) {
          setAiCustomLimit(res.user360.aiEntitlement.customOverride.dailyLimit || 100);
          setAiOverrideReason(res.user360.aiEntitlement.customOverride.reason || '');
          setAiOverrideExpires(res.user360.aiEntitlement.customOverride.expiresAt ? res.user360.aiEntitlement.customOverride.expiresAt.slice(0, 10) : '');
        }
      }
    } catch (err) {
      setError(err.message || 'Unable to load User 360 profile.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleRoleChange = async () => {
    if (uid === currentAdminUid && selectedRole !== 'ADMIN' && selectedRole !== 'SUPER_ADMIN') {
      setError('Self-demotion is strictly prohibited.');
      return;
    }
    setBusyAction('role');
    setError('');
    setSuccess('');
    try {
      await setUserAdminStatus(uid, selectedRole, { expectedRole: userData?.identity?.role });
      setSuccess(`User role updated to ${selectedRole}.`);
      await loadData();
      if (onUserMutated) onUserMutated();
    } catch (err) {
      setError(err.message || 'Role change failed.');
    } finally {
      setBusyAction('');
    }
  };

  const handlePlanChange = async () => {
    setBusyAction('plan');
    setError('');
    setSuccess('');
    try {
      await updateUserSubscription(uid, selectedPlan, planDuration, { expectedMembership: userData?.billing?.membership });
      setSuccess(`Membership updated to ${selectedPlan} (${planDuration} months).`);
      await loadData();
      if (onUserMutated) onUserMutated();
    } catch (err) {
      setError(err.message || 'Plan update failed.');
    } finally {
      setBusyAction('');
    }
  };

  const handleSuspensionToggle = async () => {
    if (uid === currentAdminUid) {
      setError('Self-suspension is prohibited.');
      return;
    }
    const willSuspend = !userData?.identity?.suspended;
    setBusyAction('suspend');
    setError('');
    setSuccess('');
    try {
      await toggleUserSuspension(uid, willSuspend, { expectedSuspended: Boolean(userData?.identity?.suspended) });
      setSuccess(willSuspend ? 'User account suspended.' : 'User account restored.');
      await loadData();
      if (onUserMutated) onUserMutated();
    } catch (err) {
      setError(err.message || 'Suspension toggle failed.');
    } finally {
      setBusyAction('');
    }
  };

  const handleAddTenant = async (e) => {
    e.preventDefault();
    if (!selectedTenantId) return;
    setBusyAction('add-tenant');
    setError('');
    setSuccess('');
    try {
      await assignUserTenant(uid, {
        tenantId: selectedTenantId,
        role: selectedTenantRole,
        isPrimary: userData?.tenancy?.memberships?.length === 0
      });
      setSuccess('User successfully assigned to organization.');
      setShowAddTenantModal(false);
      await loadData();
      if (onUserMutated) onUserMutated();
    } catch (err) {
      setError(err.message || 'Failed to assign tenant.');
    } finally {
      setBusyAction('');
    }
  };

  const handleRemoveTenant = async (tenantId, tenantName) => {
    const ok = await confirm({
      title: `Remove from ${tenantName}`,
      message: `Are you sure you want to remove this user from ${tenantName}?`,
      confirmText: 'Remove Member',
      danger: true,
    });
    if (!ok) return;
    setBusyAction(`rem-tenant-${tenantId}`);
    setError('');
    setSuccess('');
    try {
      await removeUserTenant(uid, tenantId);
      setSuccess(`Removed from ${tenantName}.`);
      await loadData();
      if (onUserMutated) onUserMutated();
    } catch (err) {
      setError(err.message || 'Failed to remove tenant.');
    } finally {
      setBusyAction('');
    }
  };

  const handleSaveAiOverride = async (e) => {
    e.preventDefault();
    setBusyAction('ai-override');
    setError('');
    setSuccess('');
    try {
      await updateUserAiEntitlement(uid, {
        dailyLimit: aiCustomLimit,
        expiresAt: aiOverrideExpires ? new Date(aiOverrideExpires).toISOString() : null,
        reason: aiOverrideReason || 'Admin quota allocation'
      });
      setSuccess('AI quota override saved successfully.');
      setShowAiOverrideForm(false);
      await loadData();
      if (onUserMutated) onUserMutated();
    } catch (err) {
      setError(err.message || 'Failed to save AI override.');
    } finally {
      setBusyAction('');
    }
  };

  const handleRemoveAiOverride = async () => {
    setBusyAction('ai-override-rem');
    setError('');
    setSuccess('');
    try {
      await removeUserAiEntitlement(uid);
      setSuccess('AI custom quota override removed; standard tier restored.');
      await loadData();
      if (onUserMutated) onUserMutated();
    } catch (err) {
      setError(err.message || 'Failed to remove AI override.');
    } finally {
      setBusyAction('');
    }
  };

  const handleResetAiQuota = async () => {
    setBusyAction('ai-reset');
    setError('');
    setSuccess('');
    try {
      await resetUserAiQuota(uid);
      setSuccess("Today's AI request counter reset to 0.");
      await loadData();
      if (onUserMutated) onUserMutated();
    } catch (err) {
      setError(err.message || 'AI quota reset failed.');
    } finally {
      setBusyAction('');
    }
  };

  const u = userData?.identity;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs transition-opacity animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-360-title"
    >
      <div
        className="w-full max-w-2xl bg-white shadow-2xl h-full flex flex-col overflow-hidden border-l border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-5 bg-slate-900 text-white flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center font-black text-xl text-white shadow-md">
              {u?.displayName ? u.displayName.charAt(0).toUpperCase() : <FiUser />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="user-360-title" className="text-lg font-black tracking-tight text-white">
                  {u?.displayName || 'User Profile'}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  u?.suspended ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}>
                  {u?.suspended ? 'Suspended' : 'Active'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {u?.role || 'USER'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                <span>{u?.email || 'No email'}</span>
                <span>•</span>
                <span className="text-[11px] opacity-75">{uid}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 px-4 shrink-0 overflow-x-auto text-xs">
          {[
            { id: 'identity', label: 'Identity & Security', icon: <FiShield /> },
            { id: 'tenancy', label: `Tenants (${userData?.tenancy?.totalTenants || 0})`, icon: <FiBriefcase /> },
            { id: 'rbac', label: 'Roles & Access', icon: <FiKey /> },
            { id: 'billing', label: 'Subscription & Billing', icon: <FiCreditCard /> },
            { id: 'ai', label: 'AI Entitlements', icon: <FiCpu /> },
            { id: 'audit', label: 'Audit Timeline', icon: <FiActivity /> },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-3 font-bold border-b-2 whitespace-nowrap transition ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Alert Notifications */}
        {error && (
          <div className="m-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between" role="alert">
            <div className="flex items-center gap-2 font-medium">
              <FiAlertTriangle className="text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError('')} className="text-red-500 hover:text-red-700 font-bold ml-2">Dismiss</button>
          </div>
        )}
        {success && (
          <div className="m-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between" role="status">
            <div className="flex items-center gap-2 font-medium">
              <FiCheck className="text-emerald-600 shrink-0" />
              <span>{success}</span>
            </div>
            <button type="button" onClick={() => setSuccess('')} className="text-emerald-500 hover:text-emerald-700 font-bold ml-2">Dismiss</button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 text-slate-700 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <FiRefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
              <p className="text-xs font-bold uppercase tracking-wider">Loading complete User 360 profile…</p>
            </div>
          ) : !userData ? (
            <div className="text-center py-20 text-slate-400 text-sm">User details unavailable.</div>
          ) : (
            <>
              {/* TAB 1: IDENTITY & SECURITY */}
              {activeTab === 'identity' && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="text-[10px] font-extrabold uppercase text-slate-400">Account UID</p>
                      <p className="font-mono text-xs text-slate-900 font-bold mt-1 select-all">{u?.id}</p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="text-[10px] font-extrabold uppercase text-slate-400">Email Verification</p>
                      <p className="mt-1 font-bold">
                        {userData.security?.emailVerified ? (
                          <span className="text-emerald-600 font-bold flex items-center gap-1"><FiCheck /> Verified</span>
                        ) : (
                          <span className="text-amber-600 font-bold flex items-center gap-1"><FiAlertTriangle /> Pending Verification</span>
                        )}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="text-[10px] font-extrabold uppercase text-slate-400">Two-Factor Auth (MFA)</p>
                      <p className="mt-1 font-bold">
                        {userData.security?.mfaEnabled ? (
                          <span className="text-emerald-600 font-bold flex items-center gap-1"><FiLock /> TOTP Enrolled &amp; Active</span>
                        ) : (
                          <span className="text-slate-400">Not Enrolled</span>
                        )}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <p className="text-[10px] font-extrabold uppercase text-slate-400">Preferred Currency</p>
                      <p className="mt-1 font-bold text-slate-900">{userData.billing?.preferredCurrency || 'INR'} (₹)</p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <FiClock className="text-indigo-600" /> Account Timeline &amp; Activity
                    </h3>
                    <dl className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                      <div><dt className="text-slate-400">Registered Date:</dt><dd className="font-semibold text-slate-800">{u?.createdAt ? new Date(u.createdAt).toLocaleString() : 'Unknown'}</dd></div>
                      <div><dt className="text-slate-400">Last Sign In:</dt><dd className="font-semibold text-slate-800">{u?.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</dd></div>
                      <div><dt className="text-slate-400">Resumes Created:</dt><dd className="font-semibold text-slate-800">{userData.content?.resumeCount || 0}</dd></div>
                      <div><dt className="text-slate-400">Token Refresh Epoch:</dt><dd className="font-semibold text-slate-800">{u?.updatedAt ? new Date(u.updatedAt).toLocaleString() : 'Initial'}</dd></div>
                    </dl>
                  </div>

                  {/* Suspension Lifecycle Action */}
                  <div className={`p-4 rounded-xl border ${u?.suspended ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'} flex items-center justify-between`}>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Account Status &amp; Access</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {u?.suspended ? 'This user is currently suspended and blocked from signing in.' : 'Account is in good standing with active platform access.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSuspensionToggle}
                      disabled={busyAction === 'suspend'}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition ${
                        u?.suspended
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-red-600 text-white hover:bg-red-700'
                      }`}
                    >
                      {u?.suspended ? <><FiUnlock /> Restore Access</> : <><FiLock /> Suspend Account</>}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: TENANT MEMBERSHIPS */}
              {activeTab === 'tenancy' && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900">Organization Memberships</h3>
                      <p className="text-[11px] text-slate-500">Enterprise tenants and workspaces this user belongs to.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddTenantModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 flex items-center gap-1"
                    >
                      <FiPlus /> Assign to Tenant
                    </button>
                  </div>

                  {userData.tenancy?.memberships?.length === 0 ? (
                    <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center text-slate-400">
                      <FiBriefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="font-semibold">User is not assigned to any enterprise organization.</p>
                      <p className="text-[11px] mt-1">Assigning a user gives them access to organization workspaces and pooled AI quotas.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {userData.tenancy.memberships.map((tenant) => (
                        <div
                          key={tenant.tenantId || tenant.id}
                          className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{tenant.displayName}</span>
                              <span className="font-mono text-[10px] text-slate-500">({tenant.slug})</span>
                              {tenant.isPrimary && (
                                <span className="px-1.5 py-0.5 rounded-sm bg-indigo-100 text-indigo-700 font-extrabold text-[9px] uppercase">
                                  Primary Org
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">
                              Role: <strong className="text-slate-700">{Array.isArray(tenant.roles) ? tenant.roles.join(', ') : (tenant.role || 'MEMBER')}</strong> • Status: <strong className="text-emerald-700">{tenant.status || 'ACTIVE'}</strong>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveTenant(tenant.tenantId || tenant.id, tenant.displayName)}
                            disabled={busyAction === `rem-tenant-${tenant.tenantId || tenant.id}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                            title="Remove from organization"
                          >
                            <FiTrash2 />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Tenant Modal */}
                  {showAddTenantModal && (
                    <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-3">
                      <h4 className="font-bold text-indigo-900 flex items-center gap-1.5">
                        <FiPlus /> Assign User to Enterprise Organization
                      </h4>
                      <form onSubmit={handleAddTenant} className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Select Organization</label>
                          <select
                            required
                            value={selectedTenantId}
                            onChange={(e) => setSelectedTenantId(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold"
                          >
                            <option value="">-- Choose Tenant --</option>
                            {availableTenants.map(t => (
                              <option key={t.id} value={t.id}>{t.displayName} ({t.slug})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Assigned Tenant Role</label>
                          <select
                            value={selectedTenantRole}
                            onChange={(e) => setSelectedTenantRole(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold"
                          >
                            <option value="ENTERPRISE_MEMBER">ENTERPRISE_MEMBER (Standard Member)</option>
                            <option value="ENTERPRISE_ADMIN">ENTERPRISE_ADMIN (Tenant Administrator)</option>
                          </select>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setShowAddTenantModal(false)}
                            className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={busyAction === 'add-tenant'}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700"
                          >
                            {busyAction === 'add-tenant' ? 'Assigning…' : 'Confirm Assignment'}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: ROLES & ACCESS (RBAC) */}
              {activeTab === 'rbac' && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <h3 className="font-bold text-slate-900 text-xs">Platform Role Assignment</h3>
                    <p className="text-[11px] text-slate-500">
                      Platform roles determine global administrative capabilities. Changes take effect on next token refresh.
                    </p>
                    <div className="flex items-center gap-3">
                      <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-800"
                      >
                        <option value="USER">USER (Regular Career Builder)</option>
                        <option value="EMPLOYER">EMPLOYER (Job Recruiter)</option>
                        <option value="SUPPORT">SUPPORT (User Support Desk)</option>
                        <option value="AUDITOR">AUDITOR (Compliance &amp; Security Auditor)</option>
                        <option value="ADMIN">ADMIN (Platform Administrator)</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleRoleChange}
                        disabled={busyAction === 'role' || selectedRole === userData?.identity?.role}
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50 transition"
                      >
                        {busyAction === 'role' ? 'Saving…' : 'Save Role'}
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <h4 className="font-bold text-slate-900 text-xs">Effective Granted Permissions</h4>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(selectedRole === 'SUPER_ADMIN' ? ['* (All Platform Resources)'] :
                        selectedRole === 'ADMIN' ? ['users.read', 'users.update', 'users.create', 'users.delete', 'tenants.manage', 'system.config.write', 'payments.manage', 'ai.entitlements.manage'] :
                        selectedRole === 'AUDITOR' ? ['users.read', 'tenants.read', 'ai.usage.read', 'audit.read', 'security.read'] :
                        selectedRole === 'SUPPORT' ? ['users.read', 'email.logs.read', 'tickets.manage'] :
                        ['resumes.manage', 'interviews.execute', 'subscription.self']).map(p => (
                        <span key={p} className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 text-[10px] font-mono font-semibold">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: SUBSCRIPTION & BILLING */}
              {activeTab === 'billing' && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <h3 className="font-bold text-slate-900 text-xs">Subscription Management</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">Plan Tier</label>
                        <select
                          value={selectedPlan}
                          onChange={(e) => setSelectedPlan(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold"
                        >
                          <option value="Basic">Basic (Free Tier)</option>
                          <option value="Premium">Premium (Pro Tier)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">Grant Duration (Months)</label>
                        <select
                          value={planDuration}
                          onChange={(e) => setPlanDuration(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold"
                        >
                          <option value={1}>1 Month</option>
                          <option value={3}>3 Months</option>
                          <option value={6}>6 Months</option>
                          <option value={12}>12 Months (1 Year)</option>
                          <option value={24}>24 Months (2 Years)</option>
                          {isSuperAdmin && <option value={60}>60 Months (5 Years)</option>}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <p className="text-[11px] text-slate-500">
                        Expires: <strong className="text-slate-800">{u?.membershipEnds ? new Date(u.membershipEnds).toLocaleDateString() : 'N/A'}</strong>
                      </p>
                      <button
                        type="button"
                        onClick={handlePlanChange}
                        disabled={busyAction === 'plan'}
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {busyAction === 'plan' ? 'Updating…' : 'Apply Plan Change'}
                      </button>
                    </div>
                  </div>

                  {/* Order History */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <h4 className="font-bold text-slate-900 text-xs">Payment &amp; Transaction History</h4>
                    {userData.billing?.orders?.length === 0 ? (
                      <p className="text-slate-400 text-[11px] py-2">No transaction records found for this account.</p>
                    ) : (
                      <div className="space-y-1.5 pt-1 max-h-40 overflow-y-auto">
                        {userData.billing.orders.map((o) => (
                          <div key={o.id} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg text-[11px]">
                            <div>
                              <span className="font-bold text-slate-800">{o.planId}</span>
                              <span className="text-slate-400 ml-2">{o.provider}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono font-bold text-slate-900">{o.currency} {o.amount ? (o.amount / 100).toFixed(2) : '0.00'}</span>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">{o.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: AI ENTITLEMENTS */}
              {activeTab === 'ai' && (
                <div className="space-y-4 text-xs">
                  {/* Today's Consumption Meter */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-slate-900 text-xs">AI Daily Quota &amp; Usage</h3>
                        <p className="text-[11px] text-slate-500">Tracked atomic daily limit for generative AI tools.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetAiQuota}
                        disabled={busyAction === 'ai-reset'}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 text-[11px] flex items-center gap-1 shadow-2xs"
                      >
                        <FiRefreshCw className={busyAction === 'ai-reset' ? 'animate-spin' : ''} /> Reset Today's Quota
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center pt-1">
                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl">
                        <p className="text-[10px] font-extrabold uppercase text-slate-400">Used Today</p>
                        <p className="text-lg font-black text-slate-900 mt-0.5">{userData.aiEntitlement?.usedToday || 0}</p>
                      </div>
                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl">
                        <p className="text-[10px] font-extrabold uppercase text-slate-400">Daily Limit</p>
                        <p className="text-lg font-black text-indigo-600 mt-0.5">{userData.aiEntitlement?.effectiveLimit || 10}</p>
                      </div>
                      <div className="p-2.5 bg-white border border-slate-200 rounded-xl">
                        <p className="text-[10px] font-extrabold uppercase text-slate-400">Remaining</p>
                        <p className={`text-lg font-black mt-0.5 ${(userData.aiEntitlement?.remainingToday || 0) <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {userData.aiEntitlement?.remainingToday || 0}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Custom Quota Override */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs">Custom Quota Allocation</h4>
                        <p className="text-[11px] text-slate-500">Grant power users or trial clients elevated AI limits.</p>
                      </div>
                      {userData.aiEntitlement?.customOverride ? (
                        <button
                          type="button"
                          onClick={handleRemoveAiOverride}
                          disabled={busyAction === 'ai-override-rem'}
                          className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 font-bold hover:bg-red-100 text-[11px]"
                        >
                          Remove Custom Allocation
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowAiOverrideForm(!showAiOverrideForm)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 text-[11px]"
                        >
                          + Set Custom Allocation
                        </button>
                      )}
                    </div>

                    {userData.aiEntitlement?.customOverride && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-900 space-y-1">
                        <p><strong>Active Custom Limit:</strong> {userData.aiEntitlement.customOverride.dailyLimit} requests/day</p>
                        <p><strong>Reason:</strong> {userData.aiEntitlement.customOverride.reason || 'None specified'}</p>
                        <p><strong>Expires:</strong> {userData.aiEntitlement.customOverride.expiresAt ? new Date(userData.aiEntitlement.customOverride.expiresAt).toLocaleDateString() : 'Never (Permanent)'}</p>
                      </div>
                    )}

                    {showAiOverrideForm && (
                      <form onSubmit={handleSaveAiOverride} className="p-3 bg-white border border-slate-200 rounded-lg space-y-3 pt-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 mb-1">Daily Requests Limit</label>
                            <input
                              type="number"
                              required
                              min="1"
                              max="100000"
                              value={aiCustomLimit}
                              onChange={(e) => setAiCustomLimit(Number(e.target.value))}
                              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 mb-1">Expiration Date (Optional)</label>
                            <input
                              type="date"
                              value={aiOverrideExpires}
                              onChange={(e) => setAiOverrideExpires(e.target.value)}
                              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xs"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 mb-1">Allocation Reason</label>
                          <input
                            type="text"
                            placeholder="e.g. VIP client pilot grant"
                            value={aiOverrideReason}
                            onChange={(e) => setAiOverrideReason(e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowAiOverrideForm(false)}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={busyAction === 'ai-override'}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700"
                          >
                            {busyAction === 'ai-override' ? 'Saving…' : 'Save Allocation'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 6: AUDIT TIMELINE */}
              {activeTab === 'audit' && (
                <div className="space-y-3 text-xs">
                  <h3 className="font-bold text-slate-900 text-xs">Administrative Audit Stream</h3>
                  <p className="text-[11px] text-slate-500">Chronological history of administrative actions on this account.</p>

                  {userData.auditTimeline?.length === 0 ? (
                    <p className="text-slate-400 text-[11px] py-4 text-center">No administrative changes recorded for this account.</p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto pt-1">
                      {userData.auditTimeline.map((ev) => (
                        <div key={ev.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 font-mono text-[11px]">{ev.action}</span>
                            <span className="text-[10px] text-slate-400">{ev.createdAt ? new Date(ev.createdAt).toLocaleString() : 'Unknown'}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 font-mono">Actor: {ev.actorUid}</p>
                          {ev.changes && (
                            <div className="p-2 bg-white rounded border border-slate-100 font-mono text-[10px] text-slate-700 overflow-x-auto">
                              {JSON.stringify(ev.changes, null, 2)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {confirmationDialog}
    </div>
  );
}
