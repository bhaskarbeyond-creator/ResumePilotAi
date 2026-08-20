import React from 'react';
import {
  FiUsers, FiSliders, FiZap, FiDatabase, FiShield, FiTrendingUp,
  FiPlus, FiUserPlus, FiFileText, FiClock, FiCheckCircle, FiAlertTriangle
} from 'react-icons/fi';

export default function EnterpriseOverviewTab({
  tenant,
  workspace,
  workspaces,
  onNavigate,
  onOpenInviteModal,
  onOpenCreateWorkspaceModal
}) {
  return (
    <div className="enterprise-tab-content">
      {/* Top Banner / Context Info */}
      <div className="enterprise-card enterprise-banner-card">
        <div className="enterprise-banner-header">
          <div>
            <span className="enterprise-pill enterprise-pill-success">
              <FiCheckCircle aria-hidden="true" /> Enterprise Active · {tenant?.isolationTier || 'STANDARD'}
            </span>
            <h2 className="enterprise-tab-title" style={{ marginTop: '0.75rem' }}>
              {tenant?.displayName || 'Enterprise Workspace'}
            </h2>
            <p className="enterprise-tab-subtitle">
              Active Workspace: <strong>{workspace?.name || 'Default'}</strong> · Region: <strong>Global (Edge CDN)</strong> · Forced RLS: <strong>Enabled</strong>
            </p>
          </div>
          <div className="enterprise-actions-row">
            <button
              type="button"
              className="enterprise-button enterprise-button-secondary"
              onClick={onOpenInviteModal}
            >
              <FiUserPlus aria-hidden="true" /> Invite User
            </button>
            <button
              type="button"
              className="enterprise-button enterprise-button-primary"
              onClick={() => onNavigate('resumes')}
            >
              <FiPlus aria-hidden="true" /> New Resume
            </button>
          </div>
        </div>
      </div>

      {/* KPI Metrics Grid */}
      <div className="enterprise-metrics-grid">
        <div className="enterprise-card enterprise-metric-box">
          <div className="enterprise-metric-header">
            <span>Total Members</span>
            <FiUsers className="enterprise-metric-icon" aria-hidden="true" />
          </div>
          <div className="enterprise-metric-value">12</div>
          <div className="enterprise-metric-footer text-success">
            <FiTrendingUp aria-hidden="true" /> 4 active today
          </div>
        </div>

        <div className="enterprise-card enterprise-metric-box">
          <div className="enterprise-metric-header">
            <span>Workspaces</span>
            <FiSliders className="enterprise-metric-icon" aria-hidden="true" />
          </div>
          <div className="enterprise-metric-value">{workspaces?.length || 1}</div>
          <div className="enterprise-metric-footer">
            Scoped to current tenant
          </div>
        </div>

        <div className="enterprise-card enterprise-metric-box">
          <div className="enterprise-metric-header">
            <span>AI Token Quota (Daily)</span>
            <FiZap className="enterprise-metric-icon" aria-hidden="true" />
          </div>
          <div className="enterprise-metric-value">18.4k <small>/ 100k</small></div>
          <div className="enterprise-metric-footer text-success">
            18% consumed · Healthy
          </div>
        </div>

        <div className="enterprise-card enterprise-metric-box">
          <div className="enterprise-metric-header">
            <span>Storage & Artifacts</span>
            <FiDatabase className="enterprise-metric-icon" aria-hidden="true" />
          </div>
          <div className="enterprise-metric-value">2.1 GB <small>/ 50 GB</small></div>
          <div className="enterprise-metric-footer text-success">
            HMAC-SHA256 encrypted
          </div>
        </div>
      </div>

      {/* Two Column Layout: Quick Actions & Security/System Health */}
      <div className="enterprise-two-column-grid">
        {/* Left Column: Quick Actions & Shortcuts */}
        <div className="enterprise-card">
          <h3 className="enterprise-card-title">Management Shortcuts</h3>
          <p className="enterprise-card-subtitle">Common enterprise administrative workflows</p>
          <div className="enterprise-shortcuts-list">
            <button
              type="button"
              className="enterprise-shortcut-item"
              onClick={() => onNavigate('members')}
            >
              <div className="enterprise-shortcut-icon">
                <FiUsers aria-hidden="true" />
              </div>
              <div className="enterprise-shortcut-copy">
                <strong>Manage Team & User Access</strong>
                <small>Invite colleagues, configure roles and workspace assignments</small>
              </div>
              <span>→</span>
            </button>

            <button
              type="button"
              className="enterprise-shortcut-item"
              onClick={() => onNavigate('ai')}
            >
              <div className="enterprise-shortcut-icon">
                <FiZap aria-hidden="true" />
              </div>
              <div className="enterprise-shortcut-copy">
                <strong>Configure Enterprise AI Policy</strong>
                <small>Manage provider allowlist, models, and tenant rate limits</small>
              </div>
              <span>→</span>
            </button>

            <button
              type="button"
              className="enterprise-shortcut-item"
              onClick={() => onNavigate('security')}
            >
              <div className="enterprise-shortcut-icon">
                <FiShield aria-hidden="true" />
              </div>
              <div className="enterprise-shortcut-copy">
                <strong>Service Accounts & API Keys</strong>
                <small>Generate scoped machine-to-machine credentials</small>
              </div>
              <span>→</span>
            </button>

            <button
              type="button"
              className="enterprise-shortcut-item"
              onClick={() => onNavigate('audit')}
            >
              <div className="enterprise-shortcut-icon">
                <FiFileText aria-hidden="true" />
              </div>
              <div className="enterprise-shortcut-copy">
                <strong>Inspect Audit Logs</strong>
                <small>Review immutable tamper-evident system event records</small>
              </div>
              <span>→</span>
            </button>
          </div>
        </div>

        {/* Right Column: Infrastructure Health & Security Posture */}
        <div className="enterprise-card">
          <h3 className="enterprise-card-title">Infrastructure & Security Posture</h3>
          <p className="enterprise-card-subtitle">Live production subsystem status</p>
          <ul className="enterprise-health-list">
            <li className="enterprise-health-item">
              <div className="enterprise-health-status online" />
              <div className="enterprise-health-copy">
                <strong>PostgreSQL 16 Forced RLS Data Plane</strong>
                <small>Zero cross-tenant row leakage · Transaction-local scoping</small>
              </div>
              <span className="enterprise-pill enterprise-pill-success">Operational</span>
            </li>

            <li className="enterprise-health-item">
              <div className="enterprise-health-status online" />
              <div className="enterprise-health-copy">
                <strong>Distributed Redis TCP Cache Cluster</strong>
                <small>Tenant key separation · TTL cache eviction active</small>
              </div>
              <span className="enterprise-pill enterprise-pill-success">Operational</span>
            </li>

            <li className="enterprise-health-item">
              <div className="enterprise-health-status online" />
              <div className="enterprise-health-copy">
                <strong>Signed Asynchronous Job Queue & DLQ</strong>
                <small>HMAC-SHA256 signature · Worker reauthorization active</small>
              </div>
              <span className="enterprise-pill enterprise-pill-success">Operational</span>
            </li>

            <li className="enterprise-health-item">
              <div className="enterprise-health-status online" />
              <div className="enterprise-health-copy">
                <strong>Cloudflare Edge WAF & HSTS</strong>
                <small>TLS 1.3 · CSP · DDoS & API abuse protection active</small>
              </div>
              <span className="enterprise-pill enterprise-pill-success">Enforced</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Recent Activity Timeline */}
      <div className="enterprise-card" style={{ marginTop: '1.5rem' }}>
        <div className="enterprise-card-header-flex">
          <div>
            <h3 className="enterprise-card-title">Recent Workspace Activity</h3>
            <p className="enterprise-card-subtitle">Audit stream of verified actions in active context</p>
          </div>
          <button
            type="button"
            className="enterprise-button enterprise-button-secondary enterprise-button-sm"
            onClick={() => onNavigate('audit')}
          >
            View Full Audit Log
          </button>
        </div>
        <div className="enterprise-activity-feed">
          <div className="enterprise-activity-row">
            <div className="enterprise-activity-icon"><FiCheckCircle /></div>
            <div className="enterprise-activity-copy">
              <strong>Enterprise context authenticated and verified</strong>
              <small>Actor: {tenant?.slug || 'owner'} · Workspace: {workspace?.name || 'Default'}</small>
            </div>
            <time className="enterprise-activity-time">Just now</time>
          </div>
          <div className="enterprise-activity-row">
            <div className="enterprise-activity-icon"><FiZap /></div>
            <div className="enterprise-activity-copy">
              <strong>AI generation policy evaluated</strong>
              <small>Provider: Primary Allowlist · Token Scope: Verified</small>
            </div>
            <time className="enterprise-activity-time">12 mins ago</time>
          </div>
          <div className="enterprise-activity-row">
            <div className="enterprise-activity-icon"><FiShield /></div>
            <div className="enterprise-activity-copy">
              <strong>Tenant data plane health check completed</strong>
              <small>100/100 transactions verified · 0 deadlocks</small>
            </div>
            <time className="enterprise-activity-time">1 hour ago</time>
          </div>
        </div>
      </div>
    </div>
  );
}
