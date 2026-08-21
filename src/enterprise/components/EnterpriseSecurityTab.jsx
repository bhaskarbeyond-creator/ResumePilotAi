import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiShield, FiLock, FiKey, FiPlus, FiTrash2, FiCopy, FiCheck, FiX, FiRotateCcw, FiLayers, FiRefreshCw
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import HelpTooltip from './HelpTooltip';
import EnterpriseConfirmModal from './EnterpriseConfirmModal';

// Scopes a tenant admin can grant to M2M keys. The server re-validates every
// scope against its allowlist; anything unknown is dropped at creation time.
const DATA_PLANE_SCOPES = [
  { id: 'resource.read', hint: 'List and read resumes/resources' },
  { id: 'resource.create', hint: 'Create resumes/resources' },
  { id: 'resource.update', hint: 'Update and delete resources' },
  { id: 'ai.use', hint: 'Tenant AI generation (shares tenant quota)' },
];
const READONLY_GOVERNANCE_SCOPES = [
  { id: 'workspace.read', hint: 'List workspaces/teams' },
  { id: 'tenant.read', hint: 'Tenant profile, configuration, queue and metrics reads' },
  { id: 'tenant.usage.read', hint: 'AI usage dashboards and history' },
  { id: 'tenant.audit.read', hint: 'Audit trail reads' },
];

const JOB_STATUS_FILTERS = ['ALL', 'QUEUED', 'RETRYING', 'DEAD_LETTER', 'REJECTED', 'COMPLETED'];

function DurableJobsCard({ focused = false }) {
  const { request, hasPermission } = useTenantApi();
  const [statusFilter, setStatusFilter] = useState('ALL');
  const cardRef = useRef(null);
  const [confirmConfig, setConfirmConfig] = useState(null);

  // Cross-module deep link (?focus=jobs): Overview's DLQ recommendation and
  // the command palette land directly on this panel.
  useEffect(() => {
    if (focused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focused]);
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

  const handleReplay = (jobId) => {
    setConfirmConfig({
      title: 'Replay Dead-Letter Job',
      message: 'Replay this dead-letter job back into the durable queue with a fresh attempt budget?',
      confirmLabel: 'Replay Job',
      variant: 'primary',
      onConfirm: async () => {
        setConfirmConfig(null);
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
      }
    });
  };

  return (
    <div ref={cardRef} className={`enterprise-card ${focused ? 'enterprise-focus-target' : ''}`} style={{ marginTop: '1.5rem' }} id="durable-jobs">
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

      {confirmConfig && (
        <EnterpriseConfirmModal
          isOpen={!!confirmConfig}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          cancelLabel={confirmConfig.cancelLabel}
          variant={confirmConfig.variant}
          busy={!!busyId}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(null)}
        />
      )}
    </div>
  );
}

