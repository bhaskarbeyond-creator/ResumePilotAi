import React, { useMemo, useState } from 'react';
import {
  FiHelpCircle, FiLock, FiPlus, FiTrash2, FiCheck, FiX, FiClock, FiShield
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

export default function EnterpriseSupportTab() {
  const { request } = useTenantApi();
  const [grantsState, refreshGrants] = useAsyncResource(() => request('/api/enterprise/support-grants'), [request]);
  const { loading, error, data } = grantsState;
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('240');
  const [supportSubjectId, setSupportSubjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);

  const grants = useMemo(() => (Array.isArray(data?.grants) ? data.grants : []), [data]);

  const notify = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3500);
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
          scopes: ['tenant.audit.read'],
        },
      });
      setShowModal(false);
      setReason('');
      setSupportSubjectId('');
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
            <h2 className="enterprise-tab-title">Break-Glass & Support Access</h2>
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
              No active support grants. Sovereign customer isolation active.
            </p>
          ) : (
            <div className="enterprise-table-wrapper" style={{ marginTop: '1.5rem' }}>
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th>Support Subject</th>
                    <th>Reason</th>
                    <th>Scope</th>
                    <th>Expires At</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grants.map(grant => (
                    <tr key={grant.id}>
                      <td><strong>{grant.supportSubjectId || '—'}</strong></td>
                      <td><em>"{grant.reason}"</em></td>
                      <td><span className="enterprise-pill enterprise-pill-secondary">{(grant.scopes || []).join(', ')}</span></td>
                      <td><small><FiClock /> {new Date(grant.expiresAt).toLocaleString()}</small></td>
                      <td><span className="enterprise-pill enterprise-pill-success">{grant.status}</span></td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="enterprise-button enterprise-button-danger enterprise-button-sm"
                          onClick={() => handleRevoke(grant.id)}
                        >
                          Revoke Immediately
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
