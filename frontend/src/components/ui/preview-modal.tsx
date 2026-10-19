/**
 * PreviewModal Component
 *
 * Full-fidelity interactive A4 resume preview modal with zoom controls,
 * template switcher, and direct PDF/DOCX export triggers.
 * Built on Radix UI Dialog with Cuba M3 Executive Glassmorphic styling.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
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
  Mail,
  Phone,
  MapPin,
  Globe,
  Printer,
  Sparkles,
} from 'lucide-react';
import { TEMPLATES, getTemplateMeta } from '@/lib/template-catalog';
import { ShareModal } from './share-modal';

const LinkedinIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
  </svg>
);

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/>
  </svg>
);

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

  const currentTemplateId = resume.template || 'Cv1';
  const meta = getTemplateMeta(currentTemplateId);

  const fullName = `${resume.heading.firstName || ''} ${resume.heading.lastName || ''}`.trim() || resume.name || 'Candidate Name';

  const handleDownloadPdf = () => {
    setDownloadingPdf(true);
    const resumeId = resume.id || 'draft';
    const exportUrl = `/export/${currentTemplateId}/${resumeId}/en`;
    window.open(exportUrl, '_blank');
    setTimeout(() => setDownloadingPdf(false), 1500);
  };

  const handleDownloadDocx = () => {
    setDownloadingDocx(true);
    const resumeId = resume.id || 'draft';
    const exportUrl = `/export-docx/${currentTemplateId}/${resumeId}/en`;
    window.open(exportUrl, '_blank');
    setTimeout(() => setDownloadingDocx(false), 1500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl h-[92vh] flex flex-col p-0 overflow-hidden border-border bg-neutral-900/40 backdrop-blur-2xl">
          {/* Top Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-surface/90 px-4 py-3 backdrop-blur-md sm:px-6">
            <div className="flex items-center gap-3">
              <div
                className="flex size-9 items-center justify-center rounded-xl text-white shadow-sm"
                style={{ backgroundColor: meta.primary }}
              >
                <FileText className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold text-ink truncate max-w-xs sm:max-w-sm">
                  {fullName}
                </DialogTitle>
                <p className="text-xs text-ink-muted">
                  {meta.name} · {meta.category.toUpperCase()}
                </p>
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
                  title="Zoom Out"
                >
                  <ZoomOut className="size-3.5" />
                </Button>
                <span className="w-10 text-center text-[11px] font-mono text-ink-secondary">
                  {zoom}%
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setZoom((prev) => Math.min(150, prev + 15))}
                  title="Zoom In"
                >
                  <ZoomIn className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setZoom(100)}
                  title="Reset Zoom (100%)"
                >
                  <Maximize2 className="size-3" />
                </Button>
              </div>
            </div>

            {/* Actions: Download, DOCX, Share, Print */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="hidden md:flex gap-1.5 text-xs"
              >
                <Printer className="size-3.5" />
                Print
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareOpen(true)}
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
                className="hidden sm:flex gap-1.5 text-xs text-emerald-600 hover:text-emerald-700"
              >
                <Download className="size-3.5" />
                DOCX
              </Button>
              <Button
                size="sm"
                onClick={handleDownloadPdf}
                loading={downloadingPdf}
                className="gap-1.5 text-xs shadow-md"
              >
                <Download className="size-3.5" />
                PDF
              </Button>
            </div>
          </div>

          {/* Document Canvas Area */}
          <div className="flex-1 overflow-auto bg-neutral-100/90 p-4 sm:p-8 flex justify-center items-start">
            <div
              className="bg-white shadow-2xl transition-transform duration-150 origin-top"
              style={{
                width: '794px', // Standard A4 width at 96 DPI
                minHeight: '1123px', // Standard A4 height at 96 DPI
                transform: `scale(${zoom / 100})`,
                marginBottom: zoom > 100 ? `${(zoom - 100) * 12}px` : '32px',
              }}
            >
              {/* Modern Split Layout or Executive Layout based on template archetype */}
              {meta.archetype === 'modern-split' || meta.archetype === 'compact-euro' ? (
                <div className="flex min-h-[1123px]">
                  {/* Left Sidebar */}
                  <div
                    className="w-[34%] p-6 text-white flex flex-col justify-between"
                    style={{ backgroundColor: meta.primary }}
                  >
                    <div>
                      {/* Name & Title */}
                      <h1 className="text-xl font-bold tracking-tight text-white mb-1">
                        {fullName}
                      </h1>
                      <p className="text-xs font-medium text-white/80 uppercase tracking-wider mb-6">
                        {resume.heading.title || 'Professional Title'}
                      </p>

                      {/* Contact Info */}
                      <div className="space-y-2 text-xs text-white/90 mb-6 border-t border-white/20 pt-4">
                        {resume.heading.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="size-3.5 shrink-0 text-white/70" />
                            <span className="truncate">{resume.heading.email}</span>
                          </div>
                        )}
                        {resume.heading.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="size-3.5 shrink-0 text-white/70" />
                            <span>{resume.heading.phone}</span>
                          </div>
                        )}
                        {resume.heading.location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="size-3.5 shrink-0 text-white/70" />
                            <span>{resume.heading.location}</span>
                          </div>
                        )}
                        {resume.heading.linkedin && (
                          <div className="flex items-center gap-2">
                            <LinkedinIcon className="size-3.5 shrink-0 text-white/70" />
                            <span className="truncate">{resume.heading.linkedin}</span>
                          </div>
                        )}
                        {resume.heading.github && (
                          <div className="flex items-center gap-2">
                            <GithubIcon className="size-3.5 shrink-0 text-white/70" />
                            <span className="truncate">{resume.heading.github}</span>
                          </div>
                        )}
                        {resume.heading.website && (
                          <div className="flex items-center gap-2">
                            <Globe className="size-3.5 shrink-0 text-white/70" />
                            <span className="truncate">{resume.heading.website}</span>
                          </div>
                        )}
                      </div>

                      {/* Skills in Sidebar */}
                      {resume.skillCategories && resume.skillCategories.length > 0 && (
                        <div className="border-t border-white/20 pt-4 mb-6">
                          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-3">
                            Skills & Expertise
                          </h2>
                          <div className="space-y-3">
                            {resume.skillCategories.map((cat) => (
                              <div key={cat.id}>
                                <p className="text-[10px] font-semibold text-white/70 mb-1">
                                  {cat.category}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {cat.skills.map((skill, sIdx) => (
                                    <span
                                      key={sIdx}
                                      className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] text-white"
                                    >
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Languages */}
                      {resume.languages && resume.languages.length > 0 && (
                        <div className="border-t border-white/20 pt-4">
                          <h2 className="text-xs font-bold uppercase tracking-wider text-white mb-2">
                            Languages
                          </h2>
                          <div className="space-y-1 text-xs text-white/90">
                            {resume.languages.map((lang) => (
                              <div key={lang.id} className="flex justify-between">
                                <span>{lang.language}</span>
                                <span className="text-white/70 font-mono text-[11px]">{lang.proficiency}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-[9px] text-white/40 pt-4 border-t border-white/10">
                      Generated via IME365 · {meta.id}
                    </div>
                  </div>

                  {/* Right Main Body */}
                  <div className="w-[66%] p-8 flex flex-col justify-between">
                    <div className="space-y-6">
                      {/* Summary */}
                      {resume.summary && (
                        <div>
                          <h2
                            className="text-xs font-bold uppercase tracking-wider mb-2 border-b-2 pb-1"
                            style={{ borderColor: meta.secondary, color: meta.primary }}
                          >
                            Professional Summary
                          </h2>
                          <p className="text-xs text-neutral-700 leading-relaxed">
                            {resume.summary}
                          </p>
                        </div>
                      )}

                      {/* Experience */}
                      {resume.experience && resume.experience.length > 0 && (
                        <div>
                          <h2
                            className="text-xs font-bold uppercase tracking-wider mb-3 border-b-2 pb-1"
                            style={{ borderColor: meta.secondary, color: meta.primary }}
                          >
                            Work Experience
                          </h2>
                          <div className="space-y-4">
                            {resume.experience.map((exp) => (
                              <div key={exp.id} className="relative pl-3 border-l-2 border-neutral-200">
                                <div className="flex justify-between items-baseline mb-0.5">
                                  <h3 className="text-xs font-bold text-neutral-900">
                                    {exp.position}
                                  </h3>
                                  <span className="text-[11px] text-neutral-500 font-medium">
                                    {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                                  </span>
                                </div>
                                <p className="text-xs font-medium text-neutral-600 mb-1.5">
                                  {exp.company} {exp.location ? `· ${exp.location}` : ''}
                                </p>
                                <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-line">
                                  {exp.description}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Education */}
                      {resume.education && resume.education.length > 0 && (
                        <div>
                          <h2
                            className="text-xs font-bold uppercase tracking-wider mb-3 border-b-2 pb-1"
                            style={{ borderColor: meta.secondary, color: meta.primary }}
                          >
                            Education
                          </h2>
                          <div className="space-y-3">
                            {resume.education.map((edu) => (
                              <div key={edu.id}>
                                <div className="flex justify-between items-baseline">
                                  <h3 className="text-xs font-bold text-neutral-900">
                                    {edu.degree} {edu.field ? `in ${edu.field}` : ''}
                                  </h3>
                                  <span className="text-[11px] text-neutral-500">
                                    {edu.startDate} – {edu.endDate}
                                  </span>
                                </div>
                                <p className="text-xs text-neutral-600">
                                  {edu.institution} {edu.gpa ? `· GPA: ${edu.gpa}` : ''}
                                </p>
                                {edu.description && (
                                  <p className="text-xs text-neutral-600 mt-0.5">{edu.description}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Certifications & Projects */}
                      {resume.certifications && resume.certifications.length > 0 && (
                        <div>
                          <h2
                            className="text-xs font-bold uppercase tracking-wider mb-2 border-b-2 pb-1"
                            style={{ borderColor: meta.secondary, color: meta.primary }}
                          >
                            Certifications
                          </h2>
                          <div className="space-y-1">
                            {resume.certifications.map((cert) => (
                              <div key={cert.id} className="flex justify-between text-xs">
                                <span className="font-medium text-neutral-900">{cert.name}</span>
                                <span className="text-neutral-500">{cert.issuer} {cert.date ? `· ${cert.date}` : ''}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Executive / Minimal ATS Layout */
                <div className="p-10 flex flex-col justify-between min-h-[1123px]">
                  <div>
                    {/* Header Banner */}
                    <div className="border-b-2 pb-4 mb-6" style={{ borderColor: meta.primary }}>
                      <h1 className="text-2xl font-bold tracking-tight text-neutral-900 mb-1">
                        {fullName}
                      </h1>
                      <p className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: meta.primary }}>
                        {resume.heading.title || 'Professional Title'}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                        {resume.heading.email && <span>{resume.heading.email}</span>}
                        {resume.heading.phone && <span>· {resume.heading.phone}</span>}
                        {resume.heading.location && <span>· {resume.heading.location}</span>}
                        {resume.heading.linkedin && <span>· {resume.heading.linkedin}</span>}
                        {resume.heading.website && <span>· {resume.heading.website}</span>}
                      </div>
                    </div>

                    {/* Summary */}
                    {resume.summary && (
                      <div className="mb-6">
                        <h2 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: meta.primary }}>
                          Executive Summary
                        </h2>
                        <p className="text-xs text-neutral-700 leading-relaxed">
                          {resume.summary}
                        </p>
                      </div>
                    )}

                    {/* Experience */}
                    {resume.experience && resume.experience.length > 0 && (
                      <div className="mb-6">
                        <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: meta.primary }}>
                          Professional Experience
                        </h2>
                        <div className="space-y-4">
                          {resume.experience.map((exp) => (
                            <div key={exp.id}>
                              <div className="flex justify-between items-baseline mb-0.5">
                                <h3 className="text-xs font-bold text-neutral-900">
                                  {exp.position} — <span className="font-semibold text-neutral-700">{exp.company}</span>
                                </h3>
                                <span className="text-[11px] text-neutral-500">
                                  {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                                </span>
                              </div>
                              <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-line mt-1">
                                {exp.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Education */}
                    {resume.education && resume.education.length > 0 && (
                      <div className="mb-6">
                        <h2 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: meta.primary }}>
                          Education
                        </h2>
                        <div className="space-y-2">
                          {resume.education.map((edu) => (
                            <div key={edu.id} className="flex justify-between items-baseline text-xs">
                              <div>
                                <span className="font-bold text-neutral-900">{edu.degree}</span> in {edu.field}
                                <span className="text-neutral-600"> · {edu.institution}</span>
                              </div>
                              <span className="text-neutral-500 text-[11px]">
                                {edu.startDate} – {edu.endDate}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Skills */}
                    {resume.skillCategories && resume.skillCategories.length > 0 && (
                      <div>
                        <h2 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: meta.primary }}>
                          Technical Skills & Competencies
                        </h2>
                        <div className="space-y-1.5 text-xs">
                          {resume.skillCategories.map((cat) => (
                            <div key={cat.id}>
                              <span className="font-semibold text-neutral-800">{cat.category}: </span>
                              <span className="text-neutral-600">{cat.skills.join(', ')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-[9px] text-neutral-400 border-t pt-3 mt-6 flex justify-between">
                    <span>Curated via IME365 Executive Suite</span>
                    <span>Template: {meta.name} ({meta.id})</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Modal Triggered from Preview */}
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        resumeId={resume.id || 'draft'}
        resumeName={resume.name || fullName}
        templateId={currentTemplateId}
      />
    </>
  );
}
