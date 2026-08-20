import React, { useState } from 'react';
import {
  FiSettings, FiCheck, FiAlertTriangle, FiTrash2, FiSave, FiGlobe, FiShield
} from 'react-icons/fi';

export default function EnterpriseSettingsTab({ tenant }) {
  const [displayName, setDisplayName] = useState(tenant?.displayName || 'Enterprise Workspace');
  const slug = tenant?.slug || 'acme-corp';
  const [retentionDays, setRetentionDays] = useState('365');
  const [notification, setNotification] = useState(null);

  const handleSave = (e) => {
    e.preventDefault();
    setNotification('Organization settings saved.');
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
        <h2 className="enterprise-tab-title">Organization Settings</h2>
        <p className="enterprise-tab-subtitle">Configure organization profile, domain routing, and governance policies</p>

        <form onSubmit={handleSave}>
          <div className="enterprise-two-column-grid">
            <div className="enterprise-form-group">
              <label htmlFor="org-name">Organization Display Name</label>
              <input
                id="org-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="enterprise-input"
              />
            </div>

            <div className="enterprise-form-group">
              <label htmlFor="org-slug">Organization Slug / Namespace</label>
              <input
                id="org-slug"
                type="text"
                value={slug}
                disabled
                className="enterprise-input enterprise-input-disabled"
              />
              <small className="text-muted">Unique immutable tenant identifier</small>
            </div>
          </div>

          <div className="enterprise-form-group" style={{ marginTop: '1.25rem' }}>
            <label htmlFor="retention">Data & Audit Retention Policy</label>
            <select
              id="retention"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              className="enterprise-select"
            >
              <option value="90">90 Days (Standard Compliance)</option>
              <option value="365">1 Year (SOC2 / ISO27001 Default)</option>
              <option value="2555">7 Years (Financial / Regulatory Strict)</option>
              <option value="indefinite">Indefinite (No automatic pruning)</option>
            </select>
          </div>

          <div className="enterprise-form-actions" style={{ marginTop: '1.5rem' }}>
            <button
              type="submit"
              className="enterprise-button enterprise-button-primary"
            >
              <FiSave aria-hidden="true" /> Save Organization Settings
            </button>
          </div>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="enterprise-card enterprise-card-danger" style={{ marginTop: '1.5rem' }}>
        <h3 className="enterprise-card-title text-danger">Tenant Lifecycle & Danger Zone</h3>
        <p className="enterprise-card-subtitle">
          Suspending or deactivating a tenant prevents all members and M2M service accounts from resolving context
        </p>

        <div className="enterprise-danger-row">
          <div>
            <strong>Temporary Organization Suspension</strong>
            <p>Freeze all member access and active jobs while preserving data integrity.</p>
          </div>
          <button
            type="button"
            className="enterprise-button enterprise-button-danger"
            onClick={() => {
              if (window.confirm('Are you sure you want to suspend this enterprise tenant?')) {
                setNotification('Tenant suspension requested.');
              }
            }}
          >
            Suspend Organization
          </button>
        </div>
      </div>
    </div>
  );
}
