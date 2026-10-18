/**
 * Messages & Notifications Center
 *
 * Provides a unified notification and messaging hub for candidates.
 * Supports filtering by category, reading threads, starring, marking as read,
 * and quick reply capabilities.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  Search,
  Bell,
  Star,
  Trash2,
  CheckCircle2,
  MailOpen,
  Mail,
  Send,
  Briefcase,
  GraduationCap,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  Filter,
  AlertCircle,
} from 'lucide-react';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type NotificationMessage,
} from '@/hooks/use-api-hooks';

type MessageCategory = 'all' | 'unread' | 'interviews' | 'jobs' | 'ai' | 'system';

export function MessagesPage() {
  const { data: messages = [], isLoading, error, refetch } = useNotifications();
  const [activeId, setActiveId] = useState<string>(messages[0]?.id ?? '');
  const [currentTab, setCurrentTab] = useState<MessageCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      // Category filter
      if (currentTab === 'unread' && msg.read) return false;
      if (currentTab === 'interviews' && msg.category !== 'interviews') return false;
      if (currentTab === 'jobs' && msg.category !== 'jobs') return false;
      if (currentTab === 'ai' && msg.category !== 'ai') return false;
      if (currentTab === 'system' && msg.category !== 'system') return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesSubject = msg.subject.toLowerCase().includes(query);
        const matchesSender = msg.sender.name.toLowerCase().includes(query);
        const matchesPreview = msg.preview.toLowerCase().includes(query);
        if (!matchesSubject && !matchesSender && !matchesPreview) return false;
      }

      return true;
    });
  }, [messages, currentTab, searchQuery]);

  const activeMessage = useMemo(() => {
    return messages.find((m) => m.id === activeId) || filteredMessages[0] || null;
  }, [messages, activeId, filteredMessages]);

  const markAsRead = (id: string) => {
    markReadMutation.mutate({ id, read: true });
  };

  const markAllAsRead = () => {
    markAllReadMutation.mutate();
  };

  const toggleStar = (_id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Star mutation would go here - using local state for now
    // In production, this would be an API call
  };

  const deleteMessage = (_id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Delete mutation would go here - using local state for now
    // In production, this would be an API call
  };

  const handleSelectMessage = (id: string) => {
    setActiveId(id);
    markAsRead(id);
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeMessage) return;

    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setReplyText('');
      // In production: send reply via API
      alert('Your message was sent successfully!');
    }, 600);
  };

  const unreadCount = messages.filter((m) => !m.read).length;

  const getCategoryIcon = (category: NotificationMessage['category']) => {
    switch (category) {
      case 'ai':
        return <Sparkles className="size-4 text-purple-600" />;
      case 'jobs':
        return <Briefcase className="size-4 text-blue-600" />;
      case 'interviews':
        return <GraduationCap className="size-4 text-emerald-600" />;
      case 'system':
      default:
        return <ShieldCheck className="size-4 text-amber-600" />;
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col p-4 lg:p-6">
      {/* Top Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-ink">Messages & Alerts</h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-brand-500/10 px-2.5 py-0.5 text-xs font-semibold text-brand-600 dark:text-brand-400">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">
            Direct communications, interview schedule updates, and system recommendations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllAsRead}
              loading={markAllReadMutation.isPending}
            >
              <CheckCircle2 className="size-4 mr-1.5" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* ─── Error State ─── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700" role="alert">
          <AlertCircle className="size-4 shrink-0" />
          Failed to load messages. Please check your connection and try again.
        </div>
      )}

      {/* Main Split Interface */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface lg:grid-cols-12 shadow-sm">
        {/* Left Pane: Filter Tabs & Message List (5 cols) */}
        <div className="flex flex-col border-b border-border lg:col-span-5 lg:border-b-0 lg:border-r">
          {/* Search bar */}
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-ink-muted" />
              <Input
                placeholder="Search messages, companies, topics…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
          </div>

          {/* Navigation Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-canvas/40 px-3 py-2 text-xs scrollbar-none">
            <button
              onClick={() => setCurrentTab('all')}
              className={cn(
                'rounded-lg px-2.5 py-1.5 font-medium transition-colors whitespace-nowrap',
                currentTab === 'all'
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'text-ink-muted hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-ink',
              )}
            >
              All ({messages.length})
            </button>
            <button
              onClick={() => setCurrentTab('unread')}
              className={cn(
                'rounded-lg px-2.5 py-1.5 font-medium transition-colors whitespace-nowrap',
                currentTab === 'unread'
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'text-ink-muted hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-ink',
              )}
            >
              Unread ({unreadCount})
            </button>
            <button
              onClick={() => setCurrentTab('jobs')}
              className={cn(
                'rounded-lg px-2.5 py-1.5 font-medium transition-colors whitespace-nowrap',
                currentTab === 'jobs'
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'text-ink-muted hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-ink',
              )}
            >
              Jobs
            </button>
            <button
              onClick={() => setCurrentTab('interviews')}
              className={cn(
                'rounded-lg px-2.5 py-1.5 font-medium transition-colors whitespace-nowrap',
                currentTab === 'interviews'
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'text-ink-muted hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-ink',
              )}
            >
              Interviews
            </button>
            <button
              onClick={() => setCurrentTab('ai')}
              className={cn(
                'rounded-lg px-2.5 py-1.5 font-medium transition-colors whitespace-nowrap',
                currentTab === 'ai'
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'text-ink-muted hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-ink',
              )}
            >
              AI Insights
            </button>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {isLoading && messages.length === 0 ? (
              <div className="space-y-0">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="group relative flex cursor-pointer items-start gap-3 p-3.5 transition-all text-left animate-pulse">
                    <div className="mt-1.5 flex shrink-0 items-center">
                      <span className="size-2 rounded-full bg-brand-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="h-4 bg-neutral-200 rounded w-3/4 mb-1" />
                      <div className="h-4 bg-neutral-200 rounded w-1/2 mb-0.5" />
                      <p className="h-3 bg-neutral-200 rounded line-clamp-1" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-ink-muted">
                  <MailOpen className="size-6" />
                </div>
                <p className="text-sm font-semibold text-ink">No messages found</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Try adjusting your search criteria or switching filter tabs.
                </p>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isSelected = activeMessage?.id === msg.id;
                return (
                  <div
                    key={msg.id}
                    onClick={() => handleSelectMessage(msg.id)}
                    className={cn(
                      'group relative flex cursor-pointer items-start gap-3 p-3.5 transition-all text-left',
                      isSelected
                        ? 'bg-brand-50/60 dark:bg-brand-950/20'
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-900/40',
                      !msg.read && 'font-medium',
                    )}
                  >
                    {/* Unread indicator bullet */}
                    <div className="mt-1.5 flex shrink-0 items-center">
                      <span
                        className={cn(
                          'size-2 rounded-full',
                          !msg.read ? 'bg-brand-600 dark:bg-brand-400' : 'bg-transparent',
                        )}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className={cn('text-xs truncate font-semibold', msg.read ? 'text-ink-muted' : 'text-ink')}>
                          {msg.sender.name}
                        </span>
                        <span className="text-[11px] text-ink-muted shrink-0">{msg.timestamp}</span>
                      </div>

                      <div className={cn('text-sm truncate mb-0.5', msg.read ? 'text-ink/80' : 'text-ink font-semibold')}>
                        {msg.subject}
                      </div>

                      <p className="line-clamp-1 text-xs text-ink-muted">
                        {msg.preview}
                      </p>

                      <div className="mt-2 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] text-ink-muted">
                          {getCategoryIcon(msg.category)}
                          <span className="capitalize">{msg.category}</span>
                        </span>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => toggleStar(msg.id, e)}
                            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-ink-muted"
                            title={msg.starred ? 'Starred' : 'Star message'}
                          >
                            <Star
                              className={cn(
                                'size-3.5',
                                msg.starred && 'fill-amber-400 text-amber-500',
                              )}
                            />
                          </button>
                          <button
                            onClick={(e) => deleteMessage(msg.id, e)}
                            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-error-500"
                            title="Delete"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Message Viewer & Action Thread (7 cols) */}
        <div className="flex flex-col lg:col-span-7 bg-surface">
          {activeMessage ? (
            <div className="flex h-full flex-col">
              {/* Message Header */}
              <div className="border-b border-border p-4 lg:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-ink leading-snug">
                      {activeMessage.subject}
                    </h2>
                    <div className="mt-2 flex items-center gap-2.5">
                      <div className="flex size-9 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-semibold text-xs">
                        {activeMessage.sender.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink">
                            {activeMessage.sender.name}
                          </span>
                          <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] text-ink-muted">
                            {activeMessage.sender.role}
                          </span>
                        </div>
                        <p className="text-xs text-ink-muted">Received {activeMessage.timestamp}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => toggleStar(activeMessage.id)}
                      title={activeMessage.starred ? 'Starred' : 'Star'}
                    >
                      <Star
                        className={cn(
                          'size-4',
                          activeMessage.starred && 'fill-amber-400 text-amber-500',
                        )}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => deleteMessage(activeMessage.id)}
                      title="Delete"
                    >
                      <Trash2 className="size-4 text-error-500" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Message Body */}
              <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-line text-sm text-ink leading-relaxed">
                  {activeMessage.body}
                </div>

                {/* Quick Action Buttons */}
                {activeMessage.actions && activeMessage.actions.length > 0 && (
                  <div className="pt-4 border-t border-border flex flex-wrap items-center gap-3">
                    {activeMessage.actions.map((act, idx) => (
                      <Button
                        key={idx}
                        variant={act.variant === 'outline' ? 'outline' : 'primary'}
                        size="sm"
                        asChild
                      >
                        <a href={act.href || '#'}>
                          {act.label}
                          <ChevronRight className="size-3.5 ml-1" />
                        </a>
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {/* Reply Box */}
              {!activeMessage.sender.isSystem && (
                <div className="border-t border-border p-4 bg-canvas/30">
                  <form onSubmit={handleSendReply} className="space-y-3">
                    <label htmlFor="reply-box" className="text-xs font-semibold text-ink-muted block">
                      Reply to {activeMessage.sender.name}
                    </label>
                    <textarea
                      id="reply-box"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your response here..."
                      rows={3}
                      className="w-full resize-none rounded-xl border border-border bg-surface p-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <div className="flex items-center justify-end">
                      <Button type="submit" size="sm" loading={isSending} disabled={!replyText.trim()}>
                        <Send className="size-3.5 mr-1.5" />
                        Send Reply
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-ink-muted">
              <Mail className="size-10 mb-2 opacity-30" />
              <p className="text-sm font-medium">Select a message from the list to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}