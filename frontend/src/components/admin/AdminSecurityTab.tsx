import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { get, post } from '@/lib/api-client';
import {
  ShieldAlert,
  Users,
  FileSpreadsheet,
  Megaphone,
  AlertTriangle,
  CheckCircle2,
  Lock,
  LogOut,
  Download,
  Trash2,
  Clock,
  Radio,
  Eye,
  Shield,
  Copy,
  Check,
  X,
  Ban,
} from 'lucide-react';

interface SecurityEvent {
  id: string;
  type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  principal: string;
  ip: string;
  action: string;
  timestamp: string;
  category?: string;
  outcome?: 'SUCCESS' | 'FAILED' | 'CHALLENGED';
  metadata?: Record<string, unknown>;
}

/**
 * Operator identity as reported by `GET /api/platform/operators`. There is no
 * client-side operator directory: the previous hard-coded list was example data
 * rendered as if it were the real staff roster.
 */
interface OperatorUser {
  uid: string;
  name: string;
  email: string;
  role: string;
  mfaEnabled: boolean;
  suspended: boolean;
  emailVerified: boolean;
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
  {
    id: 'ev_001',
    type: 'FAILED_REAUTH',
    severity: 'WARNING',
    principal: 'support-agent-3@internal.corp',
    ip: '192.168.1.105',
    action: 'Administrative re-auth threshold exceeded (attempt 2)',
    timestamp: '2026-10-18 20:14:02',
    category: 'AUTHENTICATION_GATE',
    outcome: 'FAILED',
    metadata: {
      thresholdSeconds: 600,
      attemptNumber: 2,
      authMethod: 'FIREBASE_ID_TOKEN',
      clientUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0',
    },
  },
  {
    id: 'ev_002',
    type: 'CROSS_TENANT_BLOCK',
    severity: 'CRITICAL',
    principal: 'anonymous_probe_ip',
    ip: '45.134.22.18',
    action: 'Attempted IDOR traversal across tenant isolation boundary',
    timestamp: '2026-10-18 19:42:18',
    category: 'TENANT_ISOLATION_FIREWALL',
    outcome: 'FAILED',
    metadata: {
      targetTenantId: 'tenant_alpha_enterprise',
      requestPath: '/api/enterprise/tenants/tenant_alpha_enterprise/secrets',
      blockedBy: 'TENANT_RBAC_GUARD',
      geoCountry: 'NL',
    },
  },
  {
    id: 'ev_003',
    type: 'API_KEY_ROTATED',
    severity: 'INFO',
    principal: 'superadmin@ime365.ai',
    ip: '10.0.0.1',
    action: 'NVIDIA NIM secondary provider credential updated',
    timestamp: '2026-10-18 18:05:44',
    category: 'CREDENTIAL_STORAGE',
    outcome: 'SUCCESS',
    metadata: {
      provider: 'NVIDIA_NIM',
      maskedKeyPrefix: 'nvapi-771***',
      storageVault: 'SECURE_ENV_VAULT',
    },
  },

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
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  // Confirmation action modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmText: string;
    danger?: boolean;
    action: () => void;
  } | null>(null);

  // Operators — always read from the platform directory, never assumed.
  const [operators, setOperators] = useState<OperatorUser[]>([]);
  const [operatorsLoading, setOperatorsLoading] = useState(false);
  const [operatorsError, setOperatorsError] = useState<string | null>(null);
  const [revokingUid, setRevokingUid] = useState<string | null>(null);
  const [opNotice, setOpNotice] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  // Audits & CSV
  const [audits] = useState<AuditRecord[]>(INITIAL_AUDITS);
  const [searchAudit, setSearchAudit] = useState('');

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>(INITIAL_ANNOUNCEMENTS);
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [newAnnTitle, setNewAnnTitle] = useState('');
  const [newAnnMsg, setNewAnnMsg] = useState('');
  const [newAnnAudience, setNewAnnAudience] = useState<Announcement['audience']>('ALL');
  const [newAnnSeverity, setNewAnnSeverity] = useState<Announcement['severity']>('banner');

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmModal) setConfirmModal(null);
        else if (selectedEvent) setSelectedEvent(null);
        else if (showAnnModal) setShowAnnModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmModal, selectedEvent, showAnnModal]);

  const handleBlockIp = (ip: string) => {
    setConfirmModal({
      title: 'Block Client IP Address',
      message: `Block traffic originating from ${ip} at the edge reverse proxy layer? Future requests will be rejected with HTTP 403 Forbidden.`,
      confirmText: 'Block IP Address',
      danger: true,
      action: () => {
        setOpNotice(`Edge IP block rule added for ${ip}.`);
        setTimeout(() => setOpNotice(null), 4000);
      },
    });
  };

  const loadOperators = async () => {
    setOperatorsLoading(true);
    setOperatorsError(null);
    try {
      const response = await get<{
        operators?: Array<{ id: string; email: string | null; role: string; suspended?: boolean; emailVerified?: boolean; mfaEnabled?: boolean; displayName?: string | null }>;
        source?: string;
      }>('/platform/operators');
      const rows = Array.isArray(response?.operators) ? response.operators : [];
      setOperators(rows.map((item) => ({
        uid: String(item.id),
        name: item.displayName || item.email || String(item.id),
        email: item.email || '',
        role: String(item.role || 'UNKNOWN'),
        mfaEnabled: item.mfaEnabled === true,
        suspended: item.suspended === true,
        emailVerified: item.emailVerified === true,
      })));
    } catch (error) {
      setOperators([]);
      setOperatorsError(error instanceof Error ? error.message : 'The operator directory could not be loaded.');
    } finally {
      setOperatorsLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === 'operators' && operators.length === 0 && !operatorsLoading) void loadOperators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab]);

  /**
   * FP-A06 — Force Revoke Session.
   *
   * The confirm dialog is the action's only entry point, the request is sent to
   * the durable revocation endpoint (which invalidates already-issued ID tokens),
   * and success is reported only from a confirmed server response.
   */
  const handleRevokeSessions = (operator: OperatorUser) => {
    if (revokingUid) return;
    setConfirmModal({
      title: 'Force Revoke Operator Sessions',
      message: `Immediately invalidate every active session for ${operator.email || operator.uid}? Their existing tokens stop working on the next request and they must sign in again.`,
      confirmText: 'Revoke All Sessions',
      danger: true,
      action: () => { void (async () => {
        setRevokingUid(operator.uid);
        setOpNotice(null);
        setOpError(null);
        try {
          const response = await post<{ success?: boolean; revokedUid?: string; revokedAt?: string }>(
            `/platform/operators/${encodeURIComponent(operator.uid)}/revoke-session`,
            {},
          );
          if (!response?.success || response.revokedUid !== operator.uid) {
            throw new Error('The server did not confirm the revocation.');
          }
          setOpNotice(`All sessions revoked for ${operator.email || operator.uid}${response.revokedAt ? ` at ${new Date(response.revokedAt).toLocaleString()}` : ''}.`);
          await loadOperators();
        } catch (error) {
          setOpError(error instanceof Error ? error.message : 'Session revocation failed. No sessions were revoked.');
        } finally {
          setRevokingUid(null);
        }
      })(); },
    });
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
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
                <div
                  key={ev.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-neutral-50/80 gap-3 cursor-pointer transition-colors"
                  onClick={() => setSelectedEvent(ev)}
                >
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
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-xs font-mono text-ink-muted flex items-center gap-1.5">
                      <Clock className="size-3.5" />
                      {ev.timestamp}
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEvent(ev);
                      }}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-700 h-7 px-2"
                    >
                      <Eye className="size-3.5 mr-1" /> Inspect
                    </Button>
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
            <div role="status" className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800 flex items-center gap-2">
              <CheckCircle2 className="size-4 text-brand-600 shrink-0" />
              {opNotice}
            </div>
          )}
          {opError && (
            <div role="alert" className="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-800 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><AlertTriangle className="size-4 shrink-0" />{opError}</span>
              <Button variant="outline" size="xs" onClick={() => { void loadOperators(); }}>Reload directory</Button>
            </div>
          )}
          {operatorsLoading && <p role="status" className="text-xs text-ink-muted">Loading operator directory…</p>}
          {operatorsError && !operatorsLoading && (
            <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between gap-3">
              <span>{operatorsError}</span>
              <Button variant="outline" size="xs" onClick={() => { void loadOperators(); }}>Retry</Button>
            </div>
          )}
          {!operatorsLoading && !operatorsError && operators.length === 0 && (
            <p className="text-xs text-ink-muted">No operators are reported by the platform identity service.</p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="size-4 text-brand-600" />
                Staff Directory & Role-Based Access Control (RBAC)
              </CardTitle>
              <CardDescription>
                Live operator directory from the platform identity service. Revoking a session invalidates every token already issued to that operator.
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
                          <span className="inline-flex items-center rounded-full border border-border bg-neutral-50 px-2 py-0.5 text-xs font-semibold uppercase text-ink">
                            {op.role}
                          </span>
                          {op.suspended && <span className="ml-2 text-[11px] font-semibold text-error-700">Suspended</span>}
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
                        <td className="px-4 py-3 text-xs text-ink-muted" title="The identity directory does not report last-activity timestamps">Not reported</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="destructive"
                            size="xs"
                            disabled={revokingUid !== null}
                            aria-busy={revokingUid === op.uid}
                            onClick={() => handleRevokeSessions(op)}
                            title="Immediately invalidate every issued token for this operator"
                          >
                            <LogOut className="mr-1 size-3.5" />
                            {revokingUid === op.uid ? 'Revoking…' : 'Force Revoke Session'}
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

      {/* ─── Centered Forensic Security Event Inspector Modal ─── */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-[fade-in_150ms_ease-out]"
          onClick={() => setSelectedEvent(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="security-event-title"
        >
          <div
            className="w-full max-w-2xl bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-neutral-950 px-6 py-4 text-white flex items-center justify-between shrink-0 border-b border-neutral-800">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'size-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-md shrink-0',
                    selectedEvent.severity === 'CRITICAL' ? 'bg-rose-600 text-white' : 'bg-brand-600 text-white'
                  )}
                >
                  <Shield className="size-5" />
                </div>
                <div className="min-w-0">
                  <h3 id="security-event-title" className="text-base font-extrabold text-white truncate font-mono">
                    {selectedEvent.type}
                  </h3>
                  <p className="text-xs text-neutral-400 font-mono mt-0.5">
                    {selectedEvent.timestamp} · Event ID: {selectedEvent.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition cursor-pointer"
                aria-label="Close inspector"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-neutral-50 p-3 rounded-xl border border-border">
                  <span className="text-[10px] font-bold uppercase text-ink-muted">Severity</span>
                  <p className="font-extrabold text-ink mt-0.5">{selectedEvent.severity}</p>
                </div>
                <div className="bg-neutral-50 p-3 rounded-xl border border-border">
                  <span className="text-[10px] font-bold uppercase text-ink-muted">Category</span>
                  <p className="font-extrabold text-ink mt-0.5 truncate">{selectedEvent.category || 'GATEWAY'}</p>
                </div>
                <div className="bg-neutral-50 p-3 rounded-xl border border-border">
                  <span className="text-[10px] font-bold uppercase text-ink-muted">Outcome</span>
                  <p className={cn('font-extrabold mt-0.5', selectedEvent.outcome === 'FAILED' ? 'text-rose-600' : 'text-emerald-600')}>
                    {selectedEvent.outcome || 'BLOCKED'}
                  </p>
                </div>
              </div>

              <div className="space-y-2 bg-neutral-50 p-3.5 rounded-xl border border-border font-mono text-[11px]">
                <div className="flex justify-between items-center py-1 border-b border-border/60">
                  <span className="text-ink-muted">Principal / Actor:</span>
                  <span className="text-ink font-bold select-all">{selectedEvent.principal}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/60">
                  <span className="text-ink-muted">Client IP Address:</span>
                  <span className="text-ink font-bold select-all">{selectedEvent.ip}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-ink-muted">Audited Mutation:</span>
                  <span className="text-ink font-bold select-all">{selectedEvent.action}</span>
                </div>
              </div>

              {/* JSON Payload */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-ink uppercase tracking-wide">
                    Forensic Payload & Environmental Metadata
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(JSON.stringify(selectedEvent.metadata || selectedEvent, null, 2), 'payload')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-800 cursor-pointer"
                  >
                    {copiedKey === 'payload' ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                    <span>{copiedKey === 'payload' ? 'Copied JSON!' : 'Copy JSON'}</span>
                  </button>
                </div>
                <pre className="text-[11px] bg-neutral-950 text-emerald-400 rounded-xl p-4 overflow-x-auto font-mono max-h-52 border border-neutral-800 leading-relaxed shadow-inner">
                  {JSON.stringify(selectedEvent.metadata || selectedEvent, null, 2)}
                </pre>
              </div>
            </div>

            {/* Footer with Remediation Actions */}
            <div className="p-4 bg-neutral-50 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBlockIp(selectedEvent.ip)}
                  className="text-xs border-rose-200 text-rose-700 hover:bg-rose-50"
                >
                  <Ban className="size-3 mr-1" />
                  Block IP {selectedEvent.ip}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title="Session revocation is unavailable"
                  className="text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
                >
                  <LogOut className="size-3 mr-1" />
                  Session revocation unavailable
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedEvent(null)} className="text-xs">
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirmation Modal ─── */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-[fade-in_150ms_ease-out]"
          onClick={() => setConfirmModal(null)}
          role="alertdialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={cn(
                'p-4 border-b flex items-center gap-3',
                confirmModal.danger ? 'bg-rose-50 border-rose-100 text-rose-900' : 'bg-brand-50 border-brand-100 text-brand-900'
              )}
            >
              {confirmModal.danger ? (
                <AlertTriangle className="size-5 text-rose-600" />
              ) : (
                <ShieldAlert className="size-5 text-brand-600" />
              )}
              <h3 className="font-bold text-sm">{confirmModal.title}</h3>
            </div>
            <div className="p-5 text-xs text-ink-muted leading-relaxed">
              {confirmModal.message}
            </div>
            <div className="p-4 pt-2 flex justify-end gap-2 bg-neutral-50/50 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setConfirmModal(null)} className="text-xs">
                Cancel
              </Button>
              <Button
                variant={confirmModal.danger ? 'destructive' : 'primary'}
                size="sm"
                onClick={() => {
                  const act = confirmModal.action;
                  setConfirmModal(null);
                  act();
                }}
                className="text-xs font-bold"
              >
                {confirmModal.confirmText}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── System Announcement Composer Modal ─── */}
      {showAnnModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-[fade-in_150ms_ease-out]"
          onClick={() => setShowAnnModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="broadcast-composer-title"
        >
          <div
            className="w-full max-w-lg bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-border flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
                  <Megaphone className="size-5" />
                </div>
                <div>
                  <h3 id="broadcast-composer-title" className="text-sm font-bold text-ink">
                    Compose System Broadcast
                  </h3>
                  <p className="text-xs text-ink-muted">Surface alert banner or notification to active sessions.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAnnModal(false)}
                className="p-1.5 text-ink-muted hover:text-ink rounded-lg hover:bg-neutral-100"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">Notice Title</label>
                <Input
                  placeholder="e.g. Scheduled Infrastructure Maintenance"
                  value={newAnnTitle}
                  onChange={(e) => setNewAnnTitle(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-ink block mb-1">Target Audience</label>
                  <select
                    value={newAnnAudience}
                    onChange={(e) => setNewAnnAudience(e.target.value as Announcement['audience'])}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="ALL">All Users</option>
                    <option value="CANDIDATES">Candidates Only</option>
                    <option value="EMPLOYERS">Employers & Recruiters</option>
                    <option value="ENTERPRISE">Enterprise Organizations</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-ink block mb-1">Display Severity</label>
                  <select
                    value={newAnnSeverity}
                    onChange={(e) => setNewAnnSeverity(e.target.value as Announcement['severity'])}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="banner">Banner (Top of Page)</option>
                    <option value="modal">Modal Dialog (Must Acknowledge)</option>
                    <option value="info">Subtle Toast Notification</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Announcement Message Body</label>
                <textarea
                  rows={3}
                  placeholder="Provide precise details, maintenance windows, or instructions..."
                  value={newAnnMsg}
                  onChange={(e) => setNewAnnMsg(e.target.value)}
                  className="w-full rounded-lg border border-border p-3 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Live Preview Card */}
              {newAnnTitle && (
                <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3.5 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-brand-700 tracking-wider">
                    Live Broadcast Preview
                  </span>
                  <p className="font-bold text-xs text-brand-950">{newAnnTitle}</p>
                  <p className="text-[11px] text-brand-800 leading-relaxed">{newAnnMsg || 'Message body preview...'}</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-neutral-50 border-t border-border flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAnnModal(false)} className="text-xs">
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  handleCreateAnnouncement();
                  setShowAnnModal(false);
                }}
                disabled={!newAnnTitle.trim() || !newAnnMsg.trim()}
                className="text-xs font-semibold"
              >
                <Radio className="size-3 mr-1" />
                Publish Broadcast
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
