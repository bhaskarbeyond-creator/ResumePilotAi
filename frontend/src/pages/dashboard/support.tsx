/**
 * Support Dashboard
 *
 * Candidate-facing support ticket system for submitting inquiries,
 * tracking ticket status, and communicating with support staff.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  HelpCircle,
  MessageSquare,
  Send,
  RefreshCw,
  Search,
  Filter,
  X,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import {
  useDashboardSupportTickets,
  useCreateSupportTicket,
  useReplyToSupportTicket,
  type SupportTicket,
} from '@/hooks/use-api-hooks';

type SupportFilter = 'all' | 'open' | 'in_progress' | 'resolved';
type SupportPriority = 'low' | 'normal' | 'urgent';

export function SupportPage() {
  const { data: tickets = [], isLoading, error, refetch } = useDashboardSupportTickets();
  const createMutation = useCreateSupportTicket();
  const replyMutation = useReplyToSupportTicket();

  const [activeFilter, setActiveFilter] = useState<SupportFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [replyText, setReplyText] = useState('');

  // Create ticket form state
  const [newSubject, setNewSubject] = useState('');
  const [newPriority, setNewPriority] = useState<SupportPriority>('normal');
  const [newMessage, setNewMessage] = useState('');

  const filteredTickets = tickets.filter((t) => {
    if (activeFilter !== 'all' && t.status.toLowerCase().replace('_', ' ') !== activeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!t.subject.toLowerCase().includes(q) && !t.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || null;

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newMessage.trim()) return;

    await createMutation.mutateAsync({
      subject: newSubject,
      priority: newPriority,
      message: newMessage,
    });

    setShowCreateModal(false);
    setNewSubject('');
    setNewMessage('');
    setNewPriority('normal');
    refetch();
  };

  const handleReply = async (e: React.FormEvent, ticketId: string) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    await replyMutation.mutateAsync({ ticketId, body: replyText });
    setReplyText('');
    refetch();
  };

  const getStatusConfig = (status: SupportTicket['status']) => {
    const configs = {
      OPEN: { label: 'Open', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Clock },
      IN_PROGRESS: { label: 'In Progress', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Loader2 },
      RESOLVED: { label: 'Resolved', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: CheckCircle2 },
    };
    return configs[status];
  };

  const getPriorityConfig = (priority: SupportPriority) => {
    const configs = {
      urgent: { label: 'Urgent', color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: AlertTriangle },
      normal: { label: 'Normal', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: MessageSquare },
      low: { label: 'Low', color: 'bg-neutral-500/10 text-neutral-600 border-neutral-500/20', icon: MessageSquare },
    };
    return configs[priority];
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-edge pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
            <HelpCircle className="size-6 text-accent" />
            Support Center
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Submit inquiries, track your tickets, and communicate with our support team.
          </p>
        </div>

        <Button onClick={() => setShowCreateModal(true)} className="text-xs font-semibold gap-1.5" disabled={createMutation.isPending}>
          <MessageSquare className="size-3.5" />
          Create New Ticket
        </Button>
      </div>

      {/* ─── Error State ─── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700" role="alert">
          <XCircle className="size-4 shrink-0" />
          Failed to load tickets. Please check your connection and try again.
        </div>
      )}

      {/* ─── Filter & Search Bar ─── */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {(['all', 'open', 'in_progress', 'resolved'] as SupportFilter[]).map((filter) => {
            const count = filter === 'all'
              ? tickets.length
              : tickets.filter((t) => t.status.toLowerCase().replace('_', ' ') === filter).length;
            const { icon: Icon } = getStatusConfig(filter.toUpperCase().replace(' ', '_') as SupportTicket['status']);
            return (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={cn(
                  'rounded-lg px-3 py-1.5 font-medium text-xs transition-colors whitespace-nowrap flex items-center gap-1.5',
                  activeFilter === filter
                    ? 'bg-accent text-white'
                    : 'text-ink-muted hover:bg-canvas bg-transparent'
                )}
              >
                <Icon className="size-3.5" />
                <span className="capitalize">{filter.replace('_', ' ')}</span>
                <span className="inline-flex items-center justify-center size-5 rounded-full text-[10px] font-bold bg-black/10">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="size-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Search tickets by subject or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs h-9"
          />
        </div>
      </div>

      {/* ─── Ticket List & Detail Split View ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 rounded-xl border border-border bg-surface overflow-hidden shadow-sm">
        {/* Ticket List (5 cols) */}
        <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-border divide-y divide-border overflow-y-auto max-h-[calc(100vh-14rem)]">
          {isLoading && tickets.length === 0 ? (
            <div className="space-y-0 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <TicketListSkeleton key={i} />
              ))}
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-muted">
              <HelpCircle className="size-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-sm mb-1">
                {searchQuery ? 'No tickets match your search.' : 'No support tickets yet.'}
              </p>
              <p className="text-[11px]">
                {searchQuery ? 'Try adjusting your search or filter.' : 'Create a ticket to get help from our support team.'}
              </p>
            </div>
          ) : (
            filteredTickets.map((ticket) => {
              const isSelected = selectedTicketId === ticket.id;
              const { label: statusLabel, color: statusColor, icon: StatusIcon } = getStatusConfig(ticket.status);
              return (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={cn(
                    'p-3.5 cursor-pointer text-left transition-colors',
                    isSelected ? 'bg-accent-soft/50' : 'hover:bg-neutral-50'
                  )}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTicketId(ticket.id); } }}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-ink truncate max-w-[180px]">{ticket.email}</span>
                    <span className="text-ink-muted">{ticket.createdAt}</span>
                  </div>
                  <div className="text-xs font-medium text-ink line-clamp-1 mb-1.5">{ticket.subject}</div>
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', statusColor)}>
                      <StatusIcon className="size-3 mr-0.5" />
                      {statusLabel}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-ink-muted">{ticket.priority}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Ticket Detail & Reply (7 cols) */}
        <div className="lg:col-span-7 flex flex-col">
          {selectedTicket ? (
            <>
              {/* Ticket Header */}
              <div className="border-b border-border p-4 lg:p-6 flex flex-col">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-ink">{selectedTicket.subject}</h2>
                    <p className="mt-1 text-xs text-ink-muted">From: {selectedTicket.email} • Created {selectedTicket.createdAt}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedTicket.status !== 'RESOLVED' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 border-amber-500/20">
                        <Clock className="size-3 mr-0.5" />
                        Awaiting Response
                      </span>
                    )}
                    {selectedTicket.status === 'RESOLVED' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        <CheckCircle2 className="size-3 mr-0.5" />
                        Resolved
                      </span>
                    )}
                  </div>
                </div>

                {/* Meta Badges */}
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  {(() => {
                    const priorityCfg = getPriorityConfig(selectedTicket.priority);
                    const PriorityIcon = priorityCfg.icon;
                    return (
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border', priorityCfg.color)}>
                        <PriorityIcon className="size-3" />
                        {priorityCfg.label}
                      </span>
                    );
                  })()}
                  {(() => {
                    const statusCfg = getStatusConfig(selectedTicket.status);
                    const StatusIcon = statusCfg.icon;
                    return (
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border', statusCfg.color)}>
                        <StatusIcon className="size-3" />
                        {statusCfg.label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Messages Thread */}
              <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 border-b border-border">
                {selectedTicket.messages?.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex gap-3',
                      msg.role === 'STAFF' ? 'flex-row-reverse' : 'flex-row'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[80%] p-3 rounded-2xl',
                        msg.role === 'STAFF'
                          ? 'bg-brand-50 text-brand-900 border border-brand-100 rounded-tr-sm'
                          : 'bg-neutral-100 text-neutral-800 rounded-tl-sm'
                      )}
                    >
                      <div className="flex items-center justify-between text-[10px] font-semibold text-ink-muted mb-1">
                        <span>{msg.role === 'STAFF' ? 'Support Specialist' : 'You'}</span>
                        <span>{msg.createdAt}</span>
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap text-sm">{msg.body}</p>
                    </div>
                  </div>
                ))}
                {(!selectedTicket.messages || selectedTicket.messages.length === 0) && (
                  <div className="py-8 text-center text-xs text-ink-muted">
                    <MessageSquare className="size-8 mx-auto mb-2 opacity-30" />
                    <p>No messages yet. Be the first to respond!</p>
                  </div>
                )}
              </div>

              {/* Reply Form */}
              <form onSubmit={(e) => handleReply(e, selectedTicket.id)} className="p-4 lg:p-6 border-t border-border bg-canvas/30">
                <label htmlFor="support-reply" className="block text-xs font-semibold text-ink-muted mb-2">
                  Add a reply
                </label>
                <Textarea
                  id="support-reply"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your response to the support team..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-border bg-surface text-sm text-ink placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <div className="flex items-center justify-end gap-2 mt-3">
                  <Button type="submit" size="sm" loading={replyMutation.isPending} disabled={!replyText.trim()}>
                    <Send className="size-3.5 mr-1.5" />
                    Send Reply
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-ink-muted">
              <HelpCircle className="size-16 mb-4 opacity-30" />
              <p className="text-sm font-medium">Select a ticket from the list to view and respond</p>
              <p className="text-xs mt-1">Or create a new ticket to get support</p>
              <Button variant="outline" size="sm" onClick={() => setShowCreateModal(true)} className="mt-4 text-xs gap-1.5">
                <MessageSquare className="size-3.5" />
                Create Ticket
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Create Ticket Modal ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="create-ticket-title">
          <div className="absolute inset-0" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-surface border border-edge rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors"
              aria-label="Close create ticket modal"
            >
              <X className="size-5" />
            </button>

            <div>
              <h3 id="create-ticket-title" className="text-base font-bold text-ink">Create Support Ticket</h3>
              <p className="text-xs text-ink-muted">Submit a new inquiry to our support team. We typically respond within 24 hours.</p>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Subject</label>
                <Input
                  required
                  placeholder="Brief summary of your issue"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Priority</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as SupportPriority)}
                  className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  <option value="low">Low - General question or feedback</option>
                  <option value="normal">Normal - Standard support request</option>
                  <option value="urgent">Urgent - Time-sensitive issue affecting your account</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Message</label>
                <Textarea
                  required
                  placeholder="Describe your issue in detail. Include any error messages, steps to reproduce, and relevant context."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={5}
                  className="w-full resize-none rounded-xl border border-edge bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="text-xs font-semibold" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Submitting...' : 'Submit Ticket'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Ticket List Skeleton ─── */
