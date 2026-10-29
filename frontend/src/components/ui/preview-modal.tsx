/**
 * PreviewModal Component
 *
 * Full-fidelity interactive A4 resume preview modal with zoom controls,
 * template switcher, and direct PDF/DOCX export triggers.
 * Built on Radix UI Dialog with Cuba M3 Executive Glassmorphic styling.
 */

import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  Share2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  Printer,
} from 'lucide-react';
import { TEMPLATES, tryGetTemplateMeta } from '@/lib/template-catalog';
import { SmartResumeDocument } from '@/components/resume/smart-resume-document';
import { ShareModal } from './share-modal';

interface ResumePreviewData {
  id?: string;
  name: string;
  template: string;
  heading: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    location: string;
    website?: string;
    linkedin?: string;
    github?: string;
    title: string;
    photo?: string;
    showPhoto?: boolean;
  };
  experience: {
    id: string;
    company: string;
    position: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    current?: boolean;
    description: string;
  }[];
  education: {
    id: string;
    institution: string;
    degree: string;
    field?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
    description?: string;
  }[];
  skillCategories: {
    id: string;
    category: string;
    skills: string[];
  }[];
  summary: string;
  certifications?: {
    id: string;
    name: string;
    issuer?: string;
    date?: string;
  }[];
  projects?: {
    id: string;
    title: string;
    description: string;
    technologies?: string;
    liveUrl?: string;
  }[];
  languages?: {
    id: string;
    language: string;
    proficiency: string;
  }[];
  achievements?: {
    id: string;
    title: string;
    description: string;
  }[];
}

interface PreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resume: ResumePreviewData;
  onTemplateChange?: (templateId: string) => void;
  returnFocusTo?: HTMLElement | null;
  savedTemplateId?: string;
}

