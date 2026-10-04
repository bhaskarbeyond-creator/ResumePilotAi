import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiSearch, FiSliders } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useEnterpriseTenant } from './EnterpriseContext';
import fire from '../conf/fire';

/**
 * Organization context switchers (DIR-008, P4).
 *
 * WHY THESE LIVE HERE RATHER THAN IN THE CONSOLE FILE:
 *   The primary console lazy-loads the Cuba portal wrapper. If the wrapper
 *   imported the switchers back out of the console it would create a lazy
 *   import CYCLE, which Vite resolves at runtime rather than build time.
 *
 *   Extracting them into a leaf module breaks the cycle cleanly: both the legacy
 *   console and the Cuba wrapper now depend on this file, which depends on
 *   nothing but the tenant context.
 *
 * NOTHING HERE DECIDES ACCESS. Every tenant and workspace shown is rendered from
 * `useEnterpriseTenant()`, which is populated exclusively by the server response
 * to `/api/enterprise/context`. The switchers only *request* a different context;
 * the server re-verifies membership before returning anything.
 */

/** Closes the popover on Escape and restores focus to the trigger (WCAG §14). */
function useDismissable(open, setOpen, triggerRef, panelRef) {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onPointerDown(event) {
      if (panelRef.current?.contains(event.target)) return;
      if (triggerRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, panelRef, setOpen, triggerRef]);
}

const variantClass = (variant, base) => `${base} ${variant === 'cuba' ? `${base}--cuba` : ''}`.trim();

/**
 * Organization (tenant) switcher.
 *
 * Opens a searchable popover of the tenants the server already returned, filters
 * as the operator types, and requests the selection. `variant="cuba"` applies
 * the Cuba executive tokens so the control matches the surrounding portal chrome.
 */
export function TenantSwitcher({ variant = 'legacy' }) {
  const { tenant, tenants, selectTenant, loading } = useEnterpriseTenant();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  useDismissable(open, setOpen, triggerRef, panelRef);

  const term = query.trim().toLowerCase();
  const filtered = tenants.filter(item =>
    `${item.displayName || ''} ${item.slug || ''}`.toLowerCase().includes(term));

  const choose = useCallback((tenantId) => {
    setOpen(false);
    setQuery('');
    selectTenant(tenantId).catch(() => {});
  }, [selectTenant]);

  return (
    <div className={variantClass(variant, 'enterprise-switcher')} data-testid="tenant-switcher">
      <button
        ref={triggerRef}
        type="button"
        className={variantClass(variant, 'enterprise-context-button')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        disabled={loading}
      >
        <span className="enterprise-avatar" aria-hidden="true">
          {String(tenant?.displayName || 'R').slice(0, 1).toUpperCase()}
        </span>
        <span className="enterprise-context-copy">
          <strong>{tenant?.displayName || 'Enterprise Workspace'}</strong>
          <small>{tenant?.isolationTier || 'STANDARD'} · Active</small>
        </span>
        <span aria-hidden="true" style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>▾</span>
      </button>
      {open && (
        <div ref={panelRef} className={variantClass(variant, 'enterprise-popover')} role="dialog" aria-label="Switch organization">
          <label className="enterprise-search">
            <FiSearch aria-hidden="true" />
            <span className="sr-only">Search organizations</span>
            <input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search organizations…"
              aria-label="Search organizations"
            />
          </label>
          <div role="listbox" aria-label="Available organizations" className="enterprise-switcher-list">
            {filtered.map(item => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === tenant?.id}
                className={item.id === tenant?.id ? 'selected' : ''}
                onClick={() => choose(item.id)}
              >
                <span className="enterprise-avatar" aria-hidden="true">
                  {String(item.displayName).slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <strong>{item.displayName}</strong>
                  <small>{item.roles?.join(', ') || 'Member'} · {item.personalTenant ? 'Personal' : item.isolationTier}</small>
                </span>
                {item.id === tenant?.id && <span aria-label="Active organization">✓</span>}
              </button>
            ))}
            {filtered.length === 0 && <p className="enterprise-empty">No organization matches this search.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// __SWITCHERS_APPEND__
/**
 * Workspace switcher.
 *
 * Requests a different workspace inside the ACTIVE tenant; the tenant is retained
 * and the server re-verifies workspace membership and scope before responding.
 */
export function WorkspaceBadge({ variant = 'legacy' }) {
  const { workspace, workspaces, selectWorkspace, loading } = useEnterpriseTenant();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  useDismissable(open, setOpen, triggerRef, panelRef);

  return (
    <div className={variantClass(variant, 'enterprise-workspace-switcher')} data-testid="workspace-switcher">
      <button
        ref={triggerRef}
        type="button"
        className="enterprise-workspace"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        disabled={loading}
      >
        <FiSliders aria-hidden="true" /> <span className="enterprise-workspace-name">{workspace?.name || 'Default workspace'}</span> <span aria-hidden="true" style={{ marginLeft: '0.25rem', fontSize: '0.75rem' }}>▾</span>
      </button>
      {open && (
        <div ref={panelRef} className="enterprise-popover enterprise-workspace-popover" role="dialog" aria-label="Switch workspace">
          <div role="listbox" aria-label="Available workspaces" className="enterprise-switcher-list">
            {workspaces.map(item => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === workspace?.id}
                className={item.id === workspace?.id ? 'selected' : ''}
                onClick={() => { setOpen(false); selectWorkspace(item.id).catch(() => {}); }}
              >
                <FiSliders aria-hidden="true" />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.isDefault ? 'Default workspace' : 'Workspace'}</small>
                </span>
                {item.id === workspace?.id && <span aria-label="Active workspace">✓</span>}
              </button>
            ))}
            {!workspaces.length && <p className="enterprise-empty">No workspace is available.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Super Admin role-simulation banner.
 *
 * Elevated so the Cuba chrome can host it exactly once. Rendered only when the
 * SERVER reports a simulated role; the client never decides that a simulation
 * is active. Exiting clears the simulation keys, records the audit event, and
 * returns to the platform admin dashboard.
 */
export function EnterpriseRoleSimulationBanner({ tenant, simulatedRole }) {
  const navigate = useNavigate();

  const exit = useCallback(async () => {
    try {
      sessionStorage.removeItem('superadmin_role_view');
      sessionStorage.removeItem('superadmin_enterprise_tenant');
      const token = await fire?.auth?.().currentUser?.getIdToken();
      if (token) {
        await fetch('/api/platform/role-view-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ targetRole: 'SUPER_ADMIN' })
        });
      }
    } catch (_) { /* the navigation below still leaves the simulation */ }
    navigate('/admin/dashboard');
  }, [navigate]);

  if (!simulatedRole) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="enterprise-role-simulation-banner"
      className="enterprise-role-simulation-banner"
    >
      <div className="enterprise-role-simulation-copy">
        <span className="enterprise-role-simulation-icon" aria-hidden="true">🛡️</span>
        <span>
          <strong>Enterprise Role Simulation:</strong> Viewing console as <span className="enterprise-role-simulation-role">{String(simulatedRole).replace('ENTERPRISE_', '')}</span> for organization <strong>{tenant?.displayName || 'Active Workspace'}</strong>. Super Admin credentials remain active.
        </span>
      </div>
      <button
        type="button"
        className="enterprise-role-simulation-exit"
        onClick={exit}
        data-testid="exit-enterprise-role-view"
      >
        Exit Enterprise Role View
      </button>
    </aside>
  );
}

export default TenantSwitcher;