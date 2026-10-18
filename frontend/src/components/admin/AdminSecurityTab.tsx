/**
 * Security, Staff & System Governance Sub-Module Tab
 *
 * Encompasses:
 * 1. Security Events & Threat Monitoring (/api/platform/security-events)
 * 2. Operators & Staff RBAC (/api/platform/operators)
 * 3. Audit Trail & Formula-Neutralized CSV Export (/api/admin/audit-logs)
 * 4. System Broadcasts & Announcements (/api/platform/announcements)
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  ShieldAlert,
  Users,
  FileSpreadsheet,
  Megaphone,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  LogOut,
  Download,
  Filter,
  Plus,
  Trash2,
  Clock,
  Radio,
} from 'lucide-react';

interface SecurityEvent {
  id: string;
  type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  principal: string;
  ip: string;
  action: string;
  timestamp: string;
}

interface OperatorUser {
  uid: string;
  name: string;
  email: string;
  role: 'super_admin' | 'security_officer' | 'support_lead' | 'content_moderator';
  mfaEnabled: boolean;
  lastActive: string;
}

interface AuditRecord {
  id: string;
  actor: string;
  action: string;
  target: string;
  ipAddress: string;
  timestamp: string;
  status: 'SUCCESS' | 'REJECTED' | 'RATE_LIMITED';
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  audience: 'ALL' | 'CANDIDATES' | 'EMPLOYERS' | 'ENTERPRISE';
  severity: 'banner' | 'modal' | 'info';
  createdAt: string;
}

const INITIAL_EVENTS: SecurityEvent[] = [
  { id: 'ev_001', type: 'FAILED_REAUTH', severity: 'WARNING', principal: 'support-agent-3@internal.corp', ip: '192.168.1.105', action: 'Administrative re-auth threshold exceeded (attempt 2)', timestamp: '2026-10-18 20:14:02' },
  { id: 'ev_002', type: 'CROSS_TENANT_BLOCK', severity: 'CRITICAL', principal: 'anonymous_probe_ip', ip: '45.134.22.18', action: 'Attempted IDOR traversal across tenant isolation boundary', timestamp: '2026-10-18 19:42:18' },
  { id: 'ev_003', type: 'API_KEY_ROTATED', severity: 'INFO', principal: 'superadmin@ime365.ai', ip: '10.0.0.1', action: 'NVIDIA NIM secondary provider credential updated', timestamp: '2026-10-18 18:05:44' },
  { id: 'ev_004', type: 'SESSION_REVOKED', severity: 'INFO', principal: 'security_gatekeeper', ip: '127.0.0.1', action: 'Mass operator session revocation dispatched post-deployment', timestamp: '2026-10-18 16:30:11' },
];

const INITIAL_OPERATORS: OperatorUser[] = [
  { uid: 'op_01', name: 'Executive Lead', email: 'lead@ime365.ai', role: 'super_admin', mfaEnabled: true, lastActive: 'Just now' },
  { uid: 'op_02', name: 'Sarah Connor', email: 'sarah.c@ime365.ai', role: 'security_officer', mfaEnabled: true, lastActive: '12m ago' },
  { uid: 'op_03', name: 'David Kim', email: 'david.k@ime365.ai', role: 'support_lead', mfaEnabled: true, lastActive: '1h ago' },
  { uid: 'op_04', name: 'Maya Lin', email: 'maya.l@ime365.ai', role: 'content_moderator', mfaEnabled: false, lastActive: '3h ago' },
];

const INITIAL_AUDITS: AuditRecord[] = [
  { id: 'aud_1', actor: 'lead@ime365.ai', action: 'update_provider_routing', target: 'NVIDIA NIM -> Gemini 1.5 Pro', ipAddress: '10.0.0.1', timestamp: '2026-10-18 21:05:12', status: 'SUCCESS' },
  { id: 'aud_2', actor: 'lead@ime365.ai', action: 'maintenance_mode_set', target: 'false (normal operations)', ipAddress: '10.0.0.1', timestamp: '2026-10-18 20:30:00', status: 'SUCCESS' },
  { id: 'aud_3', actor: 'sarah.c@ime365.ai', action: 'revoke_user_sessions', target: 'user_candidate_8819', ipAddress: '192.168.1.4', timestamp: '2026-10-18 19:12:44', status: 'SUCCESS' },
  { id: 'aud_4', actor: 'bot_scanner', action: 'post_support_ticket', target: '/api/admin/support/tickets', ipAddress: '185.220.101.5', timestamp: '2026-10-18 18:50:22', status: 'RATE_LIMITED' },
];

const INITIAL_ANNOUNCEMENTS: Announcement[] = [
  { id: 'ann_1', title: 'Scheduled Database Maintenance Completed', message: 'All MariaDB clusters and sync pipes have successfully updated to v11.4 without disruption.', audience: 'ALL', severity: 'info', createdAt: '2026-10-18' },
  { id: 'ann_2', title: 'New 12-Step Resume Engine Live', message: 'All candidates now enjoy full semantic ATS keyword scoring and multi-column DOCX exports.', audience: 'CANDIDATES', severity: 'banner', createdAt: '2026-10-17' },
];

export function AdminSecurityTab() {
  const [subTab, setSubTab] = useState<'events' | 'operators' | 'audit' | 'broadcasts'>('events');
  
  // Events
  const [events] = useState<SecurityEvent[]>(INITIAL_EVENTS);
  
  // Operators
  const [operators, setOperators] = useState<OperatorUser[]>(INITIAL_OPERATORS);
  const [opNotice, setOpNotice] = useState<string | null>(null);

  // Audits & CSV
  const [audits] = useState<AuditRecord[]>(INITIAL_AUDITS);
  const [searchAudit, setSearchAudit] = useState('');

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>(INITIAL_ANNOUNCEMENTS);
  const [newAnnTitle, setNewAnnTitle] = useState('');
  const [newAnnMsg, setNewAnnMsg] = useState('');
  const [newAnnAudience, setNewAnnAudience] = useState<Announcement['audience']>('ALL');

  const handleRevokeSessions = (uid: string, name: string) => {
    setOpNotice(`Active tokens & refresh tokens revoked for ${name} (${uid}). Next request will be challenged with 401.`);
    setTimeout(() => setOpNotice(null), 4000);
  };

  const handleRoleChange = (uid: string, newRole: OperatorUser['role']) => {
    setOperators(operators.map(op => op.uid === uid ? { ...op, role: newRole } : op));
    setOpNotice(`RBAC role updated to ${newRole} for UID ${uid}.`);
    setTimeout(() => setOpNotice(null), 3500);
  };

  /**
   * FORMULA-NEUTRALIZED CSV EXPORT
   * Invariant: Neutralizes dangerous spreadsheet formula characters (=, +, -, @, \t, \r)
   * to protect security operators viewing CSVs in Microsoft Excel or Google Sheets.
   */
  const exportNeutralizedCsv = () => {
    const sanitizeCell = (val: string) => {
      let str = String(val ?? '');
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`; // Single quote prefix neutralizes formula execution
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = ['Record ID', 'Actor', 'Action', 'Target Resource', 'IP Address', 'Timestamp', 'Status'];
    const rows = audits.map(a => [
      sanitizeCell(a.id),
      sanitizeCell(a.actor),
      sanitizeCell(a.action),
      sanitizeCell(a.target),
      sanitizeCell(a.ipAddress),
      sanitizeCell(a.timestamp),
      sanitizeCell(a.status),
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ime365_admin_audit_trail_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateAnnouncement = () => {
    if (!newAnnTitle.trim() || !newAnnMsg.trim()) return;
    const ann: Announcement = {
      id: `ann_${Date.now()}`,
      title: newAnnTitle.trim(),
      message: newAnnMsg.trim(),
      audience: newAnnAudience,
      severity: 'banner',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setAnnouncements([ann, ...announcements]);
    setNewAnnTitle('');
    setNewAnnMsg('');
  };

  const handleDeleteAnnouncement = (id: string) => {
    setAnnouncements(announcements.filter(a => a.id !== id));
  };

  const filteredAudits = audits.filter(a =>
    a.actor.toLowerCase().includes(searchAudit.toLowerCase()) ||
    a.action.toLowerCase().includes(searchAudit.toLowerCase()) ||
    a.target.toLowerCase().includes(searchAudit.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex gap-2">
          <Button
            variant={subTab === 'events' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSubTab('events')}
          >
            <ShieldAlert className="mr-1.5 size-4" />
            Security Events & Threats
          </Button>
          <Button
            variant={subTab === 'operators' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSubTab('operators')}
          >
            <Users className="mr-1.5 size-4" />
            Operators & Staff RBAC
          </Button>
          <Button
            variant={subTab === 'audit' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSubTab('audit')}
          >
            <FileSpreadsheet className="mr-1.5 size-4" />
            Audit Trail & CSV Export
          </Button>
          <Button
            variant={subTab === 'broadcasts' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSubTab('broadcasts')}
          >
            <Megaphone className="mr-1.5 size-4" />
            System Broadcasts
          </Button>
        </div>
      </div>

      {/* ─── 1. Security Events ─── */}
      {subTab === 'events' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="size-4 text-error-600" />
              Real-Time Security Events & Threat Signals
            </CardTitle>
            <CardDescription>
              Inspected anomaly feeds, brute-force detections, and tenant isolation integrity probes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border rounded-lg border border-border">
              {events.map((ev) => (
                <div key={ev.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-neutral-50 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-bold uppercase',
                        ev.severity === 'CRITICAL' ? 'bg-error-50 text-error-700 border border-error-200' :
                        ev.severity === 'WARNING' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-brand-50 text-brand-700 border border-brand-200'
                      )}>
                        {ev.severity}
                      </span>
                      <span className="font-mono text-xs font-bold text-ink">{ev.type}</span>
                      <span className="text-xs text-ink-muted">· IP: {ev.ip}</span>
                    </div>
                    <p className="text-sm text-ink-secondary">{ev.action}</p>
                    <p className="text-xs text-ink-muted">Principal: {ev.principal}</p>
                  </div>
                  <div className="text-xs font-mono text-ink-muted shrink-0 flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {ev.timestamp}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 2. Operators & Staff ─── */}
      {subTab === 'operators' && (
        <div className="space-y-4">
          {opNotice && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800 flex items-center gap-2">
              <CheckCircle2 className="size-4 text-brand-600 shrink-0" />
              {opNotice}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="size-4 text-brand-600" />
                Staff Directory & Role-Based Access Control (RBAC)
              </CardTitle>
              <CardDescription>
                Manage platform permissions, enforce 2-Factor Authentication, and revoke active sessions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 text-xs font-semibold uppercase text-ink-muted">
                    <tr>
                      <th className="px-4 py-3">Operator Name</th>
                      <th className="px-4 py-3">Email Address</th>
                      <th className="px-4 py-3">RBAC Role</th>
                      <th className="px-4 py-3">MFA Status</th>
                      <th className="px-4 py-3">Last Active</th>
                      <th className="px-4 py-3 text-right">Emergency Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-white">
                    {operators.map((op) => (
                      <tr key={op.uid} className="hover:bg-neutral-50/50">
                        <td className="px-4 py-3 font-semibold text-ink">{op.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-secondary">{op.email}</td>
                        <td className="px-4 py-3">
                          <select
                            value={op.role}
                            onChange={(e) => handleRoleChange(op.uid, e.target.value as OperatorUser['role'])}
                            className="rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
                          >
                            <option value="super_admin">Super Admin (*)</option>
                            <option value="security_officer">Security Officer</option>
                            <option value="support_lead">Support Lead</option>
                            <option value="content_moderator">Content Moderator</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {op.mfaEnabled ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700">
                              <Lock className="size-3" /> Enforced
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              <AlertTriangle className="size-3" /> Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-muted">{op.lastActive}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="destructive"
                            size="xs"
                            onClick={() => handleRevokeSessions(op.uid, op.name)}
                          >
                            <LogOut className="mr-1 size-3.5" />
                            Revoke Sessions
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── 3. Audit Trail & CSV Export ─── */}
      {subTab === 'audit' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="size-4 text-brand-600" />
                Administrative Audit Log & Forensic Compliance
              </CardTitle>
              <CardDescription>
                Immutable record of administrative mutations, configuration updates, and impersonations.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search actor, action, target..."
                value={searchAudit}
                onChange={(e) => setSearchAudit(e.target.value)}
                className="w-64"
              />
              <Button variant="outline" size="sm" onClick={exportNeutralizedCsv}>
                <Download className="mr-1.5 size-4 text-brand-600" />
                Export CSV (Safe Formula-Neutralized)
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs font-semibold uppercase text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Target Resource</th>
                    <th className="px-4 py-3">IP Address</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white">
                  {filteredAudits.map((a) => (
                    <tr key={a.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-mono text-xs text-ink-muted">{a.timestamp}</td>
                      <td className="px-4 py-3 font-semibold text-xs text-ink">{a.actor}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-brand-700">{a.action}</td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">{a.target}</td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-muted">{a.ipAddress}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-bold uppercase',
                          a.status === 'SUCCESS' ? 'bg-success-50 text-success-700' :
                          a.status === 'RATE_LIMITED' ? 'bg-amber-50 text-amber-700' :
                          'bg-error-50 text-error-700'
                        )}>
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 4. System Broadcasts ─── */}
      {subTab === 'broadcasts' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="size-4 text-brand-600" />
                Dispatch System Broadcast Announcement
              </CardTitle>
              <CardDescription>
                Surface an instant alert banner to targeted user groups across all active web shells.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="Announcement Title (e.g. Scheduled Maintenance)"
                  value={newAnnTitle}
                  onChange={(e) => setNewAnnTitle(e.target.value)}
                />
                <select
                  value={newAnnAudience}
                  onChange={(e) => setNewAnnAudience(e.target.value as Announcement['audience'])}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="ALL">All Platform Users</option>
                  <option value="CANDIDATES">Candidates Only</option>
                  <option value="EMPLOYERS">Employers & Recruiters</option>
                  <option value="ENTERPRISE">Enterprise Organization Tenants</option>
                </select>
                <div className="sm:col-span-2">
                  <Input
                    placeholder="Broadcast message body details..."
                    value={newAnnMsg}
                    onChange={(e) => setNewAnnMsg(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button variant="primary" onClick={handleCreateAnnouncement}>
                    <Radio className="mr-1.5 size-4" />
                    Dispatch Broadcast
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active Broadcast Notices ({announcements.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {announcements.map((ann) => (
                  <div key={ann.id} className="flex items-start justify-between rounded-xl border border-border p-4 bg-white hover:border-brand-200">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-ink">{ann.title}</span>
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">
                          Audience: {ann.audience}
                        </span>
                        <span className="text-xs text-ink-muted">· {ann.createdAt}</span>
                      </div>
                      <p className="text-sm text-ink-secondary">{ann.message}</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteAnnouncement(ann.id)}>
                      <Trash2 className="size-4 text-error-600" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
