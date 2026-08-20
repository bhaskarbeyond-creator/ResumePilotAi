import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  FiActivity, FiBarChart2, FiBell, FiCommand, FiCreditCard, FiDatabase,
  FiFileText, FiHelpCircle, FiLock, FiSearch, FiSettings, FiShield,
  FiSliders, FiUsers, FiX, FiZap
} from 'react-icons/fi';
import { EnterpriseTenantProvider, useEnterpriseTenant } from './EnterpriseContext';
import './enterprise.css';

const NAVIGATION = [
  { id: 'overview', label: 'Overview', icon: FiActivity },
  { id: 'members', label: 'Users & teams', icon: FiUsers, permission: 'tenant.members.read' },
  { id: 'access', label: 'Roles & permissions', icon: FiShield, permission: 'tenant.roles.manage' },
  { id: 'security', label: 'Security', icon: FiLock, permission: 'tenant.security.read' },
  { id: 'ai', label: 'AI workspace', icon: FiZap, permission: 'ai.use' },
  { id: 'usage', label: 'Usage & billing', icon: FiBarChart2, permission: 'tenant.usage.read' },
  { id: 'audit', label: 'Audit logs', icon: FiFileText, permission: 'tenant.audit.read' },
  { id: 'privacy', label: 'Data & privacy', icon: FiDatabase, permission: 'tenant.settings.write' },
  { id: 'settings', label: 'Tenant settings', icon: FiSettings, permission: 'tenant.settings.write' },
];

function canSee(item, permissions = []) {
  return !item.permission || permissions.includes('*') || permissions.includes(item.permission);
}

