import React, { useMemo, useState } from 'react';
import {
  FiHelpCircle, FiLock, FiPlus, FiTrash2, FiCheck, FiX, FiClock, FiShield
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import HelpTooltip from './HelpTooltip';
import EnterpriseConfirmModal from './EnterpriseConfirmModal';

export default function EnterpriseSupportTab() {
  const { request, context } = useTenantApi();
  const [grantsState, refreshGrants] = useAsyncResource(() => request('/api/enterprise/support-grants'), [request]);
  const [configState] = useAsyncResource(() => request('/api/enterprise/configuration'), [request]);
  const { loading, error, data } = grantsState;
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('240');
  const [supportSubjectId, setSupportSubjectId] = useState('');
  const [scopes, setScopes] = useState(['tenant.audit.read']);
  const [grantScope, setGrantScope] = useState('WORKSPACE');
  const canCreateTenantScoped = context?.workspaceScope === 'TENANT';
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState(null);
  // Ticking clock so live grants show a real remaining-time countdown.
  const [, setTick] = useState(0);
  React.useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const remainingLabel = (expiresAt) => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return 'expired';
    const minutes = Math.ceil(ms / 60_000);
    if (minutes < 60) return `${minutes}m left`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m left`;
  };

  // Server-enforced scope governance: while the tenant keeps the default
  // support policy, only diagnostic scopes are permitted.
  const DIAGNOSTIC_SCOPES = ['tenant.audit.read', 'tenant.read', 'tenant.usage.read', 'resource.read', 'workspace.read'];
  const REPAIR_SCOPES = ['resource.update', 'resource.create'];
  const repairAllowed = configState.data?.configuration?.securityPolicy?.supportAccessRequiresApproval === false;

  const grants = useMemo(() => (Array.isArray(data?.grants) ? data.grants : []), [data]);
  const filteredGrants = useMemo(() => {
    if (statusFilter === 'ALL') return grants;
    if (statusFilter === 'LIVE') {
      return grants.filter(grant => grant.status === 'ACTIVE' && new Date(grant.expiresAt).getTime() > Date.now());
    }
    return grants.filter(grant => String(grant.status || '').toUpperCase() === statusFilter);
  }, [grants, statusFilter]);

  const notify = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3500);
  };

  const toggleScope = (scope) => {
    setScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);
  };

  const handleGrant = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await request('/api/enterprise/support-grants', {
        method: 'POST',
        body: {
          supportSubjectId: supportSubjectId.trim(),
          reason: reason.trim(),
          expiresInMinutes: Number(duration),
          scopes,
          scope: grantScope,
        },
      });
      setShowModal(false);
      setReason('');
      setSupportSubjectId('');
      setScopes(['tenant.audit.read']);
      setGrantScope('WORKSPACE');
      notify('Temporary support access granted with full audit recording.');
      refreshGrants();
    } catch (err) {
      setActionError(err?.message || 'Support grant could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = (id) => {
    setConfirmConfig({
      title: 'Revoke Support Grant',
      message: 'Are you sure you want to immediately revoke this support access grant? The support engineer will immediately lose all diagnostic permissions.',
      confirmLabel: 'Revoke Grant',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmConfig(null);
        setActionError(null);
        try {
          await request(`/api/enterprise/support-grants/${id}/revoke`, { method: 'POST' });
          notify('Support grant immediately revoked.');
          refreshGrants();
        } catch (err) {
          setActionError(err?.message || 'Support grant could not be revoked.');
        }
      }
    });
  };

  return (
    <div className="enterprise-tab-content">
      {notification && (
        <div className="enterprise-toast enterprise-toast-success">
          <FiCheck aria-hidden="true" /> {notification}
        </div>
      )}
      {actionError && (
        <div className="enterprise-card" role="alert">
          <div className="enterprise-error-row">
            <span className="enterprise-error-icon" aria-hidden="true">⚠</span>
            <div><strong>Support grant action failed</strong><p className="text-muted">{actionError}</p></div>
          </div>
        </div>
      )}

      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">
              Break-Glass & Support Access
              <HelpTooltip text="Time-bound, cryptographically validated emergency break-glass grants for certified support engineers" />
            </h2>
            <p className="enterprise-tab-subtitle">
              Time-bound, purpose-restricted access grants allowing verified support engineers to diagnose tenant issues
            </p>
          </div>
          <button
            type="button"
            className="enterprise-button enterprise-button-primary"
            onClick={() => setShowModal(true)}
          >
            <FiPlus aria-hidden="true" /> Grant Support Access
          </button>
        </div>

        <div className="enterprise-security-banner">
          <div className="enterprise-security-banner-icon text-warning">
            <FiShield />
          </div>
          <div>
            <strong>Zero Implicit Access Rule Enforced</strong>
            <p>Platform engineers and AI Resume support agents have zero default access to customer resumes or databases unless an explicit, signed grant is active.</p>
          </div>
        </div>

        <DataState loading={loading} error={error} onRetry={refreshGrants}>
          {grants.length === 0 ? (
            <p className="enterprise-empty" style={{ marginTop: '1.5rem' }}>
              No support grants recorded. Sovereign customer isolation active.
            </p>
          ) : (
            <>
              <div className="enterprise-inline-actions" style={{ margin: '1rem 0', flexWrap: 'wrap', gap: '0.5rem' }} role="group" aria-label="Filter grants by state">
                {['ALL', 'LIVE', 'ACTIVE', 'REVOKED'].map(filter => (
                  <button
                    key={filter}
                    type="button"
                    className={`enterprise-button enterprise-button-sm ${statusFilter === filter ? 'enterprise-button-primary' : 'enterprise-button-secondary'}`}
                    aria-pressed={statusFilter === filter}
                    onClick={() => setStatusFilter(filter)}
                  >
                    {filter === 'ALL' ? 'All grants' : filter === 'LIVE' ? 'Live (unexpired)' : filter}
                  </button>
                ))}
              </div>
              {filteredGrants.length === 0 ? (
                <p className="enterprise-empty">No grants match this view.</p>
              ) : (
                <div className="enterprise-table-wrapper">
                  <table className="enterprise-table">
                    <thead>
                      <tr>
                        <th>Support Subject</th>
                        <th>Reason</th>
                        <th>Scope</th>
                        <th>Requested By</th>
                        <th>Blast Radius</th>
                        <th>Expires At</th>
                        <th>Status</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGrants.map(grant => {
                        const expired = grant.status === 'ACTIVE' && new Date(grant.expiresAt).getTime() <= Date.now();
                        return (
                          <tr key={grant.id}>
                            <td><strong>{grant.supportSubjectId || '—'}</strong></td>
                            <td><em>&quot;{grant.reason}&quot;</em></td>
                            <td>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {(grant.scopes || []).map(scope => (
                                  <span key={scope} className="enterprise-pill enterprise-pill-secondary" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>{scope}</span>
                                ))}
                              </div>
                            </td>
                            <td><small className="text-muted">{grant.requestedBySubjectId || '—'}</small></td>
                            <td>
                              <span className={`enterprise-pill ${grant.workspaceId ? 'enterprise-pill-secondary' : 'enterprise-pill-warning'}`} title={grant.workspaceId ? 'Workspace-scoped grant' : 'Tenant-scoped grant'}>
                                {grant.workspaceId ? 'WORKSPACE' : 'TENANT'}
                              </span>
                            </td>
                            <td>
                              <small><FiClock aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '4px' }} /> {new Date(grant.expiresAt).toLocaleString()}</small>
                              {grant.status === 'ACTIVE' && !expired && <><br /><small className="text-muted">{remainingLabel(grant.expiresAt)}</small></>}
                            </td>
                            <td>
                              <span className={`enterprise-pill enterprise-pill-${grant.status === 'ACTIVE' && !expired ? 'success' : grant.status === 'REVOKED' ? 'secondary' : 'warning'}`}>
                                {expired ? 'EXPIRED' : grant.status}
                              </span>
                            </td>
                            <td className="text-right">
                              {grant.status === 'ACTIVE' && !expired && (
                                <button
                                  type="button"
                                  className="enterprise-button enterprise-button-danger enterprise-button-sm"
                                  onClick={() => handleRevoke(grant.id)}
                                >
                                  Revoke Immediately
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </DataState>
      </div>

      {showModal && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !busy && setShowModal(false)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Authorize Temporary Support Grant</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setShowModal(false)} disabled={busy}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleGrant}>
              <div className="enterprise-modal-body">
                <div className="enterprise-form-group">
                  <label htmlFor="grant-subject">Support Engineer Identity Code</label>
                  <input
                    id="grant-subject"
                    type="text"
                    required
                    pattern="[A-Za-z0-9:_-]{1,128}"
                    title="The identity code is provided by the support engineer during the support session"
                    placeholder="Paste the identity code the support engineer shared with you"
                    value={supportSubjectId}
                    onChange={(e) => setSupportSubjectId(e.target.value)}
                    className="enterprise-input"
                    style={{ fontFamily: 'monospace' }}
                    autoFocus
                  />
                  <small className="text-muted">
                    The on-call support engineer shares their identity code with you in the support ticket or call.
                    The platform verifies it against the identity directory before the grant is issued — an unknown or
                    ineligible identity is rejected.
                  </small>
                </div>
                <div className="enterprise-form-group">
                  <label>Grant Blast Radius</label>
                  <div className="enterprise-checkbox-list">
                    <label className="enterprise-checkbox">
                      <input type="radio" name="grant-scope" checked={grantScope === 'WORKSPACE'} onChange={() => setGrantScope('WORKSPACE')} />
                      <span><strong>Single workspace</strong> <small className="text-muted">· access limited to the active workspace (recommended)</small></span>
                    </label>
                    <label className="enterprise-checkbox" style={{ opacity: canCreateTenantScoped ? 1 : 0.55 }}>
                      <input type="radio" name="grant-scope" checked={grantScope === 'TENANT'} onChange={() => canCreateTenantScoped && setGrantScope('TENANT')} disabled={!canCreateTenantScoped} />
                      <span><strong>Entire tenant</strong> <small className="text-muted">· tenant-wide diagnostics{canCreateTenantScoped ? '' : ' (tenant administrators only)'}</small></span>
                    </label>
                  </div>
                </div>
                <div className="enterprise-form-group">
                  <label htmlFor="grant-reason">Mandatory Diagnostic Reason</label>
                  <textarea
                    id="grant-reason"
                    required
                    placeholder="Describe the specific support ticket or issue requiring investigation…"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="enterprise-textarea"
                    rows="3"
                  />
                </div>
                <div className="enterprise-form-group">
                  <label htmlFor="grant-duration">Access Expiration Window</label>
                  <select
                    id="grant-duration"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="enterprise-select"
                  >
                    <option value="15">15 Minutes (Emergency Peek)</option>
                    <option value="60">1 Hour (Quick Diagnosis)</option>
                    <option value="240">4 Hours (Standard Investigation)</option>
                    <option value="480">8 Hours (Complex Migration Support)</option>
                  </select>
                </div>
                <div className="enterprise-form-group">
                  <label>Grant Scopes <small className="text-muted">(server-enforced; least privilege)</small></label>
                  <div className="enterprise-checkbox-list">
                    {DIAGNOSTIC_SCOPES.map(scope => (
                      <label key={scope} className="enterprise-checkbox">
                        <input
                          type="checkbox"
                          checked={scopes.includes(scope)}
                          onChange={() => toggleScope(scope)}
                        />
                        <span><code>{scope}</code> <small className="text-muted">· diagnostic (read-only)</small></span>
                      </label>
                    ))}
                    {repairAllowed && REPAIR_SCOPES.map(scope => (
                      <label key={scope} className="enterprise-checkbox">
                        <input
                          type="checkbox"
                          checked={scopes.includes(scope)}
                          onChange={() => toggleScope(scope)}
                        />
                        <span><code>{scope}</code> <small className="text-muted">· repair (write) — permitted because this tenant explicitly allows repair scopes</small></span>
                      </label>
                    ))}
                  </div>
                  {!repairAllowed && (
                    <small className="text-muted">
                      Repair (write) scopes are blocked by this tenant&apos;s support policy. They become selectable only after explicitly allowing them in Organization Settings.
                    </small>
                  )}
                </div>
              </div>
              <div className="enterprise-modal-footer">
                <button type="button" className="enterprise-button enterprise-button-secondary" onClick={() => setShowModal(false)} disabled={busy}>Cancel</button>
                <button type="submit" className="enterprise-button enterprise-button-primary" disabled={busy}>
                  {busy ? 'Issuing…' : 'Issue Timed Grant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmConfig && (
        <EnterpriseConfirmModal
          isOpen={!!confirmConfig}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          cancelLabel={confirmConfig.cancelLabel}
          variant={confirmConfig.variant}
          busy={busy}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(null)}
        />
      )}
    </div>
  );
}
