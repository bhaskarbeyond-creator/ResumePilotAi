/**
 * Support Dashboard — customer helpdesk (DISC-029 / DISC-047 / DISC-052).
 *
 * Candidate-facing support ticket system backed by MariaDB through
 * /api/support/tickets. Every panel distinguishes loading, success, empty and
 * failure; a ticket or reply only appears after the server confirms it, and a
 * failed request never leaves a fabricated row behind.
 *
 * The Create Ticket dialog uses the repository's Radix dialog primitive, which
 * provides focus containment, initial focus, Escape dismissal, focus
 * restoration to the trigger, background scroll locking and correct dialog
 * semantics (role="dialog" + aria-labelledby/aria-describedby).
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { NoticeRegions, type Notice } from '@/components/settings/notice-regions';
import { cn } from '@/lib/utils';
import { get, post, normalizeError } from '@/lib/api-client';
import {
  HelpCircle,
  MessageSquare,
  Send,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Lock,
  Headphones,
} from 'lucide-react';

/** The lifecycle statuses the API returns (lower-case on the wire). */
type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type SupportFilter = 'all' | SupportStatus;
type SupportPriority = 'low' | 'normal' | 'high' | 'urgent';

interface SupportMessage {
  id: string;
  role: 'USER' | 'STAFF';
  body: string;
  createdAt: string | null;
}

interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string | null;
  updatedAt: string | null;
  email?: string;
  messages?: SupportMessage[];
}

interface TicketListResponse {
  success: boolean;
  tickets: SupportTicket[];
  hasMore?: boolean;
}

interface TicketResponse {
  success: boolean;
  ticket: SupportTicket;
}

const STATUS_ORDER: SupportStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

