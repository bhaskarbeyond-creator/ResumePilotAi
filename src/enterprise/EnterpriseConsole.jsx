import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FiActivity, FiBarChart2, FiChevronRight, FiCommand, FiFileText, FiHelpCircle, FiLock,
  FiSearch, FiSettings, FiShield, FiSliders, FiUserPlus, FiUsers, FiZap, FiMenu, FiPlus,
} from 'react-icons/fi';
import { AuthContext } from '../main';
import { EnterpriseTenantProvider, useEnterpriseTenant } from './EnterpriseContext';
import EnterpriseOverviewTab from './components/EnterpriseOverviewTab';
import EnterpriseUsersTab from './components/EnterpriseUsersTab';
import EnterpriseTeamsTab from './components/EnterpriseTeamsTab';
import EnterpriseWorkspacesTab from './components/EnterpriseWorkspacesTab';
import EnterpriseRolesTab from './components/EnterpriseRolesTab';
import EnterpriseResumesTab from './components/EnterpriseResumesTab';
import EnterpriseAiTab from './components/EnterpriseAiTab';
import EnterpriseUsageTab from './components/EnterpriseUsageTab';
import EnterpriseSecurityTab from './components/EnterpriseSecurityTab';
import EnterpriseAuditTab from './components/EnterpriseAuditTab';
import EnterpriseSettingsTab from './components/EnterpriseSettingsTab';
import EnterpriseSupportTab from './components/EnterpriseSupportTab';
import EnterprisePlatformTab from './components/EnterprisePlatformTab';
import './enterprise.css';

// Information architecture: the flat module list is grouped so the sidebar
// reads as Platform → Organization → Governance → Administration, mirroring
// the tenancy hierarchy (tenant → workspace → team → user → resource).
const NAVIGATION = [
  { id: 'overview', label: 'Overview', icon: FiActivity, group: 'Home', keywords: 'dashboard command center health' },
  { id: 'resumes', label: 'Documents & Resumes', icon: FiFileText, group: 'Organization', keywords: 'cv library documents' },
  { id: 'members', label: 'Users & IAM', icon: FiUsers, permission: 'tenant.members.read', group: 'Organization', keywords: 'people invitations identity access membership' },
  { id: 'teams', label: 'Teams', icon: FiUsers, permission: 'workspace.read', group: 'Organization', keywords: 'groups squads' },
  { id: 'workspaces', label: 'Workspaces', icon: FiSliders, permission: 'workspace.read', group: 'Organization', keywords: 'departments business units' },
  { id: 'access', label: 'Roles & permissions', icon: FiShield, permission: 'tenant.roles.manage', group: 'Governance', keywords: 'rbac matrix custom role' },
  { id: 'ai', label: 'AI workspace', icon: FiZap, permission: 'tenant.ai.manage', group: 'Governance', keywords: 'models providers llm policy quota' },
  { id: 'security', label: 'Security & M2M', icon: FiLock, permission: 'tenant.security.read', group: 'Governance', keywords: 'service accounts api keys mfa posture jobs dlq' },
  { id: 'usage', label: 'Usage & Quotas', icon: FiBarChart2, permission: 'tenant.usage.read', group: 'Governance', keywords: 'analytics consumption tokens cost' },
  { id: 'audit', label: 'Audit logs', icon: FiFileText, permission: 'tenant.audit.read', group: 'Governance', keywords: 'trail events investigation forensics' },
  { id: 'support', label: 'Support access', icon: FiHelpCircle, permission: 'tenant.settings.write', group: 'Administration', keywords: 'break-glass grants' },
  { id: 'settings', label: 'Organization settings', icon: FiSettings, permission: 'tenant.settings.write', group: 'Administration', keywords: 'configuration retention identity sso danger' },
  // Platform administration is a separate administrative layer over the tenant
  // registry. It is visible only when the server-derived platform capability is
  // true — never decided by the client.
  { id: 'platform', label: 'Platform administration', icon: FiCommand, platformOnly: true, group: 'Administration', keywords: 'tenants provisioning registry' },
];

const NAV_GROUP_ORDER = ['Home', 'Organization', 'Governance', 'Administration'];