function TicketListSkeleton() {
  return (
    <div className="p-3.5 animate-pulse">
      <div className="flex items-center justify-between text-xs mb-1">
        <div className="h-4 bg-neutral-200 rounded w-1/3" />
        <div className="h-3 bg-neutral-200 rounded w-1/4" />
      </div>
      <div className="h-4 bg-neutral-200 rounded w-3/4 mb-1.5" />
      <div className="flex items-center gap-2">
        <div className="h-5 bg-neutral-200 rounded-full px-2" />
        <div className="h-5 bg-neutral-200 rounded-full px-2" />
      </div>
    </div>
  );
}

/* ─── Status Config Helper ─── */
function getStatusConfig(status: SupportTicket['status']) {
  const configs = {
    OPEN: { label: 'Open', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Clock },
    IN_PROGRESS: { label: 'In Progress', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Loader2 },
    RESOLVED: { label: 'Resolved', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: CheckCircle2 },
  };
  return configs[status] || configs.OPEN;
}

function getPriorityConfig(priority: SupportPriority) {
  const configs = {
    urgent: { label: 'Urgent', color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: AlertTriangle },
    normal: { label: 'Normal', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: MessageSquare },
    low: { label: 'Low', color: 'bg-neutral-500/10 text-neutral-600 border-neutral-500/20', icon: MessageSquare },
  };
  return configs[priority];
}