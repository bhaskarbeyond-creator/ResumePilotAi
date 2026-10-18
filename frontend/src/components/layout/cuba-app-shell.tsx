/**
 * CubaAppShell — Executive Glassmorphic Application Shell for Candidate Dashboard
 *
 * Provides:
 * - 4-level breadcrumb navigation (Dashboard > Resumes & Master CV > Build Resume > [Name])
 * - Reactive header with green 'Saved' pill, circular ATS score gauge
 * - Preview and Download dropdown buttons
 * - Cuba M3 executive glassmorphic styling with design tokens
 * - Collapsible sidebar with Resumes, Cover Letters, Web CV, Interview Coach, Job Tracker, Settings
 * - WCAG 2.1 AA accessible
 */

import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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
  Download,
  Eye,
  CheckCircle2,
  Save,
  ChevronDown,
  Code2,
} from 'lucide-react';
import { useTheme } from '@/providers/theme-provider';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  matchPaths?: string[];
}

const candidateNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, matchPaths: ['/dashboard'] },
  { label: 'Resumes & Master CV', href: '/dashboard/resumes', icon: FileText, matchPaths: ['/dashboard/resumes', '/build-resume'] },
  { label: 'Cover Letters', href: '/dashboard/cover-letters', icon: FolderOpen, matchPaths: ['/dashboard/cover-letters', '/coverletter', '/cover-letter'] },
  { label: 'Web CV Portfolio', href: '/dashboard/portfolio', icon: Award, matchPaths: ['/dashboard/portfolio', '/portfolio/builder'] },
  { label: 'Interview Coach', href: '/dashboard/interviews', icon: GraduationCap, matchPaths: ['/dashboard/interviews'] },
  { label: 'Job Tracker', href: '/dashboard/jobs', icon: Briefcase, matchPaths: ['/dashboard/jobs'] },
  { label: 'AI Assistant', href: '/dashboard/ai', icon: Sparkles, matchPaths: ['/dashboard/ai'] },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare, matchPaths: ['/dashboard/messages'] },
];

const bottomNavItems: NavItem[] = [
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, matchPaths: ['/dashboard/settings'] },
];

interface CubaAppShellProps {
  children: ReactNode;
  breadcrumbOverride?: string[];
  atsScore?: number;
  savedStatus?: 'saved' | 'saving' | 'unsaved';
  onPreview?: () => void;
  onDownload?: (format: 'pdf' | 'docx' | 'txt' | 'latex') => void;
}

