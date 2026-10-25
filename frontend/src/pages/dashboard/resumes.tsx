/**
 * Resumes List Page — Executive Candidate Surface
 *
 * Displays user's resumes with live template thumbnails, Cuba executive glassmorphism,
 * interactive PreviewModal, ShareModal, Delete Dialog, Rename Dialog,
 * DOCX & PDF downloaders, ATS readiness scoring, dynamic filtering, sorting,
 * Master CV hero banner, and seamless Grid / List view toggle.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSpinner } from '@/components/ui/loading';
import { get, post, del, normalizeError } from '@/lib/api-client';
import { getTemplateMeta } from '@/lib/template-catalog';
import { describeMasterCompleteness, type MasterProfileCompleteness } from '@/lib/master-profile';
import { resumeContentPayload } from '@/lib/resume-payload';
import {
  computeResumeMetrics,
  bucketForScore,
  bucketTone,
  ATS_READY_THRESHOLD,
  ATS_DEVELOPING_THRESHOLD,
} from '@/lib/resume-metrics';
import { resumeQualityScore } from '@/lib/resume-score';
import { PreviewModal } from '@/components/ui/preview-modal';
import { ShareModal } from '@/components/ui/share-modal';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  FileText,
  MoreVertical,
  Edit,
  Trash2,
  Download,
  Share2,
  Eye,
  Clock,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Search,
  LayoutGrid,
  List,
  Copy,
  User,
  X,
  FileEdit,
  TrendingUp,
  Gauge,
  Layers,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileDown,
} from 'lucide-react';

interface Resume {
  id: string;
  name?: string;
  title?: string;
  template: string;
  occupation?: string;
  targetRole?: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  phone?: string;
  updatedAt?: string;
  createdAt?: string;
  created_at?: string;
  updated_at?: string;
  completeness?: number;
  data?: any;
}

const PAGE_SIZE = 8;

export function ResumesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [masterCv, setMasterCv] = useState<MasterProfileCompleteness | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, filter & view state
  const [searchQuery, setSearchQuery] = useState('');
  const [atsFilter, setAtsFilter] = useState<'all' | 'ready' | 'developing' | 'starting' | 'unscored'>('all');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'updated-desc' | 'updated-asc' | 'title-asc' | 'title-desc' | 'ats-desc' | 'ats-asc'>('updated-desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);

  // Modal & operation states
  const [previewResume, setPreviewResume] = useState<any | null>(null);
  const [shareResume, setShareResume] = useState<{ id: string; name: string; template: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Resume | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Resume | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [downloadingDocxId, setDownloadingDocxId] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  // Create Resume Modal state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newResumeTitle, setNewResumeTitle] = useState('Senior Software Architect');
  const [newResumeMode, setNewResumeMode] = useState<'profile' | 'blank' | 'template'>('profile');

  // Display name from the session. When it is unknown we say so instead of
  // inventing a person (the dashboard must never show demo PII).
  const candidateName = useMemo(() => {
    try {
      const stored = localStorage.getItem('ime_dev_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        const display = parsed?.displayName
          || [parsed?.firstname, parsed?.lastname].filter(Boolean).join(' ')
          || parsed?.email;
        if (display) return String(display);
      }
    } catch {
      // ignore malformed local session data
    }
    return '';
  }, []);

  // Load real resumes from backend
  const fetchResumes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<{ resumes: Resume[] }>('/resumes');
      setResumes(data.resumes ?? []);
    } catch (err) {
      const apiErr = normalizeError(err);
      setError(apiErr.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

  // Deep link from the builder shell: /dashboard/resumes?share=<id> opens the
  // Share dialog for that resume once the list has loaded. The query string is
  // consumed so a later refresh does not reopen the dialog.
  useEffect(() => {
    const shareId = searchParams.get('share');
    if (!shareId || resumes.length === 0) return;
    const match = resumes.find((r) => r.id === shareId);
    if (match) {
      setShareResume({
        id: match.id,
        name: match.title || match.name || 'Untitled Resume',
        template: match.template || 'Cv1',
      });
    }
    const next = new URLSearchParams(searchParams);
    next.delete('share');
    setSearchParams(next, { replace: true });
  }, [resumes, searchParams, setSearchParams]);

  // Master CV completeness is read from the same revisioned projection the
  // builder initialises from. A failure leaves the banner's neutral copy in
  // place — the dashboard never invents a progress number.
  useEffect(() => {
    let cancelled = false;
    get<{ user?: any }>('/users-data/profile')
      .then((data) => {
        if (!cancelled && data?.user) setMasterCv(describeMasterCompleteness(data));
      })
      .catch(() => {
        if (!cancelled) setMasterCv(null);
      });
    return () => { cancelled = true; };
  }, []);

  // Real ATS quality score for a resume. List rows are the stored resume (flat
  // fields, no `data` column), which is what the scorer reads; a row that cannot
  // be read is reported unscored rather than scored as zero.
  const getResumeScore = useCallback((resume: Resume): number | null => resumeQualityScore(resume), []);

  // Executive metrics derived from real ATS scores (80 / 60 thresholds).
  const stats = useMemo(() => {
    const metrics = computeResumeMetrics(resumes as any, (resume: any) => getResumeScore(resume as Resume));
    let latestDate: Date | null = null;
    resumes.forEach((r) => {
      const dateVal = r.updatedAt || r.updated_at || r.createdAt || r.created_at;
      if (!dateVal) return;
      const d = new Date(dateVal);
      if (!Number.isNaN(d.getTime()) && (!latestDate || d > latestDate)) latestDate = d;
    });
    return {
      ...metrics,
      latestDate: latestDate ? formatDate(latestDate.toISOString()) : '—',
    };
  }, [resumes, getResumeScore]);

  // Dynamic template options in user's library
  const availableTemplates = useMemo(() => {
    const set = new Set<string>();
    resumes.forEach((r) => {
      if (r.template) set.add(r.template);
    });
    return Array.from(set).sort();
  }, [resumes]);

  // Filtered and sorted resumes
  const filteredResumes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const list = resumes.filter((r) => {
      const title = (r.title || r.name || 'Untitled Resume').toLowerCase();
      const role = (r.occupation || r.targetRole || '').toLowerCase();
      const tmpl = (r.template || 'Cv1').toLowerCase();
      const meta = getTemplateMeta(r.template || 'Cv1');
      const templateName = meta.name.toLowerCase();

      const searchMatch =
        !query ||
        title.includes(query) ||
        role.includes(query) ||
        tmpl.includes(query) ||
        templateName.includes(query);

      const templateMatch = templateFilter === 'all' || r.template === templateFilter;

      const score = getResumeScore(r);
      const bucket = bucketForScore(score);
      const atsMatch =
        atsFilter === 'all' ||
        (atsFilter === 'ready' && bucket === 'ready') ||
        (atsFilter === 'developing' && bucket === 'developing') ||
        (atsFilter === 'starting' && bucket === 'starting') ||
        (atsFilter === 'unscored' && bucket === 'unscored');

      return searchMatch && templateMatch && atsMatch;
    });

    // Sorting
    list.sort((a, b) => {
      const titleA = a.title || a.name || 'Untitled Resume';
      const titleB = b.title || b.name || 'Untitled Resume';

      if (sortBy === 'title-asc') return titleA.localeCompare(titleB);
      if (sortBy === 'title-desc') return titleB.localeCompare(titleA);

      if (sortBy === 'ats-desc' || sortBy === 'ats-asc') {
        const scoreA = getResumeScore(a);
        const scoreB = getResumeScore(b);
        if (scoreA === null && scoreB !== null) return 1;
        if (scoreB === null && scoreA !== null) return -1;
        if (scoreA === null && scoreB === null) return 0;
        return sortBy === 'ats-desc' ? (scoreB! - scoreA!) : (scoreA! - scoreB!);
      }

      const dateA = new Date(a.updatedAt || a.updated_at || a.createdAt || a.created_at || 0).getTime();
      const dateB = new Date(b.updatedAt || b.updated_at || b.createdAt || b.created_at || 0).getTime();

      return sortBy === 'updated-asc' ? dateA - dateB : dateB - dateA;
    });

    return list;
  }, [resumes, searchQuery, atsFilter, templateFilter, sortBy, getResumeScore]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredResumes.length / PAGE_SIZE));
  const paginatedResumes = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredResumes.slice(start, start + PAGE_SIZE);
  }, [filteredResumes, currentPage]);

  // Actions
  const handleLaunchCreatedResume = () => {
    setIsCreateDialogOpen(false);
    const titleParam = encodeURIComponent(newResumeTitle.trim() || 'Executive Resume');
    if (newResumeMode === 'template') {
      navigate(`/build-resume?new=true&title=${titleParam}&step=template`);
    } else if (newResumeMode === 'blank') {
      navigate(`/build-resume?new=true&title=${titleParam}`);
    } else {
      navigate(`/build-resume?new=true&sync=true&title=${titleParam}`);
    }
  };

  const handleEdit = (resume: Resume) => {
    try {
      localStorage.setItem('currentResumeId', String(resume.id));
      localStorage.removeItem('currentResumeItem');
    } catch {
      // storage unavailable
    }
    navigate(`/build-resume/${resume.id}`);
  };

  const handleOpenPreview = async (resume: Resume) => {
    try {
      const full = await get<{ resume: any }>(`/resumes/${resume.id}`);
      const raw = full.resume || resume;
      const parseJsonSafe = (val: any) => {
        if (typeof val === 'string') {
          try {
            return JSON.parse(val);
          } catch {
            return [];
          }
        }
        return val || [];
      };

      const parsedData = typeof raw.data === 'string' ? JSON.parse(raw.data) : (raw.data || {});

      // Extract raw arrays safely
      const rawExp = parseJsonSafe(raw.employments || raw.experience || parsedData.employments || parsedData.experience);
      const rawEdu = parseJsonSafe(raw.educations || raw.education || parsedData.educations || parsedData.education);
      const rawCerts = parseJsonSafe(raw.certifications || parsedData.certifications);
      const rawSkills = parseJsonSafe(raw.skills || parsedData.skills);
      const rawProjects = parseJsonSafe(raw.projects || parsedData.projects);
      const rawLanguages = parseJsonSafe(raw.languages || parsedData.languages);

      const experience = Array.isArray(rawExp) ? rawExp.map((e: any, idx: number) => ({
        id: e.id || `exp-${idx}`,
        company: e.company || e.employer || e.organization || '',
        position: e.position || e.jobTitle || e.title || '',
        location: e.location || '',
        startDate: e.startDate || e.begin || '',
        endDate: e.endDate || e.end || (e.current ? 'Present' : ''),
        current: Boolean(e.current || e.endDate === 'Present'),
        description: e.description || e.summary || '',
      })) : [];

      const education = Array.isArray(rawEdu) ? rawEdu.map((ed: any, idx: number) => ({
        id: ed.id || `edu-${idx}`,
        institution: ed.institution || ed.school || '',
        degree: ed.degree || '',
        field: ed.field || ed.major || '',
        startDate: ed.startDate || ed.begin || '',
        endDate: ed.endDate || ed.end || '',
        gpa: ed.gpa || '',
        description: ed.description || '',
      })) : [];

      let skillCategories: { id: string; category: string; skills: string[] }[] = [];
      if (Array.isArray(rawSkills) && rawSkills.length > 0) {
        if (typeof rawSkills[0] === 'string') {
          skillCategories = [{ id: 'core', category: 'Core Competencies', skills: rawSkills }];
        } else if (typeof rawSkills[0] === 'object') {
          const grouped: Record<string, string[]> = {};
          for (const s of rawSkills) {
            const cat = s.category || 'Core Skills';
            const name = s.name || s.skillName || s.skill || s.value || '';
            if (name) {
              if (!grouped[cat]) grouped[cat] = [];
              grouped[cat].push(name);
            }
          }
          skillCategories = Object.entries(grouped).map(([category, skills], i) => ({
            id: `cat-${i}`,
            category,
            skills,
          }));
        }
      } else if (parsedData.skillCategories) {
        skillCategories = parsedData.skillCategories;
      }

      const certifications = Array.isArray(rawCerts) ? rawCerts.map((c: any, idx: number) => ({
        id: c.id || `cert-${idx}`,
        name: c.name || c.title || c.certificationName || '',
        issuer: c.issuer || c.institution || c.organization || '',
        date: c.date || c.issueDate || c.year || '',
      })) : [];

      const projects = Array.isArray(rawProjects) ? rawProjects.map((p: any, idx: number) => ({
        id: p.id || `proj-${idx}`,
        title: p.title || p.name || '',
        technologies: p.technologies || p.techStack || '',
        liveUrl: p.liveUrl || p.link || '',
        description: p.description || p.summary || '',
      })) : [];

      const rawAchievements = parseJsonSafe(raw.achievements || parsedData.achievements);
      const achievements = Array.isArray(rawAchievements) ? rawAchievements.map((a: any, idx: number) => ({
        id: a.id || `ach-${idx}`,
        title: a.title || a.name || '',
        description: a.description || a.summary || '',
      })) : [];

      const languages = Array.isArray(rawLanguages) ? rawLanguages.map((l: any, idx: number) => ({
        id: l.id || `lang-${idx}`,
        language: l.language || l.name || (typeof l === 'string' ? l : ''),
        proficiency: l.proficiency || l.level || '',
      })) : [];

      const photo = raw.photo || parsedData.photo || parsedData.heading?.photo || '';
      const showPhoto = (raw.showPhoto !== false && parsedData.showPhoto !== false && parsedData.heading?.showPhoto !== false) && Boolean(photo);

      setPreviewResume({
        id: raw.id || resume.id,
        name: raw.title || raw.name || resume.title || resume.name || 'Untitled Resume',
        template: raw.template || resume.template || 'Cv1',
        heading: {
          firstName: raw.firstname || parsedData.heading?.firstName || parsedData.firstName || '',
          lastName: raw.lastname || parsedData.heading?.lastName || parsedData.lastName || '',
          email: raw.email || parsedData.heading?.email || parsedData.email || '',
          phone: raw.phone || parsedData.heading?.phone || parsedData.phone || '',
          location: [raw.city, raw.country].filter(Boolean).join(', ') || raw.address || parsedData.heading?.location || parsedData.location || '',
          website: raw.website || parsedData.heading?.website || parsedData.website || '',
          linkedin: raw.linkedin || parsedData.heading?.linkedin || parsedData.linkedin || '',
          github: raw.github || parsedData.heading?.github || parsedData.github || '',
          title: raw.occupation || parsedData.heading?.title || parsedData.title || '',
          photo,
          showPhoto,
        },
        experience,
        education,
        skillCategories,
        summary: raw.summary || parsedData.summary || '',
        certifications,
        projects,
        achievements,
        languages,
      });
    } catch {
      setPreviewResume({
        id: resume.id,
        name: resume.title || resume.name || 'Untitled Resume',
        template: resume.template || 'Cv1',
        heading: {
          firstName: resume.firstname || '',
          lastName: resume.lastname || '',
          email: resume.email || '',
          phone: resume.phone || '',
          location: '',
          title: resume.occupation || '',
          photo: (resume as any).photo || '',
          showPhoto: Boolean((resume as any).photo),
        },
        experience: [],
        education: [],
        skillCategories: [],
        summary: '',
        certifications: [],
        projects: [],
        achievements: [],
        languages: [],
      });
    }
  };

  const handleDownloadPdf = (resume: Resume) => {
    setDownloadingPdfId(resume.id);
    const templateId = resume.template || 'Cv1';
    window.open(`/export/${templateId}/${resume.id}/en`, '_blank');
    setTimeout(() => setDownloadingPdfId(null), 1200);
  };

  const handleDownloadDocx = async (resume: Resume) => {
    setActionError(null);
    setDownloadingDocxId(resume.id);
    try {
      const templateId = resume.template || 'Cv1';
      const devUser = localStorage.getItem('ime_dev_user');
      let token = localStorage.getItem('token') || localStorage.getItem('auth_token') || '';
      if (devUser) {
        try {
          const parsed = JSON.parse(devUser);
          if (parsed?.token) token = parsed.token;
        } catch {
          // ignore
        }
      }

      const res = await fetch('/api/export-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          resumeId: resume.id,
          resumeName: templateId,
          language: 'en',
        }),
      });

      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(resume.title || resume.name || 'Resume').replace(/[^\w\s-]/g, '').trim() || 'Resume'}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setActionError(`Could not download the Word document: ${err?.message || 'export failed'}`);
    } finally {
      setDownloadingDocxId(null);
    }
  };

  const handleDuplicate = async (resume: Resume) => {
    setDuplicatingId(resume.id);
    setActionError(null);
    try {
      const newId = `resume_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const full = await get<{ resume: any }>(`/resumes/${resume.id}`);
      const source = full.resume || resume;
      const originalTitle = source.title || source.name || 'Untitled Resume';

      // A duplicate is a new document: fresh id, no publication state, and a
      // null expected revision so the server creates it rather than updating.
      const payload = {
        ...resumeContentPayload(source),
        title: `${originalTitle} (Copy)`,
        name: `${originalTitle} (Copy)`,
        expectedRevision: null,
      };

      await post(`/resumes/${newId}`, payload);
      await fetchResumes();
    } catch (err) {
      const apiErr = normalizeError(err);
      setActionError(`Could not duplicate "${resume.title || resume.name || 'resume'}": ${apiErr.message}`);
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleOpenRename = (resume: Resume) => {
    setRenameTarget(resume);
    setRenameValue(resume.title || resume.name || 'Untitled Resume');
  };

  const handleSaveRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    setActionError(null);
    try {
      const full = await get<{ resume: any }>(`/resumes/${renameTarget.id}`);
      const source = full.resume || renameTarget;
      const payload = {
        ...resumeContentPayload(source),
        title: renameValue.trim(),
        name: renameValue.trim(),
        // Optimistic concurrency: a tab holding a stale revision gets a 409
        // instead of silently overwriting newer content.
        expectedRevision: typeof source.revision === 'number' ? source.revision : null,
      };
      await post(`/resumes/${renameTarget.id}`, payload);
      await fetchResumes();
      setRenameTarget(null);
    } catch (err) {
      const apiErr = normalizeError(err);
      setActionError(
        apiErr.status === 409
          ? 'This resume changed in another tab. Reopen it, then rename again.'
          : `Could not rename the resume: ${apiErr.message}`
      );
    } finally {
      setRenaming(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      await del(`/resumes/${deleteTarget.id}`);
      setResumes((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      const apiErr = normalizeError(err);
      setActionError(`Could not delete the resume: ${apiErr.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setAtsFilter('all');
    setTemplateFilter('all');
    setSortBy('updated-desc');
    setCurrentPage(1);
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="p-4 lg:p-6 xl:p-8 space-y-6 min-w-0" data-testid="dashboard-resumes-hub">
      {/* 1. Breadcrumb & Header Section */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-ink-muted mb-1">
            <span>Candidate Workspace</span>
            <span>&gt;</span>
            <span className="text-ink">Resumes &amp; Master CV</span>
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">My Resumes &amp; Master CV</h1>
            <span
              className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200 shadow-xs"
              data-testid="resume-count"
            >
              {resumes.length} {resumes.length === 1 ? 'Resume' : 'Resumes'}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {resumes.length} {resumes.length === 1 ? 'resume' : 'resumes'} in your workspace — build, edit, and track every version from one hub.
          </p>
        </div>

        {/* Global Action CTAs */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Button
            asChild
            variant="outline"
            size="md"
            className="gap-1.5 shadow-sm text-ink-muted hover:text-ink font-medium"
          >
            <Link to="/dashboard/settings?tab=Profile">
              <User className="size-4 text-brand-600" />
              <span>Master Profile Data</span>
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            size="md"
            className="gap-1.5 shadow-sm text-ink-muted hover:text-ink font-medium"
          >
            <Link to="/dashboard/ats-score">
              <Sparkles className="size-4 text-emerald-600" />
              <span>ATS Analytics</span>
            </Link>
          </Button>

          <Button
            size="md"
            onClick={() => setIsCreateDialogOpen(true)}
            className="gap-2 shadow-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white cursor-pointer"
            data-testid="create-new-resume-btn"
          >
            <Plus className="size-4" />
            <span>Create New Resume</span>
          </Button>
        </div>
      </div>

      {/* 2. Executive metric strip — real ATS buckets (80 / 60 thresholds) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 min-w-0">
        <div className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm transition-all hover:border-brand-300">
          <div className="flex items-center justify-between">
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand-50 border border-brand-200 text-brand-600">
              <FileText className="size-4.5" />
            </div>
            <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">TOTAL</span>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-ink sm:text-3xl" data-testid="metric-total">{stats.total}</div>
          <span className="mt-0.5 text-xs text-ink-muted">Resumes in your workspace</span>
        </div>

        <div className="flex flex-col rounded-2xl border border-emerald-200 bg-surface p-4 shadow-sm transition-all hover:border-emerald-300">
          <div className="flex items-center justify-between">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600">
              <TrendingUp className="size-4.5" />
            </div>
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">READY TO APPLY</span>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-emerald-800 sm:text-3xl" data-testid="metric-ready">{stats.ready}</div>
          <span className="mt-0.5 text-xs text-success-700">ATS score {ATS_READY_THRESHOLD}–100</span>
        </div>

        <div className="flex flex-col rounded-2xl border border-amber-200 bg-surface p-4 shadow-sm transition-all hover:border-amber-300">
          <div className="flex items-center justify-between">
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber-50 border border-amber-200 text-amber-600">
              <Gauge className="size-4.5" />
            </div>
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">DEVELOPING</span>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-amber-800 sm:text-3xl" data-testid="metric-developing">{stats.developing}</div>
          <span className="mt-0.5 text-xs text-warning-700">ATS score {ATS_DEVELOPING_THRESHOLD}–{ATS_READY_THRESHOLD - 1}</span>
        </div>

        <div className="flex flex-col rounded-2xl border border-slate-200 bg-surface p-4 shadow-sm transition-all hover:border-slate-300">
          <div className="flex items-center justify-between">
            <div className="flex size-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
              <Clock className="size-4.5" />
            </div>
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">STARTING</span>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-slate-700 sm:text-3xl" data-testid="metric-starting">{stats.starting}</div>
          <span className="mt-0.5 text-xs text-slate-500">ATS score below {ATS_DEVELOPING_THRESHOLD}{stats.unscored > 0 ? ` · ${stats.unscored} unscored` : ''}</span>
        </div>

        <div className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm transition-all hover:border-indigo-300">
          <div className="flex items-center justify-between">
            <div className="flex size-9 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600">
              <Layers className="size-4.5" />
            </div>
            <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">UNIQUE TEMPLATES</span>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-indigo-800 sm:text-3xl" data-testid="metric-templates">{stats.uniqueTemplates}</div>
          <span className="mt-0.5 text-xs text-indigo-700/80">Distinct designs in use</span>
        </div>
      </div>

      {/* 3. Master CV — Master Profile Data Hero Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-brand-200/80 bg-gradient-to-r from-brand-50/70 via-indigo-50/40 to-surface p-4 sm:p-5 shadow-xs min-w-0">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white border border-brand-200 text-brand-600 shadow-xs">
            <User className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink flex flex-wrap items-center gap-2">
              Master CV — Master Profile Data
              {masterCv && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                    masterCv.percent === 100
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                  data-testid="master-cv-completeness"
                >
                  {masterCv.filled} of {masterCv.total} sections complete
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              {masterCv && masterCv.empty
                ? <>Your Master CV is empty. Add your details once and every new resume can start complete.</>
                : candidateName
                  ? <>Your resumes are built on the Master Profile Data of <span className="font-semibold text-ink">{candidateName}</span>. Keep it current and every new resume starts complete.</>
                  : <>Your Master Profile Data seeds every new resume. Add your details once and each new resume starts complete.</>}
            </p>
            {masterCv?.updatedAt && (
              <p className="mt-0.5 text-[11px] text-ink-muted">
                Last updated {formatDate(masterCv.updatedAt)}
                {masterCv.revision !== null ? ` · revision ${masterCv.revision}` : ''}
              </p>
            )}
            {masterCv && !masterCv.empty && masterCv.missing.length > 0 && (
              <p className="mt-0.5 text-[11px] text-amber-700">
                Missing: {masterCv.missing.slice(0, 4).join(', ')}{masterCv.missing.length > 4 ? ` +${masterCv.missing.length - 4} more` : ''}
              </p>
            )}
          </div>
        </div>

        <Button
          asChild
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 font-semibold bg-white border-brand-200 text-brand-700 hover:bg-brand-50 shadow-xs"
        >
          <Link to="/dashboard/settings?tab=Profile">
            <span>Open Master Profile</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      {/* Action Error (duplicate/rename/delete/export) */}
      {actionError && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 min-w-0">
          <AlertCircle className="size-5 shrink-0" />
          <span className="flex-1 min-w-0">{actionError}</span>
          <Button variant="ghost" size="sm" onClick={() => setActionError(null)} className="shrink-0 gap-1.5">
            <X className="size-3.5" />
            Dismiss
          </Button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700 min-w-0">
          <AlertCircle className="size-5 shrink-0" />
          <span className="flex-1 min-w-0 truncate">{error}</span>
          <Button variant="outline" size="sm" onClick={fetchResumes} className="shrink-0 gap-1.5">
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      )}

      {/* 4. Section Heading & Search / Filter Controls */}
      <div className="space-y-3 min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink">Your Resumes</h2>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-ink-muted">
              {resumes.length}
            </span>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center rounded-xl border border-border bg-canvas-soft p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-surface text-ink shadow-xs font-semibold'
                  : 'text-ink-muted hover:text-ink'
              }`}
              aria-label="Grid view"
              title="Grid view"
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-surface text-ink shadow-xs font-semibold'
                  : 'text-ink-muted hover:text-ink'
              }`}
              aria-label="List view"
              title="List view"
            >
              <List className="size-4" />
            </button>
          </div>
        </div>

        {/* Search, ATS filter, template filter, sort bar */}
        {resumes.length > 0 && (
          <div
            id="resume-hub-tools"
            className="rounded-2xl border border-border bg-surface p-3 shadow-xs sm:p-4 min-w-0"
            data-testid="resume-list-controls"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between min-w-0">
              {/* Search input */}
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-muted" />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search resumes by title, role, or template (e.g. Cv1)..."
                  className="pl-10 pr-9 h-10 w-full text-sm bg-canvas-soft border-border rounded-xl"
                  data-testid="resume-search"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {/* Filters & Sort */}
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {/* ATS Readiness Filter */}
                <select
                  value={atsFilter}
                  onChange={(e) => {
                    setAtsFilter(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="h-10 rounded-xl border border-border bg-canvas-soft px-3 pr-8 text-xs font-medium text-ink shadow-xs focus:border-brand-500 focus:outline-none"
                  data-testid="resume-ats-filter"
                  aria-label="Filter by ATS readiness"
                >
                  <option value="all">All ATS Scores</option>
                  <option value="ready">Ready · {ATS_READY_THRESHOLD}–100</option>
                  <option value="developing">Developing · {ATS_DEVELOPING_THRESHOLD}–{ATS_READY_THRESHOLD - 1}</option>
                  <option value="starting">Starting · 0–39%</option>
                  <option value="unscored">Unscored</option>
                </select>

                {/* Template Filter */}
                {availableTemplates.length > 1 && (
                  <select
                    value={templateFilter}
                    onChange={(e) => {
                      setTemplateFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-10 rounded-xl border border-border bg-canvas-soft px-3 pr-8 text-xs font-medium text-ink shadow-xs focus:border-brand-500 focus:outline-none"
                    data-testid="resume-template-filter"
                    aria-label="Filter by template"
                  >
                    <option value="all">All Templates</option>
                    {availableTemplates.map((t) => {
                      const meta = getTemplateMeta(t);
                      return (
                        <option key={t} value={t}>
                          {t} ({meta.name})
                        </option>
                      );
                    })}
                  </select>
                )}

                {/* Sort Dropdown */}
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="h-10 rounded-xl border border-border bg-canvas-soft px-3 pr-8 text-xs font-medium text-ink shadow-xs focus:border-brand-500 focus:outline-none"
                  data-testid="resume-sort"
                  aria-label="Sort resumes"
                >
                  <option value="updated-desc">Recently Updated</option>
                  <option value="updated-asc">Oldest Updated</option>
                  <option value="title-asc">Title (A–Z)</option>
                  <option value="title-desc">Title (Z–A)</option>
                  <option value="ats-desc">Highest ATS Score</option>
                  <option value="ats-asc">Lowest ATS Score</option>
                </select>
              </div>
            </div>

            {/* Result summary and active filter reset */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2.5 text-xs text-ink-muted min-w-0">
              <p aria-live="polite" data-testid="resume-result-summary">
                Showing <span className="font-semibold text-ink">{filteredResumes.length}</span> of{' '}
                <span className="font-semibold text-ink">{resumes.length}</span> resumes
              </p>

              {(searchQuery || atsFilter !== 'all' || templateFilter !== 'all' || sortBy !== 'updated-desc') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="h-7 text-xs font-medium text-brand-600 hover:text-brand-700 px-2"
                  data-testid="resume-clear-filters"
                >
                  Reset filters
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 5. Empty State (Zero resumes in workspace) */}
      {!error && resumes.length === 0 && (
        <Card className="rounded-2xl border-border bg-surface shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-50 border border-brand-200">
              <FileText className="size-8 text-brand-600" />
            </div>
            <h3 className="text-xl font-bold text-ink">No resumes yet</h3>
            <p className="mt-2 max-w-md text-sm text-ink-muted">
              Build your first executive resume using our AI-guided builder with 51+ high-fidelity templates. Your Master Profile Data gives it a head start!
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="md"
                onClick={() => setIsCreateDialogOpen(true)}
                className="gap-2 shadow-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white cursor-pointer"
                data-testid="create-first-resume-btn"
              >
                <Plus className="size-4" />
                <span>Create Your First Resume</span>
              </Button>
              <Button asChild variant="outline" size="md" className="gap-2 shadow-sm font-medium">
                <Link to="/dashboard/settings?tab=Profile">
                  <User className="size-4 text-brand-600" />
                  Edit Master Profile Data
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6. Filter Empty State (No resumes match filters) */}
      {!error && resumes.length > 0 && filteredResumes.length === 0 && (
        <Card className="rounded-2xl border-border bg-surface shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-canvas-soft border border-border">
              <Search className="size-6 text-ink-muted" />
            </div>
            <h3 className="text-base font-bold text-ink">No matching resumes found</h3>
            <p className="mt-1 max-w-sm text-xs text-ink-muted">
              We couldn't find any resumes matching your query. Try adjusting your search keywords or clearing filters.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="mt-4 gap-1.5"
              data-testid="resume-reset-empty"
            >
              Reset Filters
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 7. Grid View (3/4 A4 Cards with 4 Action Buttons) */}
      {viewMode === 'grid' && paginatedResumes.length > 0 && (
        <div
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-w-0"
          data-testid="resume-list"
        >
          {paginatedResumes.map((resume) => {
            const templateId = resume.template || 'Cv1';
            const meta = getTemplateMeta(templateId);
            const score = getResumeScore(resume);
            const title = resume.title || resume.name || 'Untitled Resume';
            const created = resume.createdAt || resume.created_at;
            const updated = resume.updatedAt || resume.updated_at;
            const dateStr = updated ? `Updated ${formatDate(updated)}` : created ? `Created ${formatDate(created)}` : 'Recently';

            return (
              <article
                key={resume.id}
                className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-brand-400 hover:shadow-lg min-w-0"
                data-testid="resume-card"
              >
                {/* Header: Title and Options Menu */}
                <header className="flex items-center justify-between gap-2 min-w-0">
                  <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold text-slate-900 hover:text-brand-600 transition-colors" title={title}>
                    <button
                      type="button"
                      onClick={() => handleEdit(resume)}
                      className="text-left font-bold text-slate-900 hover:text-brand-600 transition-colors truncate block w-full"
                    >
                      {title}
                    </button>
                  </h3>

                  {/* Options Menu Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none"
                        aria-label="Resume options"
                      >
                        <MoreVertical className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-50">
                      <DropdownMenuItem onClick={() => handleEdit(resume)} className="gap-2 text-xs">
                        <Edit className="size-3.5 text-brand-600" />
                        Edit in Builder
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void handleOpenPreview(resume)} className="gap-2 text-xs">
                        <Eye className="size-3.5 text-indigo-600" />
                        View Full Preview
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadPdf(resume)} className="gap-2 text-xs">
                        <Download className="size-3.5 text-emerald-600" />
                        Download PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void handleDownloadDocx(resume)}
                        disabled={downloadingDocxId === resume.id}
                        className="gap-2 text-xs"
                      >
                        <FileDown className="size-3.5 text-blue-600" />
                        {downloadingDocxId === resume.id ? 'Preparing Word…' : 'Download Word (DOCX)'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setShareResume({ id: resume.id, name: title, template: templateId })}
                        className="gap-2 text-xs"
                      >
                        <Share2 className="size-3.5 text-violet-600" />
                        Share Public Link
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void handleDuplicate(resume)}
                        disabled={duplicatingId === resume.id}
                        className="gap-2 text-xs"
                      >
                        <Copy className="size-3.5 text-amber-600" />
                        {duplicatingId === resume.id ? 'Duplicating…' : 'Duplicate Resume'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenRename(resume)} className="gap-2 text-xs">
                        <FileEdit className="size-3.5 text-teal-600" />
                        Rename Resume
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(resume)}
                        className="gap-2 text-xs text-error-600 hover:bg-error-50 focus:text-error-600"
                      >
                        <Trash2 className="size-3.5 text-error-600" />
                        Delete Resume
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </header>

                {/* Subtitle row: Date + ATS Score pill */}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{dateStr}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                      bucketTone(bucketForScore(score)).border
                    } ${bucketTone(bucketForScore(score)).bg} ${bucketTone(bucketForScore(score)).text}`}
                    title={`ATS readiness score — ${bucketTone(bucketForScore(score)).label}`}
                    data-ats-bucket={bucketForScore(score)}
                  >
                    ATS: {score === null ? '—' : `${score}/100`}
                  </span>
                </div>

                {/* Visual A4 Document Thumbnail Preview */}
                <div className="relative mt-3 aspect-[3/4] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-xs">
                  <img
                    src={meta.thumbnail}
                    alt={`${meta.name} preview`}
                    className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />

                  {/* Template chip on top-left of thumbnail */}
                  <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-neutral-800 shadow-xs backdrop-blur-md">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: meta.primary }}
                      />
                      {meta.id} · {meta.name}
                    </span>
                  </div>

                  {/* Hover overlay with Preview button */}
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-neutral-950/65 opacity-0 backdrop-blur-xs transition-opacity duration-200 group-hover:opacity-100">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="bg-white/95 font-semibold text-slate-900 hover:bg-white shadow-md gap-1.5"
                      onClick={() => void handleOpenPreview(resume)}
                    >
                      <Eye className="size-3.5 text-indigo-600" />
                      Preview
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="bg-white/95 font-semibold text-slate-900 hover:bg-white shadow-md gap-1.5"
                      onClick={() => handleEdit(resume)}
                    >
                      <Edit className="size-3.5 text-brand-600" />
                      Edit
                    </Button>
                  </div>
                </div>

                {/* 4 Prominent Direct Action Buttons (Matching old layout) */}
                <div className="mt-4 flex flex-col gap-2 pt-1">
                  {/* Button 1: Edit Resume */}
                  <button
                    type="button"
                    onClick={() => handleEdit(resume)}
                    aria-label={`Edit ${title}`}
                    className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <Edit className="size-4" />
                    Edit Resume
                  </button>

                  {/* Button 2: Share Resume */}
                  <button
                    type="button"
                    onClick={() => setShareResume({ id: resume.id, name: title, template: templateId })}
                    aria-label={`Share ${title}`}
                    data-testid="resume-action-share"
                    className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition hover:bg-slate-50 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <Share2 className="size-4 text-indigo-600" />
                    Share Resume
                  </button>

                  {/* Button 3: Download PDF */}
                  <button
                    type="button"
                    onClick={() => handleDownloadPdf(resume)}
                    disabled={downloadingPdfId === resume.id}
                    aria-label={`Download PDF for ${title}`}
                    className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60"
                  >
                    <Download className="size-4" />
                    {downloadingPdfId === resume.id ? 'Preparing PDF…' : 'Download PDF'}
                  </button>

                  {/* Button 4: Download Word (DOCX) */}
                  <button
                    type="button"
                    onClick={() => void handleDownloadDocx(resume)}
                    disabled={downloadingDocxId === resume.id}
                    aria-label={`Download Word for ${title}`}
                    className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60"
                  >
                    <FileDown className="size-4" />
                    {downloadingDocxId === resume.id ? 'Preparing Word…' : 'Download Word (DOCX)'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 8. List View (Compact Executive Data Table) */}
      {viewMode === 'list' && paginatedResumes.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xs min-w-0">
          <div className="overflow-x-auto min-w-0">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-canvas-soft text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                  <th className="py-3.5 px-4">Document Title</th>
                  <th className="py-3.5 px-4">Template</th>
                  <th className="py-3.5 px-4">ATS Readiness</th>
                  <th className="py-3.5 px-4">Last Updated</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {paginatedResumes.map((resume) => {
                  const templateId = resume.template || 'Cv1';
                  const meta = getTemplateMeta(templateId);
                  const score = getResumeScore(resume);
                  const title = resume.title || resume.name || 'Untitled Resume';
                  const role = resume.occupation || resume.targetRole || '';

                  return (
                    <tr
                      key={resume.id}
                      className="hover:bg-neutral-50/70 transition-colors"
                      data-testid="resume-card"
                    >
                      {/* Document Title & Role */}
                      <td className="py-3.5 px-4 min-w-[200px]">
                        <div className="flex items-center gap-3">
                          <div className="size-9 shrink-0 overflow-hidden rounded-lg border border-border bg-neutral-100">
                            <img
                              src={meta.thumbnail}
                              alt=""
                              className="h-full w-full object-cover object-top"
                              loading="lazy"
                            />
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => handleEdit(resume)}
                              className="font-bold text-ink hover:text-brand-600 text-left truncate block max-w-xs"
                            >
                              {title}
                            </button>
                            {role && <p className="text-[11px] text-ink-muted truncate max-w-xs">{role}</p>}
                          </div>
                        </div>
                      </td>

                      {/* Template */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-canvas-soft px-2.5 py-1 text-[11px] font-medium text-ink border border-border">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: meta.primary }}
                          />
                          {meta.id} · {meta.name}
                        </span>
                      </td>

                      {/* ATS Score */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold border ${
                            bucketTone(bucketForScore(score)).bg
                          } ${bucketTone(bucketForScore(score)).text} ${bucketTone(bucketForScore(score)).border}`}
                          data-ats-bucket={bucketForScore(score)}
                        >
                          <Sparkles className="size-3" />
                          {score === null ? 'Unscored' : `${score} · ${bucketTone(bucketForScore(score)).label}`}
                        </span>
                      </td>

                      {/* Updated Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-ink-muted text-[11px]">
                        {formatDate(resume.updatedAt || resume.updated_at || resume.createdAt || resume.created_at || '')}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleOpenPreview(resume)}
                            className="h-8 px-2 text-ink-muted hover:text-brand-600"
                            title="Preview"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(resume)}
                            className="h-8 px-2 text-ink-muted hover:text-brand-600"
                            title="Edit in Builder"
                          >
                            <Edit className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShareResume({ id: resume.id, name: title, template: templateId })}
                            className="h-8 px-2 text-ink-muted hover:text-indigo-600"
                            title="Share"
                          >
                            <Share2 className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadPdf(resume)}
                            className="h-8 px-2 text-ink-muted hover:text-emerald-600"
                            title="Download PDF"
                          >
                            <Download className="size-3.5" />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="rounded-lg p-1.5 text-ink-muted hover:bg-neutral-100 hover:text-ink transition-colors"
                                aria-label="More actions"
                              >
                                <MoreVertical className="size-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => void handleDownloadDocx(resume)}
                                disabled={downloadingDocxId === resume.id}
                                className="gap-2 text-xs"
                              >
                                <FileDown className="size-3.5 text-blue-600" />
                                {downloadingDocxId === resume.id ? 'Preparing…' : 'Download DOCX'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => void handleDuplicate(resume)}
                                disabled={duplicatingId === resume.id}
                                className="gap-2 text-xs"
                              >
                                <Copy className="size-3.5 text-amber-600" />
                                Duplicate Resume
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleOpenRename(resume)}
                                className="gap-2 text-xs"
                              >
                                <FileEdit className="size-3.5 text-teal-600" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(resume)}
                                className="gap-2 text-xs text-error-600"
                              >
                                <Trash2 className="size-3.5 text-error-600" />
                                Delete Resume
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 9. Pagination Controls */}
      {filteredResumes.length > PAGE_SIZE && (
        <nav
          aria-label="Resume list pages"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 min-w-0"
          data-testid="resume-pagination"
        >
          <p className="text-xs text-ink-muted">
            Page <span className="font-semibold text-ink">{currentPage}</span> of{' '}
            <span className="font-semibold text-ink">{totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="gap-1 min-h-9"
              data-testid="resume-previous-page"
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="gap-1 min-h-9"
              data-testid="resume-next-page"
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </nav>
      )}

      {/* 10. Global Full-Fidelity PreviewModal */}
      {previewResume && (
        <PreviewModal
          open={!!previewResume}
          onOpenChange={(open) => {
            if (!open) setPreviewResume(null);
          }}
          resume={previewResume}
          onTemplateChange={(tmplId) => {
            setPreviewResume((prev: any) => (prev ? { ...prev, template: tmplId } : null));
          }}
        />
      )}

      {/* 11. Global ShareModal */}
      {shareResume && (
        <ShareModal
          open={!!shareResume}
          onOpenChange={(open) => {
            if (!open) setShareResume(null);
          }}
          resumeId={shareResume.id}
          resumeName={shareResume.name}
          templateId={shareResume.template}
        />
      )}

      {/* 12. Accessible Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md sm:rounded-2xl" data-testid="dashboard-resumes-delete-modal">
          <DialogHeader className="gap-2">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-error-50 border border-error-200 text-error-600">
              <Trash2 className="size-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-ink">Delete resume?</DialogTitle>
            <DialogDescription className="text-sm text-ink-muted">
              <span className="font-semibold text-ink">"{deleteTarget?.title || deleteTarget?.name || 'This resume'}"</span> will be permanently removed from your workspace. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className="font-medium"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={handleConfirmDelete}
              className="gap-1.5 font-semibold"
            >
              <Trash2 className="size-3.5" />
              {deleting ? 'Deleting…' : 'Delete Resume'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 13. Accessible Rename Dialog */}
      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open && !renaming) setRenameTarget(null);
        }}
      >
        <DialogContent className="max-w-md sm:rounded-2xl" data-testid="dashboard-resumes-rename-modal">
          <DialogHeader className="gap-2">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 border border-brand-200 text-brand-600">
              <FileEdit className="size-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-ink">Rename Resume</DialogTitle>
            <DialogDescription className="text-sm text-ink-muted">
              Choose a clear, descriptive name for your resume draft.
            </DialogDescription>
          </DialogHeader>

          <div className="my-2 space-y-2">
            <Input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="e.g. Senior Product Designer — 2026"
              className="h-10 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveRename();
                }
              }}
            />
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={renaming}
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={renaming || !renameValue.trim()}
              onClick={handleSaveRename}
              className="font-semibold gap-1.5"
            >
              {renaming ? 'Saving…' : 'Save Title'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 14. Executive Create Resume Dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      >
        <DialogContent className="max-w-lg sm:rounded-3xl p-6 border-border bg-surface shadow-2xl" data-testid="dashboard-resumes-create-modal">
          <DialogHeader className="gap-2">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 border border-brand-200 text-brand-600">
              <Sparkles className="size-5" />
            </div>
            <DialogTitle className="text-xl font-bold text-ink">Create New Resume</DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Choose how you'd like to jumpstart your executive resume draft.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="create-resume-title-input" className="block text-xs font-bold text-ink mb-1.5">
                Resume Title / Target Role
              </label>
              <Input
                id="create-resume-title-input"
                type="text"
                value={newResumeTitle}
                onChange={(e) => setNewResumeTitle(e.target.value)}
                placeholder="e.g. Senior Software Architect — 2026"
                className="h-10 text-sm"
                data-testid="create-resume-title-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLaunchCreatedResume();
                  }
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-2">
                Starting Strategy
              </label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setNewResumeMode('profile')}
                  className={cn(
                    'p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5',
                    newResumeMode === 'profile'
                      ? 'border-brand-600 bg-brand-50/60 ring-2 ring-brand-500/20 text-brand-900'
                      : 'border-border bg-surface hover:bg-neutral-50 text-ink-muted'
                  )}
                  data-testid="create-mode-profile"
                >
                  <div className="flex items-center justify-between w-full">
                    <User className="size-4 text-brand-600" />
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-800">
                      Recommended
                    </span>
                  </div>
                  <div className="text-xs font-bold text-ink">Master Profile</div>
                  <p className="text-[10px] text-ink-subtle leading-tight">Pre-fill contact info, work history & skills</p>
                </button>

                <button
                  type="button"
                  onClick={() => setNewResumeMode('template')}
                  className={cn(
                    'p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5',
                    newResumeMode === 'template'
                      ? 'border-brand-600 bg-brand-50/60 ring-2 ring-brand-500/20 text-brand-900'
                      : 'border-border bg-surface hover:bg-neutral-50 text-ink-muted'
                  )}
                  data-testid="create-mode-template"
                >
                  <div className="flex items-center justify-between w-full">
                    <Layers className="size-4 text-indigo-600" />
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                      51 Styles
                    </span>
                  </div>
                  <div className="text-xs font-bold text-ink">Template First</div>
                  <p className="text-[10px] text-ink-subtle leading-tight">Pick from 51 A4 executive designs</p>
                </button>

                <button
                  type="button"
                  onClick={() => setNewResumeMode('blank')}
                  className={cn(
                    'p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5',
                    newResumeMode === 'blank'
                      ? 'border-brand-600 bg-brand-50/60 ring-2 ring-brand-500/20 text-brand-900'
                      : 'border-border bg-surface hover:bg-neutral-50 text-ink-muted'
                  )}
                  data-testid="create-mode-blank"
                >
                  <div className="flex items-center justify-between w-full">
                    <FileText className="size-4 text-neutral-600" />
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                      Clean
                    </span>
                  </div>
                  <div className="text-xs font-bold text-ink">Blank Draft</div>
                  <p className="text-[10px] text-ink-subtle leading-tight">Start fresh with empty canvas</p>
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6 gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleLaunchCreatedResume}
              className="font-bold gap-1.5 bg-brand-600 hover:bg-brand-700 text-white"
              data-testid="launch-created-resume-btn"
            >
              <span>Launch Builder</span>
              <ArrowRight className="size-3.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatDate(dateString: string): string {
  try {
    if (!dateString) return 'Recently';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Recently';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Recently';
  }
}
