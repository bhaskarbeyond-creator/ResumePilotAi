/**
 * JobApplicationModal Component
 *
 * Parity with legacy JobApplicationModal (111 KB):
 * - Resume Selector: loads candidate resumes from GET /api/resumes
 * - Live ATS Match Gauge: computes keyword match % against job requirements
 * - 1-Click AI Quick Pitch: calls POST /api/generate-ai-cover-letter
 * - Submits to: POST /api/jobs/:jobId/applications
 * - Handles 409 ALREADY_APPLIED, phone regex validation, 50-1000 char cover letter
 */

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { get, post, normalizeError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  X,
  Building2,
  MapPin,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileText,
  Percent,
  Send,
  Loader2,
} from 'lucide-react';

export interface ApplicationJob {
  id: string;
  title: string;
  company: string;
  location?: string;
  description?: string;
  requirements?: string[] | string;
  skills?: string[];
}

interface CandidateResume {
  id: string;
  title?: string;
  name?: string;
  occupation?: string;
  skills?: Array<{ name?: string; skillName?: string } | string>;
  createdAt?: string;
  updatedAt?: string;
}

interface JobApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: ApplicationJob | null;
  onApplied?: () => void;
}

export function JobApplicationModal({ isOpen, onClose, job, onApplied }: JobApplicationModalProps) {
  const { user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [coverLetter, setCoverLetter] = useState('');

  const [resumes, setResumes] = useState<CandidateResume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [loadingResumes, setLoadingResumes] = useState(false);

  const [generatingPitch, setGeneratingPitch] = useState(false);
  const [pitchSuccess, setPitchSuccess] = useState(false);
  const [pitchNotice, setPitchNotice] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form state when opened
  useEffect(() => {
    if (isOpen) {
      setFullName(user?.displayName || '');
      setEmail(user?.email || '');
      setPhone('');
      setLinkedinUrl('');
      setGithubUrl('');
      setCoverLetter('');
      setError(null);
      setIsSubmitted(false);

      if (user) {
        setLoadingResumes(true);
        get<{ resumes: CandidateResume[] }>('/resumes')
          .then((res) => {
            const list = res?.resumes ?? [];
            setResumes(list);
            if (list.length > 0) {
              setSelectedResumeId(list[0].id);
            }
          })
          .catch(() => {})
          .finally(() => setLoadingResumes(false));
      }
    }
  }, [isOpen, user]);

  // Escape key listener
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, submitting, onClose]);

  const selectedResume = useMemo(
    () => resumes.find((r) => r.id === selectedResumeId) || null,
    [resumes, selectedResumeId]
  );

  // Live ATS Match Score Calculation
  const atsMatch = useMemo(() => {
    if (!job) return 0;
    const jobText = `${job.title} ${job.description || ''} ${
      Array.isArray(job.requirements) ? job.requirements.join(' ') : job.requirements || ''
    } ${(job.skills || []).join(' ')}`.toLowerCase();

    const resumeSkills: string[] = [];
    if (selectedResume?.skills && Array.isArray(selectedResume.skills)) {
      selectedResume.skills.forEach((s) => {
        if (typeof s === 'string') resumeSkills.push(s.toLowerCase());
        else if (s && typeof s === 'object') {
          const name = s.name || s.skillName;
          if (name) resumeSkills.push(name.toLowerCase());
        }
      });
    }

    if (resumeSkills.length === 0) return 65; // Base estimate

    let matches = 0;
    resumeSkills.forEach((skill) => {
      if (skill && jobText.includes(skill)) matches++;
    });

    const score = Math.round((matches / Math.max(resumeSkills.length, 5)) * 100);
    return Math.max(50, Math.min(score, 98));
  }, [job, selectedResume]);

  // 1-Click AI Quick Pitch Generation
  const handleQuickPitch = async () => {
    if (!job) return;
    setGeneratingPitch(true);
    setPitchNotice(null);
    setPitchSuccess(false);

    try {
      const userSkills = (selectedResume?.skills || [])
        .map((s) => (typeof s === 'string' ? s : s.name || s.skillName || ''))
        .filter(Boolean)
        .join(', ');

      const res = await post<{ success?: boolean; content?: string; coverLetter?: string }>(
        '/generate-ai-cover-letter',
        {
          jobTitle: job.title,
          companyName: job.company,
          recipientName: 'Hiring Manager',
          userSkills,
          candidateName: fullName || user?.displayName || 'Applicant',
          jobDescription: (job.description || '').slice(0, 2000),
          tone: 'impact',
        }
      );

      const generated = res?.coverLetter || res?.content;
      if (generated && typeof generated === 'string') {
        const text = generated.trim();
        // Truncate to 950 chars to satisfy the 50-1000 char contract
        setCoverLetter(text.length > 950 ? text.slice(0, 950) + '…' : text);
        setPitchSuccess(true);
        setTimeout(() => setPitchSuccess(false), 3000);
      } else {
        setPitchNotice('AI generation returned empty content. Please provide pitch text manually.');
      }
    } catch (err) {
      setPitchNotice(`Quick pitch temporarily unavailable: ${normalizeError(err).message}`);
    } finally {
      setGeneratingPitch(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!job) return;

    // Validate phone: /^\+?[0-9 ()-]{7,30}$/
    const phoneTrimmed = phone.trim();
    if (!phoneTrimmed || !/^\+?[0-9 ()-]{7,30}$/.test(phoneTrimmed)) {
      setError('Please provide a valid phone number (minimum 7 digits, digits/dashes/parentheses).');
      return;
    }

    // Validate cover letter length (50–1000 characters)
    const coverTrimmed = coverLetter.trim();
    if (coverTrimmed.length < 50 || coverTrimmed.length > 1000) {
      setError(`Cover letter must be between 50 and 1000 characters (currently ${coverTrimmed.length}).`);
      return;
    }

    if (linkedinUrl && !linkedinUrl.startsWith('https://')) {
      setError('LinkedIn profile link must use https://');
      return;
    }
    if (githubUrl && !githubUrl.startsWith('https://')) {
      setError('GitHub profile link must use https://');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await post(`/jobs/${job.id}/applications`, {
        fullName,
        phone: phoneTrimmed,
        coverLetter: coverTrimmed,
        resumeId: selectedResumeId || undefined,
        linkedinUrl: linkedinUrl || undefined,
        githubUrl: githubUrl || undefined,
      });

      setIsSubmitted(true);
      if (onApplied) onApplied();
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      const apiErr = normalizeError(err);
      if (apiErr.code === 'ALREADY_APPLIED') {
        setError('You have already submitted an application for this position.');
      } else {
        setError(apiErr.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !job) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                Job Application
              </span>
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                <Percent className="size-3" />
                {atsMatch}% ATS Match
              </span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-ink">{job.title}</h2>
            <div className="mt-1 flex items-center gap-3 text-xs text-ink-muted">
              <span className="flex items-center gap-1">
                <Building2 className="size-3.5" />
                {job.company}
              </span>
              {job.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {job.location}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted hover:bg-neutral-100 hover:text-ink transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {isSubmitted ? (
          <div className="py-12 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-3 animate-in zoom-in-75">
              <CheckCircle2 className="size-8" />
            </div>
            <h3 className="text-lg font-bold text-ink">Application Submitted!</h3>
            <p className="mt-1 text-sm text-ink-muted max-w-md mx-auto">
              Your resume, candidate profile, and tailored pitch were delivered to {job.company}.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-xs text-error-700">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Resume Selection */}
            <div>
              <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
                Select Resume for Application *
              </label>
              {loadingResumes ? (
                <div className="text-xs text-ink-muted py-2">Loading your resumes…</div>
              ) : resumes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-xs text-ink-muted">
                  No saved resumes found. Your candidate profile details will be submitted.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {resumes.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedResumeId(r.id)}
                      className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
                        selectedResumeId === r.id
                          ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-100'
                          : 'border-border hover:border-neutral-300'
                      }`}
                    >
                      <FileText
                        className={`size-4 shrink-0 mt-0.5 ${
                          selectedResumeId === r.id ? 'text-brand-600' : 'text-ink-muted'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs text-ink truncate">
                          {r.title || r.name || 'Master Resume'}
                        </div>
                        <div className="text-xs text-ink-muted truncate">
                          {r.occupation || 'Candidate CV'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Candidate Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Full Name *</label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Email Address *</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={Boolean(user?.email)}
                  className={user?.email ? 'bg-neutral-50' : ''}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Phone Number *</label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">LinkedIn URL</label>
                <Input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">GitHub / Portfolio</label>
                <Input
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/..."
                />
              </div>
            </div>

            {/* Quick Pitch / Cover Letter with AI generation button */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-ink">
                  Quick Pitch / Cover Letter * (50–1000 characters)
                </label>
                <button
                  type="button"
                  onClick={handleQuickPitch}
                  disabled={generatingPitch}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    pitchSuccess
                      ? 'bg-emerald-600 text-white'
                      : 'bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200'
                  }`}
                >
                  {generatingPitch ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      Generating Pitch…
                    </>
                  ) : pitchSuccess ? (
                    <>
                      <CheckCircle2 className="size-3" />
                      Pitch Generated!
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3 text-brand-600" />
                      ⚡ 1-Click AI Quick Pitch
                    </>
                  )}
                </button>
              </div>

              {pitchNotice && (
                <div className="mb-2 text-xs text-amber-700 bg-amber-50 rounded-md p-2 border border-amber-200">
                  {pitchNotice}
                </div>
              )}

              <textarea
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                required
                rows={5}
                placeholder="Briefly describe why your experience makes you an exceptional match for this requisition…"
                className="w-full rounded-xl border border-border bg-surface p-3 text-xs text-ink placeholder:text-ink-muted focus-visible:outline-brand-500"
              />
              <div className="mt-1 flex justify-end text-xs text-ink-muted">
                <span
                  className={
                    coverLetter.trim().length >= 50 && coverLetter.trim().length <= 1000
                      ? 'text-emerald-600 font-medium'
                      : 'text-amber-600'
                  }
                >
                  {coverLetter.trim().length} / 1000 chars (min 50)
                </span>
              </div>
            </div>

            {/* Submit Bar */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                <Send className="size-4 mr-1.5" />
                Submit Application
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