export function CubaAppShell({
  children,
  breadcrumbOverride,
  atsScore,
  savedStatus = 'saved',
  onPreview,
  onDownload,
}: CubaAppShellProps) {
  const { user, signOut, isAdmin } = useAuth();
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ resumeId?: string }>();
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

  // Build breadcrumbs based on current route
  const breadcrumbs = useMemo(() => {
    if (breadcrumbOverride) {
      return breadcrumbOverride.map((label, index) => ({
        label,
        href: index === breadcrumbOverride.length - 1 ? null : '#',
        isLast: index === breadcrumbOverride.length - 1,
      }));
    }

    // Auto-generate breadcrumbs from route
    const segments = location.pathname.split('/').filter(Boolean);
    const crumbs = [
      { label: 'Dashboard', href: '/dashboard', isLast: false },
    ];

    if (segments[1] === 'dashboard') {
      if (segments[2] === 'resumes') {
        crumbs.push({ label: 'Resumes & Master CV', href: '/dashboard/resumes', isLast: false });
        if (segments[3]) {
          crumbs.push({ label: segments[3], href: '#', isLast: true });
        }
      } else if (segments[2] === 'cover-letters') {
        crumbs.push({ label: 'Cover Letters', href: '/dashboard/cover-letters', isLast: false });
        if (segments[3]) {
          crumbs.push({ label: 'Build Cover Letter', href: '#', isLast: true });
        }
      } else if (segments[2] === 'portfolio') {
        crumbs.push({ label: 'Web CV Portfolio', href: '/dashboard/portfolio', isLast: false });
        if (segments[3]) {
          crumbs.push({ label: 'Builder', href: '#', isLast: true });
        }
      } else if (segments[2] === 'interviews') {
        crumbs.push({ label: 'Interview Coach', href: '/dashboard/interviews', isLast: true });
      } else if (segments[2] === 'jobs') {
        crumbs.push({ label: 'Job Tracker', href: '/dashboard/jobs', isLast: true });
      } else if (segments[2] === 'settings') {
        crumbs.push({ label: 'Settings', href: '/dashboard/settings', isLast: true });
      } else if (segments[2] === 'ai') {
        crumbs.push({ label: 'AI Assistant', href: '/dashboard/ai', isLast: true });
      } else if (segments[2] === 'messages') {
        crumbs.push({ label: 'Messages', href: '/dashboard/messages', isLast: true });
      }
    } else if (segments[0] === 'build-resume') {
      crumbs.push({ label: 'Resumes & Master CV', href: '/dashboard/resumes', isLast: false });
      crumbs.push({ label: 'Build Resume', href: '/build-resume', isLast: false });
      crumbs.push({ label: params.resumeId || 'New Resume', href: '#', isLast: true });
    } else if (segments[0] === 'coverletter' || segments[0] === 'cover-letter') {
      crumbs.push({ label: 'Cover Letters', href: '/dashboard/cover-letters', isLast: false });
      crumbs.push({ label: 'Cover Letter Studio', href: segments[0], isLast: false });
      crumbs.push({ label: 'Editing', href: '#', isLast: true });
    } else if (segments[0] === 'portfolio' && segments[1] === 'builder') {
      crumbs.push({ label: 'Web CV Portfolio', href: '/dashboard/portfolio', isLast: false });
      crumbs.push({ label: 'Portfolio Builder', href: '#', isLast: true });
    }

    return crumbs;
  }, [location.pathname, breadcrumbOverride, params.resumeId]);

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
                          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
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
              <button
                onClick={handleSignOut}
                className="rounded-md p-1 text-ink-muted hover:bg-neutral-100 hover:text-error-600 transition-colors"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar with Breadcrumbs and Reactive Header */}
        <header className="h-14 flex-shrink-0 border-b border-border bg-surface/80 backdrop-blur-sm px-4 lg:px-6">
          <div className="flex h-full items-center justify-between gap-3">
            {/* Mobile menu toggle + Breadcrumbs */}
            <div className="flex flex-1 items-center gap-3 min-w-0">
              <button
                className="rounded-md p-1.5 text-ink-muted hover:bg-neutral-100 lg:hidden"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </button>

              {/* 4-Level Breadcrumbs */}
              <nav className="flex flex-1 items-center gap-1.5 overflow-x-auto" aria-label="Breadcrumb">
                <ol className="flex items-center gap-1.5 whitespace-nowrap" role="list">
                  {breadcrumbs.map((crumb, index) => (
                    <li key={crumb.label} className="flex items-center gap-1.5">
                      {index > 0 && (
                        <span className="text-ink-muted" aria-hidden="true">/</span>
                      )}
                      {crumb.href ? (
                        <Link
                          to={crumb.href}
                          className={cn(
                            'text-sm font-medium transition-colors',
                            crumb.isLast ? 'text-ink' : 'text-ink-secondary hover:text-brand-600'
                          )}
                          aria-current={crumb.isLast ? 'page' : undefined}
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span
                          className={cn(
                            'text-sm font-medium',
                            crumb.isLast ? 'text-ink' : 'text-ink-secondary'
                          )}
                          aria-current={crumb.isLast ? 'page' : undefined}
                        >
                          {crumb.label}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>
            </div>

            {/* Right side: ATS Score Gauge, Saved Status, Actions */}
            <div className="flex items-center gap-3 shrink-0">
              {/* ATS Score Circular Gauge */}
              {atsScore !== undefined && atsScore !== null && (
                <div className="relative flex items-center justify-center" title={`ATS Score: ${atsScore}%`}>
                  <svg className="size-10" viewBox="0 0 40 40" role="img" aria-label={`ATS Score: ${atsScore}%`}>
                    <circle
                      cx="20"
                      cy="20"
                      r="15.915"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="text-neutral-200 dark:text-neutral-700"
                    />
                    <circle
                      cx="20"
                      cy="20"
                      r="15.915"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeDasharray="100"
                      strokeDashoffset={100 - atsScore}
                      strokeLinecap="round"
                      className={cn(
                        'transition-all duration-500',
                        atsScore >= 80 ? 'text-emerald-500' :
                        atsScore >= 60 ? 'text-amber-500' :
                        'text-rose-500'
                      )}
                      style={{
                        transform: 'rotate(-90deg)',
                        transformOrigin: '20px 20px',
                      }}
                    />
                    <text
                      x="20"
                      y="23"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="8"
                      fontWeight="bold"
                      fill="currentColor"
                      className="text-ink"
                    >
                      {atsScore}%
                    </text>
                  </svg>
                </div>
              )}

              {/* Saved Status Pill */}
              <div className="hidden sm:flex">
                <span className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  savedStatus === 'saved'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : savedStatus === 'saving'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                )}>
                  {savedStatus === 'saved' && <CheckCircle2 className="size-3.5" />}
                  {savedStatus === 'saving' && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                  {savedStatus === 'unsaved' && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                  {savedStatus === 'saved' ? 'Saved' : savedStatus === 'saving' ? 'Saving…' : 'Unsaved'}
                </span>
              </div>

              {/* Preview & Download Actions */}
              <div className="flex items-center gap-1.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Eye className="size-3.5" />
                      <span className="hidden sm:inline">Preview</span>
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onPreview?.(); }} className="flex items-center gap-2">
                      <Eye className="size-4" />
                      <span>Preview Resume</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); window.open(`/export/Cv1/${params.resumeId || 'demo'}/en`, '_blank'); }} className="flex items-center gap-2">
                      <LayoutDashboard className="size-4" />
                      <span>Full Template Preview</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); window.open(`/shared/${params.resumeId}`, '_blank'); }} className="flex items-center gap-2">
                      <MessageSquare className="size-4" />
                      <span>Public Share Link</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="primary" size="sm" className="gap-1.5">
                      <Download className="size-3.5" />
                      <span className="hidden sm:inline">Download</span>
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onDownload?.('pdf'); }} className="flex items-center gap-2">
                      <FileText className="size-4" />
                      <span>Download as PDF</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onDownload?.('docx'); }} className="flex items-center gap-2">
                      <FileText className="size-4" />
                      <span>Download as DOCX</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onDownload?.('txt'); }} className="flex items-center gap-2">
                      <FileText className="size-4" />
                      <span>Download as Plain Text</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onDownload?.('latex'); }} className="flex items-center gap-2">
                      <Code2 className="size-4" />
                      <span>Download as LaTeX</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Theme + Notifications (compact) */}
              <div className="flex items-center gap-1.5">
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
              </div>
            </div>
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

