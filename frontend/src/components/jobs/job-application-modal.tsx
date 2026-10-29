/**
 * Job Application Modal — an accessible, truth-telling apply flow.
 *
 * Contracts (verified against the repository, not the directive's guesses):
 *  - Resumes:      GET  /api/resumes                       → { success, resumes[] }
 *  - AI pitch:     POST /api/generate-ai-cover-letter      → { success, coverLetter, provider }
 *  - Application:  POST /api/jobs/:jobId/applications      → 201 { success, ... }
 *                     400 invalid fields, 403 unverified email, 404 JOB_UNAVAILABLE /
 *                     RESUME_NOT_FOUND, 409 ALREADY_APPLIED, 413 RESUME_TOO_LARGE, 500.
 *                  The applicant's email is taken from the verified token, so the form
 *                  shows it read-only instead of pretending to send it.
 *
 * There is no third-party ATS integration and no personalised match service, so
 * the compatibility indicator is computed here from the selected resume's own
 * skills against the listing text, and is reported as unavailable — never as a
 * made-up percentage — when either side has nothing to compare.
 *
 * The dialog uses the application's existing Radix Dialog primitive, which
 * provides the focus trap, Escape dismissal, scroll lock and focus restoration.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { get, post, normalizeError, type ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Building2,
  MapPin,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Send,
  Loader2,
  RefreshCw,
  Info,
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
}

interface JobApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: ApplicationJob | null;
  onApplied?: () => void;
}

/** The candidate's applications live here (verified route; there is no /dashboard/applications). */
export const APPLICATIONS_HREF = '/dashboard/applied-jobs';

/** Cover note bounds enforced by POST /api/jobs/:jobId/applications. */
export const COVER_NOTE_MIN = 50;
export const COVER_NOTE_MAX = 1000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Server rule for a stored contact number. */
const PHONE_SHAPE = /^\+?[0-9 ()-]{7,30}$/;

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export interface PhoneValidation {
  ok: boolean;
  message?: string;
}

/**
 * The server accepts `+?[0-9 ()-]{7,30}`. When a number is written with a
 * leading `+` it is an international number, so it must also be valid E.164
 * (country code 1-9, then 7-14 more digits, no punctuation inside). Numbers
 * written without `+` are accepted on the server's own terms.
 */
export function validatePhone(value: string): PhoneValidation {
  const phone = value.trim();
  if (!phone) return { ok: false, message: 'Enter your phone number.' };
  if (!PHONE_SHAPE.test(phone)) {
    return { ok: false, message: 'Use digits, spaces, parentheses, dashes and an optional leading +.' };
  }
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+') && !/^\+[1-9][0-9]{6,14}$/.test(phone.replace(/[ ()-]/g, ''))) {
    return { ok: false, message: 'A number starting with + must be a full international number, e.g. +91 98765 43210.' };
  }
  if (digits.length < 7 || digits.length > 15) {
    return { ok: false, message: 'A phone number must have between 7 and 15 digits.' };
  }
  return { ok: true };
}

