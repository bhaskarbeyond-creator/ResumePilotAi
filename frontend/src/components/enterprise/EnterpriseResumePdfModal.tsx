import { useState, useEffect, useMemo } from 'react';
import { X, Printer, Download, ZoomIn, ZoomOut, Star, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EnterpriseResource } from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

export interface EnterpriseResumePdfModalProps {
  isOpen: boolean;
  resume: EnterpriseResource | null;
  onClose: () => void;
}

const TEMPLATES: Record<string, string> = {
  Cv1: 'Minimalist Clean (ATS)',
  Cv2: 'Executive Slate',
  Cv3: 'Corporate Navy',
  Cv4: 'Modern Two-Column',
  Cv5: 'Tech Grid Specialist',
  Cv10: 'Silicon Valley Pro',
  Cv50: 'Executive Right-Split',
  Cv51: 'Europass Modern Official',
};

interface NormalizedResume {
  id: string;
  fullName: string;
  jobTitle: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  experience: Array<{
    title: string;
    company: string;
    date: string;
    description: string;
  }>;
  education: Array<{
    degree: string;
    school: string;
    date: string;
  }>;
  skills: string[];
  templateId: string;
  atsScore: number;
}

export function normalizeResumeValues(resource: EnterpriseResource | null): NormalizedResume {
  if (!resource) {
    return {
      id: '',
      fullName: 'Candidate',
      jobTitle: 'Professional',
      email: '',
      phone: '',
      location: '',
      summary: '',
      experience: [],
      education: [],
      skills: [],
      templateId: 'Cv1',
      atsScore: 85,
    };
  }

  const p = (resource.payload || {}) as Record<string, unknown>;
  const personalInfo = (p.personalInfo || {}) as Record<string, unknown>;

  const fullName = String(
    personalInfo.fullName ||
    (p.firstname || p.lastname ? `${p.firstname || ''} ${p.lastname || ''}`.trim() : '') ||
    resource.candidateName ||
    `Candidate #${resource.id.slice(0, 6)}`
  );

  const jobTitle = String(
    personalInfo.jobTitle ||
    p.jobTitle ||
    p.occupation ||
    p.positionTitle ||
    resource.jobTitle ||
    'Executive Professional'
  );

  const email = String(personalInfo.email || p.email || resource.ownerEmail || '');
  const phone = String(personalInfo.phone || p.phone || '');
  const location = String(personalInfo.location || p.city || p.location || '');
  const summary = String(personalInfo.summary || p.summary || 'Accomplished professional with a proven track record of driving strategic growth, optimizing operations, and delivering high-impact results.');

  let experience: NormalizedResume['experience'] = [];
  if (Array.isArray(p.experience) && p.experience.length > 0) {
    experience = p.experience.map((e: unknown) => {
      const exp = (e || {}) as Record<string, unknown>;
      return {
        title: String(exp.jobTitle || exp.title || 'Role'),
        company: String(exp.companyName || exp.company || 'Organization'),
        date: String(exp.startDate || exp.date || '2022') + (exp.endDate ? ` - ${exp.endDate}` : ' - Present'),
        description: String(exp.description || ''),
      };
    });
  } else if (Array.isArray(p.employment) && p.employment.length > 0) {
    experience = p.employment.map((e: unknown) => {
      const exp = (e || {}) as Record<string, unknown>;
      return {
        title: String(exp.jobTitle || 'Role'),
        company: String(exp.employer || 'Organization'),
        date: String(exp.startDate || '2022') + (exp.endDate ? ` - ${exp.endDate}` : ' - Present'),
        description: String(exp.description || ''),
      };
    });
  }

  let education: NormalizedResume['education'] = [];
  if (Array.isArray(p.education)) {
    education = p.education.map((ed: unknown) => {
      const edu = (ed || {}) as Record<string, unknown>;
      return {
        degree: String(edu.degree || edu.fieldOfStudy || 'Degree'),
        school: String(edu.school || edu.institution || 'University'),
        date: String(edu.graduationDate || edu.date || ''),
      };
    });
  }

  let skills: string[] = [];
  if (Array.isArray(p.skills)) {
    skills = p.skills.map((s: unknown) => (typeof s === 'string' ? s : String((s as { name?: string })?.name || '')));
  }

  const rawAts = resource.atsScore ?? p.atsScore ?? p.score;
  const atsScore = Number(rawAts) > 0 ? Math.min(100, Number(rawAts)) : 88;

  let templateId = String(p.templateId || p.template || resource.template || 'Cv1');
  if (!TEMPLATES[templateId]) templateId = 'Cv1';

  return {
    id: resource.id,
    fullName,
    jobTitle,
    email,
    phone,
    location,
    summary,
    experience,
    education,
    skills,
    templateId,
    atsScore,
  };
}

