import React, { useMemo, useState } from 'react';
import {
  FiShield, FiLock, FiKey, FiPlus, FiTrash2, FiCopy, FiCheck, FiX, FiRotateCcw, FiLayers, FiRefreshCw
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

const SCOPE_OPTIONS = ['resource.read', 'resource.create', 'resource.update', 'ai.use'];

const JOB_STATUS_FILTERS = ['ALL', 'QUEUED', 'RETRYING', 'DEAD_LETTER', 'REJECTED', 'COMPLETED'];

function DurableJobsCard() {
  const { request, hasPermission } = useTenantApi();
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [jobsState, refreshJobs] = useAsyncResource(
    () => request(`/api/enterprise/queue/jobs${statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''}`),
    [request, statusFilter],
  );
  const [queueStatus] = useAsyncResource(() => request('/api/enterprise/queue/status'), [request]);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const jobs = useMemo(() => (Array.isArray(jobsState?.data?.jobs) ? jobsState.data.jobs : []), [jobsState]);
  const canReplay = hasPermission('tenant.settings.write');
  const engine = queueStatus?.data?.queue || {};

  const handleReplay = async (jobId) => {
    if (!window.confirm('Replay this dead-letter job back into the durable queue with a fresh attempt budget?')) return;
    setBusyId(jobId);
    setActionError(null);
    try {
      await request('/api/enterprise/queue/replay', { method: 'POST', body: { jobId } });
      refreshJobs();
    } catch (err) {
      setActionError(err?.message || 'Job could not be replayed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="enterprise-card" style={{ marginTop: '1.5rem' }}>
      <div className="enterprise-card-header-flex">
        <div>
          <h2 className="enterprise-tab-title"><FiLayers aria-hidden="true" /> Durable Jobs & Dead Letters</h2>
          <p className="enterprise-tab-subtitle">
            {engine.engine === 'firestore-durable-outbox'
              ? 'Firestore-backed outbox with signed envelopes, lease-based workers, retries, and DLQ'
              : 'Durable queue status unavailable'}
          </p>
        </div>
        <span className={`enterprise-pill ${engine.healthy === true ? 'enterprise-pill-success' : 'enterprise-pill-warning'}`}>
          {engine.healthy === true ? 'Durable · Online' : engine.configured === false ? 'Not configured' : 'Misconfigured'}
        </span>
      </div>

      <div className="enterprise-inline-actions" style={{ margin: '0.75rem 0', flexWrap: 'wrap', gap: '0.5rem' }} role="group" aria-label="Filter jobs by status">
        {JOB_STATUS_FILTERS.map(filter => (
          <button
            key={filter}
            type="button"
            className={`enterprise-button enterprise-button-sm ${statusFilter === filter ? 'enterprise-button-primary' : 'enterprise-button-secondary'}`}
            aria-pressed={statusFilter === filter}
            onClick={() => setStatusFilter(filter)}
          >
            {filter === 'ALL' ? 'All jobs' : filter.replace('_', ' ')}
          </button>
        ))}
      </div>

      {actionError && (
        <div role="alert" className="enterprise-error-row" style={{ marginBottom: '0.75rem' }}>
          <span className="enterprise-error-icon" aria-hidden="true">⚠</span>
          <span className="text-muted">{actionError}</span>
        </div>
      )}

      <DataState loading={jobsState.loading} error={jobsState.error} onRetry={refreshJobs}>
        {jobs.length === 0 ? (
          <p className="enterprise-empty">No jobs in this state for the active tenant.</p>
        ) : (
          <div className="enterprise-table-wrap" role="region" aria-label="Durable jobs">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Status</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Last outcome</th>
                  <th scope="col">{canReplay ? 'Actions' : ''}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.jobId}>
                    <td><code title={job.jobId}>{job.jobType}</code><br /><small className="text-muted">{String(job.correlationId || '').slice(0, 14)}…</small></td>
                    <td>
                      <span className={`enterprise-pill ${job.status === 'DEAD_LETTER' || job.status === 'REJECTED' ? 'enterprise-pill-warning' : ''}`}>
                        {job.status}
                      </span>
                    </td>
                    <td>{job.attemptCount}/{job.maxAttempts}</td>
                    <td className="text-muted" style={{ maxWidth: '280px' }}>
                      {job.rejectedReason || job.lastError || '—'}
                    </td>
                    <td>
                      {canReplay && job.status === 'DEAD_LETTER' && (
                        <button
                          type="button"
                          className="enterprise-button enterprise-button-secondary enterprise-button-sm"
                          onClick={() => handleReplay(job.jobId)}
                          disabled={busyId === job.jobId}
                        >
                          <FiRotateCcw aria-hidden="true" /> {busyId === job.jobId ? 'Replaying…' : 'Replay'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataState>
    </div>
  );
}

export default function EnterpriseSecurityTab() {
  const { request, hasPermission } = useTenantApi();
  const [accountsState, refreshAccounts] = useAsyncResource(
    () => request('/api/enterprise/service-accounts'),
    [request],
  );
  const [configState] = useAsyncResource(() => request('/api/enterprise/configuration'), [request]);
  const [planeState] = useAsyncResource(() => request('/api/enterprise/data-plane/status'), [request]);
  const { loading, error, data } = accountsState;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saName, setSaName] = useState('');
  const [saScopes, setSaScopes] = useState(['resource.read']);
  const [busy, setBusy] = useState(false);
  const [rotatingId, setRotatingId] = useState(null);
  const [generatedKey, setGeneratedKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);

  const serviceAccounts = useMemo(() => (Array.isArray(data?.serviceAccounts) ? data.serviceAccounts : []), [data]);
  const canManageServiceAccounts = hasPermission('tenant.security.manage');

  // Real security posture from the revisioned tenant configuration and the
  // live data-plane description — never synthesized.
  const posture = useMemo(() => {
    const configuration = configState.data?.configuration || null;
    const plane = planeState.data?.dataPlane || null;
    return {
      loaded: !configState.loading && !planeState.loading,
      requireMfaForAdmins: configuration?.securityPolicy?.requireMfaForAdmins === true,
      sessionMaxMinutes: configuration?.identityPolicy?.sessionMaxMinutes ?? null,
      ssoMode: String(configuration?.identityPolicy?.ssoMode || 'NONE').toUpperCase(),
      supportApproval: configuration?.securityPolicy?.supportAccessRequiresApproval !== false,
      encryption: plane?.encryption || 'none',
      encryptionLevel: plane?.encryptionSecurityLevel || null,
      dataPlaneConfigured: plane?.configured === true,
    };
  }, [configState, planeState]);

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

  const handleRotate = async (account) => {
    if (!window.confirm(`Rotate the API key for "${account.displayName}"? The current key stops working immediately and a replacement is shown exactly once.`)) return;
    setRotatingId(account.id);
    setActionError(null);
    try {
      const rotated = await request(`/api/enterprise/service-accounts/${encodeURIComponent(account.id)}/rotate`, { method: 'POST' });
      setGeneratedKey({ plaintext: rotated.apiKey, name: `${rotated.serviceAccount.displayName} (rotated)` });
      notify(`API key rotated for "${rotated.serviceAccount.displayName}". The previous key is now invalid.`);
      refreshAccounts();
    } catch (err) {
      setActionError(err?.message || 'Service account key could not be rotated.');
    } finally {
      setRotatingId(null);
    }
  };

  const handleCopy = async () => {
    if (!generatedKey?.plaintext) return;
    try {
      await navigator.clipboard.writeText(generatedKey.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setActionError('Clipboard access is unavailable. Copy the secret manually before closing this panel.');
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
        <div className="enterprise-card" role="alert" style={{ border: '2px solid var(--enterprise-primary-active)', background: 'var(--enterprise-primary-soft)' }}>
          <h3 className="enterprise-card-title">API Key Generated — Save It Now</h3>
          <p className="enterprise-card-subtitle" style={{ color: 'var(--enterprise-ink)' }}>
            The plaintext secret for <strong>{generatedKey.name}</strong> is shown exactly once and is never stored. Copy it before closing this panel.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--enterprise-surface)', border: '1px solid var(--enterprise-border)', borderRadius: 'var(--enterprise-radius-md)', padding: '16px', marginTop: '16px', marginBottom: '20px' }}>
            <code style={{ flex: 1, fontSize: '1.1rem', color: 'var(--enterprise-ink)', fontFamily: 'monospace', wordBreak: 'break-all', userSelect: 'all' }}>
              {generatedKey.plaintext}
            </code>
            <button type="button" className={`enterprise-button ${copied ? 'enterprise-button-success' : 'enterprise-button-primary'}`} onClick={handleCopy} style={{ marginLeft: '16px', whiteSpace: 'nowrap' }} title="Copy API key to clipboard">
              {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />} {copied ? 'Copied to Clipboard' : 'Copy Secret'}
            </button>
          </div>
          <button type="button" className="enterprise-button enterprise-button-secondary" onClick={() => setGeneratedKey(null)}>
            <FiX aria-hidden="true" /> I have saved the key securely
          </button>
        </div>
      )}

      <div className="enterprise-card">
        <h3 className="enterprise-card-title"><FiShield aria-hidden="true" /> Security Posture</h3>
        <p className="enterprise-card-subtitle">Live policy state — every value is enforced server-side at enterprise context resolution</p>
        <ul className="enterprise-health-list">
          <li className="enterprise-health-item">
            <div className={`enterprise-health-status ${posture.loaded ? (posture.requireMfaForAdmins ? 'online' : 'checking') : 'checking'}`} />
            <div className="enterprise-health-copy">
              <strong>Administrator MFA</strong>
              <small>{posture.requireMfaForAdmins ? 'Required — administrators must sign in with a second factor' : 'Not required — administrators may sign in with a single factor'}</small>
            </div>
            <span className={`enterprise-pill ${posture.requireMfaForAdmins ? 'enterprise-pill-success' : 'enterprise-pill-warning'}`}>
              {posture.requireMfaForAdmins ? 'Enforced' : 'Optional'}
            </span>
          </li>
          <li className="enterprise-health-item">
            <div className="enterprise-health-status online" />
            <div className="enterprise-health-copy">
              <strong>Session Policy</strong>
              <small>Administrator sessions are re-authenticated after {posture.sessionMaxMinutes ?? '—'} minutes (enforced from the verified token auth_time claim)</small>
            </div>
            <span className="enterprise-pill enterprise-pill-success">Enforced</span>
          </li>
          <li className="enterprise-health-item">
            <div className={`enterprise-health-status ${posture.loaded ? (posture.ssoMode === 'NONE' ? 'checking' : 'online') : 'checking'}`} />
            <div className="enterprise-health-copy">
              <strong>Identity Federation (SSO)</strong>
              <small>{posture.ssoMode === 'NONE'
                ? 'Not configured — Firebase email/password and social sign-ins are accepted'
                : `${posture.ssoMode} required — non-federated sign-ins are rejected at enterprise context resolution`}</small>
            </div>
            <span className={`enterprise-pill ${posture.ssoMode === 'NONE' ? 'enterprise-pill-secondary' : 'enterprise-pill-success'}`}>
              {posture.ssoMode === 'NONE' ? 'Password allowed' : `${posture.ssoMode} enforced`}
            </span>
          </li>
          <li className="enterprise-health-item">
            <div className={`enterprise-health-status ${posture.dataPlaneConfigured ? 'online' : 'offline'}`} />
            <div className="enterprise-health-copy">
              <strong>Payload Encryption</strong>
              <small>{posture.encryption === 'server-key'
                ? 'Server-key AES-256-GCM sealing of confidential tenant payloads'
                : posture.encryption === 'unavailable'
                  ? `Encryption provider unavailable (${posture.encryptionLevel || 'fail closed'}) — confidential payload operations are refused`
                  : 'No encryption provider configured — confidential payload operations fail closed'}</small>
            </div>
            <span className={`enterprise-pill ${posture.encryption === 'server-key' ? 'enterprise-pill-success' : 'enterprise-pill-warning'}`}>
              {posture.encryption === 'server-key' ? 'ServerKey AES-256-GCM' : posture.encryption || 'none'}
            </span>
          </li>
          <li className="enterprise-health-item">
            <div className={`enterprise-health-status ${posture.supportApproval ? 'online' : 'checking'}`} />
            <div className="enterprise-health-copy">
              <strong>Break-Glass Scope Policy</strong>
              <small>{posture.supportApproval
                ? 'Support grants are restricted to read-only diagnostic scopes'
                : 'Repair (write) scopes are additionally permitted for support grants — this is a recorded tenant decision'}</small>
            </div>
            <span className={`enterprise-pill ${posture.supportApproval ? 'enterprise-pill-success' : 'enterprise-pill-warning'}`}>
              {posture.supportApproval ? 'Diagnostic scopes only' : 'Repair scopes allowed'}
            </span>
          </li>
        </ul>
      </div>

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
          {canManageServiceAccounts && (
            <button
              type="button"
              className="enterprise-button enterprise-button-primary"
              onClick={() => setShowCreateModal(true)}
            >
              <FiPlus aria-hidden="true" /> Create Service Account
            </button>
          )}
        </div>

        <DataState loading={loading} error={error} onRetry={refreshAccounts}>
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
                    <th>Key</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceAccounts.map(account => {
                    const expired = account.expiresAt && new Date(account.expiresAt).getTime() <= Date.now();
                    const expiringSoon = !expired && account.expiresAt && (new Date(account.expiresAt).getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000;
                    return (
                      <tr key={account.id}>
                        <td><strong>{account.displayName}</strong><br /><small>{String(account.id).slice(0, 12)}…</small></td>
                        <td><small>{account.workspaceId ? String(account.workspaceId).slice(0, 8) : '—'}</small></td>
                        <td>{Array.isArray(account.scopes) ? account.scopes.map(s => <span key={s} className="enterprise-pill enterprise-pill-secondary">{s}</span>) : <small>—</small>}</td>
                        <td>
                          <code 
                            className="text-muted" 
                            title={account.apiKeyId ? `Key ID: ${account.apiKeyId}` : 'No Key ID'}
                            style={{ background: 'var(--enterprise-surface-hover)', padding: '4px 8px', borderRadius: '4px', cursor: 'help', display: 'inline-block', border: '1px solid var(--enterprise-border)' }}
                          >
                            {account.apiKeyPrefix ? `${account.apiKeyPrefix}••••••••••••••••` : '—'}
                          </code>
                          <br />
                          {expired ? (
                            <span className="enterprise-pill enterprise-pill-danger">expired</span>
                          ) : expiringSoon ? (
                            <span className="enterprise-pill enterprise-pill-warning">expiring soon</span>
                          ) : account.expiresAt ? (
                            <small>{new Date(account.expiresAt).toLocaleDateString()}</small>
                          ) : (
                            <small className="text-muted">no expiry</small>
                          )}
                        </td>
                        <td><span className="enterprise-pill enterprise-pill-success">{account.status}</span></td>
                        <td className="text-right">
                          {canManageServiceAccounts && (
                            <div className="enterprise-table-actions" style={{ justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="enterprise-button-icon"
                                title="Rotate API key (old key stops working immediately)"
                                disabled={rotatingId === account.id}
                                onClick={() => handleRotate(account)}
                              >
                                {rotatingId === account.id ? <FiRefreshCw className="enterprise-spin" /> : <FiRefreshCw />}
                              </button>
                              <button
                                type="button"
                                className="enterprise-button-icon text-danger"
                                title="Revoke API key"
                                onClick={() => handleRevoke(account.id)}
                              >
                                <FiTrash2 />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
                <button type="submit" className="enterprise-button enterprise-button-primary" disabled={busy || saScopes.length === 0}>
                  {busy ? 'Creating…' : 'Create & Reveal Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DurableJobsCard />
    </div>
  );
}
