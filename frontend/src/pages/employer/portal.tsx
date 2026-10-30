import { useAuth } from '@/providers/auth-provider';
import { get, post, patch } from '@/lib/api-client';
/**
 * Employer Portal — Surface 3 Modernization
 *
 * Full-featured Recruitment & Talent Acquisition Hub:
 * - Real-time pipeline metrics (Active Jobs, Candidates, In-Interview, Hired)
 * - Full 53KB CreateJobModal with custom screening questions, perks pills, and salary bands
 * - Real candidate pipeline scoped to requisitions via GET /api/jobs/:jobId/applications
 * - Interactive Kanban & List views with optimistic concurrency status transitions
 * - Slide-out CandidateReviewDrawer with live resume preview and ATS score breakdown
 * - CompanyProfile branding and TeamSeats RBAC permissions matrix
 * - ZERO phantom hooks, ZERO fake mock profiles
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  Calendar,
  Users,
  UserCheck,
  TrendingUp,
  Plus,
  Search,
  Clock,
  ChevronRight,
  MapPin,
  DollarSign,
  Building2,
  LayoutGrid,
  List,
  AlertCircle,
  PauseCircle,
  PlayCircle,
  Shield,
  Layers,
  MessageSquare,
  Send,
  Settings,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  useJobs,
  useJobApplications,
  useUpdateJob,
  type JobListing,
  type JobApplication,
} from '@/hooks/use-api-hooks';
import { CreateJobModal } from '@/components/employer/CreateJobModal';
import { CandidateReviewDrawer } from '@/components/employer/CandidateReviewDrawer';
import { InterviewSlotManager } from '@/components/employer/InterviewSlotManager';
import { CompanyProfile } from '@/components/employer/CompanyProfile';
import { TeamSeats } from '@/components/employer/TeamSeats';

const EMPLOYER_SETTINGS_PATH = '/employer/settings';
const SUPPORTED_INTERVIEW_DURATIONS = [15, 30, 45, 60] as const;
const AUTO_ARCHIVE_MAX_DAYS = 3650;
const COMMON_TIMEZONES = [
  'UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
  'Europe/London', 'Europe/Dublin', 'Europe/Berlin', 'Europe/Paris', 'Europe/Madrid',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Australia/Sydney', 'Africa/Johannesburg',
];

type EmployerSettings = {
  companyName: string;
  timezone: string;
  notificationEmail: string | null;
  defaultInterviewDuration: number;
  autoArchiveDays: number;
  updatedAt: string | null;
};

/** Form state is all strings so partial typing never fights the input element. */
type EmployerSettingsForm = {
  companyName: string;
  timezone: string;
  notificationEmail: string;
  defaultInterviewDuration: string;
  autoArchiveDays: string;
};

const EMPTY_SETTINGS_FORM: EmployerSettingsForm = {
  companyName: '',
  timezone: 'UTC',
  notificationEmail: '',
  defaultInterviewDuration: '30',
  autoArchiveDays: '30',
};

function settingsToForm(settings: EmployerSettings): EmployerSettingsForm {
  return {
    companyName: settings.companyName ?? '',
    timezone: settings.timezone || 'UTC',
    notificationEmail: settings.notificationEmail ?? '',
    defaultInterviewDuration: String(settings.defaultInterviewDuration ?? 30),
    autoArchiveDays: String(settings.autoArchiveDays ?? 30),
  };
}

function isValidIanaTimezone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

/** Field-level validation; mirrors the server contract without replacing it. */
function validateSettingsForm(form: EmployerSettingsForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const companyName = form.companyName.trim();
  if (companyName.length < 2 || companyName.length > 160) errors.companyName = 'Company name must be between 2 and 160 characters.';
  if (!isValidIanaTimezone(form.timezone)) errors.timezone = 'Enter a valid IANA timezone, for example Asia/Kolkata.';
  const email = form.notificationEmail.trim();
  if (email && !/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,189}\.[A-Za-z]{2,}$/.test(email)) errors.notificationEmail = 'Enter a valid email address, or leave it blank.';
  if (!SUPPORTED_INTERVIEW_DURATIONS.includes(Number(form.defaultInterviewDuration) as 15 | 30 | 45 | 60)) errors.defaultInterviewDuration = 'Choose 15, 30, 45 or 60 minutes.';
  const archiveDays = Number(form.autoArchiveDays);
  if (!Number.isInteger(archiveDays) || archiveDays < 0 || archiveDays > AUTO_ARCHIVE_MAX_DAYS) errors.autoArchiveDays = `Choose a whole number of days from 0 to ${AUTO_ARCHIVE_MAX_DAYS}.`;
  return errors;
}

/** Only fields that actually differ are sent, so a save can never reset the rest. */
function settingsPatchFrom(baseline: EmployerSettingsForm, form: EmployerSettingsForm): Record<string, unknown> {
  const patchBody: Record<string, unknown> = {};
  if (form.companyName.trim() !== baseline.companyName.trim()) patchBody.companyName = form.companyName.trim();
  if (form.timezone.trim() !== baseline.timezone.trim()) patchBody.timezone = form.timezone.trim();
  if (form.notificationEmail.trim() !== baseline.notificationEmail.trim()) {
    const email = form.notificationEmail.trim();
    patchBody.notificationEmail = email === '' ? null : email.toLowerCase();
  }
  if (form.defaultInterviewDuration !== baseline.defaultInterviewDuration) patchBody.defaultInterviewDuration = Number(form.defaultInterviewDuration);
  if (form.autoArchiveDays !== baseline.autoArchiveDays) patchBody.autoArchiveDays = Number(form.autoArchiveDays);
  return patchBody;
}

export type EmployerTabId =
  | 'overview'
  | 'jobs'
  | 'pipeline'
  | 'messages'
  | 'company'
  | 'team'
  | 'settings';

