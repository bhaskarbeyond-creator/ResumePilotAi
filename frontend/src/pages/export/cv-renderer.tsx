/**
 * Master Resume & CV Export Engine
 *
 * Printable document rendering for all 100 CV templates and four cover-letter
 * definitions, plus public shared resume views.
 *
 * Features:
 * - High-fidelity print styles (@media print)
 * - Five resume archetypes driven by template layout specifications
 * - 7 Curated color palettes
 * - Density & font size scaling
 * - Quick template switcher
 * - Print & Save to PDF triggers
 * - Explicit unsupported-template and load-error states; no demo data
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { get } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { TEMPLATES, COVER_TEMPLATES, tryGetTemplateMeta } from '@/lib/template-catalog';
import { normalizeDocumentResume } from '@/cv-templates/templateUtils';
import { SmartResumeDocument } from '@/components/resume/smart-resume-document';
import type { ResumeWatermark } from '@/components/ResumePageComposer';
import {
  Printer,
  Share2,
  ChevronLeft,
  Layout,
  Palette,
  ZoomIn,
  ZoomOut,
  Check,
  Download,
} from 'lucide-react';

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
  const requestedTemplateId = location.pathname.match(/^\/export\/([^/]+)(?:\/|$)/)?.[1];
  const isCoverLetter = Boolean(requestedTemplateId?.startsWith('Cover'));
  const matchedCvNum = requestedTemplateId?.match(/^Cv(\d+)$/)?.[1];
  const matchedCoverNum = requestedTemplateId?.match(/^Cover(\d+)$/)?.[1];
  // The generic export route must not turn an unknown or malformed URL ID
  // into Cv1 merely because it contains no recognized numeric prefix.
  const routeTemplateSupported = !requestedTemplateId || Boolean(tryGetTemplateMeta(requestedTemplateId));

  const initialTemplateNum = matchedCvNum ? parseInt(matchedCvNum, 10) : matchedCoverNum ? parseInt(matchedCoverNum, 10) : 1;
  const [templateNum, setTemplateNum] = useState<number>(initialTemplateNum);
  const [paletteIndex, setPaletteIndex] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [density, setDensity] = useState<'compact' | 'standard' | 'spacious'>('standard');
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resumeData, setResumeData] = useState<any>(null);
  const [exportWatermark, setExportWatermark] = useState<ResumeWatermark | undefined>();
  // Strict Mode replays effects in development. Both effect instances must
  // await the same redemption instead of consuming a one-time token twice.
  const renderTokenRequest = useRef<{ token: string; promise: Promise<{ data?: unknown }> } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const currentMeta = useMemo(
    () => routeTemplateSupported ? tryGetTemplateMeta(isCoverLetter ? `Cover${templateNum}` : `Cv${templateNum}`) : null,
    [templateNum, isCoverLetter, routeTemplateSupported]
  );
  const templateSupported = Boolean(currentMeta);

  // Dynamic template-curated palette with manual override support
  const activePalette: PaletteTheme = useMemo(() => {
    if (paletteIndex !== 0) {
      return PALETTES[paletteIndex % PALETTES.length] ?? PALETTES[0]!;
    }
    // Default to the template's designated colors from template-catalog
    return {
      id: currentMeta?.id || 'unsupported',
      name: currentMeta?.name || 'Unsupported template',
      primary: currentMeta?.primary || '#1e3a8a',
      secondary: currentMeta?.secondary || '#3b82f6',
      soft: `${currentMeta?.primary || '#1e3a8a'}15`,
      text: currentMeta?.primary || '#1e3a8a',
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

    if (!templateSupported) return;
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
          if (!renderTokenRequest.current || renderTokenRequest.current.token !== renderToken) {
            renderTokenRequest.current = { token: renderToken, promise: get<{ data?: unknown }>('/export-render-data', { token: renderToken }) };
          }
          const payload = await renderTokenRequest.current.promise;
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
          renderTokenRequest.current = null;
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

        const resource = isCoverLetter ? 'covers' : 'resumes';
        const data = await get<any>(`/${resource}/${encodeURIComponent(resumeId)}`);
        if (cancelled) return;
        if (!data?.resume && !data?.data && !data?.heading && !data?.cover) {
          setLoadError(isCoverLetter ? 'Cover letter not found.' : 'Resume not found.');
          return;
        }
        applyResumePayload(isCoverLetter ? data.cover : data);
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
      const normalized = normalizeDocumentResume(raw);
      // The server supplies this only when its entitlement policy requires it.
      // Do not infer a watermark from candidate data or client-side plan guesses.
      const suppliedWatermark = raw?._watermark ?? raw?.resume?._watermark ?? raw?.data?._watermark;
      setExportWatermark(suppliedWatermark?.enableFreeWatermark === true && typeof suppliedWatermark.watermarkText === 'string'
        ? { enableFreeWatermark: true, watermarkText: suppliedWatermark.watermarkText,
            opacity: Number(suppliedWatermark.opacity) || undefined, position: typeof suppliedWatermark.position === 'string' ? suppliedWatermark.position : undefined }
        : undefined);
      const templateId = normalized.template || raw?.resume?.template || raw?.template || '';
      if (!requestedTemplateId && templateId) {
        const saved = tryGetTemplateMeta(templateId);
        if (!saved || !saved.id.startsWith('Cv')) {
          setLoadError('Unsupported template layout. Choose a registered template before previewing this resume.');
          return;
        }
        setTemplateNum(Number.parseInt(saved.id.slice(2), 10));
      }
      setResumeData(normalized);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [resumeId, requestedTemplateId, location.hash, location.search, isCoverLetter, templateSupported]);

  useEffect(() => {
    const message = !currentMeta ? 'Unsupported template layout.' : loadError;
    if (message) {
      delete document.documentElement.dataset.exportReady;
      document.documentElement.dataset.exportError = message;
    }
    return () => { if (message) delete document.documentElement.dataset.exportError; };
  }, [currentMeta, loadError]);

  // A print action from the preview opens this route in a new tab. Wait for
  // composed pages, fonts and images; do not print a loading or overflow state.
  const autoPrinted = useRef(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).get('print') !== '1') return;
    const printWhenReady = () => {
      if (!autoPrinted.current && document.documentElement.dataset.exportReady === 'true') {
        autoPrinted.current = true;
        window.print();
      }
    };
    const observer = new MutationObserver(printWhenReady);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-export-ready'] });
    printWhenReady();
    return () => observer.disconnect();
  }, [location.search]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadDocx = async () => {
    setDownloadingDocx(true);
    setExportMessage(null);
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

      if (!resumeId || !currentMeta) {
        throw new Error('Save the resume and choose a supported template before exporting it to Word.');
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
      setExportMessage(`Could not download the Word document: ${err?.message || 'export failed'}`);
    } finally {
      setDownloadingDocx(false);
    }
  };

  const handleCopyShareLink = () => {
    // This copies the private preview URL (owner/authorised access only). A
    // public share link is created exclusively through the Share dialog, which
    // publishes through the backend. The two must never be confused.
    const url = new URL(window.location.href);
    url.searchParams.delete('print');
    if (currentMeta && resumeId) {
      if (/^\/export\/[^/]+\//.test(url.pathname)) {
        url.pathname = url.pathname.replace(/^\/export\/[^/]+\//, `/export/${encodeURIComponent(currentMeta.id)}/`);
      } else if (url.pathname.startsWith('/preview/')) {
        url.pathname = `/export/${encodeURIComponent(currentMeta.id)}/${encodeURIComponent(resumeId)}/en`;
      }
    }
    void navigator.clipboard.writeText(url.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => setCopied(false));
  };

  if (!currentMeta) {
    return (
      <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-6" role="alert">
        <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-lg">
          <h1 className="text-lg font-bold text-neutral-900">Unsupported template layout</h1>
          <p className="mt-2 text-sm text-neutral-600">This template is not in the catalogue. Choose a supported design to continue.</p>
          <Button className="mt-4" onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </main>
    );
  }

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

      {exportMessage && (
        <div
          role="alert"
          className="no-print mx-auto mt-3 flex w-full max-w-3xl items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900"
        >
          <span className="flex-1">{exportMessage}</span>
          <button
            type="button"
            onClick={() => setExportMessage(null)}
            className="rounded px-2 py-0.5 font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

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
            watermark={exportWatermark}
          />
        </div>
      </main>
    </div>
  );
}

/* End of export page. Legacy per-template JSX renderers were removed in
 * DIR-008: the page renders `SmartResumeDocument`, which is also what preview,
 * print and the public share viewer use, so there is exactly one renderer. */