export function EnterpriseResumePdfModal({
  isOpen,
  resume,
  onClose,
}: EnterpriseResumePdfModalProps) {
  const [zoom, setZoom] = useState(0.85);
  const [selectedTemplate, setSelectedTemplate] = useState('Cv1');
  const [downloading, setDownloading] = useState(false);

  const data = useMemo(() => normalizeResumeValues(resume), [resume]);

  useEffect(() => {
    if (data.templateId) {
      setSelectedTemplate(data.templateId);
    }
  }, [data.templateId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !resume) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      window.print();
    }, 400);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-pdf-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl h-[92vh] flex flex-col rounded-2xl bg-surface-raised border border-edge shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-edge bg-surface/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 rounded-xl bg-accent-soft flex items-center justify-center text-accent shrink-0">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="resume-pdf-title" className="text-base font-bold text-ink truncate">
                  {data.fullName}
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  <Star className="size-3 fill-emerald-600" />
                  ATS {data.atsScore}%
                </span>
              </div>
              <p className="text-xs text-ink-muted truncate">{data.jobTitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 border border-edge rounded-lg p-0.5 bg-surface-raised">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
                className="p-1.5 text-ink-muted hover:text-ink rounded transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="size-3.5" />
              </button>
              <span className="text-xs font-mono font-medium px-1 text-ink-muted">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))}
                className="p-1.5 text-ink-muted hover:text-ink rounded transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="size-3.5" />
              </button>
            </div>

            <Button size="sm" variant="outline" onClick={handlePrint}>
              <Printer className="size-3.5 mr-1.5" />
              Print
            </Button>

            <Button size="sm" onClick={handleDownload} disabled={downloading}>
              <Download className="size-3.5 mr-1.5" />
              {downloading ? 'Exporting…' : 'Download PDF'}
            </Button>

            <button
              type="button"
              className="p-2 text-ink-muted hover:text-ink rounded-lg transition-colors ml-1"
              onClick={onClose}
              aria-label="Close preview"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Workspace Toolbar: Template selector */}
        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-edge bg-surface/40 overflow-x-auto text-xs">
          <span className="text-ink-muted font-medium shrink-0">Template:</span>
          {Object.entries(TEMPLATES).map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedTemplate(id)}
              className={cn(
                'px-2.5 py-1 rounded-md transition-colors shrink-0 font-medium',
                selectedTemplate === id
                  ? 'bg-accent text-white shadow-2xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-raised',
              )}
            >
              {name}
            </button>
          ))}
        </div>

        {/* Main Document Body */}
        <div className="flex-1 overflow-auto p-8 bg-slate-900/40 flex items-center justify-center">
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
            className="w-[794px] min-h-[1123px] bg-white text-slate-900 rounded shadow-2xl p-12 transition-transform duration-150"
          >
            {/* Header */}
            <div className="border-b-2 border-slate-900 pb-6 mb-6">
              <h1 className="text-3xl font-black tracking-tight text-slate-950 uppercase">
                {data.fullName}
              </h1>
              <p className="text-lg font-semibold text-slate-700 mt-1">{data.jobTitle}</p>
              <div className="flex flex-wrap gap-4 text-xs text-slate-600 mt-3 font-medium">
                {data.email && <span>{data.email}</span>}
                {data.phone && <span>• {data.phone}</span>}
                {data.location && <span>• {data.location}</span>}
              </div>
            </div>

            {/* Executive Summary */}
            {data.summary && (
              <div className="mb-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1 mb-2">
                  Executive Summary
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">{data.summary}</p>
              </div>
            )}

            {/* Work Experience */}
            {data.experience.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1 mb-3">
                  Professional Experience
                </h3>
                <div className="space-y-4">
                  {data.experience.map((exp, idx) => (
                    <div key={idx} className="text-xs">
                      <div className="flex justify-between items-baseline font-bold text-slate-900">
                        <span>{exp.title}</span>
                        <span className="text-slate-500 font-normal">{exp.date}</span>
                      </div>
                      <div className="text-slate-700 font-semibold mb-1">{exp.company}</div>
                      {exp.description && (
                        <p className="text-slate-600 leading-relaxed">{exp.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {data.education.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1 mb-2">
                  Education & Credentials
                </h3>
                <div className="space-y-2">
                  {data.education.map((edu, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900">{edu.degree}</span> —{' '}
                        <span className="text-slate-700">{edu.school}</span>
                      </div>
                      <span className="text-slate-500">{edu.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {data.skills.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1 mb-2">
                  Core Competencies & Skills
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {data.skills.map((skill, idx) => (
                    <span
                      key={idx}
                      className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-xs font-medium"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EnterpriseResumePdfModal;
