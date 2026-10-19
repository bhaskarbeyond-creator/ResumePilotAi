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
import { normalizeResumeToDocument } from '@/lib/resume-view-model';
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

interface PaletteTheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  soft?: string;
  text?: string;
}

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

  /**
   * Data source precedence (DIR-008):
   *   1. `#renderToken=` / `?renderToken=` — one-time server-issued token,
   *      redeemed for the immutable publication payload (headless PDF path);
   *   2. `?publicToken=` — tokenized anonymous share preview;
   *   3. authenticated `/resumes/:id` for the owner.
   * There is no demo dataset: unknown ids and failed reads render an honest
   * error state and never a fabricated person.
   */
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    const renderToken = fragment.get('renderToken') || new URLSearchParams(location.search).get('renderToken');
    const publicToken = new URLSearchParams(location.search).get('publicToken');

    if (!resumeId) {
      setLoadError('No resume was specified for this export.');
      return;
    }

    async function load() {
      try {
        if (renderToken) {
          if (!/^[A-Za-z0-9_-]{43}$/.test(renderToken)) {
            if (!cancelled) setLoadError('This export link is malformed. Request a new export.');
            return;
          }
          const payload = await get<{ data?: any }>('/export-render-data', { token: renderToken });
          if (cancelled) return;
          if (!payload?.data) {
            setLoadError('This export link has expired. Run the export again to create a fresh link.');
            return;
          }
          // Single-use: strip the token from the address bar so a refresh or a
          // back-navigation cannot replay it.
          try {
            window.history.replaceState(null, '', window.location.pathname);
          } catch {
            /* history is unavailable in some embedded webviews */
          }
          applyResumePayload(payload.data);
          return;
        }

        if (publicToken) {
          const payload = await get<{ resume?: any }>(`/resumes/public/token/${encodeURIComponent(publicToken)}`);
          if (cancelled) return;
          if (!payload?.resume) {
            setLoadError('This shared resume was not found or is no longer published.');
            return;
          }
          applyResumePayload(payload.resume);
          return;
        }

        const data = await get<any>(`/resumes/${encodeURIComponent(resumeId)}`);
        if (cancelled) return;
        if (!data?.resume && !data?.data && !data?.heading) {
          setLoadError('Resume not found.');
          return;
        }
        applyResumePayload(data);
      } catch (err: any) {
        if (cancelled) return;
        const status = err?.response?.status;
        setLoadError(
          status === 401
            ? 'Sign in to view this resume, or open a shared link instead.'
            : status === 404
              ? 'Resume not found.'
              : status === 429
                ? 'Too many requests right now. Please retry in a moment.'
                : 'Failed to load resume data.'
        );
      }
    }

    function applyResumePayload(raw: any) {
      if (cancelled) return;
      const normalized = normalizeResumeToDocument(raw);
      const templateId = normalized.template || raw?.resume?.template || raw?.template || '';
      setResumeData(normalized);
      if (!matchedCvNum && templateId) {
        const num = Number.parseInt(String(templateId).replace(/\D/g, ''), 10);
        if (Number.isFinite(num) && num >= 1 && num <= 100 && !isCoverLetter) {
          setTemplateNum(num);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [resumeId, matchedCvNum, location.hash, location.search, isCoverLetter]);

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

      if (!resumeId) {
        throw new Error('Save the resume before exporting it to Word.');
      }
      const res = await fetch('/api/export-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          resumeId,
          resumeName: currentMeta.id,
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
    // This copies the private preview URL (owner/authorised access only). A
    // public share link is created exclusively through the Share dialog, which
    // publishes through the backend. The two must never be confused.
    const url = window.location.href;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => setCopied(false));
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
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
              disabled={zoomLevel <= 50}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="size-4" />
            </button>
            <span className="text-xs text-neutral-500 w-10 text-center" aria-live="polite">{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
              disabled={zoomLevel >= 150}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500 hover:bg-neutral-100"
              title="Reset zoom to 100%"
            >
              100%
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
            title="Copy this private preview link"
          >
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Share2 className="size-3.5" />}
            {copied ? 'Copied' : 'Copy preview link'}
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

/* End of export page. Legacy per-template JSX renderers were removed in
 * DIR-008: the page renders `SmartResumeDocument`, which is also what preview,
 * print and the public share viewer use, so there is exactly one renderer. */
