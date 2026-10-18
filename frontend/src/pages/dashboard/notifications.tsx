/**
 * Notifications Dashboard
 *
 * Centralized notification center with real-time updates, categorization,
 * priority levels, and rich notification content with actions.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Bell,
  BellOff,
  Search,
  CheckCircle2,
  Filter,
  ChevronRight,
  X,
  ShieldCheck,
  Sparkles,
  Briefcase,
  GraduationCap,
  MessageSquare,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, type NotificationMessage } from '@/hooks/use-api-hooks';

type NotificationFilter = 'all' | 'unread' | 'interviews' | 'jobs' | 'ai' | 'system';

interface ExtendedNotificationMessage extends NotificationMessage {
  priority: 'low' | 'normal' | 'high' | 'urgent';
  isPersistent: boolean;
}

export function NotificationsPage() {
  const { data: notifications = [], isLoading, error, refetch } = useNotifications();
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  // Cast to extended type with priority for UI
  const typedNotifications = notifications as ExtendedNotificationMessage[];

  const filteredNotifications = useMemo(() => {
    return typedNotifications.filter((notif) => {
      // Category filter
      if (activeFilter === 'unread' && notif.read) return false;
      if (activeFilter === 'interviews' && notif.category !== 'interviews') return false;
      if (activeFilter === 'jobs' && notif.category !== 'jobs') return false;
      if (activeFilter === 'ai' && notif.category !== 'ai') return false;
      if (activeFilter === 'system' && notif.category !== 'system') return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesSubject = notif.subject.toLowerCase().includes(query);
        const matchesSender = notif.sender.name.toLowerCase().includes(query);
        const matchesPreview = notif.preview.toLowerCase().includes(query);
        if (!matchesSubject && !matchesSender && !matchesPreview) return false;
      }

      return true;
    });
  }, [typedNotifications, activeFilter, searchQuery]);

  const unreadCount = typedNotifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    markReadMutation.mutate({ id, read: true });
  };

  const markAllAsRead = () => {
    markAllReadMutation.mutate();
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setShowDetails(true);
    markAsRead(id);
  };

  const closeDetails = () => {
    setShowDetails(false);
    setSelectedId(null);
  };

  const getCategoryConfig = (category: NotificationMessage['category']) => {
    const configs = {
      ai: { icon: Sparkles, color: 'text-purple-600 bg-purple-500/10', label: 'AI Insights' },
      jobs: { icon: Briefcase, color: 'text-blue-600 bg-blue-500/10', label: 'Job Opportunities' },
      interviews: { icon: GraduationCap, color: 'text-emerald-600 bg-emerald-500/10', label: 'Interviews' },
      system: { icon: ShieldCheck, color: 'text-amber-600 bg-amber-500/10', label: 'System Alerts' },
    };
    return configs[category] || configs.system;
  };

  const getPriorityConfig = (priority: ExtendedNotificationMessage['priority']) => {
    const configs = {
      urgent: { color: 'text-red-600 bg-red-500/10 border-red-500/20', icon: AlertTriangle },
      high: { color: 'text-amber-600 bg-amber-500/10 border-amber-500/20', icon: AlertTriangle },
      normal: { color: 'text-blue-600 bg-blue-500/10 border-blue-500/20', icon: Bell },
      low: { color: 'text-neutral-600 bg-neutral-500/10 border-neutral-500/20', icon: BellOff },
    };
    return configs[priority];
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-edge pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
            <Bell className="size-6 text-accent" />
            Notification Center
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Real-time updates from interviews, job matches, AI insights, and system alerts.
            {unreadCount > 0 && <span className="ml-2 inline-flex items-center rounded-full bg-brand-500/10 px-2.5 py-0.5 text-xs font-semibold text-brand-600">{unreadCount} unread</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllAsRead}
              loading={markAllReadMutation.isPending}
              className="text-xs gap-1.5"
            >
              <CheckCircle2 className="size-4" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* ─── Error State ─── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700" role="alert">
          <AlertTriangle className="size-4 shrink-0" />
          Failed to load notifications. Please check your connection and try again.
        </div>
      )}

      {/* ─── Filter & Search Bar ─── */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {(['all', 'unread', 'jobs', 'interviews', 'ai', 'system'] as NotificationFilter[]).map((filter) => {
            const count = filter === 'all'
              ? notifications.length
              : filter === 'unread'
              ? unreadCount
              : notifications.filter((n) => n.category === filter).length;
            // For 'all' and 'unread' filters, use system config for icon
            const categoryForIcon = filter === 'all' || filter === 'unread' ? 'system' : filter;
            const { icon: Icon, color } = getCategoryConfig(categoryForIcon);
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
                <Icon className={cn('size-3.5', activeFilter === filter ? 'text-white' : color.split(' ')[1])} />
                <span className="capitalize">{filter}</span>
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
            placeholder="Search notifications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs h-9"
          />
        </div>
      </div>

      {/* ─── Notification List ─── */}
      {isLoading && notifications.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <NotificationSkeleton key={i} />
          ))}
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="border border-edge rounded-2xl bg-surface p-12 text-center">
          <Bell className="size-16 text-ink-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-ink mb-2">
            {searchQuery ? 'No matches found' : 'No notifications yet'}
          </h3>
          <p className="text-sm text-ink-muted mb-6 max-w-md mx-auto">
            {searchQuery ? 'Try adjusting your search or filter criteria.' : 'Notifications from job matches, interview invites, and system alerts will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notif) => (
            <NotificationCard
              key={notif.id}
              notification={notif}
              isSelected={selectedId === notif.id}
              onClick={() => handleSelect(notif.id)}
            />
          ))}
        </div>
      )}

      {/* ─── Detail Panel (Mobile Modal / Desktop Sidebar) ─── */}
      {showDetails && selectedId && (
        <NotificationDetailPanel
          notification={typedNotifications.find((n) => n.id === selectedId)!}
          onClose={closeDetails}
          onMarkRead={() => markAsRead(selectedId!)}
        />
      )}
    </div>
  );
}