export default function EnterpriseSecurityTab({ initialParams = null }) {
  const { request, hasPermission, context } = useTenantApi();
  const [accountsState, refreshAccounts] = useAsyncResource(
    () => request('/api/enterprise/service-accounts'),
    [request],
  );
  const [configState] = useAsyncResource(() => request('/api/enterprise/configuration'), [request]);
  const [planeState] = useAsyncResource(() => request('/api/enterprise/data-plane/status'), [request]);
  const { loading, error, data } = accountsState;
  const [showCreateModal, setShowCreateModal] = useState(initialParams?.get?.('create') === '1');
  const [saName, setSaName] = useState('');
  const [saScopes, setSaScopes] = useState(['resource.read']);
  const [saScope, setSaScope] = useState('WORKSPACE');
  const canCreateTenantScoped = context?.workspaceScope === 'TENANT';
  const [busy, setBusy] = useState(false);
  const [rotatingId, setRotatingId] = useState(null);
  const [generatedKey, setGeneratedKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState(null);

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
        body: { displayName: saName.trim(), scopes: saScopes, scope: saScope },
      });
      setShowCreateModal(false);
      setGeneratedKey({ plaintext: created.apiKey, name: created.serviceAccount.displayName });
      setSaName('');
      setSaScopes(['resource.read']);
      setSaScope('WORKSPACE');
      refreshAccounts();
    } catch (err) {
      setActionError(err?.message || 'Service account could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = (id) => {
    const account = serviceAccounts.find(a => a.id === id);
    const saTitle = account?.displayName || (id.length > 12 ? `${id.slice(0, 10)}…` : id);
    setConfirmConfig({
      title: 'Revoke Service Account API Key',
      message: `Revoke the API key for service account "${saTitle}" immediately? Existing machine integrations using this credential will stop working on their next request.`,
      confirmLabel: 'Revoke Key',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmConfig(null);
        setActionError(null);
        try {
          await request(`/api/enterprise/service-accounts/${id}/revoke`, { method: 'POST' });
          notify(`API key revoked for "${saTitle}".`);
          refreshAccounts();
        } catch (err) {
          setActionError(err?.message || 'Service account could not be revoked.');
        }
      }
    });
  };

  const handleRotate = (account) => {
    setConfirmConfig({
      title: 'Rotate Service Account Key',
      message: `Rotate the API key for "${account.displayName}"? The current key stops working immediately and a replacement is revealed exactly once.`,
      confirmLabel: 'Rotate & Generate New Key',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmConfig(null);
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
      }
    });
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
        <h3 className="enterprise-card-title">
          <FiShield aria-hidden="true" /> Security Posture
          <HelpTooltip text="Live server-enforced security controls, MFA requirements, session lifetimes, and cryptographic validation" />
        </h3>
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
              <strong>First-Class M2M Authentication</strong>
              <p>Service keys authenticate the operational APIs directly via <code>x-api-key</code> — resources, AI, usage and audit — with server-side scopes, per-key rate limiting, instant rotation/revocation. Plaintext secrets are returned exactly once.</p>
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
            <h3 className="enterprise-card-title">
              Service Accounts & M2M API Keys
              <HelpTooltip text="Machine-to-machine scoped API tokens for automated CI/CD pipelines, background daemons, and microservices" />
            </h3>
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
                        <td>
                          <span className={`enterprise-pill ${account.scope === 'TENANT' ? 'enterprise-pill-warning' : 'enterprise-pill-secondary'}`} title={account.scope === 'TENANT' ? 'Tenant-scoped: spans all workspaces' : 'Pinned to a single workspace'}>
                            {account.scope === 'TENANT' ? 'TENANT' : 'WORKSPACE'}
                          </span>
                          <br /><small className="text-muted">{account.workspaceId ? String(account.workspaceId).slice(0, 8) : 'all workspaces'}</small>
                        </td>
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
                  <label>Account Scope</label>
                  <div className="enterprise-checkbox-list">
                    <label className="enterprise-checkbox">
                      <input type="radio" name="sa-scope" checked={saScope === 'WORKSPACE'} onChange={() => setSaScope('WORKSPACE')} />
                      <span><strong>Workspace-scoped</strong> <small className="text-muted">· key is pinned to one workspace (recommended, least privilege)</small></span>
                    </label>
                    <label className="enterprise-checkbox" style={{ opacity: canCreateTenantScoped ? 1 : 0.55 }}>
                      <input type="radio" name="sa-scope" checked={saScope === 'TENANT'} onChange={() => canCreateTenantScoped && setSaScope('TENANT')} disabled={!canCreateTenantScoped} />
                      <span><strong>Tenant-scoped</strong> <small className="text-muted">· key spans every workspace in the tenant{canCreateTenantScoped ? '' : ' (tenant administrators only)'}</small></span>
                    </label>
                  </div>
                </div>
                <div className="enterprise-form-group">
                  <label>API Scopes <small className="text-muted">(server-enforced; unknown scopes are rejected)</small></label>
                  <div className="enterprise-checkbox-list">
                    {DATA_PLANE_SCOPES.map(scope => (
                      <label key={scope.id} className="enterprise-checkbox">
                        <input
                          type="checkbox"
                          checked={saScopes.includes(scope.id)}
                          onChange={() => toggleScope(scope.id)}
                        />
                        <span><code>{scope.id}</code> <small className="text-muted">· {scope.hint}</small></span>
                      </label>
                    ))}
                    {READONLY_GOVERNANCE_SCOPES.map(scope => (
                      <label key={scope.id} className="enterprise-checkbox">
                        <input
                          type="checkbox"
                          checked={saScopes.includes(scope.id)}
                          onChange={() => toggleScope(scope.id)}
                        />
                        <span><code>{scope.id}</code> <small className="text-muted">· {scope.hint}</small></span>
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

      <div className="enterprise-card" style={{ marginTop: '1.5rem' }}>
        <h3 className="enterprise-card-title">
          <FiKey aria-hidden="true" /> M2M Integration Quick Reference
          <HelpTooltip text="Exact request shape for machine clients. Tenant and workspace are resolved from the key server-side; client-supplied identifiers can only restrict, never expand." />
        </h3>
        <p className="enterprise-card-subtitle">Send exactly one credential per request — an <code>x-api-key</code> header, without a bearer token</p>
        <pre style={{ background: 'var(--enterprise-surface)', border: '1px solid var(--enterprise-border)', borderRadius: 'var(--enterprise-radius-md)', padding: '14px 16px', overflowX: 'auto', fontSize: '0.82rem', lineHeight: 1.5 }} aria-label="M2M request example">
{`curl -H "x-api-key: rpa_your_key_here" \\
     "${typeof window !== 'undefined' ? window.location.origin : ''}/api/enterprise/resources"

# Verified endpoints for service keys (scope-gated):
#   GET/POST        /api/enterprise/resources          resource.read / resource.create
#   GET/PATCH/DEL   /api/enterprise/resources/:id      resource.read / resource.update
#   POST            /api/enterprise/ai/generate-content ai.use
#   GET             /api/enterprise/usage/ai           tenant.usage.read
#   GET             /api/enterprise/audit              tenant.audit.read
#   GET             /api/enterprise/workspaces         workspace.read
#   GET             /api/enterprise/m2m/context        (any valid key)`}
        </pre>
        <p className="text-muted" style={{ fontSize: '0.82rem', marginTop: '0.5rem' }}>
          Invalid, revoked or rotated keys return <code>401</code>; missing scopes return <code>403</code>; control-plane endpoints always return <code>403 M2M_OPERATION_NOT_PERMITTED</code> for service keys. Requests are rate-limited per service account.
        </p>
      </div>

      <DurableJobsCard focused={initialParams?.get?.('focus') === 'jobs'} />

      {confirmConfig && (
        <EnterpriseConfirmModal
          isOpen={!!confirmConfig}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          cancelLabel={confirmConfig.cancelLabel}
          variant={confirmConfig.variant}
          busy={busy || !!rotatingId}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(null)}
        />
      )}
    </div>
  );
}
