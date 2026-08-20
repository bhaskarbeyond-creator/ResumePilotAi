import React, { useMemo, useState } from 'react';
import {
  FiShield, FiLock, FiKey, FiPlus, FiTrash2, FiCopy, FiCheck, FiX, FiRotateCcw, FiLayers
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
  const canManageServiceAccounts = hasPermission('tenant.security.manage');

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
                        {canManageServiceAccounts && (
                          <button
                            type="button"
                            className="enterprise-button-icon text-danger"
                            title="Revoke API key"
                            onClick={() => handleRevoke(account.id)}
                          >
                            <FiTrash2 />
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
