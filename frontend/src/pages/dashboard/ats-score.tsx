/**
 * ATS Score — deterministic readiness check for a saved resume.
 *
 * Routes: /dashboard/ats-score (and the /dashboard/ats alias). `?resume=<id>`
 * selects a resume so refresh and links keep the selection.
 *
 * The score comes from `calculateAtsScore` (lib/atsScore.js) run on the stored
 * resume row (GET /api/resumes/:id) through lib/resume-score.ts. Nothing is
 * scored until a real resume has loaded; there is no placeholder resume.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, CircleDashed, FileText, Lightbulb, RefreshCw, Sparkles, Target, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { get, normalizeError } from '@/lib/api-client';
import type { AtsScoreResult } from '@/lib/atsScore';
import { resumeScoreInput, scoreResume } from '@/lib/resume-score';
import { getTemplateMeta } from '@/lib/template-catalog';
import { cn } from '@/lib/utils';

interface ResumeSummary {
  id: string;
  title: string;
  template: string;
  updatedAt: string | null;
}

type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; row: Record<string, unknown> }
  | { status: 'error'; message: string };

const formatDate = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function toSummary(row: Record<string, unknown>): ResumeSummary {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    id: text(row.id),
    title: text(row.title).trim() || 'Untitled resume',
    template: text(row.template) || 'Cv1',
    updatedAt: text(row.updated_at) || text(row.updatedAt) || null,
  };
}

const scoreTone = (score: number) => (score >= 80 ? 'text-success-700' : score >= 60 ? 'text-warning-700' : 'text-error-700');
const barTone = (ratio: number) => (ratio >= 0.75 ? 'bg-success-600' : ratio >= 0.5 ? 'bg-warning-500' : 'bg-error-500');

export function ATSScorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = searchParams.get('resume');

  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [listError, setListError] = useState('');
  const [detail, setDetail] = useState<DetailState>({ status: 'idle' });
  const [jobDescription, setJobDescription] = useState('');
  const [result, setResult] = useState<{ resumeId: string; title: string; value: AtsScoreResult } | null>(null);

  const loadList = useCallback(async () => {
    setListState('loading');
    try {
      const response = await get<{ resumes?: Array<Record<string, unknown>> }>('/resumes');
      setResumes((response.resumes ?? []).map(toSummary).filter((item) => item.id));
      setListState('ready');
    } catch (error) {
      setListError(normalizeError(error).message);
      setListState('error');
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // The selection lives in the URL; default to the most recently updated resume.
  const selectedId = useMemo(() => {
    if (requestedId && resumes.some((resume) => resume.id === requestedId)) return requestedId;
    return resumes[0]?.id ?? '';
  }, [requestedId, resumes]);
  const selected = resumes.find((resume) => resume.id === selectedId) ?? null;
  const requestedMissing = listState === 'ready' && !!requestedId && !resumes.some((resume) => resume.id === requestedId);

  const loadDetail = useCallback(async (id: string) => {
    setDetail({ status: 'loading' });
    try {
      const response = await get<{ resume?: Record<string, unknown> }>(`/resumes/${encodeURIComponent(id)}`);
      if (!response.resume || !resumeScoreInput(response.resume)) throw new Error('The server returned no resume.');
      setDetail({ status: 'ready', row: response.resume });
    } catch (error) {
      setDetail({ status: 'error', message: normalizeError(error).message });
    }
  }, []);

  useEffect(() => {
    setResult(null);
    if (selectedId) void loadDetail(selectedId);
    else setDetail({ status: 'idle' });
  }, [selectedId, loadDetail]);

  const selectResume = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('resume', id);
    setSearchParams(next, { replace: true });
  };

  const analyze = () => {
    if (detail.status !== 'ready' || !selected) return;
    const value = scoreResume(detail.row, { jobDescription: jobDescription.trim() || undefined });
    if (!value) {
      setDetail({ status: 'error', message: 'This resume could not be scored.' });
      return;
    }
    setResult({ resumeId: selected.id, title: selected.title, value });
    window.requestAnimationFrame(() => document.getElementById('ats-results-heading')?.focus());
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink">ATS Score</h1>
        <p className="mt-1 text-sm text-ink-muted">
          A deterministic check of how your saved resume is structured for applicant tracking systems. It runs in your
          browser on your saved resume. Add a job description to see keyword coverage.
        </p>
      </header>

      <section aria-labelledby="ats-resume-heading" className="mb-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <h2 id="ats-resume-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
          <FileText className="size-5 text-brand-600" aria-hidden="true" /> Resume
        </h2>

        {listState === 'loading' ? (
          <div className="h-11 animate-pulse rounded-lg bg-canvas" aria-busy="true" aria-label="Loading your resumes" />
        ) : listState === 'error' ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-800 sm:flex-row sm:items-center">
            <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
            <span className="flex-1">Your resumes could not be loaded: {listError}</span>
            <Button variant="outline" size="sm" onClick={() => void loadList()}>
              <RefreshCw aria-hidden="true" /> Retry
            </Button>
          </div>
        ) : resumes.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm font-medium text-ink">No saved resumes yet</p>
            <p className="mt-1 text-xs text-ink-muted">Create a resume first, then come back to check it.</p>
            <Button asChild size="sm" className="mt-4">
              <Link to="/build-resume">Create a resume</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {requestedMissing && (
              <p role="status" className="rounded-lg border border-warning-200 bg-warning-50 p-2.5 text-xs text-warning-800">
                The requested resume is not in your account. Showing your most recent resume instead.
              </p>
            )}
            <div>
              <label htmlFor="ats-resume" className="mb-1 block text-sm font-medium text-ink">Resume to check</label>
              <select
                id="ats-resume"
                value={selectedId}
                onChange={(event) => selectResume(event.target.value)}
                className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                {resumes.map((resume) => (
                  <option key={resume.id} value={resume.id}>
                    {resume.title}{resume.updatedAt ? ` (updated ${formatDate(resume.updatedAt)})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {selected && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                <span>Template: {getTemplateMeta(selected.template).name}</span>
                <Link to={`/build-resume/${encodeURIComponent(selected.id)}`} className="font-medium text-brand-700 hover:underline">
                  Edit in the resume builder
                </Link>
              </p>
            )}
            {detail.status === 'error' && (
              <div role="alert" className="flex flex-col gap-2 rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-800 sm:flex-row sm:items-center">
                <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
                <span className="flex-1">This resume could not be loaded: {detail.message}</span>
                {selectedId && (
                  <Button variant="outline" size="sm" onClick={() => void loadDetail(selectedId)}>
                    <RefreshCw aria-hidden="true" /> Retry
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {resumes.length > 0 && (
        <section aria-labelledby="ats-jd-heading" className="mb-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <h2 id="ats-jd-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
            <Target className="size-5 text-brand-600" aria-hidden="true" /> Job description (optional)
          </h2>
          <label htmlFor="ats-jd" className="sr-only">Job description</label>
          <Textarea
            id="ats-jd"
            value={jobDescription}
            onChange={(event) => setJobDescription(event.target.value)}
            rows={6}
            maxLength={10000}
            className="resize-y"
            aria-describedby="ats-jd-hint"
          />
          <p id="ats-jd-hint" className="mt-2 text-xs text-ink-muted">
            Paste a posting to see which of its distinctive terms your resume covers. Leave it empty to check the resume on its own.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={analyze} disabled={detail.status !== 'ready'} loading={detail.status === 'loading'}>
              <Sparkles aria-hidden="true" /> {result ? 'Check again' : 'Check resume'}
            </Button>
            {detail.status === 'loading' && <span className="text-xs text-ink-muted">Loading the resume…</span>}
          </div>
        </section>
      )}

      {result && result.resumeId === selectedId && <AtsResults title={result.title} resumeId={result.resumeId} result={result.value} />}
    </div>
  );
}

function AtsResults({ title, resumeId, result }: { title: string; resumeId: string; result: AtsScoreResult }) {
  const jd = result.jdMatch;
  return (
    <section aria-labelledby="ats-results-heading" className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <h2 id="ats-results-heading" tabIndex={-1} className="text-base font-semibold text-ink">
          Results for “{title}”
        </h2>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <p className="flex items-baseline gap-2">
            <span className={cn('text-5xl font-extrabold tabular-nums', scoreTone(result.totalScore))} data-testid="ats-total-score">
              {result.totalScore}%
            </span>
            <span className="text-sm text-ink-muted">ATS readiness</span>
          </p>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <span className="rounded-full border border-border bg-canvas px-3 py-1 text-xs font-semibold text-ink" data-testid="ats-status">
              {result.status.label}
            </span>
            {result.hasJobDescription && jd.score !== null && (
              <span className="rounded-full border border-border bg-canvas px-3 py-1 text-xs font-semibold text-ink" data-testid="ats-jd-score">
                Job description match: {jd.score}%
              </span>
            )}
          </div>
        </div>
        {result.language.nonEnglish && (
          <p className="mt-3 text-xs text-ink-muted">Non-English content detected: English-specific checks such as action verbs are not penalised.</p>
        )}
        {result.stuffing.stuffed && (
          <p className="mt-3 text-xs text-warning-800">Repeated keywords detected. Keep each skill or result in one natural sentence.</p>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Lightbulb className="size-4 text-brand-600" aria-hidden="true" /> Most useful next steps
          </h3>
          {result.improvements.length ? (
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink">
              {result.improvements.map((item) => <li key={item.text}>{item.text}</li>)}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">No changes suggested.</p>
          )}
          <Link to={`/build-resume/${encodeURIComponent(resumeId)}`} className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">
            Edit this resume
          </Link>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ThumbsUp className="size-4 text-success-600" aria-hidden="true" /> Strengths
          </h3>
          {result.strengths.length ? (
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink">
              {result.strengths.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">No strengths detected yet.</p>
          )}
        </div>
      </div>

      {result.hasJobDescription && (
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-ink">Job description terms</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <TermList label="Covered" terms={jd.matched} tone="success" empty="None of the distinctive terms were found." />
            <TermList label="Missing" terms={jd.missing} tone="neutral" empty="No distinctive terms are missing." />
          </div>
          <p className="mt-3 text-xs text-ink-muted">Add only terms that describe skills or experience you really have.</p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-ink">Section breakdown</h3>
        <ul className="mt-3 space-y-4" aria-label="Section scores">
          {result.sections.map((section) => {
            const ratio = section.maxScore ? section.score / section.maxScore : 0;
            return (
              <li key={section.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{section.name}</span>
                  <span className="text-xs tabular-nums text-ink-muted">{section.score} / {section.maxScore}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-canvas" aria-hidden="true">
                  <div className={cn('h-1.5 rounded-full', barTone(ratio))} style={{ width: `${Math.round(ratio * 100)}%` }} />
                </div>
                {section.findings.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {section.findings.map((finding) => (
                      <li key={finding.text} className="flex items-start gap-2 text-xs text-ink-secondary">
                        {finding.ok ? (
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-600" aria-hidden="true" />
                        ) : (
                          <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                        )}
                        <span><span className="sr-only">{finding.ok ? 'Done: ' : 'To do: '}</span>{finding.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function TermList({ label, terms, tone, empty }: { label: string; terms: string[]; tone: 'success' | 'neutral'; empty: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink">{label} ({terms.length})</p>
      {terms.length ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={`${label} terms`}>
          {terms.map((term) => (
            <li
              key={term}
              className={cn(
                'rounded-full px-2 py-0.5 text-xs',
                tone === 'success' ? 'bg-success-50 text-success-800' : 'border border-border bg-canvas text-ink-secondary',
              )}
            >
              {term}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-xs text-ink-muted">{empty}</p>
      )}
    </div>
  );
}
