/**
 * Public Shared Resume Viewer — DIR-008
 *
 * Route: /shared/:token (tokenized, anonymous) with legacy /shared/:resumeId
 * support for links created before tokens existed.
 *
 * Contract:
 *  - one unauthenticated read: `/api/resumes/public/token/:token` (or
 *    `/api/resumes/public/:id` for a legacy id);
 *  - the published resume renders through the SAME engine as preview and PDF,
 *    using the template persisted on the resume;
 *  - unpublished / revoked / forged links render an honest not-found state;
 *  - no demo profile, no synthetic fallback, no owner/internal fields;
 *  - print CSS produces A4 sheets with the toolbar hidden.
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/loading';
import { get, normalizeError } from '@/lib/api-client';
import { resolvePublicResumeEndpoint } from '@/lib/share-publication';
import { normalizeResumeToDocument, type ResumeDocumentModel } from '@/lib/resume-view-model';
import { getTemplateMeta, type TemplateMeta } from '@/lib/template-catalog';
import { SmartResumeDocument } from '@/components/resume/smart-resume-document';
import { ChevronLeft, Check, Printer, Download, Share2, AlertTriangle } from 'lucide-react';

interface WatermarkConfig {
  enableFreeWatermark?: boolean;
  watermarkText?: string;
  opacity?: number;
  position?: string;
}

interface PublicResumeResponse {
  success?: boolean;
  resume?: any;
  watermark?: WatermarkConfig | null;
  publication?: { isPublished?: boolean; publishedAt?: string };
}

export function SharedResumePage() {
  const { resumeId } = useParams<{ resumeId: string }>();
  const [resume, setResume] = useState<ResumeDocumentModel | null>(null);
  const [meta, setMeta] = useState<TemplateMeta | null>(null);
  const [watermark, setWatermark] = useState<WatermarkConfig | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!resumeId) {
        setError('This shared resume was not found or is no longer published.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const endpoint = resolvePublicResumeEndpoint(resumeId);
        const payload = await get<PublicResumeResponse>(endpoint);
        if (cancelled) return;
        const publishedResume = payload?.resume;
        if (!publishedResume || (payload?.publication && payload.publication.isPublished === false)) {
          setError('This shared resume was not found or is no longer published.');
          setLoading(false);
          return;
        }
        const normalized = normalizeResumeToDocument(publishedResume);
        const templateId = normalized.template || publishedResume?.template || 'Cv1';
        let templateMeta: TemplateMeta;
        try {
          templateMeta = getTemplateMeta(templateId);
        } catch {
          setError(`This resume uses a template this viewer does not support (${String(templateId)}).`);
          setLoading(false);
          return;
        }
        if (!templateMeta.id.startsWith('Cv')) {
          setError('This shared resume points at a cover-letter template and cannot be shown here.');
          setLoading(false);
          return;
        }
        setResume(normalized);
        setMeta(templateMeta);
        setWatermark(publishedResume?._watermark || payload?.watermark || null);
        setPublishedAt(payload?.publication?.publishedAt || null);
      } catch (err) {
        if (cancelled) return;
        const normalized = normalizeError(err);
        setError(
          normalized.status === 404
            ? 'This shared resume was not found or is no longer published.'
            : normalized.status === 429
              ? 'Too many requests for this link. Please wait a moment and reload.'
              : 'This shared resume could not be loaded right now. Please try again.'
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [resumeId]);

  const handlePrint = () => window.print();
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (loading) return <PageSpinner />;

  if (error || !resume || !meta) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-12 print:bg-white">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-neutral-900">Resume Not Available</h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600" data-testid="shared-error">
            {error || 'This shared resume was not found or is no longer published.'}
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            If the owner unshared the resume or replaced the link, ask them for a new one.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to="/">
              <Button variant="outline" size="sm">
                <ChevronLeft className="mr-1 size-4" /> Go to homepage
              </Button>
            </Link>
            <Button size="sm" onClick={() => window.location.reload()}>Try again</Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-100 py-6 text-ink print:bg-white print:p-0">
      <div className="mx-auto mb-5 flex max-w-[900px] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            <span>Go to homepage</span>
          </Link>
          <span className="hidden text-xs text-neutral-400 sm:inline" aria-hidden="true">|</span>
          <span className="hidden text-xs text-neutral-500 sm:inline">
            {meta.id} · {meta.name}
            {publishedAt ? ` · shared ${new Date(publishedAt).toLocaleDateString()}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleCopyLink()}>
            {copied ? <Check className="mr-1.5 size-4 text-emerald-600" /> : <Share2 className="mr-1.5 size-4" />}
            {copied ? 'Copied Link' : 'Share Link'}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-1.5 size-4" aria-hidden="true" />
            Print
          </Button>
          <Button size="sm" onClick={handlePrint}>
            <Download className="mr-1.5 size-4" aria-hidden="true" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="relative mx-auto w-fit" data-testid="shared-document">
        <div className="shadow-xl print:shadow-none">
          <SmartResumeDocument resume={resume} meta={meta} />
        </div>
        {watermark?.enableFreeWatermark && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden print:block"
          >
            <span
              className="select-none whitespace-nowrap text-[38px] font-black uppercase tracking-[0.2em]"
              style={{
                color: '#0f172a',
                opacity: Math.min(Math.max(Number(watermark.opacity) || 0.18, 0.05), 0.4),
                transform: `rotate(${watermark.position === 'diagonal' ? -32 : 0}deg)`,
              }}
            >
              {watermark.watermarkText || 'Created with IME365 (Free Plan)'}
            </span>
          </div>
        )}
      </div>

      <p className="mx-auto mt-4 max-w-[900px] px-4 text-center text-[11px] text-neutral-500 print:hidden">
        This is a read-only shared resume. The owner can revoke this link at any time.
      </p>
    </main>
  );
}
