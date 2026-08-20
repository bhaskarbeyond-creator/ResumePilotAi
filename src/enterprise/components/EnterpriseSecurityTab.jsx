import React, { useMemo, useState } from 'react';
import {
  FiShield, FiLock, FiKey, FiPlus, FiTrash2, FiCopy, FiCheck, FiX
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

const SCOPE_OPTIONS = ['resource.read', 'resource.create', 'resource.update', 'ai.use'];

export default function EnterpriseSecurityTab() {
  const { request } = useTenantApi();
  const [accountsState, refreshAccounts] = useAsyncResource(
    () => request('/api/enterprise/service-accounts'),
    [request],
  );
  const { loading, error, data } = accountsState;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saName, setSaName] = useState('');
  const [saScopes, setSaScopes] = useState(['resource.read']);
  const [busy, setBusy] = useState(false);
  const [generatedKey, setGeneratedKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);

  const serviceAccounts = useMemo(() => (Array.isArray(data?.serviceAccounts) ? data.serviceAccounts : []), [data]);

  const notify = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3500);
  };

  const toggleScope = (scope) => {
    setSaScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!saName.trim() || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const created = await request('/api/enterprise/service-accounts', {
        method: 'POST',
        body: { displayName: saName.trim(), scopes: saScopes },
      });
      setShowCreateModal(false);
      setGeneratedKey({ plaintext: created.apiKey, name: created.serviceAccount.displayName });
      setSaName('');
      setSaScopes(['resource.read']);
      refreshAccounts();
    } catch (err) {
      setActionError(err?.message || 'Service account could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm('Revoke this service account API key immediately? Existing tokens stop working on the next request.')) return;
    setActionError(null);
    try {
      await request(`/api/enterprise/service-accounts/${id}/revoke`, { method: 'POST' });
      notify('Service account API key revoked.');
      refreshAccounts();
    } catch (err) {
      setActionError(err?.message || 'Service account could not be revoked.');
    }
  };

  const handleCopy = () => {
    if (generatedKey?.plaintext) {
      navigator.clipboard.writeText(generatedKey.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
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
            <div><strong>Security action failed</strong><p className="text-muted">{actionError}</p></div>
          </div>
        </div>
      )}

      {generatedKey && (
        <div className="enterprise-card">
          <h3 className="enterprise-card-title">API Key Generated — Save It Now</h3>
          <p className="enterprise-card-subtitle">The plaintext secret is shown exactly once and is never stored. Copy it before closing.</p>
          <div className="enterprise-inline-actions">
            <code className="enterprise-json-preview" style={{ display: 'inline-block', padding: '0.5rem 0.75rem' }}>{generatedKey.plaintext}</code>
            <button type="button" className="enterprise-button enterprise-button-secondary" onClick={handleCopy}>
              <FiCopy aria-hidden="true" /> {copied ? 'Copied' : 'Copy Secret'}
            </button>
            <button type="button" className="enterprise-button enterprise-button-secondary" onClick={() => setGeneratedKey(null)}>
              <FiX aria-hidden="true" /> Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="enterprise-card">
        <h2 className="enterprise-tab-title">Enterprise Security Center</h2>
        <p className="enterprise-tab-subtitle">Machine-to-machine API keys, scopes, and lifecycle controls</p>

        <div className="enterprise-security-cards-grid">
          <div className="enterprise-card enterprise-sec-item">
            <div className="enterprise-sec-icon text-success"><FiShield /></div>
            <div>
              <strong>Server-Side Authorization</strong>
              <p>Every enterprise request is re-verified against active membership on the server. Client headers are only requested context.</p>
            </div>
          </div>
          <div className="enterprise-card enterprise-sec-item">
            <div className="enterprise-sec-icon text-success"><FiLock /></div>
            <div>
              <strong>Scoped API Keys</strong>
              <p>Service account keys carry explicit scopes and can be revoked instantly. Plaintext secrets are returned exactly once.</p>
            </div>
          </div>
          <div className="enterprise-card enterprise-sec-item">
            <div className="enterprise-sec-icon text-success"><FiKey /></div>
            <div>
              <strong>Signed Artifact Tokens</strong>
              <p>Storage access uses purpose-bound, expiring HMAC tokens scoped to the active tenant and workspace.</p>
            </div>
          </div>
        </div>

        <div className="enterprise-card-header-flex" style={{ marginTop: '1.5rem' }}>
          <div>
            <h3 className="enterprise-card-title">Service Accounts & M2M API Keys</h3>
            <p className="enterprise-card-subtitle">Credential lifecycle managed through the enterprise API</p>
          </div>
          <button
            type="button"
            className="enterprise-button enterprise-button-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <FiPlus aria-hidden="true" /> Create Service Account
          </button>
        </div>

        <DataState loading={loading} error={error}>
          {serviceAccounts.length === 0 ? (
            <p className="enterprise-empty">No active service accounts. Create one to enable machine-to-machine access.</p>
          ) : (
            <div className="enterprise-table-wrapper" style={{ marginTop: '1rem' }}>
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Workspace</th>
                    <th>Scopes</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceAccounts.map(account => (
                    <tr key={account.id}>
                      <td><strong>{account.displayName}</strong><br /><small>{String(account.id).slice(0, 12)}…</small></td>
                      <td><small>{account.workspaceId ? String(account.workspaceId).slice(0, 8) : '—'}</small></td>
                      <td>{Array.isArray(account.scopes) ? account.scopes.map(s => <span key={s} className="enterprise-pill enterprise-pill-secondary">{s}</span>) : <small>—</small>}</td>
                      <td><span className="enterprise-pill enterprise-pill-success">{account.status}</span></td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="enterprise-button-icon text-danger"
                          title="Revoke API key"
                          onClick={() => handleRevoke(account.id)}
                        >
                          <FiTrash2 />
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

      {showCreateModal && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !busy && setShowCreateModal(false)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Create Service Account</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setShowCreateModal(false)} disabled={busy}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="enterprise-modal-body">
                <div className="enterprise-form-group">
                  <label htmlFor="sa-name">Service Account Name</label>
                  <input
                    id="sa-name"
                    type="text"
                    required
                    placeholder="e.g. Workday HR Integration M2M"
                    value={saName}
                    onChange={(e) => setSaName(e.target.value)}
                    className="enterprise-input"
                    autoFocus
                  />
                </div>
                <div className="enterprise-form-group">
                  <label>Scopes</label>
                  <div className="enterprise-checkbox-list">
                    {SCOPE_OPTIONS.map(scope => (
                      <label key={scope} className="enterprise-checkbox">
                        <input
                          type="checkbox"
                          checked={saScopes.includes(scope)}
                          onChange={() => toggleScope(scope)}
                        />
                        <span>{scope}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="enterprise-modal-footer">
                <button type="button" className="enterprise-button enterprise-button-secondary" onClick={() => setShowCreateModal(false)} disabled={busy}>Cancel</button>
                <button type="submit" className="enterprise-button enterprise-button-primary" disabled={busy}>
                  {busy ? 'Creating…' : 'Create & Reveal Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