export function PreviewModal({
  open,
  onOpenChange,
  resume,
  onTemplateChange,
  returnFocusTo,
  savedTemplateId,
}: PreviewModalProps) {
  const [zoom, setZoom] = useState<number>(100);
  const [selectedTemplate, setSelectedTemplate] = useState(resume.template || 'Cv1');
  const canvasRef = useRef<HTMLDivElement>(null);
  // This dialog is controlled externally rather than through a Radix Trigger.
  const returnFocus = useRef<HTMLElement | null>(returnFocusTo || (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useLayoutEffect(() => {
    if (open) return;
    const isOutsideDialog = (value: EventTarget | null): value is HTMLElement =>
      value instanceof HTMLElement && !value.closest('[data-testid="cuba-preview-modal"]');
    const rememberFocus = (event: FocusEvent) => {
      // Radix may move focus before this closed-state effect cleans up.
      if (isOutsideDialog(event.target)) returnFocus.current = event.target;
    };
    // During closing the active element can still be a dialog control; do not
    // overwrite the saved trigger before Radix emits its close-autofocus event.
    if (isOutsideDialog(document.activeElement)) returnFocus.current = document.activeElement;
    document.addEventListener('focusin', rememberFocus);
    return () => document.removeEventListener('focusin', rememberFocus);
  }, [open]);
  useEffect(() => { if (returnFocusTo) returnFocus.current = returnFocusTo; }, [returnFocusTo]);
  useEffect(() => { setSelectedTemplate(resume.template || 'Cv1'); }, [resume.id, resume.template]);
  useEffect(() => { if (open) setZoom(100); }, [open, resume.id]);
  const fitToWidth = () => {
    const width = canvasRef.current?.clientWidth || 0;
    const pageWidth = 210 * 96 / 25.4;
    setZoom(Math.max(50, Math.min(150, Math.floor(((width - 48) / pageWidth) * 100))));
  };
  const [shareOpen, setShareOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const descriptionId = useId();

  const currentTemplateId = selectedTemplate;
  const hasOmittedOptionalSections = ['achievements', 'references', 'hobbies', 'customSections']
    .some(key => !Object.prototype.hasOwnProperty.call(resume, key));
  // Unknown template ids are an explicit unsupported state, never a silent
  // downgrade to a different resume design.
  const meta = tryGetTemplateMeta(currentTemplateId);
  const isSaved = Boolean(resume.id && meta);
  // DOCX is generated from the persisted template; the server rejects a
  // temporary gallery selection that does not match the saved template.
  const canDownloadDocx = isSaved && (!savedTemplateId || savedTemplateId === currentTemplateId);
  const docxHint = canDownloadDocx ? 'Download Word document' : (isSaved ? 'Save this template before downloading Word.' : 'Save this resume and choose a supported template before downloading Word.');
  const unsavedHint = meta ? 'Save this resume before exporting or sharing it.' : 'Choose a supported template before exporting or sharing.';

  const fullName = `${resume.heading?.firstName || ''} ${resume.heading?.lastName || ''}`.trim() || resume.name || 'Resume';

  const handleDownloadPdf = () => {
    if (!isSaved) {
      setExportError(unsavedHint);
      return;
    }
    setExportError(null);
    setDownloadingPdf(true);
    // The export route renders the same production document with A4 print CSS
    // and the browser's "Save as PDF"; the server-side PDF path stays available
    // through the API for automated exports.
    const exportUrl = `/export/${encodeURIComponent(currentTemplateId)}/${encodeURIComponent(resume.id)}/en`;
    window.open(exportUrl, '_blank', 'noopener,noreferrer');
    setTimeout(() => setDownloadingPdf(false), 1500);
  };

  const handleDownloadDocx = async () => {
    if (!canDownloadDocx) {
      setExportError(docxHint);
      return;
    }
    setExportError(null);
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

      const res = await fetch('/api/export-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          resumeId: resume.id,
          resumeName: currentTemplateId,
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
      a.download = `${(resume.name || fullName || 'Resume').replace(/[^\w\s-]/g, '').trim() || 'Resume'}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(`Could not download the Word document: ${err.message || 'export failed'}`);
    } finally {
      setDownloadingDocx(false);
    }
  };

  const handlePrint = () => {
    if (!isSaved) {
      setExportError(unsavedHint);
      return;
    }
    setExportError(null);
    // Print the dedicated export document (A4 page sheets, no app chrome)
    // rather than the dashboard behind this modal.
    window.open(`/export/${encodeURIComponent(currentTemplateId)}/${encodeURIComponent(resume.id)}/en?print=1`, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          aria-describedby={descriptionId}
          className="max-w-5xl h-[92vh] flex flex-col p-0 overflow-hidden border-border bg-neutral-900/40 backdrop-blur-2xl"
          data-testid="cuba-preview-modal"
          onCloseAutoFocus={(event) => {
            if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus(); }
          }}
        >
          {/* Top Control Bar */}
          <div data-preview-controls className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-surface/90 px-4 py-3 pr-14 backdrop-blur-md sm:px-6 sm:pr-14">
            <div className="flex items-center gap-3">
              <div
                className="flex size-9 items-center justify-center rounded-xl text-white shadow-sm"
                style={{ backgroundColor: meta?.primary || '#334155' }}
              >
                <FileText className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold text-ink truncate max-w-xs sm:max-w-sm">
                  {fullName}
                </DialogTitle>
                <DialogDescription id={descriptionId} className="text-xs text-ink-muted">
                  {meta ? `${meta.name} · ${meta.category.toUpperCase()}` : 'Unsupported template layout'}
                  {' · '}Preview at {zoom}% zoom
                </DialogDescription>
              </div>
            </div>

            {/* Middle: Template Switcher & Zoom */}
            <div className="flex items-center gap-2">
              <div>
                <Select
                  value={currentTemplateId}
                  onValueChange={(val) => { setSelectedTemplate(val); onTemplateChange?.(val); }}
                >
                  <SelectTrigger aria-label="Switch resume template" className="h-8 w-36 sm:w-44 text-xs font-medium">
                    <SelectValue placeholder="Switch template" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {TEMPLATES.map((tmpl) => (
                      <SelectItem key={tmpl.id} value={tmpl.id} className="text-xs">
                        <span className="font-semibold text-brand-600 mr-1.5">{tmpl.id}</span>
                        {tmpl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Zoom Buttons */}
              <div className="flex items-center rounded-lg border border-border bg-surface px-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setZoom((prev) => Math.max(50, prev - 10))}
                  disabled={zoom <= 50}
                  aria-label="Zoom out"
                  title="Zoom out"
                >
                  <ZoomOut className="size-3.5" aria-hidden="true" />
                </Button>
                <span
                  className="w-10 text-center text-[11px] font-mono text-ink-secondary"
                  aria-live="polite"
                  aria-label={`Preview zoom ${zoom} percent`}
                >
                  {zoom}%
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setZoom((prev) => Math.min(150, prev + 10))}
                  disabled={zoom >= 150}
                  aria-label="Zoom in"
                  title="Zoom in"
                >
                  <ZoomIn className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={fitToWidth}
                  aria-label="Fit preview to width"
                  title="Fit to width"
                >
                  <Maximize2 className="size-3" aria-hidden="true" />
                </Button>
              </div>
            </div>

            {/* Actions: Download, DOCX, Share, Print */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={!isSaved}
                aria-label={isSaved ? 'Print preview' : unsavedHint}
                title={isSaved ? 'Print preview' : unsavedHint}
                className="flex gap-1.5 text-xs"
              >
                <Printer className="size-3.5" />
                Print
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareOpen(true)}
                disabled={!isSaved}
                aria-label={isSaved ? 'Share resume' : unsavedHint}
                title={isSaved ? 'Share resume' : unsavedHint}
                className="gap-1.5 text-xs text-brand-600 hover:text-brand-700"
              >
                <Share2 className="size-3.5" />
                Share
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadDocx}
                loading={downloadingDocx}
                disabled={!canDownloadDocx}
                aria-label={docxHint}
                title={docxHint}
                className="flex gap-1.5 text-xs text-emerald-800 hover:text-emerald-900"
              >
                <Download className="size-3.5" />
                DOCX
              </Button>
              <Button
                size="sm"
                onClick={handleDownloadPdf}
                loading={downloadingPdf}
                disabled={!isSaved}
                aria-label={isSaved ? 'Open print-ready PDF view' : unsavedHint}
                className="gap-1.5 text-xs shadow-md"
              >
                <Download className="size-3.5" />
                PDF
              </Button>
            </div>
          </div>

          {exportError && (
            <div
              role="alert"
              className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800 sm:px-6"
            >
              {exportError}
            </div>
          )}

          {hasOmittedOptionalSections && (
            <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6">
              Some optional sections were not supplied to this preview. Save the resume and open it from My Resumes for the complete saved document.
            </p>
          )}
          {/* Document Canvas Area */}
          <div ref={canvasRef} data-preview-canvas className="flex-1 min-h-0 overflow-auto bg-neutral-100/90 p-4 sm:p-6 flex justify-center items-start">
            {!meta ? (
              <div role="alert" className="m-auto max-w-sm rounded-xl border border-rose-200 bg-white p-6 text-center">
                <p className="text-sm font-semibold text-rose-700">Unsupported template layout</p>
                <p className="mt-1 text-xs text-ink-muted">
                  This resume references a template that is not in the catalogue. Choose a supported
                  template to preview and export it.
                </p>
              </div>
            ) : (
            <div data-preview-scale className="shrink-0 flex flex-col items-center" style={{ zoom: `${zoom}%` }}>
              <SmartResumeDocument
                resume={resume}
                meta={meta}
                palette={{
                  primary: meta.primary || '#1e3a8a',
                  secondary: meta.secondary || '#3b82f6',
                }}
              />
            </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Modal Triggered from Preview */}
      <ShareModal
        open={shareOpen && isSaved}
        onOpenChange={setShareOpen}
        resumeId={resume.id || ''}
        resumeName={resume.name || fullName}
        templateId={savedTemplateId || 'Last saved template'}
      />
    </>
  );
}