// Cross-module quick actions surfaced in the command palette. Each one deep
// links into a module with pre-applied state (filters / opened dialogs), so
// recommendations and searches land on actionable screens rather than tabs.
const QUICK_ACTIONS = [
  { id: 'action-invite', label: 'Invite or grant member access', icon: FiUserPlus, target: 'members', params: { invite: '1' }, permission: 'tenant.members.manage', keywords: 'add user invitation email' },
  { id: 'action-pending', label: 'Review pending invitations', icon: FiUsers, target: 'members', params: { status: 'INVITED' }, permission: 'tenant.members.read', keywords: 'invited not accepted resend' },
  { id: 'action-suspended', label: 'Review suspended members', icon: FiUsers, target: 'members', params: { status: 'SUSPENDED' }, permission: 'tenant.members.read', keywords: 'deactivated blocked' },
  { id: 'action-new-workspace', label: 'Create a new workspace', icon: FiPlus, target: 'workspaces', params: { create: '1' }, permission: 'tenant.workspaces.manage', keywords: 'department unit' },
  { id: 'action-new-team', label: 'Create a new team', icon: FiPlus, target: 'teams', params: { create: '1' }, permission: 'workspace.manage', keywords: 'squad group' },
  { id: 'action-new-resume', label: 'Open the enterprise document library', icon: FiPlus, target: 'resumes', params: null, permission: 'resource.create', keywords: 'document cv resume create' },
  { id: 'action-new-sa', label: 'Create a service account', icon: FiLock, target: 'security', params: { create: '1' }, permission: 'tenant.security.manage', keywords: 'api key m2m machine' },
  { id: 'action-dlq', label: 'Inspect dead-letter jobs', icon: FiLock, target: 'security', params: { focus: 'jobs' }, permission: 'tenant.security.read', keywords: 'queue dlq replay failed' },
  { id: 'action-audit-denied', label: 'Investigate denied operations', icon: FiFileText, target: 'audit', params: { outcome: 'DENIED' }, permission: 'tenant.audit.read', keywords: 'forbidden failures security' },
];

function canSee(item, permissions = [], platformAdmin = false) {
  if (item.platformOnly) return platformAdmin === true;
  return !item.permission || permissions.includes('*') || permissions.includes(item.permission);
}

function normalizeTab(candidate, navigation) {
  if (navigation.some(item => item.id === candidate)) return candidate;
  return navigation[0]?.id || 'overview';
}

const RECENT_TABS_KEY = 'enterprise_recent_tabs';

function readRecentTabs() {
  try { return JSON.parse(sessionStorage.getItem(RECENT_TABS_KEY) || '[]').filter(id => typeof id === 'string'); } catch { return []; }
}

function pushRecentTab(tabId) {
  try {
    const next = [tabId, ...readRecentTabs().filter(id => id !== tabId)].slice(0, 5);
    sessionStorage.setItem(RECENT_TABS_KEY, JSON.stringify(next));
  } catch { /* browser-state only */ }
}

