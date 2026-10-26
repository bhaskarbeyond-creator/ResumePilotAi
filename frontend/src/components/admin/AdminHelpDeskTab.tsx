/**
 * Customer Support Ticket Help Desk Tab
 *
 * CONTRACT INVARIANTS:
 * 1. GET tickets binds to: GET /api/admin/support/tickets
 * 2. Staff reply binds to: POST /api/admin/support/tickets/:ticketId/messages
 *    (Prohibited: phantom /reply)
 * 3. Status updates bind to: PATCH /api/admin/support/tickets/:ticketId
 */

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { get, post, patch } from '@/lib/api-client';
import { AdminEmptyPanel, AdminErrorPanel, AdminLoadingPanel } from './AdminDataState';
import { useAdminResource } from './use-admin-resource';
import { describeAdminFailure } from './admin-data-state';
import {
  HelpCircle,
  Send,
  CheckCircle2,
  Search,
} from 'lucide-react';

interface TicketMessage {
  id: string;
  senderId?: string;
  senderEmail?: string;
  role?: 'USER' | 'STAFF' | 'SYSTEM';
  body: string;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  userId?: string;
  userEmail?: string;
  email?: string;
  subject: string;
  description?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  category?: string;
  createdAt: string;
  updatedAt?: string;
  messages?: TicketMessage[];
}

