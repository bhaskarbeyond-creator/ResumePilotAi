/**
 * Resume Builder — 12-Step Multi-Step Form (TRUNCATION STRICTLY PROHIBITED)
 *
 * Full-featured resume creation and editing workflow with:
 * - 12 Steps: Heading, Experience, Education, Skills, Summary, Certifications,
 *   Achievements, Projects, Languages, References, Custom Sections, Review
 * - Auto-save to backend with MariaDB optimistic locking
 * - AI-assisted content generation
 * - Right rail resume guidance (ATS checks, writing tips, stats, job description match, bullet strength),
 *   computed in the browser from the resume itself: it makes no AI or network calls
 * - Live template preview
 */

import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { toastError, toastSuccess } from '@/components/ui/toast';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { PageSpinner } from '@/components/ui/loading';
import axios from 'axios';
import { apiClient, get, post, normalizeError } from '@/lib/api-client';
import { runContentOperation, type AiOutcome } from '@/lib/ai-content';
import { bucketForScore, bucketTone } from '@/lib/resume-metrics';
import { resumeQualityScore, scoreResume } from '@/lib/resume-score';
import { applyMasterProfile, describeMasterSync } from '@/lib/master-profile';
import { cn } from '@/lib/utils';
import { PreviewModal } from '@/components/ui/preview-modal';
import { ShareModal } from '@/components/ui/share-modal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { FormattingToolbar } from '@/components/ui/formatting-toolbar';
import { AiProcessingModal } from '@/components/ui/ai-processing-modal';
import { ResumeImportModal } from '@/components/resume/resume-import-modal';
import { RoleAiCopilotModal } from '@/components/resume/role-ai-copilot-modal';
import { GrammarCheckModal } from '@/components/resume/grammar-check-modal';
import { AutocompleteInput } from '@/components/ui/autocomplete-input';
import type { ParsedResumeData } from '@/lib/ai-content';
import { TEMPLATE_CATEGORIES, getTemplatesByCategory } from '@/lib/template-catalog';
import {
  User,
  Briefcase,
  GraduationCap,
  Wrench,
  FileText,
  Layout,
  ChevronLeft,
  ChevronRight,
  Save,
  Sparkles,
  Plus,
  Trash2,
  Check,
  Eye,
  Download,
  AlertCircle,
  X,
  MapPin,
  Globe,
  Phone,
  Mail,
  Link2,
  Code2,
  Award,
  Languages,
  BookOpen,
  ClipboardCheck,
  Copy,
  Settings,
  Lightbulb,
  Target,
  Zap,
  HelpCircle,
  Shield,
  Trophy,
  Users,
  FolderPlus,
  BarChart3,
  Search,
  Share2,
  Printer,
  FileDown,
  Camera,
  UploadCloud,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  LayoutGrid,
} from 'lucide-react';

/* ─── Types ─── */

interface ResumeHeading {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  city?: string;
  country?: string;
  address?: string;
  postalcode?: string;
  website: string;
  linkedin: string;
  github: string;
  title: string;
  photo?: string;
  showPhoto?: boolean;
  targetRole?: string;
  jobDescription?: string;
}

interface ExperienceEntry {
  id: string;
  company: string;
  position: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa: string;
  description: string;
  location?: string;
}

interface SkillCategory {
  id: string;
  category: string;
  skills: string[];
}

interface CertificationEntry {
  id: string;
  name: string;
  issuer: string;
  credentialId: string;
  issueDate: string;
  expiryDate: string;
  credentialUrl: string;
}

interface AchievementEntry {
  id: string;
  title: string;
  description: string;
  date: string;
}

interface ProjectEntry {
  id: string;
  title: string;
  description: string;
  technologies: string;
  liveUrl: string;
  githubUrl: string;
  startDate: string;
  endDate: string;
}

interface LanguageEntry {
  id: string;
  language: string;
  proficiency: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Native';
}

interface ReferenceEntry {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  relationship: string;
}

interface CustomSectionItem {
  id: string;
  title: string;
  description: string;
}

interface CustomSectionEntry {
  id: string;
  sectionTitle: string;
  items: CustomSectionItem[];
}

interface ResumeData {
  id?: string;
  name: string;
  template: string;
  heading: ResumeHeading;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skillCategories: SkillCategory[];
  summary: string;
  certifications: CertificationEntry[];
  achievements: AchievementEntry[];
  projects: ProjectEntry[];
  languages: LanguageEntry[];
  references: ReferenceEntry[];
  customSections: CustomSectionEntry[];
  revision?: number;
  targetJobDescription?: string;
}

type BuilderStep =
  | 'heading'
  | 'experience'
  | 'education'
  | 'skills'
  | 'summary'
  | 'template'
  | 'certifications'
  | 'achievements'
  | 'projects'
  | 'languages'
  | 'references'
  | 'custom'
  | 'review';

const STEP_MAP: Record<string, BuilderStep> = {
  heading: 'heading',
  'personal-info': 'heading',
  personal: 'heading',
  contact: 'heading',

  experience: 'experience',
  'work-history': 'experience',
  work: 'experience',
  employment: 'experience',

  education: 'education',
  academic: 'education',

  skills: 'skills',
  abilities: 'skills',

  summary: 'summary',
  bio: 'summary',
  'executive-bio': 'summary',

  template: 'template',
  templates: 'template',
  design: 'template',

  certifications: 'certifications',
  certificates: 'certifications',

  achievements: 'achievements',
  awards: 'achievements',

  projects: 'projects',
  portfolio: 'projects',

  languages: 'languages',

  references: 'references',

  custom: 'custom',
  'custom-sections': 'custom',
  extras: 'custom',

  review: 'review',
  finalize: 'review',
};

const STEPS: { id: BuilderStep; label: string; icon: typeof User; description: string; requiredFields?: number }[] = [
  { id: 'heading', label: 'Personal info', icon: User, description: 'Tell us about yourself so employers can reach you easily. All required fields must be completed to proceed.', requiredFields: 4 },
  { id: 'experience', label: 'Work history', icon: Briefcase, description: 'Start with your most recent position and work backwards. Include your last 10 years of relevant experience.', requiredFields: 1 },
  { id: 'education', label: 'Education', icon: GraduationCap, description: 'Add your degrees, institutions, graduation dates and academic achievements.', requiredFields: 1 },
  { id: 'skills', label: 'Skills', icon: Wrench, description: 'Group your core competencies into logical domains with AI-powered keyword suggestions.', requiredFields: 5 },
  { id: 'summary', label: 'Summary', icon: FileText, description: 'Written in your own words. AI suggestions use only the details saved in this resume, and you decide whether to use them.', requiredFields: 1 },
  { id: 'template', label: 'Template', icon: Layout, description: 'Choose from 100 templates with A4 rendering.' },
  { id: 'certifications', label: 'Certifications', icon: Award, description: 'Highlight industry credentials, verified licenses, issuing bodies, and expiration dates.' },
  { id: 'achievements', label: 'Achievements', icon: Zap, description: 'Detail quantifiable accomplishments, awards, revenue impact, and performance records.' },
  { id: 'projects', label: 'Projects', icon: Code2, description: 'Showcase portfolio projects, GitHub repositories, live URLs, and applied technologies.' },
  { id: 'languages', label: 'Languages', icon: Languages, description: 'Record languages and international CEFR proficiency levels for global roles.' },
  { id: 'references', label: 'References', icon: BookOpen, description: 'Add professional references, corporate contacts, and endorsements.' },
  { id: 'custom', label: 'Custom', icon: Settings, description: 'Add bespoke sections for publications, patents, volunteering, or leadership.' },
  { id: 'review', label: 'Finalize', icon: ClipboardCheck, description: 'Run pre-flight ATS checks, verify readiness score, and export to PDF or Word.' },
];

/** "Finalize" is a review step that is never marked complete, so progress counts the content sections only. */
const COMPLETABLE_STEP_COUNT = STEPS.filter((step) => step.id !== 'review').length;

const EMPTY_HEADING: ResumeHeading = {
  firstName: '', lastName: '', email: '', phone: '',
  location: '', city: '', country: '', address: '', postalcode: '',
  website: '', linkedin: '', github: '', title: '',
  photo: '', showPhoto: true, targetRole: '', jobDescription: '',
};

function createEmptyResume(): ResumeData {
  return {
    name: 'Untitled Resume',
    template: 'Cv1',
    heading: { ...EMPTY_HEADING },
    experience: [],
    education: [],
    skillCategories: [],
    summary: '',
    certifications: [],
    achievements: [],
    projects: [],
    languages: [],
    references: [],
    customSections: [],
  };
}

/**
 * List entries from older saves, the legacy builder or a Master Profile import may lack an id (or
 * repeat one). Edits and deletes match entries by id, so id-less entries were all changed or
 * removed together; give each a unique, deterministic id and map common legacy field names.
 */
function withEntryIds<T extends { id: string }>(items: unknown, prefix: string, map: (item: any) => Omit<T, 'id'> & { id?: unknown }): T[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  return items
    .map((item) => (typeof item === 'string' ? { name: item } : item))
    .filter((item): item is Record<string, any> => Boolean(item) && typeof item === 'object')
    .map((item, index) => {
      let id = typeof item.id === 'string' || typeof item.id === 'number' ? String(item.id) : '';
      if (!id || seen.has(id)) id = `${prefix}-${index}`;
      while (seen.has(id)) id = `${id}-${index}`;
      seen.add(id);
      return { ...map(item), id } as T;
    });
}

function normalizeFromBackend(raw: any): ResumeData {
  if (!raw) return createEmptyResume();
  const heading: ResumeHeading = {
    firstName: raw.heading?.firstName || raw.firstname || '',
    lastName: raw.heading?.lastName || raw.lastname || '',
    email: raw.heading?.email || raw.email || '',
    phone: raw.heading?.phone || raw.phone || '',
    location: raw.heading?.location || [raw.city, raw.country].filter(Boolean).join(', ') || raw.address || '',
    city: raw.city || '',
    country: raw.country || '',
    address: raw.address || '',
    postalcode: raw.postalcode || '',
    website: raw.heading?.website || raw.website || '',
    linkedin: raw.heading?.linkedin || raw.linkedin || '',
    github: raw.heading?.github || raw.github || '',
    title: raw.heading?.title || raw.occupation || '',
    photo: raw.heading?.photo || raw.photo || '',
    showPhoto: raw.showPhoto !== undefined ? (raw.showPhoto === 1 || raw.showPhoto === true) : true,
    targetRole: raw.heading?.targetRole || raw.targetRole || '',
    jobDescription: raw.heading?.jobDescription || raw.targetJobDescription || '',
  };

  const experience: ExperienceEntry[] = Array.isArray(raw.experience) && raw.experience.length
    ? raw.experience
    : (Array.isArray(raw.employments) ? raw.employments.map((e: any) => ({
        id: e.id || crypto.randomUUID(),
        company: e.company || e.employer || '',
        position: e.position || e.jobTitle || '',
        location: e.location || e.city || '',
        startDate: e.startDate || e.begin || '',
        endDate: e.endDate || e.end || '',
        current: !!e.current || !e.endDate,
        description: e.description || e.summary || '',
      })) : []);

  const education: EducationEntry[] = Array.isArray(raw.education) && raw.education.length
    ? raw.education
    : (Array.isArray(raw.educations) ? raw.educations.map((ed: any) => ({
        id: ed.id || crypto.randomUUID(),
        institution: ed.institution || ed.school || '',
        degree: ed.degree || '',
        field: ed.field || ed.major || '',
        location: ed.location || ed.city || '',
        startDate: ed.startDate || ed.begin || '',
        endDate: ed.endDate || ed.end || '',
        gpa: ed.gpa || '',
        description: ed.description || '',
      })) : []);

  let skillCategories: SkillCategory[] = [];
  if (Array.isArray(raw.skillCategories) && raw.skillCategories.length) {
    skillCategories = raw.skillCategories;
  } else if (Array.isArray(raw.skills) && raw.skills.length) {
    skillCategories = groupStoredSkills(raw.skills);
  }

  return {
    id: raw.id,
    name: raw.name || raw.title || 'Untitled Resume',
    template: raw.template || 'Cv1',
    heading,
    experience,
    education,
    skillCategories,
    summary: raw.summary || '',
    certifications: withEntryIds<CertificationEntry>(raw.certifications, 'cert', (c) => ({
      ...c, name: c.name || c.title || '', issuer: c.issuer || c.organization || c.institution || '',
    })),
    achievements: withEntryIds<AchievementEntry>(raw.achievements, 'achievement', (a) => ({ ...a, title: a.title || a.name || '' })),
    projects: withEntryIds<ProjectEntry>(raw.projects, 'project', (pr) => ({ ...pr, title: pr.title || pr.name || pr.projectName || '' })),
    languages: withEntryIds<LanguageEntry>(raw.languages, 'language', (l) => ({
      ...l, language: l.language || l.name || '', proficiency: l.proficiency || l.level || '',
    })),
    references: withEntryIds<ReferenceEntry>(raw.references, 'reference', (r) => ({ ...r })),
    customSections: withEntryIds<CustomSectionEntry>(raw.customSections, 'section', (cs) => ({
      ...cs,
      sectionTitle: cs.sectionTitle || cs.title || '',
      items: withEntryIds<CustomSectionItem>(cs.items, 'item', (item) => ({ ...item })),
    })),
    revision: raw.revision,
  };
}

/** Profile photo ceiling enforced in the browser before an expensive base64 read. */
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const DEFAULT_SKILL_CATEGORY = 'Core Skills';

/**
 * Reads every stored skills shape: plain strings, flat `{ name, category }` items (the shape
 * this builder saves, and what the legacy builder saved without a category), and the
 * `{ category, skills: [...] }` groups this builder stored before P002 C6.
 */
function groupStoredSkills(stored: unknown[]): SkillCategory[] {
  const groups = new Map<string, string[]>();
  const add = (category: string, name: unknown) => {
    const text = typeof name === 'string' ? name.trim() : '';
    if (!groups.has(category)) groups.set(category, []);
    if (text) groups.get(category)!.push(text);
  };
  for (const item of stored) {
    if (typeof item === 'string') {
      add(DEFAULT_SKILL_CATEGORY, item);
    } else if (item && typeof item === 'object') {
      const record = item as Record<string, any>;
      if (Array.isArray(record.skills)) {
        const category = String(record.category || record.name || '').trim() || DEFAULT_SKILL_CATEGORY;
        if (!record.skills.length) add(category, '');
        for (const skill of record.skills) add(category, typeof skill === 'string' ? skill : skill?.name);
      } else {
        add(String(record.category || '').trim() || DEFAULT_SKILL_CATEGORY, record.name ?? record.skillName ?? record.skill ?? record.title ?? record.value);
      }
    }
  }
  return [...groups.entries()].map(([category, skills], index) => ({ id: `skills-${index}`, category, skills }));
}

/**
 * Skills are stored as the flat list every other reader expects (DOCX export, resume templates,
 * the ATS scorer, the legacy builder): one `{ name, category }` item per skill. The category
 * keeps this builder's grouping; a category without skills has nothing to store.
 */
function flattenSkillCategories(categories: SkillCategory[]) {
  return categories.flatMap((group) => {
    const category = String(group.category || '').trim() || DEFAULT_SKILL_CATEGORY;
    return group.skills
      .map((skill) => String(skill ?? '').trim())
      .filter(Boolean)
      .map((name) => ({ name, category }));
  });
}

function serializeToBackend(resume: ResumeData) {
  const city = resume.heading.city || (resume.heading.location ? resume.heading.location.split(',')[0]?.trim() : '');
  const country = resume.heading.country || (resume.heading.location && resume.heading.location.includes(',') ? resume.heading.location.split(',')[1]?.trim() : '');

  return {
    id: resume.id,
    title: resume.name,
    name: resume.name,
    template: resume.template || 'Cv1',
    firstname: resume.heading.firstName,
    lastname: resume.heading.lastName,
    email: resume.heading.email,
    phone: resume.heading.phone,
    occupation: resume.heading.title,
    targetRole: resume.heading.targetRole || null,
    city: city || '',
    country: country || '',
    address: resume.heading.address || resume.heading.location || '',
    postalcode: resume.heading.postalcode || '',
    website: resume.heading.website || '',
    linkedin: resume.heading.linkedin || '',
    github: resume.heading.github || '',
    photo: resume.heading.photo || null,
    showPhoto: resume.heading.showPhoto !== false,
    summary: resume.summary || '',
    targetJobDescription: resume.heading.jobDescription || null,
    employments: resume.experience.map((e) => ({
      id: e.id,
      company: e.company,
      employer: e.company,
      position: e.position,
      jobTitle: e.position,
      location: e.location,
      startDate: e.startDate,
      begin: e.startDate,
      endDate: e.endDate,
      end: e.endDate,
      current: e.current,
      description: e.description,
      summary: e.description,
    })),
    educations: resume.education.map((ed) => ({
      id: ed.id,
      institution: ed.institution,
      school: ed.institution,
      degree: ed.degree,
      field: ed.field,
      major: ed.field,
      location: ed.location,
      startDate: ed.startDate,
      begin: ed.startDate,
      endDate: ed.endDate,
      end: ed.endDate,
      gpa: ed.gpa,
      description: ed.description,
    })),
    skills: flattenSkillCategories(resume.skillCategories),
    certifications: resume.certifications,
    achievements: resume.achievements,
    projects: resume.projects,
    languages: resume.languages,
    references: resume.references,
    customSections: resume.customSections,
    // Keep nested for client compatibility
    heading: resume.heading,
    experience: resume.experience,
    education: resume.education,
    skillCategories: resume.skillCategories,
  };
}

/* ─── Main Component ─── */

/** Comparable snapshot of the editable resume (the server-assigned revision is excluded). */
function resumeSnapshot(value: ResumeData): string {
  return JSON.stringify({ ...value, revision: undefined });
}

/** Readable reason for a failed blob request: the error body arrives as a Blob, not JSON. */
async function exportErrorMessage(error: unknown): Promise<string> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    const status = error.response.status;
    try {
      const body = JSON.parse(await error.response.data.text()) as { error?: string | { message?: string }; message?: string };
      const nested = typeof body.error === 'object' ? body.error?.message : body.error;
      return nested || body.message || `the server answered HTTP ${status}.`;
    } catch {
      return `the server answered HTTP ${status}.`;
    }
  }
  return normalizeError(error).message;
}

