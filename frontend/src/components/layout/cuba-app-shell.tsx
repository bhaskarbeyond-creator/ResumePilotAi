/**
 * CubaAppShell — Executive Glassmorphic Application Shell for Candidate Dashboard
 *
 * Provides:
 * - 3-Group Categorical Sidebar (Workspace, Job Intelligence, Account & Security)
 * - 4-Level breadcrumb navigation (Dashboard > Resumes & Master CV > Build Resume > [Name])
 * - Reactive header with Saved pill, circular ATS score gauge
 * - Preview and Download dropdown buttons
 * - Live unread notification bell with interactive popover
 * - M3 Executive User Identity dropdown menu with direct profile/security deep-links
 * - Cuba M3 executive glassmorphic styling with design tokens
 * - WCAG 2.1 AA accessible
 */

import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  Send,
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
  ChevronDown,
  Code2,
  Star,
  HelpCircle,
  CreditCard,
  User,
  Users,
  Shield,
  Activity,
  Server,
  Database,
  AlertTriangle,
  ShieldCheck,
  Sliders,
  Zap,
  BarChart2,
  Lock,
  Mail,
  Brain,
  Command,
  Crown,
  Check,
} from 'lucide-react';
import { useTheme } from '@/providers/theme-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useNotifications } from '@/hooks/use-api-hooks';
import { AiQuotaBadge } from './ai-quota-badge';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  badge?: number | string;
  matchPaths?: string[];
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const candidateNavGroups: NavGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'overview', label: 'Overview', href: '/dashboard', icon: LayoutDashboard, matchPaths: ['/dashboard'] },
      { id: 'resumes', label: 'Resumes & Master CV', href: '/dashboard/resumes', icon: FileText, matchPaths: ['/dashboard/resumes', '/build-resume'] },
      { id: 'cover-letters', label: 'Cover Letters', href: '/dashboard/cover-letters', icon: FolderOpen, matchPaths: ['/dashboard/cover-letters', '/coverletter', '/cover-letter'] },
      { id: 'portfolio', label: 'Portfolios & Web CV', href: '/dashboard/portfolio', icon: Award, matchPaths: ['/dashboard/portfolio', '/portfolio/builder'] },
      { id: 'ats', label: 'ATS Score Analytics', href: '/dashboard/ats-score', icon: BarChart3, matchPaths: ['/dashboard/ats-score', '/dashboard/ats'] },
      { id: 'favourites', label: 'Saved Favorites', href: '/dashboard/favourites', icon: Star, matchPaths: ['/dashboard/favourites', '/dashboard/favorites'] },
      { id: 'notifications', label: 'Notifications', href: '/dashboard/notifications', icon: Bell, matchPaths: ['/dashboard/notifications'] },
    ],
  },
  {
    id: 'intelligence',
    label: 'Job Intelligence',
    items: [
      { id: 'jobs', label: 'Browse Job Portal', href: '/dashboard/jobs', icon: Search, matchPaths: ['/dashboard/jobs', '/jobs'] },
      { id: 'tracker', label: 'Job Tracker', href: '/dashboard/job-tracker', icon: Briefcase, matchPaths: ['/dashboard/job-tracker'] },
      { id: 'applied', label: 'Applied Jobs', href: '/dashboard/applied-jobs', icon: Send, matchPaths: ['/dashboard/applied-jobs'] },
      { id: 'interview', label: 'AI Interview Coach', href: '/dashboard/interviews', icon: GraduationCap, matchPaths: ['/dashboard/interviews', '/dashboard/interview'] },
      { id: 'messages', label: 'Messages & Chat', href: '/dashboard/messages', icon: MessageSquare, matchPaths: ['/dashboard/messages'] },
      { id: 'ai', label: 'AI Career Assistant', href: '/dashboard/ai', icon: Sparkles, matchPaths: ['/dashboard/ai'] },
    ],
  },
  {
    id: 'account',
    label: 'Account & Security',
    items: [
      { id: 'plans', label: 'Subscription & Plans', href: '/pricing', icon: CreditCard, matchPaths: ['/pricing', '/billing'] },
      { id: 'profile', label: 'Master Profile', href: '/dashboard/settings?tab=profile', icon: User, matchPaths: ['/dashboard/settings?tab=profile'] },
      { id: 'security', label: 'Security & 2FA Hub', href: '/dashboard/settings?tab=security', icon: Shield, matchPaths: ['/dashboard/settings?tab=security'] },
      { id: 'support', label: 'Help Desk & Support', href: '/dashboard/support', icon: HelpCircle, matchPaths: ['/dashboard/support'] },
      { id: 'settings', label: 'Settings & Preferences', href: '/dashboard/settings', icon: Settings, matchPaths: ['/dashboard/settings'] },
    ],
  },
];

