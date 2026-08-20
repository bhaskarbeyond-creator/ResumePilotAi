import React, { useMemo, useState } from 'react';
import { FiSave, FiAlertTriangle } from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

export default function EnterpriseSettingsTab({ tenant }) {
  const { request } = useTenantApi();
  const [configState, refreshConfig] = useAsyncResource(() => request('/api/enterprise/configuration'), [request]);
  const { loading, error, data } = configState;
  const configuration = useMemo(() => data?.configuration || null, [data]);
  const retentionDays = String(configuration?.retentionPolicy?.retentionDays ?? '');
  const [retentionInput, setRetentionInput] = useState(retentionDays);
  const [busy, setBusy] = useState(false);
  const [notification, setNotification] = useState(null);
  const [actionError, setActionError] = useState(null);

  const handleSave = async (e) => {
    e.preventDefault();
    if (busy || !configuration) return;
    setBusy(true);
    setActionError(null);
    try {
      await request('/api/enterprise/configuration', {
        method: 'PATCH',
        body: {
          expectedRevision: configuration.revision,
          configuration: {
            retentionPolicy: { ...(configuration.retentionPolicy || {}), retentionDays: Number(retentionInput) },
          },
        },
      });
      setNotification('Organization settings saved.');
      refreshConfig();
    } catch (err) {
      setActionError(err?.message || 'Organization settings could not be saved.');
    } finally {
      setBusy(false);
      setTimeout(() => setNotification(null), 3500);
    }
  };

  const handleSuspend = async () => {
    if (!window.confirm('Suspend this enterprise organization? All members and service accounts will lose access until it is reactivated by a platform administrator.')) return;
    setActionError(null);
    try {
      await request('/api/enterprise/lifecycle/suspend', { method: 'POST' });
      setNotification('Organization suspended. Access is now revoked.');
    } catch (err) {
      setActionError(err?.message || 'Organization could not be suspended.');
    }
  };

  return (
    <div className="enterprise-tab-content">
      {notification && (
        <div className="enterprise-toast enterprise-toast-success">
          <FiSave aria-hidden="true" /> {notification}
        </div>
      )}
      {actionError && (
        <div className="enterprise-card" role="alert">
          <div className="enterprise-error-row">
            <span className="enterprise-error-icon" aria-hidden="true">⚠</span>
            <div><strong>Settings action failed</strong><p className="text-muted">{actionError}</p></div>
          </div>
        </div>
      )}

      <DataState loading={loading} error={error}>
        <div className="enterprise-card">
          <h2 className="enterprise-tab-title">Organization Settings</h2>
          <p className="enterprise-tab-subtitle">Configure organization profile and governance policies</p>

          <div className="enterprise-two-column-grid">
            <div className="enterprise-form-group">
              <label>Organization Display Name</label>
              <input type="text" value={tenant?.displayName || 'Enterprise Workspace'} disabled className="enterprise-input enterprise-input-disabled" />
              <small className="text-muted">Managed by the tenant record</small>
            </div>
            <div className="enterprise-form-group">
              <label>Organization Slug / Namespace</label>
              <input type="text" value={tenant?.slug || '—'} disabled className="enterprise-input enterprise-input-disabled" />
              <small className="text-muted">Unique immutable tenant identifier</small>
            </div>
          </div>

          <form onSubmit={handleSave} style={{ marginTop: '1.25rem' }}>
            <div className="enterprise-form-group">
              <label htmlFor="retention">Data & Audit Retention Policy</label>
              <select
                id="retention"
                value={retentionInput || ''}
                onChange={(e) => setRetentionInput(e.target.value)}
                className="enterprise-select"
              >
                <option value="90">90 Days (Standard Compliance)</option>
                <option value="365">1 Year (SOC2 / ISO27001 Default)</option>
                <option value="2555">7 Years (Financial / Regulatory Strict)</option>
                <option value="0">Indefinite (No automatic pruning)</option>
              </select>
            </div>
            <div className="enterprise-form-actions" style={{ marginTop: '1.5rem' }}>
              <button type="submit" className="enterprise-button enterprise-button-primary" disabled={busy || !configuration}>
                <FiSave aria-hidden="true" /> {busy ? 'Saving…' : 'Save Organization Settings'}
              </button>
            </div>
          </form>
        </div>

        <div className="enterprise-card enterprise-card-danger" style={{ marginTop: '1.5rem' }}>
          <h3 className="enterprise-card-title text-danger">Tenant Lifecycle & Danger Zone</h3>
          <p className="enterprise-card-subtitle">
            Suspending a tenant prevents all members and M2M service accounts from resolving context. Reactivation requires a platform administrator.
          </p>
          <div className="enterprise-danger-row">
            <div>
              <strong>Temporary Organization Suspension</strong>
              <p>Freeze all member access and active jobs while preserving data integrity.</p>
            </div>
            <button
              type="button"
              className="enterprise-button enterprise-button-danger"
              onClick={handleSuspend}
            >
              <FiAlertTriangle aria-hidden="true" /> Suspend Organization
            </button>
          </div>
        </div>
      </DataState>
    </div>
  );
}
