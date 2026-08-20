import React, { useState } from 'react';
import {
  FiShield, FiLock, FiKey, FiPlus, FiTrash2, FiCopy,
  FiCheck, FiX, FiAlertTriangle, FiCheckCircle
} from 'react-icons/fi';

const INITIAL_SERVICE_ACCOUNTS = [
  { id: 'sa-1', name: 'Workday HR Integration M2M', prefix: 'rp_sec_live_9f81', scopes: ['resource.read', 'ai.use'], expiresAt: '2027-08-20', status: 'ACTIVE' },
  { id: 'sa-2', name: 'Greenhouse ATS Importer', prefix: 'rp_sec_live_4a12', scopes: ['resource.read', 'resource.create'], expiresAt: '2027-01-15', status: 'ACTIVE' },
];

export default function EnterpriseSecurityTab() {
  const [serviceAccounts, setServiceAccounts] = useState(INITIAL_SERVICE_ACCOUNTS);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saName, setSaName] = useState('');
  const [saScopes, setSaScopes] = useState(['resource.read']);
  const [generatedKey, setGeneratedKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [notification, setNotification] = useState(null);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!saName.trim()) return;
    const randomHex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const plaintext = `rp_sec_live_${randomHex}`;
    const prefix = `rp_sec_live_${randomHex.slice(0, 4)}`;

    const newAccount = {
      id: `sa-${Date.now()}`,
      name: saName.trim(),
      prefix,
      scopes: saScopes,
      expiresAt: '2027-08-20',
      status: 'ACTIVE',
    };

    setServiceAccounts(prev => [newAccount, ...prev]);
    setShowCreateModal(false);
    setGeneratedKey({ plaintext, name: newAccount.name });
    setSaName('');
  };

  const handleRevoke = (id) => {
    setServiceAccounts(prev => prev.filter(sa => sa.id !== id));
    setNotification('Service account API key revoked.');
    setTimeout(() => setNotification(null), 3000);
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

      {/* Security Posture Summary */}
      <div className="enterprise-card">
        <h2 className="enterprise-tab-title">Enterprise Security Center</h2>
        <p className="enterprise-tab-subtitle">Cryptographic identity controls, session governance, and automated policy enforcement</p>

        <div className="enterprise-security-cards-grid">
          <div className="enterprise-card enterprise-sec-item">
            <div className="enterprise-sec-icon text-success"><FiShield /></div>
            <div>
              <strong>Multi-Factor Authentication (MFA)</strong>
              <p>Native TOTP with hardware authenticator support required for all administrators.</p>
              <span className="enterprise-pill enterprise-pill-success">Enforced</span>
            </div>
          </div>

          <div className="enterprise-card enterprise-sec-item">
            <div className="enterprise-sec-icon text-success"><FiLock /></div>
            <div>
              <strong>Database Row Level Security (RLS)</strong>
              <p>FORCE ROW LEVEL SECURITY active with non-bypass runtime role isolation.</p>
              <span className="enterprise-pill enterprise-pill-success">Verified Active</span>
            </div>
          </div>

          <div className="enterprise-card enterprise-sec-item">
            <div className="enterprise-sec-icon text-success"><FiKey /></div>
            <div>
              <strong>Cryptographic Job & Storage Tokens</strong>
              <p>HMAC-SHA256 authenticated envelopes with worker-time membership verification.</p>
              <span className="enterprise-pill enterprise-pill-success">Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Service Accounts & API Keys */}
      <div className="enterprise-card" style={{ marginTop: '1.5rem' }}>
        <div className="enterprise-card-header-flex">
          <div>
            <h3 className="enterprise-card-title">Service Accounts & M2M API Keys</h3>
            <p className="enterprise-card-subtitle">Machine-to-machine integration tokens with granular permission scopes and expiration bounds</p>
          </div>
          <button
            type="button"
            className="enterprise-button enterprise-button-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <FiPlus aria-hidden="true" /> Create Service Account
          </button>
        </div>

        <div className="enterprise-table-wrapper">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Service Account Name</th>
                <th>Key Prefix</th>
                <th>Permission Scopes</th>
                <th>Expires</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {serviceAccounts.map(sa => (
                <tr key={sa.id}>
                  <td><strong>{sa.name}</strong></td>
                  <td><code>{sa.prefix}••••••••</code></td>
                  <td>
                    {sa.scopes.map(s => (
                      <span key={s} className="enterprise-pill enterprise-pill-secondary" style={{ marginRight: '0.25rem' }}>
                        {s}
                      </span>
                    ))}
                  </td>
                  <td><small>{sa.expiresAt}</small></td>
                  <td><span className="enterprise-pill enterprise-pill-success">{sa.status}</span></td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="enterprise-button-icon text-danger"
                      title="Revoke API Key"
                      onClick={() => handleRevoke(sa.id)}
                    >
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Service Account Modal */}
      {showCreateModal && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setShowCreateModal(false)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Create Service Account API Key</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setShowCreateModal(false)}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="enterprise-modal-body">
                <div className="enterprise-form-group">
                  <label htmlFor="sa-name">Service Account Identifier / Name</label>
                  <input
                    id="sa-name"
                    type="text"
                    required
                    placeholder="e.g. CI/CD Resume Exporter Bot"
                    value={saName}
                    onChange={(e) => setSaName(e.target.value)}
                    className="enterprise-input"
                    autoFocus
                  />
                </div>
                <div className="enterprise-form-group">
                  <label>Allowed Scopes</label>
                  <div className="enterprise-checkbox-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={saScopes.includes('resource.read')}
                        onChange={() => setSaScopes(prev => prev.includes('resource.read') ? prev.filter(x => x !== 'resource.read') : [...prev, 'resource.read'])}
                      />
                      <code>resource.read</code> (Read-only document access)
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={saScopes.includes('resource.create')}
                        onChange={() => setSaScopes(prev => prev.includes('resource.create') ? prev.filter(x => x !== 'resource.create') : [...prev, 'resource.create'])}
                      />
                      <code>resource.create</code> (Create documents & exports)
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={saScopes.includes('ai.use')}
                        onChange={() => setSaScopes(prev => prev.includes('ai.use') ? prev.filter(x => x !== 'ai.use') : [...prev, 'ai.use'])}
                      />
                      <code>ai.use</code> (Generate AI summaries & bullet points)
                    </label>
                  </div>
                </div>
              </div>
              <div className="enterprise-modal-footer">
                <button
                  type="button"
                  className="enterprise-button enterprise-button-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="enterprise-button enterprise-button-primary"
                >
                  Generate Secret Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* One-Time Key Reveal Modal */}
      {generatedKey && (
        <div className="enterprise-modal-backdrop" role="presentation">
          <div className="enterprise-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3 className="text-warning"><FiAlertTriangle /> Save Your Secret API Key</h3>
            </div>
            <div className="enterprise-modal-body">
              <p>Please copy your API key now. For your security, this key will <strong>never be shown again</strong>.</p>
              <div className="enterprise-secret-box">
                <code>{generatedKey.plaintext}</code>
                <button
                  type="button"
                  className="enterprise-button enterprise-button-secondary"
                  onClick={handleCopy}
                >
                  {copied ? <FiCheck className="text-success" /> : <FiCopy />} {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="enterprise-modal-footer">
              <button
                type="button"
                className="enterprise-button enterprise-button-primary"
                onClick={() => setGeneratedKey(null)}
              >
                I have safely stored this key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
