/**
 * Master Resume & CV Export Engine
 *
 * Vector-sharp printable document rendering supporting all 51 CV templates
 * and 4 Cover Letter templates, plus public shared resume views.
 *
 * Features:
 * - High-fidelity print styles (@media print)
 * - 51 Template layout variations across 8 design archetypes
 * - 7 Curated color palettes
 * - Density & font size scaling
 * - Quick template switcher
 * - Print & Save to PDF triggers
 * - Graceful fallback to rich realistic data when offline/testing
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { get } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { TEMPLATES, COVER_TEMPLATES, getTemplateMeta } from '@/lib/template-catalog';
import { SmartResumeDocument } from '@/components/resume/smart-resume-document';
import {
  Printer,
  Share2,
  ChevronLeft,
  Layout,
  Palette,
  ZoomIn,
  ZoomOut,
  Mail,
  Phone,
  MapPin,
  Check,
  Download,
} from 'lucide-react';

function LinkedinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

/* ─── Mock Realistic Fallback ─── */
const FALLBACK_RESUME = {
  id: 'demo-resume-1',
  name: 'Alex Morgan — Senior Staff Engineer',
  template: '1',
  heading: {
    firstName: 'Alex',
    lastName: 'Morgan',
    title: 'Senior Staff Software Engineer & Cloud Architect',
    email: 'alex.morgan@example.com',
    phone: '+1 (555) 382-9014',
    location: 'San Francisco, CA',
    website: 'https://alexmorgan.dev',
    linkedin: 'linkedin.com/in/alexmorgan-tech',
    github: 'github.com/alexmorgan-code',
    photo: '',
    showPhoto: false,
  },
  summary:
    'Innovative and results-driven Senior Staff Software Engineer with 8+ years of experience architecting high-scale distributed systems, enterprise cloud infrastructure, and AI-accelerated workflows. Proven track record leading cross-functional teams to deliver 99.99% availability, reducing infrastructure operational costs by 42%, and driving developer velocity across global engineering organizations.',
  experience: [
    {
      id: 'exp-1',
      company: 'CloudScale Networks Inc.',
      position: 'Staff Infrastructure Architect',
      location: 'San Francisco, CA',
      startDate: '2022',
      endDate: 'Present',
      current: true,
      description:
        '• Spearheaded migration of 140+ microservices to Kubernetes multi-region cluster, slashing p99 latency from 450ms to 48ms.\n• Designed and rolled out zero-trust service mesh using Envoy and mTLS, achieving SOC2 Type II compliance ahead of schedule.\n• Mentored 18 senior engineers and established company-wide RFC architecture guild and CI/CD canary deployment standards.',
    },
    {
      id: 'exp-2',
      company: 'FinTech Innovations Global',
      position: 'Senior Full-Stack Engineer',
      location: 'New York, NY',
      startDate: '2019',
      endDate: '2022',
      current: false,
      description:
        '• Engineered real-time payments settlement pipeline processing $18M+ daily volume using Node.js, Go, Kafka, and PostgreSQL.\n• Architected optimistic UI state synchronization with WebSockets, driving user conversion on checkout pages up by 24%.\n• Automated end-to-end integration test suites with Playwright, decreasing production defect escape rate by 68%.',
    },
    {
      id: 'exp-3',
      company: 'Nexus Digital Systems',
      position: 'Software Engineer',
      location: 'Austin, TX',
      startDate: '2017',
      endDate: '2019',
      current: false,
      description:
        '• Developed customer analytics telemetry platform ingesting 100M+ daily events with Redis and Elasticsearch.\n• Refactored legacy monolithic Rails application into containerized GraphQL services, reducing memory footprint by 35%.',
    },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'University of California, Berkeley',
      degree: 'Master of Science',
      field: 'Computer Science (Distributed Systems)',
      startDate: '2015',
      endDate: '2017',
      gpa: '3.92',
      description: 'Graduate Researcher in Autonomous Systems & Parallel Computing.',
    },
    {
      id: 'edu-2',
      institution: 'University of Washington',
      degree: 'Bachelor of Science',
      field: 'Computer Engineering',
      startDate: '2011',
      endDate: '2015',
      gpa: '3.88',
      description: 'Summa Cum Laude, Dean’s Honors List (all 8 semesters).',
    },
  ],
  skillCategories: [
    {
      id: 'cat-1',
      category: 'Languages & Core',
      skills: ['TypeScript', 'JavaScript', 'Go', 'Python', 'Rust', 'SQL', 'HTML5/CSS3'],
    },
    {
      id: 'cat-2',
      category: 'Frameworks & Runtimes',
      skills: ['React 19', 'Next.js', 'Node.js', 'Tailwind CSS', 'GraphQL', 'Express', 'FastAPI'],
    },
    {
      id: 'cat-3',
      category: 'Cloud & Infrastructure',
      skills: ['Kubernetes', 'Docker', 'AWS', 'Google Cloud', 'Terraform', 'Kafka', 'PostgreSQL', 'Redis'],
    },
    {
      id: 'cat-4',
      category: 'Architecture & Practices',
      skills: ['Microservices', 'Zero-Trust Security', 'System Design', 'CI/CD Pipelines', 'TDD', 'Agile Leadership'],
    },
  ],
  certifications: [
    { id: 'cert-1', name: 'AWS Certified Solutions Architect — Professional', issuer: 'Amazon Web Services', date: '2023' },
    { id: 'cert-2', name: 'Certified Kubernetes Administrator (CKA)', issuer: 'Linux Foundation', date: '2022' },
  ],
  projects: [
    { id: 'proj-1', title: 'High-Scale Distributed Cache', description: 'Engineered a low-latency multi-region distributed caching layer in Go.', technologies: 'Go, Redis, Raft', liveUrl: 'github.com/alexmorgan-code/dist-cache' },
  ],
  languages: [
    { id: 'lang-1', name: 'English', language: 'English', proficiency: 'Native / Bilingual' },
    { id: 'lang-2', name: 'Spanish', language: 'Spanish', proficiency: 'Professional Working' },
  ],
};

interface PaletteTheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  soft: string;
  text: string;
}

/* ─── Color Palettes ─── */
const PALETTES: PaletteTheme[] = [
  { id: 'indigo', name: 'Executive Indigo', primary: '#2540ed', secondary: '#4f6ff8', soft: '#eef2ff', text: '#1e29b0' },
  { id: 'slate', name: 'Slate Onyx', primary: '#1e293b', secondary: '#334155', soft: '#f1f5f9', text: '#0f172a' },
  { id: 'emerald', name: 'Modern Forest', primary: '#059669', secondary: '#10b981', soft: '#ecfdf5', text: '#064e3b' },
  { id: 'ocean', name: 'Pacific Blue', primary: '#0284c7', secondary: '#38bdf8', soft: '#f0f9ff', text: '#0369a1' },
  { id: 'amber', name: 'Warm Amber', primary: '#b45309', secondary: '#f59e0b', soft: '#fffbeb', text: '#78350f' },
  { id: 'rose', name: 'Crimson Rose', primary: '#be123c', secondary: '#fb7185', soft: '#fff1f2', text: '#881337' },
  { id: 'violet', name: 'Royal Violet', primary: '#7c3aed', secondary: '#a78bfa', soft: '#f5f3ff', text: '#5b21b6' },
];

function parseIfJson(val: any) {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }
  return val;
}

