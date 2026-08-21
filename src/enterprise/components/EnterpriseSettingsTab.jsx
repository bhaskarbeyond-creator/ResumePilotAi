import React, { useEffect, useMemo, useState } from 'react';
import { FiSave, FiAlertTriangle, FiDownload, FiCheck } from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import { useEnterpriseTenant } from '../EnterpriseContext';
import HelpTooltip from './HelpTooltip';

export default function EnterpriseSettingsTab({ tenant }) {
  const { request } = useTenantApi();
  const { reload } = useEnterpriseTenant();
  const [configState, refreshConfig] = useAsyncResource(() => request('/api/enterprise/configuration'), [request]);
  const { loading, error, data } = configState;
  const configuration = useMemo(() => data?.configuration || null, [data]);
  const retentionDays = String(configuration?.retentionPolicy?.retentionDays ?? '');
  const [retentionInput, setRetentionInput] = useState(retentionDays);
  const [orgName, setOrgName] = useState(tenant?.displayName || '');
  const [orgNameDirty, setOrgNameDirty] = useState(false);
  const [requireMfa, setRequireMfa] = useState(false);
  const [supportApproval, setSupportApproval] = useState(true);
  const [ssoMode, setSsoMode] = useState('NONE');
  const [sessionMax, setSessionMax] = useState('480');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setRetentionInput(retentionDays);
    setRequireMfa(configuration?.securityPolicy?.requireMfaForAdmins === true);
    setSupportApproval(configuration?.securityPolicy?.supportAccessRequiresApproval !== false);
    setSsoMode(String(configuration?.identityPolicy?.ssoMode || 'NONE').toUpperCase());
    setSessionMax(String(configuration?.identityPolicy?.sessionMaxMinutes ?? 480));
    if (!orgNameDirty) setOrgName(tenant?.displayName || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retentionDays, configuration, tenant?.displayName]);

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
            securityPolicy: {
              requireMfaForAdmins: requireMfa === true,
              supportAccessRequiresApproval: supportApproval === true,
            },
            identityPolicy: {
              ...(configuration.identityPolicy || {}),
              ssoMode,
              sessionMaxMinutes: Number(sessionMax),
            },
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

  const handleRename = async (e) => {
    e.preventDefault();
    const name = orgName.trim();
    if (!name || name === tenant?.displayName || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await request('/api/enterprise/tenant', { method: 'PATCH', body: { displayName: name } });
      setNotification(`Organization renamed to "${name}".`);
      setOrgNameDirty(false);
      reload().catch(() => {});
    } catch (err) {
      setActionError(err?.message || 'Organization name could not be updated.');
    } finally {
      setBusy(false);
      setTimeout(() => setNotification(null), 3500);
    }
  };

  const handleExport = async () => {
    if (exporting) return;
    if (!window.confirm('Export a verified snapshot of this organization\'s enterprise data? The export is recorded in the audit trail.')) return;
    setExporting(true);
    setActionError(null);
    try {
      const result = await request('/api/enterprise/data/export');
      const snapshot = result?.snapshot || {};
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.setAttribute('href', url);
      anchor.setAttribute('download', `tenant-snapshot-${snapshot.tenantId || 'export'}-${Date.now()}.json`);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotification(`Exported ${snapshot.documentCount ?? 0} documents (checksum ${String(snapshot.checksum || '').slice(0, 12)}…).`);
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      setActionError(err?.message || 'Tenant data export is unavailable.');
    } finally {
      setExporting(false);
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
          <FiCheck aria-hidden="true" /> {notification}
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

      <DataState loading={loading} error={error} onRetry={refreshConfig}>
        <div className="enterprise-card">
          <h2 className="enterprise-tab-title">
            Organization Settings
            <HelpTooltip text="Configure tenant identity, document retention policies, security controls, and enterprise data export" />
          </h2>
          <p className="enterprise-tab-subtitle">Configure organization profile and governance policies</p>

          <form onSubmit={handleRename}>
            <div className="enterprise-two-column-grid">
              <div className="enterprise-form-group">
                <label htmlFor="org-name">Organization Display Name</label>
                <input
                  id="org-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={orgName}
                  onChange={(e) => { setOrgName(e.target.value); setOrgNameDirty(true); }}
                  className="enterprise-input"
                  disabled={busy}
                />
                <small className="text-muted">Shown across the enterprise console. The change is audited.</small>
              </div>
              <div className="enterprise-form-group">
                <label>Organization Slug / Namespace</label>
                <input type="text" value={tenant?.slug || '—'} disabled className="enterprise-input enterprise-input-disabled" />
                <small className="text-muted">Unique immutable tenant identifier</small>
              </div>
            </div>
            <div className="enterprise-form-actions" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
              <button type="submit" className="enterprise-button enterprise-button-secondary" disabled={busy || !orgNameDirty || orgName.trim().length < 2 || orgName.trim() === tenant?.displayName}>
                <FiSave aria-hidden="true" /> Rename Organization
              </button>
            </div>
          </form>

          <form onSubmit={handleSave} style={{ marginTop: '1.25rem' }}>
            <div className="enterprise-form-group">
              <label htmlFor="retention">Data & Audit Retention Policy</label>
              <select
                id="retention"
                value={retentionInput || ''}
                onChange={(e) => setRetentionInput(e.target.value)}
                className="enterprise-select"
              >
                <option value="30">30 Days (Operational Minimum)</option>
                <option value="90">90 Days (Standard Compliance)</option>
                <option value="365">1 Year (SOC2 / ISO27001 Default)</option>
                <option value="2555">7 Years (Financial / Regulatory Strict)</option>
              </select>
              <small className="text-muted">Recorded as the tenant retention policy (revision {configuration?.revision ?? '—'}).</small>
            </div>

            <h3 className="enterprise-card-title" style={{ marginTop: '1.5rem' }}>Security Policy — enforced at sign-in</h3>
            <div className="enterprise-checkbox-list" style={{ marginTop: '0.5rem' }}>
              <label className="enterprise-checkbox">
                <input
                  type="checkbox"
                  checked={requireMfa}
                  onChange={(e) => setRequireMfa(e.target.checked)}
                />
                <span>Require MFA for tenant administrators <small className="text-muted">(verified from the sign-in second-factor claim)</small></span>
              </label>
              <label className="enterprise-checkbox">
                <input
                  type="checkbox"
                  checked={supportApproval}
                  onChange={(e) => setSupportApproval(e.target.checked)}
                />
                <span>Restrict break-glass support grants to read-only diagnostic scopes <small className="text-muted">(unchecking additionally permits repair scopes — a recorded tenant decision)</small></span>
              </label>
            </div>

            <h3 className="enterprise-card-title" style={{ marginTop: '1.5rem' }}>Identity Policy</h3>
            <div className="enterprise-two-column-grid" style={{ marginTop: '0.5rem' }}>
              <div className="enterprise-form-group">
                <label htmlFor="sso-mode">Single Sign-On Mode</label>
                <select
                  id="sso-mode"
                  value={ssoMode}
                  onChange={(e) => setSsoMode(e.target.value)}
                  className="enterprise-select"
                >
                  <option value="NONE">None (Firebase email/password &amp; social)</option>
                  <option value="OIDC">OIDC (OpenID Connect)</option>
                  <option value="SAML">SAML 2.0</option>
                </select>
                <small className="text-muted">
                  Enforced at enterprise context resolution: with OIDC/SAML active, sign-ins that did not come through a federated identity provider are rejected.
                </small>
              </div>
              <div className="enterprise-form-group">
                <label htmlFor="session-max">Maximum Session Length (minutes)</label>
                <input
                  id="session-max"
                  type="number"
                  min="15"
                  max="10080"
                  value={sessionMax}
                  onChange={(e) => setSessionMax(e.target.value)}
                  className="enterprise-input"
                />
                <small className="text-muted">Between 15 minutes and 7 days. Enforced from the verified token auth_time claim.</small>
              </div>
            </div>

            <div className="enterprise-form-actions" style={{ marginTop: '1.5rem' }}>
              <button type="submit" className="enterprise-button enterprise-button-primary" disabled={busy || !configuration}>
                <FiSave aria-hidden="true" /> {busy ? 'Saving…' : 'Save Organization Settings'}
              </button>
            </div>
          </form>
        </div>

        <div className="enterprise-card" style={{ marginTop: '24px' }}>
          <h3 className="enterprise-card-title"><FiDownload aria-hidden="true" /> Data Export</h3>
          <p className="enterprise-card-subtitle">
            Download a checksum-verified snapshot of this organization&apos;s enterprise data (tenant registry, configuration, memberships, workspaces, teams, resources, audit events, and usage ledger).
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '16px', background: 'var(--enterprise-surface)', border: '1px solid var(--enterprise-border)', borderRadius: 'var(--enterprise-radius-md)', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <strong style={{ color: 'var(--enterprise-ink)' }}>Organization data snapshot</strong>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--enterprise-text)', marginTop: '4px' }}>The export is integrity-verified before download and recorded as a HIGH severity audit event.</p>
            </div>
            <button
              type="button"
              className="enterprise-button enterprise-button-secondary"
              onClick={handleExport}
              disabled={exporting}
            >
              <FiDownload aria-hidden="true" /> {exporting ? 'Exporting…' : 'Export Snapshot'}
            </button>
          </div>
        </div>

        <div className="enterprise-card" style={{ marginTop: '24px', border: '1px solid var(--enterprise-danger)', background: 'rgba(239,68,68,0.05)' }}>
          <h3 className="enterprise-card-title" style={{ color: 'var(--enterprise-danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiAlertTriangle aria-hidden="true" /> Tenant Lifecycle & Danger Zone
          </h3>
          <p className="enterprise-card-subtitle" style={{ color: 'var(--enterprise-danger)' }}>
            Suspending a tenant prevents all members and M2M service accounts from resolving context. Reactivation requires a platform administrator.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '16px', background: 'var(--enterprise-surface)', border: '1px solid var(--enterprise-danger)', borderRadius: 'var(--enterprise-radius-md)', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <strong style={{ color: 'var(--enterprise-ink)' }}>Temporary Organization Suspension</strong>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--enterprise-text)', marginTop: '4px' }}>Freeze all member access and active jobs while preserving data integrity.</p>
            </div>
            <button
              type="button"
              className="enterprise-button enterprise-button-danger"
              onClick={handleSuspend}
            >
              Suspend Organization
            </button>
          </div>
        </div>
      </DataState>
    </div>
  );
}