/** The server strips markup before measuring, so the client does the same. */
export function coverNoteLength(value: string): number {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

export function validateCoverNote(value: string): string | null {
  const length = coverNoteLength(value);
  if (length === 0) return 'Add a short pitch so the employer knows why you fit.';
  if (length < COVER_NOTE_MIN) return `Your pitch is ${length} characters; it needs at least ${COVER_NOTE_MIN}.`;
  if (length > COVER_NOTE_MAX) return `Your pitch is ${length} characters; the limit is ${COVER_NOTE_MAX}.`;
  return null;
}

export interface SkillOverlap {
  percent: number;
  matched: string[];
  considered: string[];
}

const normaliseSkill = (value: string) => value.trim().toLowerCase();

/**
 * How much of the listing's text the selected resume's skills appear in.
 *
 * This measures *skill mention*, not an employer's ATS verdict. It returns
 * null when there is nothing meaningful to compare, so the UI can say the
 * indicator is unavailable instead of showing a fabricated number.
 */
export function computeSkillOverlap(resumeSkills: readonly string[], jobText: string): SkillOverlap | null {
  const skills = [...new Set(resumeSkills.map(normaliseSkill).filter((skill) => skill.length > 1))];
  const haystack = jobText.toLowerCase();
  if (!skills.length || haystack.trim().length < 20) return null;
  const matched = skills.filter((skill) => haystack.includes(skill));
  return {
    percent: Math.round((matched.length / skills.length) * 100),
    matched,
    considered: skills,
  };
}

export type ApplicationFailureKind =
  | 'already-applied'
  | 'job-unavailable'
  | 'resume-missing'
  | 'resume-too-large'
  | 'email-unverified'
  | 'validation'
  | 'conflict'
  | 'network'
  | 'server';

export interface ApplicationFailure {
  kind: ApplicationFailureKind;
  message: string;
}

/**
 * Maps a failed submission to the state the candidate sees. Only the server's
 * own ALREADY_APPLIED code is treated as "already applied": every other 409 is
 * a different conflict and is reported as one.
 */
export function classifyApplicationFailure(error: unknown): ApplicationFailure {
  const api: ApiError = normalizeError(error);
  const message = api.message || 'The application couldn’t be submitted.';
  if (api.status === 409 && api.code === 'ALREADY_APPLIED') {
    return { kind: 'already-applied', message: 'You’ve already applied to this job.' };
  }
  if (api.status === 409) return { kind: 'conflict', message };
  if (api.code === 'JOB_UNAVAILABLE') return { kind: 'job-unavailable', message };
  if (api.code === 'RESUME_NOT_FOUND') return { kind: 'resume-missing', message };
  if (api.status === 413 || api.code === 'RESUME_TOO_LARGE') return { kind: 'resume-too-large', message };
  if (api.status === 403) return { kind: 'email-unverified', message };
  if (api.status === 400) return { kind: 'validation', message };
  if (api.status === 0) return { kind: 'network', message: 'The application couldn’t reach the server. Check your connection and try again.' };
  return { kind: 'server', message };
}

const resumeSkillsOf = (resume: CandidateResume | null): string[] => {
  if (!resume?.skills) return [];
  return resume.skills.map((skill) => (
    typeof skill === 'string' ? skill : skill.name || skill.skillName || ''
  )).filter((skill): skill is string => Boolean(skill && skill.trim()));
};

const resumeLabel = (resume: CandidateResume, index: number) =>
  resume.title?.trim() || resume.name?.trim() || `Resume ${index + 1}`;

type SubmissionState = 'idle' | 'submitting' | 'submitted' | 'already-applied';

interface FieldErrors {
  fullName?: string;
  phone?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  coverLetter?: string;
  form?: string;
}

export function JobApplicationModal({ isOpen, onClose, job, onApplied }: JobApplicationModalProps) {
  const { user } = useAuth();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [resumes, setResumes] = useState<CandidateResume[]>([]);
  const [resumesLoading, setResumesLoading] = useState(false);
  const [resumesError, setResumesError] = useState<string | null>(null);
  const [resumesReloadKey, setResumesReloadKey] = useState(0);
  const [selectedResumeId, setSelectedResumeId] = useState('');

  const [generatingPitch, setGeneratingPitch] = useState(false);
  const [pitchNotice, setPitchNotice] = useState<string | null>(null);

  const [submission, setSubmission] = useState<SubmissionState>('idle');
  const [failure, setFailure] = useState<ApplicationFailure | null>(null);
  const submittingRef = useRef(false);

  const fullNameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const pitchRef = useRef<HTMLTextAreaElement>(null);
  const jobId = job?.id ?? null;

  // Radix only restores focus to a DialogTrigger, and this dialog is opened from
  // arbitrary buttons (job cards, saved items), so the trigger is remembered and
  // focused again when the dialog closes.
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const active = document.activeElement;
    restoreFocusRef.current = active instanceof HTMLElement ? active : null;
  }, [isOpen]);

  // Reset the form for each job (and on each open) without leaking the previous one.
  useEffect(() => {
    if (!isOpen || !jobId) return;
    setFullName(user?.displayName || '');
    setPhone('');
    setLinkedinUrl('');
    setGithubUrl('');
    setCoverLetter('');
    setFieldErrors({});
    setPitchNotice(null);
    setSubmission('idle');
    setFailure(null);
    setSelectedResumeId('');
    submittingRef.current = false;
  }, [isOpen, jobId, user?.displayName]);

  // Resumes belong to the signed-in candidate; a failure is shown, never filled in.
  useEffect(() => {
    if (!isOpen || !jobId || !user) return;
    let cancelled = false;
    setResumesLoading(true);
    setResumesError(null);
    void (async () => {
      try {
        const response = await get<{ success?: boolean; resumes?: CandidateResume[] }>('/resumes');
        if (cancelled) return;
        const list = Array.isArray(response?.resumes) ? response.resumes.filter((row) => row?.id) : [];
        setResumes(list);
        setSelectedResumeId((current) => (current && list.some((row) => row.id === current) ? current : (list[0]?.id ?? '')));
      } catch (error) {
        if (cancelled) return;
        setResumes([]);
        setResumesError(normalizeError(error).message || 'Your resumes couldn’t be loaded.');
      } finally {
        if (!cancelled) setResumesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, jobId, user, resumesReloadKey]);

  const selectedResume = useMemo(
    () => resumes.find((resume) => resume.id === selectedResumeId) ?? null,
    [resumes, selectedResumeId],
  );

  const jobText = useMemo(() => {
    if (!job) return '';
    const requirements = Array.isArray(job.requirements) ? job.requirements.join(' ') : job.requirements ?? '';
    return [job.title, job.description ?? '', requirements, (job.skills ?? []).join(' ')].join(' ').trim();
  }, [job]);

  const overlap = useMemo(
    () => computeSkillOverlap(resumeSkillsOf(selectedResume), jobText),
    [selectedResume, jobText],
  );

  const handleQuickPitch = useCallback(async () => {
    if (!job || generatingPitch) return;
    setGeneratingPitch(true);
    setPitchNotice(null);
    try {
      const skills = resumeSkillsOf(selectedResume).join(', ');
      const response = await post<{ success?: boolean; coverLetter?: string }>('/generate-ai-cover-letter', {
        jobTitle: job.title,
        companyName: job.company,
        recipientName: 'Hiring Manager',
        userSkills: skills,
        candidateName: fullName.trim() || user?.displayName || '',
        jobDescription: (job.description ?? '').slice(0, 2000),
        tone: 'impact',
      });
      const generated = typeof response?.coverLetter === 'string' ? response.coverLetter.trim() : '';
      if (!response?.success || !generated) {
        setPitchNotice('The AI service didn’t return a draft. Your existing text is unchanged — write your pitch or try again.');
        return;
      }
      setCoverLetter(generated);
      setFieldErrors((previous) => ({ ...previous, coverLetter: undefined }));
      const length = coverNoteLength(generated);
      setPitchNotice(length > COVER_NOTE_MAX
        ? `Draft inserted, but it is ${length} characters — trim it to ${COVER_NOTE_MAX} before submitting.`
        : 'AI draft inserted. Edit it before submitting.');
      window.requestAnimationFrame(() => pitchRef.current?.focus());
    } catch (error) {
      setPitchNotice(`The AI draft is unavailable right now. Your text is unchanged. ${normalizeError(error).message}`);
    } finally {
      setGeneratingPitch(false);
    }
  }, [job, generatingPitch, selectedResume, fullName, user?.displayName]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!job || submittingRef.current || submission === 'submitted' || submission === 'already-applied') return;

    const errors: FieldErrors = {};
    if (!fullName.trim()) errors.fullName = 'Enter the name the employer should see.';
    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.ok) errors.phone = phoneCheck.message;
    if (linkedinUrl.trim() && !/^https:\/\/\S+$/i.test(linkedinUrl.trim())) {
      errors.linkedinUrl = 'Profile links must start with https://';
    }
    if (githubUrl.trim() && !/^https:\/\/\S+$/i.test(githubUrl.trim())) {
      errors.githubUrl = 'Profile links must start with https://';
    }
    const coverError = validateCoverNote(coverLetter);
    if (coverError) errors.coverLetter = coverError;
    if (!user?.email?.trim()) {
      errors.form = 'Your account has no verified email address, so the employer can’t be contacted. Verify your email first.';
    }

    setFieldErrors(errors);
    const firstInvalid = (['fullName', 'phone', 'linkedinUrl', 'githubUrl', 'coverLetter'] as const)
      .find((field) => errors[field]);
    if (firstInvalid || errors.form) {
      setFailure(null);
      if (firstInvalid === 'fullName') fullNameRef.current?.focus();
      else if (firstInvalid === 'phone') phoneRef.current?.focus();
      else if (firstInvalid === 'coverLetter') pitchRef.current?.focus();
      return;
    }

    submittingRef.current = true;
    setSubmission('submitting');
    setFailure(null);
    try {
      await post(`/jobs/${encodeURIComponent(job.id)}/applications`, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        coverLetter,
        ...(selectedResumeId ? { resumeId: selectedResumeId } : {}),
        ...(linkedinUrl.trim() ? { linkedinUrl: linkedinUrl.trim() } : {}),
        ...(githubUrl.trim() ? { githubUrl: githubUrl.trim() } : {}),
      });
      setSubmission('submitted');
      onApplied?.();
    } catch (error) {
      const classified = classifyApplicationFailure(error);
      setFailure(classified);
      setSubmission(classified.kind === 'already-applied' ? 'already-applied' : 'idle');
    } finally {
      submittingRef.current = false;
    }
  };

  if (!job) return null;

  const closed = submission === 'submitted' || submission === 'already-applied';
  const pending = submission === 'submitting';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl"
        data-testid="job-application-modal"
        onCloseAutoFocus={(event) => {
          const target = restoreFocusRef.current;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus({ preventScroll: true });
        }}
      >
        <DialogHeader>
          <DialogTitle className="break-words text-xl font-bold text-ink">{job.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
              <span className="flex items-center gap-1"><Building2 aria-hidden="true" className="size-3.5" />{job.company}</span>
              {job.location && (
                <span className="flex items-center gap-1"><MapPin aria-hidden="true" className="size-3.5" />{job.location}</span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {closed ? (
          <div className="py-8 text-center" role="status">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-success-50 text-success-700">
              <CheckCircle2 aria-hidden="true" className="size-8" />
            </div>
            <h3 className="text-lg font-bold text-ink">
              {submission === 'submitted' ? 'Application submitted' : 'You’ve already applied'}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
              {submission === 'submitted'
                ? `${job.company} has received your application. You can follow its status in your applications.`
                : 'This job already has your application on file, so nothing new was sent.'}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button asChild variant="outline">
                <Link to={APPLICATIONS_HREF} onClick={onClose}>View your applications</Link>
              </Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-2 space-y-4">
            {fieldErrors.form && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-800">
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{fieldErrors.form}</span>
              </p>
            )}

            {failure && failure.kind !== 'already-applied' && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-800">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  {failure.message}
                  {failure.kind === 'job-unavailable' && ' The employer has closed this listing.'}
                  {failure.kind === 'resume-missing' && ' Choose a different resume and try again.'}
                </span>
              </p>
            )}

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                Resume for this application
              </legend>
              {resumesLoading && (
                <p className="flex items-center gap-2 py-2 text-xs text-ink-muted" role="status">
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> Loading your resumes…
                </p>
              )}
              {!resumesLoading && resumesError && (
                <div role="alert" className="flex flex-col gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-xs text-error-800 sm:flex-row sm:items-center">
                  <span className="flex-1">Your resumes couldn’t be loaded: {resumesError}</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => setResumesReloadKey((key) => key + 1)}>
                    <RefreshCw aria-hidden="true" className="size-3.5" /> Retry
                  </Button>
                </div>
              )}
              {!resumesLoading && !resumesError && resumes.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-ink-muted">
                  You have no saved resumes yet, so your profile details will be sent. You can{' '}
                  <Link to="/build-resume" className="font-medium text-brand-700 underline underline-offset-2" onClick={onClose}>
                    create a resume
                  </Link>{' '}
                  first to attach one.
                </p>
              )}
              {!resumesLoading && !resumesError && resumes.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {resumes.map((resume, index) => {
                    const checked = resume.id === selectedResumeId;
                    return (
                      <label
                        key={resume.id}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500 ${
                          checked ? 'border-brand-500 bg-brand-50/50' : 'border-border hover:border-neutral-400'
                        }`}
                      >
                        <input
                          type="radio"
                          name="application-resume"
                          value={resume.id}
                          checked={checked}
                          onChange={() => setSelectedResumeId(resume.id)}
                          className="mt-1 accent-brand-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-ink">{resumeLabel(resume, index)}</span>
                          {resume.occupation?.trim() && (
                            <span className="block truncate text-[11px] text-ink-muted">{resume.occupation}</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <section aria-labelledby="ats-indicator-heading" className="rounded-xl border border-border bg-canvas/60 p-3">
              <h3 id="ats-indicator-heading" className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                Skill match (informational)
              </h3>
              {overlap ? (
                <>
                  <div
                    className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200"
                    role="progressbar"
                    aria-valuenow={overlap.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Share of the selected resume's skills mentioned in this listing"
                  >
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${overlap.percent}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-ink-secondary">
                    {overlap.matched.length} of {overlap.considered.length} skills on your resume appear in this
                    listing ({overlap.percent}%). This is a keyword comparison, not a third-party ATS verdict.
                  </p>
                </>
              ) : (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
                  <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {selectedResume
                      ? 'Your selected resume has no listed skills to compare, so no match figure is shown.'
                      : 'Select a resume with listed skills to see a match figure. No estimate is made without data.'}
                  </span>
                </p>
              )}
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="application-full-name" className="mb-1 block text-xs font-medium text-ink">Full name</label>
                <Input
                  id="application-full-name"
                  ref={fullNameRef}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                  aria-invalid={Boolean(fieldErrors.fullName) || undefined}
                  aria-describedby={fieldErrors.fullName ? 'application-full-name-error' : undefined}
                  placeholder="Your full name"
                />
                {fieldErrors.fullName && (
                  <p id="application-full-name-error" role="alert" className="mt-1 text-xs text-error-700">{fieldErrors.fullName}</p>
                )}
              </div>
              <div>
                <label htmlFor="application-email" className="mb-1 block text-xs font-medium text-ink">Email</label>
                <Input
                  id="application-email"
                  type="email"
                  value={user?.email ?? ''}
                  readOnly
                  aria-describedby="application-email-hint"
                  className="bg-canvas-soft"
                />
                <p id="application-email-hint" className="mt-1 text-[11px] text-ink-muted">
                  Taken from your verified account. The employer replies here.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="application-phone" className="mb-1 block text-xs font-medium text-ink">Phone</label>
                <Input
                  id="application-phone"
                  ref={phoneRef}
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                  placeholder="+91 98765 43210"
                  aria-invalid={Boolean(fieldErrors.phone) || undefined}
                  aria-describedby={fieldErrors.phone ? 'application-phone-error' : undefined}
                />
                {fieldErrors.phone && (
                  <p id="application-phone-error" role="alert" className="mt-1 text-xs text-error-700">{fieldErrors.phone}</p>
                )}
              </div>
              <div>
                <label htmlFor="application-linkedin" className="mb-1 block text-xs font-medium text-ink">LinkedIn (optional)</label>
                <Input
                  id="application-linkedin"
                  type="url"
                  value={linkedinUrl}
                  onChange={(event) => setLinkedinUrl(event.target.value)}
                  placeholder="https://linkedin.com/in/…"
                  aria-invalid={Boolean(fieldErrors.linkedinUrl) || undefined}
                  aria-describedby={fieldErrors.linkedinUrl ? 'application-linkedin-error' : undefined}
                />
                {fieldErrors.linkedinUrl && (
                  <p id="application-linkedin-error" role="alert" className="mt-1 text-xs text-error-700">{fieldErrors.linkedinUrl}</p>
                )}
              </div>
              <div>
                <label htmlFor="application-github" className="mb-1 block text-xs font-medium text-ink">GitHub / portfolio (optional)</label>
                <Input
                  id="application-github"
                  type="url"
                  value={githubUrl}
                  onChange={(event) => setGithubUrl(event.target.value)}
                  placeholder="https://github.com/…"
                  aria-invalid={Boolean(fieldErrors.githubUrl) || undefined}
                  aria-describedby={fieldErrors.githubUrl ? 'application-github-error' : undefined}
                />
                {fieldErrors.githubUrl && (
                  <p id="application-github-error" role="alert" className="mt-1 text-xs text-error-700">{fieldErrors.githubUrl}</p>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="application-pitch" className="block text-xs font-medium text-ink">
                  Pitch / cover note ({COVER_NOTE_MIN}–{COVER_NOTE_MAX} characters)
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handleQuickPitch()}
                  loading={generatingPitch}
                  disabled={generatingPitch}
                >
                  {!generatingPitch && <Sparkles aria-hidden="true" className="size-3.5 text-brand-600" />}
                  {generatingPitch ? 'Generating…' : 'AI quick pitch'}
                </Button>
              </div>
              {pitchNotice && (
                <p
                  role="status"
                  className="mb-2 rounded-md border border-warning-200 bg-warning-50 p-2 text-xs text-warning-800"
                >
                  {pitchNotice}
                </p>
              )}
              <textarea
                id="application-pitch"
                ref={pitchRef}
                value={coverLetter}
                onChange={(event) => setCoverLetter(event.target.value)}
                rows={6}
                aria-invalid={Boolean(fieldErrors.coverLetter) || undefined}
                aria-describedby={`application-pitch-count${fieldErrors.coverLetter ? ' application-pitch-error' : ''}`}
                placeholder="Why are you a strong fit for this role?"
                className="w-full rounded-xl border border-border bg-surface p-3 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-500"
              />
              <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
                <p
                  id="application-pitch-count"
                  className={`text-[11px] ${
                    coverNoteLength(coverLetter) >= COVER_NOTE_MIN && coverNoteLength(coverLetter) <= COVER_NOTE_MAX
                      ? 'text-success-700'
                      : 'text-ink-muted'
                  }`}
                >
                  {coverNoteLength(coverLetter)} / {COVER_NOTE_MAX} characters (minimum {COVER_NOTE_MIN})
                </p>
              </div>
              {fieldErrors.coverLetter && (
                <p id="application-pitch-error" role="alert" className="mt-1 text-xs text-error-700">{fieldErrors.coverLetter}</p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" loading={pending} disabled={pending}>
                {!pending && <Send aria-hidden="true" className="size-4" />}
                {pending ? 'Submitting…' : 'Submit application'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { resumeSkillsOf };
export type { CandidateResume };
