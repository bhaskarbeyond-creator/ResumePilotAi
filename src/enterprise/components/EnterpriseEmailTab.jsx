import React, { useState } from 'react';
import {
  FiMail, FiSend, FiEye, FiCheck, FiRefreshCw, FiLock, FiSliders,
  FiUserPlus, FiShield, FiAlertTriangle, FiFileText
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import { useEnterpriseTenant } from '../EnterpriseContext';
import HelpTooltip from './HelpTooltip';

const DEFAULT_TEMPLATES = [
  {
    id: 'invitation',
    name: 'Member Invitation & Onboarding',
    category: 'Access & IAM',
    icon: FiUserPlus,
    subject: 'You\'re invited to join {{organization_name}} on ResumePilot Enterprise',
    description: 'Sent when an administrator invites a new teammate or provisions access to the enterprise workspace.',
    variables: ['{{organization_name}}', '{{inviter_name}}', '{{user_name}}', '{{role_title}}', '{{action_url}}', '{{expires_in}}'],
    body: `Hi {{user_name}},\n\n{{inviter_name}} has invited you to join the **{{organization_name}}** team workspace on ResumePilot AI.\n\n**Your Assigned Role:** {{role_title}}\n\nAs part of this workspace, you'll have full access to our collaborative resume builders, AI-assisted content tools, team templates, and candidate evaluation pipelines.\n\nTo activate your workspace access and get started, click the link below:\n\n{{action_url}}\n\n*Note: For your security, this invitation remains active for {{expires_in}}. If you weren't expecting this invitation, feel free to ignore this email or reach out to {{inviter_name}}.*\n\nWarm regards,\nThe {{organization_name}} Team`
  },
  {
    id: 'role_change',
    name: 'Access Level & Role Update',
    category: 'Access & IAM',
    icon: FiShield,
    subject: 'Access Role Updated: {{role_title}} — {{organization_name}}',
    description: 'Sent immediately when an administrator upgrades or downgrades a member’s role in the enterprise console.',
    variables: ['{{organization_name}}', '{{user_name}}', '{{updater_name}}', '{{role_title}}', '{{action_url}}'],
    body: `Hi {{user_name}},\n\nWe're letting you know that {{updater_name}} has updated your access permissions for **{{organization_name}}**.\n\n**Your Updated Role:** {{role_title}}\n\nThis update is already active, giving you immediate access to your updated team permissions, shared templates, and workspace tools.\n\nYou can view your updated workspace here:\n{{action_url}}\n\nIf you have any questions about this change, please feel free to connect with {{updater_name}} or your organization administrator.\n\nBest regards,\nThe {{organization_name}} Team`
  },
  {
    id: 'team_assignment',
    name: 'Workspace / Team Assignment',
    category: 'Collaboration',
    icon: FiSliders,
    subject: 'You\'ve been added to the {{team_name}} team in {{organization_name}}',
    description: 'Sent when a member is assigned to a functional squad or departmental workspace.',
    variables: ['{{organization_name}}', '{{user_name}}', '{{team_name}}', '{{workspace_name}}', '{{action_url}}'],
    body: `Hi {{user_name}},\n\nGreat news! You've been added to the **{{team_name}}** team within the **{{workspace_name}}** workspace in **{{organization_name}}**.\n\nYou can now collaborate with teammates, share live resume reviews, and access team-specific templates and AI workflows.\n\nJump into your new workspace here:\n{{action_url}}\n\nWe're excited to have you collaborating with the team!\n\nWarmly,\nThe {{organization_name}} Team`
  },
  {
    id: 'security_alert',
    name: 'Security & Break-Glass Support Access Alert',
    category: 'Security & Governance',
    icon: FiLock,
    subject: '🚨 Security Notice: Emergency Diagnostic Support Access for {{organization_name}}',
    description: 'High-priority notification sent to all Tenant Administrators whenever time-bound emergency support access is activated.',
    variables: ['{{organization_name}}', '{{granted_by}}', '{{support_agent}}', '{{reason}}', '{{expires_at}}', '{{action_url}}'],
    body: `Hello Enterprise Administrator,\n\nThis is an automated security notice informing you that time-bound emergency diagnostic support was authorized for **{{organization_name}}**.\n\n• **Authorized By:** {{granted_by}}\n• **Support Engineer:** {{support_agent}}\n• **Purpose:** {{reason}}\n• **Valid Until:** {{expires_at}}\n\nEvery diagnostic interaction is cryptographically signed and recorded to your organization's tamper-evident audit ledger.\n\nYou can inspect live diagnostic activity or revoke this grant at any time in your Security Center:\n{{action_url}}\n\nResumePilot Enterprise Security Team`
  },
  {
    id: 'quota_warning',
    name: 'AI Token Quota Velocity Alert',
    category: 'Usage & Billing',
    icon: FiAlertTriangle,
    subject: '⚠️ AI Quota Notice: {{organization_name}} has reached {{usage_percent}}% of monthly allocation',
    description: 'Proactive alert sent to Billing Administrators and Owners when token consumption approaches plan limits.',
    variables: ['{{organization_name}}', '{{usage_percent}}', '{{consumed_tokens}}', '{{quota_limit}}', '{{reset_date}}', '{{action_url}}'],
    body: `Hi Billing Administrator,\n\nWe wanted to give you a quick heads-up: **{{organization_name}}** has consumed **{{consumed_tokens}}** of its **{{quota_limit}}** monthly AI token allocation (**{{usage_percent}}%** of total capacity).\n\nYour organization's usage counter will reset on **{{reset_date}}**.\n\nTo ensure uninterrupted access to AI resume drafting, interview simulations, and ATS optimization for your teammates, you can review consumption trends or upgrade compute capacity here:\n\n{{action_url}}\n\nWarm regards,\nResumePilot Enterprise Billing Team`
  }
];

export default function EnterpriseEmailTab() {
  const { request, hasPermission } = useTenantApi();
  const { tenant, user } = useEnterpriseTenant();
  const [selectedTemplateId, setSelectedTemplateId] = useState('invitation');
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [previewMode, setPreviewMode] = useState(true);
  const [testEmail, setTestEmail] = useState(user?.email || '');
  const [sendingTest, setSendingTest] = useState(false);
  const [notification, setNotification] = useState(null);
  const [actionError, setActionError] = useState(null);

  const currentTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];
  const canManageSettings = hasPermission('tenant.settings.write');

  const notify = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleTemplateChange = (field, value) => {
    setTemplates(prev => prev.map(t => (t.id === selectedTemplateId ? { ...t, [field]: value } : t)));
  };

  const renderSamplePreview = (text) => {
    if (!text) return '';
    const org = tenant?.displayName || 'Babu M\'s Personal Workspace';
    const userName = user?.displayName || 'Alex Morgan';
    return text
      .replace(/{{organization_name}}/g, org)
      .replace(/{{inviter_name}}/g, `${user?.displayName || 'Babu M'} (Admin)`)
      .replace(/{{user_name}}/g, userName)
      .replace(/{{role_title}}/g, 'Enterprise Administrator')
      .replace(/{{team_name}}/g, 'Core Engineering')
      .replace(/{{workspace_name}}/g, 'North America Hub')
      .replace(/{{updater_name}}/g, 'Security Operations')
      .replace(/{{granted_by}}/g, 'Babu M (Tenant Owner)')
      .replace(/{{support_agent}}/g, 'support-tier3@resumepilot.ai')
      .replace(/{{reason}}/g, 'Investigating isolated outbox webhook latency')
      .replace(/{{expires_at}}/g, new Date(Date.now() + 4 * 3600 * 1000).toLocaleString())
      .replace(/{{usage_percent}}/g, '85')
      .replace(/{{consumed_tokens}}/g, '850,000')
      .replace(/{{quota_limit}}/g, '1,000,000')
      .replace(/{{reset_date}}/g, '1st of next month')
      .replace(/{{expires_in}}/g, '7 days')
      .replace(/{{action_url}}/g, `https://airesume.projectdemo.guru/enterprise?tenant=${tenant?.id || 'demo'}`);
  };

  const handleSendTest = async (e) => {
    e.preventDefault();
    if (!testEmail || sendingTest) return;
    setSendingTest(true);
    setActionError(null);
    try {
      const result = await request('/api/enterprise/test-email', {
        method: 'POST',
        body: {
          templateId: currentTemplate.id,
          recipientEmail: testEmail,
          customSubject: currentTemplate.subject,
          customBody: currentTemplate.body,
        },
      });
      notify(`Test email for "${currentTemplate.name}" dispatched to ${testEmail}! ${result?.messageId && result.messageId !== 'SENT' ? `(ID: ${result.messageId})` : ''}`);
    } catch (err) {
      setActionError(err?.message || 'Failed to dispatch test email. Verify SMTP settings in Administration.');
    } finally {
      setSendingTest(false);
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
            <div><strong>Email dispatch error</strong><p className="text-muted">{actionError}</p></div>
          </div>
        </div>
      )}

      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="enterprise-pill enterprise-pill-success">
                <FiMail aria-hidden="true" /> Enterprise Notification Gateway
              </span>
              <span className="enterprise-pill enterprise-pill-secondary">
                5 Configured Scenarios
              </span>
            </div>
            <h2 className="enterprise-tab-title">
              Email & Notification Templates
              <HelpTooltip text="Customize branded enterprise invitation emails, access change notifications, security alerts, and quota warnings" />
            </h2>
            <p className="enterprise-tab-subtitle">
              Configure tenant-branded communications, invitation email templates, and automated compliance alerts
            </p>
          </div>
        </div>

        <div className="enterprise-two-column-grid" style={{ marginTop: '24px', alignItems: 'start' }}>
          {/* Template Selection Sidebar */}
          <div className="enterprise-card" style={{ padding: '16px', background: 'var(--ep-slate-25)' }}>
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, margin: '0 0 12px', color: 'var(--enterprise-ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Notification Scenarios
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {templates.map(tmpl => {
                const Icon = tmpl.icon;
                const active = tmpl.id === selectedTemplateId;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    className={`enterprise-shortcut-item ${active ? 'active' : ''}`}
                    style={{
                      background: active ? '#fff' : 'transparent',
                      borderColor: active ? 'var(--ep-brand-500)' : 'var(--enterprise-border)',
                      boxShadow: active ? '0 2px 8px rgba(79, 70, 229, 0.12)' : 'none'
                    }}
                    onClick={() => setSelectedTemplateId(tmpl.id)}
                  >
                    <div className="enterprise-shortcut-icon" style={{ background: active ? 'var(--ep-brand-50)' : 'var(--ep-slate-100)' }}>
                      <Icon aria-hidden="true" />
                    </div>
                    <div className="enterprise-shortcut-copy">
                      <strong>{tmpl.name}</strong>
                      <small>{tmpl.category}</small>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Template Editor & Live Preview */}
          <div className="enterprise-card" style={{ padding: '24px' }}>
            <div className="enterprise-card-header-flex" style={{ marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--enterprise-ink)' }}>
                  {currentTemplate.name}
                </h3>
                <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>
                  {currentTemplate.description}
                </p>
              </div>
              <div className="enterprise-inline-actions" style={{ gap: '8px' }}>
                <button
                  type="button"
                  className={`enterprise-button enterprise-button-sm ${previewMode ? 'enterprise-button-primary' : 'enterprise-button-secondary'}`}
                  onClick={() => setPreviewMode(true)}
                >
                  <FiEye aria-hidden="true" /> Live Preview
                </button>
                <button
                  type="button"
                  className={`enterprise-button enterprise-button-sm ${!previewMode ? 'enterprise-button-primary' : 'enterprise-button-secondary'}`}
                  onClick={() => setPreviewMode(false)}
                >
                  <FiSliders aria-hidden="true" /> Edit Template
                </button>
              </div>
            </div>

            {previewMode ? (
              <div className="enterprise-email-preview-box" style={{ background: '#f8fafc', border: '1px solid var(--ep-slate-200)', borderRadius: '10px', padding: '20px', marginTop: '12px' }}>
                <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.76rem', color: '#64748b', marginBottom: '4px' }}>
                    <strong>From:</strong> ResumePilot Enterprise &lt;no-reply@projectdemo.guru&gt;
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b', marginBottom: '4px' }}>
                    <strong>To:</strong> {testEmail || 'member@organization.com'}
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                    <strong>Subject:</strong> {renderSamplePreview(currentTemplate.subject)}
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '24px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', marginBottom: '20px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem' }}>
                      R
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{tenant?.displayName || 'ResumePilot Enterprise'}</strong>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>Verified Organization Communications</span>
                    </div>
                  </div>

                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.88rem', color: '#334155' }}>
                    {renderSamplePreview(currentTemplate.body)}
                  </div>

                  <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center' }}>
                    This is an automated notification from {tenant?.displayName || 'ResumePilot Enterprise'}. Security keys and data planes are isolated per tenant policy.
                  </div>
                </div>

                {/* Send Test Email Action */}
                <form onSubmit={handleSendTest} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                  <input
                    type="email"
                    required
                    placeholder="Enter email to receive test preview…"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="enterprise-input"
                    style={{ maxWidth: '320px' }}
                  />
                  <button type="submit" className="enterprise-button enterprise-button-secondary enterprise-button-sm" disabled={sendingTest}>
                    <FiSend aria-hidden="true" /> {sendingTest ? 'Sending…' : 'Send Test Preview'}
                  </button>
                </form>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
                <div className="enterprise-form-group">
                  <label>Email Subject</label>
                  <input
                    type="text"
                    value={currentTemplate.subject}
                    onChange={(e) => handleTemplateChange('subject', e.target.value)}
                    className="enterprise-input"
                    disabled={!canManageSettings}
                  />
                </div>

                <div className="enterprise-form-group">
                  <label>Email Body Template</label>
                  <textarea
                    rows={12}
                    value={currentTemplate.body}
                    onChange={(e) => handleTemplateChange('body', e.target.value)}
                    className="enterprise-textarea"
                    style={{ fontFamily: 'monospace', fontSize: '0.82rem', lineHeight: 1.5 }}
                    disabled={!canManageSettings}
                  />
                </div>

                <div style={{ background: 'var(--ep-slate-50)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--ep-slate-200)' }}>
                  <strong style={{ fontSize: '0.78rem', color: 'var(--ep-slate-700)', display: 'block', marginBottom: '6px' }}>Available Substitution Tags:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {currentTemplate.variables.map(v => (
                      <code key={v} style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '4px', fontSize: '0.74rem', color: 'var(--ep-brand-700)' }}>
                        {v}
                      </code>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="enterprise-button enterprise-button-primary"
                    onClick={() => { notify(`Saved customized template for "${currentTemplate.name}".`); setPreviewMode(true); }}
                    disabled={!canManageSettings}
                  >
                    <FiCheck aria-hidden="true" /> Save Custom Template
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
