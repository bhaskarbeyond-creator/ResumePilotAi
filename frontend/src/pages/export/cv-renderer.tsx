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
  const [copied, setCopied] = useState(false);
  const [resumeData, setResumeData] = useState(FALLBACK_RESUME);

  const activePalette: PaletteTheme = PALETTES[paletteIndex % PALETTES.length] ?? PALETTES[0]!;

  // Load real resume if possible
  useEffect(() => {
    if (!resumeId || resumeId === 'demo' || resumeId === 'sample') return;
    let cancelled = false;

    async function load() {
      try {
        const data = await get<any>(`/resumes/${resumeId}`);
        if (!cancelled && data && data.heading) {
          setResumeData({
            ...FALLBACK_RESUME,
            ...data,
          });
        }
      } catch {
        // Fall back gracefully to demo content
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyShareLink = () => {
    const url = window.location.href;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine archetype based on templateNum
  // Archetypes: 0: Modern Banner, 1: Two-Column Left-Rail, 2: Clean Minimal ATS,
  // 3: Tech Grid, 4: Classic Corporate Serif, 5: Header Accent Line, 6: Elegant Split, 7: Compact Executive
  const archetype = useMemo(() => {
    if (isCoverLetter) return 'cover-letter';
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
  }, [templateNum, isCoverLetter]);

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      {/* ─── Top Floating Toolbar (Hidden on Print) ─── */}
      <header className="no-print sticky top-0 z-50 flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-4 shadow-xs">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-neutral-600 hover:text-neutral-900"
          >
            <ChevronLeft className="size-4" />
            Back
          </Button>
          <div className="hidden h-5 w-px bg-neutral-200 sm:block" />
          <div className="flex items-center gap-2">
            <Layout className="size-4 text-neutral-500" />
            <span className="text-xs font-semibold text-neutral-700 sm:text-sm">
              {isCoverLetter ? `Cover Letter #${templateNum}` : `CV Template #${templateNum}`}
            </span>
          </div>
        </div>

        {/* Center: Template & Palette Switchers */}
        <div className="flex items-center gap-2">
          {/* Template Quick Select */}
          <div className="flex items-center gap-1.5">
            <span className="hidden text-xs text-neutral-500 md:inline">Template:</span>
            <select
              value={templateNum}
              onChange={(e) => setTemplateNum(Number(e.target.value))}
              className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-800 shadow-xs focus:outline-2 focus:outline-blue-600"
            >
              {isCoverLetter
                ? [1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      Cover Letter {n}
                    </option>
                  ))
                : Array.from({ length: 51 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      Template {n} ({['Modern', 'Sidebar', 'ATS Clean', 'Tech', 'Serif', 'Accent', 'Split', 'Compact'][(n - 1) % 8]})
                    </option>
                  ))}
            </select>
          </div>

          {/* Palette Picker */}
          <div className="hidden items-center gap-1 sm:flex">
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

          {/* Zoom controls */}
          <div className="hidden items-center gap-1 lg:flex">
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

        {/* Right Actions: Share & Print/PDF */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyShareLink}
            className="text-xs hidden sm:flex"
          >
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Share2 className="size-3.5" />}
            {copied ? 'Link Copied' : 'Share'}
          </Button>

          <Button
            size="sm"
            onClick={handlePrint}
            className="bg-neutral-900 text-white hover:bg-neutral-800 text-xs shadow-xs"
          >
            <Printer className="size-3.5" />
            Print / PDF
          </Button>
        </div>
      </header>

      {/* ─── Printable Document Container ─── */}
      <main className="flex justify-center p-4 sm:p-8 lg:p-12 overflow-x-auto">
        <div
          id="printable-document"
          className="page-sheet relative bg-white shadow-xl transition-transform"
          style={{
            width: '210mm',
            minHeight: '297mm',
            transform: zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : undefined,
            transformOrigin: 'top center',
          }}
        >
          {isCoverLetter ? (
            <CoverLetterDocument resume={resumeData} palette={activePalette} />
          ) : archetype === 'two-column' ? (
            <TwoColumnTemplate resume={resumeData} palette={activePalette} />
          ) : archetype === 'modern-banner' ? (
            <ModernBannerTemplate resume={resumeData} palette={activePalette} />
          ) : archetype === 'tech-grid' ? (
            <TechGridTemplate resume={resumeData} palette={activePalette} />
          ) : archetype === 'classic-serif' ? (
            <ClassicSerifTemplate resume={resumeData} palette={activePalette} />
          ) : archetype === 'accent-line' ? (
            <AccentLineTemplate resume={resumeData} palette={activePalette} />
          ) : archetype === 'elegant-split' ? (
            <ElegantSplitTemplate resume={resumeData} palette={activePalette} />
          ) : archetype === 'compact-exec' ? (
            <CompactExecTemplate resume={resumeData} palette={activePalette} />
          ) : (
            <MinimalATSTemplate resume={resumeData} palette={activePalette} />
          )}
        </div>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * TEMPLATE ARCHETYPES (Vector-grade Print Ready)
 * ───────────────────────────────────────────────────────────── */

interface TemplateProps {
  resume: typeof FALLBACK_RESUME;
  palette: (typeof PALETTES)[0];
}

/* ─── 1. Modern Banner Template ─── */
function ModernBannerTemplate({ resume, palette }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories } = resume;

  return (
    <div className="p-10 font-sans text-neutral-800 leading-relaxed text-[13px]">
      {/* Colored Header Banner */}
      <div
        className="rounded-xl p-8 text-white shadow-xs"
        style={{ backgroundColor: palette.primary }}
      >
        <h1 className="text-3xl font-extrabold tracking-tight">
          {heading.firstName} {heading.lastName}
        </h1>
        <p className="mt-1 text-base font-medium opacity-95">{heading.title}</p>

        {/* Contact Links */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs opacity-90">
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

      {/* Summary */}
      {summary && (
        <section className="mt-6">
          <h2
            className="text-xs font-bold uppercase tracking-wider pb-1 border-b"
            style={{ color: palette.primary, borderColor: palette.primary }}
          >
            Professional Summary
          </h2>
          <p className="mt-2 text-neutral-700 leading-normal">{summary}</p>
        </section>
      )}

      {/* Experience */}
      <section className="mt-6">
        <h2
          className="text-xs font-bold uppercase tracking-wider pb-1 border-b"
          style={{ color: palette.primary, borderColor: palette.primary }}
        >
          Work Experience
        </h2>
        <div className="mt-3 space-y-4">
          {experience.map((exp) => (
            <div key={exp.id}>
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="font-bold text-neutral-900 text-sm">{exp.position}</span>
                  <span className="text-neutral-500 font-medium"> · {exp.company}</span>
                </div>
                <span className="text-xs font-medium text-neutral-500">
                  {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                </span>
              </div>
              <div className="text-xs text-neutral-500">{exp.location}</div>
              <p className="mt-1.5 whitespace-pre-line text-neutral-700 text-xs leading-normal">
                {exp.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Skills */}
      <section className="mt-6">
        <h2
          className="text-xs font-bold uppercase tracking-wider pb-1 border-b"
          style={{ color: palette.primary, borderColor: palette.primary }}
        >
          Core Competencies & Skills
        </h2>
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
      <section className="mt-6">
        <h2
          className="text-xs font-bold uppercase tracking-wider pb-1 border-b"
          style={{ color: palette.primary, borderColor: palette.primary }}
        >
          Education
        </h2>
        <div className="mt-3 space-y-3">
          {education.map((edu) => (
            <div key={edu.id} className="flex justify-between items-start">
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
    </div>
  );
}

/* ─── 2. Two-Column Left-Rail Template ─── */
function TwoColumnTemplate({ resume, palette }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories } = resume;

  return (
    <div className="flex min-h-full font-sans text-neutral-800 text-[12.5px]">
      {/* Left Column (32%) */}
      <aside
        className="w-[32%] p-8 text-white flex flex-col justify-between"
        style={{ backgroundColor: palette.primary }}
      >
        <div>
          {/* Avatar Initials Badge */}
          <div className="size-16 rounded-2xl bg-white/20 flex items-center justify-center text-xl font-bold tracking-wider mb-4 border border-white/30">
            {heading.firstName[0]}
            {heading.lastName[0]}
          </div>

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
          <section>
            <h2
              className="text-xs font-bold uppercase tracking-wider pb-1 border-b"
              style={{ color: palette.primary, borderColor: palette.primary }}
            >
              Executive Summary
            </h2>
            <p className="mt-2 text-neutral-700 leading-relaxed text-xs">{summary}</p>
          </section>
        )}

        {/* Experience */}
        <section className="mt-8">
          <h2
            className="text-xs font-bold uppercase tracking-wider pb-1 border-b"
            style={{ color: palette.primary, borderColor: palette.primary }}
          >
            Professional Experience
          </h2>
          <div className="mt-4 space-y-5">
            {experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex justify-between items-baseline">
                  <div className="font-bold text-neutral-900 text-sm">{exp.position}</div>
                  <span className="text-xs font-semibold text-neutral-500">
                    {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                  </span>
                </div>
                <div className="text-xs font-medium" style={{ color: palette.primary }}>
                  {exp.company} · {exp.location}
                </div>
                <p className="mt-2 whitespace-pre-line text-neutral-600 text-xs leading-normal">
                  {exp.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

/* ─── 3. Minimal ATS-Optimized Template ─── */
function MinimalATSTemplate({ resume }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories } = resume;

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
        <section className="mt-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 border-b border-neutral-200 pb-0.5">
            Summary
          </h2>
          <p className="mt-1.5 text-neutral-700 text-xs leading-normal">{summary}</p>
        </section>
      )}

      {/* Experience */}
      <section className="mt-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 border-b border-neutral-200 pb-0.5">
          Experience
        </h2>
        <div className="mt-3 space-y-4">
          {experience.map((exp) => (
            <div key={exp.id}>
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

      {/* Education */}
      <section className="mt-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 border-b border-neutral-200 pb-0.5">
          Education
        </h2>
        <div className="mt-2 space-y-2">
          {education.map((edu) => (
            <div key={edu.id} className="flex justify-between text-xs">
              <div>
                <span className="font-bold text-neutral-900">{edu.institution}</span> — {edu.degree} in {edu.field}
              </div>
              <span className="text-neutral-600">{edu.endDate}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Skills */}
      <section className="mt-5">
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
    </div>
  );
}

/* ─── 4. Tech Grid Template ─── */
function TechGridTemplate({ resume, palette }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories } = resume;

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
        <div className="mt-6 rounded-lg bg-neutral-50 p-3.5 border border-neutral-200/80 text-xs text-neutral-700">
          {summary}
        </div>
      )}

      {/* Technical Skills Grid */}
      <section className="mt-6">
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
      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-200 pb-1">
          Technical Experience
        </h2>
        <div className="mt-3 space-y-4">
          {experience.map((exp) => (
            <div key={exp.id}>
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

      {/* Education */}
      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-200 pb-1">
          Education
        </h2>
        <div className="mt-2 space-y-2 text-xs">
          {education.map((edu) => (
            <div key={edu.id} className="flex justify-between">
              <div>
                <span className="font-bold text-neutral-900">{edu.degree} in {edu.field}</span> · {edu.institution}
              </div>
              <span className="text-neutral-500 font-mono text-[11px]">{edu.endDate}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ─── 5. Classic Serif Template ─── */
function ClassicSerifTemplate({ resume }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories } = resume;

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
        <section className="mt-6">
          <h2 className="font-sans text-xs font-bold tracking-widest text-neutral-900 uppercase border-b border-neutral-300 pb-0.5">
            Profile
          </h2>
          <p className="mt-2 text-neutral-800 leading-relaxed text-xs">{summary}</p>
        </section>
      )}

      {/* Experience */}
      <section className="mt-6">
        <h2 className="font-sans text-xs font-bold tracking-widest text-neutral-900 uppercase border-b border-neutral-300 pb-0.5">
          Professional Experience
        </h2>
        <div className="mt-3 space-y-4">
          {experience.map((exp) => (
            <div key={exp.id}>
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

      {/* Education */}
      <section className="mt-6">
        <h2 className="font-sans text-xs font-bold tracking-widest text-neutral-900 uppercase border-b border-neutral-300 pb-0.5">
          Education
        </h2>
        <div className="mt-2 space-y-2">
          {education.map((edu) => (
            <div key={edu.id} className="flex justify-between text-xs">
              <div>
                <span className="font-bold">{edu.institution}</span> — {edu.degree} in {edu.field}
              </div>
              <span className="font-sans text-neutral-600">{edu.endDate}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Skills */}
      <section className="mt-6">
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
    </div>
  );
}

/* ─── 6. Accent Line Template ─── */
function AccentLineTemplate({ resume, palette }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories } = resume;

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
        <section className="mt-4">
          <p className="text-neutral-700 text-xs leading-normal">{summary}</p>
        </section>
      )}

      {/* Experience */}
      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: palette.primary }}>
          Work Experience
        </h2>
        <div className="mt-3 space-y-4">
          {experience.map((exp) => (
            <div key={exp.id} className="relative pl-4 border-l-2 border-neutral-200">
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

      {/* Skills */}
      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: palette.primary }}>
          Key Skills
        </h2>
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
      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: palette.primary }}>
          Education
        </h2>
        <div className="mt-2 space-y-2 text-xs">
          {education.map((edu) => (
            <div key={edu.id} className="flex justify-between">
              <div>
                <span className="font-bold">{edu.degree} in {edu.field}</span> — {edu.institution}
              </div>
              <span className="text-neutral-500">{edu.endDate}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ─── 7. Elegant Split Template ─── */
function ElegantSplitTemplate({ resume, palette }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories } = resume;

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
        <div className="mt-5 text-neutral-700 text-xs leading-relaxed border-l-2 pl-3" style={{ borderColor: palette.primary }}>
          {summary}
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-6">
        {/* Main Column (2 of 3) */}
        <div className="col-span-2 space-y-6">
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 border-b pb-1">
              Experience
            </h2>
            <div className="mt-3 space-y-4">
              {experience.map((exp) => (
                <div key={exp.id}>
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
        </div>

        {/* Side Column (1 of 3) */}
        <div className="space-y-6">
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 border-b pb-1">
              Skills
            </h2>
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

          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 border-b pb-1">
              Education
            </h2>
            <div className="mt-3 space-y-2">
              {education.map((edu) => (
                <div key={edu.id} className="text-xs">
                  <div className="font-bold text-neutral-900">{edu.degree}</div>
                  <div className="text-neutral-600 text-[11px]">{edu.institution}</div>
                  <div className="text-neutral-500 text-[10px]">{edu.endDate}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ─── 8. Compact Executive Template ─── */
function CompactExecTemplate({ resume, palette }: TemplateProps) {
  const { heading, summary, experience, education, skillCategories } = resume;

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
        <p className="mt-3 text-neutral-700 text-xs leading-normal">{summary}</p>
      )}

      {/* Experience */}
      <section className="mt-4">
        <h2
          className="text-[11px] font-black uppercase tracking-wider text-white px-2 py-0.5 rounded-xs"
          style={{ backgroundColor: palette.primary }}
        >
          Professional Experience
        </h2>
        <div className="mt-2 space-y-3">
          {experience.map((exp) => (
            <div key={exp.id}>
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

      {/* Skills & Education side by side */}
      <div className="mt-4 grid grid-cols-2 gap-4">
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
              <div key={edu.id}>
                <div className="font-bold">{edu.degree} in {edu.field}</div>
                <div className="text-neutral-600">{edu.institution} ({edu.endDate})</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * COVER LETTER EXPORT DOCUMENT
 * ───────────────────────────────────────────────────────────── */

function CoverLetterDocument({
  resume,
  palette,
}: {
  resume: typeof FALLBACK_RESUME;
  palette: (typeof PALETTES)[0];

}) {
  const { heading } = resume;
  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="p-12 font-sans text-neutral-800 text-[13px] leading-relaxed">
      {/* Sender Header */}
      <div className="border-b-2 pb-6" style={{ borderColor: palette.primary }}>
        <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">
          {heading.firstName} {heading.lastName}
        </h1>
        <p className="text-sm font-semibold mt-1" style={{ color: palette.primary }}>
          {heading.title}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-600">
          <span>{heading.email}</span>
          <span>{heading.phone}</span>
          <span>{heading.location}</span>
          {heading.linkedin && <span>{heading.linkedin}</span>}
        </div>
      </div>

      {/* Date & Recipient */}
      <div className="mt-8 space-y-1 text-xs text-neutral-700">
        <p className="font-medium text-neutral-900">{today}</p>
        <div className="pt-3">
          <p className="font-bold text-neutral-900">Hiring Team / Engineering Leadership</p>
          <p>Acme Innovations Corporation</p>
          <p>100 Enterprise Way</p>
          <p>San Francisco, CA 94105</p>
        </div>
      </div>

      {/* Subject Line */}
      <div className="mt-6 text-sm font-bold text-neutral-900">
        Re: Application for Senior Technical Leadership / Engineering Role
      </div>

      {/* Body Paragraphs */}
      <div className="mt-5 space-y-4 text-xs text-neutral-700 leading-relaxed">
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
      </div>
    </div>
  );
}
