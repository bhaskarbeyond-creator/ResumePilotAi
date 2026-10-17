/**
 * Enterprise Multi-Tenant Console
 *
 * Dedicated administration console for enterprise organizations:
 * - Organization summary (Seats, AI token quotas, active domains)
 * - Member & RBAC role administration (Owner, Admin, Reviewer, Member)
 * - Enterprise Security & SSO (SAML 2.0, Okta, Azure AD, Enforced 2FA)
 * - Audit Log & Governance Telemetry
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Building2,
  Users,
  ShieldCheck,
  Key,
  Activity,
  Plus,
  Search,
  CheckCircle2,
  UserPlus,
  Lock,
  Globe,
  Download,
  X,
  Sparkles,
} from 'lucide-react';

interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Reviewer' | 'Member';
  twoFactorEnabled: boolean;
  lastActive: string;
}

interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  ip: string;
  timestamp: string;
}

const INITIAL_MEMBERS: OrgMember[] = [
  {
    id: 'mem-1',
    name: 'Sarah Connor',
    email: 's.connor@cyberdyne.org',
    role: 'Owner',
    twoFactorEnabled: true,
    lastActive: 'Just now',
  },
  {
    id: 'mem-2',
    name: 'Miles Dyson',
    email: 'm.dyson@cyberdyne.org',
    role: 'Admin',
    twoFactorEnabled: true,
    lastActive: '25 mins ago',
  },
  {
    id: 'mem-3',
    name: 'Kyle Reese',
    email: 'k.reese@cyberdyne.org',
    role: 'Reviewer',
    twoFactorEnabled: true,
    lastActive: '3 hours ago',
  },
  {
    id: 'mem-4',
    name: 'John Connor',
    email: 'j.connor@cyberdyne.org',
    role: 'Member',
    twoFactorEnabled: false,
    lastActive: 'Yesterday',
  },
];

const INITIAL_AUDIT_LOGS: AuditEvent[] = [
  {
    id: 'aud-1',
    actor: 'Sarah Connor',
    action: 'sso.configured',
    target: 'Okta SAML 2.0 Identity Provider',
    ip: '192.0.2.45',
    timestamp: 'Oct 17, 2026 21:40',
  },
  {
    id: 'aud-2',
    actor: 'Miles Dyson',
    action: 'member.role_updated',
    target: 'Kyle Reese → Reviewer',
    ip: '198.51.100.12',
    timestamp: 'Oct 17, 2026 19:15',
  },
  {
    id: 'aud-3',
    actor: 'Kyle Reese',
    action: 'candidate.exported_dox',
    target: 'Resume Candidate ID #8491',
    ip: '203.0.113.88',
    timestamp: 'Oct 17, 2026 18:02',
  },
  {
    id: 'aud-4',
    actor: 'Sarah Connor',
    action: 'ai_governance.quota_expanded',
    target: '+250,000 AI Tokens',
    ip: '192.0.2.45',
    timestamp: 'Oct 16, 2026 14:30',
  },
];

export function EnterpriseConsolePage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'security' | 'audit'>('overview');
  const [members, setMembers] = useState<OrgMember[]>(INITIAL_MEMBERS);
  const [auditLogs] = useState<AuditEvent[]>(INITIAL_AUDIT_LOGS);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgMember['role']>('Member');
  const [memberSearch, setMemberSearch] = useState('');

  // SSO Settings State
  const [ssoEnabled, setSsoEnabled] = useState(true);
  const [enforce2FA, setEnforce2FA] = useState(true);
  const [domainVerified] = useState(true);

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    const newMember: OrgMember = {
      id: `mem-${Date.now()}`,
      name: inviteName || inviteEmail.split('@')[0],
      email: inviteEmail,
      role: inviteRole,
      twoFactorEnabled: false,
      lastActive: 'Invited (Pending)',
    };

    setMembers([...members, newMember]);
    setShowInviteModal(false);
    setInviteEmail('');
    setInviteName('');
    setInviteRole('Member');
  };

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.email.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.role.toLowerCase().includes(memberSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* ─── Top Enterprise Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-edge pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
              <Building2 className="size-6 text-accent" />
              Cyberdyne Systems Org Console
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-accent-soft text-accent border border-accent/20">
              Enterprise Tier
            </span>
          </div>
          <p className="text-sm text-ink-muted mt-1">
            Centralized multi-seat tenant management, RBAC enforcement, and compliance audit log.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            onClick={() => setShowInviteModal(true)}
            className="text-xs font-semibold gap-1.5"
          >
            <UserPlus className="size-3.5" />
            Invite Member
          </Button>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex items-center gap-1 border-b border-edge overflow-x-auto pb-px">
        {[
          { id: 'overview', label: 'Organization Overview', icon: Building2 },
          { id: 'members', label: `Team Members (${members.length})`, icon: Users },
          { id: 'security', label: 'SSO & Security', icon: ShieldCheck },
          { id: 'audit', label: 'Audit Log & Governance', icon: Activity },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
                isActive
                  ? 'border-accent text-accent font-semibold'
                  : 'border-transparent text-ink-muted hover:text-ink hover:border-edge-strong'
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: Overview ─── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-edge shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted">Seats Allocated</span>
                  <Users className="size-4 text-accent" />
                </div>
                <div className="text-2xl font-bold text-ink">{members.length} / 50</div>
                <div className="w-full bg-canvas-soft rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-accent h-1.5 rounded-full"
                    style={{ width: `${(members.length / 50) * 100}%` }}
                  />
                </div>
                <p className="text-[11px] text-ink-muted">46 seats remaining in active pool</p>
              </CardContent>
            </Card>

            <Card className="border-edge shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted">AI Word/Token Quota</span>
                  <Sparkles className="size-4 text-accent" />
                </div>
                <div className="text-2xl font-bold text-ink">485k / 1.0M</div>
                <div className="w-full bg-canvas-soft rounded-full h-1.5 overflow-hidden">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '48.5%' }} />
                </div>
                <p className="text-[11px] text-ink-muted">515,000 tokens available this billing cycle</p>
              </CardContent>
            </Card>

            <Card className="border-edge shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted">Security Compliance</span>
                  <ShieldCheck className="size-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">100%</div>
                <div className="w-full bg-canvas-soft rounded-full h-1.5 overflow-hidden">
                  <div className="bg-emerald-500 h-1.5 rounded-full w-full" />
                </div>
                <p className="text-[11px] text-ink-muted">SOC2 & GDPR Enforced Policies Active</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-edge shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Tenant Identity & Domain Verification</CardTitle>
              <CardDescription className="text-xs">
                Verified organizational domains enable automatic employee provisioning via SAML.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3.5 rounded-xl border border-edge bg-canvas-soft flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="size-5 text-accent" />
                  <div>
                    <div className="font-bold text-xs text-ink">cyberdyne.org</div>
                    <div className="text-[11px] text-ink-muted">DNS TXT record verified on Oct 10, 2026</div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="size-3" />
                  Verified
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── TAB 2: Team Members & RBAC ─── */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative max-w-sm w-full">
              <Search className="size-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search by name, email, or role..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>
            <Button
              size="sm"
              onClick={() => setShowInviteModal(true)}
              className="text-xs gap-1.5 self-end sm:self-auto"
            >
              <Plus className="size-3.5" />
              Add Team Member
            </Button>
          </div>

          <div className="border border-edge rounded-xl bg-surface overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-edge bg-canvas-soft/70">
                  <th className="p-3.5 font-semibold text-ink">Member</th>
                  <th className="p-3.5 font-semibold text-ink">Role</th>
                  <th className="p-3.5 font-semibold text-ink text-center">2FA Status</th>
                  <th className="p-3.5 font-semibold text-ink">Last Active</th>
                  <th className="p-3.5 font-semibold text-ink text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/60">
                {filteredMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-canvas-soft/20 transition-colors">
                    <td className="p-3.5">
                      <div className="font-bold text-ink">{m.name}</div>
                      <div className="text-[11px] text-ink-muted">{m.email}</div>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border',
                          m.role === 'Owner'
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                            : m.role === 'Admin'
                            ? 'bg-accent-soft text-accent border-accent/20'
                            : 'bg-canvas-soft text-ink border-edge'
                        )}
                      >
                        {m.role}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      {m.twoFactorEnabled ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                          <ShieldCheck className="size-3.5" />
                          Enforced
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                          Pending Setup
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-ink-muted text-[11px]">{m.lastActive}</td>
                    <td className="p-3.5 text-right">
                      {m.role !== 'Owner' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-ink-muted hover:text-red-500"
                          onClick={() => setMembers(members.filter((x) => x.id !== m.id))}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 3: SSO & Security ─── */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <Card className="border-edge shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="size-4 text-accent" />
                Single Sign-On (SAML 2.0 / Okta / Azure AD)
              </CardTitle>
              <CardDescription className="text-xs">
                Allow team members to sign in using your enterprise Identity Provider (IdP).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-edge bg-canvas-soft">
                <div>
                  <div className="text-xs font-bold text-ink">Enable SAML 2.0 Authentication</div>
                  <div className="text-[11px] text-ink-muted">Redirect unauthenticated users to corporate IdP</div>
                </div>
                <input
                  type="checkbox"
                  checked={ssoEnabled}
                  onChange={(e) => setSsoEnabled(e.target.checked)}
                  className="size-4 text-accent rounded focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">SAML 2.0 Entity ID</label>
                  <Input
                    readOnly
                    value="https://ime365.com/sso/saml/cyberdyne"
                    className="text-xs h-9 bg-canvas-soft font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">ACS URL (Assertion Consumer)</label>
                  <Input
                    readOnly
                    value="https://ime365.com/api/sso/saml/consume"
                    className="text-xs h-9 bg-canvas-soft font-mono"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-edge shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="size-4 text-accent" />
                Organization-Wide Security Policies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-edge bg-canvas-soft">
                <div>
                  <div className="text-xs font-bold text-ink">Enforce Multi-Factor Authentication (MFA / TOTP)</div>
                  <div className="text-[11px] text-ink-muted">Require all members to authenticate with an authenticator app</div>
                </div>
                <input
                  type="checkbox"
                  checked={enforce2FA}
                  onChange={(e) => setEnforce2FA(e.target.checked)}
                  className="size-4 text-accent rounded focus:ring-accent"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── TAB 4: Audit Log ─── */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-muted">
              Tamper-evident log of all administrative actions and security events.
            </p>
            <Button variant="outline" size="sm" className="text-xs gap-1.5">
              <Download className="size-3.5" />
              Export Audit CSV
            </Button>
          </div>

          <div className="border border-edge rounded-xl bg-surface overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-edge bg-canvas-soft/70">
                  <th className="p-3.5 font-semibold text-ink">Timestamp</th>
                  <th className="p-3.5 font-semibold text-ink">Actor</th>
                  <th className="p-3.5 font-semibold text-ink">Action</th>
                  <th className="p-3.5 font-semibold text-ink">Target / Resource</th>
                  <th className="p-3.5 font-semibold text-ink text-right">Origin IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/60">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-canvas-soft/20 transition-colors">
                    <td className="p-3.5 font-mono text-ink-muted text-[11px]">{log.timestamp}</td>
                    <td className="p-3.5 font-bold text-ink">{log.actor}</td>
                    <td className="p-3.5">
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-canvas-soft border border-edge text-ink">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3.5 text-ink-muted">{log.target}</td>
                    <td className="p-3.5 text-right font-mono text-ink-muted text-[11px]">{log.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Invite Member Modal ─── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-edge rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 relative animate-in fade-in zoom-in-95">
            <button
              type="button"
              onClick={() => setShowInviteModal(false)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors"
            >
              <X className="size-5" />
            </button>

            <div>
              <h3 className="text-base font-bold text-ink">Invite Team Member</h3>
              <p className="text-xs text-ink-muted">
                Send an invitation to join your enterprise organization workspace.
              </p>
            </div>

            <form onSubmit={handleInvite} className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Email Address</label>
                <Input
                  required
                  type="email"
                  placeholder="colleague@cyberdyne.org"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Full Name (Optional)</label>
                <Input
                  placeholder="e.g. John Doe"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Role & Permissions</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as OrgMember['role'])}
                  className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  <option value="Member">Member (Create & edit own resumes)</option>
                  <option value="Reviewer">Reviewer (Review candidate resumes & ATS scores)</option>
                  <option value="Admin">Admin (Manage members, quotas, and security)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowInviteModal(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="text-xs font-semibold">
                  Send Invitation
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