const adminNavGroups: NavGroup[] = [
  {
    id: 'observability',
    label: 'Observability & Core',
    items: [
      { id: 'dashboard', label: 'Command Center', href: '/admin/dashboard', icon: BarChart3, matchPaths: ['/admin', '/admin/dashboard'] },
      { id: 'health', label: 'Platform Health', href: '/admin/health', icon: Activity, matchPaths: ['/admin/health'], badge: 'Live' },
      { id: 'queues', label: 'Queues & Outbox DLQ', href: '/admin/queues', icon: Database, matchPaths: ['/admin/queues'] },
      { id: 'operations', label: 'Operations & Maint.', href: '/admin/operations', icon: Server, matchPaths: ['/admin/operations'] },
      { id: 'attention', label: 'Attention Needed', href: '/admin/attention', icon: AlertTriangle, matchPaths: ['/admin/attention'], badge: '2' },
    ],
  },
  {
    id: 'identity',
    label: 'Identity & Support',
    items: [
      { id: 'users', label: 'Users Manager & 360', href: '/admin/users', icon: Users, matchPaths: ['/admin/users'] },
      { id: 'support', label: 'Help Desk & Tickets', href: '/admin/support', icon: HelpCircle, matchPaths: ['/admin/support', '/admin/help-desk'] },
      { id: 'security', label: 'Security & Staff RBAC', href: '/admin/security', icon: ShieldCheck, matchPaths: ['/admin/security'] },
    ],
  },
  {
    id: 'moderation',
    label: 'Moderation Hub',
    items: [
      { id: 'moderation', label: 'Employers, Jobs & Tenants', href: '/admin/moderation', icon: Briefcase, matchPaths: ['/admin/moderation', '/admin/employer-applications', '/admin/jobs-manager', '/admin/company-management', '/admin/tenants'] },
      { id: 'blog', label: 'Blog Engine', href: '/admin/blog', icon: FileText, matchPaths: ['/admin/blog', '/admin/blog-management', '/blog-editor'] },
      { id: 'content', label: 'ATS Phrases & Reviews', href: '/admin/content', icon: Sparkles, matchPaths: ['/admin/content', '/admin/phrases', '/admin/reviews', '/admin/landing-pages', '/admin/trustedby'] },
    ],
  },
  {
    id: 'config',
    label: 'System Configuration',
    items: [
      { id: 'ai-settings', label: 'AI Multi-Provider Engine', href: '/admin/ai-settings', icon: Brain, matchPaths: ['/admin/ai-settings'] },
      { id: 'email', label: 'Email & SMTP Deliverability', href: '/admin/email', icon: Mail, matchPaths: ['/admin/email'] },
      { id: 'settings', label: 'Platform Settings & Modules', href: '/admin/settings', icon: Settings, matchPaths: ['/admin/settings', '/admin/modules'] },
    ],
  },
];

const employerNavGroups: NavGroup[] = [
  {
    id: 'hiring-command',
    label: 'Hiring Command',
    items: [
      { id: 'overview', label: 'Recruiter Overview', href: '/employer', icon: LayoutDashboard, matchPaths: ['/employer', '/employer/overview'] },
    ],
  },
  {
    id: 'requisitions-applicants',
    label: 'Requisitions & Applicants',
    items: [
      { id: 'jobs', label: 'Job Postings', href: '/employer/jobs', icon: Briefcase, matchPaths: ['/employer/jobs'] },
      { id: 'applicants', label: 'Applicant ATS Pipeline', href: '/employer/applicants', icon: Users, matchPaths: ['/employer/applicants', '/employer/pipeline'] },
      { id: 'messages', label: 'Candidate Messages', href: '/employer/messages', icon: MessageSquare, matchPaths: ['/employer/messages'] },
    ],
  },
  {
    id: 'brand-settings',
    label: 'Brand & Settings',
    items: [
      { id: 'company', label: 'Company Profile', href: '/employer/company', icon: Building2, matchPaths: ['/employer/company'] },
      { id: 'team', label: 'Team Seats & Roles', href: '/employer/team', icon: Shield, matchPaths: ['/employer/team'] },
      { id: 'settings', label: 'Hiring Preferences', href: '/employer/settings', icon: Settings, matchPaths: ['/employer/settings'] },
    ],
  },
];

const enterpriseNavGroups: NavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    items: [
      { id: 'overview', label: 'Overview', href: '/org', icon: Activity, matchPaths: ['/org', '/org/overview'] },
    ],
  },
  {
    id: 'organization',
    label: 'Organization',
    items: [
      { id: 'resumes', label: 'Talent & Resumes', href: '/org/resumes', icon: FileText, matchPaths: ['/org/resumes'] },
      { id: 'members', label: 'Users & IAM', href: '/org/members', icon: Users, matchPaths: ['/org/members'] },
      { id: 'teams', label: 'Teams', href: '/org/teams', icon: Users, matchPaths: ['/org/teams'] },
      { id: 'workspaces', label: 'Workspaces', href: '/org/workspaces', icon: Sliders, matchPaths: ['/org/workspaces'] },
    ],
  },
  {
    id: 'governance',
    label: 'Governance',
    items: [
      { id: 'access', label: 'Roles & Permissions', href: '/org/access', icon: Shield, matchPaths: ['/org/access'] },
      { id: 'ai', label: 'AI Workspace', href: '/org/ai', icon: Zap, matchPaths: ['/org/ai'] },
      { id: 'security', label: 'Security & M2M', href: '/org/security', icon: Lock, matchPaths: ['/org/security'] },
      { id: 'usage', label: 'Usage & Quotas', href: '/org/usage', icon: BarChart2, matchPaths: ['/org/usage'] },
      { id: 'email', label: 'Email & Notifications', href: '/org/email', icon: Mail, matchPaths: ['/org/email'] },
      { id: 'audit', label: 'Audit Logs', href: '/org/audit', icon: FileText, matchPaths: ['/org/audit'] },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      { id: 'support', label: 'Support Access', href: '/org/support', icon: HelpCircle, matchPaths: ['/org/support'] },
      { id: 'settings', label: 'Organization Settings', href: '/org/settings', icon: Settings, matchPaths: ['/org/settings'] },
      { id: 'platform', label: 'Platform Administration', href: '/org/platform', icon: Command, matchPaths: ['/org/platform'] },
    ],
  },
];

