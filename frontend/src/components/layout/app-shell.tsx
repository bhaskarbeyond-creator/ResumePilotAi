/**
 * Authenticated Application Shell
 *
 * Provides the sidebar navigation, top bar, and content area
 * for authenticated users. Enterprise SaaS layout with collapsible sidebar.
 */

import { useState, useCallback, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  GraduationCap,
  Award,
  BarChart3,
  Building2,
  PanelLeftClose,
  PanelLeft,
  FolderOpen,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '@/providers/theme-provider';
import { LogoutConfirmDialog } from '@/components/auth/logout-confirm-dialog';

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  matchPaths?: string[];
}

const candidateNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard, matchPaths: ['/dashboard'] },
  { label: 'Resumes', href: '/dashboard/resumes', icon: FileText, matchPaths: ['/dashboard/resumes', '/build-resume'] },
  { label: 'ATS Score', href: '/dashboard/ats-score', icon: BarChart3, matchPaths: ['/dashboard/ats-score', '/dashboard/ats'] },
  { label: 'Jobs', href: '/dashboard/jobs', icon: Briefcase, matchPaths: ['/dashboard/jobs'] },
  { label: 'Interviews', href: '/dashboard/interviews', icon: GraduationCap, matchPaths: ['/dashboard/interviews'] },
  { label: 'Cover Letters', href: '/dashboard/cover-letters', icon: FolderOpen, matchPaths: ['/dashboard/cover-letters', '/coverletter'] },
  { label: 'Portfolio', href: '/dashboard/portfolio', icon: Award, matchPaths: ['/dashboard/portfolio', '/portfolio'] },
  { label: 'AI Assistant', href: '/dashboard/ai', icon: Sparkles, matchPaths: ['/dashboard/ai'] },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare, matchPaths: ['/dashboard/messages'] },
];

const bottomNavItems: NavItem[] = [
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, matchPaths: ['/dashboard/settings'] },
];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, signOut, isAdmin } = useAuth();
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActiveRoute = useCallback(
    (item: NavItem) => {
      if (item.matchPaths) {
        return item.matchPaths.some((p) => {
          if (p === '/dashboard') {
            return location.pathname === '/dashboard' || location.pathname === '/dashboard/';
          }
          return location.pathname.startsWith(p);
        });
      }
      return location.pathname.startsWith(item.href);
    },
    [location.pathname],
  );

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* Skip Link - must be first focusable element */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[var(--z-tooltip)] focus:p-4 focus:bg-surface focus:text-brand-600 focus:border-b focus:border-brand-200"
      >
        Skip to main content
      </a>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[var(--z-overlay)] bg-neutral-950/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[var(--z-overlay)] flex flex-col border-r border-border bg-surface transition-all duration-300',
          'lg:relative lg:z-auto',
          sidebarCollapsed ? 'w-16' : 'w-64',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        aria-label="Main navigation"
      >
        {/* Logo area */}
        <div className={cn(
          'flex h-14 items-center border-b border-border px-4',
          sidebarCollapsed ? 'justify-center' : 'gap-3',
        )}>
          {!sidebarCollapsed && (
            <Link to="/dashboard" className="flex items-center gap-2.5 no-underline">
              <div className="flex size-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white text-sm">
                IM
              </div>
              <span className="text-sm font-semibold text-ink tracking-tight">IME365</span>
            </Link>
          )}
          {sidebarCollapsed && (
            <Link to="/dashboard" className="flex size-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white text-xs no-underline">
              IM
            </Link>
          )}
          <button
            className="ml-auto hidden rounded-md p-1 text-ink-muted hover:bg-neutral-100 hover:text-ink lg:flex"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
          <button
            className="ml-auto rounded-md p-1 text-ink-muted hover:bg-neutral-100 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-0.5" role="list">
            {candidateNavItems.map((item) => {
              const active = isActiveRoute(item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors duration-150',
                      active
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-ink-secondary hover:bg-neutral-100 hover:text-ink',
                      sidebarCollapsed && 'justify-center px-2',
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <Icon className={cn('size-[18px] shrink-0', active ? 'text-brand-600' : 'text-ink-muted')} />
                    {!sidebarCollapsed && (
                      <>
                        <span>{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border px-2 py-3">
          <ul className="space-y-0.5" role="list">
            {isAdmin && (
              <li>
                <Link
                  to="/admin"
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors',
                    location.pathname.startsWith('/admin')
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-secondary hover:bg-neutral-100 hover:text-ink',
                    sidebarCollapsed && 'justify-center px-2',
                  )}
                  title={sidebarCollapsed ? 'Admin Console' : undefined}
                >
                  <Building2 className="size-[18px] shrink-0 text-ink-muted" />
                  {!sidebarCollapsed && <span>Admin Console</span>}
                </Link>
              </li>
            )}
            {bottomNavItems.map((item) => {
              const active = isActiveRoute(item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors',
                      active
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-ink-secondary hover:bg-neutral-100 hover:text-ink',
                      sidebarCollapsed && 'justify-center px-2',
                    )}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <Icon className={cn('size-[18px] shrink-0', active ? 'text-brand-600' : 'text-ink-muted')} />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* User profile */}
          <div className={cn(
            'mt-3 flex items-center gap-3 rounded-lg border border-border-subtle px-3 py-2',
            sidebarCollapsed && 'justify-center px-2',
          )}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              {initials}
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{displayName}</p>
                <p className="truncate text-xs text-ink-muted">{user?.email}</p>
              </div>
            )}
            {!sidebarCollapsed && (
              <LogoutConfirmDialog onConfirm={handleSignOut}>
                <button
                  type="button"
                  className="rounded-md p-1 text-ink-muted hover:bg-neutral-100 hover:text-error-600 transition-colors"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="size-4" />
                </button>
              </LogoutConfirmDialog>
            )}
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-4 lg:px-6">
          <button
            className="rounded-md p-1.5 text-ink-muted hover:bg-neutral-100 lg:hidden"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>

          {/* Search (desktop) */}
          <div className="hidden flex-1 md:flex">
            <div className="relative max-w-md w-full">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                type="search"
                placeholder="Search resumes, jobs, interviews…"
                className="h-8 w-full rounded-lg border border-border bg-neutral-50 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:outline-2 focus:outline-brand-500 transition-colors"
                aria-label="Search"
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="rounded-md p-1.5 text-ink-muted hover:bg-neutral-100 hover:text-ink transition-colors"
              aria-label="Toggle theme"
              title={`Current theme: ${theme}. Click to switch.`}
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="size-5 text-warning-500" />
              ) : (
                <Moon className="size-5" />
              )}
            </button>
            <button
              className="relative rounded-md p-1.5 text-ink-muted hover:bg-neutral-100 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="size-5" />
            </button>
            <button
              className="rounded-md p-1.5 text-ink-muted hover:bg-neutral-100 transition-colors md:hidden"
              aria-label="Search"
            >
              <Search className="size-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