const FILTERS: ReadonlyArray<{ id: SupportFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

function normalizeStatus(value: string | undefined): SupportStatus {
  const status = String(value || '').toLowerCase();
  return (STATUS_ORDER as string[]).includes(status) ? (status as SupportStatus) : 'open';
}

function statusConfig(status: SupportStatus) {
  const configs: Record<SupportStatus, { label: string; className: string; icon: typeof Clock }> = {
    open: { label: 'Open', className: 'bg-amber-500/10 text-amber-700 border-amber-500/20', icon: Clock },
    in_progress: { label: 'In progress', className: 'bg-blue-500/10 text-blue-700 border-blue-500/20', icon: Loader2 },
    resolved: { label: 'Resolved', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20', icon: CheckCircle2 },
    closed: { label: 'Closed', className: 'bg-neutral-500/10 text-neutral-700 border-neutral-500/20', icon: Lock },
  };
  return configs[status];
}

function priorityConfig(rawPriority: string | undefined) {
  const priority = String(rawPriority || 'normal').toLowerCase() as SupportPriority;
  const configs: Record<SupportPriority, { label: string; className: string }> = {
    urgent: { label: 'Urgent', className: 'bg-red-500/10 text-red-700 border-red-500/20' },
    high: { label: 'High', className: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
    normal: { label: 'Normal', className: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
    low: { label: 'Low', className: 'bg-neutral-500/10 text-neutral-700 border-neutral-500/20' },
  };
  return configs[priority] || configs.normal;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Date unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unknown';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A ticket is frozen once closed: the API rejects replies until staff reopen it. */
function canReplyTo(status: string): boolean {
  return normalizeStatus(status) !== 'closed';
}

export function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [activeFilter, setActiveFilter] = useState<SupportFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const [thread, setThread] = useState<SupportTicket | null>(null);
  const [threadState, setThreadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [threadError, setThreadError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [replyText, setReplyText] = useState('');
  const [replyPending, setReplyPending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [newSubject, setNewSubject] = useState('');
  const [newCategory, setNewCategory] = useState<'technical' | 'billing' | 'general'>('technical');
  const [newPriority, setNewPriority] = useState<SupportPriority>('normal');
  const [newMessage, setNewMessage] = useState('');
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ subject?: string; message?: string }>({});

  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const subjectId = useId();
  const categoryId = useId();
  const priorityId = useId();
  const messageId = useId();
  const subjectErrorId = useId();
  const messageErrorId = useId();
  const createErrorId = useId();

  const loadTickets = useCallback(async () => {
    setListState('loading');
    setListError(null);
    try {
      const data = await get<TicketListResponse>('/support/tickets');
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
      setHasMore(data.hasMore === true);
      setListState('ready');
    } catch (error) {
      // Never render an empty list for a failed request.
      const failure = normalizeError(error);
      setTickets([]);
      setListState('error');
      setListError(failure.message || 'We could not load your tickets.');
    }
  }, []);

  const loadThread = useCallback(async (ticketId: string) => {
    setThreadState('loading');
    setThreadError(null);
    try {
      const data = await get<TicketResponse>(`/support/tickets/${encodeURIComponent(ticketId)}`);
      setThread(data.ticket);
      setThreadState('ready');
    } catch (error) {
      const failure = normalizeError(error);
      setThread(null);
      setThreadState('error');
      setThreadError(
        failure.status === 404
          ? 'That ticket no longer exists, or it belongs to another account.'
          : failure.message || 'We could not load this conversation.',
      );
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!selectedTicketId) {
      setThread(null);
      setThreadState('idle');
      return;
    }
    setReplyText('');
    setReplyError(null);
    void loadThread(selectedTicketId);
  }, [selectedTicketId, loadThread]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) || null;

  const filteredTickets = tickets.filter((ticket) => {
    if (activeFilter !== 'all' && normalizeStatus(ticket.status) !== activeFilter) return false;
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return true;
    return ticket.subject.toLowerCase().includes(needle)
      || String(ticket.email || '').toLowerCase().includes(needle);
  });

  /** Focus goes back to the control that opened the dialog when it closes. */
  const closeCreateModal = useCallback(() => {
    setShowCreateModal(false);
    setCreateError(null);
    requestAnimationFrame(() => createButtonRef.current?.focus());
  }, []);

  const handleCreateTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    if (createPending) return;
    const errors: { subject?: string; message?: string } = {};
    if (newSubject.trim().length < 4) errors.subject = 'Enter a subject of at least 4 characters.';
    if (newMessage.trim().length < 8) errors.message = 'Describe the issue in at least 8 characters.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setCreatePending(true);
    setCreateError(null);
    setNotice(null);
    try {
      const data = await post<TicketResponse>('/support/tickets', {
        subject: newSubject.trim(),
        message: newMessage.trim(),
        category: newCategory,
        priority: newPriority,
      });
      const created = data.ticket;
      // Only a server-confirmed ticket is shown.
      setTickets((current) => [created, ...current.filter((ticket) => ticket.id !== created.id)]);
      setListState('ready');
      setNotice({ tone: 'success', text: `Ticket “${created.subject}” was created.` });
      // The form is cleared only after the server confirmed the create.
      setNewSubject('');
      setNewMessage('');
      setNewPriority('normal');
      setNewCategory('technical');
      setFieldErrors({});
      setSelectedTicketId(created.id);
      closeCreateModal();
    } catch (error) {
      const failure = normalizeError(error);
      // The typed content stays in the form so the candidate can retry.
      setCreateError(failure.message || 'Your ticket could not be created. Please try again.');
    } finally {
      setCreatePending(false);
    }
  };

  const handleReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTicketId || replyPending) return;
    const body = replyText.trim();
    if (!body) {
      setReplyError('Write a message before sending.');
      return;
    }
    setReplyPending(true);
    setReplyError(null);
    try {
      await post(`/support/tickets/${encodeURIComponent(selectedTicketId)}/reply`, { message: body });
      // Only clear the box if it still holds the message that was just sent;
      // anything typed during the request is kept.
      setReplyText((current) => (current.trim() === body ? '' : current));
      await Promise.all([loadThread(selectedTicketId), loadTickets()]);
      setNotice({ tone: 'success', text: 'Your reply was sent to support.' });
    } catch (error) {
      const failure = normalizeError(error);
      setReplyError(failure.status === 409
        ? 'This ticket is closed. Support must reopen it before you can reply.'
        : failure.message || 'Your reply could not be sent. Try again.');
    } finally {
      setReplyPending(false);
    }
  };

  const listIsLoading = listState === 'loading';
  const listFailed = listState === 'error';

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <div className="flex flex-col gap-4 border-b border-edge pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
            <HelpCircle className="size-6 text-accent" aria-hidden="true" />
            Support Center
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Submit inquiries, track your tickets, and communicate with our support team.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              const chatBtn = document.querySelector('button[aria-label="Open Live Support Web Chat"]') as HTMLButtonElement | null;
              if (chatBtn) chatBtn.click();
            }}
            className="gap-1.5 text-xs font-semibold border-cyan-500/40 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10"
          >
            <Headphones className="size-3.5 text-cyan-500" aria-hidden="true" />
            Start Live Chat
          </Button>
          <Button
            ref={createButtonRef}
            onClick={() => setShowCreateModal(true)}
            className="gap-1.5 text-xs font-semibold"
            disabled={createPending}
          >
            <MessageSquare className="size-3.5" aria-hidden="true" />
            Create New Ticket
          </Button>
        </div>
      </div>

      <NoticeRegions notice={notice} />

      {listFailed && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 sm:flex-row sm:items-center"
        >
          <XCircle className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            Your tickets could not be loaded{listError ? `: ${listError}` : '.'}
          </span>
          <Button variant="outline" size="sm" onClick={() => void loadTickets()} aria-busy={listIsLoading || undefined}>
            <RefreshCw aria-hidden="true" /> Retry
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none" role="group" aria-label="Filter tickets by status">
          {FILTERS.map((filter) => {
            const count = filter.id === 'all'
              ? tickets.length
              : tickets.filter((ticket) => normalizeStatus(ticket.status) === filter.id).length;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                aria-pressed={activeFilter === filter.id}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500',
                  activeFilter === filter.id
                    ? 'bg-accent text-white'
                    : 'bg-transparent text-ink-muted hover:bg-canvas',
                )}
              >
                <span>{filter.label}</span>
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-black/10 text-[10px] font-bold">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative max-w-md flex-1">
          <label htmlFor="support-search" className="sr-only">Search tickets</label>
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <Input
            id="support-search"
            type="search"
            placeholder="Search tickets by subject or email…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-9 pl-9 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 overflow-hidden rounded-xl border border-border bg-surface shadow-sm lg:grid-cols-12">
        {/* Ticket list */}
        <div className="max-h-[calc(100vh-16rem)] divide-y divide-border overflow-y-auto border-b border-border lg:col-span-5 lg:border-b-0 lg:border-r">
          {listIsLoading && tickets.length === 0 ? (
            <div className="space-y-0 p-4" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, index) => (
                <TicketListSkeleton key={index} />
              ))}
            </div>
          ) : listFailed ? (
            <div className="p-8 text-center text-xs text-ink-muted">
              <XCircle className="mx-auto mb-3 size-10 text-error-500" aria-hidden="true" />
              <p className="mb-1 text-sm font-medium text-ink">Tickets unavailable</p>
              <p>Use Retry above to load your tickets again.</p>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-muted">
              <HelpCircle className="mx-auto mb-3 size-12 opacity-30" aria-hidden="true" />
              <p className="mb-1 text-sm font-medium">
                {tickets.length === 0 ? 'No support tickets yet.' : 'No tickets match your search.'}
              </p>
              <p className="text-[11px]">
                {tickets.length === 0
                  ? 'Create a ticket to get help from our support team.'
                  : 'Try a different search term or status filter.'}
              </p>
            </div>
          ) : (
            <ul role="list" aria-label="Your support tickets">
              {filteredTickets.map((ticket) => {
                const status = normalizeStatus(ticket.status);
                const statusInfo = statusConfig(status);
                const StatusIcon = statusInfo.icon;
                const priority = priorityConfig(ticket.priority);
                const isSelected = selectedTicketId === ticket.id;
                return (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTicketId(ticket.id)}
                      aria-current={isSelected || undefined}
                      className={cn(
                        'w-full p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500',
                        isSelected ? 'bg-accent-soft/50' : 'hover:bg-neutral-50',
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-semibold text-ink">{ticket.subject}</span>
                        <span className="shrink-0 text-ink-muted">{formatTimestamp(ticket.updatedAt || ticket.createdAt)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold', statusInfo.className)}>
                          <StatusIcon className="size-3" aria-hidden="true" />
                          {statusInfo.label}
                        </span>
                        <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase', priority.className)}>
                          {priority.label}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {hasMore && !listFailed && (
            <p className="px-4 py-3 text-[11px] text-ink-muted">
              Showing your most recent tickets. Older tickets are not shown.
            </p>
          )}
        </div>

        {/* Detail + thread */}
        <div className="flex flex-col lg:col-span-7">
          {!selectedTicketId ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-ink-muted">
              <HelpCircle className="mb-4 size-16 opacity-30" aria-hidden="true" />
              <p className="text-sm font-medium">Select a ticket from the list to view and respond</p>
              <p className="mt-1 text-xs">Or create a new ticket to get support</p>
            </div>
          ) : threadState === 'loading' ? (
            <p className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-ink-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading conversation…
            </p>
          ) : threadState === 'error' ? (
            <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <XCircle className="size-10 text-error-500" aria-hidden="true" />
              <p className="text-sm text-ink">{threadError}</p>
              <Button variant="outline" size="sm" onClick={() => selectedTicketId && void loadThread(selectedTicketId)}>
                <RefreshCw aria-hidden="true" /> Retry
              </Button>
            </div>
          ) : thread ? (
            <>
              <div className="flex flex-col border-b border-border p-4 lg:p-6">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-ink">{thread.subject}</h2>
                    <p className="mt-1 text-xs text-ink-muted">
                      Ticket {thread.id.slice(0, 8)} · created {formatTimestamp(thread.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const statusInfo = statusConfig(normalizeStatus(thread.status));
                      const StatusIcon = statusInfo.icon;
                      return (
                        <span className={cn('inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold', statusInfo.className)}>
                          <StatusIcon className="size-3" aria-hidden="true" />
                          {statusInfo.label}
                        </span>
                      );
                    })()}
                    {(() => {
                      const priority = priorityConfig(thread.priority);
                      return (
                        <span className={cn('rounded border px-2 py-0.5 text-[10px] font-semibold uppercase', priority.className)}>
                          {priority.label}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto border-b border-border p-4 lg:p-6">
                {(thread.messages || []).length === 0 ? (
                  <div className="py-8 text-center text-xs text-ink-muted">
                    <MessageSquare className="mx-auto mb-2 size-8 opacity-30" aria-hidden="true" />
                    <p>This ticket has no messages yet.</p>
                  </div>
                ) : (
                  <ul role="list" aria-label="Conversation" className="space-y-4">
                    {(thread.messages || []).map((message) => (
                      <li key={message.id} className={cn('flex gap-3', message.role === 'STAFF' ? 'flex-row-reverse' : 'flex-row')}>
                        <div
                          className={cn(
                            'max-w-[85%] rounded-2xl p-3',
                            message.role === 'STAFF'
                              ? 'rounded-tr-sm border border-brand-100 bg-brand-50 text-brand-900'
                              : 'rounded-tl-sm bg-neutral-100 text-neutral-800',
                          )}
                        >
                          <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-ink-muted">
                            <span>{message.role === 'STAFF' ? 'Support specialist' : 'You'}</span>
                            <span>{formatTimestamp(message.createdAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <form onSubmit={handleReply} className="border-t border-border bg-canvas/30 p-4 lg:p-6">
                {canReplyTo(thread.status) ? (
                  <>
                    <label htmlFor="support-reply" className="mb-2 block text-xs font-semibold text-ink-muted">
                      Add a reply
                    </label>
                    <Textarea
                      id="support-reply"
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      placeholder="Type your response to the support team…"
                      rows={3}
                      error={Boolean(replyError)}
                      aria-describedby={replyError ? 'support-reply-error' : undefined}
                      className="w-full rounded-xl border border-border bg-surface text-sm text-ink placeholder:text-ink-muted"
                    />
                    {replyError && (
                      <p id="support-reply-error" role="alert" className="mt-2 text-xs text-error-700">
                        {replyError}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-end">
                      <Button type="submit" size="sm" loading={replyPending} disabled={replyPending || !replyText.trim()}>
                        <Send className="mr-1.5 size-3.5" aria-hidden="true" />
                        {replyPending ? 'Sending…' : 'Send Reply'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-xs text-ink-muted">
                    <Lock className="size-4" aria-hidden="true" />
                    This ticket is closed. Contact support to reopen it if you need more help.
                  </p>
                )}
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-ink-muted">
              {selectedTicket ? `Selected: ${selectedTicket.subject}` : 'Select a ticket'}
            </div>
          )}
        </div>
      </div>

      {/* Create Ticket dialog — Radix: focus trap, Escape, scroll lock, focus restore. */}
      <Dialog
        open={showCreateModal}
        onOpenChange={(open) => {
          if (!open) {
            if (createPending) return; // Never discard input mid-mutation.
            closeCreateModal();
          } else {
            setShowCreateModal(true);
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto p-6"
          onEscapeKeyDown={(event) => { if (createPending) event.preventDefault(); }}
          onInteractOutside={(event) => { if (createPending) event.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-ink">Create Support Ticket</DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Submit a new inquiry to our support team. We typically respond within 24 hours.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTicket} className="space-y-4 pt-2" noValidate>
            {createError && (
              <p id={createErrorId} role="alert" className="rounded-lg border border-error-200 bg-error-50 p-2.5 text-xs text-error-700">
                {createError}
              </p>
            )}

            <div>
              <label htmlFor={subjectId} className="mb-1 block text-xs font-semibold text-ink">Subject</label>
              <Input
                id={subjectId}
                value={newSubject}
                onChange={(event) => {
                  setNewSubject(event.target.value);
                  if (fieldErrors.subject) setFieldErrors((current) => ({ ...current, subject: undefined }));
                }}
                placeholder="Brief summary of your issue"
                className="h-9 text-xs"
                error={Boolean(fieldErrors.subject)}
                aria-invalid={Boolean(fieldErrors.subject) || undefined}
                aria-describedby={fieldErrors.subject ? subjectErrorId : undefined}
                autoComplete="off"
              />
              {fieldErrors.subject && (
                <p id={subjectErrorId} className="mt-1 text-[11px] text-error-700">{fieldErrors.subject}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={categoryId} className="mb-1 block text-xs font-semibold text-ink">Category</label>
                <select
                  id={categoryId}
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value as typeof newCategory)}
                  className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 text-xs text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="technical">Technical</option>
                  <option value="billing">Billing</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label htmlFor={priorityId} className="mb-1 block text-xs font-semibold text-ink">Priority</label>
                <select
                  id={priorityId}
                  value={newPriority}
                  onChange={(event) => setNewPriority(event.target.value as SupportPriority)}
                  className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 text-xs text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor={messageId} className="mb-1 block text-xs font-semibold text-ink">Message</label>
              <Textarea
                id={messageId}
                value={newMessage}
                onChange={(event) => {
                  setNewMessage(event.target.value);
                  if (fieldErrors.message) setFieldErrors((current) => ({ ...current, message: undefined }));
                }}
                placeholder="Describe your issue in detail. Include error messages, steps to reproduce, and relevant context."
                rows={5}
                className="w-full rounded-xl border border-edge bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-muted"
                error={Boolean(fieldErrors.message)}
                aria-invalid={Boolean(fieldErrors.message) || undefined}
                aria-describedby={fieldErrors.message ? messageErrorId : undefined}
              />
              {fieldErrors.message && (
                <p id={messageErrorId} className="mt-1 text-[11px] text-error-700">{fieldErrors.message}</p>
              )}
            </div>

            <div className="flex flex-col-reverse items-stretch gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="outline" size="sm" onClick={closeCreateModal} disabled={createPending} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs font-semibold" loading={createPending} disabled={createPending}>
                {createPending ? 'Submitting…' : 'Submit Ticket'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TicketListSkeleton() {
  return (
    <div className="animate-pulse p-3.5">
      <div className="mb-1 flex items-center justify-between">
        <div className="h-4 w-1/3 rounded bg-neutral-200" />
        <div className="h-3 w-1/4 rounded bg-neutral-200" />
      </div>
      <div className="mb-1.5 h-4 w-3/4 rounded bg-neutral-200" />
      <div className="flex items-center gap-2">
        <div className="h-5 w-16 rounded-full bg-neutral-200" />
        <div className="h-5 w-12 rounded-full bg-neutral-200" />
      </div>
    </div>
  );
}
