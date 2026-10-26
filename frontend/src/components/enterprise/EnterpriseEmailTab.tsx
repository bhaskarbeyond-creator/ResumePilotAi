/**
 * Enterprise Email Tab (Notification Templates & Candidate Branding)
 *
 * Enterprise invitation templates, candidate email branding, automated alerts,
 * and live test email delivery verification.
 */

import { useState } from 'react';
import {
  Mail,
  Send,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import { enterpriseApi } from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

export function EnterpriseEmailTab() {
  const { tenant, hasPermission } = useEnterprise();
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Email template config states
  const [senderName, setSenderName] = useState('Talent Acquisition Team');
  const [footerText, setFooterText] = useState('Sent via IME365 Enterprise Organization Portal');
  const [selectedTemplate, setSelectedTemplate] = useState<'invitation' | 'role_change' | 'quota_alert'>('invitation');
  const [savingSignature, setSavingSignature] = useState(false);

  const canManageEmail = hasPermission('tenant.settings.write');

  useState(() => {
    try {
      const savedSender = localStorage.getItem(`enterprise_email_sender_${tenant?.id || 'default'}`);
      const savedFooter = localStorage.getItem(`enterprise_email_footer_${tenant?.id || 'default'}`);
      if (savedSender) setSenderName(savedSender);
      if (savedFooter) setFooterText(savedFooter);
    } catch {
      // Ignore storage access error
    }
  });

  const handleSaveSignature = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSignature(true);
    try {
      localStorage.setItem(`enterprise_email_sender_${tenant?.id || 'default'}`, senderName);
      localStorage.setItem(`enterprise_email_footer_${tenant?.id || 'default'}`, footerText);
      setNotification('Sender signature and email template configuration saved.');
      setTimeout(() => setNotification(null), 3500);
    } catch {
      // Ignore
    } finally {
      setSavingSignature(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.id || !testEmail.trim() || sendingTest) return;

    setSendingTest(true);
    setError(null);
    try {
      await enterpriseApi.sendTestEmail(tenant.id, testEmail.trim());
      setNotification(`Test verification email dispatched to ${testEmail.trim()}.`);
      setTimeout(() => setNotification(null), 3500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch test email');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Notifications ─── */}
      {notification && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <Check className="size-4 shrink-0" />
          <span>{notification}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ─── Test Delivery Card ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
            <Send className="size-4 text-accent" />
            Live Email Delivery Probe
            <HelpTooltip text="Dispatches a live DKIM/SPF-signed transactional notification through the enterprise email transport." />
          </CardTitle>
          <CardDescription className="text-xs text-ink-muted mt-0.5">
            Verify transactional mail routing and recipient delivery.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <form onSubmit={handleSendTestEmail} className="flex flex-col sm:flex-row gap-3 max-w-lg">
            <Input
              type="email"
              required
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="recipient@company.com"
              className="text-xs h-9 bg-surface"
            />
            <Button type="submit" size="sm" disabled={sendingTest || !canManageEmail} className="shrink-0">
              <Send className="size-3.5 mr-1.5" />
              {sendingTest ? 'Sending…' : 'Send Test Probe'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ─── Notification Templates & Candidate Branding ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
            <Mail className="size-4 text-accent" />
            Enterprise Notification Templates & Sender Signature
          </CardTitle>
          <CardDescription className="text-xs text-ink-muted mt-0.5">
            Configure white-labeled invitation templates and candidate communication signatures.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-6">
          {/* Template Selectors */}
          <div className="flex items-center gap-2 border-b border-edge pb-3 text-xs font-semibold">
            {[
              { id: 'invitation', label: 'Member Invitation' },
              { id: 'role_change', label: 'Access Change Alert' },
              { id: 'quota_alert', label: 'AI Quota Warning' },
            ].map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => setSelectedTemplate(tmpl.id as any)}
                className={cn(
                  'px-3 py-1.5 rounded-lg transition-colors',
                  selectedTemplate === tmpl.id
                    ? 'bg-accent text-white shadow-2xs'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {tmpl.label}
              </button>
            ))}
          </div>

          {/* Template Preview */}
          <div className="p-6 rounded-xl border border-edge bg-surface/50 max-w-2xl text-xs space-y-3 font-sans">
            <div className="border-b border-edge/60 pb-3">
              <span className="font-bold text-ink">Subject: </span>
              <span className="text-ink-muted">
                {selectedTemplate === 'invitation' && `You have been invited to join ${tenant?.name || 'Cyberdyne Systems'} on IME365`}
                {selectedTemplate === 'role_change' && `Your enterprise role has been updated on ${tenant?.name || 'Cyberdyne Systems'}`}
                {selectedTemplate === 'quota_alert' && `[Warning] Daily AI token quota nearing capacity for ${tenant?.name || 'Cyberdyne Systems'}`}
              </span>
            </div>

            <div className="space-y-2 text-ink-muted leading-relaxed">
              <p>Hello,</p>
              {selectedTemplate === 'invitation' && (
                <p>
                  You have been invited to join the enterprise workspace on IME365. Click the button below to activate your seat and access shared executive CVs, AI resume tailoring, and candidate pipelines.
                </p>
              )}
              {selectedTemplate === 'role_change' && (
                <p>
                  An organization administrator has updated your RBAC authorization tier. Please log in to inspect your updated permissions.
                </p>
              )}
              {selectedTemplate === 'quota_alert' && (
                <p>
                  The organizational AI request consumption has exceeded 80% of today's contractual allowance. Please review high-volume queries in the Usage tab.
                </p>
              )}
              <div className="py-2">
                <Button size="sm" className="pointer-events-none">
                  Open Enterprise Console
                </Button>
              </div>
            </div>

            <div className="border-t border-edge/60 pt-3 text-xs text-ink-muted">
              <div>Sender: {senderName}</div>
              <div className="opacity-70 mt-0.5">{footerText}</div>
            </div>
          </div>

          {/* Signature Configuration Form */}
          <form onSubmit={handleSaveSignature} className="space-y-4 pt-4 border-t border-edge/60 max-w-2xl">
            <h4 className="text-xs font-bold text-ink">Custom Sender Signature & Disclaimer</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink block">Sender Display Name</label>
                <Input
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="e.g. Talent Acquisition Team"
                  disabled={!canManageEmail}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink block">Footer Disclaimer Text</label>
                <Input
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="e.g. Sent via Enterprise Portal"
                  disabled={!canManageEmail}
                  className="h-9 text-xs"
                />
              </div>
            </div>
            {canManageEmail && (
              <div className="flex justify-start">
                <Button type="submit" size="sm" disabled={savingSignature}>
                  {savingSignature ? 'Saving…' : 'Save Sender Signature'}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default EnterpriseEmailTab;