/* ─── Notification Card Component ─── */
function NotificationCard({
  notification,
  isSelected,
  onClick,
}: {
  notification: ExtendedNotificationMessage;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { icon: Icon, color } = getCategoryConfig(notification.category);
  const { color: priorityColor, icon: PriorityIcon } = getPriorityConfig(notification.priority);

  return (
    <Card
      className={cn(
        'border-edge shadow-sm cursor-pointer transition-all',
        isSelected && 'ring-2 ring-accent/50 bg-accent-soft/30',
        !notification.read && 'bg-surface'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Category Icon */}
          <div className={cn('size-10 rounded-xl flex items-center justify-center shrink-0', color)}>
            <Icon className="size-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h3 className={cn('font-semibold text-sm truncate', !notification.read ? 'text-ink' : 'text-ink/80')}>
                  {notification.subject}
                </h3>
                {!notification.read && (
                  <span className="size-2 rounded-full bg-accent shrink-0" aria-label="Unread" />
                )}
              </div>
              <span className="text-[11px] text-ink-muted shrink-0">{notification.timestamp}</span>
            </div>

            <p className={cn('text-sm text-ink-muted line-clamp-1', !notification.read ? 'font-medium' : '')}>
              {notification.preview}
            </p>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border', color)}>
                <Icon className="size-3" />
                {getCategoryConfig(notification.category).label}
              </span>

              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border', priorityColor)}>
                <PriorityIcon className="size-3" />
                {notification.priority.charAt(0).toUpperCase() + notification.priority.slice(1)}
              </span>

              {notification.starred && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 border-amber-500/20">
                  <svg className="size-3 fill-current" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  Starred
                </span>
              )}
            </div>
          </div>

          {/* Actions Preview */}
          {notification.actions && notification.actions.length > 0 && (
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {notification.actions.slice(0, 2).map((_act, idx) => (
                <Button key={idx} variant="ghost" size="icon-sm" className="text-ink-muted hover:text-accent">
                  <ChevronRight className="size-4" />
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Notification Detail Panel ─── */
function NotificationDetailPanel({
  notification,
  onClose,
  onMarkRead,
}: {
  notification: ExtendedNotificationMessage;
  onClose: () => void;
  onMarkRead: () => void;
}) {
  const { icon: Icon, color } = getCategoryConfig(notification.category);

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-labelledby="notification-detail-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-md bg-surface border-l border-edge shadow-2xl flex flex-col animate-in slide-in-from-right">
        {/* Mobile Header */}
        <div className="flex items-center justify-between p-4 border-b border-edge">
          <h2 id="notification-detail-title" className="text-base font-bold text-ink">Notification</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-canvas text-ink-muted" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <NotificationDetailContent notification={notification} onMarkRead={onMarkRead} />
        </div>
      </div>
    </div>
  );
}

/* ─── Notification Detail Content (Shared) ─── */
function NotificationDetailContent({
  notification,
  onMarkRead,
}: {
  notification: ExtendedNotificationMessage;
  onMarkRead: () => void;
}) {
  const { icon: Icon, color } = getCategoryConfig(notification.category);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn('size-12 rounded-xl flex items-center justify-center shrink-0', color)}>
          <Icon className="size-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-ink">{notification.subject}</h3>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border" style={{ borderColor: color.split(' ')[2]?.replace('border-', '') || 'transparent' }}>
              <Icon className="size-3" />
              {getCategoryConfig(notification.category).label}
            </span>
            <span className="text-xs text-ink-muted">{notification.timestamp}</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">From: {notification.sender.name} <span className="text-ink-muted">({notification.sender.role})</span></p>
        </div>
      </div>

      {/* Body */}
      <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-line text-sm text-ink leading-relaxed border-t border-edge pt-4">
        {notification.body}
      </div>

      {/* Actions */}
      {notification.actions && notification.actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-edge">
          {notification.actions.map((act, idx) => (
            <Button
              key={idx}
              variant={act.variant === 'outline' ? 'outline' : 'primary'}
              size="sm"
              asChild
            >
              <a href={act.href || '#'} onClick={onMarkRead}>
                {act.label}
                <ChevronRight className="size-3.5 ml-1" />
              </a>
            </Button>
          ))}
        </div>
      )}

      {notification.sender.isSystem && !notification.read && (
        <Button variant="outline" size="sm" onClick={onMarkRead} className="w-full text-xs">
          <CheckCircle2 className="size-3.5 mr-1.5" />
          Mark as Read
        </Button>
      )}
    </div>
  );
}

/* ─── Skeleton Component ─── */
function NotificationSkeleton() {
  return (
    <Card className="border-edge shadow-sm animate-pulse">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-xl bg-neutral-200 shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-5 bg-neutral-200 rounded w-3/4" />
            <div className="h-4 bg-neutral-200 rounded w-1/2" />
            <div className="h-3 bg-neutral-200 rounded w-full" />
            <div className="flex gap-2">
              <div className="h-5 bg-neutral-200 rounded-full px-3" />
              <div className="h-5 bg-neutral-200 rounded-full px-3" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Category Config Helper (moved outside to avoid re-creation) ─── */
function getCategoryConfig(category: NotificationMessage['category']) {
  const configs = {
    ai: { icon: Sparkles, color: 'text-purple-600 bg-purple-500/10', label: 'AI Insights' },
    jobs: { icon: Briefcase, color: 'text-blue-600 bg-blue-500/10', label: 'Job Opportunities' },
    interviews: { icon: GraduationCap, color: 'text-emerald-600 bg-emerald-500/10', label: 'Interviews' },
    system: { icon: ShieldCheck, color: 'text-amber-600 bg-amber-500/10', label: 'System Alerts' },
  };
  return configs[category] || configs.system;
}

function getPriorityConfig(priority: ExtendedNotificationMessage['priority']) {
  const configs = {
    urgent: { color: 'text-red-600 bg-red-500/10 border-red-500/20', icon: AlertTriangle },
    high: { color: 'text-amber-600 bg-amber-500/10 border-amber-500/20', icon: AlertTriangle },
    normal: { color: 'text-blue-600 bg-blue-500/10 border-blue-500/20', icon: Bell },
    low: { color: 'text-neutral-600 bg-neutral-500/10 border-neutral-500/20', icon: BellOff },
  };
  return configs[priority];
}