/**
 * Enterprise Audit Tab (Immutable Forensic Audit Trail)
 *
 * Real-time tamper-evident audit event log with actor, IP, timestamp,
 * action categories, severity filters, and full CSV export.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Download,
  Shield,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import { enterpriseApi, type EnterpriseAuditEvent } from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

const SEVERITIES = ['ALL', 'INFO', 'WARN', 'CRITICAL', 'SECURITY'] as const;

export function EnterpriseAuditTab() {
  const { tenant } = useEnterprise();
  const [events, setEvents] = useState<EnterpriseAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'CRITICAL' | 'SECURITY'>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<EnterpriseAuditEvent | null>(null);

  const loadAuditLogs = useCallback(async () => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await enterpriseApi.getAuditLogs(tenant.id, { limit: 100 });
      setEvents(res.events || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch forensic audit log');
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      if (severityFilter !== 'ALL' && evt.severity !== severityFilter) return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const haystack = `${evt.actor} ${evt.actorEmail || ''} ${evt.action} ${evt.target || ''} ${evt.ip || ''} ${evt.category || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [events, severityFilter, searchQuery]);

  const handleExportCsv = () => {
    const sanitizeCsvCell = (val: unknown): string => {
      let str = String(val ?? '');
      if (/^[=+@\t\r-]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = ['Timestamp', 'Action', 'Target', 'Actor', 'Actor Email', 'Severity', 'IP Address'];
    const rows = filteredEvents.map((evt) => [
      evt.timestamp,
      evt.action,
      evt.target || '',
      evt.actor,
      evt.actorEmail || '',
      evt.severity || 'INFO',
      evt.ip || '',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.map(sanitizeCsvCell).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enterprise_audit_${tenant?.id || 'log'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* ─── Control Toolbar ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface-raised/60 backdrop-blur-md border border-edge rounded-xl p-3 shadow-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-muted" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by actor, action type, target entity, or IP…"
              className="pl-9 text-xs h-9 bg-surface border-edge"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Severity Pills */}
          <div className="flex items-center gap-1 border border-edge rounded-lg p-0.5 bg-surface text-xs font-semibold">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverityFilter(s)}
                className={cn(
                  'px-2.5 py-1 rounded-md transition-colors',
                  severityFilter === s
                    ? 'bg-accent text-white shadow-2xs'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={loadAuditLogs}
            disabled={loading}
            className="text-xs"
          >
            <RefreshCw className={cn('size-3.5 mr-1', loading && 'animate-spin')} />
            Refresh
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCsv}
            className="text-xs"
          >
            <Download className="size-3.5 mr-1" />
            CSV Export
          </Button>
        </div>
      </div>

      {/* ─── Audit Log Table Card ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                <Shield className="size-4 text-accent" />
                Immutable Forensic Audit Trail
                <HelpTooltip text="Tamper-evident append-only ledger tracking all administrative, security, and document operations." />
              </CardTitle>
              <CardDescription className="text-xs text-ink-muted mt-0.5">
                Showing {filteredEvents.length} recorded forensic events.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {loading ? (
            <div className="py-12 text-center text-xs text-ink-muted">
              Querying forensic audit ledger…
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="py-12 text-center text-xs text-ink-muted border border-dashed border-edge rounded-xl">
              No audit events found matching the applied filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-edge text-ink-muted font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3">Timestamp</th>
                    <th className="py-3 px-3">Action</th>
                    <th className="py-3 px-3">Target Entity</th>
                    <th className="py-3 px-3">Actor & Identity</th>
                    <th className="py-3 px-3">IP Address</th>
                    <th className="py-3 px-3">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {filteredEvents.map((evt) => {
                    const sev = evt.severity || 'INFO';
                    return (
                      <tr
                        key={evt.id}
                        onClick={() => setSelectedEvent(evt)}
                        className="hover:bg-surface-raised/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-3 font-mono text-ink-muted whitespace-nowrap">
                          {new Date(evt.timestamp).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-3 font-bold text-ink font-mono text-accent">
                          {evt.action}
                        </td>
                        <td className="py-3 px-3 text-ink-muted max-w-xs truncate">
                          {evt.target || '—'}
                        </td>
                        <td className="py-3 px-3 text-ink">
                          <div className="font-semibold">{evt.actorEmail || evt.actor}</div>
                          {evt.actorEmail && (
                            <div className="text-[10px] font-mono text-ink-muted">{evt.actor}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-ink-muted">
                          {evt.ip || '—'}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold',
                              sev === 'INFO' && 'bg-accent-soft text-accent',
                              sev === 'WARN' && 'bg-amber-500/10 text-amber-600',
                              (sev === 'CRITICAL' || sev === 'SECURITY') && 'bg-rose-500/10 text-rose-600',
                            )}
                          >
                            {sev}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Event Detail Drawer/Modal ─── */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-surface-raised border border-edge shadow-2xl overflow-hidden p-6 text-xs space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <Shield className="size-4 text-accent" />
                Audit Event Inspection
              </h3>
              <Button size="sm" variant="ghost" onClick={() => setSelectedEvent(null)} className="h-7 px-2">
                Close
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-ink-muted">Event ID:</span>
                <span className="font-mono text-ink">{selectedEvent.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Action:</span>
                <span className="font-mono font-bold text-accent">{selectedEvent.action}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Target:</span>
                <span className="text-ink">{selectedEvent.target || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Actor:</span>
                <span className="text-ink">{selectedEvent.actorEmail || selectedEvent.actor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">IP Address:</span>
                <span className="font-mono text-ink">{selectedEvent.ip || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Timestamp:</span>
                <span className="text-ink">{new Date(selectedEvent.timestamp).toISOString()}</span>
              </div>
            </div>

            {selectedEvent.details && (
              <div className="space-y-1.5 pt-2 border-t border-edge">
                <span className="font-bold text-ink block">Payload Metadata</span>
                <pre className="p-3 rounded-lg bg-surface border border-edge font-mono text-[11px] text-ink overflow-x-auto">
                  {JSON.stringify(selectedEvent.details, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default EnterpriseAuditTab;
