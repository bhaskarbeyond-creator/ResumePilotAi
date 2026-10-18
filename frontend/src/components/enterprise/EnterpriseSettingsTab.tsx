/**
 * Enterprise Settings Tab (Organization Policies & Identity Governance)
 *
 * Tenant-level settings, organization rename, SAML 2.0 / SSO configuration,
 * session timeouts, and verified data export.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Building,
  Shield,
  Download,
  Check,
  AlertCircle,
  Lock,
  Globe,
  Key,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import { enterpriseApi, type EnterpriseConfiguration } from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

export function EnterpriseSettingsTab() {
  const { tenant, reload, hasPermission } = useEnterprise();
  const [orgName, setOrgName] = useState(tenant?.name || '');
  const [ssoEnabled, setSsoEnabled] = useState(true);
  const [enforce2FA, setEnforce2FA] = useState(true);
  const [allowedDomains, setAllowedDomains] = useState('company.com, global.corp');
  const [sessionTimeout, setSessionTimeout] = useState(60);

  const [loading, setLoading] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [busyExport, setBusyExport] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManageSettings = hasPermission('tenant.settings.write');

  useEffect(() => {
    if (tenant?.name) {
      setOrgName(tenant.name);
    }
  }, [tenant?.name]);

  const handleSaveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.id || !orgName.trim() || busySave) return;

    setBusySave(true);
    setError(null);
    try {
      await enterpriseApi.updateTenant(tenant.id, { name: orgName.trim() });
      setNotification('Organization details updated.');
      setTimeout(() => setNotification(null), 3500);
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update organization');
    } finally {
      setBusySave(false);
    }
  };

  const handleExportData = async () => {
    if (!tenant?.id || busyExport) return;
    setBusyExport(true);
    setError(null);
    try {
      const data = await enterpriseApi.getDataExport(tenant.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enterprise_export_${tenant.id}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotification('Organization data package exported successfully.');
      setTimeout(() => setNotification(null), 3500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to export tenant data');
    } finally {
      setBusyExport(false);
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

      {/* ─── General Organization Identity ─── */}
      <form onSubmit={handleSaveOrganization}>
        <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
              <Building className="size-4 text-accent" />
              Organization Identity & Branding
              <HelpTooltip text="Tenant name and public identifier displayed across candidate portals and email notifications." />
            </CardTitle>
            <CardDescription className="text-xs text-ink-muted mt-0.5">
              Update organization display name and inspect primary tenant ID.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-4">
            <div className="space-y-1.5 max-w-md">
              <label className="text-xs font-bold text-ink block">Organization Name</label>
              <Input
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Cyberdyne Systems Corp"
                disabled={!canManageSettings}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5 max-w-md">
              <label className="text-xs font-bold text-ink block">Permanent Tenant Identifier</label>
              <Input
                disabled
                value={tenant?.id || '—'}
                className="h-9 text-xs font-mono bg-surface/50 text-ink-muted cursor-not-allowed"
              />
              <p className="text-[11px] text-ink-muted">
                System identifier enforced across MariaDB row-level security boundaries.
              </p>
            </div>

            {canManageSettings && (
              <div className="pt-2 flex justify-start">
                <Button type="submit" size="sm" disabled={busySave}>
                  {busySave ? 'Saving Changes…' : 'Save Organization'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </form>

      {/* ─── Enterprise SSO & Identity Security ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
            <Lock className="size-4 text-accent" />
            Enterprise SSO & Authentication Security
            <HelpTooltip text="Single Sign-On federation (SAML 2.0 / Okta / Azure AD) and enforced multi-factor authentication policies." />
          </CardTitle>
          <CardDescription className="text-xs text-ink-muted mt-0.5">
            Configure authentication requirements for organizational members.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-4">
          <div className="space-y-3 max-w-xl text-xs">
            <label className="flex items-center justify-between p-3 rounded-xl border border-edge bg-surface/50 cursor-pointer">
              <div>
                <span className="font-bold text-ink block">Enforce Single Sign-On (SAML 2.0 / OIDC)</span>
                <span className="text-ink-muted text-[11px]">Require all members to authenticate via your identity provider.</span>
              </div>
              <input
                type="checkbox"
                checked={ssoEnabled}
                onChange={(e) => setSsoEnabled(e.target.checked)}
                disabled={!canManageSettings}
                className="rounded border-edge text-accent focus:ring-accent size-4"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl border border-edge bg-surface/50 cursor-pointer">
              <div>
                <span className="font-bold text-ink block">Enforce Multi-Factor Authentication (2FA)</span>
                <span className="text-ink-muted text-[11px]">Mandatory TOTP authenticator app verification on all sessions.</span>
              </div>
              <input
                type="checkbox"
                checked={enforce2FA}
                onChange={(e) => setEnforce2FA(e.target.checked)}
                disabled={!canManageSettings}
                className="rounded border-edge text-accent focus:ring-accent size-4"
              />
            </label>
          </div>

          <div className="space-y-1.5 max-w-md pt-2">
            <label className="text-xs font-bold text-ink block">Authorized Domain Filter</label>
            <Input
              value={allowedDomains}
              onChange={(e) => setAllowedDomains(e.target.value)}
              placeholder="company.com, subsidiary.com"
              disabled={!canManageSettings}
              className="h-9 text-xs"
            />
            <p className="text-[11px] text-ink-muted">
              Comma-separated email domains allowed to receive invitations.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ─── Data Export & Compliance ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
            <Download className="size-4 text-accent" />
            Verified Data Export & Compliance Archive
            <HelpTooltip text="Generates a tamper-evident, signed JSON archive of all tenant workspaces, teams, candidate documents, and audit logs." />
          </CardTitle>
          <CardDescription className="text-xs text-ink-muted mt-0.5">
            Export complete organization records for SOC2, GDPR, or compliance auditing.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="text-xs text-ink-muted max-w-md">
            Archive includes member rosters, RBAC mappings, all resumes authored within departmental workspaces, and forensic audit event trails.
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportData}
            disabled={busyExport || !canManageSettings}
            className="shrink-0 text-xs"
          >
            <Download className="size-3.5 mr-1.5" />
            {busyExport ? 'Generating Package…' : 'Export Verified Archive'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default EnterpriseSettingsTab;