function TenantSwitcher() {
  const { tenant, tenants, selectTenant, loading } = useEnterpriseTenant();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = tenants.filter(item => `${item.displayName} ${item.slug}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="enterprise-switcher">
      <button
        type="button"
        className="enterprise-context-button"
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
        <div className="enterprise-popover" role="dialog" aria-label="Switch organization">
          <label className="enterprise-search">
            <FiSearch aria-hidden="true" />
            <span className="sr-only">Search organizations</span>
            <input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search organizations…"
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
                onClick={() => { setOpen(false); selectTenant(item.id).catch(() => {}); }}
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

function WorkspaceBadge() {
  const { workspace, workspaces, selectWorkspace, loading } = useEnterpriseTenant();
  const [open, setOpen] = useState(false);
  return (
    <div className="enterprise-workspace-switcher">
      <button
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
        <div className="enterprise-popover enterprise-workspace-popover" role="dialog" aria-label="Switch workspace">
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

function CommandPalette({ open, onClose, navigation, actions, recents, onSelect }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const navEntries = navigation.map(item => ({ kind: 'Navigate', id: item.id, label: item.label, icon: item.icon, keywords: item.keywords || '', target: item.id, params: null }));
    const actionEntries = actions.map(item => ({ kind: 'Action', id: item.id, label: item.label, icon: item.icon, keywords: item.keywords || '', target: item.target, params: item.params }));
    const all = [...actionEntries, ...navEntries];
    if (!term) {
      const recentEntries = recents
        .map(id => navEntries.find(entry => entry.id === id))
        .filter(Boolean)
        .map(entry => ({ ...entry, kind: 'Recent' }));
      return [...recentEntries, ...all.filter(entry => !recentEntries.some(recent => recent.id === entry.id))];
    }
    return all.filter(entry => `${entry.label} ${entry.keywords}`.toLowerCase().includes(term));
  }, [actions, navigation, query, recents]);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setSelectedIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex(index => (matches.length ? (index + 1) % matches.length : 0));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex(index => (matches.length ? (index - 1 + matches.length) % matches.length : 0));
        return;
      }
      if (event.key === 'Enter' && matches[selectedIndex]) {
        event.preventDefault();
        const entry = matches[selectedIndex];
        onSelect(entry.target, entry.params);
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [matches, onClose, onSelect, open, selectedIndex]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;
  return (
    <div className="enterprise-command-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="enterprise-command" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={event => event.stopPropagation()}>
        <label className="enterprise-search">
          <FiSearch aria-hidden="true" />
          <span className="sr-only">Search commands</span>
          <input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search modules and actions… (e.g. “invite”, “dead-letter”, “audit”)" />
        </label>
        <div className="enterprise-command-results">
          {matches.map((entry, index) => (
            <button
              key={`${entry.kind}-${entry.id}`}
              type="button"
              className={index === selectedIndex ? 'selected' : ''}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => { onSelect(entry.target, entry.params); onClose(); }}
            >
              <entry.icon aria-hidden="true" /> {entry.label}
              <span className="enterprise-command-kind">{entry.kind}</span>
            </button>
          ))}
          {!matches.length && <p className="enterprise-empty">No commands found.</p>}
        </div>
        <footer><kbd>↑↓</kbd> Navigate <kbd>Enter</kbd> Select <kbd>Esc</kbd> Close</footer>
      </section>
    </div>
  );
}

function EnterpriseConsoleInner() {
  const user = useContext(AuthContext);
  const { tenant, workspace, workspaces, selectWorkspace, enabled, loading, context, error, reload, platformAdmin } = useEnterpriseTenant();
  const permissions = useMemo(
    () => (loading ? ['*'] : (Array.isArray(context?.permissions) ? context.permissions : [])),
    [context?.permissions, loading],
  );
  const roles = useMemo(() => (Array.isArray(context?.roles) ? context.roles : []), [context?.roles]);
  const location = useLocation();
  const navigate = useNavigate();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [recentTabs, setRecentTabs] = useState(() => readRecentTabs());
  // Cross-tab investigation handoff (e.g. "view member activity" jumps to the
  // audit log with the actor filter pre-applied). Consumed once by the audit tab.
  const [auditPreset, setAuditPreset] = useState(null);

  const visibleNav = useMemo(() => {
    return NAVIGATION.filter(item => canSee(item, permissions, platformAdmin));
  }, [permissions, platformAdmin]);

  const visibleActions = useMemo(() => {
    return QUICK_ACTIONS.filter(action => {
      const targetVisible = visibleNav.some(item => item.id === action.target);
      const actionAllowed = !action.permission || permissions.includes('*') || permissions.includes(action.permission);
      return targetVisible && actionAllowed;
    });
  }, [permissions, visibleNav]);

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const requestedTab = useMemo(() => {
    return searchParams.get('tab') || new URLSearchParams(location.hash.replace(/^#/, '')).get('tab') || 'overview';
  }, [location.hash, searchParams]);

  const activeTab = useMemo(() => normalizeTab(requestedTab, visibleNav), [requestedTab, visibleNav]);
  const activeNavItem = useMemo(() => visibleNav.find(item => item.id === activeTab) || null, [activeTab, visibleNav]);

  // Deep-linkable module state: ?tab=members&status=INVITED etc. Selecting a
  // tab replaces the previous module's parameters so filters never leak across
  // modules; refresh and shared links reproduce the exact same screen.
  const selectTab = useCallback((tabId, params = null) => {
    const nextTab = normalizeTab(tabId, visibleNav);
    const search = new URLSearchParams();
    search.set('tab', nextTab);
    if (params && typeof params === 'object') {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
      }
    }
    navigate({ pathname: location.pathname, search: `?${search.toString()}` }, { replace: nextTab === activeTab && !params });
    pushRecentTab(nextTab);
    setRecentTabs(readRecentTabs());
    setMobileMenuOpen(false);
  }, [activeTab, location.pathname, navigate, visibleNav]);

  useEffect(() => {
    if (loading || !visibleNav.length) return undefined;
    if (requestedTab !== activeTab) {
      const search = new URLSearchParams(location.search);
      search.set('tab', activeTab);
      navigate({ pathname: location.pathname, search: `?${search.toString()}` }, { replace: true });
    }
    return undefined;
  }, [activeTab, loading, location.pathname, location.search, navigate, requestedTab, visibleNav]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(val => !val);
      }
      if (event.key === 'Escape') setMobileMenuOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!enabled && !loading) {
    return (
      <main className="enterprise-empty-state" role="main">
        <h1>Enterprise Unavailable</h1>
        <p>Enterprise features are disabled or unavailable in this environment.</p>
        <Link to="/" className="enterprise-button enterprise-button-primary">Return Home</Link>
      </main>
    );
  }

  // Context-resolution failures (tenant suspended, MFA required, session
  // re-authentication, network failure) get an explicit full-screen state —
  // never a blank console or a misleading healthy shell.
  if (!loading && enabled && error && !context) {
    const code = error?.code || '';
    const title = code === 'TENANT_MFA_REQUIRED'
      ? 'Multi-Factor Authentication Required'
      : code === 'TENANT_SESSION_REAUTH_REQUIRED'
        ? 'Session Re-Authentication Required'
        : code === 'TENANT_INACTIVE'
          ? 'Organization Suspended'
          : 'Enterprise Context Unavailable';
    const hint = code === 'TENANT_MFA_REQUIRED'
      ? 'This organization requires administrators to sign in with a second factor. Enroll MFA on your account and sign in again.'
      : code === 'TENANT_SESSION_REAUTH_REQUIRED'
        ? 'Your session exceeded the maximum session length configured by this organization. Sign out and sign in again to continue.'
        : code === 'TENANT_INACTIVE'
          ? 'This organization is currently suspended. A platform administrator must reactivate it before members can access enterprise features.'
          : (error?.message || 'The enterprise service did not respond as expected.');
    return (
      <main className="enterprise-empty-state" role="main" aria-live="polite">
        <h1>{title}</h1>
        <p>{hint}</p>
        <div className="enterprise-inline-actions" style={{ justifyContent: 'center', gap: '0.75rem' }}>
          <button type="button" className="enterprise-button enterprise-button-primary" onClick={() => reload().catch(() => {})}>
            Retry
          </button>
          <Link to="/" className="enterprise-button enterprise-button-secondary">Return Home</Link>
        </div>
      </main>
    );
  }

  const groupedNav = NAV_GROUP_ORDER
    .map(group => ({ group, items: visibleNav.filter(item => item.group === group) }))
    .filter(section => section.items.length > 0);

  return (
    <div className="enterprise-shell">
      {/* Top Application Bar */}
      <header className="enterprise-topbar" role="banner">
        <div className="enterprise-topbar-left">
          <button
            type="button"
            className="enterprise-mobile-toggle"
            aria-label="Toggle navigation menu"
            onClick={() => setMobileMenuOpen(val => !val)}
          >
            <FiMenu />
          </button>
          <Link to="/" className="enterprise-brand-link">
            <span className="enterprise-brand-logo">R</span>
            <span className="enterprise-brand-title">ResumePilot Enterprise</span>
          </Link>
          <TenantSwitcher />
          <WorkspaceBadge />
        </div>

        <div className="enterprise-topbar-right">
          <button
            type="button"
            className="enterprise-command-trigger"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="Open command palette"
          >
            <FiCommand aria-hidden="true" />
            <span>Search console…</span>
            <kbd>⌘K</kbd>
          </button>
          <Link to="/" className="enterprise-exit-link" title="Exit to consumer home">
            Exit Console
          </Link>
        </div>
      </header>

      {/* Main Grid: Sidebar + Content */}
      <div className="enterprise-layout">
        {/* Navigation Sidebar */}
        <aside className={`enterprise-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`} role="navigation" aria-label="Enterprise Navigation">
          <nav className="enterprise-nav-list">
            {groupedNav.map(section => (
              <div className="enterprise-nav-group" key={section.group}>
                {section.group !== 'Home' && <p className="enterprise-nav-group-label">{section.group}</p>}
                {section.items.map(item => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`enterprise-nav-item ${active ? 'active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => selectTab(item.id)}
                    >
                      <Icon className="enterprise-nav-icon" aria-hidden="true" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          {/* Identity footer: the signed-in administrator always knows who they
              are, which roles apply, and that authorization is server-derived. */}
          <div className="enterprise-identity" aria-label="Signed-in identity">
            <span className="enterprise-avatar" aria-hidden="true">
              {String(user?.email || user?.uid || 'U').slice(0, 1).toUpperCase()}
            </span>
            <span className="enterprise-identity-copy">
              <strong>{user?.displayName || user?.email || user?.uid || 'Signed in'}</strong>
              <small>{roles.length ? roles.join(' · ') : 'Member'}{platformAdmin ? ' · Platform admin' : ''}</small>
            </span>
          </div>
        </aside>

        {/* Dynamic Main Workspace */}
        <main className="enterprise-main" role="main">
          {/* Context breadcrumb: organization → workspace → module */}
          <nav className="enterprise-breadcrumbs" aria-label="Breadcrumb">
            <ol>
              <li><button type="button" onClick={() => selectTab('overview')}>{tenant?.displayName || 'Enterprise'}</button></li>
              <li aria-hidden="true"><FiChevronRight /></li>
              <li><button type="button" onClick={() => selectTab('workspaces')}>{workspace?.name || 'Default workspace'}</button></li>
              <li aria-hidden="true"><FiChevronRight /></li>
              <li aria-current="page"><span>{activeNavItem?.label || 'Overview'}</span></li>
            </ol>
          </nav>

          {activeTab === 'overview' && (
            <EnterpriseOverviewTab
              tenant={tenant}
              workspace={workspace}
              workspaces={workspaces}
              onNavigate={selectTab}
              onOpenInviteModal={() => selectTab('members', { invite: '1' })}
              onOpenCreateWorkspaceModal={() => selectTab('workspaces', { create: '1' })}
            />
          )}

          {activeTab === 'resumes' && (
            <EnterpriseResumesTab
              tenant={tenant}
              workspace={workspace}
              initialParams={searchParams}
            />
          )}

          {activeTab === 'members' && (
            <EnterpriseUsersTab
              currentPrincipalId={user?.uid}
              initialParams={searchParams}
              onInspectActivity={(principalId) => {
                setAuditPreset({ actor: String(principalId || '').trim() });
                selectTab('audit', { actor: String(principalId || '').trim() });
              }}
            />
          )}

          {activeTab === 'teams' && (
            <EnterpriseTeamsTab initialParams={searchParams} />
          )}

          {activeTab === 'workspaces' && (
            <EnterpriseWorkspacesTab
              workspaces={workspaces}
              activeWorkspace={workspace}
              onSelectWorkspace={selectWorkspace}
              initialParams={searchParams}
            />
          )}

          {activeTab === 'access' && (
            <EnterpriseRolesTab />
          )}

          {activeTab === 'ai' && (
            <EnterpriseAiTab
              tenant={tenant}
              workspace={workspace}
            />
          )}

          {activeTab === 'security' && (
            <EnterpriseSecurityTab initialParams={searchParams} />
          )}

          {activeTab === 'usage' && (
            <EnterpriseUsageTab
              tenant={tenant}
              initialParams={searchParams}
              onNavigate={selectTab}
            />
          )}

          {activeTab === 'audit' && (
            <EnterpriseAuditTab
              preset={auditPreset}
              onPresetConsumed={() => setAuditPreset(null)}
              initialParams={searchParams}
            />
          )}

          {activeTab === 'support' && (
            <EnterpriseSupportTab />
          )}

          {activeTab === 'settings' && (
            <EnterpriseSettingsTab
              tenant={tenant}
            />
          )}

          {activeTab === 'platform' && (
            <EnterprisePlatformTab />
          )}
        </main>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        navigation={visibleNav}
        actions={visibleActions}
        recents={recentTabs}
        onSelect={selectTab}
      />
    </div>
  );
}

export default function EnterpriseConsole() {
  return (
    <EnterpriseTenantProvider>
      <EnterpriseConsoleInner />
    </EnterpriseTenantProvider>
  );
}
