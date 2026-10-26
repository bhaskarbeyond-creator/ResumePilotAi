/**
 * PreviewModal Component
 *
 * Full-fidelity interactive A4 resume preview modal with zoom controls,
 * template switcher, and direct PDF/DOCX export triggers.
 * Built on Radix UI Dialog with Cuba M3 Executive Glassmorphic styling.
 */

import { useId, useState } from 'react';
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
}

export function PreviewModal({
  open,
  onOpenChange,
  resume,
  onTemplateChange,
}: PreviewModalProps) {
  const [zoom, setZoom] = useState<number>(100);
  const [shareOpen, setShareOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const descriptionId = useId();

  const currentTemplateId = resume.template || 'Cv1';
  // Unknown template ids are an explicit unsupported state, never a silent
  // downgrade to a different resume design.
  const meta = tryGetTemplateMeta(currentTemplateId);
  const isSaved = Boolean(resume.id);
  const unsavedHint = 'Save this resume before exporting or sharing it.';

  const fullName = `${resume.heading.firstName || ''} ${resume.heading.lastName || ''}`.trim() || resume.name || 'Candidate Name';

  const handleDownloadPdf = () => {
    if (!resume.id) {
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
    if (!resume.id) {
      setExportError(unsavedHint);
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
    if (!resume.id) {
      setExportError(unsavedHint);
      return;
    }
    setExportError(null);
    // Print the dedicated export document (A4 page sheets, no app chrome)
    // rather than the dashboard behind this modal.
    window.open(`/export/${encodeURIComponent(currentTemplateId)}/${encodeURIComponent(resume.id)}/en`, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          aria-describedby={descriptionId}
          className="max-w-5xl h-[92vh] flex flex-col p-0 overflow-hidden border-border bg-neutral-900/40 backdrop-blur-2xl"
          data-testid="cuba-preview-modal"
        >
          {/* Top Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-surface/90 px-4 py-3 backdrop-blur-md sm:px-6">
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
              <div className="hidden sm:block">
                <Select
                  value={currentTemplateId}
                  onValueChange={(val) => onTemplateChange?.(val)}
                >
                  <SelectTrigger className="h-8 w-44 text-xs font-medium">
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
                  onClick={() => setZoom((prev) => Math.max(50, prev - 15))}
                  disabled={zoom <= 50}
                  aria-label="Zoom out"
                  title="Zoom out"
                >
                  <ZoomOut className="size-3.5" aria-hidden="true" />
                </Button>
                <span
                  className="w-10 text-center text-xs font-mono text-ink-secondary"
                  aria-live="polite"
                  aria-label={`Preview zoom ${zoom} percent`}
                >
                  {zoom}%
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setZoom((prev) => Math.min(150, prev + 15))}
                  disabled={zoom >= 150}
                  aria-label="Zoom in"
                  title="Zoom in"
                >
                  <ZoomIn className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setZoom(100)}
                  aria-label="Reset zoom to 100 percent"
                  title="Reset zoom (100%)"
                >
                  <Maximize2 className="size-3" aria-hidden="true" />
                </Button>
              </div>
            </div>

            {/* Actions: Download, DOCX, Share, Print */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={!isSaved}
                aria-label={isSaved ? 'Print preview' : unsavedHint}
                title={isSaved ? 'Print preview' : unsavedHint}
                className="hidden md:flex gap-1.5 text-xs"
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
                disabled={!isSaved}
                aria-label={isSaved ? 'Download Word document' : unsavedHint}
                className="hidden sm:flex gap-1.5 text-xs text-emerald-600 hover:text-emerald-700"
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

          {/* Document Canvas Area */}
          <div className="flex-1 overflow-auto bg-neutral-100/90 p-4 sm:p-8 flex justify-center items-start">
            {!meta ? (
              <div role="alert" className="m-auto max-w-sm rounded-xl border border-rose-200 bg-white p-6 text-center">
                <p className="text-sm font-semibold text-rose-700">Unsupported template layout</p>
                <p className="mt-1 text-xs text-ink-muted">
                  This resume references a template that is not in the catalogue. Choose a supported
                  template to preview and export it.
                </p>
              </div>
            ) : (
            <div
              className="transition-transform duration-150 origin-top flex flex-col items-center"
              style={{
                transform: `scale(${zoom / 100})`,
                marginBottom: zoom > 100 ? `${(zoom - 100) * 12}px` : '32px',
              }}
            >
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
        templateId={currentTemplateId}
      />
    </>
  );
}
