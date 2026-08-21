import React, { useMemo, useState } from 'react';
import {
  FiServer, FiPlus, FiRefreshCw, FiCheck, FiX, FiShieldOff, FiPlay, FiSearch
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import HelpTooltip from './HelpTooltip';
import EnterpriseConfirmModal from './EnterpriseConfirmModal';

/**
 * Platform administration console.
 *
 * This is the separate administrative layer over the tenant registry itself.
 * Access is decided by the server (platform provisioner capability returned by
 * /context and enforced on every /platform route); tenant administrators never
 * see this surface.
 */
export default function EnterprisePlatformTab() {
  const { request } = useTenantApi();
  const [tenantsState, refreshTenants] = useAsyncResource(() => request('/api/enterprise/platform/tenants'), [request]);
  const { loading, error, data } = tenantsState;
  const [searchQuery, setSearchQuery] = useState('');
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [isolationTier, setIsolationTier] = useState('STANDARD');
  const [busy, setBusy] = useState(false);
  const [busyTenant, setBusyTenant] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState(null);

  const tenants = useMemo(() => {
    const list = Array.isArray(data?.tenants) ? data.tenants : [];
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(t => (t.displayName || '').toLowerCase().includes(q) || (t.slug || '').toLowerCase().includes(q));
  }, [data, searchQuery]);

  const stateCounts = useMemo(() => {
    const list = Array.isArray(data?.tenants) ? data.tenants : [];
    const counts = { TOTAL: list.length, ACTIVE: 0, SUSPENDED: 0, OTHER: 0 };
    for (const tenant of list) {
      if (tenant.lifecycleState === 'ACTIVE') counts.ACTIVE += 1;
      else if (tenant.lifecycleState === 'SUSPENDED') counts.SUSPENDED += 1;
      else counts.OTHER += 1;
    }
    return counts;
  }, [data]);

  const notify = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleLifecycle = (tenant, nextState) => {
    const verb = nextState === 'SUSPENDED' ? 'Suspend' : 'Reactivate';
    setConfirmConfig({
      title: `${verb} Tenant`,
      message: `${verb} tenant "${tenant.displayName}" (${tenant.slug})? ${nextState === 'SUSPENDED' ? 'All members and service accounts of this tenant immediately lose access.' : 'Members regain access immediately.'}`,
      confirmLabel: `${verb} Tenant`,
      variant: nextState === 'SUSPENDED' ? 'danger' : 'primary',
      onConfirm: async () => {
        setConfirmConfig(null);
        setBusyTenant(`${tenant.id}:${nextState}`);
        setActionError(null);
        try {
          await request(`/api/enterprise/platform/tenants/${encodeURIComponent(tenant.id)}/${nextState === 'SUSPENDED' ? 'suspend' : 'reactivate'}`, { method: 'POST' });
          notify(`Tenant "${tenant.displayName}" is now ${nextState.toLowerCase()}.`);
          refreshTenants();
        } catch (err) {
          setActionError(err?.message || `Tenant could not be ${verb.toLowerCase()}d.`);
        } finally {
          setBusyTenant(null);
        }
      }
    });
  };

  const handleProvision = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const created = await request('/api/enterprise/tenants', {
        method: 'POST',
        body: { displayName: displayName.trim(), slug: slug.trim().toLowerCase(), isolationTier },
      });
      notify(`Tenant "${created.tenant?.displayName || displayName.trim()}" provisioned (${created.tenant?.isolationTier || isolationTier}).`);
      setShowProvisionModal(false);
      setDisplayName('');
      setSlug('');
      setIsolationTier('STANDARD');
      refreshTenants();
    } catch (err) {
      setActionError(err?.message || 'Tenant could not be provisioned.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="enterprise-tab-content">
      {notification && (
        <div className="enterprise-toast enterprise-toast-success"><FiCheck aria-hidden="true" /> {notification}</div>
      )}
      {actionError && (
        <div className="enterprise-card" role="alert">
          <div className="enterprise-error-row">
            <span className="enterprise-error-icon" aria-hidden="true">⚠</span>
            <div><strong>Platform action failed</strong><p className="text-muted">{actionError}</p></div>
          </div>
        </div>
      )}

      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">
              <FiServer aria-hidden="true" /> Platform Administration
              <HelpTooltip text="Centralized multi-tenant provisioning registry, tenant lifecycle controls, and isolation tier management" />
            </h2>
            <p className="enterprise-tab-subtitle">
              Centralized registry of every enterprise tenant. This layer is separate from tenant administration and gated on the platform provisioner capability.
            </p>
          </div>
          <div className="enterprise-inline-actions" style={{ gap: '0.5rem' }}>
            <button type="button" className="enterprise-button enterprise-button-secondary" onClick={refreshTenants}>
              <FiRefreshCw aria-hidden="true" /> Refresh
            </button>
            <button type="button" className="enterprise-button enterprise-button-primary" onClick={() => setShowProvisionModal(true)}>
              <FiPlus aria-hidden="true" /> Provision Tenant
            </button>
          </div>
        </div>

        <div className="enterprise-metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', margin: '24px 0' }}>
          <div className="enterprise-card enterprise-metric-box">
            <div className="enterprise-metric-header"><span>Total Tenants</span><FiServer className="enterprise-metric-icon" aria-hidden="true" /></div>
            <div className="enterprise-metric-value">{loading ? '…' : (tenantsState.data?.tenants?.length ?? 0)}</div>
            <div className="enterprise-metric-footer text-success">Platform registry</div>
          </div>
          <div className="enterprise-card enterprise-metric-box">
            <div className="enterprise-metric-header"><span>Active</span><FiPlay className="enterprise-metric-icon" aria-hidden="true" /></div>
            <div className="enterprise-metric-value">{loading ? '…' : stateCounts.ACTIVE}</div>
            <div className="enterprise-metric-footer text-success">Serving members</div>
          </div>
          <div className="enterprise-card enterprise-metric-box">
            <div className="enterprise-metric-header"><span>Suspended</span><FiShieldOff className="enterprise-metric-icon" aria-hidden="true" /></div>
            <div className="enterprise-metric-value">{loading ? '…' : stateCounts.SUSPENDED}</div>
            <div className="enterprise-metric-footer text-muted">Access frozen</div>
          </div>
          <div className="enterprise-card enterprise-metric-box">
            <div className="enterprise-metric-header"><span>Other States</span><FiRefreshCw className="enterprise-metric-icon" aria-hidden="true" /></div>
            <div className="enterprise-metric-value">{loading ? '…' : stateCounts.OTHER}</div>
            <div className="enterprise-metric-footer text-muted">Provisioning / deleting</div>
          </div>
        </div>

        <div className="enterprise-filter-bar" style={{ marginBottom: '16px' }}>
          <div className="enterprise-search-wrapper" style={{ flex: 1 }}>
            <FiSearch className="enterprise-search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search tenants by name, slug, or id…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="enterprise-input"
              aria-label="Search tenants"
            />
          </div>
        </div>

        <DataState loading={loading} error={error} onRetry={refreshTenants}>
          {tenants.length === 0 ? (
            <p className="enterprise-empty">No tenants match this view.</p>
          ) : (
            <div className="enterprise-table-wrapper">
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Slug</th>
                    <th>Isolation Tier</th>
                    <th>Region</th>
                    <th>Lifecycle</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(tenant => (
                    <tr key={tenant.id}>
                      <td>
                        <div className="enterprise-user-cell">
                          <div className="enterprise-avatar"><FiServer /></div>
                          <div>
                            <strong>{tenant.displayName}</strong>
                            <small>{String(tenant.id).slice(0, 12)}…</small>
                          </div>
                        </div>
                      </td>
                      <td><code>{tenant.slug}</code></td>
                      <td><span className="enterprise-pill enterprise-pill-secondary">{tenant.isolationTier}</span></td>
                      <td><small>{tenant.region || 'default'}</small></td>
                      <td>
                        <span className={`enterprise-pill enterprise-pill-${tenant.lifecycleState === 'ACTIVE' ? 'success' : (tenant.lifecycleState === 'SUSPENDED' ? 'warning' : 'secondary')}`}>
                          {tenant.lifecycleState}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="enterprise-table-actions" style={{ justifyContent: 'flex-end' }}>
                          {tenant.lifecycleState === 'ACTIVE' ? (
                            <button
                              type="button"
                              className="enterprise-button enterprise-button-danger enterprise-button-sm"
                              disabled={busyTenant === `${tenant.id}:SUSPENDED`}
                              onClick={() => handleLifecycle(tenant, 'SUSPENDED')}
                            >
                              <FiShieldOff aria-hidden="true" /> {busyTenant === `${tenant.id}:SUSPENDED` ? 'Suspending…' : 'Suspend'}
                            </button>
                          ) : tenant.lifecycleState === 'SUSPENDED' ? (
                            <button
                              type="button"
                              className="enterprise-button enterprise-button-secondary enterprise-button-sm"
                              disabled={busyTenant === `${tenant.id}:ACTIVE`}
                              onClick={() => handleLifecycle(tenant, 'ACTIVE')}
                            >
                              <FiPlay aria-hidden="true" /> {busyTenant === `${tenant.id}:ACTIVE` ? 'Reactivating…' : 'Reactivate'}
                            </button>
                          ) : (
                            <small className="text-muted">no actions</small>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataState>
      </div>

      {showProvisionModal && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !busy && setShowProvisionModal(false)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Provision Enterprise Tenant</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setShowProvisionModal(false)} disabled={busy}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleProvision}>
              <div className="enterprise-modal-body">
                <div className="enterprise-form-group">
                  <label htmlFor="tenant-display-name">Organization Display Name</label>
                  <input
                    id="tenant-display-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="e.g. Northwind Group"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="enterprise-input"
                    autoFocus
                  />
                </div>
                <div className="enterprise-form-group">
                  <label htmlFor="tenant-slug">Slug / Namespace</label>
                  <input
                    id="tenant-slug"
                    type="text"
                    required
                    pattern="[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9]"
                    title="Lowercase letters, digits, and hyphens"
                    placeholder="e.g. northwind-group"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="enterprise-input"
                  />
                  <small className="text-muted">Immutable unique namespace. You become the tenant owner.</small>
                </div>
                <div className="enterprise-form-group">
                  <label htmlFor="tenant-tier">Isolation Tier</label>
                  <select
                    id="tenant-tier"
                    value={isolationTier}
                    onChange={(e) => setIsolationTier(e.target.value)}
                    className="enterprise-select"
                  >
                    <option value="STANDARD">Standard</option>
                    <option value="ENTERPRISE">Enterprise</option>
                    <option value="REGULATED">Regulated</option>
                  </select>
                </div>
              </div>
              <div className="enterprise-modal-footer">
                <button type="button" className="enterprise-button enterprise-button-secondary" onClick={() => setShowProvisionModal(false)} disabled={busy}>Cancel</button>
                <button type="submit" className="enterprise-button enterprise-button-primary" disabled={busy}>
                  {busy ? 'Provisioning…' : 'Provision Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmConfig && (
        <EnterpriseConfirmModal
          isOpen={!!confirmConfig}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          cancelLabel={confirmConfig.cancelLabel}
          variant={confirmConfig.variant}
          busy={busy || !!busyTenant}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(null)}
        />
      )}
    </div>
  );
}