function TenantSwitcher() {
  const { tenant, tenants, selectTenant, loading } = useEnterpriseTenant();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = tenants.filter(item => `${item.displayName} ${item.slug}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="enterprise-switcher">
      <button type="button" className="enterprise-context-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(value => !value)} disabled={loading}>
        <span className="enterprise-avatar" aria-hidden="true">{String(tenant?.displayName || 'R').slice(0, 1).toUpperCase()}</span>
        <span className="enterprise-context-copy"><strong>{tenant?.displayName || 'Loading organization…'}</strong><small>{tenant?.isolationTier || 'Personal context'}</small></span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="enterprise-popover" role="dialog" aria-label="Switch organization">
          <label className="enterprise-search"><FiSearch aria-hidden="true" /><span className="sr-only">Search organizations</span><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search organizations…" /></label>
          <div role="listbox" aria-label="Available organizations" className="enterprise-switcher-list">
            {filtered.map(item => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === tenant?.id}
                className={item.id === tenant?.id ? 'selected' : ''}
                onClick={() => { setOpen(false); selectTenant(item.id).catch(() => {}); }}
              >
                <span className="enterprise-avatar" aria-hidden="true">{String(item.displayName).slice(0, 1).toUpperCase()}</span>
                <span><strong>{item.displayName}</strong><small>{item.roles?.join(', ') || 'Member'} · {item.personalTenant ? 'Personal' : item.isolationTier}</small></span>
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

function WorkspaceBadge() {
  const { workspace, workspaces, selectWorkspace, loading } = useEnterpriseTenant();
  const [open, setOpen] = useState(false);
  return (
    <div className="enterprise-workspace-switcher">
      <button type="button" className="enterprise-workspace" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(value => !value)} disabled={loading}>
        <FiSliders aria-hidden="true" /> {workspace?.name || 'Default workspace'} <span aria-hidden="true">▾</span>
      </button>
      {open && <div className="enterprise-popover enterprise-workspace-popover" role="dialog" aria-label="Switch workspace"><div role="listbox" aria-label="Available workspaces" className="enterprise-switcher-list">{workspaces.map(item => <button key={item.id} type="button" role="option" aria-selected={item.id === workspace?.id} className={item.id === workspace?.id ? 'selected' : ''} onClick={() => { setOpen(false); selectWorkspace(item.id).catch(() => {}); }}><FiSliders aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.isDefault ? 'Default workspace' : 'Workspace'}</small></span>{item.id === workspace?.id && <span aria-label="Active workspace">✓</span>}</button>)}{!workspaces.length && <p className="enterprise-empty">No workspace is available.</p>}</div></div>}
    </div>
  );
}

function CommandPalette({ open, onClose, navigation, onSelect }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  if (!open) return null;
  const matches = navigation.filter(item => item.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="enterprise-command-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="enterprise-command" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={event => event.stopPropagation()}>
        <label className="enterprise-search"><FiSearch aria-hidden="true" /><span className="sr-only">Search commands</span><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search pages and actions…" /></label>
        <div className="enterprise-command-results">
          {matches.map(item => <button key={item.id} type="button" onClick={() => { onSelect(item.id); onClose(); }}><item.icon aria-hidden="true" /> {item.label}</button>)}
          {!matches.length && <p className="enterprise-empty">No commands found.</p>}
        </div>
        <footer><kbd>↑↓</kbd> Navigate <kbd>Enter</kbd> Select <kbd>Esc</kbd> Close</footer>
      </section>
    </div>
  );
}

function Metric({ label, value, detail, tone = 'default' }) {
  return <article className={`enterprise-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function EmptyPanel({ title, children, action = null }) {
  return <section className="enterprise-panel enterprise-empty-panel"><FiActivity aria-hidden="true" /><h2>{title}</h2><p>{children}</p>{action}</section>;
}

function Overview() {
  const { tenant, context, workspace } = useEnterpriseTenant();
  return (
    <>
      <section className="enterprise-hero">
        <div><p className="enterprise-eyebrow">Organization overview</p><h1>{tenant?.displayName || 'Organization'}</h1><p>Active context: <strong>{workspace?.name || 'Default workspace'}</strong>. Your role-aware view never changes the server-side authorization boundary.</p></div>
        <span className="enterprise-security-pill"><FiShield aria-hidden="true" /> {context?.dataPlane?.type === 'DEDICATED_POSTGRES' ? 'Dedicated data plane' : 'Shared RLS data plane'}</span>
      </section>
      <section className="enterprise-metric-grid" aria-label="Organization metrics">
        <Metric label="Members" value="—" detail="Provision member reporting after tenant setup." />
        <Metric label="AI budget" value="Not configured" detail="Tenant AI policy is not yet enabled." tone="warning" />
        <Metric label="Storage" value="Not configured" detail="No tenant artifact store is active." />
        <Metric label="Security" value="Context verified" detail={`Policy version ${context?.policyVersion || 1}`} tone="success" />
      </section>
      <section className="enterprise-panel-grid">
        <article className="enterprise-panel"><header><h2>Setup checklist</h2><span className="enterprise-status">Foundation</span></header><ol><li>Confirm members and roles</li><li>Configure organization security policy</li><li>Review AI, data, and usage controls</li></ol></article>
        <article className="enterprise-panel"><header><h2>Recent activity</h2><span className="enterprise-status muted">No tenant events yet</span></header><p className="enterprise-muted">Tenant-aware audit records appear here after enterprise actions are performed.</p></article>
      </section>
    </>
  );
}

function Members() {
  const { tenant, workspace } = useEnterpriseTenant();
  const [state, setState] = useState({ loading: true, error: null, memberships: [], teams: [] });
  useEffect(() => {
    if (!tenant?.id) return undefined;
    const controller = new AbortController();
    setState({ loading: true, error: null, memberships: [], teams: [] });
    const options = { headers: { 'X-Tenant-Id': tenant.id, 'X-Workspace-Id': workspace?.id || '' }, cache: 'no-store', signal: controller.signal };
    Promise.all([
      fetch('/api/enterprise/memberships', options).then(async response => ({ response, data: await response.json().catch(() => ({})) })),
      fetch('/api/enterprise/teams', options).then(async response => ({ response, data: await response.json().catch(() => ({})) })),
    ]).then(([members, teams]) => {
      if (!members.response.ok) throw new Error(members.data?.error?.message || 'Members are unavailable.');
      if (!teams.response.ok) throw new Error(teams.data?.error?.message || 'Teams are unavailable.');
      setState({ loading: false, error: null, memberships: Array.isArray(members.data.memberships) ? members.data.memberships : [], teams: Array.isArray(teams.data.teams) ? teams.data.teams : [] });
    }).catch(error => { if (error.name !== 'AbortError') setState({ loading: false, error, memberships: [], teams: [] }); });
    return () => controller.abort();
  }, [tenant?.id, workspace?.id]);
  return <section className="enterprise-panel-grid"><section className="enterprise-panel"><header><h1>Users</h1><span className="enterprise-status">Role aware</span></header>{state.loading && <p role="status">Loading tenant members…</p>}{state.error && <p role="alert" className="enterprise-error">{state.error.message}</p>}{!state.loading && !state.error && state.memberships.length === 0 && <p className="enterprise-muted">No members are available in this tenant.</p>}{state.memberships.map(member => <div className="enterprise-member-row" key={member.id}><span className="enterprise-avatar" aria-hidden="true">{String(member.principalId).slice(0, 1).toUpperCase()}</span><div><strong>{member.principalId}</strong><small>{member.roles?.join(', ') || 'Member'} · {member.status}</small></div></div>)}</section><section className="enterprise-panel"><header><h1>Teams</h1><span className="enterprise-status">Workspace scoped</span></header>{state.loading && <p role="status">Loading teams…</p>}{!state.loading && !state.error && state.teams.length === 0 && <p className="enterprise-muted">No teams exist in this workspace yet.</p>}{state.teams.map(team => <div className="enterprise-member-row" key={team.id}><FiUsers aria-hidden="true" /><div><strong>{team.name}</strong><small>{team.status}</small></div></div>)}</section></section>;
}

function Access() {
  const { context } = useEnterpriseTenant();
  return <section className="enterprise-panel"><header><h1>Roles & permissions</h1><span className="enterprise-status">Active role</span></header><p>Your active roles: <strong>{context?.roles?.join(', ') || 'Member'}</strong></p><div className="enterprise-permission-grid">{(context?.permissions || []).map(permission => <span key={permission}><FiShield aria-hidden="true" /> {permission}</span>)}</div><p className="enterprise-muted">Permission visibility is explanatory. API policy and data-plane RLS remain the enforcement layers.</p></section>;
}

function Security() {
  return <section className="enterprise-panel-grid"><EmptyPanel title="Security center">MFA, SSO, SCIM, sessions, service accounts, and API keys are shown here only after their server-side policy and audit controls are enabled.</EmptyPanel><EmptyPanel title="Support access">Support access is default-deny and must be time-bound, case-scoped, and auditable.</EmptyPanel></section>;
}

function AiWorkspace() {
  const { tenant, workspace } = useEnterpriseTenant();
  return <section className="enterprise-panel enterprise-ai-panel"><header><div><p className="enterprise-eyebrow">AI workspace</p><h1>Scoped AI assistance</h1></div><span className="enterprise-security-pill"><FiLock aria-hidden="true" /> {tenant?.displayName} / {workspace?.name}</span></header><p>Select only explicitly authorized documents before an AI request. No workspace-wide context is silently added.</p><div className="enterprise-ai-scope"><FiFileText aria-hidden="true" /><div><strong>No source selected</strong><small>Attach an authorized resume, CV, or approved workspace source to begin.</small></div></div><p className="enterprise-muted">Model/provider, memory, RAG, and retention policy will be displayed here after the tenant AI policy is configured.</p></section>;
}

function Usage() {
  return <section className="enterprise-panel-grid"><EmptyPanel title="Usage & billing">Plans, seats, AI/API/storage usage, quotas, invoices, and overage rules will show authoritative values only. No synthetic trends are displayed.</EmptyPanel><EmptyPanel title="Quota controls">Tenant controls are enforced server-side; this view explains the current limit and escalation path.</EmptyPanel></section>;
}

function Audit() {
  const { tenant, workspace } = useEnterpriseTenant();
  const [state, setState] = useState({ loading: true, error: null, events: [] });
  useEffect(() => {
    if (!tenant?.id) return undefined;
    const controller = new AbortController();
    setState({ loading: true, error: null, events: [] });
    fetch('/api/enterprise/audit', { headers: { 'X-Tenant-Id': tenant.id, 'X-Workspace-Id': workspace?.id || '' }, cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error?.message || 'Audit events are unavailable.');
        return Array.isArray(data.events) ? data.events : [];
      })
      .then(events => setState({ loading: false, error: null, events }))
      .catch(error => { if (error.name !== 'AbortError') setState({ loading: false, error, events: [] }); });
    return () => controller.abort();
  }, [tenant?.id, workspace?.id]);
  return <section className="enterprise-panel"><header><h1>Audit logs</h1><span className="enterprise-status">Tenant scoped</span></header><div className="enterprise-filter-row"><button type="button">Actor</button><button type="button">Resource</button><button type="button">Action</button><button type="button">Severity</button><button type="button">Date</button></div><div className="enterprise-table-wrap"><table><caption className="sr-only">Tenant audit events</caption><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>Outcome</th></tr></thead><tbody>{state.loading && <tr><td colSpan="5" className="enterprise-muted" role="status">Loading tenant audit events…</td></tr>}{state.error && <tr><td colSpan="5" role="alert" className="enterprise-error">{state.error.message}</td></tr>}{!state.loading && !state.error && state.events.length === 0 && <tr><td colSpan="5" className="enterprise-muted">No tenant audit events are available yet.</td></tr>}{state.events.map(event => <tr key={event.id}><td>{event.occurredAt ? new Date(event.occurredAt).toLocaleString() : '—'}</td><td>{event.principalId || 'System'}</td><td>{event.action}</td><td>{event.resourceType || '—'}</td><td>{event.outcome}</td></tr>)}</tbody></table></div></section>;
}

function Privacy() {
  return <section className="enterprise-panel-grid"><EmptyPanel title="Data & privacy">Tenant exports, retention, deletion, public links, legal holds, and AI memory policy will be governed here.</EmptyPanel><EmptyPanel title="Migration safety">Legacy Firebase resources remain personal and are not migrated until deterministic ownership validation succeeds.</EmptyPanel></section>;
}

function Settings() {
  const { tenant, context } = useEnterpriseTenant();
  return <section className="enterprise-panel"><header><h1>Tenant settings</h1><span className="enterprise-status">Version {context?.dataPlane?.routingVersion || 1}</span></header><dl className="enterprise-definition-list"><div><dt>Lifecycle</dt><dd>{tenant?.lifecycleState || 'ACTIVE'}</dd></div><div><dt>Isolation tier</dt><dd>{tenant?.isolationTier || 'STANDARD'}</dd></div><div><dt>Region</dt><dd>{context?.dataPlane?.region || 'default'}</dd></div><div><dt>Data plane</dt><dd>{context?.dataPlane?.type || 'SHARED_POSTGRES'}</dd></div></dl></section>;
}

const PANELS = { overview: Overview, members: Members, access: Access, security: Security, ai: AiWorkspace, usage: Usage, audit: Audit, privacy: Privacy, settings: Settings };

function EnterpriseConsoleInner() {
  const { enabled, loading, error, serverDisabled, context, tenant } = useEnterpriseTenant();
  const [active, setActive] = useState('overview');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigation = useMemo(() => NAVIGATION.filter(item => canSee(item, context?.permissions || [])), [context?.permissions]);
  const ActivePanel = PANELS[active] || Overview;

  useEffect(() => {
    const listener = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(true); }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  if (!enabled) return <section className="enterprise-disabled" role="status"><FiShield aria-hidden="true" /><h1>Enterprise foundation is feature-gated</h1><p>This environment has not enabled tenant provisioning. Existing Resume, CV, export, and Interview Coach behavior is unchanged.</p><Link to="/dashboard">Return to dashboard</Link></section>;
  if (serverDisabled) return <section className="enterprise-disabled" role="status"><FiShield aria-hidden="true" /><h1>Enterprise rollout is not enabled on this server</h1><p>The browser flag is on, but the server-side enterprise gate remains disabled. No tenant records or data-plane calls were made.</p><Link to="/dashboard">Return to dashboard</Link></section>;
  if (loading) return <section className="enterprise-disabled" role="status"><span className="enterprise-spinner" aria-hidden="true" /><h1>Resolving secure tenant context…</h1><p>The server is verifying your organization membership and data-plane route.</p></section>;
  if (error) return <section className="enterprise-disabled" role="alert"><FiShield aria-hidden="true" /><h1>Tenant context is unavailable</h1><p>{error.message}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></section>;
  if (!tenant) return <Navigate to="/dashboard" replace />;

  return (
    <div className="enterprise-shell">
      <header className="enterprise-topbar"><Link to="/dashboard" className="enterprise-brand">ResumePilot <span>Enterprise</span></Link><TenantSwitcher /><WorkspaceBadge /><div className="enterprise-topbar-actions"><button type="button" onClick={() => setPaletteOpen(true)} aria-label="Open command palette"><FiCommand aria-hidden="true" /><span>Search</span><kbd>⌘K</kbd></button><button type="button" aria-label="Open notifications"><FiBell aria-hidden="true" /></button><Link to="/dashboard" aria-label="Return to personal dashboard"><FiHelpCircle aria-hidden="true" /></Link></div></header>
      <div className="enterprise-layout">
        <nav className="enterprise-sidebar" aria-label="Enterprise navigation"><p className="enterprise-nav-label">Workspace</p>{navigation.map(item => <button key={item.id} type="button" className={active === item.id ? 'active' : ''} onClick={() => setActive(item.id)}><item.icon aria-hidden="true" /> <span>{item.label}</span></button>)}<div className="enterprise-sidebar-footer"><Link to="/dashboard"><FiCreditCard aria-hidden="true" /> Personal workspace</Link></div></nav>
        <main className="enterprise-main"><div className="enterprise-breadcrumb"><span>{tenant.displayName}</span><span aria-hidden="true">/</span><span>{active === 'overview' ? 'Overview' : navigation.find(item => item.id === active)?.label}</span></div><ActivePanel /></main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} navigation={navigation} onSelect={setActive} />
    </div>
  );
}

export default function EnterpriseConsole() {
  return <EnterpriseTenantProvider><EnterpriseConsoleInner /></EnterpriseTenantProvider>;
}
