import React, { useState, useEffect, useCallback } from 'react';
import { FiX, FiUser, FiMail, FiShield, FiBriefcase, FiCreditCard, FiCpu, FiActivity, FiCheck, FiAlertTriangle, FiRefreshCw, FiLock, FiUnlock, FiPlus, FiTrash2, FiClock, FiDollarSign, FiCalendar, FiExternalLink, FiKey, FiCopy, FiDownload, FiShieldOff } from 'react-icons/fi';
import { getUser360, assignUserTenant, removeUserTenant, updateUserAiEntitlement, removeUserAiEntitlement, resetUserAiQuota, sendUserPasswordReset, verifyUserEmail, revokeUserSessions, unenrollUserMfa, exportUserData, getTenantDetail } from '../../../services/platformApi';

import { setUserRole, updateUserSubscription, toggleUserSuspension } from '../../../services/api/platform';
import useConfirmDialog from '../../../hooks/useConfirmDialog';

// GAP-22 UX contract: translate backend tenant-assignment failures into an
// actionable admin-facing explanation instead of a generic "Bad Request".
function describeTenantAssignmentError(err) {
  const code = err?.code || err?.body?.code || '';
  switch (code) {
    case 'TENANT_NO_USABLE_WORKSPACE':
      return 'This organization has no active workspace, so members cannot be assigned yet. Create or reactivate a workspace for the organization in the Tenants Registry, then retry the assignment.';
    case 'TENANT_INACTIVE':
      return 'This organization is suspended or decommissioned. Reactivate it from the Tenants Registry before assigning members.';
    case 'TENANT_NOT_FOUND':
      return 'The selected organization no longer exists. Refresh the list and choose a valid organization.';
    case 'WORKSPACE_NOT_FOUND':
      return 'The workspace selected for this assignment does not exist or does not belong to the organization. Refresh and retry.';
    case 'WORKSPACE_INACTIVE':
      return 'The workspace selected for this assignment is not active. Reactivate the workspace or choose another one.';
    case 'INVALID_WORKSPACE_ID':
      return 'The workspace reference is malformed. Refresh the drawer and retry the assignment.';
    case 'INVALID_TENANT_ROLE':
      return 'The selected tenant role is not valid for this organization.';
    case 'FORBIDDEN':
      return 'You do not have permission to assign users to organizations. This action requires an administrator with system configuration rights.';
    case 'TENANT_SERVICE_UNAVAILABLE':
      return 'The tenant registry is temporarily unavailable. Retry in a few moments.';
    default:
      return err?.message || 'Failed to assign tenant.';
  }
}

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
  const [resetLinkData, setResetLinkData] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);



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
  // Workspace preview for tenant assignment (GAP-22): shows which canonical
  // workspace the membership will bind before the admin submits. The backend
  // remains authoritative; a preview failure never blocks assignment.
  const [workspacePreview, setWorkspacePreview] = useState({ status: 'idle', workspace: null, lifecycleState: null });

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

  // Preview the canonical workspace a tenant assignment will bind (GAP-22).
  // Canonical semantics mirror the backend resolver: the ACTIVE default
  // workspace wins; otherwise the first ACTIVE workspace is informational,
  // and a tenant with zero ACTIVE workspaces must be flagged before submit.
  useEffect(() => {
    if (!showAddTenantModal || !selectedTenantId) {
      setWorkspacePreview({ status: 'idle', workspace: null, lifecycleState: null });
      return undefined;
    }
    let cancelled = false;
    setWorkspacePreview({ status: 'loading', workspace: null, lifecycleState: null });
    getTenantDetail(selectedTenantId)
      .then((detail) => {
        if (cancelled) return;
        const items = Array.isArray(detail?.workspaces?.items) ? detail.workspaces.items : [];
        const active = items.filter(w => String(w?.lifecycleState || 'ACTIVE').toUpperCase() === 'ACTIVE');
        const workspace = active.find(w => w?.isDefault === true) || active[0] || null;
        setWorkspacePreview({
          status: 'ready',
          workspace,
          lifecycleState: detail?.tenant?.lifecycleState || null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Preview is advisory only; the backend resolver is authoritative.
        setWorkspacePreview({ status: 'unavailable', workspace: null, lifecycleState: null });
      });
    return () => { cancelled = true; };
  }, [showAddTenantModal, selectedTenantId]);

  const handleRoleChange = async () => {
    if (uid === currentAdminUid && selectedRole !== 'ADMIN' && selectedRole !== 'SUPER_ADMIN') {
      setError('Self-demotion is strictly prohibited.');
      return;
    }
    setBusyAction('role');
    setError('');
    setSuccess('');
    try {
      await setUserRole(uid, selectedRole, userData?.identity?.role);
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
      const res = await assignUserTenant(uid, {
        tenantId: selectedTenantId,
        role: selectedTenantRole,
        isPrimary: userData?.tenancy?.memberships?.length === 0
      });
      // Surface the exact backend outcome: which workspace was bound and
      // whether the membership already existed (GAP-22 UX contract).
      const tenantLabel = availableTenants.find(t => t.id === selectedTenantId)?.displayName || 'the organization';
      const workspaceLabel = res?.workspace?.name ? ` Workspace: ${res.workspace.name}${res.workspace.isDefault ? ' (default)' : ''}.` : '';
      setSuccess(res?.alreadyMember
        ? `User is already a member of ${tenantLabel}; the existing membership was updated.${workspaceLabel}`
        : (res?.message || `User successfully assigned to ${tenantLabel}.${workspaceLabel}`));
      setShowAddTenantModal(false);
      setSelectedTenantId('');
      await loadData();
      if (onUserMutated) onUserMutated();
    } catch (err) {
      setError(describeTenantAssignmentError(err));
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

  const handleSendPasswordReset = async () => {
    if (!u?.email) return;
    const confirmed = await confirm({
      title: 'Send Password Reset Link',
      message: `Generate and dispatch a secure password reset link for ${u.displayName || u.email}?`,
      confirmText: 'Send Reset Link',
      danger: false,
    });
    if (!confirmed) return;

    setBusyAction('reset-password');
    setError('');
    setSuccess('');
    try {
      const res = await sendUserPasswordReset(u.id);
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
      setBusyAction('');
    }
  };

  const handleToggleEmailVerify = async (verified) => {
    const verb = verified ? 'Verify' : 'Unverify';
    const confirmed = await confirm({
      title: `${verb} Email Address`,
      message: `Are you sure you want to mark the email address for ${u?.displayName || u?.email} as ${verified ? 'Verified' : 'Unverified'}?`,
      confirmText: verb,
      danger: !verified,
    });
    if (!confirmed) return;

    setBusyAction('verify-email');
    setError('');
    setSuccess('');
    try {
      const res = await verifyUserEmail(u.id, verified);
      if (res.success) {
        setSuccess(res.message || `Email verification updated to ${verified ? 'Verified' : 'Unverified'}.`);
        await loadData();
        if (onUserMutated) onUserMutated();
      } else {
        setError(res.error || 'Failed to update email verification.');
      }
    } catch (err) {
      setError(err.message || 'Error communicating with server.');
    } finally {
      setBusyAction('');
    }
  };

  const handleRevokeSessions = async () => {
    const confirmed = await confirm({
      title: 'Revoke All Active Sessions',
      message: `Immediately terminate all active login sessions and revoke refresh tokens for ${u?.displayName || u?.email}? The user will be required to authenticate again on all devices.`,
      confirmText: 'Revoke Sessions',
      danger: true,
    });
    if (!confirmed) return;

    setBusyAction('revoke-sessions');
    setError('');
    setSuccess('');
    try {
      const res = await revokeUserSessions(u.id);
      if (res.success) {
        setSuccess('All active sessions and refresh tokens have been revoked.');
        await loadData();
      } else {
        setError(res.error || 'Failed to revoke sessions.');
      }
    } catch (err) {
      setError(err.message || 'Error communicating with server.');
    } finally {
      setBusyAction('');
    }
  };

  const handleResetMfa = async () => {
    const confirmed = await confirm({
      title: 'Reset Two-Factor Authentication (2FA)',
      message: `Are you sure you want to unenroll and reset 2FA / TOTP for ${u?.displayName || u?.email}? Use this when a user has lost access to their authenticator app.`,
      confirmText: 'Reset 2FA',
      danger: true,
    });
    if (!confirmed) return;

    setBusyAction('reset-mfa');
    setError('');
    setSuccess('');
    try {
      const res = await unenrollUserMfa(u.id);
      if (res.success) {
        setSuccess('Two-Factor Authentication enrolled factors have been reset.');
        await loadData();
        if (onUserMutated) onUserMutated();
      } else {
        setError(res.error || 'Failed to reset MFA.');
      }
    } catch (err) {
      setError(err.message || 'Error communicating with server.');
    } finally {
      setBusyAction('');
    }
  };

  const handleExportUserData = async () => {
    setBusyAction('export');
    setError('');
    try {
      const res = await exportUserData(u.id);
      if (res.success && res.export) {
        const jsonStr = JSON.stringify(res.export, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user-export-${u.id}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSuccess('User data export downloaded successfully.');
      } else {
        setError(res.error || 'Failed to export user data.');
      }
    } catch (err) {
      setError(err.message || 'Error downloading export.');
    } finally {
      setBusyAction('');
    }
  };

  const u = userData?.identity;



  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-sm transition-all animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-360-title"
    >
      <div
        className="w-full max-w-5xl bg-white shadow-2xl rounded-3xl overflow-hidden border border-slate-200/80 flex flex-col h-[90vh] max-h-[860px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Workspace Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white flex items-center justify-between shrink-0 border-b border-indigo-900/30">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center font-black text-2xl text-white shadow-lg ring-2 ring-indigo-400/30 shrink-0">
              {u?.displayName ? u.displayName.charAt(0).toUpperCase() : <FiUser />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="user-360-title" className="text-lg sm:text-xl font-black tracking-tight text-white">
                  {u?.displayName || 'User Profile'}
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  u?.suspended ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}>
                  {u?.suspended ? '● Suspended' : '● Active'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {u?.role || 'USER'}
                </span>
                {u?.subscriptionPlan && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {u.subscriptionPlan} Tier
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-300 font-mono mt-1 flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{u?.email || 'No email associated'}</span>
                <span className="text-slate-500">•</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(uid);
                    setCopiedUid(true);
                    setTimeout(() => setCopiedUid(false), 2000);
                  }}
                  className="px-2 py-0.5 bg-slate-800/80 hover:bg-slate-700 rounded-md border border-slate-700 text-[11px] text-slate-300 flex items-center gap-1.5 transition font-mono"
                  title="Click to copy UID"
                >
                  <span>{uid}</span>
                  {copiedUid ? <FiCheck className="text-emerald-400" /> : <FiCopy className="text-slate-400" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close workspace"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
            >
              <FiX className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Workspace Body: Split-Panel Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Rail Navigation Sidebar */}
          <div className="w-64 shrink-0 bg-slate-50/90 border-r border-slate-200/80 p-3 space-y-1.5 overflow-y-auto flex flex-col justify-between">
            <div className="space-y-1">
              <p className="px-3 pt-2 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">User 360 Workspace</p>
              {[
                { id: 'identity', label: 'Identity & Security', desc: 'Auth, status, 2FA & reset', icon: <FiShield /> },
                { id: 'tenancy', label: 'Tenants & Orgs', count: userData?.tenancy?.totalTenants || 0, desc: 'Enterprise workspaces', icon: <FiBriefcase /> },
                { id: 'rbac', label: 'Roles & Access', desc: 'Platform permissions', icon: <FiKey /> },
                { id: 'billing', label: 'Subscription & Billing', desc: 'Plan tier & invoices', icon: <FiCreditCard /> },
                { id: 'ai', label: 'AI Entitlements', desc: 'Usage & custom quota', icon: <FiCpu /> },
                { id: 'audit', label: 'Audit Timeline', desc: 'Security activity logs', icon: <FiActivity /> },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-2xl transition flex items-start gap-3 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-white text-indigo-700 font-extrabold shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                  }`}
                >
                  <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                    activeTab === tab.id ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-200/70 text-slate-500'
                  }`}>
                    {tab.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold truncate">{tab.label}</p>
                      {tab.count !== undefined && (
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                          activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </div>
                    <p className={`text-[10px] mt-0.5 truncate ${activeTab === tab.id ? 'text-indigo-600/80' : 'text-slate-400'}`}>
                      {tab.desc}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Quick Actions Panel */}
            <div className="p-3 bg-white rounded-2xl border border-slate-200/80 space-y-2 mt-2">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Quick Actions</p>
              <button
                type="button"
                onClick={handleSuspensionToggle}
                disabled={busyAction === 'suspend'}
                className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-2xs ${
                  u?.suspended ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                }`}
              >
                {u?.suspended ? <><FiUnlock /> Restore</> : <><FiLock /> Suspend</>}
              </button>
              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={busyAction === 'reset-password' || !u?.email}
                className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 flex items-center justify-center gap-1.5 transition shadow-2xs disabled:opacity-50"
              >
                <FiKey /> Reset Password
              </button>
            </div>
          </div>

          {/* Right Workspace Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {/* Alert Notifications */}
            {error && (
              <div className="m-4 mb-0 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between" role="alert">
                <div className="flex items-center gap-2 font-medium">
                  <FiAlertTriangle className="text-red-600 shrink-0" />
                  <span>{error}</span>
                </div>
                <button type="button" onClick={() => setError('')} className="text-red-500 hover:text-red-700 font-bold ml-2">Dismiss</button>
              </div>
            )}
            {success && (
              <div className="m-4 mb-0 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between" role="status">
                <div className="flex items-center gap-2 font-medium">
                  <FiCheck className="text-emerald-600 shrink-0" />
                  <span>{success}</span>
                </div>
                <button type="button" onClick={() => setSuccess('')} className="text-emerald-500 hover:text-emerald-700 font-bold ml-2">Dismiss</button>
              </div>
            )}

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
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
                  {/* Status & Attributes Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-2xl transition shadow-2xs">
                      <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Account UID</p>
                      <p className="font-mono text-xs text-slate-900 font-bold mt-1 select-all truncate" title={u?.id}>{u?.id}</p>
                    </div>

                    <div className="p-3.5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-2xl transition shadow-2xs">
                      <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Email Verification</p>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        {userData.security?.emailVerified ? (
                          <span className="text-emerald-600 font-bold flex items-center gap-1"><FiCheck /> Verified</span>
                        ) : (
                          <span className="text-amber-600 font-bold flex items-center gap-1"><FiAlertTriangle /> Pending</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleEmailVerify(!userData.security?.emailVerified)}
                          disabled={busyAction === 'verify-email'}
                          className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] font-extrabold transition shadow-2xs"
                        >
                          {userData.security?.emailVerified ? 'Unverify' : 'Force Verify ✓'}
                        </button>
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-2xl transition shadow-2xs">
                      <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Two-Factor Auth (MFA)</p>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        {userData.security?.mfaEnabled ? (
                          <span className="text-emerald-600 font-bold flex items-center gap-1"><FiLock /> Active</span>
                        ) : (
                          <span className="text-slate-400 font-medium">Not Enrolled</span>
                        )}
                        {userData.security?.mfaEnabled && (
                          <button
                            type="button"
                            onClick={handleResetMfa}
                            disabled={busyAction === 'reset-mfa'}
                            className="px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-[10px] font-extrabold transition shadow-2xs"
                          >
                            Reset 2FA
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-2xl transition shadow-2xs">
                      <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Preferred Currency</p>
                      <p className="mt-1 font-bold text-slate-900">{userData.billing?.preferredCurrency || 'INR'} (₹)</p>
                    </div>
                  </div>

                  {/* Timeline & Activity Card */}
                  <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3 shadow-2xs">
                    <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs">
                        <FiClock />
                      </div>
                      Account Timeline &amp; Activity
                    </h3>
                    <dl className="grid grid-cols-2 gap-3 text-[11px] pt-1">
                      <div><dt className="text-slate-400 font-medium">Registered Date:</dt><dd className="font-semibold text-slate-800 mt-0.5">{u?.createdAt ? new Date(u.createdAt).toLocaleString() : 'Unknown'}</dd></div>
                      <div><dt className="text-slate-400 font-medium">Last Sign In:</dt><dd className="font-semibold text-slate-800 mt-0.5">{u?.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</dd></div>
                      <div><dt className="text-slate-400 font-medium">Resumes Created:</dt><dd className="font-semibold text-slate-800 mt-0.5">{userData.content?.resumeCount || 0}</dd></div>
                      <div><dt className="text-slate-400 font-medium">Token Refresh Epoch:</dt><dd className="font-semibold text-slate-800 mt-0.5">{u?.updatedAt ? new Date(u.updatedAt).toLocaleString() : 'Initial'}</dd></div>
                    </dl>
                  </div>

                  {/* Suspension Lifecycle Action */}
                  <div className={`p-4 rounded-2xl border ${u?.suspended ? 'bg-red-50/80 border-red-200' : 'bg-slate-50/80 border-slate-200/80'} flex items-center justify-between shadow-2xs`}>
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
                      className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-xs ${
                        u?.suspended
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-red-600 text-white hover:bg-red-700'
                      }`}
                    >
                      {u?.suspended ? <><FiUnlock /> Restore Access</> : <><FiLock /> Suspend Account</>}
                    </button>
                  </div>

                  {/* Administrative Password Reset Action */}
                  <div className="p-4 rounded-2xl border bg-slate-50/80 border-slate-200/80 flex items-center justify-between shadow-2xs">
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-xs">
                          <FiKey />
                        </div>
                        Administrative Password Reset
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Generate and dispatch a secure password reset link directly for {u?.email || 'this user'}.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSendPasswordReset}
                      disabled={busyAction === 'reset-password' || !u?.email}
                      className="px-3.5 py-2 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
                    >
                      <FiKey /> {busyAction === 'reset-password' ? 'Generating…' : 'Send Reset Link'}
                    </button>
                  </div>

                  {/* Session Security & Data Export Actions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl border bg-slate-50/80 border-slate-200/80 space-y-3 flex flex-col justify-between shadow-2xs">
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-lg bg-red-100 text-red-700 flex items-center justify-center text-xs">
                            <FiShieldOff />
                          </div>
                          Session Security
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Revoke refresh tokens to force sign-out on all active devices.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRevokeSessions}
                        disabled={busyAction === 'revoke-sessions'}
                        className="w-full px-3.5 py-2 rounded-xl font-bold text-xs bg-red-50 hover:bg-red-100 border border-red-200 text-red-800 flex items-center justify-center gap-1.5 transition shadow-2xs"
                      >
                        <FiShieldOff /> {busyAction === 'revoke-sessions' ? 'Revoking…' : 'Revoke All Sessions'}
                      </button>
                    </div>

                    <div className="p-4 rounded-2xl border bg-slate-50/80 border-slate-200/80 space-y-3 flex flex-col justify-between shadow-2xs">
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs">
                            <FiDownload />
                          </div>
                          Compliance Export (GDPR)
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Export complete user profile, resumes, and orders JSON bundle.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleExportUserData}
                        disabled={busyAction === 'export'}
                        className="w-full px-3.5 py-2 rounded-xl font-bold text-xs bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 flex items-center justify-center gap-1.5 transition shadow-2xs"
                      >
                        <FiDownload /> {busyAction === 'export' ? 'Exporting…' : 'Download JSON Bundle'}
                      </button>
                    </div>
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
                            {tenant.workspaceId && (
                              <p className="text-[10px] text-slate-400 mt-0.5 font-mono" title="Workspace this membership is bound to">
                                Workspace: {tenant.workspaceId}
                              </p>
                            )}
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
                            disabled={availableTenants.length === 0}
                            value={selectedTenantId}
                            onChange={(e) => setSelectedTenantId(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            <option value="">
                              {availableTenants.length === 0
                                ? '-- No Organizations Found --'
                                : '-- Choose Organization --'}
                            </option>
                            {availableTenants.map(t => (
                              <option key={t.id} value={t.id}>{t.displayName} ({t.slug})</option>
                            ))}
                          </select>
                          {availableTenants.length === 0 && (
                            <p className="text-[10px] text-amber-700 mt-1 font-semibold">
                              ℹ No organizations exist yet. Provision a tenant in <a href="/adm/tenants" className="underline font-bold">Tenants Registry</a> first.
                            </p>
                          )}
                          {selectedTenantId && workspacePreview.status === 'loading' && (
                            <p className="text-[10px] text-slate-500 mt-1 font-semibold" role="status">Checking the organization's workspace…</p>
                          )}
                          {selectedTenantId && workspacePreview.status === 'ready' && workspacePreview.lifecycleState && String(workspacePreview.lifecycleState).toUpperCase() !== 'ACTIVE' && (
                            <p className="text-[10px] text-red-700 mt-1 font-semibold" role="alert">
                              ⚠ This organization is {workspacePreview.lifecycleState}. Reactivate it before assigning members.
                            </p>
                          )}
                          {selectedTenantId && workspacePreview.status === 'ready' && (!workspacePreview.lifecycleState || String(workspacePreview.lifecycleState).toUpperCase() === 'ACTIVE') && workspacePreview.workspace && (
                            <p className="text-[10px] text-emerald-700 mt-1 font-semibold" data-testid="tenant-workspace-preview">
                              ✓ The user will join workspace: <span className="font-mono">{workspacePreview.workspace.name}</span>
                              {workspacePreview.workspace.isDefault ? ' (default workspace)' : ''}.
                            </p>
                          )}
                          {selectedTenantId && workspacePreview.status === 'ready' && (!workspacePreview.lifecycleState || String(workspacePreview.lifecycleState).toUpperCase() === 'ACTIVE') && !workspacePreview.workspace && (
                            <p className="text-[10px] text-red-700 mt-1 font-semibold" role="alert" data-testid="tenant-workspace-missing">
                              ⚠ This organization has no active workspace. Create one in the <a href="/adm/tenants" className="underline font-bold">Tenants Registry</a> before assigning members.
                            </p>
                          )}
                          {selectedTenantId && workspacePreview.status === 'unavailable' && (
                            <p className="text-[10px] text-slate-500 mt-1">
                              Workspace will be resolved automatically to the organization's default workspace.
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Assigned Tenant Role</label>
                          <select
                            disabled={availableTenants.length === 0}
                            value={selectedTenantRole}
                            onChange={(e) => setSelectedTenantRole(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            <option value="ENTERPRISE_MEMBER">ENTERPRISE_MEMBER (Standard Member)</option>
                            <option value="ENTERPRISE_ADMIN">ENTERPRISE_ADMIN (Tenant Administrator)</option>
                          </select>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => { setShowAddTenantModal(false); setSelectedTenantId(''); }}
                            className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={busyAction === 'add-tenant' || (selectedTenantId && workspacePreview.status === 'ready' && !workspacePreview.workspace) || (selectedTenantId && workspacePreview.status === 'ready' && workspacePreview.lifecycleState && String(workspacePreview.lifecycleState).toUpperCase() !== 'ACTIVE')}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
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
    </div>
  </div>

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

      {confirmationDialog}
    </div>
  );
}