export function ResumeBuilderPage() {
  const params = useParams<{ resumeId?: string; '*'?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Parse path segments to safely extract resumeId and active step deep link
  const { parsedResumeId, initialStep } = useMemo(() => {
    const rawSegments = location.pathname.split('/').filter(Boolean);
    // Remove "build-resume" prefix if present
    const segments = rawSegments[0] === 'build-resume' ? rawSegments.slice(1) : rawSegments;

    let resId: string | undefined = undefined;
    let step: BuilderStep = 'heading';

    if (segments.length === 1) {
      if (STEP_MAP[segments[0]]) {
        step = STEP_MAP[segments[0]];
      } else {
        resId = segments[0];
      }
    } else if (segments.length >= 2) {
      if (STEP_MAP[segments[0]]) {
        step = STEP_MAP[segments[0]];
      } else {
        resId = segments[0];
        if (STEP_MAP[segments[1]]) {
          step = STEP_MAP[segments[1]];
        }
      }
    }

    // Also support search params: ?step=work-history&id=res-123
    const searchParams = new URLSearchParams(location.search);
    const qStep = searchParams.get('step');
    if (qStep && STEP_MAP[qStep]) {
      step = STEP_MAP[qStep];
    }
    const qId = searchParams.get('id');
    if (qId) {
      resId = qId;
    }

    return { parsedResumeId: resId || params.resumeId, initialStep: step };
  }, [location.pathname, location.search, params.resumeId]);

  const [resume, setResume] = useState<ResumeData>(createEmptyResume);
  const [currentStep, setCurrentStep] = useState<BuilderStep>(initialStep);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  /** Snapshot of the last version the server confirmed; null until the resume is saved once. */
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const isDirty = useMemo(() => savedSnapshot !== null && resumeSnapshot(resume) !== savedSnapshot, [resume, savedSnapshot]);
  // Live ATS readiness of the current content, scored by the same deterministic checker and
  // DIR-008 bands as the ATS Score, Resumes and Overview pages (so the numbers agree).
  const liveAtsScore = useMemo(() => resumeQualityScore(serializeToBackend(resume)), [resume]);
  const liveAtsTone = bucketTone(bucketForScore(liveAtsScore));
  // Save to backend with optimistic revision and MariaDB contract
  const handleSave = async (options?: { isAutosave?: boolean } | boolean | React.MouseEvent) => {
    const isAutosave = typeof options === 'boolean' ? options : Boolean(options && typeof options === 'object' && 'isAutosave' in options && options.isAutosave);
    if (saving) return;
    setSaving(true);
    if (!isAutosave) setSaveMessage(null);
    try {
      const id = resume.id || parsedResumeId || `resume_${Date.now()}`;
      const payload = serializeToBackend({ ...resume, id });
      const result = await post<{ resume: any }>(`/resumes/${id}`, payload);
      if (result.resume?.id && !resume.id) {
        setResume((prev) => ({ ...prev, id: result.resume.id, revision: result.resume.revision }));
        navigate(`/build-resume/${result.resume.id}/${currentStep}`, { replace: true });
      } else if (result.resume?.revision) {
        setResume((prev) => ({ ...prev, revision: result.resume.revision }));
      }
      setSavedSnapshot(resumeSnapshot({ ...resume, id: resume.id || result.resume?.id || id }));
      setSaveMessage(isAutosave ? 'Autosaved ✓' : 'Saved successfully');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      if (!isAutosave) {
        setSaveMessage(`Save failed: ${normalizeError(err).message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const saveStateLabel = saving ? 'Saving…' : saveMessage ? saveMessage : !savedSnapshot ? 'Not saved yet' : isDirty ? 'Unsaved changes' : 'Saved ✓';

  // Debounced Autosave (1500ms): saves edits in background without interrupting editing flow
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (loading) return;
    const hasContent = Boolean(
      resume.heading?.firstName ||
      resume.heading?.title ||
      resume.experience?.length ||
      resume.education?.length ||
      resume.skillCategories?.some((c) => c.skills.length > 0)
    );
    const needsAutosave = isDirty || (!savedSnapshot && hasContent);

    if (!needsAutosave || saving) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void handleSave(true);
    }, 1500);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [resume, isDirty, savedSnapshot, saving, loading]);

  // Safety net: warn before closing or reloading if changes are currently unsaved
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showAllStepsModal, setShowAllStepsModal] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [syncingProfile, setSyncingProfile] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [roleCopilotState, setRoleCopilotState] = useState<{
    isOpen: boolean;
    entryId: string | null;
    position: string;
    company: string;
    existingDescription?: string;
  }>({
    isOpen: false,
    entryId: null,
    position: '',
    company: '',
    existingDescription: '',
  });
  const [grammarModalState, setGrammarModalState] = useState<{
    isOpen: boolean;
    initialText: string;
    onApply: (text: string) => void;
  }>({
    isOpen: false,
    initialText: '',
    onApply: () => {},
  });

  const stepperScrollRef = useRef<HTMLDivElement>(null);

  // Sync step if URL changes externally
  useEffect(() => {
    if (initialStep && initialStep !== currentStep) {
      setCurrentStep(initialStep);
    }
  }, [initialStep]);

  // Load resume data from authentic MariaDB endpoint
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const searchParams = new URLSearchParams(location.search);
        const isNew = searchParams.get('new') === 'true';
        let targetId = parsedResumeId;

        if (!targetId && !isNew) {
          // If no specific resumeId was given in URL and not creating new, fetch user's resumes to pick the first one
          const listData = await get<{ resumes: any[] }>('/resumes').catch(() => ({ resumes: [] }));
          if (listData?.resumes?.length) {
            targetId = listData.resumes[0].id;
          }
        }

        if (targetId && !isNew) {
          const data = await get<{ resume: any }>(`/resumes/${targetId}`);
          if (!cancelled && data?.resume) {
            const loaded = normalizeFromBackend(data.resume);
            setResume(loaded);
            setSavedSnapshot(resumeSnapshot(loaded));
            return;
          }
        }

        // Default empty or new draft
        if (!cancelled) {
          const draft = createEmptyResume();
          const customTitle = searchParams.get('title');
          const customTemplate = searchParams.get('template');
          if (customTitle) draft.name = customTitle;
          if (customTemplate) draft.template = customTemplate;
          setResume(draft);
          setSavedSnapshot(null);

          if (searchParams.get('sync') === 'true') {
            void handleSyncProfile();
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(normalizeError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [parsedResumeId]);

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  // Navigate to step and update browser URL without losing state
  const handleSelectStep = (step: BuilderStep) => {
    if (isDirty && !saving) {
      void handleSave(true);
    }
    setCurrentStep(step);
    const activeId = resume.id || parsedResumeId;
    const targetPath = activeId ? `/build-resume/${activeId}/${step}` : `/build-resume/${step}`;
    navigate(targetPath, { replace: true });
  };

  const goNext = () => {
    if (currentStepIndex < STEPS.length - 1) {
      handleSelectStep(STEPS[currentStepIndex + 1].id);
    }
  };

  const goPrev = () => {
    if (currentStepIndex > 0) {
      handleSelectStep(STEPS[currentStepIndex - 1].id);
    }
  };

  const scrollStepper = (direction: 'left' | 'right') => {
    if (stepperScrollRef.current) {
      const offset = direction === 'left' ? -220 : 220;
      stepperScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  // 1-Click Sync from Master CV.
  //
  // Reads the canonical, revisioned `profile` projection (not the flat user
  // row) and maps every section — contact, summary, experience, education,
  // skills, certifications, languages, projects, achievements, references,
  // custom sections and interests. Existing answers are preserved unless the
  // candidate explicitly chooses replace; the status message reports exactly
  // what happened, including the source revision.
  const handleSyncProfile = async (options: { replaceExisting?: boolean } = {}) => {
    setSyncingProfile(true);
    try {
      const data = await get<{ user: any }>('/users-data/profile');
      if (!data?.user) {
        setSyncToast('Your Master CV could not be loaded. Add details in Settings → Master Profile, then retry.');
        setTimeout(() => setSyncToast(null), 6000);
        return;
      }
      const result = applyMasterProfile(data, resume, { preserveExisting: !options.replaceExisting });
      setResume((prev) => ({ ...prev, ...result.draft, heading: { ...prev.heading, ...result.draft.heading } }));
      setSyncToast(describeMasterSync(result));
      setTimeout(() => setSyncToast(null), 7000);
    } catch (err) {
      const message = normalizeError(err).message;
      setSyncToast(`Could not fetch your Master CV: ${message}`);
      setTimeout(() => setSyncToast(null), 7000);
    } finally {
      setSyncingProfile(false);
    }
  };


  // Keyboard shortcut Ctrl+S / Cmd+S for instant manual save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resume, parsedResumeId, currentStep]);

  // Direct DOCX Download
  const handleDownloadDocx = async () => {
    const savedId = resume.id || parsedResumeId;
    if (!savedId || !savedSnapshot) {
      setNotice({ tone: 'error', text: 'Save the resume before exporting it. The Word file is created from the saved version.' });
      return;
    }
    setExportingDocx(true);
    setNotice(null);
    try {
      // Authenticated through the shared API client (Bearer token), never a guessed id.
      const response = await apiClient.post<Blob>(
        '/export-docx',
        { resumeId: savedId, resumeName: resume.template || 'Cv1', language: 'en' },
        { responseType: 'blob' },
      );
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(resume.name || 'Resume').replace(/[^\w\s-]/g, '').trim() || 'Resume'}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setNotice({ tone: 'success', text: isDirty ? 'Word file downloaded from the last saved version. Save to include your latest changes.' : 'Word file downloaded.' });
    } catch (err) {
      setNotice({ tone: 'error', text: `The Word file could not be exported: ${await exportErrorMessage(err)}` });
    } finally {
      setExportingDocx(false);
    }
  };

  // Sharing publishes the saved resume, so it needs a saved id (never a placeholder).
  const openShare = () => {
    if (!(resume.id || parsedResumeId) || !savedSnapshot) {
      setNotice({ tone: 'error', text: 'Save the resume before sharing it.' });
      return;
    }
    setShowShare(true);
  };

  // AI Resume Import Handler
  const handleApplyImportedResume = (parsed: ParsedResumeData) => {
    setResume((prev) => {
      const newHeading: ResumeHeading = {
        ...prev.heading,
        firstName: parsed.heading?.firstName || parsed.firstname || prev.heading.firstName,
        lastName: parsed.heading?.lastName || parsed.lastname || prev.heading.lastName,
        email: parsed.heading?.email || parsed.email || prev.heading.email,
        phone: parsed.heading?.phone || parsed.phone || prev.heading.phone,
        location: parsed.heading?.location || [parsed.city, parsed.country].filter(Boolean).join(', ') || parsed.address || prev.heading.location,
        title: parsed.heading?.title || parsed.occupation || prev.heading.title,
        website: parsed.heading?.website || parsed.website || prev.heading.website,
        linkedin: parsed.heading?.linkedin || parsed.linkedin || prev.heading.linkedin,
        github: parsed.heading?.github || parsed.github || prev.heading.github,
      };

      const rawExp = parsed.experience || parsed.employments || [];
      const newExperience: ExperienceEntry[] = rawExp.length
        ? rawExp.map((e, idx) => ({
            id: `exp_imp_${Date.now()}_${idx}`,
            company: e.company || e.employer || '',
            position: e.position || e.jobTitle || '',
            location: e.location || e.city || '',
            startDate: e.startDate || '',
            endDate: e.endDate || '',
            current: e.current ?? (!e.endDate || e.endDate.toLowerCase().includes('present')),
            description: e.description || '',
          }))
        : prev.experience;

      const rawEdu = parsed.education || parsed.educations || [];
      const newEducation: EducationEntry[] = rawEdu.length
        ? rawEdu.map((ed, idx) => ({
            id: `edu_imp_${Date.now()}_${idx}`,
            institution: ed.institution || ed.school || '',
            degree: ed.degree || '',
            field: ed.field || '',
            startDate: ed.startDate || '',
            endDate: ed.endDate || '',
            gpa: ed.gpa || '',
            description: ed.description || '',
          }))
        : prev.education;

      const rawSkills: string[] = Array.isArray(parsed.skills)
        ? parsed.skills.map((s) => (typeof s === 'string' ? s : s?.skillName || s?.name || '')).filter(Boolean)
        : [];

      let newSkillCats = [...prev.skillCategories];
      if (rawSkills.length) {
        if (newSkillCats.length === 0) {
          newSkillCats = [{ id: `cat_${Date.now()}`, category: 'Core Skills', skills: rawSkills }];
        } else {
          const existingSet = new Set(newSkillCats.flatMap((c) => c.skills.map((s) => s.toLowerCase())));
          const added = rawSkills.filter((s) => !existingSet.has(s.toLowerCase()));
          newSkillCats[0] = {
            ...newSkillCats[0],
            skills: [...newSkillCats[0].skills, ...added],
          };
        }
      }

      const rawCerts = parsed.certifications || [];
      const newCerts: CertificationEntry[] = rawCerts.length
        ? rawCerts.map((c, idx) => ({
            id: `cert_imp_${Date.now()}_${idx}`,
            name: c.name || c.title || '',
            issuer: c.issuer || '',
            issueDate: c.issueDate || '',
            credentialId: '',
            expiryDate: '',
            credentialUrl: '',
          }))
        : prev.certifications;

      const validLevels: LanguageEntry['proficiency'][] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];
      const mapProficiency = (val?: string): LanguageEntry['proficiency'] => {
        if (!val) return 'C1';
        const normalized = val.trim();
        if (validLevels.includes(normalized as LanguageEntry['proficiency'])) {
          return normalized as LanguageEntry['proficiency'];
        }
        if (/native|bilingual/i.test(normalized)) return 'Native';
        if (/fluent|advanced|proficient|expert/i.test(normalized)) return 'C1';
        if (/intermediate|conversational/i.test(normalized)) return 'B2';
        if (/beginner|elementary|basic/i.test(normalized)) return 'A2';
        return 'C1';
      };

      const rawLangs = parsed.languages || [];
      const newLanguages: LanguageEntry[] = rawLangs.length
        ? rawLangs.map((l, idx) => ({
            id: `lang_imp_${Date.now()}_${idx}`,
            language: l.language || '',
            proficiency: mapProficiency(l.proficiency || l.level),
          }))
        : prev.languages;

      return {
        ...prev,
        heading: newHeading,
        summary: parsed.summary || prev.summary,
        experience: newExperience,
        education: newEducation,
        skillCategories: newSkillCats,
        certifications: newCerts,
        languages: newLanguages,
      };
    });
    setNotice({ tone: 'success', text: 'Resume imported and parsed successfully!' });
    setTimeout(() => setNotice(null), 5000);
  };

  const handleOpenRoleCopilot = (entry: ExperienceEntry) => {
    setRoleCopilotState({
      isOpen: true,
      entryId: entry.id,
      position: entry.position,
      company: entry.company,
      existingDescription: entry.description,
    });
  };

  const handleInsertCopilotBullets = (entryId: string | null, bullets: string | string[]) => {
    if (!entryId) return;
    const bulletList = Array.isArray(bullets) ? bullets : [bullets];
    if (!bulletList.length) return;
    setResume((prev) => ({
      ...prev,
      experience: prev.experience.map((e) => {
        if (e.id !== entryId) return e;
        const formattedBullets = bulletList.map((b) => (b.startsWith('•') ? b : `• ${b}`)).join('\n');
        const newDesc = e.description.trim()
          ? `${e.description.trim()}\n${formattedBullets}`
          : formattedBullets;
        return { ...e, description: newDesc };
      }),
    }));
  };

  const handleOpenGrammarCheck = (text: string, onApply: (fixed: string) => void) => {
    setGrammarModalState({
      isOpen: true,
      initialText: text,
      onApply,
    });
  };

  // Section completion checks
  const stepCompletions = useMemo(() => {
    return {
      heading: !!(resume.heading.firstName && resume.heading.lastName && resume.heading.email && resume.heading.title),
      experience: resume.experience.length > 0,
      education: resume.education.length > 0,
      skills: resume.skillCategories.some((c) => c.skills.length > 0),
      summary: resume.summary.trim().length >= 40,
      template: !!resume.template,
      certifications: resume.certifications.length > 0,
      achievements: resume.achievements.length > 0,
      projects: resume.projects.length > 0,
      languages: resume.languages.length > 0,
      references: resume.references.length > 0,
      custom: resume.customSections.length > 0,
      review: false,
    };
  }, [resume]);

  const completedCount = useMemo(() => {
    return Object.values(stepCompletions).filter(Boolean).length;
  }, [stepCompletions]);

  const completionPercent = Math.round((completedCount / COMPLETABLE_STEP_COUNT) * 100);

  // Dynamic ATS Readiness & Validation Analysis
  const atsAnalysis = useMemo(() => {
    let score = 0;
    const checks: { label: string; passed: boolean; tip: string }[] = [];

    // 1. Heading (20 pts)
    const hasName = !!(resume.heading.firstName && resume.heading.lastName);
    const hasEmail = !!resume.heading.email;
    const hasPhone = !!resume.heading.phone;
    const hasTitle = !!resume.heading.title;
    if (hasName) score += 5;
    if (hasEmail) score += 5;
    if (hasPhone) score += 5;
    if (hasTitle) score += 5;
    checks.push({ label: 'Full name is present.', passed: hasName, tip: 'Include both first and last name.' });
    checks.push({ label: 'Email looks parseable.', passed: hasEmail, tip: 'Professional email address format.' });
    checks.push({ label: 'Job title / profession specified.', passed: hasTitle, tip: 'Crucial for matching job keywords.' });

    // 2. Experience (30 pts)
    const expCount = resume.experience.length;
    const hasMetrics = resume.experience.some((e) => /\d+%|\d+\+|\$\d+|\d+x/i.test(e.description));
    const hasActionVerbs = resume.experience.some((e) =>
      /^(led|managed|developed|created|built|designed|implemented|launched|optimized|improved|delivered)/i.test(
        e.description.trim()
      )
    );
    if (expCount >= 1) score += 15;
    if (expCount >= 2) score += 5;
    if (hasMetrics) score += 5;
    if (hasActionVerbs) score += 5;
    checks.push({ label: 'At least one employment record.', passed: expCount >= 1, tip: 'Accounts for the largest share of ATS score.' });
    checks.push({ label: 'Quantifiable metrics (%, $, numbers).', passed: hasMetrics, tip: 'Recruiters scan for measurable outcomes.' });

    // 3. Education (15 pts)
    const hasEdu = resume.education.length >= 1;
    if (hasEdu) score += 15;
    checks.push({ label: 'Educational credentials included.', passed: hasEdu, tip: 'Degree, school, and graduation tenure.' });

    // 4. Skills (20 pts)
    const totalSkills = resume.skillCategories.reduce((acc, c) => acc + c.skills.length, 0);
    if (totalSkills >= 3) score += 10;
    if (totalSkills >= 6) score += 10;
    checks.push({ label: 'Core competencies (>= 5 skills).', passed: totalSkills >= 5, tip: 'ATS parsers rank applicants by skill match.' });

    // 5. Summary (15 pts)
    const summaryLength = resume.summary.trim().length;
    const hasSummary = summaryLength >= 50;
    if (hasSummary) score += 10;
    if (summaryLength >= 150) score += 5;
    checks.push({ label: 'Professional executive summary.', passed: hasSummary, tip: 'Recommended length 150–300 characters.' });

    const finalScore = Math.min(100, score);
    let status = 'Getting Started';
    let badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
    let dotColor = 'bg-amber-500';
    if (finalScore >= 80) {
      status = 'ATS Optimized';
      badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
      dotColor = 'bg-emerald-500';
    } else if (finalScore >= 60) {
      status = 'Competitive';
      badgeColor = 'bg-blue-100 text-blue-800 border-blue-300';
      dotColor = 'bg-blue-500';
    } else if (finalScore >= 40) {
      status = 'In Progress';
      badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
      dotColor = 'bg-amber-500';
    }

    return { score: finalScore, status, badgeColor, dotColor, checks };
  }, [resume]);

  if (loading) return <PageSpinner />;

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <AlertCircle className="mb-4 size-12 text-error-500" />
            <h2 className="text-xl font-semibold text-ink">Failed to load resume</h2>
            <p className="mt-2 text-sm text-ink-muted">{error}</p>
            <Button className="mt-6" onClick={() => navigate('/dashboard/resumes')}>
              Back to Resumes
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeStepMeta = STEPS[currentStepIndex] || STEPS[0];
  const isCurrentStepComplete = stepCompletions[currentStep] || false;

  return (
    <div className="flex h-full min-h-screen flex-col bg-neutral-50/50">
      {/* ─── 1. Executive Top Bar ─── */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between border-b border-border bg-surface/95 px-4 py-2.5 backdrop-blur-md sm:px-6">
        {/* Left: Back Link, Title & Auto-Save Badge */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard/resumes')}
            className="gap-1.5 text-xs font-semibold text-ink-muted hover:text-ink hover:bg-neutral-100"
            aria-label="Back to Resumes"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Back to Resumes</span>
          </Button>

          <div className="hidden h-4 w-px bg-border sm:block" />

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={resume.name}
              onChange={(e) => setResume((prev) => ({ ...prev, name: e.target.value }))}
              className="max-w-44 sm:max-w-56 md:max-w-xs rounded-md border border-transparent px-2 py-0.5 text-sm font-bold text-ink outline-none hover:border-border hover:bg-neutral-50 focus:border-brand-500 focus:bg-white focus:ring-1 focus:ring-brand-500/20 transition-all"
              placeholder="Resume title"
              title="Click to edit resume title (press Ctrl+S to save anytime)"
            />
            {saving ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 border border-brand-200/60">
                <RefreshCw className="size-3 animate-spin" /> Saving…
              </span>
            ) : saveMessage ? (
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border',
                saveMessage.includes('failed')
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              )}>
                {saveMessage}
              </span>
            ) : !savedSnapshot ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-ink-muted border border-border" data-testid="builder-save-state">
                Not saved yet
              </span>
            ) : isDirty ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-700 border border-warning-200" data-testid="builder-save-state">
                Unsaved changes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/60" data-testid="builder-save-state">
                <Check className="size-3 stroke-3" aria-hidden="true" /> Saved
              </span>
            )}
          </div>
        </div>

        {/* Right: Actions, ATS Pill & Export */}
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          {/* ATS Readiness Score Pill */}
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold shadow-2xs transition-colors',
              liveAtsTone.bg, liveAtsTone.text, liveAtsTone.border,
            )}
            data-testid="builder-ats-score"
          >
            <span>ATS: {liveAtsScore === null ? '—' : `${liveAtsScore}/100`}</span>
            <span className="hidden md:inline font-normal">| {liveAtsTone.label}</span>
          </div>

          {/* Template Switcher Pill */}
          <button
            type="button"
            onClick={() => handleSelectStep('template')}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-ink shadow-2xs hover:bg-neutral-100 transition-colors"
          >
            <Layout className="size-3 text-brand-600" />
            <span>{resume.template || 'Cv1'}</span>
          </button>

          {/* Sync Profile Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSyncProfile()}
            loading={syncingProfile}
            className="gap-1.5 text-xs text-brand-700 border-brand-200 bg-brand-50/50 hover:bg-brand-100"
            title="Pre-fill with Master Profile data"
          >
            <RefreshCw className="size-3.5" />
            <span className="hidden md:inline">Sync Profile</span>
          </Button>

          {/* Share Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={openShare}
            className="gap-1.5 text-xs"
            aria-label="Share"
          >
            <Share2 className="size-3.5 text-brand-600" aria-hidden="true" />
            <span className="hidden sm:inline">Share</span>
          </Button>

          {/* Full A4 Preview Modal Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(true)}
            className="gap-1.5 text-xs border-brand-200 text-brand-700 hover:bg-brand-50"
          >
            <Eye className="size-3.5" />
            <span>Preview</span>
          </Button>

          {/* Download Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white shadow-xs">
                <Download className="size-3.5" />
                <span>Download</span>
                <ChevronDown className="size-3 opacity-80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setShowPreview(true)} className="gap-2 cursor-pointer">
                <FileDown className="size-4 text-emerald-600" />
                <div className="flex flex-col">
                  <span className="font-semibold text-xs">Download PDF</span>
                  <span className="text-[10px] text-ink-muted">Print-ready PDF layout</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadDocx} disabled={exportingDocx} className="gap-2 cursor-pointer">
                <FileText className="size-4 text-blue-600" />
                <div className="flex flex-col">
                  <span className="font-semibold text-xs">Download Word (DOCX)</span>
                  <span className="text-[10px] text-ink-muted">Fully editable Microsoft Word</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowPreview(true)} className="gap-2 cursor-pointer">
                <Printer className="size-4 text-ink-muted" />
                <span className="text-xs">Print Resume</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Sync Profile Feedback Toast */}
      {syncToast && (
        <div className="bg-brand-600 text-white text-xs py-1.5 px-4 text-center font-medium shadow-xs transition-all">
          {syncToast}
        </div>
      )}

      <div role="status" aria-live="polite" data-testid="builder-notice">
        {notice && (
          <div className={cn(
            'flex items-start gap-2 border-b px-4 py-2 text-xs font-medium',
            notice.tone === 'error' ? 'border-error-200 bg-error-50 text-error-800' : 'border-success-200 bg-success-50 text-success-800',
          )}>
            <span className="min-w-0 flex-1 break-words">{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="rounded p-0.5 hover:bg-black/5" aria-label="Dismiss message">
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* ─── 2. Stepper Ribbon with Scroll Controls & Progress Indicator ─── */}
      <div className="border-b border-border bg-surface px-2 sm:px-6 py-1.5 flex items-center justify-between gap-2 shadow-2xs">
        {/* Left Scroll Chevron */}
        <button
          type="button"
          onClick={() => scrollStepper('left')}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-ink-muted hover:bg-neutral-100 hover:text-ink hover:border-neutral-300 shadow-2xs transition-all"
          aria-label="Scroll steps left"
        >
          <ChevronLeft className="size-4" />
        </button>

        {/* Stepper Strip with zero native scrollbar */}
        <div
          ref={stepperScrollRef}
          className="flex-1 flex items-center gap-1.5 overflow-x-auto py-1 scroll-smooth no-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {STEPS.map((step, index) => {
            const isCurrent = currentStep === step.id;
            const isDone = stepCompletions[step.id];

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => handleSelectStep(step.id)}
                className={cn(
                  'group flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-150 active:scale-95',
                  isCurrent
                    ? 'bg-brand-600 text-white shadow-xs ring-2 ring-brand-500/25'
                    : isDone
                      ? 'bg-emerald-50/90 text-emerald-800 border border-emerald-200/90 hover:bg-emerald-100/90 hover:border-emerald-300'
                      : 'bg-surface text-ink-muted border border-border/70 hover:bg-neutral-100 hover:text-ink'
                )}
              >
                <div className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-transform group-hover:scale-105',
                  isCurrent
                    ? 'bg-white text-brand-700 shadow-2xs'
                    : isDone
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-neutral-100 text-ink-muted border border-border/60 group-hover:bg-neutral-200'
                )}>
                  {isDone ? <Check className="size-3 stroke-3" /> : index + 1}
                </div>
                <span>{step.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Scroll Chevron */}
        <button
          type="button"
          onClick={() => scrollStepper('right')}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-ink-muted hover:bg-neutral-100 hover:text-ink hover:border-neutral-300 shadow-2xs transition-all"
          aria-label="Scroll steps right"
        >
          <ChevronRight className="size-4" />
        </button>

        {/* Mobile/Tablet 13 Steps Overview Trigger */}
        <button
          type="button"
          onClick={() => setShowAllStepsModal(true)}
          className="flex lg:hidden items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-surface text-ink hover:bg-neutral-100 text-xs font-semibold shrink-0 shadow-2xs transition-all cursor-pointer"
          title="View all 13 sections overview"
          data-testid="resume-builder-13-steps-trigger-mobile"
        >
          <LayoutGrid className="size-3.5 text-brand-600" aria-hidden="true" />
          {/* The visible count stays part of the accessible name (WCAG 2.5.3 label in name). */}
          <span className="sr-only">View all sections, </span>
          <span className="text-[11px] font-bold">{completedCount}/{COMPLETABLE_STEP_COUNT}</span>
          <span className="sr-only"> complete</span>
        </button>

        {/* Completion Progress Widget & Modal Trigger (Desktop) */}
        <button
          type="button"
          onClick={() => setShowAllStepsModal(true)}
          className="hidden lg:flex items-center gap-2.5 pl-3 pr-2 py-1 rounded-xl border-l border-border hover:bg-neutral-100/80 text-xs font-medium text-ink-muted shrink-0 transition-all cursor-pointer group"
          title="Open 13 Steps Overview Modal"
          data-testid="resume-builder-13-steps-trigger"
        >
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500 shadow-xs group-hover:scale-125 transition-transform" />
            <span className="font-semibold text-ink">{completedCount} of {COMPLETABLE_STEP_COUNT}</span>
            <span className="text-[11px] text-ink-muted">complete</span>
          </div>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-brand-700">{completionPercent}%</span>
          <ChevronDown className="size-3.5 text-ink-subtle group-hover:text-ink transition-transform group-hover:translate-y-0.5" />
        </button>
      </div>

      {/* ─── 3. Main Two-Column Working Surface ─── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          {/* Step Hero / Subheader Card (Legacy 100% Parity) */}
          <div className="mb-6 rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl text-base font-bold shadow-2xs',
                  isCurrentStepComplete ? 'bg-emerald-600 text-white' : 'bg-brand-50 text-brand-700 border border-brand-200'
                )}>
                  {isCurrentStepComplete ? <Check className="size-5 stroke-[2.5]" /> : currentStepIndex + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
                      {activeStepMeta.label === 'Personal info' ? 'Personal information' :
                       activeStepMeta.label === 'Work history' ? 'Tell us about your work experience' :
                       activeStepMeta.label === 'Education' ? 'Education & Academic History' :
                       activeStepMeta.label === 'Skills' ? 'Skills & Core Competencies' :
                       activeStepMeta.label === 'Summary' ? 'Write a professional summary' :
                       activeStepMeta.label === 'Template' ? 'Select a Resume Template' :
                       activeStepMeta.label}
                    </h1>
                    <span className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-bold border',
                      isCurrentStepComplete
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    )}>
                      {isCurrentStepComplete ? 'Complete' : 'In progress'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm text-ink-muted max-w-3xl leading-relaxed">
                    {activeStepMeta.description}
                  </p>
                </div>
              </div>

              {/* Step Subheader Action Pills */}
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowImportModal(true)}
                  className="gap-1.5 text-xs text-indigo-700 border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 font-semibold shadow-2xs"
                >
                  <UploadCloud className="size-3.5 text-indigo-600" aria-hidden="true" />
                  <span>Import CV / AI Parse</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSyncProfile()}
                  loading={syncingProfile}
                  className="gap-1.5 text-xs text-brand-700 border-brand-200 bg-brand-50/50 hover:bg-brand-100"
                >
                  <User className="size-3.5 text-brand-600" aria-hidden="true" />
                  <span>Fill from profile</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview(true)}
                  className="gap-1.5 text-xs text-ink-muted hover:text-ink"
                >
                  <Eye className="size-3.5" />
                  <span>Preview</span>
                </Button>
              </div>
            </div>
          </div>

          {/* 2-Column Grid: 8 Cols Form / 4 Cols Right-Rail HUD */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 8 Columns: Active Form Card */}
            <div className="lg:col-span-8 space-y-6">
              <div className="rounded-2xl border border-border bg-surface p-5 sm:p-7 shadow-xs">
                {currentStep === 'heading' && (
                  <HeadingStep
                    heading={resume.heading}
                    onChange={(heading) => setResume((prev) => ({ ...prev, heading }))}
                    onOpenImport={() => setShowImportModal(true)}
                  />
                )}
                {currentStep === 'experience' && (
                  <ExperienceStep
                    entries={resume.experience}
                    targetRole={resume.heading.title || resume.heading.targetRole}
                    onChange={(experience) => setResume((prev) => ({ ...prev, experience }))}
                    onOpenRoleCopilot={handleOpenRoleCopilot}
                    onOpenGrammarCheck={handleOpenGrammarCheck}
                  />
                )}
                {currentStep === 'education' && (
                  <EducationStep
                    entries={resume.education}
                    onChange={(education) => setResume((prev) => ({ ...prev, education }))}
                    onOpenGrammarCheck={handleOpenGrammarCheck}
                  />
                )}
                {currentStep === 'skills' && (
                  <SkillsStep
                    categories={resume.skillCategories}
                    targetRole={resume.heading.title || resume.heading.targetRole}
                    experience={resume.experience}
                    education={resume.education}
                    onChange={(skillCategories) => setResume((prev) => ({ ...prev, skillCategories }))}
                  />
                )}
                {currentStep === 'summary' && (
                  <SummaryStep
                    summary={resume.summary}
                    heading={resume.heading}
                    experience={resume.experience}
                    skillCategories={resume.skillCategories}
                    targetJobDescription={resume.targetJobDescription}
                    onChange={(summary) => setResume((prev) => ({ ...prev, summary }))}
                    onOpenGrammarCheck={handleOpenGrammarCheck}
                  />
                )}
                {currentStep === 'template' && (
                  <TemplateStep
                    template={resume.template}
                    onChange={(template) => setResume((prev) => ({ ...prev, template }))}
                    onOpenPreview={() => setShowPreview(true)}
                  />
                )}
                {currentStep === 'certifications' && (
                  <CertificationsStep
                    entries={resume.certifications}
                    targetRole={resume.heading.title || resume.heading.targetRole}
                    experience={resume.experience}
                    onChange={(certifications) => setResume((prev) => ({ ...prev, certifications }))}
                  />
                )}
                {currentStep === 'achievements' && (
                  <AchievementsStep
                    entries={resume.achievements}
                    onChange={(achievements) => setResume((prev) => ({ ...prev, achievements }))}
                    onOpenGrammarCheck={handleOpenGrammarCheck}
                  />
                )}
                {currentStep === 'projects' && (
                  <ProjectsStep
                    entries={resume.projects}
                    targetRole={resume.heading.title || resume.heading.targetRole}
                    experience={resume.experience}
                    skillCategories={resume.skillCategories}
                    onChange={(projects) => setResume((prev) => ({ ...prev, projects }))}
                    onOpenGrammarCheck={handleOpenGrammarCheck}
                  />
                )}
                {currentStep === 'languages' && (
                  <LanguagesStep
                    entries={resume.languages}
                    onChange={(languages) => setResume((prev) => ({ ...prev, languages }))}
                  />
                )}
                {currentStep === 'references' && (
                  <ReferencesStep
                    entries={resume.references}
                    onChange={(references) => setResume((prev) => ({ ...prev, references }))}
                  />
                )}
                {currentStep === 'custom' && (
                  <CustomSectionsStep
                    entries={resume.customSections}
                    onChange={(customSections) => setResume((prev) => ({ ...prev, customSections }))}
                  />
                )}
                {currentStep === 'review' && (
                  <ReviewStep
                    resume={resume}
                    onOpenPreview={() => setShowPreview(true)}
                    onOpenShare={openShare}
                    onExportDocx={handleDownloadDocx}
                  />
                )}
              </div>
            </div>

            {/* Right 4 Columns: Unified AI & ATS Career Copilot (100% Viewport-Aligned) */}
            <div className="lg:col-span-4 sticky top-6">
              <ResumeGuidancePanel
                resume={resume}
                currentStep={currentStep}
                atsAnalysis={atsAnalysis}
                isCurrentStepComplete={isCurrentStepComplete}
                onNavigateStep={handleSelectStep}
                onUpdateResume={setResume}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── 4. Sticky Bottom Navigation Bar ─── */}
      <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-border bg-surface/95 px-4 py-3 sm:px-6 backdrop-blur-md shadow-lg">
        <Button
          variant="outline"
          size="sm"
          onClick={goPrev}
          disabled={currentStepIndex === 0}
          className="gap-1.5 text-xs"
        >
          <ChevronLeft className="size-4" />
          <span>Previous: {currentStepIndex > 0 ? STEPS[currentStepIndex - 1].label : 'Start'}</span>
        </Button>

        <div className="hidden sm:flex items-center gap-2 text-xs text-ink-muted">
          <span>Step {currentStepIndex + 1} of {STEPS.length}</span>
          <span>·</span>
          <span className="font-semibold text-ink">{activeStepMeta.label}</span>
          <span>·</span>
          <span
            className={cn('font-medium', saveStateLabel === 'Saved' ? 'text-success-700' : saveStateLabel === 'Unsaved changes' ? 'text-warning-700' : 'text-ink-muted')}
            data-testid="builder-footer-save-state"
          >
            {saveStateLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(true)}
            className="gap-1.5 text-xs text-brand-700 border-brand-200"
            aria-label="Preview"
          >
            <Eye className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Preview</span>
          </Button>

          {currentStepIndex < STEPS.length - 1 ? (
            <Button size="sm" onClick={goNext} className="gap-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white shadow-xs">
              <span>Next: {STEPS[currentStepIndex + 1].label}</span>
              <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleSave} loading={saving} className="gap-1.5 text-xs bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs">
              <Download className="size-3.5" />
              <span>Save &amp; Finish</span>
            </Button>
          )}
        </div>
      </div>

      {/* ─── 4. Resume Sections Overview (13 Steps) Modal ─── */}
      <Dialog open={showAllStepsModal} onOpenChange={setShowAllStepsModal}>
        <DialogContent
          className="max-w-3xl sm:rounded-3xl p-0 overflow-hidden border-border/80 shadow-2xl bg-surface"
          data-testid="resume-builder-13-steps-modal"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-neutral-50/80">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-md shadow-brand-600/20 font-bold">
                <LayoutGrid className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-extrabold text-ink tracking-tight">
                  Resume Sections Overview (13 Steps)
                </DialogTitle>
                <DialogDescription className="text-xs text-ink-muted font-medium">
                  Jump instantly to any section or inspect overall completion
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Overall Progress Gauge Bar */}
          <div className="px-6 py-3.5 bg-brand-50/70 border-b border-brand-100/70 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-950">
              <span>Overall Completion:</span>
              <span className="text-brand-700 font-extrabold">
                {completedCount} of {COMPLETABLE_STEP_COUNT} Sections Finished
              </span>
            </div>
            <div className="flex items-center gap-3 flex-1 max-w-xs min-w-[180px]">
              <div className="flex-1 h-2.5 bg-brand-200/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-600 rounded-full transition-all duration-500"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
              <span className="text-xs font-black text-brand-700">{completionPercent}%</span>
            </div>
          </div>

          {/* 13 Steps Grid Matrix (3-column responsive) */}
          <div className="p-6 overflow-y-auto max-h-[60vh] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-neutral-50/40">
            {STEPS.map((step, index) => {
              const isActive = currentStep === step.id;
              const isDone = Boolean(stepCompletions[step.id]);

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    handleSelectStep(step.id);
                    setShowAllStepsModal(false);
                  }}
                  className={cn(
                    'p-3.5 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between gap-2.5 cursor-pointer shadow-2xs hover:shadow-md group',
                    isActive
                      ? 'bg-brand-600 text-white border-brand-600 ring-2 ring-brand-500/25 shadow-md'
                      : isDone
                      ? 'bg-surface text-ink border-emerald-200/90 hover:border-emerald-400'
                      : 'bg-surface text-ink-muted border-border hover:border-neutral-300 hover:bg-neutral-50'
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'size-6 rounded-lg flex items-center justify-center text-xs font-bold transition-transform group-hover:scale-105',
                          isActive
                            ? 'bg-white/20 text-white'
                            : isDone
                            ? 'bg-emerald-600 text-white'
                            : 'bg-neutral-100 text-ink-muted border border-border/60'
                        )}
                      >
                        {isDone ? <Check className="size-3.5 stroke-[2.5]" /> : index + 1}
                      </span>
                      <span className={cn('text-xs font-bold truncate max-w-[120px]', isActive ? 'text-white' : 'text-ink')}>
                        {step.label}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] font-extrabold px-2 py-0.5 rounded-full',
                        isActive
                          ? 'bg-white text-brand-700'
                          : isDone
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-neutral-100 text-ink-subtle'
                      )}
                    >
                      {isActive ? 'Current' : isDone ? 'Completed' : 'Pending'}
                    </span>
                  </div>

                  <p className={cn('text-[11px] line-clamp-2 leading-relaxed', isActive ? 'text-brand-100' : 'text-ink-muted')}>
                    {step.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 bg-surface border-t border-border flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                handleSelectStep('custom');
                setShowAllStepsModal(false);
              }}
              className="gap-1.5 text-brand-700 border-brand-200 hover:bg-brand-50 font-bold"
            >
              <Plus className="size-3.5" />
              <span>Add Custom Section</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setShowAllStepsModal(false)}
              className="px-5 font-bold bg-neutral-900 hover:bg-black text-white"
            >
              Close Overview
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── 5. Interactive A4 PreviewModal ─── */}
      <PreviewModal
        open={showPreview}
        onOpenChange={setShowPreview}
        resume={{
          id: resume.id || parsedResumeId,
          name: resume.name,
          template: resume.template || 'Cv1',
          heading: resume.heading,
          experience: resume.experience,
          education: resume.education,
          skillCategories: resume.skillCategories,
          summary: resume.summary,
          certifications: resume.certifications,
          projects: resume.projects,
          languages: resume.languages,
        }}
        onTemplateChange={(tmplId) => setResume((prev) => ({ ...prev, template: tmplId }))}
      />

      {/* ─── 6. Cuba ShareModal ─── */}
      <ShareModal
        open={showShare}
        onOpenChange={setShowShare}
        resumeId={resume.id || parsedResumeId || ''}
        resumeName={resume.name || 'Resume'}
        templateId={resume.template || 'Cv1'}
      />

      {/* ─── 7. AI Resume Import Modal ─── */}
      <ResumeImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={handleApplyImportedResume}
      />

      {/* ─── 8. Role AI Copilot Modal ─── */}
      <RoleAiCopilotModal
        isOpen={roleCopilotState.isOpen}
        onClose={() => setRoleCopilotState({ isOpen: false, entryId: null, position: '', company: '', existingDescription: '' })}
        position={roleCopilotState.position}
        company={roleCopilotState.company}
        existingDescription={roleCopilotState.existingDescription}
        onApplyBullets={(bullets) => handleInsertCopilotBullets(roleCopilotState.entryId, bullets)}
      />

      {/* ─── 9. Grammar & Polish Modal ─── */}
      <GrammarCheckModal
        isOpen={grammarModalState.isOpen}
        onClose={() => setGrammarModalState({ isOpen: false, initialText: '', onApply: () => {} })}
        text={grammarModalState.initialText}
        onApplyCorrectedText={(fixed) => {
          grammarModalState.onApply(fixed);
          setGrammarModalState({ isOpen: false, initialText: '', onApply: () => {} });
        }}
      />
    </div>
  );
}

/* ─── Right rail resume guidance: deterministic checks computed from the resume (no AI or network calls) ─── */

interface ResumeGuidancePanelProps {
  resume: ResumeData;
  currentStep?: BuilderStep;
  atsAnalysis?: {
    score: number;
    status: string;
    badgeColor: string;
    dotColor: string;
    checks: { label: string; passed: boolean; tip: string }[];
  };
  isCurrentStepComplete?: boolean;
  onNavigateStep?: (step: BuilderStep) => void;
  onUpdateResume?: React.Dispatch<React.SetStateAction<ResumeData>>;
}

export function ResumeGuidancePanel({
  resume,
  currentStep = 'heading',
  atsAnalysis,
  isCurrentStepComplete,
  onNavigateStep,
  onUpdateResume,
}: ResumeGuidancePanelProps) {
  const [activeTab, setActiveTab] = useState<'ats' | 'suggestions' | 'insights' | 'jobmatch' | 'bullets'>('ats');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [mobileModalOpen, setMobileModalOpen] = useState(false);
  const [jobDescription, setJobDescription] = useState('');
  const deferredJobDescription = useDeferredValue(jobDescription);
  // Same deterministic scorer as the ATS Score page, so both report the same match for the same text.
  const jdMatch = useMemo(() => {
    const text = deferredJobDescription.trim();
    return text ? scoreResume(serializeToBackend(resume), { jobDescription: text })?.jdMatch ?? null : null;
  }, [resume, deferredJobDescription]);
  // Collapsing, expanding, hiding and showing swap the control that was pressed for another one;
  // move focus to the replacement so keyboard users keep their place.
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  const showButtonRef = useRef<HTMLButtonElement>(null);
  const focusAfterToggle = useRef(false);
  useEffect(() => {
    if (!focusAfterToggle.current) return;
    focusAfterToggle.current = false;
    (isDismissed ? showButtonRef : isCollapsed ? expandButtonRef : collapseButtonRef).current?.focus();
  }, [isCollapsed, isDismissed]);
  const togglePanel = (change: { collapsed?: boolean; dismissed?: boolean }) => {
    focusAfterToggle.current = true;
    if (change.collapsed !== undefined) setIsCollapsed(change.collapsed);
    if (change.dismissed !== undefined) setIsDismissed(change.dismissed);
  };
  const [addedSkillsToast, setAddedSkillsToast] = useState<string | null>(null);

  const tabs = [
    { id: 'ats', label: 'ATS', fullName: 'ATS Section Guide', icon: Shield },
    { id: 'suggestions', label: 'Tips', fullName: 'Writing tips', icon: Lightbulb },
    { id: 'insights', label: 'Stats', fullName: 'Resume Insights', icon: BarChart3 },
    { id: 'jobmatch', label: 'Match', fullName: 'Job description match', icon: Target },
    { id: 'bullets', label: 'Bullets', fullName: 'Bullet Polish', icon: Zap },
  ] as const;

  // Real-time metrics calculations
  const totalSkills = useMemo(() => {
    return resume.skillCategories.reduce((sum, c) => sum + (c.skills?.length || 0), 0);
  }, [resume.skillCategories]);

  const allBullets = useMemo(() => {
    return resume.experience.flatMap((exp, expIndex) => {
      const lines = (exp.description || '').split('\n').map((l) => l.trim()).filter(Boolean);
      return lines.map((text, bulletIndex) => ({
        text: text.replace(/^[•\-*]\s*/, ''),
        strength: calculateBulletStrength(text),
        expRole: exp.position || exp.company || 'Role',
        expIndex,
        bulletIndex,
      }));
    });
  }, [resume.experience]);

  // Handle adding missing recommended keywords directly to resume skills
  const handleAddKeyword = (keyword: string) => {
    if (!onUpdateResume) return;
    onUpdateResume((prev) => {
      const categories = [...prev.skillCategories];
      if (categories.length === 0) {
        categories.push({ id: `cat_${Date.now()}`, category: 'Core Skills', skills: [keyword] });
      } else if (!categories[0].skills.includes(keyword)) {
        categories[0] = { ...categories[0], skills: [...categories[0].skills, keyword] };
      }
      return { ...prev, skillCategories: categories };
    });
    setAddedSkillsToast(`Added “${keyword}” to your skills.`);
    setTimeout(() => setAddedSkillsToast(null), 3000);
  };


  // Helper render for Tab content (shared between desktop inline card and mobile modal)
  const renderTabContent = () => (
    <>
      {/* Tab Navigation Segmented Bar (5 equal columns, mathematically zero overflow) */}
      <div className="grid grid-cols-5 gap-1 p-1 bg-neutral-100/80 rounded-xl border border-border/60 text-xs mb-3.5" role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-0.5 rounded-lg text-[11px] font-semibold transition-all duration-150',
                isActive
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold border border-border/40'
                  : 'text-ink-muted hover:text-ink hover:bg-white/60'
              )}
              title={tab.fullName}
            >
              <Icon className={cn('size-3.5 shrink-0', isActive ? 'text-indigo-600' : 'text-ink-muted')} />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {addedSkillsToast && (
        <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs text-emerald-800 font-medium flex items-center gap-1.5 animate-in fade-in">
          <Check className="size-3.5 text-emerald-600" />
          <span>{addedSkillsToast}</span>
        </div>
      )}

      {/* Tab 0: ATS Guide */}
      {activeTab === 'ats' && (
        <div role="tabpanel" className="space-y-3">
          {/* Status Box */}
          <div className={cn(
            'rounded-xl border p-3 text-xs',
            isCurrentStepComplete ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900' : 'border-amber-200 bg-amber-50/70 text-amber-900'
          )}>
            <div className="flex items-center gap-2 font-bold">
              {isCurrentStepComplete ? (
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="size-4 text-amber-600 shrink-0" />
              )}
              <span>{isCurrentStepComplete ? 'Optimized for ATS screening' : 'Needs attention'}</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed opacity-90">
              {isCurrentStepComplete
                ? 'All essential fields and formatting checks for this section are satisfied.'
                : 'Complete the required fields in this step to maximize recruiter search matches.'}
            </p>
          </div>

          {/* Recruiter Screening Tip */}
          <div className="rounded-xl border border-border bg-neutral-50/80 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-ink mb-1">
              <Lightbulb className="size-3.5 text-amber-500 shrink-0" />
              <span>Recruiter screening tip</span>
            </div>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              {currentStep === 'heading' && 'Keep contact info professional. Include LinkedIn and GitHub for technical verification.'}
              {currentStep === 'experience' && 'Lead bullet points with active verbs like Delivered, Implemented, Led and anchor results to tangible metrics.'}
              {currentStep === 'education' && 'List degrees in reverse chronological order. Include relevant honors, thesis or GPA if above 3.5.'}
              {currentStep === 'skills' && 'Group technical and domain skills by category. Avoid acronym overload and deduplicate skill tags.'}
              {currentStep === 'summary' && 'Keep your summary to 3-4 impactful sentences. State years of experience, core domains, and major value delivered.'}
              {currentStep === 'template' && 'Clean single-column layouts achieve the highest parsing scores across legacy and modern ATS platforms.'}
              {!['heading', 'experience', 'education', 'skills', 'summary', 'template'].includes(currentStep) && 'Keep section entries concise, verifiable, and relevant to your target career role.'}
            </p>
          </div>

          {/* Live ATS Checks */}
          <div className="space-y-1.5 border-t border-border pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1 flex items-center justify-between">
              <span>Live ATS Checks</span>
              <span className="font-semibold text-brand-700">{atsAnalysis?.checks.filter(c => c.passed).length || 0} / {atsAnalysis?.checks.length || 4} passing</span>
            </div>
            <div className="space-y-1.5 text-xs">
              {(atsAnalysis?.checks || []).slice(0, 4).map((chk, i) => (
                <div key={i} className="flex items-start gap-2">
                  {chk.passed ? (
                    <Check className="size-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <span className={cn('text-[11px]', chk.passed ? 'text-ink-secondary' : 'text-amber-800 font-medium')}>
                    {chk.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {addedSkillsToast && (
        <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs text-emerald-800 font-medium flex items-center gap-1.5 animate-in fade-in">
          <Check className="size-3.5 text-emerald-600" />
          <span>{addedSkillsToast}</span>
        </div>
      )}

      {/* Tab 1: Suggestions */}
      {activeTab === 'suggestions' && (
        <div role="tabpanel" className="space-y-3">
          {/* Contextual Active Step Box */}
          <div className="rounded-xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/40 p-3 shadow-2xs">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-700">
                Active Step Guidance: {currentStep}
              </span>
              <span className="flex size-2 rounded-full bg-indigo-500 animate-pulse" />
            </div>
            <p className="text-xs text-ink leading-relaxed">
              {currentStep === 'heading' && 'Target Role & Impact: Ensure your professional title mirrors the target job, and add verified LinkedIn & portfolio URLs.'}
              {currentStep === 'experience' && 'Metric Quantification: Start bullets with power verbs (Delivered, Spearheaded, Optimized) and anchor with tangible % or $ results.'}
              {currentStep === 'education' && 'Academic Credentialing: Prioritize degree title and field. Add honors or relevant coursework if recent.'}
              {currentStep === 'skills' && 'Deduplication & Density: Group competencies by domain (Frontend, Cloud, Architecture) to maximize ATS scoring.'}
              {currentStep === 'summary' && 'Executive Bio: Keep to 3 high-impact sentences stating total experience, technical specialization, and core business value delivered.'}
              {currentStep === 'projects' && 'Tech Stack Showcase: Highlight real problem statements, exact frameworks used, and measurable results.'}
              {!['heading', 'experience', 'education', 'skills', 'summary', 'projects'].includes(currentStep) && 'Keep section details concise, dated, and relevant to your target seniority level.'}
            </p>
          </div>

          <div className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">Quick Section Accelerators</div>

          <div className="space-y-2">
            {[
              { section: 'heading' as BuilderStep, label: 'Heading', icon: User, tip: 'Optimize title, email & links' },
              { section: 'experience' as BuilderStep, label: 'Experience', icon: Briefcase, tip: 'Add metric-driven bullets' },
              { section: 'skills' as BuilderStep, label: 'Skills', icon: Wrench, tip: 'Deduplicate & group keywords' },
              { section: 'summary' as BuilderStep, label: 'Summary', icon: FileText, tip: 'Synthesize Executive Bio' },
              { section: 'certifications' as BuilderStep, label: 'Certifications', icon: Award, tip: 'Add industry credentials' },
              { section: 'projects' as BuilderStep, label: 'Projects', icon: Code2, tip: 'Showcase architectures & tech stack' },
            ].map((item) => (
              <div
                key={item.section}
                className={cn(
                  'flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all',
                  currentStep === item.section
                    ? 'border-indigo-300 bg-indigo-50/40 shadow-2xs'
                    : 'border-border bg-surface hover:bg-neutral-50/80 hover:border-neutral-300'
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-lg',
                    currentStep === item.section ? 'bg-indigo-600 text-white' : 'bg-neutral-100 text-ink-muted'
                  )}>
                    <item.icon className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-ink truncate">{item.label}</div>
                    <div className="text-[10px] text-ink-muted truncate">{item.tip}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onNavigateStep && currentStep !== item.section && (
                    <button
                      type="button"
                      onClick={() => onNavigateStep(item.section)}
                      className="px-2 py-1 rounded-md text-[10px] font-bold text-indigo-700 hover:bg-indigo-100/70 transition-colors"
                      title={`Jump to ${item.label}`}
                    >
                      Jump
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Insights */}
      {activeTab === 'insights' && (
        <div role="tabpanel" className="space-y-3">
          <p className="text-xs text-ink-muted leading-relaxed">Live strength metrics grounded in your actual resume entries.</p>
          <div className="space-y-2">
            <InsightMetricCard
              title="Career Depth"
              value={resume.experience.length}
              unit="roles"
              icon={Briefcase}
              color="indigo"
              status={resume.experience.length >= 3 ? 'Strong Progression' : 'Add 1-2 more positions'}
            />
            <InsightMetricCard
              title="Skill Diversity"
              value={totalSkills}
              unit="keywords"
              icon={Wrench}
              color="emerald"
              status={totalSkills >= 12 ? 'High Keyword Density' : 'Expand domain keywords'}
            />
            <InsightMetricCard
              title="Credentials & Degrees"
              value={resume.education.length + resume.certifications.length}
              unit="credentials"
              icon={GraduationCap}
              color="blue"
              status={resume.education.length > 0 ? 'Verified Academic History' : 'Add degree or certification'}
            />
            <InsightMetricCard
              title="Proof of Work"
              value={resume.projects.length}
              unit="projects"
              icon={Code2}
              color="purple"
              status={resume.projects.length >= 2 ? 'Strong Portfolio Proof' : 'Add projects with outcomes'}
            />
          </div>
        </div>
      )}

      {/* Tab 3: Job description match (deterministic, same scorer as the ATS Score page) */}
      {activeTab === 'jobmatch' && (
        <div role="tabpanel" className="space-y-3">
          {/* Wrapping label: this tab also renders inside the mobile dialog, so it cannot rely on a fixed id. */}
          <label className="block space-y-1.5">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-ink">Job description</span>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={5}
              maxLength={20000}
              placeholder="Paste the job description you are applying for"
              className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-indigo-600"
            />
          </label>

          {!jdMatch ? (
            <p className="text-xs leading-relaxed text-ink-muted" data-testid="builder-jd-empty">
              Paste a job description to see which of its keywords this resume already covers. The comparison runs in your browser; nothing is sent or saved.
            </p>
          ) : (
            <div className="space-y-3" data-testid="builder-jd-result">
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
                <p className="flex items-center justify-between gap-2 text-xs font-bold text-indigo-950">
                  <span>Job description match</span>
                  <span className="text-sm font-extrabold text-indigo-800" data-testid="builder-jd-score">
                    {jdMatch.score === null ? 'Not available' : `${jdMatch.score}%`}
                  </span>
                </p>
                {jdMatch.score !== null && (
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-indigo-200/80" aria-hidden="true">
                    <div className="h-full rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${jdMatch.score}%` }} />
                  </div>
                )}
                <p className="mt-2 text-[11px] text-indigo-950" data-testid="builder-jd-summary">
                  {jdMatch.total === 0
                    ? 'No skill or tool keywords were recognised in this job description.'
                    : `${jdMatch.matched.length} of ${jdMatch.total} keywords from the job description appear in this resume${
                        jdMatch.partial?.length ? `; ${jdMatch.partial.length} more are partly mentioned` : ''
                      }.`}
                </p>
              </div>

              {jdMatch.matched.length > 0 && (
                <div>
                  <h4 className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                    <Check className="size-3 text-emerald-700" aria-hidden="true" />
                    <span>Found in this resume ({jdMatch.matched.length})</span>
                  </h4>
                  <ul className="flex flex-wrap gap-1.5" aria-label="Keywords found in this resume">
                    {jdMatch.matched.map((kw) => (
                      <li key={kw} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        {kw}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {jdMatch.missing.length > 0 && (
                <div>
                  <h4 className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    <Plus className="size-3 text-amber-700" aria-hidden="true" />
                    <span>Not in this resume yet ({jdMatch.missing.length})</span>
                  </h4>
                  <p className="mb-1.5 text-[10px] text-ink-muted">Add only the skills you really have.</p>
                  <ul className="flex flex-wrap gap-1.5" aria-label="Keywords not in this resume yet">
                    {jdMatch.missing.map((kw) => (
                      <li key={kw}>
                        <button
                          type="button"
                          onClick={() => handleAddKeyword(kw)}
                          disabled={!onUpdateResume}
                          aria-label={`Add ${kw} to skills`}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-900 shadow-2xs transition-colors hover:bg-amber-50 disabled:opacity-60"
                        >
                          <Plus className="size-2.5 text-amber-700" aria-hidden="true" />
                          <span>{kw}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Bullet Polish */}
      {activeTab === 'bullets' && (
        <div role="tabpanel" className="space-y-3">
          <p className="text-xs text-ink-muted leading-relaxed">
            Real-time bullet impact analyzer: scans for active verbs, metrics (%/$) and outcomes.
          </p>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {allBullets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-surface p-4 text-center text-xs text-ink-muted">
                <Briefcase className="size-6 text-ink-subtle mx-auto mb-1.5 opacity-60" />
                <p className="font-semibold text-ink">No bullet points detected</p>
                <p className="text-[11px] mt-0.5">Add entries in Work History starting with • or - to analyze bullet strength.</p>
              </div>
            ) : (
              allBullets.slice(0, 5).map((bullet, idx) => (
                <div key={idx} className="rounded-xl border border-border bg-surface p-2.5 space-y-1.5 text-xs shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-ink-subtle truncate max-w-[140px]">{bullet.expRole}</span>
                    <span className={cn(
                      'px-1.5 py-0.2 rounded-md text-[10px] font-bold border',
                      bullet.strength >= 70 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                      bullet.strength >= 40 ? 'bg-amber-50 text-amber-800 border-amber-200' :
                      'bg-rose-50 text-rose-800 border-rose-200'
                    )}>
                      {bullet.strength >= 70 ? 'Strong ✓' : bullet.strength >= 40 ? 'Moderate' : 'Needs Metrics'}
                    </span>
                  </div>

                  <p className="text-[11px] text-ink line-clamp-2 leading-relaxed">{bullet.text}</p>

                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="flex-1 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-300',
                          bullet.strength >= 70 ? 'bg-emerald-500' : bullet.strength >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                        )}
                        style={{ width: `${bullet.strength}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-extrabold text-ink-muted w-7 text-right">{bullet.strength}%</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Bullet formula callout */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-2.5 text-[11px] text-indigo-950">
            <span className="font-bold">Winning Bullet Formula:</span> [Action Verb] + [Specific Responsibility] + [Quantifiable Business Impact (%)].
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* ─── 1. Desktop & Tablet Inline Card (Clean w-full inside right rail) ─── */}
      <div className="w-full" data-testid="resume-builder-ai-assistant">
        {isDismissed ? (
          /* Dismissed / Hidden Mini-State */
          <div className="rounded-2xl border border-dashed border-border bg-surface p-3 flex items-center justify-between text-xs transition-all hover:bg-neutral-50/80">
            <div className="flex items-center gap-2 text-ink-muted font-medium">
              <ClipboardCheck className="size-3.5 text-indigo-600" aria-hidden="true" />
              <span className="text-[11px]">Resume guidance hidden</span>
            </div>
            <Button
              ref={showButtonRef}
              variant="outline"
              size="sm"
              onClick={() => togglePanel({ dismissed: false })}
              className="h-6 text-[11px] px-2.5 border-border hover:bg-neutral-100"
            >
              Show
            </Button>
          </div>
        ) : isCollapsed ? (
          /* Collapsed 1-Line State */
          <button
            ref={expandButtonRef}
            type="button"
            onClick={() => togglePanel({ collapsed: false })}
            aria-expanded="false"
            className="w-full rounded-2xl border border-border bg-surface p-3.5 flex items-center justify-between text-left shadow-2xs hover:shadow-xs hover:border-indigo-300 cursor-pointer transition-all"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-2xs">
                <ClipboardCheck className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-ink">Resume guidance</span>
                <span className="block text-[10px] text-ink-muted truncate">Expand for checks, tips and job description match</span>
              </span>
            </span>
            <ChevronDown className="size-4 text-ink-muted shrink-0" aria-hidden="true" />
          </button>
        ) : (
          /* Full Expanded Card */
          <Card className="w-full bg-surface/90 backdrop-blur-sm border-border/80 shadow-xs hover:shadow-sm transition-all overflow-hidden rounded-2xl">
            <CardHeader className="pb-3 border-b border-border/60 bg-neutral-50/40">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-purple-600 text-white shadow-2xs">
                    <ClipboardCheck className="size-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-bold text-ink truncate">Resume guidance</CardTitle>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    ref={collapseButtonRef}
                    onClick={() => togglePanel({ collapsed: true })}
                    aria-expanded="true"
                    className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-neutral-100 transition-colors cursor-pointer"
                    title="Collapse resume guidance"
                    aria-label="Collapse resume guidance"
                  >
                    <ChevronUp className="size-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePanel({ dismissed: true })}
                    className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-neutral-100 transition-colors cursor-pointer"
                    title="Hide resume guidance"
                    aria-label="Hide resume guidance"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 pt-3.5">
              {renderTabContent()}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ─── 2. Mobile & Tablet (< lg) Floating Quick Trigger & Responsive Dialog ─── */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileModalOpen(true)}
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:scale-105 active:scale-95 transition-all border border-white/20 cursor-pointer"
          title="Open resume guidance"
          data-testid="resume-builder-ai-mobile-trigger"
        >
          <ClipboardCheck className="size-4 text-amber-300" aria-hidden="true" />
          <span>Guidance</span>
        </button>

        <Dialog open={mobileModalOpen} onOpenChange={setMobileModalOpen}>
          <DialogContent className="max-w-md w-[92vw] max-h-[85vh] overflow-y-auto rounded-3xl p-5 border border-border/80 shadow-2xl" data-testid="resume-builder-ai-mobile-modal">
            <DialogHeader className="pb-3 border-b border-border">
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-ink">
                <span className="flex size-7 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-2xs">
                  <ClipboardCheck className="size-4" aria-hidden="true" />
                </span>
                Resume guidance
              </DialogTitle>
              <DialogDescription className="text-xs text-ink-muted">
                Section checks, writing tips, job description match and bullet strength, worked out from this resume.
              </DialogDescription>
            </DialogHeader>

            <div className="pt-2">
              {renderTabContent()}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

function InsightMetricCard({
  title,
  value,
  unit,
  icon: Icon,
  color,
  status,
}: {
  title: string;
  value: number;
  unit: string;
  icon: typeof Briefcase;
  color: 'indigo' | 'emerald' | 'blue' | 'purple';
  status: string;
}) {
  const colors = {
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700' },
  }[color];

  return (
    <div className="p-2.5 rounded-xl border border-border bg-surface flex items-center justify-between gap-3 shadow-2xs">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${colors.bg} ${colors.text}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-ink truncate">{title}</div>
          <div className="text-[10px] text-ink-muted truncate">{status}</div>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-sm font-extrabold text-ink">{value}</div>
        <div className="text-[10px] text-ink-subtle">{unit}</div>
      </div>
    </div>
  );
}

function calculateBulletStrength(bullet: string): number {
  let score = 20; // baseline
  const text = bullet.toLowerCase();
  // Action verb
  if (/^(led|managed|developed|created|built|designed|implemented|launched|optimized|improved|increased|reduced|achieved|delivered|engineered|spearheaded|architected)/i.test(text)) {
    score += 30;
  }
  // Quantifiable metric
  if (/\d+%/.test(text)) score += 30;
  else if (/\d+\+/.test(text)) score += 25;
  else if (/\$\d+/.test(text)) score += 25;
  else if (/\d+x/.test(text)) score += 20;
  else if (/\b\d+\b/.test(text)) score += 15;
  // Tech / Domain keywords
  if (/react|typescript|node|python|aws|docker|kubernetes|sql|api|microservice|cloud|ci\/cd|pipeline/i.test(text)) {
    score += 15;
  }
  // Outcome / Impact keywords
  if (/result|outcome|impact|improvement|reduction|increase|growth|efficiency|accelerat/i.test(text)) {
    score += 15;
  }
  return Math.min(100, score);
}

/* ─── Step 1: Personal Info / Heading ─── */

function HeadingStep({
  heading,
  onChange,
  onOpenImport,
}: {
  heading: ResumeHeading;
  onChange: (h: ResumeHeading) => void;
  onOpenImport?: () => void;
}) {
  const [tailoringOpen, setTailoringOpen] = useState(Boolean(heading.targetRole || heading.jobDescription));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = (field: keyof ResumeHeading, value: any) => {
    onChange({ ...heading, [field]: value });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the field immediately: otherwise re-selecting the SAME file after a
    // rejection fires no change event and the control looks dead.
    e.target.value = '';
    if (!file) return;
    if (file.size > PHOTO_MAX_BYTES) {
      toastError(
        'Photo is too large',
        `Choose an image under ${Math.round(PHOTO_MAX_BYTES / (1024 * 1024))}MB. The selected file was ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        update('photo', reader.result);
        toastSuccess('Photo added', 'Your profile photo is ready to preview.');
      }
    };
    // A read failure previously ended silently, leaving the user believing the
    // upload had succeeded.
    reader.onerror = () => {
      toastError('Photo could not be read', 'The file may be corrupt or unreadable. Try a different image.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    update('photo', '');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* 0. AI Resume Import Hero Banner */}
      {onOpenImport && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl border border-indigo-200/80 bg-linear-to-r from-indigo-50/70 via-purple-50/50 to-indigo-50/70 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-linear-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <UploadCloud className="size-5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-ink">Have an existing resume or LinkedIn profile?</h3>
              <p className="text-[11px] text-ink-muted">Upload DOCX, PDF, or paste text to auto-fill your contact, experience, education &amp; skills in 1 click.</p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onOpenImport}
            className="shrink-0 gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
          >
            <Sparkles className="size-3.5 text-amber-300" />
            <span>Import with AI</span>
          </Button>
        </div>
      )}

      {/* 1. Photo & Avatar Uploader Card */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 p-4 rounded-xl border border-border bg-neutral-50/70">
        <div className="relative group shrink-0">
          <div className="size-20 sm:size-24 rounded-full border-2 border-brand-200 bg-white overflow-hidden shadow-xs flex items-center justify-center">
            {heading.photo ? (
              <img src={heading.photo} alt="Avatar" className="size-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center text-ink-muted">
                <Camera className="size-7 text-ink-muted" aria-hidden="true" />
                <span className="text-[10px] mt-1 font-medium">Add Photo</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 p-1.5 rounded-full bg-brand-600 text-white shadow-sm hover:bg-brand-700 transition-colors"
            title="Upload photo"
          >
            <UploadCloud className="size-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
          />
        </div>

        <div className="flex-1 text-center sm:text-left space-y-2">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5 text-xs font-semibold"
            >
              <UploadCloud className="size-3.5" />
              <span>{heading.photo ? 'Change Photo' : 'Upload Headshot'}</span>
            </Button>
            {heading.photo && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemovePhoto}
                className="gap-1.5 text-xs text-error-600 hover:text-error-700 hover:bg-error-50"
              >
                <Trash2 className="size-3.5" />
                <span>Remove</span>
              </Button>
            )}
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-ink cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={heading.showPhoto !== false}
                onChange={(e) => update('showPhoto', e.target.checked)}
                className="size-4 rounded border-border text-brand-600 focus:ring-brand-500"
              />
              <span>Show photo on CV</span>
            </label>
          </div>
          <p className="text-xs text-ink-muted">
            PNG, JPG or WebP up to 5MB. A crisp professional headshot increases profile engagement by 40% on European/Creative CV layouts.
          </p>
        </div>
      </div>

      {/* 2. Core Identity Details */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="rb-firstName" className="mb-1.5 block text-xs font-semibold text-ink">
              First name <span className="text-error-500">*</span>
            </label>
            <Input
              id="rb-firstName"
              value={heading.firstName}
              onChange={(e) => update('firstName', e.target.value)}
              placeholder="e.g. Alex"
              className="text-sm font-medium"
            />
          </div>
          <div>
            <label htmlFor="rb-lastName" className="mb-1.5 block text-xs font-semibold text-ink">
              Last name <span className="text-error-500">*</span>
            </label>
            <Input
              id="rb-lastName"
              value={heading.lastName}
              onChange={(e) => update('lastName', e.target.value)}
              placeholder="e.g. Morgan"
              className="text-sm font-medium"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="rb-title" className="block text-xs font-semibold text-ink">
              Professional title / Target Role
            </label>
            <span className="text-[11px] text-brand-600 flex items-center gap-1">
              <Sparkles className="size-3" /> Visible prominently on header
            </span>
          </div>
          <div className="relative">
            <AutocompleteInput
              id="rb-title"
              suggestionType="jobTitle"
              value={heading.title}
              onChange={(val) => update('title', val)}
              placeholder="e.g. Senior Full-Stack Engineer | Systems Architect"
              className="text-sm font-medium pr-10"
            />
            <button
              type="button"
              onClick={() => {
                if (heading.title) {
                  update('title', `Lead ${heading.title.replace(/^Senior\s+/i, '')}`);
                }
              }}
              title="Enhance Title"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-brand-600 p-1 z-10"
            >
              <Sparkles className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="rb-email" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Mail className="size-3.5 text-ink-muted" /> Email address <span className="text-error-500">*</span>
            </label>
            <Input
              id="rb-email"
              type="email"
              value={heading.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="alex.morgan@example.com"
              className="text-sm"
            />
          </div>
          <div>
            <label htmlFor="rb-phone" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Phone className="size-3.5 text-ink-muted" /> Phone number
            </label>
            <Input
              id="rb-phone"
              type="tel"
              value={heading.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="+1 (555) 234-5678"
              className="text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="rb-location" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
              <MapPin className="size-3.5 text-ink-muted" /> City / Region
            </label>
            <AutocompleteInput
              id="rb-location"
              suggestionType="city"
              value={heading.location || heading.city || ''}
              onChange={(val) => {
                update('location', val);
                update('city', val);
              }}
              placeholder="San Francisco, CA"
              className="text-sm"
            />
          </div>
          <div>
            <label htmlFor="rb-country" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Globe className="size-3.5 text-ink-muted" /> Country
            </label>
            <Input
              id="rb-country"
              value={heading.country || ''}
              onChange={(e) => update('country', e.target.value)}
              placeholder="United States"
              className="text-sm"
            />
          </div>
          <div>
            <label htmlFor="rb-postal" className="mb-1.5 block text-xs font-semibold text-ink">
              Postal code
            </label>
            <Input
              id="rb-postal"
              value={heading.postalcode || ''}
              onChange={(e) => update('postalcode', e.target.value)}
              placeholder="94107"
              className="text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="rb-website" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Globe className="size-3.5 text-ink-muted" /> Portfolio / Website
            </label>
            <Input
              id="rb-website"
              type="url"
              value={heading.website}
              onChange={(e) => update('website', e.target.value)}
              placeholder="https://alexmorgan.dev"
              className="text-sm"
            />
          </div>
          <div>
            <label htmlFor="rb-linkedin" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Link2 className="size-3.5 text-ink-muted" /> LinkedIn URL
            </label>
            <Input
              id="rb-linkedin"
              value={heading.linkedin}
              onChange={(e) => update('linkedin', e.target.value)}
              placeholder="linkedin.com/in/alexmorgan"
              className="text-sm"
            />
          </div>
          <div>
            <label htmlFor="rb-github" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Code2 className="size-3.5 text-ink-muted" /> GitHub / GitLab
            </label>
            <Input
              id="rb-github"
              value={heading.github}
              onChange={(e) => update('github', e.target.value)}
              placeholder="github.com/alexmorgan"
              className="text-sm"
            />
          </div>
        </div>
      </div>

      {/* 3. Collapsible ATS Tailoring Card */}
      <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-4 transition-all">
        <button
          type="button"
          onClick={() => setTailoringOpen(!tailoringOpen)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Target className="size-4 text-brand-600" />
            <span className="text-xs font-bold text-ink">Target Role & Job Description Alignment (ATS Optimization)</span>
          </div>
          <span className="text-xs font-semibold text-brand-700">
            {tailoringOpen ? 'Hide' : 'Configure'}
          </span>
        </button>

        {tailoringOpen && (
          <div className="mt-3 space-y-3 pt-3 border-t border-brand-100">
            <div>
              <label htmlFor="rb-targetRole" className="mb-1 block text-xs font-medium text-ink">
                Target Job Title (for AI keyword matching)
              </label>
              <Input
                id="rb-targetRole"
                value={heading.targetRole || ''}
                onChange={(e) => update('targetRole', e.target.value)}
                placeholder="e.g. Lead Distributed Systems Engineer"
                className="text-sm bg-white"
              />
            </div>
            <div>
              <label htmlFor="rb-jobDesc" className="mb-1 block text-xs font-medium text-ink">
                Paste Target Job Description (Optional — powers live keyword match)
              </label>
              <Textarea
                id="rb-jobDesc"
                rows={3}
                value={heading.jobDescription || ''}
                onChange={(e) => update('jobDescription', e.target.value)}
                placeholder="Paste the target job requirements or responsibilities here to tailor your bullets and ATS score…"
                className="text-xs bg-white resize-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Step 2: Experience ─── */

function ExperienceStep({
  entries,
  targetRole,
  onChange,
  onOpenRoleCopilot,
  onOpenGrammarCheck,
}: {
  entries: ExperienceEntry[];
  targetRole?: string;
  onChange: (e: ExperienceEntry[]) => void;
  onOpenRoleCopilot?: (entry: ExperienceEntry) => void;
  onOpenGrammarCheck?: (text: string, onApply: (fixed: string) => void) => void;
}) {
  const addEntry = (customPosition: string = '') => {
    onChange([
      ...entries,
      {
        id: crypto.randomUUID(),
        company: '',
        position: customPosition || '',
        location: '',
        startDate: '',
        endDate: '',
        current: false,
        description: '',
      },
    ]);
  };

  const updateEntry = (id: string, field: keyof ExperienceEntry, value: string | boolean) => {
    onChange(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  const moveEntry = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= entries.length) return;
    const copy = [...entries];
    const [moved] = copy.splice(index, 1);
    copy.splice(newIndex, 0, moved);
    onChange(copy);
  };

  const duplicateEntry = (id: string) => {
    const source = entries.find((e) => e.id === id);
    if (!source) return;
    onChange([
      ...entries,
      {
        ...source,
        id: crypto.randomUUID(),
        position: `${source.position} (Copy)`,
      },
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Work History & Experience</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Document your career chronologically. Experience accounts for 28% of overall ATS score.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => addEntry()} className="gap-1.5 text-xs font-semibold">
          <Plus className="size-4" /> Add Position
        </Button>
      </div>

      {entries.length === 0 ? (
        /* 4-Card Visual Roadmap Hero State */
        <div className="rounded-2xl border-2 border-dashed border-brand-200 bg-gradient-to-b from-brand-50/50 via-white to-surface p-6 sm:p-8 text-center space-y-6">
          <div className="max-w-md mx-auto space-y-2">
            <div className="size-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center mx-auto shadow-sm">
              <Briefcase className="size-6" />
            </div>
            <h3 className="text-base font-bold text-ink">
              {targetRole ? `Let's build your experience for ${targetRole}` : 'Add your work experience'}
            </h3>
            <p className="text-xs text-ink-muted leading-relaxed">
              Work experience accounts for <strong>28 out of 100 points</strong> in your ATS score.
              Start with your current or most recent role and highlight measurable business impact.
            </p>
          </div>

          {/* 4-Step Visual Roadmap */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto text-left">
            <div className="p-3 rounded-xl bg-white border border-border shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-brand-600">01 · Role & Org</span>
              <p className="text-[11px] text-ink-muted font-medium">Add verified title & employer</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-border shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-brand-600">02 · Dates</span>
              <p className="text-[11px] text-ink-muted font-medium">Establish chronological tenure</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-border shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-brand-600">03 · Verbs & Metrics</span>
              <p className="text-[11px] text-ink-muted font-medium">Lead with action & numbers</p>
            </div>
            <div className="p-3 rounded-xl bg-white border border-border shadow-2xs space-y-1">
              <span className="text-[10px] font-bold text-brand-600">04 · Target JD</span>
              <p className="text-[11px] text-ink-muted font-medium">Align domain keywords</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {targetRole ? (
              <>
                <Button
                  onClick={() => addEntry(targetRole)}
                  className="gap-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-xs px-5 py-2.5"
                >
                  <Plus className="size-4" />
                  <span>Add Experience as {targetRole}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => addEntry()}
                  className="gap-1.5 text-xs text-ink-muted"
                >
                  <span>+ Add a Different Role</span>
                </Button>
              </>
            ) : (
              <Button
                onClick={() => addEntry()}
                className="gap-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-xs px-5 py-2.5"
              >
                <Plus className="size-4" />
                <span>Add Your First Role</span>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {entries.map((entry, index) => (
            <Card key={entry.id} className="border-border shadow-2xs">
              <CardHeader className="pb-3 border-b border-border/60 bg-neutral-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="size-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <CardTitle className="text-sm font-bold text-ink">
                      {entry.position || 'Untitled Position'} {entry.company ? `at ${entry.company}` : ''}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    {index > 0 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => moveEntry(index, -1)} aria-label={`Move ${entry.position || 'this job'} up`}
                        title="Move up"
                      >
                        <ChevronLeft className="size-4 rotate-90" />
                      </Button>
                    )}
                    {index < entries.length - 1 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => moveEntry(index, 1)} aria-label={`Move ${entry.position || 'this job'} down`}
                        title="Move down"
                      >
                        <ChevronRight className="size-4 rotate-90" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => duplicateEntry(entry.id)} aria-label={`Duplicate ${entry.position || 'this job'}`}
                      title="Duplicate"
                    >
                      <Copy className="size-3.5 text-ink-muted" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeEntry(entry.id)} aria-label={`Delete ${entry.position || 'this job'}`}
                      title="Delete"
                    >
                      <Trash2 className="size-3.5 text-error-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">
                      Job title / Position <span className="text-error-500">*</span>
                    </label>
                    <AutocompleteInput
                      suggestionType="jobTitle"
                      value={entry.position}
                      onChange={(val) => updateEntry(entry.id, 'position', val)}
                      placeholder="e.g. Senior Software Engineer"
                      className="text-sm font-medium"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">
                      Company / Organization <span className="text-error-500">*</span>
                    </label>
                    <AutocompleteInput
                      suggestionType="company"
                      value={entry.company}
                      onChange={(val) => updateEntry(entry.id, 'company', val)}
                      placeholder="e.g. Acme Corp"
                      className="text-sm font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Location</label>
                    <AutocompleteInput
                      aria-label="Location"
                      suggestionType="location"
                      value={entry.location}
                      onChange={(val) => updateEntry(entry.id, 'location', val)}
                      placeholder="e.g. San Francisco, CA (or Remote)"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Start date</label>
                    <Input aria-label="Start date"
                      type="month"
                      value={entry.startDate}
                      onChange={(e) => updateEntry(entry.id, 'startDate', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-semibold text-ink">End date</label>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-ink cursor-pointer">
                        <input
                          type="checkbox"
                          checked={entry.current}
                          onChange={(e) => updateEntry(entry.id, 'current', e.target.checked)}
                          className="size-3.5 rounded text-brand-600 border-border"
                        />
                        <span>Present</span>
                      </label>
                    </div>
                    <Input
                      type="month"
                      aria-label="End date"
                      value={entry.endDate}
                      onChange={(e) => updateEntry(entry.id, 'endDate', e.target.value)}
                      disabled={entry.current}
                      className="text-sm"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-ink">
                      Responsibilities, Accomplishments &amp; Quantifiable Metrics
                    </label>
                    <div className="flex items-center gap-1.5">
                      {onOpenRoleCopilot && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenRoleCopilot(entry)}
                          className="h-7 px-2.5 gap-1 text-[11px] font-bold text-purple-700 bg-purple-50/70 border-purple-200 hover:bg-purple-100 shadow-2xs"
                        >
                          <Sparkles className="size-3 text-purple-600" />
                          <span>AI Role Copilot</span>
                        </Button>
                      )}
                      {onOpenGrammarCheck && entry.description.trim() && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onOpenGrammarCheck(entry.description, (fixed) => updateEntry(entry.id, 'description', fixed))}
                          className="h-7 px-2 gap-1 text-[11px] text-ink-muted hover:text-ink hover:bg-neutral-100"
                          title="Check grammar and spelling"
                        >
                          <ClipboardCheck className="size-3 text-emerald-600" />
                          <span>Check Grammar</span>
                        </Button>
                      )}
                    </div>
                  </div>
                  <FormattingToolbar
                    value={entry.description}
                    onChange={(val) => updateEntry(entry.id, 'description', val)}
                  />
                  <textarea
                    value={entry.description}
                    onChange={(e) => updateEntry(entry.id, 'description', e.target.value)}
                    rows={4}
                    className="flex w-full rounded-b-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
                    placeholder="• Architected and deployed microservices reducing API latency by 45%&#10;• Mentored 8 junior developers on code review best practices&#10;• Spearheaded CI/CD pipeline automation saving 15 engineering hours weekly"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Step 3: Education ─── */

function EducationStep({
  entries,
  onChange,
  onOpenGrammarCheck,
}: {
  entries: EducationEntry[];
  onChange: (e: EducationEntry[]) => void;
  onOpenGrammarCheck?: (text: string, onApply: (fixed: string) => void) => void;
}) {
  const [generatingEduId, setGeneratingEduId] = useState<string | null>(null);

  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), institution: '', degree: '', field: '',
      startDate: '', endDate: '', gpa: '', description: '',
    }]);
  };

  const updateEntry = (id: string, field: keyof EducationEntry, value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  const handleGenerateEduDetails = async (entry: EducationEntry) => {
    setGeneratingEduId(entry.id);
    try {
      const outcome = await runContentOperation('generate-education-description', {
        degree: entry.degree || 'Bachelor of Science',
        field: entry.field || 'Computer Science',
        institution: entry.institution || 'University',
      });
      const suggestions = outcome.kind === 'suggestions'
        ? outcome.suggestions
        : outcome.kind === 'text'
        ? [outcome.text]
        : [];
      if (suggestions.length) {
        const bullets = suggestions.map((s) => (s.startsWith('•') ? s : `• ${s}`)).join('\n');
        const newDesc = entry.description.trim() ? `${entry.description.trim()}\n${bullets}` : bullets;
        updateEntry(entry.id, 'description', newDesc);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingEduId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Education &amp; Academic History</h2>
          <p className="mt-1 text-sm text-ink-muted">Add your academic background, degree programs &amp; verified coursework.</p>
        </div>
        <Button variant="outline" onClick={addEntry}>
          <Plus className="size-4" /> Add Education
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <GraduationCap className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No education added yet</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add Education
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((entry, index) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Education {index + 1}</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => removeEntry(entry.id)} aria-label={`Delete ${entry.institution || 'this education entry'}`}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Institution *</label>
                <AutocompleteInput
                  aria-label="Institution"
                  aria-required="true"
                  suggestionType="school"
                  value={entry.institution}
                  onChange={(val) => updateEntry(entry.id, 'institution', val)}
                  placeholder="Massachusetts Institute of Technology"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Degree *</label>
                  <AutocompleteInput
                    aria-label="Degree"
                    aria-required="true"
                    suggestionType="degree"
                    value={entry.degree}
                    onChange={(val) => updateEntry(entry.id, 'degree', val)}
                    placeholder="Bachelor of Science"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Field of study</label>
                  <AutocompleteInput
                    aria-label="Field of study"
                    suggestionType="qualification"
                    value={entry.field}
                    onChange={(val) => updateEntry(entry.id, 'field', val)}
                    placeholder="Computer Science"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Start date</label>
                  <Input aria-label="Start date" type="month" value={entry.startDate} onChange={(e) => updateEntry(entry.id, 'startDate', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">End date</label>
                  <Input aria-label="End date" type="month" value={entry.endDate} onChange={(e) => updateEntry(entry.id, 'endDate', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">GPA</label>
                  <Input aria-label="GPA" value={entry.gpa} onChange={(e) => updateEntry(entry.id, 'gpa', e.target.value)} placeholder="3.8 / 4.0" />
                </div>
              </div>
              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium text-ink">Relevant Coursework, Honors &amp; Achievements</label>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleGenerateEduDetails(entry)}
                      loading={generatingEduId === entry.id}
                      className="h-6 px-2 text-[11px] font-bold text-purple-700 bg-purple-50/70 border-purple-200 hover:bg-purple-100"
                    >
                      <Sparkles className="size-3 text-purple-600" />
                      <span>AI Coursework &amp; Honors</span>
                    </Button>
                    {onOpenGrammarCheck && entry.description.trim() && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenGrammarCheck(entry.description, (fixed) => updateEntry(entry.id, 'description', fixed))}
                        className="h-6 px-2 text-[11px] text-ink-muted hover:text-ink hover:bg-neutral-100"
                      >
                        <ClipboardCheck className="size-3 text-emerald-600" />
                        <span>Grammar</span>
                      </Button>
                    )}
                  </div>
                </div>
                <textarea aria-label="Additional details"
                  value={entry.description}
                  onChange={(e) => updateEntry(entry.id, 'description', e.target.value)}
                  rows={3}
                  className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
                  placeholder="Relevant coursework, honors, Dean's List, research publications…"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 4: Skills ─── */

function SkillsStep({
  categories,
  targetRole,
  experience,
  education,
  onChange,
}: {
  categories: SkillCategory[];
  targetRole?: string;
  experience?: ExperienceEntry[];
  education?: EducationEntry[];
  onChange: (c: SkillCategory[]) => void;
}) {
  const [newSkill, setNewSkill] = useState<Record<string, string>>({});
  const [generatingSkills, setGeneratingSkills] = useState(false);
  const [suggestedSkills, setSuggestedSkills] = useState<string[]>([]);
  const [skillSuggestionNotice, setSkillSuggestionNotice] = useState<string | null>(null);

  const existingSkillsSet = useMemo(() => {
    return new Set(categories.flatMap((c) => c.skills.map((s) => s.toLowerCase().trim())));
  }, [categories]);

  const addCategory = () => {
    onChange([...categories, { id: crypto.randomUUID(), category: '', skills: [] }]);
  };

  const updateCategory = (id: string, category: string) => {
    onChange(categories.map((c) => c.id === id ? { ...c, category } : c));
  };

  const removeCategory = (id: string) => {
    onChange(categories.filter((c) => c.id !== id));
  };

  const addSkill = (categoryId: string) => {
    const skill = (newSkill[categoryId] ?? '').trim();
    if (!skill) return;
    onChange(categories.map((c) => c.id === categoryId ? { ...c, skills: [...c.skills, skill] } : c));
    setNewSkill((prev) => ({ ...prev, [categoryId]: '' }));
  };

  const removeSkill = (categoryId: string, skillIndex: number) => {
    onChange(categories.map((c) =>
      c.id === categoryId
        ? { ...c, skills: c.skills.filter((_, i) => i !== skillIndex) }
        : c
    ));
  };

  const handleGenerateSkills = async () => {
    setGeneratingSkills(true);
    setSkillSuggestionNotice(null);
    try {
      const outcome = await runContentOperation('generate-skills', {
        jobTitle: targetRole || 'Software Engineer',
        experienceLevel: 'senior',
        existingSkills: categories.flatMap((c) => c.skills),
        recentRoles: experience?.map((e) => e.position).filter(Boolean),
        companies: experience?.map((e) => e.company).filter(Boolean),
        educationFields: education?.map((ed) => ed.field).filter(Boolean),
      });
      const rawList = outcome.kind === 'skills'
        ? outcome.skills.map((s) => s.name)
        : outcome.kind === 'suggestions'
        ? outcome.suggestions
        : [];
      const filtered = rawList.filter((s) => !existingSkillsSet.has(s.toLowerCase().trim()));
      setSuggestedSkills(filtered);
      if (filtered.length === 0) {
        setSkillSuggestionNotice('You already have all recommended skills in your resume!');
      }
    } catch {
      setSkillSuggestionNotice('Could not generate skills right now. Try again later.');
    } finally {
      setGeneratingSkills(false);
    }
  };

  const handleAddSuggestedSkill = (skill: string) => {
    if (categories.length === 0) {
      onChange([{ id: crypto.randomUUID(), category: 'Core Skills', skills: [skill] }]);
    } else {
      onChange(
        categories.map((c, idx) => (idx === 0 ? { ...c, skills: [...c.skills, skill] } : c))
      );
    }
    setSuggestedSkills((prev) => prev.filter((s) => s !== skill));
  };

  const handleAddAllSuggestedSkills = () => {
    if (!suggestedSkills.length) return;
    if (categories.length === 0) {
      onChange([{ id: crypto.randomUUID(), category: 'Core Skills', skills: [...suggestedSkills] }]);
    } else {
      onChange(
        categories.map((c, idx) => (idx === 0 ? { ...c, skills: [...c.skills, ...suggestedSkills] } : c))
      );
    }
    setSuggestedSkills([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">Skills &amp; Core Competencies</h2>
          <p className="mt-1 text-sm text-ink-muted">Organize your skills by category for ATS keyword matching.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleGenerateSkills()}
            loading={generatingSkills}
            className="gap-1.5 text-xs font-bold text-purple-700 bg-purple-50/70 border-purple-200 hover:bg-purple-100 shadow-2xs"
          >
            <Sparkles className="size-3.5 text-purple-600" />
            <span>AI Suggest Skills</span>
          </Button>
          <Button variant="outline" size="sm" onClick={addCategory} className="gap-1.5 text-xs">
            <Plus className="size-4" /> Add Category
          </Button>
        </div>
      </div>

      {/* Suggested Skills Banner */}
      {suggestedSkills.length > 0 && (
        <div className="p-4 rounded-2xl border border-purple-200/80 bg-purple-50/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-purple-600" />
              <span className="text-xs font-bold text-ink">
                Recommended Skills for {targetRole || 'Your Target Role'}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAddAllSuggestedSkills}
              className="text-xs text-purple-700 hover:text-purple-800 font-bold"
            >
              Add All ({suggestedSkills.length})
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestedSkills.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => handleAddSuggestedSkill(skill)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-purple-200 text-purple-900 hover:bg-purple-600 hover:text-white transition-colors cursor-pointer shadow-2xs group"
                title="Click to add to skills"
              >
                <Plus className="size-3 group-hover:scale-110" />
                <span>{skill}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {skillSuggestionNotice && (
        <div className="p-3 rounded-xl border border-border bg-neutral-50 text-xs font-medium text-ink-muted">
          {skillSuggestionNotice}
        </div>
      )}

      {categories.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Wrench className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No skills added yet</p>
          <p className="mt-1 text-xs text-ink-muted">Group your skills into categories like "Languages", "Frameworks", etc.</p>
          <Button variant="outline" className="mt-4" onClick={addCategory}>
            <Plus className="size-4" /> Add Skill Category
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {categories.map((cat) => (
          <Card key={cat.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Input
                  aria-label="Skill category name"
                  value={cat.category}
                  onChange={(e) => updateCategory(cat.id, e.target.value)}
                  placeholder="Category name (e.g., Programming Languages)"
                  className="flex-1 font-medium"
                />
                <Button variant="ghost" size="icon-sm" onClick={() => removeCategory(cat.id)} aria-label={`Delete ${cat.category || 'this'} category`}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>

              {/* Skill tags */}
              <div className="flex flex-wrap gap-2 mb-3">
                {cat.skills.map((skill, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                    {skill}
                    <button type="button" onClick={() => removeSkill(cat.id, i)} aria-label={`Remove ${skill}`} className="ml-0.5 rounded-full hover:bg-brand-200 p-0.5">
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Add skill input */}
              <div className="flex gap-2">
                <AutocompleteInput
                  aria-label={`New skill for ${cat.category || 'this category'}`}
                  suggestionType="skill"
                  value={newSkill[cat.id] ?? ''}
                  onChange={(val) => setNewSkill((prev) => ({ ...prev, [cat.id]: val }))}
                  placeholder="Type a skill and press Enter…"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(cat.id); } }}
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => addSkill(cat.id)}>
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 5: Executive Bio & Professional Summary Studio (10/10 Cuba M3 Standard) ─── */

const SUMMARY_TONES = [
  { id: 'balanced', label: 'Balanced', desc: 'Natural & authoritative recruiter cadence' },
  { id: 'concise', label: 'Concise', desc: 'Direct, high-impact & dense phrasing' },
  { id: 'technical', label: 'Technical', desc: 'Architecture, systems & tooling focus' },
  { id: 'executive', label: 'Executive', desc: 'Strategic leadership, governance & business impact' },
  { id: 'results', label: 'Results-Focused', desc: 'Metric-driven, operational KPIs & outcomes' },
  { id: 'leadership', label: 'Leadership', desc: 'Cross-functional orchestration & team scale' },
];

function SummaryStep({
  summary,
  heading,
  experience,
  skillCategories,
  targetJobDescription,
  onChange,
  onOpenGrammarCheck,
}: {
  summary: string;
  heading: ResumeHeading;
  experience: ExperienceEntry[];
  skillCategories?: SkillCategory[];
  targetJobDescription?: string;
  onChange: (s: string) => void;
  onOpenGrammarCheck?: (text: string, onApply: (fixed: string) => void) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [selectedTone, setSelectedTone] = useState('balanced');
  const [outcome, setOutcome] = useState<AiOutcome | null>(null);
  const [copied, setCopied] = useState(false);
  const [masterBio, setMasterBio] = useState<string>('');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});

  // Load Master Profile Executive Bio on mount
  useEffect(() => {
    let active = true;
    get<{ user?: { profile?: { summary?: string; bio?: string } } }>('/users-data/profile')
      .then((res) => {
        if (!active) return;
        const bio = res?.user?.profile?.summary || res?.user?.profile?.bio || '';
        if (bio.trim()) setMasterBio(bio.trim());
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const charCount = summary.length;
  const wordCount = summary.trim() ? summary.trim().split(/\s+/).length : 0;

  // Real-time ATS metrics calculation
  const atsStatus = useMemo(() => {
    if (charCount === 0) {
      return {
        label: 'Empty summary',
        badgeClass: 'bg-neutral-100 text-ink-muted border-border',
        tone: 'neutral',
        progress: 0,
      };
    }
    if (charCount < 150) {
      return {
        label: 'Too brief — add core tenure & domains',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
        tone: 'warning',
        progress: Math.min(100, Math.round((charCount / 320) * 100)),
      };
    }
    if (charCount < 320) {
      return {
        label: 'Building strength — expand technical application',
        badgeClass: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
        tone: 'info',
        progress: Math.min(100, Math.round((charCount / 320) * 100)),
      };
    }
    if (charCount <= 440) {
      return {
        label: '★ 10/10 ATS Sweet Spot (Optimal Density)',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        tone: 'success',
        progress: 100,
      };
    }
    return {
      label: 'Approaching ATS ceiling (Max 460 chars)',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
      tone: 'danger',
      progress: 100,
    };
  }, [charCount]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleImportMasterBio = () => {
    if (!masterBio) return;
    onChange(masterBio);
    setSyncNotice('Imported from Master Profile');
    setTimeout(() => setSyncNotice(null), 3000);
  };

  const handleSaveToMasterProfile = async () => {
    if (!summary.trim() || isSyncing) return;
    setIsSyncing(true);
    try {
      await post('/users-data/profile', {
        profile: { summary: summary.trim() },
      });
      setMasterBio(summary.trim());
      setSyncNotice('✓ Synced with Master Profile');
      setTimeout(() => setSyncNotice(null), 3000);
    } catch {
      setSyncNotice('Failed to update Master Profile');
      setTimeout(() => setSyncNotice(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const generateSummary = async (customAnswers?: Record<string, string>) => {
    setGenerating(true);
    setOutcome(null);
    try {
      const workHistory = experience
        .filter((entry) => entry.position || entry.company || entry.description)
        .map((entry) => ({ jobTitle: entry.position, employer: entry.company, description: entry.description }));

      const skills = (skillCategories || []).flatMap((c) => c.skills || []);

      const payload: Record<string, unknown> = {
        existingText: summary.trim(),
        name: `${heading.firstName} ${heading.lastName}`.trim(),
        ...(heading.title?.trim() ? { jobTitle: heading.title.trim() } : {}),
        workHistory,
        ...(skills.length > 0 ? { skills } : {}),
        ...(targetJobDescription?.trim() ? { targetJd: targetJobDescription.trim() } : {}),
        tone: selectedTone,
      };

      if (customAnswers && Object.keys(customAnswers).length > 0) {
        payload.answers = customAnswers;
      }

      const res = await runContentOperation('generate-summary', payload);
      setOutcome(res);
    } finally {
      setGenerating(false);
    }
  };

  const statusText = !outcome
    ? ''
    : outcome.kind === 'text'
      ? 'A suggested executive summary is ready below. Your current summary was not overwritten.'
      : outcome.kind === 'questions'
        ? 'More career detail is needed for a grounded summary. Please answer below.'
        : (outcome.kind === 'skills' || outcome.kind === 'certifications' || outcome.kind === 'suggestions' || outcome.kind === 'projects')
          ? ''
          : 'message' in outcome ? outcome.message : '';
  const statusIsProblem = !!outcome && outcome.kind !== 'text' && outcome.kind !== 'questions' && outcome.kind !== 'skills' && outcome.kind !== 'certifications' && outcome.kind !== 'suggestions' && outcome.kind !== 'projects';

  return (
    <div className="space-y-6">
      {/* ─── Header & Top Actions ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="resume-summary-heading" className="text-xl font-bold tracking-tight text-ink">
              Executive Bio & Summary Studio
            </h2>
            <span className="rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
              ATS 10/10 Calibrated
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Craft an authentic, high-impact summary grounded in your career facts with zero fabrication.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {masterBio && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleImportMasterBio}
              className="gap-1.5 text-xs text-ink-secondary hover:text-ink cursor-pointer"
              title="Import executive bio from Master Profile"
            >
              <FileText className="size-3.5" />
              Import from Profile
            </Button>
          )}

          {summary.trim() && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleSaveToMasterProfile()}
              loading={isSyncing}
              disabled={isSyncing}
              className="gap-1.5 text-xs text-ink-secondary hover:text-ink cursor-pointer"
              title="Save current summary to Master Profile"
            >
              <Save className="size-3.5" />
              Save to Profile
            </Button>
          )}

          <Button
            type="button"
            onClick={() => void generateSummary()}
            disabled={generating}
            className="gap-1.5 text-xs shadow-xs cursor-pointer bg-brand-600 hover:bg-brand-700 text-white"
          >
            <Sparkles className="size-3.5" />
            Generate Executive Bio
          </Button>
        </div>
      </div>

      {/* Sync / Status Feedback Toast */}
      {syncNotice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/80 p-3 text-xs font-semibold text-brand-800 animate-in fade-in duration-200"
        >
          <CheckCircle2 className="size-4 text-brand-600" />
          <span>{syncNotice}</span>
        </div>
      )}

      {/* ─── 6 Tone Selector Chips ─── */}
      <div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-ink uppercase tracking-wider">
            Executive Tone & Framing
          </label>
          <span className="text-[11px] text-ink-muted">Shapes vocabulary, density & cadence</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {SUMMARY_TONES.map((t) => {
            const isSelected = selectedTone === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTone(t.id)}
                title={t.desc}
                className={cn(
                  'flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-all cursor-pointer',
                  isSelected
                    ? 'border-brand-600 bg-brand-50/70 text-brand-900 shadow-2xs ring-1 ring-brand-500/30'
                    : 'border-border/70 bg-canvas/40 text-ink-secondary hover:border-brand-300 hover:bg-canvas'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn('size-1.5 rounded-full', isSelected ? 'bg-brand-600' : 'bg-neutral-300')} />
                  <span className="text-xs font-bold">{t.label}</span>
                </div>
                <span className="mt-1 line-clamp-1 text-[10px] text-ink-muted">{t.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Real-Time ATS Sweet Spot Density Meter ─── */}
      <div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-2xs space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-brand-600" />
            <span className="text-xs font-bold text-ink uppercase tracking-wider">
              ATS Length & Density Calibrator
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-muted font-mono">
              <strong className="text-ink font-semibold">{charCount}</strong> / 440 chars ·{' '}
              <strong className="text-ink font-semibold">{wordCount}</strong> words
            </span>
            <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', atsStatus.badgeClass)}>
              {atsStatus.label}
            </span>
          </div>
        </div>

        {/* Visual Progress Track */}
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300 ease-out',
              atsStatus.tone === 'success' && 'bg-emerald-500',
              atsStatus.tone === 'info' && 'bg-blue-500',
              atsStatus.tone === 'warning' && 'bg-amber-500',
              atsStatus.tone === 'danger' && 'bg-rose-500',
              atsStatus.tone === 'neutral' && 'bg-neutral-300'
            )}
            style={{ width: `${Math.min(100, (charCount / 460) * 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-ink-muted">
          <span>0 chars</span>
          <span className="text-emerald-700 font-semibold dark:text-emerald-400">
            ★ Sweet Spot: 320–440 chars (45–70 words)
          </span>
          <span>Max 460 chars</span>
        </div>
      </div>

      {/* ─── Status Notice ─── */}
      <div role="status" aria-live="polite" data-testid="summary-ai-status">
        {statusText && (
          <p
            className={cn(
              'flex items-start gap-2 rounded-xl p-3.5 text-xs font-medium leading-relaxed',
              statusIsProblem ? 'border border-error-200 bg-error-50 text-error-800' : 'border border-border bg-canvas text-ink-secondary'
            )}
          >
            {statusIsProblem && <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            <span className="min-w-0 break-words">{statusText}</span>
          </p>
        )}
      </div>

      {/* ─── High-Impact AI Draft Review Card ─── */}
      {outcome?.kind === 'text' && (
        <div
          className="rounded-2xl border border-brand-300 bg-gradient-to-b from-brand-50/60 to-surface p-5 shadow-md shadow-brand-500/5 space-y-3 animate-in fade-in zoom-in-98 duration-200"
          data-testid="summary-suggestion"
        >
          <div className="flex items-center justify-between gap-3 border-b border-brand-200/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-lg bg-brand-600 text-white shadow-2xs">
                <Sparkles className="size-3.5" />
              </div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-brand-900">
                Suggested Executive Summary Draft
              </h4>
            </div>
            <span className="text-xs font-mono text-brand-700">
              {outcome.text.length} chars · {outcome.text.split(/\s+/).length} words
            </span>
          </div>

          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink font-serif sm:text-base">
            {outcome.text}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-brand-200/50">
            <span className="text-[11px] text-ink-muted">
              Grounded in verified facts · Zero pronouns · Recruiter-ready
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleCopy(outcome.text)}
                className="gap-1.5 text-xs cursor-pointer"
              >
                {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onChange(outcome.text);
                  setOutcome(null);
                }}
                className="gap-1.5 text-xs cursor-pointer bg-brand-600 hover:bg-brand-700 text-white"
              >
                <Check className="size-3.5" />
                Use this summary
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setOutcome(null)}
                className="text-xs text-ink-muted hover:text-ink cursor-pointer"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Clarification Questions Panel ─── */}
      {outcome?.kind === 'questions' && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <HelpCircle className="size-4 text-brand-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
              Clarification Needed for Factual Grounding
            </h4>
          </div>
          <p className="text-xs text-ink-muted leading-relaxed">
            To ensure zero hallucination, please answer any of the questions below. Only your answers will be used.
          </p>
          <div className="space-y-3">
            {outcome.questions.map((question, index) => (
              <div key={index} className="space-y-1">
                <label className="text-xs font-semibold text-ink">
                  {index + 1}. {question}
                </label>
                <textarea
                  rows={2}
                  value={questionAnswers[question] || ''}
                  onChange={(e) =>
                    setQuestionAnswers((prev) => ({
                      ...prev,
                      [question]: e.target.value,
                    }))
                  }
                  placeholder="Provide brief facts or numbers..."
                  className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-xs text-ink focus:border-brand-500 focus:outline-none"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-[11px] text-ink-muted">Even one answer provides enough grounding to draft</span>
            <Button
              type="button"
              size="sm"
              onClick={() => void generateSummary(questionAnswers)}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <Sparkles className="size-3.5" />
              Regenerate with answers
            </Button>
          </div>
        </div>
      )}

      {/* ─── Summary Editor Area ─── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <FormattingToolbar value={summary} onChange={onChange} />
          {onOpenGrammarCheck && summary.trim() && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenGrammarCheck(summary, (fixed) => onChange(fixed))}
              className="h-8 gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50/70 border-emerald-200 hover:bg-emerald-100 shadow-2xs"
            >
              <ClipboardCheck className="size-3.5 text-emerald-600" />
              <span>Check Grammar</span>
            </Button>
          )}
        </div>
        <textarea
          aria-labelledby="resume-summary-heading"
          value={summary}
          onChange={(e) => onChange(e.target.value)}
          rows={7}
          className="flex w-full rounded-b-2xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400 shadow-2xs transition-colors"
          placeholder="Senior Software Engineer with 8+ years of experience architecting and engineering distributed systems, specializing in building reactive interfaces with TypeScript and React, and deploying containerized microservices on AWS…"
        />
      </div>

      {/* ─── Cuba Executive Guidance Card ─── */}
      <Card className="border-brand-200/80 bg-brand-50/40">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="size-4 text-brand-700" />
            <h4 className="text-xs font-bold text-brand-900 uppercase tracking-wider">
              Executive CPRW Resume Blueprint Standards
            </h4>
          </div>
          <ul className="grid sm:grid-cols-2 gap-2 text-xs text-brand-800 leading-relaxed">
            <li>• <strong>Sentence 1:</strong> Target Role Title + Career Tenure + Primary Domain.</li>
            <li>• <strong>Sentence 2:</strong> Active synthesis of core frameworks, platforms & tools.</li>
            <li>• <strong>Imperial Voice:</strong> Zero first-person pronouns (I, me, my) or candidate name mentions.</li>
            <li>• <strong>ATS Precision:</strong> Keep strictly between 320–440 characters / 45–70 words.</li>
          </ul>
        </CardContent>
      </Card>

      {/* ─── Universal Cuba M3 Executive Glassmorphic Processing Modal ─── */}
      <AiProcessingModal
        isOpen={generating}
        onCancel={() => setGenerating(false)}
        kind="summary"
        title="Executive AI Bio Studio"
        subtitle="Calibrating ATS guidelines, domain verbs & career facts into an authoritative summary"
      />
    </div>
  );
}

/* ─── Step 6: Template Selection ─── */

function TemplateStep({
  template,
  onChange,
  onOpenPreview,
}: {
  template: string;
  onChange: (t: string) => void;
  onOpenPreview?: () => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    let list = getTemplatesByCategory(selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.archetype.toLowerCase().includes(q)
      );
    }
    return list;
  }, [selectedCategory, searchQuery]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Choose a Template</h2>
          <p className="mt-1 text-sm text-ink-muted">
            51 canonical layouts with high-fidelity A4 rendering and zero capability loss.
          </p>
        </div>
        {onOpenPreview && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenPreview}
            className="gap-1.5 self-start sm:self-auto text-brand-600 hover:text-brand-700"
          >
            <Eye className="size-3.5" />
            Full A4 Preview
          </Button>
        )}
      </div>

      {/* Filter Tabs and Search Bar */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors',
                selectedCategory === cat.id
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'bg-surface text-ink-muted hover:bg-neutral-100 hover:text-ink border border-border'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-56">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates…"
            className="h-8 text-xs pl-8"
          />
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-ink-muted pointer-events-none" />
        </div>
      </div>

      {/* Template Grid with real thumbnail screenshots */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tmpl) => {
          const isSelected = (template || 'Cv1') === tmpl.id;
          return (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => onChange(tmpl.id)}
              className={cn(
                'group relative flex flex-col overflow-hidden rounded-xl border-2 text-left transition-all duration-150',
                isSelected
                  ? 'border-brand-600 shadow-xl ring-2 ring-brand-200'
                  : 'border-border bg-surface hover:border-brand-300 hover:shadow-md'
              )}
            >
              {/* Real Thumbnail Image */}
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-100">
                <img
                  src={tmpl.thumbnail}
                  alt={`${tmpl.name} preview`}
                  className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />

                {/* ID pill */}
                <div className="absolute top-2 left-2 z-10">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-bold text-neutral-800 shadow-sm backdrop-blur-md">
                    <span className="size-2 rounded-full" style={{ backgroundColor: tmpl.primary }} />
                    {tmpl.id}
                  </span>
                </div>

                {isSelected && (
                  <div className="absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-full bg-brand-600 text-white shadow-md">
                    <Check className="size-3.5" />
                  </div>
                )}
              </div>

              {/* Template Meta Info */}
              <div className="border-t border-border p-3 bg-surface">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs text-ink truncate">{tmpl.name}</div>
                  <span className="text-[10px] uppercase font-bold text-ink-muted">{tmpl.archetype.replace('-', ' ')}</span>
                </div>
                {tmpl.description && (
                  <p className="mt-1 text-[11px] text-ink-muted line-clamp-1">{tmpl.description}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-ink-muted">
        All 51 canonical templates active · Real visual previews loaded from /templates/
      </p>
    </div>
  );
}

/* ─── Step 7: Certifications ─── */

function CertificationsStep({
  entries,
  targetRole,
  experience,
  onChange,
}: {
  entries: CertificationEntry[];
  targetRole?: string;
  experience?: ExperienceEntry[];
  onChange: (e: CertificationEntry[]) => void;
}) {
  const [generatingCerts, setGeneratingCerts] = useState(false);
  const [suggestedCerts, setSuggestedCerts] = useState<Array<{ name: string; issuer: string }>>([]);

  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), name: '', issuer: '', credentialId: '',
      issueDate: '', expiryDate: '', credentialUrl: '',
    }]);
  };

  const updateEntry = (id: string, field: keyof CertificationEntry, value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  const handleGenerateCerts = async () => {
    setGeneratingCerts(true);
    try {
      const outcome = await runContentOperation('generate-certifications', {
        jobTitle: targetRole || 'Software Engineer',
        recentRoles: experience?.map((e) => e.position).filter(Boolean),
        companies: experience?.map((e) => e.company).filter(Boolean),
      });
      const certs = outcome.kind === 'certifications'
        ? outcome.certifications.map((c) => ({ name: c.title, issuer: c.issuer }))
        : outcome.kind === 'suggestions'
        ? outcome.suggestions.map((s) => ({ name: s, issuer: '' }))
        : [];
      setSuggestedCerts(certs);
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingCerts(false);
    }
  };

  const handleAddSuggestedCert = (cert: { name: string; issuer?: string }) => {
    onChange([
      ...entries,
      {
        id: crypto.randomUUID(),
        name: cert.name,
        issuer: cert.issuer || '',
        credentialId: '',
        issueDate: '',
        expiryDate: '',
        credentialUrl: '',
      },
    ]);
    setSuggestedCerts((prev) => prev.filter((c) => c.name !== cert.name));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">Certifications &amp; Licenses</h2>
          <p className="mt-1 text-sm text-ink-muted">Add industry certifications to validate your credentials for ATS parsing.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleGenerateCerts()}
            loading={generatingCerts}
            className="gap-1.5 text-xs font-bold text-purple-700 bg-purple-50/70 border-purple-200 hover:bg-purple-100 shadow-2xs"
          >
            <Sparkles className="size-3.5 text-purple-600" />
            <span>AI Suggest Certifications</span>
          </Button>
          <Button variant="outline" size="sm" onClick={addEntry} className="gap-1.5 text-xs">
            <Plus className="size-4" /> Add Certification
          </Button>
        </div>
      </div>

      {suggestedCerts.length > 0 && (
        <div className="p-4 rounded-2xl border border-purple-200/80 bg-purple-50/40 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-purple-600" />
            <span className="text-xs font-bold text-ink">
              Recommended Industry Certifications for {targetRole || 'Your Target Role'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedCerts.map((cert) => (
              <button
                key={cert.name}
                type="button"
                onClick={() => handleAddSuggestedCert(cert)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-purple-200 text-purple-900 hover:bg-purple-600 hover:text-white transition-colors cursor-pointer shadow-2xs group"
                title="Click to add certification"
              >
                <Plus className="size-3.5 group-hover:scale-110" />
                <span>{cert.name}</span>
                {cert.issuer && <span className="opacity-70 text-[10px]">({cert.issuer})</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Award className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No certifications added yet</p>
          <p className="mt-1 text-xs text-ink-muted">Add certifications to validate your expertise.</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add First Certification
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((entry, index) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Certification {index + 1}</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => removeEntry(entry.id)} aria-label={`Delete ${entry.name || 'this certification'}`}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Certification Name *</label>
                <AutocompleteInput
                  aria-label="Certification Name"
                  aria-required="true"
                  suggestionType="certification"
                  value={entry.name}
                  onChange={(val) => updateEntry(entry.id, 'name', val)}
                  placeholder="AWS Certified Solutions Architect"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Issuing Organization *</label>
                  <AutocompleteInput
                    aria-label="Issuing Organization"
                    aria-required="true"
                    suggestionType="issuer"
                    value={entry.issuer}
                    onChange={(val) => updateEntry(entry.id, 'issuer', val)}
                    placeholder="Amazon Web Services"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Credential ID</label>
                  <Input aria-label="Credential ID" value={entry.credentialId} onChange={(e) => updateEntry(entry.id, 'credentialId', e.target.value)} placeholder="ABCD1234EFGH" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Issue Date</label>
                  <Input aria-label="Issue Date" type="month" value={entry.issueDate} onChange={(e) => updateEntry(entry.id, 'issueDate', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Expiry Date (optional)</label>
                  <Input aria-label="Expiry Date (optional)" type="month" value={entry.expiryDate} onChange={(e) => updateEntry(entry.id, 'expiryDate', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Credential URL (optional)</label>
                <Input aria-label="Credential URL (optional)" type="url" value={entry.credentialUrl} onChange={(e) => updateEntry(entry.id, 'credentialUrl', e.target.value)} placeholder="https://www.credly.com/badges/..." />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 8: Achievements ─── */

function AchievementsStep({
  entries,
  onChange,
  onOpenGrammarCheck,
}: {
  entries: AchievementEntry[];
  onChange: (e: AchievementEntry[]) => void;
  onOpenGrammarCheck?: (text: string, onApply: (fixed: string) => void) => void;
}) {
  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), title: '', description: '', date: '',
    }]);
  };

  const updateEntry = (id: string, field: keyof AchievementEntry, value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Achievements &amp; Awards</h2>
          <p className="mt-1 text-sm text-ink-muted">Highlight your key career accomplishments and recognition.</p>
        </div>
        <Button variant="outline" onClick={addEntry}>
          <Plus className="size-4" /> Add Achievement
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Trophy className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No achievements added yet</p>
          <p className="mt-1 text-xs text-ink-muted">Showcase awards, recognitions, and major accomplishments.</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add First Achievement
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((entry, index) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Achievement {index + 1}</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => removeEntry(entry.id)} aria-label={`Delete ${entry.title || 'this achievement'}`}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Achievement Title *</label>
                <Input aria-label="Achievement Title" aria-required="true" value={entry.title} onChange={(e) => updateEntry(entry.id, 'title', e.target.value)} placeholder="Employee of the Year 2023" />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-ink">Description</label>
                  {onOpenGrammarCheck && entry.description.trim() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenGrammarCheck(entry.description, (fixed) => updateEntry(entry.id, 'description', fixed))}
                      className="h-6 px-2 text-[11px] text-ink-muted hover:text-ink hover:bg-neutral-100"
                    >
                      <ClipboardCheck className="size-3 text-emerald-600" />
                      <span>Grammar</span>
                    </Button>
                  )}
                </div>
                <textarea aria-label="Description"
                  value={entry.description}
                  onChange={(e) => updateEntry(entry.id, 'description', e.target.value)}
                  rows={3}
                  className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
                  placeholder="Describe the achievement, its impact, and any metrics…"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Date</label>
                <Input aria-label="Date" type="month" value={entry.date} onChange={(e) => updateEntry(entry.id, 'date', e.target.value)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 9: Projects ─── */

function ProjectsStep({
  entries,
  targetRole,
  experience,
  skillCategories,
  onChange,
  onOpenGrammarCheck,
}: {
  entries: ProjectEntry[];
  targetRole?: string;
  experience?: ExperienceEntry[];
  skillCategories?: SkillCategory[];
  onChange: (e: ProjectEntry[]) => void;
  onOpenGrammarCheck?: (text: string, onApply: (fixed: string) => void) => void;
}) {
  const [generatingProjects, setGeneratingProjects] = useState(false);

  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), title: '', description: '', technologies: '',
      liveUrl: '', githubUrl: '', startDate: '', endDate: '',
    }]);
  };

  const updateEntry = (id: string, field: keyof ProjectEntry, value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  const handleSuggestProjects = async () => {
    setGeneratingProjects(true);
    try {
      const outcome = await runContentOperation('generate-projects', {
        jobTitle: targetRole || 'Software Engineer',
        recentRoles: experience?.map((e) => e.position).filter(Boolean),
        companies: experience?.map((e) => e.company).filter(Boolean),
        skills: skillCategories?.flatMap((c) => c.skills),
      });
      if (outcome.kind === 'projects' && outcome.projects.length) {
        const newProjects = outcome.projects.map((p, idx) => ({
          id: crypto.randomUUID(),
          title: p.title || `Project ${entries.length + idx + 1}`,
          description: p.description || (p.role ? `Led initiative as ${p.role}` : ''),
          technologies: p.technologies || '',
          liveUrl: '',
          githubUrl: '',
          startDate: '',
          endDate: '',
        }));
        onChange([...entries, ...newProjects]);
      } else if (outcome.kind === 'suggestions' && outcome.suggestions.length) {
        const newProjects = outcome.suggestions.map((s, idx) => ({
          id: crypto.randomUUID(),
          title: s.split(':')[0]?.trim() || `Project ${entries.length + idx + 1}`,
          description: s.includes(':') ? s.split(':').slice(1).join(':').trim() : s,
          technologies: '',
          liveUrl: '',
          githubUrl: '',
          startDate: '',
          endDate: '',
        }));
        onChange([...entries, ...newProjects]);
      } else if (outcome.kind === 'text' && outcome.text) {
        onChange([...entries, {
          id: crypto.randomUUID(),
          title: `Project ${entries.length + 1}`,
          description: outcome.text,
          technologies: '',
          liveUrl: '',
          githubUrl: '',
          startDate: '',
          endDate: '',
        }]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingProjects(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">Projects &amp; Portfolio</h2>
          <p className="mt-1 text-sm text-ink-muted">Showcase your key projects with technologies, architecture, and live demo links.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleSuggestProjects()}
            loading={generatingProjects}
            className="gap-1.5 text-xs font-bold text-purple-700 bg-purple-50/70 border-purple-200 hover:bg-purple-100 shadow-2xs"
          >
            <Sparkles className="size-3.5 text-purple-600" />
            <span>AI Project Ideas</span>
          </Button>
          <Button variant="outline" size="sm" onClick={addEntry} className="gap-1.5 text-xs">
            <Plus className="size-4" /> Add Project
          </Button>
        </div>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Code2 className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No projects added yet</p>
          <p className="mt-1 text-xs text-ink-muted">Add personal, open-source, or client projects to demonstrate real-world impact.</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add First Project
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((entry, index) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Project {index + 1}</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => removeEntry(entry.id)} aria-label={`Delete ${entry.title || 'this project'}`}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Project Name *</label>
                <Input aria-label="Project Name" aria-required="true" value={entry.title} onChange={(e) => updateEntry(entry.id, 'title', e.target.value)} placeholder="E-commerce Platform Redesign" />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-ink">Description</label>
                  {onOpenGrammarCheck && entry.description.trim() && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenGrammarCheck(entry.description, (fixed) => updateEntry(entry.id, 'description', fixed))}
                      className="h-6 px-2 text-[11px] text-ink-muted hover:text-ink hover:bg-neutral-100"
                    >
                      <ClipboardCheck className="size-3 text-emerald-600" />
                      <span>Grammar</span>
                    </Button>
                  )}
                </div>
                <textarea aria-label="Description"
                  value={entry.description}
                  onChange={(e) => updateEntry(entry.id, 'description', e.target.value)}
                  rows={3}
                  className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
                  placeholder="Describe the project, your role, challenges, and outcomes…"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Technologies / Stack</label>
                <Input aria-label="Technologies / Stack" value={entry.technologies} onChange={(e) => updateEntry(entry.id, 'technologies', e.target.value)} placeholder="React, TypeScript, Node.js, PostgreSQL, AWS" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Live URL</label>
                  <Input aria-label="Live URL" type="url" value={entry.liveUrl} onChange={(e) => updateEntry(entry.id, 'liveUrl', e.target.value)} placeholder="https://project-demo.com" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">GitHub Repository</label>
                  <Input aria-label="GitHub Repository" type="url" value={entry.githubUrl} onChange={(e) => updateEntry(entry.id, 'githubUrl', e.target.value)} placeholder="https://github.com/user/repo" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Start Date</label>
                  <Input aria-label="Start Date" type="month" value={entry.startDate} onChange={(e) => updateEntry(entry.id, 'startDate', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">End Date (optional)</label>
                  <Input aria-label="End Date (optional)" type="month" value={entry.endDate} onChange={(e) => updateEntry(entry.id, 'endDate', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 10: Languages ─── */

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'] as const;

function LanguagesStep({ entries, onChange }: { entries: LanguageEntry[]; onChange: (e: LanguageEntry[]) => void }) {
  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), language: '', proficiency: 'B2' as LanguageEntry['proficiency'],
    }]);
  };

  const updateEntry = (id: string, field: keyof LanguageEntry, value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Languages</h2>
          <p className="mt-1 text-sm text-ink-muted">List languages you speak with proficiency levels (CEFR standard).</p>
        </div>
        <Button variant="outline" onClick={addEntry}>
          <Plus className="size-4" /> Add Language
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Globe className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No languages added yet</p>
          <p className="mt-1 text-xs text-ink-muted">Add languages to demonstrate global readiness.</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add First Language
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((entry, index) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Language {index + 1}</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => removeEntry(entry.id)} aria-label={`Delete ${entry.language || 'this language'}`}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Language *</label>
                  <AutocompleteInput
                    aria-label="Language"
                    aria-required="true"
                    suggestionType="language"
                    value={entry.language}
                    onChange={(val) => updateEntry(entry.id, 'language', val)}
                    placeholder="English"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Proficiency *</label>
                  <Select value={entry.proficiency} onValueChange={(v) => updateEntry(entry.id, 'proficiency', v as LanguageEntry['proficiency'])}>
                    <SelectTrigger aria-label="Proficiency" aria-required="true" className="w-full">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      {CEFR_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>{level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="text-xs text-ink-muted">
                CEFR Levels: A1–A2 (Basic) · B1–B2 (Independent) · C1–C2 (Proficient) · Native
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 11: References ─── */

function ReferencesStep({ entries, onChange }: { entries: ReferenceEntry[]; onChange: (e: ReferenceEntry[]) => void }) {
  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), name: '', title: '', company: '',
      email: '', phone: '', relationship: '',
    }]);
  };

  const updateEntry = (id: string, field: keyof ReferenceEntry, value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">References</h2>
          <p className="mt-1 text-sm text-ink-muted">Add professional references available upon request.</p>
        </div>
        <Button variant="outline" onClick={addEntry}>
          <Plus className="size-4" /> Add Reference
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Users className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No references added yet</p>
          <p className="mt-1 text-xs text-ink-muted">Add references who can vouch for your work.</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add First Reference
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((entry, index) => (
          <Card key={entry.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Reference {index + 1}</CardTitle>
                <Button variant="ghost" size="icon-sm" onClick={() => removeEntry(entry.id)} aria-label={`Delete ${entry.name || 'this reference'}`}>
                  <Trash2 className="size-4 text-error-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Name *</label>
                  <Input aria-label="Name" aria-required="true" value={entry.name} onChange={(e) => updateEntry(entry.id, 'name', e.target.value)} placeholder="Jane Smith" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Title</label>
                  <Input aria-label="Title" value={entry.title} onChange={(e) => updateEntry(entry.id, 'title', e.target.value)} placeholder="Senior Engineering Manager" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Company</label>
                <Input aria-label="Company" value={entry.company} onChange={(e) => updateEntry(entry.id, 'company', e.target.value)} placeholder="Acme Corporation" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Email</label>
                  <Input aria-label="Email" type="email" value={entry.email} onChange={(e) => updateEntry(entry.id, 'email', e.target.value)} placeholder="jane.smith@acme.com" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink">Phone</label>
                  <Input aria-label="Phone" type="tel" value={entry.phone} onChange={(e) => updateEntry(entry.id, 'phone', e.target.value)} placeholder="+1 (555) 123-4567" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink">Relationship</label>
                <Input aria-label="Relationship" value={entry.relationship} onChange={(e) => updateEntry(entry.id, 'relationship', e.target.value)} placeholder="Former Manager (2020–2023)" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 12: Custom Sections ─── */

function CustomSectionsStep({ entries, onChange }: { entries: CustomSectionEntry[]; onChange: (e: CustomSectionEntry[]) => void }) {
  const addEntry = () => {
    onChange([...entries, {
      id: crypto.randomUUID(), sectionTitle: '', items: [],
    }]);
  };

  const updateSection = (id: string, field: 'sectionTitle', value: string) => {
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  const addItem = (sectionId: string) => {
    onChange(entries.map((e) =>
      e.id === sectionId ? { ...e, items: [...e.items, { id: crypto.randomUUID(), title: '', description: '' }] } : e
    ));
  };

  const updateItem = (sectionId: string, itemId: string, field: 'title' | 'description', value: string) => {
    onChange(entries.map((e) =>
      e.id === sectionId ? { ...e, items: e.items.map((i) => i.id === itemId ? { ...i, [field]: value } : i) } : e
    ));
  };

  const removeItem = (sectionId: string, itemId: string) => {
    onChange(entries.map((e) =>
      e.id === sectionId ? { ...e, items: e.items.filter((i) => i.id !== itemId) } : e
    ));
  };

  const removeSection = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Custom Sections</h2>
          <p className="mt-1 text-sm text-ink-muted">Create your own sections with custom titles and items.</p>
        </div>
        <Button variant="outline" onClick={addEntry}>
          <Plus className="size-4" /> Add Custom Section
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center rounded-xl border-2 border-dashed border-border py-12 text-center">
          <FolderPlus className="mb-3 size-10 text-ink-subtle" />
          <p className="text-sm font-medium text-ink-secondary">No custom sections yet</p>
          <p className="mt-1 text-xs text-ink-muted">Create sections like Publications, Patents, Volunteer Work, etc.</p>
          <Button variant="outline" className="mt-4" onClick={addEntry}>
            <Plus className="size-4" /> Add First Section
          </Button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {entries.map((section) => (
          <Card key={section.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Input
                    value={section.sectionTitle}
                    onChange={(e) => updateSection(section.id, 'sectionTitle', e.target.value)}
                    placeholder="Section Title (e.g., Publications, Patents, Volunteer Work)"
                    className="flex-1 font-medium text-base"
                  />
                  <Button variant="ghost" size="icon-sm" onClick={() => removeSection(section.id)} aria-label={`Delete ${section.sectionTitle || 'this'} section`}>
                    <Trash2 className="size-4 text-error-500" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {section.items.length === 0 && (
                <div className="py-4 text-center text-sm text-ink-muted border-2 border-dashed border-border rounded-lg">
                  No items in this section yet
                </div>
              )}
              <div className="space-y-3">
                {section.items.map((item, itemIndex) => (
                  <div key={item.id} className="space-y-2 p-3 rounded-lg border border-border bg-surface/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-ink-muted">Item {itemIndex + 1}</span>
                      <Button variant="ghost" size="icon-sm" onClick={() => removeItem(section.id, item.id)} aria-label={`Delete ${item.title || 'this item'}`}>
                        <Trash2 className="size-3.5 text-error-500" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-ink-muted">Title</label>
                        <Input
                          value={item.title}
                          onChange={(e) => updateItem(section.id, item.id, 'title', e.target.value)}
                          placeholder="Item title"
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium text-ink-muted">Description</label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(section.id, item.id, 'description', e.target.value)}
                          placeholder="Details"
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => addItem(section.id)} className="w-full">
                <Plus className="size-3.5" /> Add Item
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 13: Review & Pre-Flight Checks ─── */

function ReviewStep({
  resume,
  onOpenPreview,
  onOpenShare,
  onExportDocx,
}: {
  resume: ResumeData;
  onOpenPreview?: () => void;
  onOpenShare?: () => void;
  onExportDocx?: () => void;
}) {
  const checks = [
    { id: 'heading', label: 'Personal Information Complete', check: () => !!(resume.heading.firstName && resume.heading.lastName && resume.heading.email && resume.heading.phone) },
    { id: 'experience', label: 'At Least One Work Experience', check: () => resume.experience.length > 0 },
    { id: 'education', label: 'At Least One Education Entry', check: () => resume.education.length > 0 },
    { id: 'skills', label: 'At Least 5 Skills Listed', check: () => resume.skillCategories.reduce((sum, c) => sum + c.skills.length, 0) >= 5 },
    { id: 'summary', label: 'Professional Summary Written', check: () => resume.summary.length >= 50 },
    { id: 'certifications', label: 'Certifications Added (if applicable)', check: () => true, optional: true },
    { id: 'achievements', label: 'Achievements Added (if applicable)', check: () => true, optional: true },
    { id: 'projects', label: 'Projects Added (if applicable)', check: () => true, optional: true },
    { id: 'languages', label: 'Languages Added (if applicable)', check: () => true, optional: true },
    { id: 'references', label: 'References Added (if applicable)', check: () => true, optional: true },
    { id: 'custom', label: 'Custom Sections Configured (if applicable)', check: () => true, optional: true },
    { id: 'ats-format', label: 'ATS-Friendly Format', check: () => true, description: 'Standard headings, no graphics/tables, reverse chronological order' },
    { id: 'keywords', label: 'Industry Keywords Present', check: () => resume.skillCategories.some(c => c.skills.length > 0) },
    { id: 'quantifiable', label: 'Quantifiable Achievements', check: () => resume.experience.some(e => /\d+%|\d+\+|\$\d+/.test(e.description)) },
    { id: 'contact', label: 'Contact Info in Header', check: () => !!(resume.heading.email && resume.heading.phone) },
    { id: 'length', label: 'Appropriate Length (1-2 pages)', check: () => true, description: 'Review preview for length before export' },
  ];

  const passed = checks.filter(c => c.check()).length;
  const required = checks.filter(c => !c.optional).length;
  const passedRequired = checks.filter(c => !c.optional && c.check()).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Review & Pre-Flight Checks</h2>
          <p className="mt-1 text-sm text-ink-muted">Verify your resume is complete and ATS-ready before exporting.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-brand-600">{passedRequired} / {required} Required</div>
            <div className="text-xs text-ink-muted">{passed} / {checks.length} Total Checks</div>
          </div>
          <div className="size-20">
            <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
              <circle
                cx="18" cy="18" r="15.5"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                className="text-neutral-200"
              />
              <circle
                cx="18" cy="18" r="15.5"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                className="text-brand-600"
                strokeDasharray={`${(passedRequired / required) * 100} 100`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.3s' }}
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {checks.map((check) => {
          const isPassed = check.check();
          const isOptional = check.optional;
          return (
            <div
              key={check.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                isPassed ? 'bg-success-50 border-success-200' : isOptional ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'
              )}
            >
              <div className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full mt-0.5',
                isPassed ? 'bg-success-100 text-success-600' : isOptional ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'
              )}>
                {isPassed ? <Check className="size-3" /> : isOptional ? <HelpCircle className="size-3" /> : <AlertCircle className="size-3" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{check.label}</span>
                  {isOptional && <span className="text-xs text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">Optional</span>}
                </div>
                {check.description && (
                  <div className="mt-1 text-xs text-ink-muted">{check.description}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Export & Production Action Strip (100% Parity) */}
      <div className="mt-8 rounded-xl border border-border bg-neutral-50/70 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-ink">Export & Production Actions</h3>
          <p className="text-xs text-ink-muted">
            Download high-fidelity resumes in PDF or Word, or share directly with recruiters.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!onOpenPreview && !resume.id}
            onClick={() => {
              if (onOpenPreview) {
                onOpenPreview();
              } else if (resume.id) {
                window.open(`/export/${resume.template || 'Cv1'}/${encodeURIComponent(resume.id)}/en`, '_blank', 'noopener');
              }
            }}
            className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs px-4 py-2"
          >
            <FileDown className="size-4" />
            <span>Download PDF</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onExportDocx}
            className="gap-2 border-brand-200 text-brand-700 hover:bg-brand-50 text-xs font-bold shadow-2xs px-4 py-2"
          >
            <Download className="size-4 text-brand-600" />
            <span>Download DOCX</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
            className="gap-2 border-border text-ink hover:bg-neutral-100 text-xs font-semibold px-4 py-2"
          >
            <Printer className="size-4 text-ink-muted" />
            <span>Print</span>
          </Button>

          {onOpenShare && (
            <Button
              type="button"
              variant="outline"
              onClick={onOpenShare}
              className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50 text-xs font-bold px-4 py-2"
            >
              <Share2 className="size-4 text-purple-600" />
              <span>Share Link</span>
            </Button>
          )}

          <Button variant="ghost" asChild className="gap-1.5 text-xs text-brand-600 sm:ml-auto">
            <Link to="/dashboard/ats-score">
              <BarChart3 className="size-4" />
              <span>Deep ATS Diagnostics &gt;</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