function normalizeToViewModel(raw: any) {
  if (!raw) return FALLBACK_RESUME;
  const res = raw.resume || raw.data || raw;

  // Heading extraction
  const firstName = res.heading?.firstName || res.firstname || res.firstName || '';
  const lastName = res.heading?.lastName || res.lastname || res.lastName || '';
  const title = res.heading?.title || res.occupation || res.jobTitle || res.title || '';
  const email = res.heading?.email || res.email || '';
  const phone = res.heading?.phone || res.phone || '';
  const location = res.heading?.location || [res.city, res.country].filter(Boolean).join(', ') || res.address || '';
  const website = res.heading?.website || res.website || res.websiteUrl || '';
  const linkedin = res.heading?.linkedin || res.linkedin || res.linkedinUrl || '';
  const github = res.heading?.github || res.github || res.githubUrl || '';
  const photo = res.heading?.photo || res.photo || res.avatar || res.picture || '';
  const showPhoto = res.heading?.showPhoto !== false && res.showPhoto !== false && Boolean(photo);

  // Experience / Employments
  const rawExp = parseIfJson(res.experience || res.employments || res.workExperiences || []);
  const experience = Array.isArray(rawExp) && rawExp.length > 0 ? rawExp.map((e: any, idx: number) => ({
    id: e.id || `exp-${idx}`,
    company: e.company || e.employer || e.organization || '',
    position: e.position || e.jobTitle || e.title || '',
    location: e.location || '',
    startDate: e.startDate || e.begin || e.started || '',
    endDate: e.endDate || e.end || e.finished || (e.current || e.currentWork ? 'Present' : ''),
    current: Boolean(e.current || e.currentWork || e.endDate === 'Present'),
    description: e.description || e.summary || '',
  })) : [];

  // Education
  const rawEdu = parseIfJson(res.education || res.educations || []);
  const education = Array.isArray(rawEdu) && rawEdu.length > 0 ? rawEdu.map((ed: any, idx: number) => ({
    id: ed.id || `edu-${idx}`,
    institution: ed.institution || ed.school || ed.organization || '',
    degree: ed.degree || ed.qualification || '',
    field: ed.field || ed.major || '',
    startDate: ed.startDate || ed.started || ed.begin || '',
    endDate: ed.endDate || ed.finished || ed.end || '',
    gpa: ed.gpa || '',
    description: ed.description || '',
  })) : [];

  // Skills
  let skillCategories = parseIfJson(res.skillCategories);
  const rawSkills = parseIfJson(res.skills);
  if ((!skillCategories || skillCategories.length === 0) && Array.isArray(rawSkills) && rawSkills.length > 0) {
    if (typeof rawSkills[0] === 'string') {
      skillCategories = [{ id: 'skills-1', category: 'Core Competencies', skills: rawSkills }];
    } else if (typeof rawSkills[0] === 'object') {
      const grouped: Record<string, string[]> = {};
      for (const s of rawSkills) {
        const cat = s.category || 'Skills';
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
  }

  // Certifications
  const rawCerts = parseIfJson(res.certifications);
  const certifications = Array.isArray(rawCerts) && rawCerts.length > 0 ? rawCerts.map((c: any, idx: number) => ({
    id: c.id || `cert-${idx}`,
    name: c.name || c.title || c.certificationName || '',
    issuer: c.issuer || c.institution || c.organization || '',
    date: c.date || c.issueDate || c.year || '',
    credentialId: c.credentialId || c.url || '',
  })) : [];

  // Projects
  const rawProjects = parseIfJson(res.projects);
  const projects = Array.isArray(rawProjects) && rawProjects.length > 0 ? rawProjects.map((p: any, idx: number) => ({
    id: p.id || `proj-${idx}`,
    title: p.title || p.name || p.projectName || '',
    technologies: p.technologies || p.techStack || p.skills || '',
    liveUrl: p.liveUrl || p.link || p.url || '',
    description: p.description || p.summary || '',
  })) : [];

  // Languages
  const rawLanguages = parseIfJson(res.languages);
  const languages = Array.isArray(rawLanguages) && rawLanguages.length > 0 ? rawLanguages.map((l: any, idx: number) => ({
    id: l.id || `lang-${idx}`,
    name: l.name || l.language || (typeof l === 'string' ? l : ''),
    language: l.language || l.name || (typeof l === 'string' ? l : ''),
    proficiency: l.proficiency || l.level || '',
  })) : [];

  // Achievements
  const rawAchievements = parseIfJson(res.achievements);
  const achievements = Array.isArray(rawAchievements) && rawAchievements.length > 0 ? rawAchievements.map((a: any, idx: number) => ({
    id: a.id || `ach-${idx}`,
    title: a.title || a.name || '',
    description: a.description || a.summary || '',
  })) : [];

  // Hobbies
  const rawHobbies = parseIfJson(res.hobbies);
  const hobbies = Array.isArray(rawHobbies) && rawHobbies.length > 0 ? rawHobbies.map((h: any) =>
    typeof h === 'string' ? h : (h.name || h.hobby || '')
  ).filter(Boolean) : [];

  // References
  const rawRefs = parseIfJson(res.references);
  const references = Array.isArray(rawRefs) && rawRefs.length > 0 ? rawRefs.map((r: any, idx: number) => ({
    id: r.id || `ref-${idx}`,
    name: r.name || r.referenceName || '',
    position: r.position || r.title || r.jobTitle || '',
    company: r.company || r.organization || '',
    email: r.email || '',
    phone: r.phone || '',
    description: r.description || r.recommendation || '',
  })) : [];

  return {
    id: res.id || 'resume-1',
    name: res.name || `${firstName} ${lastName}`.trim() || 'Untitled Resume',
    template: res.template || 'Cv1',
    heading: { firstName, lastName, title, email, phone, location, website, linkedin, github, photo, showPhoto },
    summary: res.summary || '',
    experience,
    education,
    skillCategories: skillCategories && skillCategories.length > 0 ? skillCategories : [],
    certifications,
    projects,
    languages,
    achievements,
    hobbies,
    references,
  };
}

export function CVRendererPage() {
  const { resumeId } = useParams<{ resumeId?: string; language?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Extract template number from URL path (e.g. /export/Cv14/... or /export/Cover2/...)
  const isCoverLetter = location.pathname.includes('/export/Cover');
  const matchedCvNum = location.pathname.match(/\/export\/Cv(\d+)/i)?.[1];
  const matchedCoverNum = location.pathname.match(/\/export\/Cover(\d+)/i)?.[1];

  const initialTemplateNum = matchedCvNum ? parseInt(matchedCvNum, 10) : matchedCoverNum ? parseInt(matchedCoverNum, 10) : 1;
  const [templateNum, setTemplateNum] = useState<number>(initialTemplateNum);
  const [paletteIndex, setPaletteIndex] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [density, setDensity] = useState<'compact' | 'standard' | 'spacious'>('standard');
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resumeData, setResumeData] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const currentMeta = useMemo(
    () => getTemplateMeta(isCoverLetter ? `Cover${templateNum}` : `Cv${templateNum}`),
    [templateNum, isCoverLetter]
  );

  // Dynamic template-curated palette with manual override support
  const activePalette: PaletteTheme = useMemo(() => {
    if (paletteIndex !== 0) {
      return PALETTES[paletteIndex % PALETTES.length] ?? PALETTES[0]!;
    }
    // Default to the template's designated colors from template-catalog
    return {
      id: currentMeta.id,
      name: currentMeta.name,
      primary: currentMeta.primary || '#1e3a8a',
      secondary: currentMeta.secondary || '#3b82f6',
      soft: `${currentMeta.primary || '#1e3a8a'}15`,
      text: currentMeta.primary || '#1e3a8a',
    };
  }, [paletteIndex, currentMeta]);

const MULTIPAGE_RESUME = {
  ...FALLBACK_RESUME,
  id: 'multipage-demo',
  name: 'Alex Morgan — Senior Staff Engineer & Cloud Architect',
  experience: [
    ...FALLBACK_RESUME.experience,
    {
      id: 'exp-4',
      company: 'ScaleAI Infrastructure Labs',
      position: 'Senior Infrastructure Engineer',
      location: 'Seattle, WA',
      startDate: '2015',
      endDate: '2017',
      current: false,
      description:
        '• Designed and operated GPU training clusters across 400+ nodes using Slurm and Kubernetes.\n• Optimized distributed checkpointing, reducing model save latency by 72% across NVLink interconnected fabrics.\n• Collaborated with research scientists to deploy real-time inference endpoints serving 12,000 requests/second.',
    },
    {
      id: 'exp-5',
      company: 'Palo Alto Research Systems',
      position: 'Systems Software Engineer',
      location: 'Palo Alto, CA',
      startDate: '2013',
      endDate: '2015',
      current: false,
      description:
        '• Implemented low-latency Linux kernel networking modules in C and Go for high-throughput packet processing.\n• Contributed to upstream open-source eBPF monitoring tools and published technical whitepapers on memory safety.',
    },
  ],
  education: [
    ...FALLBACK_RESUME.education,
    {
      id: 'edu-3',
      institution: 'MIT Professional Education',
      degree: 'Executive Certificate',
      field: 'Advanced System Architecture & Cloud Leadership',
      startDate: '2021',
      endDate: '2021',
      gpa: '',
      description: 'Intensive engineering leadership and distributed systems resilience program.',
    },
  ],
  certifications: [
    ...FALLBACK_RESUME.certifications,
    { id: 'cert-3', name: 'Google Cloud Certified Professional Cloud Architect', issuer: 'Google', date: '2023' },
    { id: 'cert-4', name: 'Certified Information Systems Security Professional (CISSP)', issuer: 'ISC2', date: '2022' },
  ],
  projects: [
    ...FALLBACK_RESUME.projects,
    {
      id: 'proj-2',
      title: 'Global Multi-Region Consensus Engine',
      technologies: 'Rust, Raft, gRPC, Tokio',
      liveUrl: 'github.com/alexmorgan-code/raft-consensus',
      description: 'Implemented an asynchronous Raft-based replicated state machine in Rust handling 50k consensus ops/sec with zero linearizability violations.',
    },
  ],
};

  // Load real resume if possible
  useEffect(() => {
    if (resumeId === 'multipage-demo' || location.search.includes('multipage=true')) {
      setResumeData(MULTIPAGE_RESUME);
      return;
    }
    if (!resumeId || resumeId === 'demo' || resumeId === 'sample') {
      setResumeData(FALLBACK_RESUME);
      return;
    }
    let cancelled = false;
    setLoadError(null);

    async function load() {
      try {
        const data = await get<any>(`/resumes/${resumeId}`);
        if (!cancelled && data) {
          const normalized = normalizeToViewModel(data);
          setResumeData(normalized);
          // If the resume has a preferred template, respect it initially if not overridden in URL
          if (!matchedCvNum && (data.resume?.template || data.template)) {
            const rawTmpl = data.resume?.template || data.template;
            const num = parseInt(rawTmpl.replace(/\D/g, ''), 10);
            if (!isNaN(num) && num >= 1 && num <= 100) {
              setTemplateNum(num);
            }
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          const status = err?.response?.status;
          if (status === 401) {
            setLoadError('Authentication required. Please log in to view this resume.');
          } else if (status === 404) {
            setLoadError('Resume not found.');
          } else {
            setLoadError('Failed to load resume data.');
          }
          // Do NOT fall back to mock data for real resume IDs
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [resumeId, matchedCvNum]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadDocx = async () => {
    setDownloadingDocx(true);
    try {
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

      const targetId = resumeId || 'res-alex-001';
      const res = await fetch('/api/export-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          resumeId: targetId,
          resumeName: resumeData.template || `Cv${templateNum}`,
          language: 'en',
        }),
      });

      if (!res.ok) {
        throw new Error(`Export returned status ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(resumeData.name || 'Resume').replace(/[^\w\s-]/g, '').trim() || 'Resume'}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Could not download Word document: ${err.message || 'Export error'}`);
    } finally {
      setDownloadingDocx(false);
    }
  };

  const handleCopyShareLink = () => {
    const url = window.location.href;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine archetype based on template metadata
  const archetype = useMemo(() => {
    if (isCoverLetter) return 'cover-letter';
    if (currentMeta.archetype === 'modern-split') return 'two-column';
    if (currentMeta.archetype === 'executive-banner') return 'modern-banner';
    if (currentMeta.archetype === 'minimal-ats') return 'minimal-ats';
    if (currentMeta.archetype === 'tech-grid') return 'tech-grid';
    if (currentMeta.archetype === 'compact-euro') return 'compact-exec';
    
    const index = (templateNum - 1) % 8;
    const ARCHETYPES = [
      'modern-banner',
      'two-column',
      'minimal-ats',
      'tech-grid',
      'classic-serif',
      'accent-line',
      'elegant-split',
      'compact-exec',
    ];
    return ARCHETYPES[index];
  }, [templateNum, isCoverLetter, currentMeta]);

  const fontClass = useMemo(() => {
    if (currentMeta.archetype === 'minimal-ats') return 'font-merriweather';
    if (currentMeta.archetype === 'tech-grid') return 'font-fira';
    if (currentMeta.archetype === 'modern-split') return 'font-jakarta';
    if (currentMeta.archetype === 'executive-banner') return 'font-outfit';
    return 'font-sans';
  }, [currentMeta]);

  // Loading state — real resume ID but data hasn't arrived yet
  if (!resumeData && !loadError) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="size-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-neutral-600">Loading resume…</p>
        </div>
      </div>
    );
  }

  // Error state — API returned auth error or 404
  if (loadError) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <div className="max-w-md p-8 bg-white rounded-xl shadow-lg border border-neutral-200 text-center">
          <div className="size-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-red-600 text-xl font-bold">!</span>
          </div>
          <h2 className="text-lg font-bold text-neutral-900 mb-2">Cannot Load Resume</h2>
          <p className="text-sm text-neutral-600 mb-6">{loadError}</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ChevronLeft className="size-4 mr-1" /> Go Back
            </Button>
            <Button size="sm" onClick={() => navigate('/login')}>
              Log In
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 overflow-x-clip">
      {/* ─── Top Floating Toolbar (Hidden on Print) ─── */}
      <header className="no-print sticky top-0 z-50 flex h-14 w-full items-center justify-between border-b border-neutral-200 bg-white px-2 sm:px-4 shadow-xs">
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-neutral-600 hover:text-neutral-900 px-2 sm:px-3"
          >
            <ChevronLeft className="size-4" />
            <span className="hidden xs:inline">Back</span>
          </Button>
          <div className="hidden h-5 w-px bg-neutral-200 sm:block" />
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Layout className="size-4 text-neutral-500 shrink-0" />
            <span className="text-xs font-semibold text-neutral-700 sm:text-sm truncate max-w-[120px] sm:max-w-none">
              {currentMeta.id}: {currentMeta.name}
            </span>
          </div>
        </div>

        {/* Center: Template & Palette Switchers */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink min-w-0">
          {/* Template Quick Select */}
          <div className="flex items-center gap-1">
            <span className="hidden text-xs text-neutral-500 lg:inline">Template:</span>
            <select
              value={templateNum}
              onChange={(e) => setTemplateNum(Number(e.target.value))}
              className="h-8 rounded-md border border-neutral-200 bg-white px-1.5 sm:px-2 text-xs font-medium text-neutral-800 shadow-xs focus:outline-2 focus:outline-blue-600 max-w-[140px] sm:max-w-[180px] lg:max-w-[210px] truncate"
            >
              {isCoverLetter
                ? COVER_TEMPLATES.map((t, idx) => (
                    <option key={t.id} value={idx + 1}>
                      {t.id}: {t.name}
                    </option>
                  ))
                : TEMPLATES.map((t, idx) => (
                    <option key={t.id} value={idx + 1}>
                      {t.id}: {t.name}
                    </option>
                  ))}
            </select>
          </div>

          {/* Palette Picker */}
          <div className="hidden items-center gap-1 md:flex">
            <Palette className="size-3.5 text-neutral-400" />
            <div className="flex items-center gap-1">
              {PALETTES.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => setPaletteIndex(idx)}
                  className={cn(
                    'size-5 rounded-full border-2 transition-transform',
                    paletteIndex === idx ? 'scale-110 border-neutral-900' : 'border-transparent hover:scale-105',
                  )}
                  style={{ backgroundColor: p.primary }}
                  title={p.name}
                  aria-label={p.name}
                />
              ))}
            </div>
          </div>

          {/* Density Selector */}
          <div className="hidden items-center gap-1 xl:flex ml-1 pl-2 border-l border-neutral-200">
            <span className="text-xs text-neutral-400">Spacing:</span>
            {(['compact', 'standard', 'spacious'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] capitalize transition-colors',
                  density === d
                    ? 'bg-neutral-900 text-white font-medium'
                    : 'text-neutral-600 hover:bg-neutral-100',
                )}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Zoom controls */}
          <div className="hidden items-center gap-1 xl:flex ml-1 pl-2 border-l border-neutral-200">
            <button
              onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="size-4" />
            </button>
            <span className="text-xs text-neutral-500 w-10 text-center">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="size-4" />
            </button>
          </div>
        </div>

        {/* Right Actions: Share, DOCX, & Print/PDF */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyShareLink}
            className="text-xs hidden lg:flex"
          >
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Share2 className="size-3.5" />}
            {copied ? 'Copied' : 'Share'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadDocx}
            className="text-xs hidden sm:flex text-emerald-700 border-emerald-300 hover:bg-emerald-50 px-2 sm:px-3"
            disabled={downloadingDocx}
          >
            <Download className="size-3.5" />
            <span>{downloadingDocx ? 'Generating...' : 'Word (.docx)'}</span>
          </Button>

          <Button
            size="sm"
            onClick={handlePrint}
            className="bg-neutral-900 text-white hover:bg-neutral-800 text-xs shadow-xs px-2.5 sm:px-3"
          >
            <Printer className="size-3.5" />
            <span className="hidden xs:inline">Print / PDF</span>
            <span className="xs:hidden">Print</span>
          </Button>
        </div>
      </header>

      {/* ─── Printable Document Container ─── */}
      <main className="flex justify-center p-4 sm:p-8 lg:p-12 overflow-x-auto">
        <div
          id="printable-document"
          className="transition-transform duration-150"
          style={{
            transform: zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : undefined,
            transformOrigin: 'top center',
          }}
        >
          <SmartResumeDocument
            resume={resumeData}
            meta={currentMeta}
            palette={activePalette}
            density={density}
          />
        </div>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * TEMPLATE ARCHETYPES (Vector-grade Print Ready)
 * ───────────────────────────────────────────────────────────── */

type NormalizedResume = ReturnType<typeof normalizeToViewModel>;

interface TemplateProps {
  resume: NormalizedResume;
  palette: PaletteTheme;
}

function SectionHeading({ title, color, className }: { title: string; color?: string; className?: string }) {
  return (
    <h2
      className={cn("text-xs font-bold uppercase tracking-wider pb-1 border-b mb-3", className)}
      style={color ? { color, borderColor: color } : undefined}
    >
      {title}
    </h2>
  );
}

function CertificationsSection({ items, primaryColor, className }: { items: any[]; primaryColor?: string; className?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <section className={cn("mt-6 cv-section keep-together", className)}>
      <SectionHeading title="Certifications & Credentials" color={primaryColor} />
      <div className="space-y-2">
        {items.map((c) => (
          <div key={c.id} className="flex justify-between items-baseline text-xs cv-item">
            <div>
              <span className="font-bold text-neutral-900">{c.name || c.title}</span>
              {c.issuer && <span className="text-neutral-600"> · {c.issuer}</span>}
            </div>
            {c.date && <span className="text-neutral-500 font-medium text-[11px] shrink-0 ml-2">{c.date}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectsSection({ items, primaryColor, className }: { items: any[]; primaryColor?: string; className?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <section className={cn("mt-6 cv-section keep-together", className)}>
      <SectionHeading title="Key Projects & Architecture" color={primaryColor} />
      <div className="space-y-3">
        {items.map((p) => (
          <div key={p.id} className="text-xs cv-item">
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-neutral-900">{p.title}</span>
              {p.liveUrl && (
                <span className="text-[11px] text-neutral-500 font-mono">{p.liveUrl}</span>
              )}
            </div>
            {p.technologies && (
              <div className="text-[11px] font-medium" style={{ color: primaryColor }}>
                {p.technologies}
              </div>
            )}
            {p.description && <p className="text-neutral-600 mt-1 leading-normal whitespace-pre-line">{p.description}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function LanguagesSection({ items, primaryColor, className, badgeStyle }: { items: any[]; primaryColor?: string; className?: string; badgeStyle?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <section className={cn("mt-6 cv-section keep-together", className)}>
      <SectionHeading title="Languages" color={primaryColor} />
      <div className="flex flex-wrap gap-2">
        {items.map((l) => (
          <span
            key={l.id}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]",
              badgeStyle ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-800 border border-neutral-200"
            )}
          >
            <span className="font-semibold">{l.name || l.language}</span>
            {l.proficiency && (
              <span className={badgeStyle ? "text-white/70" : "text-neutral-500"}>({l.proficiency})</span>
            )}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ─── 1. Modern Banner Template ─── */
function ModernBannerTemplate({ resume, palette }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories, certifications, projects, languages } = resume;

  return (
    <div className="p-10 font-sans text-neutral-800 leading-relaxed text-[13px]">
      {/* Colored Header Banner */}
      <div
        className="rounded-xl p-8 text-white shadow-xs"
        style={{ backgroundColor: palette.primary }}
      >
        <div className="flex items-center gap-6">
          {heading.photo && heading.showPhoto && (
            <img
              src={heading.photo}
              alt={`${heading.firstName} ${heading.lastName}`}
              className="size-20 rounded-2xl object-cover border-2 border-white/40 shadow-sm shrink-0"
            />
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              {heading.firstName} {heading.lastName}
            </h1>
            <p className="mt-1 text-base font-medium opacity-95 text-white/90">{heading.title}</p>

            {/* Contact Links */}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs opacity-90 text-white/90">
              {heading.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="size-3.5" />
                  {heading.email}
                </span>
              )}
              {heading.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5" />
                  {heading.phone}
                </span>
              )}
              {heading.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" />
                  {heading.location}
                </span>
              )}
              {heading.linkedin && (
                <span className="flex items-center gap-1.5">
                  <LinkedinIcon className="size-3.5" />
                  {heading.linkedin}
                </span>
              )}
              {heading.github && (
                <span className="flex items-center gap-1.5">
                  <GithubIcon className="size-3.5" />
                  {heading.github}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <section className="mt-6 cv-section">
          <SectionHeading title="Professional Summary" color={palette.primary} />
          <p className="mt-2 text-neutral-700 leading-normal">{summary}</p>
        </section>
      )}

      {/* Experience */}
      <section className="mt-6 cv-section">
        <SectionHeading title="Work Experience" color={palette.primary} />
        <div className="mt-3 space-y-4">
          {experience.map((exp) => (
            <div key={exp.id} className="cv-item keep-together">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="font-bold text-neutral-900 text-sm">{exp.position}</span>
                  {exp.company && <span className="text-neutral-500 font-medium"> · {exp.company}</span>}
                </div>
                <span className="text-xs font-medium text-neutral-500">
                  {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                </span>
              </div>
              {exp.location && <div className="text-xs text-neutral-500">{exp.location}</div>}
              {exp.description && (
                <p className="mt-1.5 whitespace-pre-line text-neutral-700 text-xs leading-normal">
                  {exp.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <ProjectsSection items={projects} primaryColor={palette.primary} />

      {/* Skills */}
      <section className="mt-6 cv-section keep-together">
        <SectionHeading title="Core Competencies & Skills" color={palette.primary} />
        <div className="mt-3 grid grid-cols-2 gap-3">
          {skillCategories.map((cat) => (
            <div key={cat.id} className="rounded-md border border-neutral-100 bg-neutral-50/70 p-2.5">
              <div className="text-xs font-bold text-neutral-900">{cat.category}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {cat.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded px-2 py-0.5 text-[11px] font-medium text-neutral-700 bg-white border border-neutral-200"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Education */}
      <section className="mt-6 cv-section keep-together">
        <SectionHeading title="Education" color={palette.primary} />
        <div className="mt-3 space-y-3">
          {education.map((edu) => (
            <div key={edu.id} className="flex justify-between items-start cv-item">
              <div>
                <div className="font-bold text-neutral-900 text-xs">
                  {edu.degree} in {edu.field}
                </div>
                <div className="text-xs text-neutral-600">{edu.institution}</div>
              </div>
              <span className="text-xs text-neutral-500 font-medium">
                {edu.startDate} – {edu.endDate}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Certifications */}
      <CertificationsSection items={certifications} primaryColor={palette.primary} />

      {/* Languages */}
      <LanguagesSection items={languages} primaryColor={palette.primary} />
    </div>
  );
}

/* ─── 2. Two-Column Left-Rail Template ─── */
function TwoColumnTemplate({ resume, palette }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories, certifications, projects, languages } = resume;

  return (
    <div className="flex min-h-full font-sans text-neutral-800 text-[12.5px]">
      {/* Left Column (32%) */}
      <aside
        className="w-[32%] p-8 text-white flex flex-col justify-between"
        style={{ backgroundColor: palette.primary }}
      >
        <div>
          {/* Avatar Photo or Initials Badge */}
          {heading.photo && heading.showPhoto ? (
            <img
              src={heading.photo}
              alt={`${heading.firstName} ${heading.lastName}`}
              className="size-20 rounded-2xl object-cover mb-4 border-2 border-white/40 shadow-md"
            />
          ) : (
            <div className="size-16 rounded-2xl bg-white/20 flex items-center justify-center text-xl font-bold tracking-wider mb-4 border border-white/30">
              {heading.firstName[0]}
              {heading.lastName[0]}
            </div>
          )}

          <h1 className="text-2xl font-bold leading-tight">
            {heading.firstName}
            <br />
            {heading.lastName}
          </h1>
          <p className="mt-1 text-xs opacity-90 font-medium">{heading.title}</p>

          {/* Contact */}
          <div className="mt-8 space-y-3 text-xs opacity-90 border-t border-white/20 pt-6">
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/70">Contact</div>
            {heading.email && (
              <div className="flex items-center gap-2 truncate">
                <Mail className="size-3.5 shrink-0" />
                <span className="truncate">{heading.email}</span>
              </div>
            )}
            {heading.phone && (
              <div className="flex items-center gap-2">
                <Phone className="size-3.5 shrink-0" />
                <span>{heading.phone}</span>
              </div>
            )}
            {heading.location && (
              <div className="flex items-center gap-2">
                <MapPin className="size-3.5 shrink-0" />
                <span>{heading.location}</span>
              </div>
            )}
            {heading.linkedin && (
              <div className="flex items-center gap-2 truncate">
                <LinkedinIcon className="size-3.5 shrink-0" />
                <span className="truncate">{heading.linkedin}</span>
              </div>
            )}
            {heading.github && (
              <div className="flex items-center gap-2 truncate">
                <GithubIcon className="size-3.5 shrink-0" />
                <span className="truncate">{heading.github}</span>
              </div>
            )}
          </div>

          {/* Skills */}
          <div className="mt-8 border-t border-white/20 pt-6">
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/70 mb-3">
              Skills
            </div>
            <div className="space-y-3">
              {skillCategories.map((cat) => (
                <div key={cat.id}>
                  <div className="text-[11px] font-semibold text-white/85">{cat.category}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {cat.skills.map((s) => (
                      <span
                        key={s}
                        className="rounded-sm bg-white/15 px-1.5 py-0.5 text-[10.5px] font-medium"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Languages in Sidebar */}
          {languages && languages.length > 0 && (
            <div className="mt-8 border-t border-white/20 pt-6">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/70 mb-2">
                Languages
              </div>
              <div className="space-y-1 text-xs">
                {languages.map((l) => (
                  <div key={l.id} className="flex justify-between text-white/90">
                    <span>{l.name || l.language}</span>
                    <span className="text-white/60 text-[10.5px]">{l.proficiency}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Education (bottom left) */}
        <div className="mt-8 border-t border-white/20 pt-6">
          <div className="text-[11px] font-bold uppercase tracking-wider text-white/70 mb-2">
            Education
          </div>
          {education.map((edu) => (
            <div key={edu.id} className="mb-2 text-xs">
              <div className="font-bold">{edu.degree}</div>
              <div className="text-white/80 text-[11px]">{edu.institution}</div>
              <div className="text-white/60 text-[10px]">{edu.endDate}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* Right Column (68%) */}
      <main className="w-[68%] p-8">
        {/* Summary */}
        {summary && (
          <section className="cv-section">
            <SectionHeading title="Executive Summary" color={palette.primary} />
            <p className="mt-2 text-neutral-700 leading-relaxed text-xs">{summary}</p>
          </section>
        )}

        {/* Experience */}
        <section className="mt-8 cv-section">
          <SectionHeading title="Professional Experience" color={palette.primary} />
          <div className="mt-4 space-y-5">
            {experience.map((exp) => (
              <div key={exp.id} className="cv-item keep-together">
                <div className="flex justify-between items-baseline">
                  <div className="font-bold text-neutral-900 text-sm">{exp.position}</div>
                  <span className="text-xs font-semibold text-neutral-500">
                    {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                  </span>
                </div>
                {(exp.company || exp.location) && (
                  <div className="text-xs font-medium" style={{ color: palette.primary }}>
                    {[exp.company, exp.location].filter(Boolean).join(' · ')}
                  </div>
                )}
                {exp.description && (
                  <p className="mt-2 whitespace-pre-line text-neutral-600 text-xs leading-normal">
                    {exp.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Projects */}
        <ProjectsSection items={projects} primaryColor={palette.primary} />

        {/* Certifications */}
        <CertificationsSection items={certifications} primaryColor={palette.primary} />
      </main>
    </div>
  );
}

/* ─── 3. Minimal ATS-Optimized Template ─── */
function MinimalATSTemplate({ resume }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories, certifications, projects, languages } = resume;

  return (
    <div className="p-10 font-sans text-neutral-900 text-[12.5px] leading-relaxed">
      {/* Centered Header */}
      <div className="text-center pb-4 border-b border-neutral-300">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          {heading.firstName} {heading.lastName}
        </h1>
        <p className="text-sm font-semibold text-neutral-600 mt-0.5">{heading.title}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-neutral-600">
          <span>{heading.email}</span>
          <span>•</span>
          <span>{heading.phone}</span>
          <span>•</span>
          <span>{heading.location}</span>
          {heading.linkedin && (
            <>
              <span>•</span>
              <span>{heading.linkedin}</span>
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <section className="mt-5 cv-section">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 border-b border-neutral-200 pb-0.5">
            Summary
          </h2>
          <p className="mt-1.5 text-neutral-700 text-xs leading-normal">{summary}</p>
        </section>
      )}

      {/* Experience */}
      <section className="mt-5 cv-section">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 border-b border-neutral-200 pb-0.5">
          Professional Experience
        </h2>
        <div className="mt-3 space-y-4">
          {experience.map((exp) => (
            <div key={exp.id} className="cv-item keep-together">
              <div className="flex justify-between items-baseline font-bold text-neutral-900 text-xs">
                <span>{exp.position} — {exp.company}</span>
                <span className="text-neutral-600 font-normal">
                  {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                </span>
              </div>
              <div className="text-[11px] text-neutral-500 italic">{exp.location}</div>
              <p className="mt-1 whitespace-pre-line text-neutral-700 text-xs leading-normal">
                {exp.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <ProjectsSection items={projects} />

      {/* Education */}
      <section className="mt-5 cv-section keep-together">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 border-b border-neutral-200 pb-0.5">
          Education
        </h2>
        <div className="mt-2 space-y-2">
          {education.map((edu) => (
            <div key={edu.id} className="flex justify-between text-xs cv-item">
              <div>
                <span className="font-bold text-neutral-900">{edu.institution}</span> — {edu.degree} in {edu.field}
              </div>
              <span className="text-neutral-600">{edu.endDate}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Skills */}
      <section className="mt-5 cv-section keep-together">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 border-b border-neutral-200 pb-0.5">
          Skills & Technical Expertise
        </h2>
        <div className="mt-2 space-y-1.5 text-xs">
          {skillCategories.map((cat) => (
            <div key={cat.id}>
              <span className="font-bold text-neutral-800">{cat.category}: </span>
              <span className="text-neutral-700">{cat.skills.join(', ')}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Certifications */}
      <CertificationsSection items={certifications} />

      {/* Languages */}
      <LanguagesSection items={languages} />
    </div>
  );
}

/* ─── 4. Tech Grid Template ─── */
function TechGridTemplate({ resume, palette }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories, certifications, projects, languages } = resume;

  return (
    <div className="p-10 font-sans text-neutral-800 text-[12.5px] leading-relaxed">
      {/* Top Header with Accent Border */}
      <div className="border-l-4 pl-4" style={{ borderColor: palette.primary }}>
        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">
          {heading.firstName} {heading.lastName}
        </h1>
        <p className="text-sm font-semibold mt-0.5" style={{ color: palette.primary }}>
          {heading.title}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 font-mono">
          <span>{heading.email}</span>
          <span>{heading.phone}</span>
          <span>{heading.location}</span>
          {heading.github && <span>{heading.github}</span>}
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="mt-6 rounded-lg bg-neutral-50 p-3.5 border border-neutral-200/80 text-xs text-neutral-700 cv-section">
          {summary}
        </div>
      )}

      {/* Technical Skills Grid */}
      <section className="mt-6 cv-section keep-together">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 mb-2">
          Engineering Stack & Competencies
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {skillCategories.map((cat) => (
            <div key={cat.id} className="rounded border border-neutral-200 bg-white p-2">
              <span className="text-[11px] font-bold text-neutral-900">{cat.category}</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {cat.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10.5px] font-mono text-neutral-800"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Experience */}
      <section className="mt-6 cv-section">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-200 pb-1">
          Technical Experience
        </h2>
        <div className="mt-3 space-y-4">
          {experience.map((exp) => (
            <div key={exp.id} className="cv-item keep-together">
              <div className="flex justify-between items-baseline font-bold text-neutral-900 text-xs">
                <span>{exp.position} @ {exp.company}</span>
                <span className="text-neutral-500 font-mono text-[11px]">
                  {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line text-neutral-700 text-xs leading-normal">
                {exp.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <ProjectsSection items={projects} primaryColor={palette.primary} />

      {/* Certifications */}
      <CertificationsSection items={certifications} primaryColor={palette.primary} />

      {/* Education */}
      <section className="mt-6 cv-section keep-together">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-200 pb-1">
          Education
        </h2>
        <div className="mt-2 space-y-2 text-xs">
          {education.map((edu) => (
            <div key={edu.id} className="flex justify-between cv-item">
              <div>
                <span className="font-bold text-neutral-900">{edu.degree} in {edu.field}</span> · {edu.institution}
              </div>
              <span className="text-neutral-500 font-mono text-[11px]">{edu.endDate}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Languages */}
      <LanguagesSection items={languages} primaryColor={palette.primary} />
    </div>
  );
}

/* ─── 5. Classic Serif Template ─── */
function ClassicSerifTemplate({ resume }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories, certifications, projects, languages } = resume;

  return (
    <div className="p-12 font-serif text-neutral-900 text-[13px] leading-relaxed">
      {/* Traditional Centered Header */}
      <div className="text-center pb-5 border-b-2 border-neutral-900">
        <h1 className="text-3xl font-normal tracking-wide text-neutral-950 uppercase">
          {heading.firstName} {heading.lastName}
        </h1>
        <p className="font-sans text-xs tracking-widest text-neutral-600 mt-1 uppercase">
          {heading.title}
        </p>
        <div className="mt-2 font-sans text-xs text-neutral-600 flex justify-center gap-4">
          <span>{heading.email}</span>
          <span>•</span>
          <span>{heading.phone}</span>
          <span>•</span>
          <span>{heading.location}</span>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <section className="mt-6 cv-section">
          <h2 className="font-sans text-xs font-bold tracking-widest text-neutral-900 uppercase border-b border-neutral-300 pb-0.5">
            Profile
          </h2>
          <p className="mt-2 text-neutral-800 leading-relaxed text-xs">{summary}</p>
        </section>
      )}

      {/* Experience */}
      <section className="mt-6 cv-section">
        <h2 className="font-sans text-xs font-bold tracking-widest text-neutral-900 uppercase border-b border-neutral-300 pb-0.5">
          Professional Experience
        </h2>
        <div className="mt-3 space-y-4">
          {experience.map((exp) => (
            <div key={exp.id} className="cv-item keep-together">
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-neutral-900 text-sm">{exp.position}</span>
                <span className="font-sans text-xs text-neutral-600">
                  {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                </span>
              </div>
              <div className="font-sans text-xs text-neutral-600 italic">
                {exp.company}, {exp.location}
              </div>
              <p className="mt-1.5 whitespace-pre-line text-neutral-800 text-xs leading-relaxed">
                {exp.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <ProjectsSection items={projects} />

      {/* Education */}
      <section className="mt-6 cv-section keep-together">
        <h2 className="font-sans text-xs font-bold tracking-widest text-neutral-900 uppercase border-b border-neutral-300 pb-0.5">
          Education
        </h2>
        <div className="mt-2 space-y-2 text-xs">
          {education.map((edu) => (
            <div key={edu.id} className="flex justify-between cv-item">
              <div>
                <span className="font-bold">{edu.institution}</span> — {edu.degree} in {edu.field}
              </div>
              <span className="font-sans text-neutral-600">{edu.endDate}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Skills */}
      <section className="mt-6 cv-section keep-together">
        <h2 className="font-sans text-xs font-bold tracking-widest text-neutral-900 uppercase border-b border-neutral-300 pb-0.5">
          Areas of Expertise
        </h2>
        <div className="mt-2 font-sans text-xs space-y-1 text-neutral-800">
          {skillCategories.map((cat) => (
            <div key={cat.id}>
              <strong className="text-neutral-900">{cat.category}: </strong>
              <span>{cat.skills.join(', ')}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Certifications */}
      <CertificationsSection items={certifications} />

      {/* Languages */}
      <LanguagesSection items={languages} />
    </div>
  );
}

/* ─── 6. Accent Line Template ─── */
function AccentLineTemplate({ resume, palette }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories, certifications, projects, languages } = resume;

  return (
    <div className="p-10 font-sans text-neutral-800 text-[12.5px] leading-relaxed">
      {/* Header with bold colored underline */}
      <div className="pb-4">
        <h1 className="text-3xl font-extrabold text-neutral-900">
          {heading.firstName} <span style={{ color: palette.primary }}>{heading.lastName}</span>
        </h1>
        <p className="text-sm font-semibold text-neutral-600 mt-0.5">{heading.title}</p>
        <div
          className="my-3 h-1 w-20 rounded-full"
          style={{ backgroundColor: palette.primary }}
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
          <span>{heading.email}</span>
          <span>{heading.phone}</span>
          <span>{heading.location}</span>
          {heading.linkedin && <span>{heading.linkedin}</span>}
        </div>
      </div>

      {summary && (
        <section className="mt-4 cv-section">
          <p className="text-neutral-700 text-xs leading-normal">{summary}</p>
        </section>
      )}

      {/* Experience */}
      <section className="mt-6 cv-section">
        <SectionHeading title="Work Experience" color={palette.primary} />
        <div className="mt-3 space-y-4">
          {experience.map((exp) => (
            <div key={exp.id} className="relative pl-4 border-l-2 border-neutral-200 cv-item keep-together">
              <div className="font-bold text-neutral-900 text-xs">
                {exp.position} · {exp.company}
              </div>
              <div className="text-[11px] text-neutral-500">
                {exp.startDate} – {exp.current ? 'Present' : exp.endDate} · {exp.location}
              </div>
              <p className="mt-1 whitespace-pre-line text-neutral-700 text-xs leading-normal">
                {exp.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <ProjectsSection items={projects} primaryColor={palette.primary} />

      {/* Skills */}
      <section className="mt-6 cv-section keep-together">
        <SectionHeading title="Key Skills" color={palette.primary} />
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          {skillCategories.map((cat) => (
            <div key={cat.id} className="border border-neutral-100 bg-neutral-50/50 p-2 rounded">
              <div className="font-bold text-neutral-800 text-[11px]">{cat.category}</div>
              <div className="text-neutral-600 mt-0.5 text-[11px]">{cat.skills.join(', ')}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Education */}
      <section className="mt-6 cv-section keep-together">
        <SectionHeading title="Education" color={palette.primary} />
        <div className="mt-2 space-y-2 text-xs">
          {education.map((edu) => (
            <div key={edu.id} className="flex justify-between cv-item">
              <div>
                <span className="font-bold">{edu.degree} in {edu.field}</span> — {edu.institution}
              </div>
              <span className="text-neutral-500">{edu.endDate}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Certifications */}
      <CertificationsSection items={certifications} primaryColor={palette.primary} />

      {/* Languages */}
      <LanguagesSection items={languages} primaryColor={palette.primary} />
    </div>
  );
}

/* ─── 7. Elegant Split Template ─── */
function ElegantSplitTemplate({ resume, palette }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories, certifications, projects, languages } = resume;

  return (
    <div className="p-10 font-sans text-neutral-800 text-[12.5px] leading-relaxed">
      <div className="flex justify-between items-start border-b border-neutral-200 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">
            {heading.firstName} {heading.lastName}
          </h1>
          <p className="text-sm font-semibold mt-1" style={{ color: palette.primary }}>
            {heading.title}
          </p>
        </div>
        <div className="text-right text-xs text-neutral-600 space-y-0.5">
          <div>{heading.email}</div>
          <div>{heading.phone}</div>
          <div>{heading.location}</div>
        </div>
      </div>

      {summary && (
        <div className="mt-5 text-neutral-700 text-xs leading-relaxed border-l-2 pl-3 cv-section" style={{ borderColor: palette.primary }}>
          {summary}
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-6">
        {/* Main Column (2 of 3) */}
        <div className="col-span-2 space-y-6">
          <section className="cv-section">
            <SectionHeading title="Experience" color={palette.primary} />
            <div className="mt-3 space-y-4">
              {experience.map((exp) => (
                <div key={exp.id} className="cv-item keep-together">
                  <div className="font-bold text-neutral-900 text-xs">{exp.position}</div>
                  <div className="text-[11px] font-medium" style={{ color: palette.primary }}>
                    {exp.company} ({exp.startDate} – {exp.current ? 'Present' : exp.endDate})
                  </div>
                  <p className="mt-1 whitespace-pre-line text-neutral-600 text-xs leading-normal">
                    {exp.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Projects */}
          <ProjectsSection items={projects} primaryColor={palette.primary} />
        </div>

        {/* Side Column (1 of 3) */}
        <div className="space-y-6">
          <section className="cv-section keep-together">
            <SectionHeading title="Skills" color={palette.primary} />
            <div className="mt-3 space-y-3">
              {skillCategories.map((cat) => (
                <div key={cat.id}>
                  <div className="text-xs font-bold text-neutral-800">{cat.category}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {cat.skills.map((s) => (
                      <span
                        key={s}
                        className="rounded px-1.5 py-0.5 text-[10px] bg-neutral-100 text-neutral-700"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Certifications in Side Column */}
          <CertificationsSection items={certifications} primaryColor={palette.primary} />

          <section className="cv-section keep-together">
            <SectionHeading title="Education" color={palette.primary} />
            <div className="mt-3 space-y-2">
              {education.map((edu) => (
                <div key={edu.id} className="text-xs cv-item">
                  <div className="font-bold text-neutral-900">{edu.degree}</div>
                  <div className="text-neutral-600 text-[11px]">{edu.institution}</div>
                  <div className="text-neutral-500 text-[10px]">{edu.endDate}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Languages */}
          <LanguagesSection items={languages} primaryColor={palette.primary} />
        </div>
      </div>
    </div>
  );
}

/* ─── 8. Compact Executive Template ─── */
function CompactExecTemplate({ resume, palette }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories, certifications, projects, languages } = resume;

  return (
    <div className="p-8 font-sans text-neutral-900 text-[12px] leading-tight">
      <div className="flex justify-between items-end border-b-2 pb-2" style={{ borderColor: palette.primary }}>
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">
            {heading.firstName.toUpperCase()} {heading.lastName.toUpperCase()}
          </h1>
          <p className="text-xs font-bold tracking-wide mt-0.5 text-neutral-600">{heading.title}</p>
        </div>
        <div className="text-right text-[11px] text-neutral-600">
          <div>{heading.email} · {heading.phone}</div>
          <div>{heading.location} · {heading.linkedin}</div>
        </div>
      </div>

      {summary && (
        <p className="mt-3 text-neutral-700 text-xs leading-normal cv-section">{summary}</p>
      )}

      {/* Experience */}
      <section className="mt-4 cv-section">
        <h2
          className="text-[11px] font-black uppercase tracking-wider text-white px-2 py-0.5 rounded-xs"
          style={{ backgroundColor: palette.primary }}
        >
          Professional Experience
        </h2>
        <div className="mt-2 space-y-3">
          {experience.map((exp) => (
            <div key={exp.id} className="cv-item keep-together">
              <div className="flex justify-between items-baseline font-bold text-xs">
                <span>{exp.position} — <span className="font-semibold text-neutral-700">{exp.company}</span></span>
                <span className="text-[11px] text-neutral-500 font-normal">
                  {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-line text-neutral-700 text-[11px] leading-normal">
                {exp.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <ProjectsSection items={projects} primaryColor={palette.primary} />

      {/* Skills & Education side by side */}
      <div className="mt-4 grid grid-cols-2 gap-4 cv-section keep-together">
        <section>
          <h2
            className="text-[11px] font-black uppercase tracking-wider text-white px-2 py-0.5 rounded-xs"
            style={{ backgroundColor: palette.primary }}
          >
            Technical Competencies
          </h2>
          <div className="mt-2 space-y-1 text-[11px]">
            {skillCategories.map((cat) => (
              <div key={cat.id}>
                <span className="font-bold">{cat.category}: </span>
                <span className="text-neutral-700">{cat.skills.join(', ')}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2
            className="text-[11px] font-black uppercase tracking-wider text-white px-2 py-0.5 rounded-xs"
            style={{ backgroundColor: palette.primary }}
          >
            Education & Degrees
          </h2>
          <div className="mt-2 space-y-1.5 text-[11px]">
            {education.map((edu) => (
              <div key={edu.id} className="cv-item">
                <div className="font-bold">{edu.degree} in {edu.field}</div>
                <div className="text-neutral-600">{edu.institution} ({edu.endDate})</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Certifications & Languages */}
      <CertificationsSection items={certifications} primaryColor={palette.primary} />
      <LanguagesSection items={languages} primaryColor={palette.primary} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * COVER LETTER EXPORT DOCUMENTS (4 Curated Templates)
 * ───────────────────────────────────────────────────────────── */

function CoverBodyText({ heading }: { heading: any }) {
  return (
    <>
      <p>Dear Hiring Manager,</p>
      <p>
        I am writing to express my enthusiastic interest in joining your engineering organization. With over
        eight years of experience architecting resilient cloud systems, driving developer platforms, and
        leading high-impact software initiatives, I have dedicated my career to building scalable software that
        solves meaningful problems.
      </p>
      <p>
        In my current role as Staff Infrastructure Architect at CloudScale Networks, I spearheaded the migration
        of our core multi-region platform to a zero-trust service mesh. This initiative eliminated latency
        bottlenecks, decreased operational cloud costs by 42%, and improved our system availability to four nines.
        Furthermore, I have led engineering mentorship programs and established architectural review standards
        that elevated engineering quality across our distributed teams.
      </p>
      <p>
        What excites me most about your company is your commitment to delivering world-class customer
        experiences through cutting-edge technology. My background in distributed systems, modern web
        architectures, and team empowerment aligns closely with your strategic objectives.
      </p>
      <p>
        I welcome the opportunity to discuss how my technical expertise and leadership approach can support your
        upcoming milestones. Thank you for your time, consideration, and dedication to excellence.
      </p>
      <p className="pt-4">Sincerely,</p>
      <div className="pt-1">
        <p className="text-sm font-bold text-neutral-900">
          {heading.firstName} {heading.lastName}
        </p>
        <p className="text-xs text-neutral-500">{heading.title}</p>
      </div>
    </>
  );
}

/** Cover 1: Executive Classic — Centered Letterhead with Gradient Accent Bar */
function Cover1Document({ resume, palette }: TemplateProps) {
  const { heading } = resume;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="p-12 font-sans text-neutral-800 text-[13px] leading-relaxed">
      {/* Centered Head */}
      <div className="flex flex-col items-center text-center pb-2">
        <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">
          {heading.firstName} {heading.lastName}
        </h1>
        {heading.location && <p className="text-xs text-neutral-600 mt-1">{heading.location}</p>}
        {(heading.phone || heading.email || heading.linkedin) && (
          <div className="mt-2 flex flex-wrap justify-center items-center gap-3 text-xs text-neutral-500">
            {heading.phone && <span>{heading.phone}</span>}
            {heading.phone && heading.email && <span>•</span>}
            {heading.email && <span>{heading.email}</span>}
            {heading.linkedin && (
              <>
                <span>•</span>
                <span>{heading.linkedin}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Gradient Separator */}
      <div
        className="w-full h-[2px] rounded-sm my-5"
        style={{ background: `linear-gradient(90deg, ${palette.primary} 0%, ${palette.secondary} 100%)` }}
      />

      {/* Meta Row: Recipient & Date */}
      <div className="flex justify-between items-start text-xs text-neutral-700">
        <div className="space-y-0.5">
          <p className="font-bold text-neutral-900">Hiring Team / Engineering Leadership</p>
          <p>Acme Innovations Corporation</p>
          <p>100 Enterprise Way</p>
          <p>San Francisco, CA 94105</p>
        </div>
        <div className="font-medium text-neutral-800">{today}</div>
      </div>

      {/* Subject Line */}
      <div className="mt-6 text-sm font-bold text-neutral-900">
        Re: Application for Senior Technical Leadership / Engineering Role
      </div>

      {/* Body */}
      <div className="mt-5 space-y-4 text-xs text-neutral-700 leading-relaxed">
        <CoverBodyText heading={heading} />
      </div>
    </div>
  );
}

/** Cover 2: Modern Left-Aligned — Corporate Elegance with Dark Divider */
function Cover2Document({ resume, palette }: TemplateProps) {
  const { heading } = resume;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="p-12 font-sans text-neutral-800 text-[13px] leading-relaxed">
      {/* Left-Aligned Head */}
      <div className="pb-2">
        <h1 className="text-3xl font-black text-neutral-900 tracking-tight">
          {heading.firstName} {heading.lastName}
        </h1>
        <p className="text-sm font-semibold mt-0.5" style={{ color: palette.primary }}>
          {heading.title}
        </p>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-neutral-600">
          {heading.location && <span>{heading.location}</span>}
          {heading.phone && <span>{heading.phone}</span>}
          {heading.email && <span>{heading.email}</span>}
          {heading.linkedin && <span>{heading.linkedin}</span>}
        </div>
      </div>

      {/* Dark Solid Divider */}
      <div className="w-full h-[2px] bg-neutral-900 my-5 rounded-xs" />

      {/* Meta Row */}
      <div className="flex justify-between items-start text-xs text-neutral-700">
        <div className="space-y-0.5">
          <p className="font-bold text-neutral-900">Hiring Team / Engineering Leadership</p>
          <p>Acme Innovations Corporation</p>
          <p>100 Enterprise Way, Suite 400</p>
          <p>San Francisco, CA 94105</p>
        </div>
        <div className="font-medium text-neutral-800">{today}</div>
      </div>

      {/* Subject Line */}
      <div className="mt-6 text-sm font-bold text-neutral-900">
        Re: Application for Senior Technical Leadership / Engineering Role
      </div>

      {/* Body */}
      <div className="mt-5 space-y-4 text-xs text-neutral-700 leading-relaxed">
        <CoverBodyText heading={heading} />
      </div>
    </div>
  );
}

/** Cover 3: Split Sidebar / Editorial — Recipient Metadata Rail */
function Cover3Document({ resume, palette }: TemplateProps) {
  const { heading } = resume;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="p-12 font-sans text-neutral-800 text-[13px] leading-relaxed">
      {/* Split Head Bar */}
      <div className="flex justify-between items-end border-b-2 border-neutral-900 pb-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">
            {heading.firstName} {heading.lastName}
          </h1>
          <p className="text-xs font-semibold uppercase tracking-wider mt-1" style={{ color: palette.primary }}>
            {heading.title}
          </p>
        </div>
        <div className="text-xs font-medium text-neutral-500">{today}</div>
      </div>

      {/* Two-Column Body */}
      <div className="flex gap-8">
        {/* Left: Main Letter Body */}
        <div className="flex-1 space-y-4 text-xs text-neutral-700 leading-relaxed">
          <div className="text-sm font-bold text-neutral-900 pb-1">
            Re: Application for Senior Technical Leadership / Engineering Role
          </div>
          <CoverBodyText heading={heading} />
        </div>

        {/* Right: Metadata Cards Sidebar */}
        <div className="w-60 shrink-0 border-l border-neutral-200 pl-6 space-y-6 text-xs">
          <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 space-y-1">
            <h2 className="font-bold text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 pb-1 mb-2">
              Recipient
            </h2>
            <p className="font-bold text-neutral-900">Hiring Committee</p>
            <p className="text-neutral-700">Acme Innovations Corp</p>
            <p className="text-neutral-500">100 Enterprise Way</p>
            <p className="text-neutral-500">San Francisco, CA</p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 space-y-1">
            <h2 className="font-bold text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 pb-1 mb-2">
              Sender Details
            </h2>
            <p className="font-bold text-neutral-900">{heading.firstName} {heading.lastName}</p>
            {heading.location && <p className="text-neutral-600">{heading.location}</p>}
            {heading.phone && <p className="text-neutral-600">{heading.phone}</p>}
            {heading.email && <p className="text-neutral-600 break-all">{heading.email}</p>}
            {heading.linkedin && <p className="text-blue-600 break-all">{heading.linkedin}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Cover 4: Accent Icons / Creative — Modern Header with Vector Contact Icons */
function Cover4Document({ resume, palette }: TemplateProps) {
  const { heading } = resume;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="p-12 font-sans text-neutral-800 text-[13px] leading-relaxed">
      {/* Creative Header */}
      <div className="pb-4 border-b-2 border-neutral-200 mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: palette.primary }}>
          {heading.firstName} {heading.lastName}
        </h1>
        {heading.title && (
          <div className="mt-1">
            <span
              className="inline-block px-3 py-0.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: `${palette.primary}18`, color: palette.primary }}
            >
              {heading.title}
            </span>
          </div>
        )}

        {/* Iconized Contact Info */}
        <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-wrap gap-x-6 gap-y-2 text-xs text-neutral-600">
          {heading.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="size-3.5" style={{ color: palette.primary }} />
              <span>{heading.phone}</span>
            </div>
          )}
          {heading.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="size-3.5" style={{ color: palette.primary }} />
              <span>{heading.email}</span>
            </div>
          )}
          {heading.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="size-3.5" style={{ color: palette.primary }} />
              <span>{heading.location}</span>
            </div>
          )}
          {heading.linkedin && (
            <div className="flex items-center gap-1.5">
              <LinkedinIcon className="size-3.5" style={{ color: palette.primary }} />
              <span>{heading.linkedin}</span>
            </div>
          )}
        </div>
      </div>

      {/* Recipient Meta Box */}
      <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 flex justify-between items-start text-xs text-neutral-700 mb-6">
        <div className="space-y-0.5">
          <p className="font-bold text-neutral-900">Engineering Hiring Team</p>
          <p>Acme Innovations Corporation</p>
          <p>100 Enterprise Way, San Francisco, CA 94105</p>
        </div>
        <div className="font-semibold text-neutral-800">{today}</div>
      </div>

      {/* Subject Line */}
      <div className="text-sm font-bold text-neutral-900 mb-4">
        Re: Application for Senior Technical Leadership / Engineering Role
      </div>

      {/* Body */}
      <div className="space-y-4 text-xs text-neutral-700 leading-relaxed">
        <CoverBodyText heading={heading} />
      </div>
    </div>
  );
}
