import React, { useState } from 'react';
import {
  FiHelpCircle, FiLock, FiPlus, FiTrash2, FiCheck, FiX,
  FiAlertTriangle, FiClock, FiShield
} from 'react-icons/fi';

const SAMPLE_GRANTS = [
  { id: 'grant-101', supportEmail: 'support-tier3@resumepilot.ai', reason: 'Assisting with Workday ATS integration mapping', workspace: 'Engineering', expiresAt: 'In 3 hours 45 mins', status: 'ACTIVE' }
];

export default function EnterpriseSupportTab() {
  const [grants, setGrants] = useState(SAMPLE_GRANTS);
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('4');
  const [notification, setNotification] = useState(null);

  const handleGrant = (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    const newGrant = {
      id: `grant-${Date.now()}`,
      supportEmail: 'authorized-support@resumepilot.ai',
      reason: reason.trim(),
      workspace: 'All Workspaces',
      expiresAt: `In ${duration} hours`,
      status: 'ACTIVE',
    };
    setGrants(prev => [newGrant, ...prev]);
    setShowModal(false);
    setReason('');
    setNotification('Temporary support access granted with full audit recording.');
    setTimeout(() => setNotification(null), 3500);
  };

  const handleRevoke = (id) => {
    setGrants(prev => prev.filter(g => g.id !== id));
    setNotification('Support grant immediately revoked.');
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="enterprise-tab-content">
      {notification && (
        <div className="enterprise-toast enterprise-toast-success">
          <FiCheck aria-hidden="true" /> {notification}
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

        <div className="enterprise-table-wrapper" style={{ marginTop: '1.5rem' }}>
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Support Engineer</th>
                <th>Mandatory Reason</th>
                <th>Scope</th>
                <th>Time Remaining</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {grants.map(grant => (
                <tr key={grant.id}>
                  <td><strong>{grant.supportEmail}</strong></td>
                  <td><em>"{grant.reason}"</em></td>
                  <td><span className="enterprise-pill enterprise-pill-secondary">{grant.workspace}</span></td>
                  <td><small><FiClock /> {grant.expiresAt}</small></td>
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
              {grants.length === 0 && (
                <tr>
                  <td colSpan="6" className="enterprise-empty-row">
                    No active support grants. Sovereign customer isolation active.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setShowModal(false)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Authorize Temporary Support Grant</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setShowModal(false)}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleGrant}>
              <div className="enterprise-modal-body">
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
                    autoFocus
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
                    <option value="1">1 Hour (Quick Diagnosis)</option>
                    <option value="4">4 Hours (Standard Investigation)</option>
                    <option value="24">24 Hours (Complex Migration Support)</option>
                  </select>
                </div>
              </div>
              <div className="enterprise-modal-footer">
                <button
                  type="button"
                  className="enterprise-button enterprise-button-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="enterprise-button enterprise-button-primary"
                >
                  Issue Timed Grant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