const KANBAN_STAGES = [
  { key: 'pending', label: 'Applied / Review', badgeTone: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30' },
  { key: 'interview', label: 'In Interview', badgeTone: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30' },
  { key: 'accepted', label: 'Offer Extended', badgeTone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
  { key: 'rejected', label: 'Archived / Rejected', badgeTone: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30' },
] as const;

export function EmployerPortalPage() {
  const { isSuperAdmin, user } = useAuth();

  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: jobs = [], isLoading: jobsLoading, error: jobsError, refetch: refetchJobs } = useJobs();
  const updateJobMutation = useUpdateJob();

  // URL resolution for active tab: checks pathname (/employer/:tab) or ?tab=
  const resolveTab = useCallback((): EmployerTabId => {
    const tabFromQuery = searchParams.get('tab') as EmployerTabId;
    if (tabFromQuery && ['overview', 'jobs', 'pipeline', 'messages', 'company', 'team', 'settings'].includes(tabFromQuery)) {
      return tabFromQuery;
    }

    const segments = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (segments[0] === 'employer' && segments[1]) {
      const section = segments[1].toLowerCase();
      if (section === 'applicants') return 'pipeline';
      if (['overview', 'jobs', 'pipeline', 'messages', 'company', 'team', 'settings'].includes(section as EmployerTabId)) {
        return section as EmployerTabId;
      }
    }

    return 'overview';
  }, [location.pathname, searchParams]);

  const [activeTab, setActiveTab] = useState<EmployerTabId>(resolveTab);

  useEffect(() => {
    const nextTab = resolveTab();
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [resolveTab, activeTab]);

  const handleSelectTab = (tabId: EmployerTabId) => {
    setActiveTab(tabId);
    navigate(tabId === 'overview' ? '/employer' : `/employer/${tabId}`);
  };

  const [pipelineViewMode, setPipelineViewMode] = useState<'kanban' | 'list'>('kanban');

  // Selected Requisition for applicant pipeline
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Set default selected job
  useEffect(() => {
    if (jobs.length > 0 && !selectedJobId) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs, selectedJobId]);

  // Selected job entity
  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) || jobs[0] || null,
    [jobs, selectedJobId]
  );

  // Query real applications for the selected job
  const {
    data: applications = [],
    isLoading: applicationsLoading,
    refetch: refetchApplications,
  } = useJobApplications(selectedJob?.id || null);

  // Modals & Drawers
  const [showCreateJobModal, setShowCreateJobModal] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<JobApplication | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pipelineSort, setPipelineSort] = useState<'match' | 'date' | 'name'>('match');

  // Messages are server-authoritative. A conversation is never synthesized from a candidate list.
  type EmployerConversation = {
    id: string;
    applicationId: string | null;
    participants: Record<string, boolean>;
    lastMessage: { id: string; senderId: string; text: string; timestamp: number | string } | null;
    unreadCount: number;
    candidateName: string;
    role: string;
  };
  type ConversationMessage = { id: string; senderId: string; text: string; timestamp: number | string };
  const [conversations, setConversations] = useState<EmployerConversation[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ConversationMessage[]>>({});
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [newMessageText, setNewMessageText] = useState('');
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState('');
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [readError, setReadError] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const activeConversationIdRef = useRef<string | null>(null);
  activeConversationIdRef.current = activeConversationId;

  // ─── Hiring preferences (GET/PATCH /api/employer/settings) ───────────────
  // `settingsBaseline` is the last state the SERVER confirmed. The form is only
  // ever populated from it, "unsaved" is derived by comparison, and a save is
  // reported as successful only after the response contains the persisted row.
  const [settingsForm, setSettingsForm] = useState<EmployerSettingsForm>(EMPTY_SETTINGS_FORM);
  const [settingsBaseline, setSettingsBaseline] = useState<EmployerSettingsForm>(EMPTY_SETTINGS_FORM);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsValidation, setSettingsValidation] = useState<Record<string, string>>({});
  const [settingsNotice, setSettingsNotice] = useState('');
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const [showInterviewSlotManager, setShowInterviewSlotManager] = useState(false);

  const loadConversations = useCallback(async () => {
    setConversationsLoading(true);
    setConversationsError('');
    try {
      const response = await get<{ success: boolean; conversations: Array<Omit<EmployerConversation, 'candidateName' | 'role'>> }>('/messages/conversations');
      const rows = await Promise.all((response.conversations || []).map(async (conversation) => {
        const otherParticipantId = Object.keys(conversation.participants || {}).find((id) => id !== user?.uid);
        let candidateName = 'Candidate';
        if (otherParticipantId) {
          try {
            const profile = await get<{ profile?: { name?: string } }>(`/messages/conversations/${encodeURIComponent(conversation.id)}/participant-profile`);
            candidateName = profile.profile?.name?.trim() || candidateName;
          } catch { /* Show an honest generic label when the profile endpoint fails. */ }
        }
        const application = applications.find((item) => String(item.id) === String(conversation.applicationId));
        const job = jobs.find((item) => String(item.id) === String(application?.jobId));
        return { ...conversation, candidateName, role: job?.title || 'Role unavailable' };
      }));
      setConversations(rows);
    } catch (error) {
      setConversationsError(error instanceof Error ? error.message : 'Conversations could not be loaded.');
    } finally {
      setConversationsLoading(false);
    }
  }, [applications, jobs, user?.uid]);

  useEffect(() => {
    if (activeTab === 'messages') void loadConversations();
  }, [activeTab, loadConversations]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    setMessagesError('');
    const selectedId = conversationId;
    try {
      const response = await get<{ success: boolean; messages: ConversationMessage[] }>(`/messages/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`);
      if (selectedId !== activeConversationIdRef.current) return;
      const messages = (response.messages || []).slice().sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
      setMessagesByConversation((previous) => ({ ...previous, [conversationId]: messages }));
      const thread = conversations.find((item) => item.id === conversationId);
      const newest = messages[messages.length - 1];
      if (thread && thread.unreadCount > 0 && newest) {
        setReadError('');
        try {
          await post(`/messages/conversations/${encodeURIComponent(conversationId)}/read`, { lastReadMessageId: newest.id });
          setConversations((previous) => previous.map((item) => item.id === conversationId ? { ...item, unreadCount: 0 } : item));
        } catch (error) {
          if (selectedId === activeConversationIdRef.current) setReadError(error instanceof Error ? error.message : 'Read state could not be synchronized.');
        }
      }
    } catch (error) {
      if (selectedId === activeConversationIdRef.current) {
        setMessagesError(error instanceof Error ? error.message : 'Messages could not be loaded.');
      }
    } finally {
      if (selectedId === activeConversationIdRef.current) setMessagesLoading(false);
    }
  }, [conversations, user?.uid]);

  useEffect(() => {
    if (activeConversationId) void loadMessages(activeConversationId);
  }, [activeConversationId, loadMessages]);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = newMessageText.trim();
    if (!activeConversationId || !text || messageSending) return;
    setMessageSending(true);
    setMessagesError('');
    try {
      const response = await post<{ success: boolean; messageId: string }>('/messages/send', { conversationId: activeConversationId, text });
      if (!response?.success || !response.messageId) throw new Error('The server did not confirm the message.');
      setNewMessageText('');
      // Re-read the authoritative message history for the server ID and timestamp.
      const history = await get<{ messages: ConversationMessage[] }>(`/messages/conversations/${encodeURIComponent(activeConversationId)}/messages?limit=100`);
      const ordered = (history.messages || []).slice().sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
      setMessagesByConversation((previous) => ({ ...previous, [activeConversationId]: ordered }));
      await loadConversations();
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : 'Message could not be sent. Please retry.');
    } finally {
      setMessageSending(false);
    }
  };

  const loadEmployerSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsLoadFailed(false);
    setSettingsError('');
    try {
      const response = await get<{ success: boolean; settings: EmployerSettings }>(EMPLOYER_SETTINGS_PATH);
      if (!response?.success || !response.settings) throw new Error('The server did not return stored preferences.');
      const next = settingsToForm(response.settings);
      setSettingsForm(next);
      setSettingsBaseline(next);
      setSettingsValidation({});
    } catch (error) {
      setSettingsLoadFailed(true);
      setSettingsError(error instanceof Error ? error.message : 'Preferences could not be loaded.');
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'settings') void loadEmployerSettings();
  }, [activeTab, loadEmployerSettings]);

  const settingsDirty = useMemo(
    () => (Object.keys(settingsForm) as Array<keyof EmployerSettingsForm>)
      .some((field) => settingsForm[field] !== settingsBaseline[field]),
    [settingsForm, settingsBaseline],
  );

  const updateSettingsField = (field: keyof EmployerSettingsForm, value: string) => {
    setSettingsForm((previous) => ({ ...previous, [field]: value }));
    setSettingsValidation((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
    setSettingsNotice('');
  };

  const handleSaveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (settingsSaving || settingsLoading) return;
    setSettingsNotice('');
    setSettingsError('');
    const validation = validateSettingsForm(settingsForm);
    setSettingsValidation(validation);
    if (Object.keys(validation).length > 0) {
      setSettingsError('Fix the highlighted preferences before saving. Nothing was saved.');
      return;
    }
    const patchBody = settingsPatchFrom(settingsBaseline, settingsForm);
    if (Object.keys(patchBody).length === 0) {
      setSettingsNotice('No preference changes to save.');
      return;
    }
    setSettingsSaving(true);
    try {
      const response = await patch<{ success: boolean; settings: EmployerSettings; updated: string[] }>(EMPLOYER_SETTINGS_PATH, patchBody);
      // Success is claimed ONLY from the persisted row the server returned.
      if (!response?.success || !response.settings) throw new Error('The server did not confirm the saved preferences.');
      const persisted = settingsToForm(response.settings);
      setSettingsForm(persisted);
      setSettingsBaseline(persisted);
      setSettingsNotice('Preferences saved.');
    } catch (error) {
      // The form is deliberately left untouched so the user's input is not lost.
      setSettingsError(error instanceof Error ? error.message : 'Preferences could not be saved. Your changes are still here — retry.');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Filter and sort applications by search and ATS score
  const filteredApplications = useMemo(() => {
    let list = applications;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = applications.filter(
        (app) =>
          app.applicantName.toLowerCase().includes(q) ||
          app.applicantEmail.toLowerCase().includes(q) ||
          (app.coverLetter && app.coverLetter.toLowerCase().includes(q))
      );
    }
    return list.slice().sort((a, b) => {
      if (pipelineSort === 'match') {
        const scoreA = a.matchScore ?? -1;
        const scoreB = b.matchScore ?? -1;
        if (scoreB !== scoreA) return scoreB - scoreA;
      } else if (pipelineSort === 'name') {
        return (a.applicantName || '').localeCompare(b.applicantName || '');
      }
      const dateA = a.appliedAt ? new Date(a.appliedAt).getTime() : 0;
      const dateB = b.appliedAt ? new Date(b.appliedAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [applications, searchQuery, pipelineSort]);

  const getMatchScoreBadge = (score: number | null | undefined) => {
    if (score == null) {
      return (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-500/15 text-neutral-700 dark:text-neutral-400 border border-neutral-500/30">
          Evaluating
        </span>
      );
    }
    const color =
      score >= 75
        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
        : score >= 50
        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
        : 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30';
    return (
      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', color)}>
        {score}%
      </span>
    );
  };

  // Summary Metrics
  const totalApplicants = useMemo(() => {
    return jobs.reduce((sum, j) => sum + (j.applicantCount || 0), 0);
  }, [jobs]);

  const inInterviewCount = useMemo(() => {
    return applications.filter((a) => a.status === 'interview').length;
  }, [applications]);

  const offersExtendedCount = useMemo(() => {
    return applications.filter((a) => a.status === 'accepted').length;
  }, [applications]);

  // Job pause / resume toggle with optimistic locking
  const handleToggleJobStatus = async (job: JobListing) => {
    const nextStatus = job.status === 'active' ? 'paused' : 'active';
    try {
      await updateJobMutation.mutateAsync({
        id: job.id,
        expectedRevision: job.revision || 0,
        status: nextStatus,
      });
      refetchJobs();
    } catch (err: any) {
      console.error('Failed to toggle job status:', err);
    }
  };


  return (
    <div data-testid="employer-portal" className="space-y-6 max-w-7xl mx-auto pb-16">
      {isSuperAdmin && new URLSearchParams(window.location.search).get('adminView') === '1' && <aside className="rounded-xl border border-brand-300 bg-brand-50 p-4 text-brand-900" aria-label="Super Admin viewing context"><strong>Super Admin Mode — Viewing Employer Workspace</strong><p className="text-xs">Same authenticated identity. No user impersonation or additional privileges.</p><a className="underline mr-4" href="/admin">Switch Workspace</a><a className="underline" href="/admin">Return to Admin Console</a></aside>}
      {/* ─── Breadcrumb Path ─── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-ink-muted">
        <span>Dashboard</span>
        <ChevronRight className="size-3 text-ink-muted" />
        <span className="font-semibold text-ink">Employer Portal</span>
        {activeTab !== 'overview' && (
          <>
            <ChevronRight className="size-3 text-ink-muted" />
            <span className="text-accent capitalize">{activeTab}</span>
          </>
        )}
      </nav>

      {/* ─── Top Header & Primary CTAs ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-edge pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
            <Briefcase className="size-6 text-accent" />
            Employer & Recruitment Hub
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            Requisition pipeline, candidate review drawer, and talent acquisition management.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            onClick={() => setShowCreateJobModal(true)}
            className="text-xs font-semibold gap-1.5 bg-accent hover:bg-accent/90"
          >
            <Plus className="size-3.5" />
            Post New Job Requisition
          </Button>
        </div>
      </div>

      {/* ─── Error State ─── */}
      {jobsError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-600/30 bg-red-100 dark:bg-red-950/40 p-4 text-xs font-semibold text-red-900 dark:text-red-100" role="alert">
          <AlertCircle className="size-4 shrink-0 text-red-900 dark:text-red-100" />
          <span>Failed to load employer requisitions. Please check network connectivity or refresh.</span>
        </div>
      )}

      {/* ─── Navigation Tabs Strip ─── */}
      <div className="flex items-center gap-2 sm:gap-4 border-b border-edge overflow-x-auto pb-1 scrollbar-none scroll-smooth">
        <button
          type="button"
          onClick={() => handleSelectTab('overview')}
          className={cn(
            'pb-2.5 px-1 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer',
            activeTab === 'overview'
              ? 'border-accent text-accent font-bold'
              : 'border-transparent text-ink-muted hover:text-ink'
          )}
        >
          <TrendingUp className="size-3.5" />
          Recruiter Overview
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('jobs')}
          className={cn(
            'pb-2.5 px-1 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer',
            activeTab === 'jobs'
              ? 'border-accent text-accent font-bold'
              : 'border-transparent text-ink-muted hover:text-ink'
          )}
        >
          <Briefcase className="size-3.5" />
          Job Requisitions ({jobs.length})
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('pipeline')}
          className={cn(
            'pb-2.5 px-1 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer',
            activeTab === 'pipeline'
              ? 'border-accent text-accent font-bold'
              : 'border-transparent text-ink-muted hover:text-ink'
          )}
        >
          <Layers className="size-3.5" />
          ATS Candidate Pipeline
          {applications.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-accent/15 text-accent font-bold">
              {applications.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('messages')}
          className={cn(
            'pb-2.5 px-1 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer',
            activeTab === 'messages'
              ? 'border-accent text-accent font-bold'
              : 'border-transparent text-ink-muted hover:text-ink'
          )}
        >
          <MessageSquare className="size-3.5" />
          Candidate Messages
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-brand-50 text-brand-700 font-bold">
            Live
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('company')}
          className={cn(
            'pb-2.5 px-1 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer',
            activeTab === 'company'
              ? 'border-accent text-accent font-bold'
              : 'border-transparent text-ink-muted hover:text-ink'
          )}
        >
          <Building2 className="size-3.5" />
          Company Profile
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('team')}
          className={cn(
            'pb-2.5 px-1 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer',
            activeTab === 'team'
              ? 'border-accent text-accent font-bold'
              : 'border-transparent text-ink-muted hover:text-ink'
          )}
        >
          <Shield className="size-3.5" />
          Team Seats & Roles
        </button>

        <button
          type="button"
          onClick={() => handleSelectTab('settings')}
          className={cn(
            'pb-2.5 px-1 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer',
            activeTab === 'settings'
              ? 'border-accent text-accent font-bold'
              : 'border-transparent text-ink-muted hover:text-ink'
          )}
        >
          <Settings className="size-3.5" />
          Hiring Preferences
        </button>
      </div>

      {/* ─── TAB 0: Recruiter Overview ─── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* High-Level Pipeline Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            <Card className="border-edge shadow-xs bg-surface">
              <CardContent className="p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3.5">
                <div className="size-8 sm:size-10 rounded-lg sm:rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
                  <Briefcase className="size-4 sm:size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] font-semibold text-ink-muted uppercase tracking-wider truncate" title="Active Requisitions">Active Jobs</p>
                  <p className="text-lg sm:text-xl font-extrabold text-ink">{jobsLoading ? '—' : jobs.length}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-edge shadow-xs bg-surface">
              <CardContent className="p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3.5">
                <div className="size-8 sm:size-10 rounded-lg sm:rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Users className="size-4 sm:size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] font-semibold text-ink-muted uppercase tracking-wider truncate">Total Applicants</p>
                  <p className="text-lg sm:text-xl font-extrabold text-ink">{jobsLoading ? '—' : totalApplicants}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-edge shadow-xs bg-surface">
              <CardContent className="p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3.5">
                <div className="size-8 sm:size-10 rounded-lg sm:rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Clock className="size-4 sm:size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] font-semibold text-ink-muted uppercase tracking-wider truncate">In Interview Loops</p>
                  <p className="text-lg sm:text-xl font-extrabold text-ink">{jobsLoading ? '—' : inInterviewCount}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-edge shadow-xs bg-surface">
              <CardContent className="p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3.5">
                <div className="size-8 sm:size-10 rounded-lg sm:rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <UserCheck className="size-4 sm:size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] font-semibold text-ink-muted uppercase tracking-wider truncate">Offers Extended</p>
                  <p className="text-lg sm:text-xl font-extrabold text-ink">{jobsLoading ? '—' : offersExtendedCount}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Hiring Command Quick Launch Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => setShowCreateJobModal(true)}
              className="p-4 rounded-2xl border border-edge bg-surface hover:bg-surface-raised hover:border-accent/40 text-left transition-all shadow-2xs group cursor-pointer"
            >
              <div className="size-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Plus className="size-4" />
              </div>
              <h3 className="text-xs font-bold text-ink">Post Requisition</h3>
              <p className="text-[11px] text-ink-muted mt-0.5">Publish a new engineering, design, or leadership role.</p>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('pipeline')}
              className="p-4 rounded-2xl border border-edge bg-surface hover:bg-surface-raised hover:border-accent/40 text-left transition-all shadow-2xs group cursor-pointer"
            >
              <div className="size-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Layers className="size-4" />
              </div>
              <h3 className="text-xs font-bold text-ink">Review Pipeline</h3>
              <p className="text-[11px] text-ink-muted mt-0.5">Kanban review & ATS scores for applicants.</p>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('messages')}
              className="p-4 rounded-2xl border border-edge bg-surface hover:bg-surface-raised hover:border-accent/40 text-left transition-all shadow-2xs group cursor-pointer"
            >
              <div className="size-9 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <MessageSquare className="size-4" />
              </div>
              <h3 className="text-xs font-bold text-ink">Candidate Messages</h3>
              <p className="text-[11px] text-ink-muted mt-0.5">Direct candidate correspondence & interview prep.</p>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('company')}
              className="p-4 rounded-2xl border border-edge bg-surface hover:bg-surface-raised hover:border-accent/40 text-left transition-all shadow-2xs group cursor-pointer"
            >
              <div className="size-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Building2 className="size-4" />
              </div>
              <h3 className="text-xs font-bold text-ink">Company Profile</h3>
              <p className="text-[11px] text-ink-muted mt-0.5">Manage employer branding, culture tags, and logos.</p>
            </button>
          </div>

          {/* Active Requisitions Snapshot Table */}
          <Card className="border-edge shadow-xs bg-surface">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-bold text-ink">Active Job Requisitions</CardTitle>
                <CardDescription className="text-xs text-ink-muted">
                  Open roles collecting applicants with live ATS match filtering.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSelectTab('jobs')}
                className="text-xs h-8"
              >
                View All ({jobs.length})
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {jobsLoading ? (
                <div className="space-y-2 py-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 rounded-lg bg-canvas-soft animate-pulse" />
                  ))}
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-8 text-xs text-ink-muted">
                  No active requisitions found. Click "Post Requisition" to create your first open role.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-edge text-ink-muted uppercase font-bold text-[10px]">
                        <th className="py-2.5 px-3">Role Title</th>
                        <th className="py-2.5 px-3">Department</th>
                        <th className="py-2.5 px-3">Location</th>
                        <th className="py-2.5 px-3">Applicants</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-edge">
                      {jobs.slice(0, 5).map((job) => (
                        <tr key={job.id} className="hover:bg-canvas-soft/50 transition-colors">
                          <td className="py-3 px-3 font-semibold text-ink">{job.title}</td>
                          <td className="py-3 px-3 text-ink-secondary">{job.department || 'General'}</td>
                          <td className="py-3 px-3 text-ink-muted">{job.location}</td>
                          <td className="py-3 px-3 font-bold text-accent">{job.applicantCount || 0}</td>
                          <td className="py-3 px-3">
                            <span
                              className={cn(
                                'text-[10px] font-bold px-2 py-0.5 rounded border capitalize',
                                job.status === 'active'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                              )}
                            >
                              ● {job.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-accent hover:text-accent font-semibold"
                              onClick={() => {
                                setSelectedJobId(job.id);
                                handleSelectTab('pipeline');
                              }}
                            >
                              View Pipeline <ArrowRight className="size-3 ml-1" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── TAB 1: ATS Candidate Pipeline ─── */}
      {activeTab === 'pipeline' && (
        <div className="space-y-5">
          {/* Requisition Selector & Filters Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-edge bg-surface shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label htmlFor="active-req-select" className="text-xs font-bold text-ink whitespace-nowrap">
                Active Requisition:
              </label>
              {jobs.length === 0 ? (
                <span className="text-xs text-ink-muted">No open requisitions posted yet.</span>
              ) : (
                <select
                  id="active-req-select"
                  value={selectedJob?.id || ''}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="text-xs h-9 px-3 rounded-lg border border-edge bg-canvas-soft text-ink font-semibold focus:outline-none focus:ring-1 focus:ring-accent max-w-sm"
                >
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({j.applicantCount || 0} applicants)
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowInterviewSlotManager(true)}
                className="h-8 text-xs gap-1.5"
              >
                <Calendar className="size-3.5" aria-hidden="true" />
                Manage Interview Slots
              </Button>

              <div className="relative w-full sm:w-64">
                <Search className="size-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <Input
                  aria-label="Search applicants"
                  placeholder="Search applicants..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-8"
                />
              </div>

              <select
                aria-label="Sort applicants by"
                value={pipelineSort}
                onChange={(e) => setPipelineSort(e.target.value as typeof pipelineSort)}
                className="text-xs h-8 px-2.5 rounded-lg border border-edge bg-canvas-soft text-ink font-semibold focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="match">Sort: ATS Match (High)</option>
                <option value="date">Sort: Applied Date</option>
                <option value="name">Sort: Name (A-Z)</option>
              </select>

              <div className="flex items-center rounded-lg border border-edge p-0.5 bg-canvas-soft shrink-0">
                <button
                  type="button"
                  aria-label="Kanban Board View"
                  onClick={() => setPipelineViewMode('kanban')}
                  className={cn(
                    'p-1.5 rounded text-ink transition-colors',
                    pipelineViewMode === 'kanban' ? 'bg-surface shadow-xs text-accent' : 'text-ink-muted hover:text-ink'
                  )}
                  title="Kanban Board View"
                >
                  <LayoutGrid className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="List Table View"
                  onClick={() => setPipelineViewMode('list')}
                  className={cn(
                    'p-1.5 rounded text-ink transition-colors',
                    pipelineViewMode === 'list' ? 'bg-surface shadow-xs text-accent' : 'text-ink-muted hover:text-ink'
                  )}
                  title="List Table View"
                >
                  <List className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {/* Candidate Pipeline Body */}
          {applicationsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
              {[1, 2, 3, 4].map((col) => (
                <div key={col} className="rounded-xl border border-edge bg-canvas-soft/60 p-3 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-edge/60">
                    <div className="h-4 w-24 rounded bg-canvas-soft" />
                    <div className="h-4 w-6 rounded-full bg-canvas-soft" />
                  </div>
                  <div className="space-y-2.5">
                    <div className="h-20 rounded-lg bg-surface border border-edge/60 p-3 space-y-2">
                      <div className="h-3.5 w-3/4 rounded bg-canvas-soft" />
                      <div className="h-3 w-1/2 rounded bg-canvas-soft" />
                    </div>
                    <div className="h-20 rounded-lg bg-surface border border-edge/60 p-3 space-y-2">
                      <div className="h-3.5 w-2/3 rounded bg-canvas-soft" />
                      <div className="h-3 w-1/3 rounded bg-canvas-soft" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : pipelineViewMode === 'kanban' ? (
            /* Kanban Board View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {KANBAN_STAGES.map((col) => {
                const stageApplications = filteredApplications.filter(
                  (a) => (a.status || 'pending') === col.key
                );
                return (
                  <div
                    key={col.key}
                    className="flex flex-col rounded-xl border border-edge bg-canvas-soft/40 overflow-hidden"
                  >
                    <div className="p-3 border-b border-edge bg-surface/70 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ink">{col.label}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-canvas-soft border border-edge text-ink-muted">
                          {stageApplications.length}
                        </span>
                      </div>
                    </div>

                    <div className="p-2 space-y-2.5 flex-1 min-h-[300px]">
                      {stageApplications.length === 0 ? (
                        <div className="h-28 border border-dashed border-edge/60 rounded-lg flex items-center justify-center text-[11px] text-ink-muted">
                          Empty stage
                        </div>
                      ) : (
                        stageApplications.map((app) => (
                          <div
                            key={app.id}
                            onClick={() => setSelectedApplication(app)}
                            className="p-3.5 rounded-lg border border-edge bg-surface shadow-xs hover:border-accent/40 hover:shadow-sm transition-all cursor-pointer space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-xs font-bold text-ink hover:text-accent transition-colors">
                                {app.applicantName}
                              </h4>
                              {getMatchScoreBadge(app.matchScore)}
                            </div>

                            <p className="text-[11px] text-ink-muted truncate">
                              {app.applicantEmail}
                            </p>

                            {app.coverLetter && (
                              <p className="text-[11px] text-ink-muted line-clamp-2 italic bg-canvas-soft/60 p-1.5 rounded">
                                "{app.coverLetter}"
                              </p>
                            )}

                            <div className="flex items-center justify-between pt-1 border-t border-edge text-[10px] text-ink-muted">
                              <span>
                                {app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : 'Recent'}
                              </span>
                              <span className="text-accent font-semibold flex items-center gap-0.5">
                                Review <ChevronRight className="size-3" />
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : filteredApplications.length === 0 ? (
            <div className="border border-edge rounded-2xl bg-surface p-12 text-center shadow-xs">
              <Users className="size-12 text-ink-muted mx-auto mb-3" />
              <h3 className="text-sm font-bold text-ink">No Applications Received Yet</h3>
              <p className="text-xs text-ink-muted max-w-sm mx-auto mt-1">
                Applicants who submit their resume for {selectedJob?.title || 'this position'} will appear here with live ATS compatibility scores.
              </p>
            </div>
          ) : (
            /* List Table View */
            <div className="border border-edge rounded-xl bg-surface overflow-x-auto shadow-xs">
              <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-edge bg-canvas-soft/70">
                    <th className="p-3.5 font-semibold text-ink">Applicant Name</th>
                    <th className="p-3.5 font-semibold text-ink">Contact Email</th>
                    <th className="p-3.5 font-semibold text-ink text-center">ATS Match</th>
                    <th className="p-3.5 font-semibold text-ink">Hiring Stage</th>
                    <th className="p-3.5 font-semibold text-ink">Applied Date</th>
                    <th className="p-3.5 font-semibold text-ink text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge/60">
                  {filteredApplications.map((app) => (
                    <tr
                      key={app.id}
                      onClick={() => setSelectedApplication(app)}
                      className="hover:bg-canvas-soft/40 transition-colors cursor-pointer"
                    >
                      <td className="p-3.5 font-bold text-ink">
                        {app.applicantName}
                      </td>
                      <td className="p-3.5 text-ink-muted">
                        {app.applicantEmail}
                      </td>
                      <td className="p-3.5 text-center">
                        {getMatchScoreBadge(app.matchScore)}
                      </td>
                      <td className="p-3.5">
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-canvas-soft border border-edge text-ink">
                          {app.status || 'pending'}
                        </span>
                      </td>
                      <td className="p-3.5 text-ink-muted">
                        {app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : 'Recent'}
                      </td>
                      <td className="p-3.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2 gap-1 text-accent border-accent/30"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedApplication(app);
                          }}
                        >
                          Review Drawer
                          <ChevronRight className="size-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: Job Requisitions ─── */}
      {activeTab === 'jobs' && (
        <div className="space-y-4">
          {jobsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="rounded-xl border border-edge bg-surface/70 p-4 space-y-3.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-16 rounded bg-canvas-soft" />
                    <div className="h-4 w-14 rounded-full bg-canvas-soft" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-5 w-3/4 rounded bg-canvas-soft" />
                    <div className="h-3.5 w-1/2 rounded bg-canvas-soft" />
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-edge/60">
                    <div className="h-3 w-20 rounded bg-canvas-soft" />
                    <div className="h-7 w-24 rounded bg-canvas-soft" />
                  </div>
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="border border-edge rounded-2xl bg-surface p-12 text-center shadow-xs">
              <Briefcase className="size-12 text-ink-muted mx-auto mb-3" />
              <h3 className="text-sm font-bold text-ink">No Job Requisitions Open</h3>
              <p className="text-xs text-ink-muted max-w-sm mx-auto mt-1">
                Post your first engineering or leadership role to start receiving ATS-ranked resumes.
              </p>
              <Button
                size="sm"
                onClick={() => setShowCreateJobModal(true)}
                className="mt-4 text-xs font-semibold gap-1.5 bg-accent hover:bg-accent/90"
              >
                <Plus className="size-3.5" /> Post Job Requisition
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {jobs.map((job) => (
                <Card key={job.id} className="border-edge shadow-xs bg-surface flex flex-col justify-between">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-accent bg-accent-soft px-2 py-0.5 rounded">
                        {job.department || 'General'}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded border capitalize flex items-center gap-1',
                          job.status === 'active'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                        )}
                      >
                        ● {job.status}
                      </span>
                    </div>

                    <CardTitle className="text-sm font-bold text-ink leading-snug">
                      {job.title}
                    </CardTitle>

                    <CardDescription className="text-xs flex flex-wrap items-center gap-3 pt-1 text-ink-muted">
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" /> {job.location}
                      </span>
                      {job.salary && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="size-3" /> {job.salary}
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-0">
                    <div className="border-t border-edge pt-3 flex items-center justify-between text-xs">
                      <span className="text-ink-muted">
                        <strong className="text-ink font-semibold">{job.applicantCount || 0}</strong> Applicants
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleJobStatus(job)}
                          disabled={updateJobMutation.isPending}
                          className="text-xs text-ink-muted hover:text-ink flex items-center gap-1 transition-colors"
                          title={job.status === 'active' ? 'Pause Requisition' : 'Activate Requisition'}
                        >
                          {job.status === 'active' ? (
                            <>
                              <PauseCircle className="size-3.5 text-amber-500" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <PlayCircle className="size-3.5 text-emerald-500" />
                              <span>Activate</span>
                            </>
                          )}
                        </button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => {
                            setSelectedJobId(job.id);
                            setActiveTab('pipeline');
                          }}
                        >
                          View Pipeline
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: Company Profile ─── */}
      {activeTab === 'company' && <CompanyProfile />}

      {/* ─── TAB 4: Team Seats & Roles ─── */}
      {activeTab === 'team' && <TeamSeats />}

      {/* ─── TAB 5: Candidate Messages ─── */}
      {activeTab === 'messages' && (
        <Card className="border-edge shadow-xs bg-surface overflow-hidden">
          <CardHeader className="border-b border-edge pb-3">
            <CardTitle className="text-sm font-bold text-ink flex items-center gap-2"><MessageSquare className="size-4 text-accent" /> Candidate Conversations</CardTitle>
            <CardDescription className="text-xs text-ink-muted">Server-backed messages from authorized application conversations.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex flex-col md:flex-row min-h-[480px]">
            <div className="w-full md:w-72 border-r border-edge bg-canvas-soft/40 p-3 space-y-2 shrink-0" aria-label="Candidate conversations">
              {conversationsLoading && <p role="status" className="p-3 text-xs text-ink-muted">Loading conversations…</p>}
              {conversationsError && <p role="alert" className="p-3 text-xs text-red-700">{conversationsError}</p>}
              {!conversationsLoading && !conversationsError && conversations.length === 0 && (
                <div className="p-4 text-center"><p className="text-sm font-semibold text-ink">No Active Candidate Conversations</p><p className="mt-1 text-xs text-ink-muted">Initiate communication through a candidate in your hiring pipeline.</p></div>
              )}
              {conversations.map((conversation) => (
                <button key={conversation.id} type="button" onClick={() => { setMessagesError(''); setReadError(''); setActiveConversationId(conversation.id); }}
                  aria-pressed={activeConversationId === conversation.id}
                  className={cn('w-full text-left p-3 rounded-xl text-xs flex flex-col gap-1', activeConversationId === conversation.id ? 'bg-accent text-white' : 'hover:bg-surface text-ink')}>
                  <span className="flex items-center justify-between gap-2"><span className="font-bold truncate">{conversation.candidateName}</span>{conversation.unreadCount > 0 && <span aria-label={`${conversation.unreadCount} unread messages`} className="min-w-5 rounded-full bg-accent-soft px-1.5 text-center text-[10px] text-white">{conversation.unreadCount}</span>}</span>
                  <span className="truncate opacity-80">{conversation.role}</span>
                  <span className="truncate opacity-75">{conversation.lastMessage?.text || 'No messages yet'}</span>
                  {conversation.lastMessage?.timestamp && <time className="text-[10px] opacity-70" dateTime={new Date(Number(conversation.lastMessage.timestamp)).toISOString()}>{new Date(Number(conversation.lastMessage.timestamp)).toLocaleString()}</time>}
                </button>
              ))}
            </div>
            <div className="flex-1 flex flex-col p-4 bg-surface min-h-[400px]">
              {!activeConversationId ? <p className="m-auto text-sm text-ink-muted">Select a conversation to view its messages.</p> : <>
                <div className="flex-1 space-y-3 max-h-[360px] overflow-y-auto pr-1" aria-live="polite" aria-busy={messagesLoading}>
                  {messagesLoading && <p role="status" className="text-xs text-ink-muted">Loading message history…</p>}
                  {messagesError && <p role="alert" className="text-xs text-red-700">{messagesError}</p>}
                  {readError && <p role="alert" className="text-xs text-red-700">{readError}</p>}
                  {(messagesByConversation[activeConversationId] || []).map((message) => {
                    const mine = message.senderId === user?.uid;
                    return <div key={message.id} className={cn('flex flex-col max-w-[80%]', mine ? 'ml-auto items-end' : 'mr-auto items-start')}>
                      <p className={cn('p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-words', mine ? 'bg-accent text-white' : 'bg-canvas-soft border border-edge text-ink')}>{message.text}</p>
                      <time className="text-[10px] text-ink-muted mt-1 px-1" dateTime={new Date(Number(message.timestamp)).toISOString()}>{new Date(Number(message.timestamp)).toLocaleString()}</time>
                    </div>;
                  })}
                  {!messagesLoading && !messagesError && (messagesByConversation[activeConversationId] || []).length === 0 && <p className="text-xs text-ink-muted">No messages in this conversation yet.</p>}
                </div>
                <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-3 border-t border-edge mt-4">
                  <Input aria-label="Message text" value={newMessageText} onChange={(event) => setNewMessageText(event.target.value)} placeholder="Write a reply…" disabled={messageSending} className="text-xs h-9" />
                  <Button type="submit" size="sm" disabled={!newMessageText.trim() || messageSending} aria-busy={messageSending} className="h-9 px-3 gap-1.5 shrink-0"><Send className="size-3.5" />{messageSending ? 'Sending…' : 'Send'}</Button>
                </form>
              </>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── TAB 6: Hiring Preferences (persisted via /api/employer/settings) ─── */}
      {activeTab === 'settings' && (
        <Card className="border-edge shadow-xs bg-surface max-w-3xl">
          <CardHeader className="border-b border-edge pb-4">
            <CardTitle className="text-sm font-bold text-ink flex items-center gap-2">
              <Settings className="size-4 text-accent" /> Hiring & Pipeline Preferences
            </CardTitle>
            <CardDescription className="text-xs text-ink-muted">
              These preferences are stored against your employer account and reload from the server on every visit.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {settingsLoading && <p role="status" className="text-xs text-ink-muted">Loading saved preferences…</p>}
            {settingsLoadFailed && (
              <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between gap-3">
                <span>Saved preferences could not be loaded. Nothing on this form has been stored yet.</span>
                <Button type="button" size="sm" variant="outline" onClick={() => void loadEmployerSettings()} className="h-8 text-xs">Retry</Button>
              </div>
            )}
            <form onSubmit={handleSaveSettings} className="space-y-5" aria-busy={settingsSaving}>
              <div className="space-y-1.5">
                <label htmlFor="settings-company-name" className="text-xs font-bold text-ink">Company Name</label>
                <Input
                  id="settings-company-name"
                  value={settingsForm.companyName}
                  onChange={(event) => updateSettingsField('companyName', event.target.value)}
                  aria-invalid={Boolean(settingsValidation.companyName)}
                  disabled={settingsSaving}
                  className="text-xs h-9 max-w-sm"
                />
                {settingsValidation.companyName
                  ? <p role="alert" className="text-[11px] text-red-700">{settingsValidation.companyName}</p>
                  : <p className="text-[11px] text-ink-muted">Used on hiring correspondence sent to candidates.</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="settings-timezone" className="text-xs font-bold text-ink">Reporting Timezone (IANA)</label>
                <Input
                  id="settings-timezone"
                  list="settings-timezone-options"
                  value={settingsForm.timezone}
                  onChange={(event) => updateSettingsField('timezone', event.target.value)}
                  aria-invalid={Boolean(settingsValidation.timezone)}
                  disabled={settingsSaving}
                  className="text-xs h-9 max-w-sm"
                />
                <datalist id="settings-timezone-options">
                  {COMMON_TIMEZONES.map((zone) => <option key={zone} value={zone} />)}
                </datalist>
                {settingsValidation.timezone
                  ? <p role="alert" className="text-[11px] text-red-700">{settingsValidation.timezone}</p>
                  : <p className="text-[11px] text-ink-muted">Pipeline dates and interview slots are shown in this timezone.</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="settings-notification-email" className="text-xs font-bold text-ink">Notification Email</label>
                <Input
                  id="settings-notification-email"
                  type="email"
                  value={settingsForm.notificationEmail}
                  onChange={(event) => updateSettingsField('notificationEmail', event.target.value)}
                  aria-invalid={Boolean(settingsValidation.notificationEmail)}
                  disabled={settingsSaving}
                  placeholder="hiring@yourcompany.com"
                  className="text-xs h-9 max-w-sm"
                />
                {settingsValidation.notificationEmail
                  ? <p role="alert" className="text-[11px] text-red-700">{settingsValidation.notificationEmail}</p>
                  : <p className="text-[11px] text-ink-muted">Leave blank to use the signed-in account address.</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="settings-interview-duration" className="text-xs font-bold text-ink">Default Interview Duration</label>
                <select
                  id="settings-interview-duration"
                  value={settingsForm.defaultInterviewDuration}
                  onChange={(event) => updateSettingsField('defaultInterviewDuration', event.target.value)}
                  disabled={settingsSaving}
                  className="w-full max-w-sm text-xs h-9 px-3 rounded-lg border border-edge bg-canvas-soft text-ink font-semibold"
                >
                  {SUPPORTED_INTERVIEW_DURATIONS.map((minutes) => (
                    <option key={minutes} value={String(minutes)}>{minutes} minutes</option>
                  ))}
                </select>
                {settingsValidation.defaultInterviewDuration
                  ? <p role="alert" className="text-[11px] text-red-700">{settingsValidation.defaultInterviewDuration}</p>
                  : <p className="text-[11px] text-ink-muted">Pre-selected when you create an interview slot.</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="settings-auto-archive" className="text-xs font-bold text-ink">Auto-Archive Closed Applications After (days)</label>
                <Input
                  id="settings-auto-archive"
                  type="number"
                  min="0"
                  max={AUTO_ARCHIVE_MAX_DAYS}
                  value={settingsForm.autoArchiveDays}
                  onChange={(event) => updateSettingsField('autoArchiveDays', event.target.value)}
                  aria-invalid={Boolean(settingsValidation.autoArchiveDays)}
                  disabled={settingsSaving}
                  className="text-xs h-9 max-w-xs"
                />
                {settingsValidation.autoArchiveDays
                  ? <p role="alert" className="text-[11px] text-red-700">{settingsValidation.autoArchiveDays}</p>
                  : <p className="text-[11px] text-ink-muted">Use 0 to keep closed applications indefinitely.</p>}
              </div>

              <div className="pt-3 border-t border-edge flex flex-wrap items-center gap-3">
                <Button type="submit" size="sm" disabled={settingsSaving || settingsLoading} aria-busy={settingsSaving} className="bg-accent hover:bg-accent/90 text-xs font-semibold">
                  {settingsSaving ? 'Saving…' : 'Save Hiring Preferences'}
                </Button>
                {settingsDirty && !settingsSaving && <span className="text-[11px] font-semibold text-amber-700">Unsaved changes</span>}
                {settingsNotice && <span role="status" className="text-xs font-semibold text-emerald-700">{settingsNotice}</span>}
                {settingsError && <span role="alert" className="text-xs text-red-700">{settingsError}</span>}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ─── Create Job Modal ─── */}
      <CreateJobModal
        isOpen={showCreateJobModal}
        onClose={() => setShowCreateJobModal(false)}
        onSuccess={() => {
          refetchJobs();
          setActiveTab('jobs');
        }}
      />

      {/* ─── Employer Interview Slot Manager Dialog ─── */}
      <InterviewSlotManager open={showInterviewSlotManager} onOpenChange={setShowInterviewSlotManager} />

      {/* ─── Candidate Review Drawer ─── */}
      <CandidateReviewDrawer
        jobId={selectedJob?.id || ''}
        application={selectedApplication}
        onClose={() => setSelectedApplication(null)}
        onStatusUpdated={() => {
          refetchApplications();
          refetchJobs();
        }}
      />
    </div>
  );
}
export default EmployerPortalPage;