interface CubaAppShellProps {
  children: ReactNode;
  breadcrumbOverride?: string[];
  atsScore?: number;
  savedStatus?: 'saved' | 'saving' | 'unsaved';
  onPreview?: () => void;
  onDownload?: (format: 'pdf' | 'docx' | 'txt' | 'latex') => void;
}


/** Step segments of the resume builder route (see `BuilderStep` in pages/dashboard/resume-builder.tsx). */
const RESUME_BUILDER_STEPS = new Set([
  'heading', 'experience', 'education', 'skills', 'summary', 'template', 'certifications',
  'achievements', 'projects', 'languages', 'references', 'custom', 'review',
]);

export function CubaAppShell({
  children,
  breadcrumbOverride,
  atsScore,
  savedStatus,
  onPreview,
  onDownload,
}: CubaAppShellProps) {
  const { user, claims, signOut, isAdmin, isSuperAdmin } = useAuth();
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ resumeId?: string }>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Super Admin Role Simulation State
  const [simulatedRole, setSimulatedRole] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('superadmin_role_view');
    }
    return null;
  });

  const handleSelectRoleView = useCallback(async (targetRole: string) => {
    const normalized = targetRole === 'SUPER_ADMIN' ? null : targetRole;
    setSimulatedRole(normalized);
    if (typeof window !== 'undefined') {
      if (normalized) {
        sessionStorage.setItem('superadmin_role_view', normalized);
      } else {
        sessionStorage.removeItem('superadmin_role_view');
        sessionStorage.removeItem('superadmin_enterprise_tenant');
      }
    }

    try {
      const token = await user?.getIdToken?.();
      if (token) {
        await fetch('/api/platform/role-view-audit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ targetRole: targetRole || 'SUPER_ADMIN' }),
        });
      }
    } catch (err) {
      console.warn('[CubaAppShell] role-view-audit failed:', err);
    }

    if (targetRole === 'USER') {
      navigate('/dashboard?superadmin_view=1');
    } else if (targetRole === 'SUPPORT') {
      navigate('/admin/support');
    } else if (targetRole === 'AUDITOR') {
      navigate('/admin/health');
    } else {
      navigate('/admin/dashboard');
    }
  }, [user, navigate]);

  // Live notifications count from backend API
  const { data: notifications = [], isError: notificationsUnavailable } = useNotifications();
  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const isActiveRoute = useCallback(
    (item: NavItem) => {
      const [itemPath, itemQuery] = item.href.split('?');
      if (itemQuery) {
        const currentParams = new URLSearchParams(location.search);
        const targetParams = new URLSearchParams(itemQuery);
        const queryMatches = Array.from(targetParams.entries()).every(
          ([k, v]) => currentParams.get(k)?.toLowerCase() === v.toLowerCase()
        );
        return location.pathname === itemPath && queryMatches;
      }

      if (item.matchPaths) {
        return item.matchPaths.some((p) => {
          const [pPath, pQuery] = p.split('?');
          if (pQuery) {
            const currentParams = new URLSearchParams(location.search);
            const targetParams = new URLSearchParams(pQuery);
            return (
              location.pathname === pPath &&
              Array.from(targetParams.entries()).every(
                ([k, v]) => currentParams.get(k)?.toLowerCase() === v.toLowerCase()
              )
            );
          }
          if (pPath === '/dashboard') {
            return (
              (location.pathname === '/dashboard' || location.pathname === '/dashboard/') &&
              !location.search
            );
          }
          if (pPath === '/dashboard/settings') {
            return location.pathname === '/dashboard/settings' && !location.search;
          }
          if (pPath === '/admin' || pPath === '/admin/dashboard') {
            return (
              location.pathname === '/admin' ||
              location.pathname === '/admin/' ||
              location.pathname === '/admin/dashboard'
            );
          }
          if (pPath === '/employer') {
            return location.pathname === '/employer' || location.pathname === '/employer/' || location.pathname === '/employer/overview';
          }
          if (pPath === '/org') {
            return (
              (location.pathname === '/org' || location.pathname === '/org/') &&
              (!location.search || location.search === '?tab=overview')
            );
          }
          return location.pathname === pPath || location.pathname.startsWith(`${pPath}/`);
        });
      }
      return location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
    },
    [location.pathname, location.search],
  );

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.warn('[CubaAppShell] Sign out error:', err);
    } finally {
      navigate('/login');
    }
  };

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const roleLabel = claims?.role || (isAdmin ? 'Admin' : 'Candidate');
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  // Multi-portal detection based on active pathname
  const activePortal = useMemo<'candidate' | 'admin' | 'employer' | 'enterprise'>(() => {
    if (location.pathname.startsWith('/admin')) return 'admin';
    if (location.pathname.startsWith('/employer')) return 'employer';
    if (location.pathname.startsWith('/org')) return 'enterprise';
    return 'candidate';
  }, [location.pathname]);

  const currentNavGroups = useMemo(() => {
    switch (activePortal) {
      case 'admin':
        return adminNavGroups;
      case 'employer':
        return employerNavGroups;
      case 'enterprise':
        return enterpriseNavGroups;
      default:
        return candidateNavGroups;
    }
  }, [activePortal]);

  const portalLabel = useMemo(() => {
    switch (activePortal) {
      case 'admin':
        return 'Admin Console';
      case 'employer':
        return 'Hiring Portal';
      case 'enterprise':
        return 'Enterprise Console';
      default:
        return 'Candidate Suite';
    }
  }, [activePortal]);

  // Build breadcrumbs based on current route
  const breadcrumbs = useMemo(() => {
    if (breadcrumbOverride) {
      return breadcrumbOverride.map((label, index) => ({
        label,
        href: index === breadcrumbOverride.length - 1 ? null : '#',
        isLast: index === breadcrumbOverride.length - 1,
      }));
    }

    const segments = location.pathname.split('/').filter(Boolean);
    const crumbs = [
      { label: 'Dashboard', href: '/dashboard', isLast: segments.length === 1 && segments[0] === 'dashboard' },
    ];

    if (segments[0] === 'dashboard') {
      if (segments[1] === 'resumes') {
        crumbs.push({ label: 'Resumes & Master CV', href: '/dashboard/resumes', isLast: segments.length <= 2 });
        if (segments[2]) {
          crumbs.push({ label: segments[2], href: '#', isLast: true });
        }
      } else if (segments[1] === 'cover-letters') {
        crumbs.push({ label: 'Cover Letters', href: '/dashboard/cover-letters', isLast: segments.length <= 2 });
        if (segments[2]) {
          crumbs.push({ label: 'Build Cover Letter', href: '#', isLast: true });
        }
      } else if (segments[1] === 'portfolio') {
        crumbs.push({ label: 'Portfolios & Web CV', href: '/dashboard/portfolio', isLast: segments.length <= 2 });
        if (segments[2]) {
          crumbs.push({ label: 'Builder', href: '#', isLast: true });
        }
      } else if (segments[1] === 'interviews' || segments[1] === 'interview') {
        crumbs.push({ label: 'Interview Coach', href: '/dashboard/interviews', isLast: true });
      } else if (segments[1] === 'job-tracker') {
        crumbs.push({ label: 'Job Tracker', href: '/dashboard/job-tracker', isLast: true });
      } else if (segments[1] === 'applied-jobs') {
        crumbs.push({ label: 'Applied Jobs', href: '/dashboard/applied-jobs', isLast: true });
      } else if (segments[1] === 'jobs') {
        crumbs.push({ label: 'Browse Jobs', href: '/dashboard/jobs', isLast: true });
      } else if (segments[1] === 'ats-score' || segments[1] === 'ats') {
        crumbs.push({ label: 'ATS Score Analytics', href: '/dashboard/ats-score', isLast: true });
      } else if (segments[1] === 'favourites' || segments[1] === 'favorites') {
        crumbs.push({ label: 'Saved Favorites', href: '/dashboard/favourites', isLast: true });
      } else if (segments[1] === 'notifications') {
        crumbs.push({ label: 'Notifications', href: '/dashboard/notifications', isLast: true });
      } else if (segments[1] === 'support') {
        crumbs.push({ label: 'Help Desk & Support', href: '/dashboard/support', isLast: true });
      } else if (segments[1] === 'settings') {
        const tab = new URLSearchParams(location.search).get('tab');
        const tabLabel = tab ? `${tab.charAt(0).toUpperCase() + tab.slice(1)} Settings` : 'Settings';
        crumbs.push({ label: tabLabel, href: '/dashboard/settings', isLast: true });
      } else if (segments[1] === 'ai') {
        crumbs.push({ label: 'AI Assistant', href: '/dashboard/ai', isLast: true });
      } else if (segments[1] === 'messages') {
        crumbs.push({ label: 'Messages', href: '/dashboard/messages', isLast: true });
      }
    } else if (segments[0] === 'build-resume') {
      crumbs.push({ label: 'Resumes & Master CV', href: '/dashboard/resumes', isLast: false });
      crumbs.push({ label: 'Build Resume', href: '/build-resume', isLast: false });
      // `/build-resume/:id?/:step?`: a second segment that is not a step name is a saved resume.
      const editingSavedResume = Boolean(segments[1]) && !RESUME_BUILDER_STEPS.has(segments[1]);
      crumbs.push({ label: editingSavedResume ? 'Edit Resume' : 'New Resume', href: '#', isLast: true });
    } else if (segments[0] === 'coverletter' || segments[0] === 'cover-letter') {
      crumbs.push({ label: 'Cover Letters', href: '/dashboard/cover-letters', isLast: false });
      crumbs.push({ label: 'Cover Letter Studio', href: segments[0], isLast: false });
      crumbs.push({ label: 'Editing', href: '#', isLast: true });
    } else if (segments[0] === 'portfolio' && segments[1] === 'builder') {
      crumbs.push({ label: 'Portfolios & Web CV', href: '/dashboard/portfolio', isLast: false });
      crumbs.push({ label: 'Portfolio Builder', href: '#', isLast: true });
    } else if (segments[0] === 'admin') {
      crumbs[0] = { label: 'Admin Console', href: '/admin', isLast: segments.length === 1 };
      if (segments[1]) {
        const titleMap: Record<string, string> = {
          dashboard: 'Command Center',
          health: 'Platform Health',
          queues: 'Queues & Outbox DLQ',
          operations: 'Operations & Maintenance',
          attention: 'Attention Needed',
          users: 'Users Manager & 360',
          support: 'Help Desk & Tickets',
          security: 'Security & Staff RBAC',
          moderation: 'Moderation Hub',
          blog: 'Blog Management',
          content: 'ATS Phrases & Reviews',
          'ai-settings': 'AI Multi-Provider Engine',
          email: 'Email & SMTP Deliverability',
          settings: 'Platform Settings',
        };
        crumbs.push({ label: titleMap[segments[1]] || segments[1], href: `/admin/${segments[1]}`, isLast: true });
      }
    } else if (segments[0] === 'employer') {
      crumbs[0] = { label: 'Employer Portal', href: '/employer', isLast: segments.length === 1 };
      if (segments[1]) {
        const titleMap: Record<string, string> = {
          overview: 'Recruiter Overview',
          jobs: 'Job Postings',
          applicants: 'Applicant ATS Pipeline',
          pipeline: 'ATS Candidate Pipeline',
          messages: 'Candidate Messages',
          company: 'Company Profile',
          team: 'Team Seats & Roles',
          settings: 'Hiring Preferences',
        };
        crumbs.push({ label: titleMap[segments[1]] || segments[1], href: `/employer/${segments[1]}`, isLast: true });
      }
    } else if (segments[0] === 'org') {
      crumbs[0] = { label: 'Enterprise Console', href: '/org', isLast: segments.length === 1 };
      if (segments[1]) {
        crumbs.push({ label: segments[1], href: `/org/${segments[1]}`, isLast: segments.length <= 2 });
        if (segments[2]) {
          crumbs.push({ label: segments[2], href: `/org/${segments[1]}/${segments[2]}`, isLast: true });
        }
      }
    }

    return crumbs;
  }, [location.pathname, location.search, breadcrumbOverride, params.resumeId]);

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
          sidebarCollapsed ? 'w-16' : 'w-[85vw] max-w-[320px] lg:w-64',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        aria-label={`${portalLabel} navigation`}
      >
        {/* Logo area */}
        <div className={cn(
          'flex h-14 items-center border-b border-border px-4',
          sidebarCollapsed ? 'justify-center px-2' : 'gap-3',
        )}>
          {!sidebarCollapsed && (
            <Link
              to={activePortal === 'admin' ? '/admin' : activePortal === 'employer' ? '/employer' : activePortal === 'enterprise' ? '/org' : '/dashboard'}
              className="flex items-center gap-2.5 no-underline min-w-0"
              title="IME365 Home"
            >
              <img
                src="/logo.png"
                alt="IME365"
                className="h-8 md:h-9 w-auto max-w-[170px] object-contain shrink-0 dark:brightness-0 dark:invert transition-opacity"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling;
                  if (fallback) (fallback as HTMLElement).style.display = 'flex';
                }}
              />
              <div className="hidden items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white text-sm shadow-xs">
                  IM
                </div>
                <span className="text-sm font-semibold text-ink tracking-tight">IME365</span>
              </div>
            </Link>
          )}
          {sidebarCollapsed && (
            <Link
              to={activePortal === 'admin' ? '/admin' : activePortal === 'employer' ? '/employer' : activePortal === 'enterprise' ? '/org' : '/dashboard'}
              className="flex size-9 items-center justify-center no-underline overflow-hidden"
              title="IME365 Home"
            >
              <img
                src="/logo.png"
                alt="IME365"
                className="size-8 object-contain object-left shrink-0 dark:brightness-0 dark:invert"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling;
                  if (fallback) (fallback as HTMLElement).style.display = 'flex';
                }}
              />
              <div className="hidden size-8 items-center justify-center rounded-lg bg-brand-600 font-bold text-white text-xs shadow-xs">
                IM
              </div>
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

        {/* Global Workspace / Portal Switcher */}
        {!sidebarCollapsed && (
          <div className="px-3 pt-3 pb-1 border-b border-border/40">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-testid="portal-switcher-trigger"
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold border border-border bg-surface-raised/70 hover:bg-surface-raised hover:border-brand-300 transition-all shadow-2xs cursor-pointer"
                  aria-label="Switch platform workspace"
                >
                  <div className="flex items-center gap-2 truncate">
                    {activePortal === 'admin' && <ShieldCheck className="size-4 text-brand-600 shrink-0" />}
                    {activePortal === 'employer' && <Briefcase className="size-4 text-brand-600 shrink-0" />}
                    {activePortal === 'enterprise' && <Building2 className="size-4 text-brand-600 shrink-0" />}
                    {activePortal === 'candidate' && <User className="size-4 text-brand-600 shrink-0" />}
                    <span className="truncate">{portalLabel}</span>
                  </div>
                  <ChevronDown className="size-3.5 text-ink-muted shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 p-1">
                <div className="px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">
                  Platform Workspaces
                </div>
                <DropdownMenuItem
                  onSelect={() => navigate('/dashboard')}
                  data-testid="switch-to-candidate"
                  className={cn('flex items-center justify-between cursor-pointer py-2', activePortal === 'candidate' && 'font-bold bg-neutral-100 dark:bg-neutral-800')}
                >
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-brand-600" />
                    <span>Candidate Dashboard</span>
                  </div>
                  {activePortal === 'candidate' && <CheckCircle2 className="size-3.5 text-brand-600" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => navigate('/employer')}
                  data-testid="switch-to-employer"
                  className={cn('flex items-center justify-between cursor-pointer py-2', activePortal === 'employer' && 'font-bold bg-neutral-100 dark:bg-neutral-800')}
                >
                  <div className="flex items-center gap-2">
                    <Briefcase className="size-4 text-brand-600" />
                    <span>Recruiter Portal</span>
                  </div>
                  {activePortal === 'employer' && <CheckCircle2 className="size-3.5 text-brand-600" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => navigate('/org')}
                  data-testid="switch-to-enterprise"
                  className={cn('flex items-center justify-between cursor-pointer py-2', activePortal === 'enterprise' && 'font-bold bg-neutral-100 dark:bg-neutral-800')}
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-brand-600" />
                    <span>Enterprise Console</span>
                  </div>
                  {activePortal === 'enterprise' && <CheckCircle2 className="size-3.5 text-brand-600" />}
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem
                    onSelect={() => navigate('/admin')}
                    data-testid="switch-to-admin"
                    className={cn('flex items-center justify-between cursor-pointer py-2', activePortal === 'admin' && 'font-bold bg-neutral-100 dark:bg-neutral-800')}
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-brand-600" />
                      <span>Admin Control Plane</span>
                    </div>
                    {activePortal === 'admin' && <CheckCircle2 className="size-3.5 text-brand-600" />}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Navigation items by Cuba Groups */}
        <nav className="flex-1 overflow-y-auto px-2 pt-3 pb-28 space-y-4" aria-label="Main navigation">
          {currentNavGroups.map((group) => (
            <div key={group.id} className="space-y-1">
              {!sidebarCollapsed && (
                <h2 className="px-3 text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">
                  {group.label}
                </h2>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActiveRoute(item);
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors duration-150',
                          active
                            ? 'bg-brand-50 text-brand-700 font-semibold'
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
                            <span className="truncate">{item.label}</span>
                            {item.id === 'notifications' && unreadNotifCount > 0 && (
                              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                                {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                              </span>
                            )}
                            {item.badge !== undefined && (
                              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border px-2 py-3">
          {isAdmin && activePortal !== 'admin' && (
            <ul className="space-y-0.5 mb-2">
              <li>
                <Link
                  to="/admin"
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors',
                    location.pathname.startsWith('/admin')
                      ? 'bg-brand-50 text-brand-700 font-semibold'
                      : 'text-ink-secondary hover:bg-neutral-100 hover:text-ink',
                    sidebarCollapsed && 'justify-center px-2',
                  )}
                  title={sidebarCollapsed ? 'Admin Console' : undefined}
                >
                  <Building2 className="size-[18px] shrink-0 text-brand-600" />
                  {!sidebarCollapsed && <span>Admin Console</span>}
                </Link>
              </li>
            </ul>
          )}

          {/* User profile footer card */}
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-secondary/40 px-3 py-2',
              sidebarCollapsed && 'justify-center px-2',
            )}
          >
            <Link
              to="/dashboard/settings?tab=profile"
              className="flex items-center gap-3 min-w-0 flex-1 no-underline"
              title="View Profile Settings"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {initials}
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{displayName}</p>
                  <p className="truncate text-xs text-ink-muted">{user?.email}</p>
                </div>
              )}
            </Link>
            {!sidebarCollapsed && (
              <button
                onClick={handleSignOut}
                className="rounded-md p-1 text-ink-muted hover:bg-neutral-100 hover:text-rose-600 transition-colors"
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
        {/* Top bar with Breadcrumbs, Actions, and User Menu */}
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
              <nav className="flex flex-1 items-center gap-1.5 overflow-x-auto min-w-0" aria-label="Breadcrumb">
                <ol className="flex items-center gap-1.5 whitespace-nowrap min-w-0">
                  {breadcrumbs.map((crumb, index) => {
                    const isLast = crumb.isLast || index === breadcrumbs.length - 1;
                    return (
                      <li
                        key={crumb.label}
                        className={cn(
                          'flex items-center gap-1.5 min-w-0',
                          !isLast && 'hidden sm:flex'
                        )}
                      >
                        {index > 0 && (
                          <span className="text-ink-muted hidden sm:inline" aria-hidden="true">/</span>
                        )}
                        {crumb.href ? (
                          <Link
                            to={crumb.href}
                            className={cn(
                              'text-sm font-medium transition-colors truncate',
                              isLast ? 'text-ink font-bold' : 'text-ink-secondary hover:text-brand-600'
                            )}
                            aria-current={isLast ? 'page' : undefined}
                          >
                            {crumb.label}
                          </Link>
                        ) : (
                          <span
                            className={cn(
                              'text-sm font-medium truncate',
                              isLast ? 'text-ink font-bold' : 'text-ink-secondary'
                            )}
                            aria-current={isLast ? 'page' : undefined}
                          >
                            {crumb.label}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </div>

            {/* Right side: ATS Gauge, Saved Status, Actions, Notifications, User Menu */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* ATS Score Circular Gauge - candidate portal only */}
              {activePortal === 'candidate' && atsScore !== undefined && atsScore !== null && (
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

              {/* Saved Status Pill - candidate portal only and when provided */}
              {activePortal === 'candidate' && savedStatus && (
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
              )}

              {/* Preview & Download Actions - candidate portal only and when provided */}
              {activePortal === 'candidate' && (onPreview || onDownload) && (
                <div className="hidden sm:flex items-center gap-1.5">
                  {onPreview && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Eye className="size-3.5" />
                          <span className="hidden sm:inline">Preview</span>
                          <ChevronDown className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onPreview?.(); }} className="flex items-center gap-2 cursor-pointer">
                          <Eye className="size-4" />
                          <span>Preview Resume</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!params.resumeId}
                          onSelect={(e) => {
                            e.preventDefault();
                            if (!params.resumeId) return;
                            // Cv1 is only the initial paint hint; the export page
                            // re-derives the persisted template from the resume
                            // payload before rendering the document.
                            window.open(`/export/Cv1/${encodeURIComponent(params.resumeId)}/en`, '_blank', 'noopener,noreferrer');
                          }}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <LayoutDashboard className="size-4" />
                          <span>Full Template Preview</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!params.resumeId}
                          onSelect={(e) => {
                            e.preventDefault();
                            if (!params.resumeId) return;
                            // Sharing is an explicit publish action owned by the
                            // Share dialog; this never opens an unpublished URL.
                            navigate(`/dashboard/resumes?share=${encodeURIComponent(params.resumeId)}`);
                          }}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <MessageSquare className="size-4" />
                          <span>Share resume…</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {onDownload && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="primary" size="sm" className="gap-1.5">
                          <Download className="size-3.5" />
                          <span className="hidden sm:inline">Download</span>
                          <ChevronDown className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onDownload?.('pdf'); }} className="flex items-center gap-2 cursor-pointer">
                          <FileText className="size-4" />
                          <span>Download as PDF</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onDownload?.('docx'); }} className="flex items-center gap-2 cursor-pointer">
                          <FileText className="size-4" />
                          <span>Download as DOCX</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onDownload?.('txt'); }} className="flex items-center gap-2 cursor-pointer">
                          <FileText className="size-4" />
                          <span>Download as Plain Text</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onDownload?.('latex'); }} className="flex items-center gap-2 cursor-pointer">
                          <Code2 className="size-4" />
                          <span>Download as LaTeX</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )}

              {/* Super Admin Role Simulation Switcher */}
              {(isSuperAdmin || isAdmin) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      data-testid="role-simulation-trigger"
                      className={cn(
                        'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                        simulatedRole
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 animate-pulse'
                          : 'text-ink-secondary hover:text-ink hover:bg-neutral-100 dark:hover:bg-neutral-800 border-border'
                      )}
                      title="Simulate Role View (Super Admin)"
                    >
                      <Crown className="size-3.5 text-amber-500 shrink-0" />
                      <span className="hidden md:inline">
                        {simulatedRole ? `Viewing as: ${simulatedRole}` : 'View As Role'}
                      </span>
                      <ChevronDown className="size-3 text-ink-muted shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 p-1">
                    <div className="px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">
                      Simulate Role View
                    </div>
                    {[
                      { id: 'SUPER_ADMIN', label: 'Super Admin (Default)', desc: 'Unrestricted root control' },
                      { id: 'ADMIN', label: 'Admin', desc: 'Standard platform manager' },
                      { id: 'SUPPORT', label: 'Support Agent', desc: 'Read users, logs, tickets' },
                      { id: 'AUDITOR', label: 'Auditor', desc: 'Read-only compliance audit' },
                      { id: 'USER', label: 'End User / Candidate', desc: 'Candidate portal experience' },
                    ].map((opt) => (
                      <DropdownMenuItem
                        key={opt.id}
                        onSelect={() => handleSelectRoleView(opt.id)}
                        className={cn(
                          'flex items-center justify-between cursor-pointer py-2 text-xs',
                          (simulatedRole === opt.id || (!simulatedRole && opt.id === 'SUPER_ADMIN')) && 'font-bold bg-neutral-100 dark:bg-neutral-800'
                        )}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-ink">{opt.label}</span>
                          <span className="text-[10px] text-ink-muted">{opt.desc}</span>
                        </div>
                        {(simulatedRole === opt.id || (!simulatedRole && opt.id === 'SUPER_ADMIN')) && (
                          <Check className="size-3.5 text-brand-600 shrink-0" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Interactive Notifications Popover */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="relative rounded-md p-1.5 text-ink-muted hover:bg-neutral-100 hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    aria-label={unreadNotifCount > 0 ? `${unreadNotifCount} unread notifications` : 'Notifications'}
                    title="Notifications"
                  >
                    <Bell className="size-5" />
                    {unreadNotifCount > 0 && (
                      <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white shadow-xs">
                        {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 p-2">
                  <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-ink">Notifications</span>
                      {unreadNotifCount > 0 && (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">
                          {unreadNotifCount} new
                        </span>
                      )}
                    </div>
                    <Link
                      to="/dashboard/notifications"
                      className="text-xs font-medium text-brand-600 hover:text-brand-700 no-underline"
                    >
                      View all
                    </Link>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {notifications.length === 0 ? (
                      <div className="py-6 text-center text-xs text-ink-muted">
                        {notificationsUnavailable
                          ? 'Notifications couldn’t be loaded. Open the Notification Center to try again.'
                          : 'No notifications at this time.'}
                      </div>
                    ) : (
                      notifications.slice(0, 4).map((notif) => (
                        <DropdownMenuItem
                          key={notif.id}
                          onSelect={() => navigate('/dashboard/notifications')}
                          className="flex flex-col items-start gap-1 p-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 w-full">
                            {!notif.read && (
                              <span className="size-1.5 rounded-full bg-brand-600 shrink-0" aria-hidden="true" />
                            )}
                            <span className={cn('text-xs truncate font-medium', !notif.read ? 'text-ink font-semibold' : 'text-ink-secondary')}>
                              {!notif.read && <span className="sr-only">Unread: </span>}
                              {notif.title}
                            </span>
                          </div>
                          {notif.message && (
                            <p className="text-[11px] text-ink-muted line-clamp-1 pl-3">
                              {notif.message}
                            </p>
                          )}
                        </DropdownMenuItem>
                      ))
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => navigate('/dashboard/notifications')}
                    className="justify-center text-xs font-semibold text-brand-600 cursor-pointer"
                  >
                    Open Notification Center
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Daily AI Quota Meter */}
              <div className="flex items-center">
                <AiQuotaBadge />
              </div>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="hidden sm:flex rounded-md p-1.5 text-ink-muted hover:bg-neutral-100 hover:text-ink transition-colors"
                aria-label="Toggle theme"
                title={`Current theme: ${theme}. Click to switch.`}
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="size-5 text-warning-500" />
                ) : (
                  <Moon className="size-5" />
                )}
              </button>

              {/* Executive M3 User Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Account menu for ${displayName}`}
                    className="flex items-center gap-2 rounded-full py-0.5 pl-1 pr-1.5 hover:bg-neutral-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <div className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-indigo-600 font-bold text-white text-xs shadow-xs">
                      {initials}
                      <span
                        className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface bg-emerald-500"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="hidden sm:flex flex-col items-start text-left leading-tight">
                      <span className="max-w-[120px] truncate text-xs font-semibold text-ink">
                        {displayName}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600">
                        {roleLabel}
                      </span>
                    </div>
                    <ChevronDown className="hidden sm:block size-3.5 text-ink-muted" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 p-1.5">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-indigo-600 font-bold text-white text-sm">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
                      <p className="truncate text-xs text-ink-muted">{user?.email}</p>
                      <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-700">
                        {roleLabel}
                      </span>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => navigate('/dashboard/settings?tab=profile')}
                    className="gap-2.5 py-2 cursor-pointer"
                  >
                    <User className="size-4 text-ink-muted" />
                    <span>Your Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => navigate('/dashboard/settings?tab=account')}
                    className="gap-2.5 py-2 cursor-pointer"
                  >
                    <Settings className="size-4 text-ink-muted" />
                    <span>Account Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => navigate('/dashboard/settings?tab=security')}
                    className="gap-2.5 py-2 cursor-pointer"
                  >
                    <Shield className="size-4 text-ink-muted" />
                    <span>Security & 2FA Hub</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => navigate('/dashboard/support')}
                    className="gap-2.5 py-2 cursor-pointer"
                  >
                    <HelpCircle className="size-4 text-ink-muted" />
                    <span>Help Desk & Support</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">
                    Switch Workspace
                  </div>
                  <DropdownMenuItem
                    onSelect={() => navigate('/dashboard')}
                    className="gap-2.5 py-1.5 cursor-pointer text-xs"
                  >
                    <User className="size-4 text-brand-600" />
                    <span>Candidate Dashboard</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => navigate('/employer')}
                    className="gap-2.5 py-1.5 cursor-pointer text-xs"
                  >
                    <Briefcase className="size-4 text-brand-600" />
                    <span>Recruiter Portal</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => navigate('/org')}
                    className="gap-2.5 py-1.5 cursor-pointer text-xs"
                  >
                    <Building2 className="size-4 text-brand-600" />
                    <span>Enterprise Console</span>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem
                      onSelect={() => navigate('/admin')}
                      className="gap-2.5 py-1.5 cursor-pointer text-xs"
                    >
                      <ShieldCheck className="size-4 text-brand-600" />
                      <span>Admin Control Plane</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={toggleTheme}
                    className="gap-2.5 py-2 cursor-pointer"
                  >
                    {resolvedTheme === 'dark' ? (
                      <Sun className="size-4 text-warning-500" />
                    ) : (
                      <Moon className="size-4 text-ink-muted" />
                    )}
                    <span>{resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={handleSignOut}
                    className="gap-2.5 py-2 font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                  >
                    <LogOut className="size-4" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