export function AdminHelpDeskTab() {
  const loadTickets = useCallback(
    (signal: AbortSignal) =>
      get<{ success?: boolean; tickets?: SupportTicket[] }>(
        '/admin/support/tickets',
        undefined,
        { signal },
      ),
    [],
  );
  const resource = useAdminResource(loadTickets);
  // `null` until the server answers: a ticket list the server did not send does not exist.
  const tickets = resource.data?.tickets ?? [];

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  /** Selection is derived, not stored twice: the first ticket is selected until one is picked. */
  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0] ?? null,
    [tickets, selectedTicketId],
  );

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [flash, setFlash] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const report = (error: unknown) => {
    const failure = describeAdminFailure(error);
    setFlash({
      tone: 'error',
      text: `${failure.message} (${failure.code}${failure.requestId ? ` · request ${failure.requestId}` : ''})`,
    });
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;

    setSendingReply(true);
    const text = replyText.trim();

    try {
      await post(`/admin/support/tickets/${encodeURIComponent(selectedTicket.id)}/messages`, {
        body: text,
      });
      setReplyText('');
      setFlash({ tone: 'success', text: `Reply sent to ticket ${selectedTicket.id}.` });
      resource.reload();
    } catch (error) {
      report(error);
    } finally {
      setSendingReply(false);
    }
  };

  const handleUpdateStatus = async (newStatus: SupportTicket['status']) => {
    if (!selectedTicket) return;
    setUpdatingStatus(true);
    try {
      await patch(`/admin/support/tickets/${encodeURIComponent(selectedTicket.id)}`, {
        status: newStatus,
      });
      setFlash({ tone: 'success', text: `Ticket ${selectedTicket.id} marked ${newStatus}.` });
      resource.reload();
    } catch (error) {
      report(error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    const matchesFilter =
      statusFilter === 'ALL' ||
      (statusFilter === 'OPEN' && (t.status === 'OPEN' || t.status === 'IN_PROGRESS')) ||
      (statusFilter === 'RESOLVED' && (t.status === 'RESOLVED' || t.status === 'CLOSED'));

    if (!matchesFilter) return false;
    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase();
    const mail = (t.userEmail || t.email || '').toLowerCase();
    return mail.includes(q) || t.subject.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* ─── Header & Controls ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink flex items-center gap-2">
            <HelpCircle className="size-5 text-brand-600" />
            Support Help Desk & Ticketing System
          </h2>
          <p className="text-xs text-ink-muted">
            Manage incoming candidate and enterprise support inquiries with real message thread bindings.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {(['ALL', 'OPEN', 'RESOLVED'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={cn(
                'rounded-lg px-3 py-1 font-semibold transition-colors cursor-pointer',
                statusFilter === filter
                  ? 'bg-brand-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-ink-muted hover:bg-neutral-200'
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {flash && (
        <div
          role={flash.tone === 'success' ? 'status' : 'alert'}
          className={cn(
            'flex items-start gap-2 rounded-xl border p-3 text-xs',
            flash.tone === 'success'
              ? 'border-success-100 bg-success-50 text-success-700'
              : 'border-error-100 bg-error-50 text-error-700',
          )}
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{flash.text}</span>
          <button type="button" onClick={() => setFlash(null)} className="min-h-11 cursor-pointer px-2 text-2xs font-bold uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:min-h-9">
            Dismiss
          </button>
        </div>
      )}

      {resource.status === 'loading' && resource.data === null && (
        <AdminLoadingPanel label="Reading the support queue…" />
      )}

      {resource.status === 'failed' && resource.error && (
        <AdminErrorPanel
          title="The support queue could not be read"
          error={resource.error}
          onRetry={resource.reload}
        />
      )}

      {resource.status === 'ready' && tickets.length === 0 && (
        <AdminEmptyPanel
          title="No support ticket"
          description="The ticket store answered with no rows. Nothing is queued for this desk."
        />
      )}

      {tickets.length > 0 && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 rounded-xl border border-border bg-surface overflow-hidden shadow-sm">
        {/* Ticket List (5 cols) */}
        <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-border divide-y divide-border overflow-y-auto max-h-[550px]">
          <div className="p-2.5 bg-canvas border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-muted" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ticket subject, email, ID…"
                className="pl-8 text-xs h-8"
              />
            </div>
          </div>

          {filteredTickets.map((t) => {
            const isSelected = selectedTicket?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTicketId(t.id)}
                aria-pressed={isSelected}
                className={cn(
                  'block w-full min-h-11 cursor-pointer p-3.5 text-left transition-colors',
                  isSelected ? 'bg-brand-50/70 dark:bg-brand-950/30' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                )}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-ink truncate max-w-[200px]">
                    {t.userEmail || t.email}
                  </span>
                  <span className="text-2xs text-ink-muted">{t.createdAt}</span>
                </div>
                <div className="text-xs font-semibold text-ink line-clamp-1 mb-1.5">{t.subject}</div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-2xs font-bold',
                      t.status === 'OPEN'
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                        : t.status === 'RESOLVED'
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                        : 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                    )}
                  >
                    {t.status}
                  </span>
                  <span className="text-2xs uppercase font-bold text-ink-muted">
                    {t.priority}
                  </span>
                </div>
              </button>
            );
          })}
          {filteredTickets.length === 0 && (
            <div className="p-8 text-center text-xs text-ink-muted">No support tickets match query.</div>
          )}
        </div>

        {/* Ticket Thread & Reply (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between p-4 min-h-[450px]">
          {selectedTicket ? (
            <>
              <div>
                <div className="flex items-start justify-between border-b border-border pb-3 mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-ink">{selectedTicket.subject}</h3>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Submitter: {selectedTicket.userEmail || selectedTicket.email} ({selectedTicket.id})
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {selectedTicket.status !== 'RESOLVED' ? (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleUpdateStatus('RESOLVED')}
                        loading={updatingStatus}
                      >
                        <CheckCircle2 className="size-3 mr-1 text-emerald-600" />
                        Mark Resolved
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleUpdateStatus('OPEN')}
                        loading={updatingStatus}
                      >
                        Reopen Ticket
                      </Button>
                    )}
                  </div>
                </div>

                {/* Messages Thread */}
                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1 text-xs">
                  {selectedTicket.messages?.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'p-3 rounded-xl max-w-[85%]',
                        msg.role === 'STAFF'
                          ? 'ml-auto bg-brand-50 text-brand-900 border border-brand-100 dark:bg-brand-950/40 dark:text-brand-100 dark:border-brand-900'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-ink'
                      )}
                    >
                      <div className="flex items-center justify-between text-2xs font-semibold text-ink-muted mb-1">
                        <span>{msg.role === 'STAFF' ? 'Support Specialist (Staff)' : 'User / Candidate'}</span>
                        <span>{msg.createdAt}</span>
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reply Form */}
              <form onSubmit={handleSendReply} className="mt-4 pt-3 border-t border-border flex gap-2">
                <Input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type staff response (binds to /tickets/:id/messages)..."
                  className="text-xs flex-1 h-9"
                />
                <Button type="submit" size="sm" variant="primary" disabled={!replyText.trim()} loading={sendingReply}>
                  <Send className="size-3.5 mr-1" />
                  Send Reply
                </Button>
              </form>
            </>
          ) : (
            <div className="py-16 text-center text-xs text-ink-muted">Select a ticket to view thread.</div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
