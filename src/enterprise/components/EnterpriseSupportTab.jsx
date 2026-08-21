import React, { useMemo, useState } from 'react';
import {
  FiHelpCircle, FiLock, FiPlus, FiTrash2, FiCheck, FiX, FiClock, FiShield
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import HelpTooltip from './HelpTooltip';

export default function EnterpriseSupportTab() {
  const { request } = useTenantApi();
  const [grantsState, refreshGrants] = useAsyncResource(() => request('/api/enterprise/support-grants'), [request]);
  const [configState] = useAsyncResource(() => request('/api/enterprise/configuration'), [request]);
  const { loading, error, data } = grantsState;
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('240');
  const [supportSubjectId, setSupportSubjectId] = useState('');
  const [scopes, setScopes] = useState(['tenant.audit.read']);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);

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
        },
      });
      setShowModal(false);
      setReason('');
      setSupportSubjectId('');
      setScopes(['tenant.audit.read']);
      notify('Temporary support access granted with full audit recording.');
      refreshGrants();
    } catch (err) {
      setActionError(err?.message || 'Support grant could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm('Immediately revoke this support grant?')) return;
    setActionError(null);
    try {
      await request(`/api/enterprise/support-grants/${id}/revoke`, { method: 'POST' });
      notify('Support grant immediately revoked.');
      refreshGrants();
    } catch (err) {
      setActionError(err?.message || 'Support grant could not be revoked.');
    }
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
                            <td><em>"{grant.reason}"</em></td>
                            <td>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {(grant.scopes || []).map(scope => (
                                  <span key={scope} className="enterprise-pill enterprise-pill-secondary" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>{scope}</span>
                                ))}
                              </div>
                            </td>
                            <td><small className="text-muted">{grant.requestedBySubjectId || '—'}</small></td>
                            <td><small><FiClock aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '4px' }} /> {new Date(grant.expiresAt).toLocaleString()}</small></td>
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
                  <label htmlFor="grant-subject">Support Engineer Principal</label>
                  <input
                    id="grant-subject"
                    type="text"
                    required
                    placeholder="Verified support engineer principal id"
                    value={supportSubjectId}
                    onChange={(e) => setSupportSubjectId(e.target.value)}
                    className="enterprise-input"
                    autoFocus
                  />
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
    </div>
  );
}
