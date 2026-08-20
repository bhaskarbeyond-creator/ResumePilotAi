import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  FiActivity, FiBarChart2, FiBell, FiCommand, FiCreditCard, FiDatabase,
  FiFileText, FiHelpCircle, FiLock, FiSearch, FiSettings, FiShield,
  FiSliders, FiUsers, FiX, FiZap, FiMenu, FiCheck, FiFolder, FiKey
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
import './enterprise.css';

const NAVIGATION = [
  { id: 'overview', label: 'Overview', icon: FiActivity },
  { id: 'resumes', label: 'Documents & Resumes', icon: FiFileText },
  { id: 'members', label: 'Users & IAM', icon: FiUsers, permission: 'tenant.members.read' },
  { id: 'teams', label: 'Teams', icon: FiUsers, permission: 'workspace.read' },
  { id: 'workspaces', label: 'Workspaces', icon: FiSliders, permission: 'workspace.read' },
  { id: 'access', label: 'Roles & permissions', icon: FiShield, permission: 'tenant.roles.manage' },
  { id: 'ai', label: 'AI workspace', icon: FiZap, permission: 'ai.use' },
  { id: 'security', label: 'Security & M2M', icon: FiLock, permission: 'tenant.security.read' },
  { id: 'usage', label: 'Usage & Quotas', icon: FiBarChart2, permission: 'tenant.usage.read' },
  { id: 'audit', label: 'Audit logs', icon: FiFileText, permission: 'tenant.audit.read' },
  { id: 'support', label: 'Support access', icon: FiHelpCircle, permission: 'tenant.settings.write' },
  { id: 'settings', label: 'Organization settings', icon: FiSettings, permission: 'tenant.settings.write' },
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
        <FiSliders aria-hidden="true" /> {workspace?.name || 'Default workspace'} <span aria-hidden="true" style={{ marginLeft: '0.25rem', fontSize: '0.75rem' }}>▾</span>
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

function CommandPalette({ open, onClose, navigation, onSelect }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  if (!open) return null;
  const matches = navigation.filter(item => item.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="enterprise-command-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="enterprise-command" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={event => event.stopPropagation()}>
        <label className="enterprise-search">
          <FiSearch aria-hidden="true" />
          <span className="sr-only">Search commands</span>
          <input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search pages, settings, and tools…" />
        </label>
        <div className="enterprise-command-results">
          {matches.map(item => (
            <button key={item.id} type="button" onClick={() => { onSelect(item.id); onClose(); }}>
              <item.icon aria-hidden="true" /> {item.label}
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
  const { tenant, workspace, workspaces, selectWorkspace, enabled, loading } = useEnterpriseTenant();
  const [activeTab, setActiveTab] = useState('overview');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(val => !val);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const visibleNav = useMemo(() => {
    return NAVIGATION.filter(item => canSee(item, tenant?.permissions || ['*']));
  }, [tenant?.permissions]);

  if (!enabled && !loading) {
    return (
      <main className="enterprise-empty-state" role="main">
        <h1>Enterprise Unavailable</h1>
        <p>Enterprise features are disabled or unavailable in this environment.</p>
        <Link to="/" className="enterprise-button enterprise-button-primary">Return Home</Link>
      </main>
    );
  }

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
            {visibleNav.map(item => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`enterprise-nav-item ${active ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                >
                  <Icon className="enterprise-nav-icon" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Dynamic Main Workspace */}
        <main className="enterprise-main" role="main">
          {activeTab === 'overview' && (
            <EnterpriseOverviewTab
              tenant={tenant}
              workspace={workspace}
              workspaces={workspaces}
              onNavigate={(tab) => setActiveTab(tab)}
              onOpenInviteModal={() => setActiveTab('members')}
              onOpenCreateWorkspaceModal={() => setActiveTab('workspaces')}
            />
          )}

          {activeTab === 'resumes' && (
            <EnterpriseResumesTab
              tenant={tenant}
              workspace={workspace}
            />
          )}

          {activeTab === 'members' && (
            <EnterpriseUsersTab
              currentPrincipalId={user?.uid}
            />
          )}

          {activeTab === 'teams' && (
            <EnterpriseTeamsTab />
          )}

          {activeTab === 'workspaces' && (
            <EnterpriseWorkspacesTab
              workspaces={workspaces}
              activeWorkspace={workspace}
              onSelectWorkspace={selectWorkspace}
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
            <EnterpriseSecurityTab />
          )}

          {activeTab === 'usage' && (
            <EnterpriseUsageTab
              tenant={tenant}
            />
          )}

          {activeTab === 'audit' && (
            <EnterpriseAuditTab />
          )}

          {activeTab === 'support' && (
            <EnterpriseSupportTab />
          )}

          {activeTab === 'settings' && (
            <EnterpriseSettingsTab
              tenant={tenant}
            />
          )}
        </main>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        navigation={visibleNav}
        onSelect={(tab) => setActiveTab(tab)}
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
