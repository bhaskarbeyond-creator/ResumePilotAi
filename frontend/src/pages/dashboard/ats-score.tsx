/**
 * ATS Score Analysis Page
 *
 * Full-featured ATS compatibility checker. Select any saved resume or paste text,
 * optionally paste a job description, and get instant, deterministic ATS analysis
 * across Contact, Experience, Skills, Evidence, and Keyword matching.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { get, normalizeError } from '@/lib/api-client';
import { calculateAtsScore, type AtsScoreResult } from '@/lib/atsScore';
import { getTemplateMeta } from '@/lib/template-catalog';
import {
  FileText,
  Target,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  BarChart3,
  Lightbulb,
  ArrowRight,
  TrendingUp,
  RotateCcw,
  ShieldCheck,
  Check,
  X,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface SavedResume {
  id: string;
  name: string;
  template: string;
  updatedAt: string;
  data?: any;
}

export function ATSScorePage() {
  const [resumes, setResumes] = useState<SavedResume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [selectedResumeData, setSelectedResumeData] = useState<any>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AtsScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingResumes, setLoadingResumes] = useState(true);

  // Fetch candidate's saved resumes on mount
  useEffect(() => {
    async function loadResumes() {
      setLoadingResumes(true);
      try {
        const res = await get<{ resumes: SavedResume[] }>('/resumes');
        const list = res.resumes || [];
        setResumes(list);
        if (list.length > 0) {
          setSelectedResumeId(list[0].id);
          await loadResumeDetail(list[0].id);
        }
      } catch (err) {
        setError(normalizeError(err).message);
      } finally {
        setLoadingResumes(false);
      }
    }
    void loadResumes();
  }, []);

  const loadResumeDetail = async (id: string) => {
    try {
      const full = await get<{ resume: any }>(`/resumes/${id}`);
      const raw = full.resume || {};
      const parsed = typeof raw.data === 'string' ? JSON.parse(raw.data) : (raw.data || {});
      setSelectedResumeData({
        ...parsed,
        id: raw.id || id,
        name: raw.name,
        template: raw.template,
      });
    } catch {
      // Fallback: minimal structure
      setSelectedResumeData({ id, name: 'Selected Resume' });
    }
  };

  const handleResumeSelect = async (id: string) => {
    setSelectedResumeId(id);
    await loadResumeDetail(id);
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      // Use the verified, deterministic ATS scoring engine
      const dataToScore = selectedResumeData || {
        heading: { firstName: 'Candidate', lastName: '' },
        experience: [],
        education: [],
        skills: [],
      };

      const scoreOutput = calculateAtsScore(dataToScore, {
        jobDescription: jobDescription.trim() || undefined,
      });

      setResult(scoreOutput);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success-600';
    if (score >= 60) return 'text-warning-600';
    return 'text-error-600';
  };

  const getScoreBadgeBg = (score: number) => {
    if (score >= 80) return 'bg-success-50 text-success-700 border-success-200';
    if (score >= 60) return 'bg-warning-50 text-warning-700 border-warning-200';
    return 'bg-error-50 text-error-700 border-error-200';
  };

  const selectedMeta = resumes.find((r) => r.id === selectedResumeId);
  const templateMeta = selectedMeta ? getTemplateMeta(selectedMeta.template || 'Cv1') : null;

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">ATS Score Analysis</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Benchmark your resume against enterprise Applicant Tracking Systems.
            </p>
          </div>
          {result && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResult(null)}
              className="gap-1.5 self-start sm:self-auto"
            >
              <RotateCcw className="size-3.5" />
              New Scan
            </Button>
          )}
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">
            <XCircle className="size-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Input Configuration Section */}
        {!result && (
          <div className="space-y-6">
            {/* Resume Selection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="size-5 text-brand-600" />
                  Select Resume to Analyze
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {resumes.length > 0 ? (
                  <div className="space-y-3">
                    <label className="text-xs font-medium text-ink">Saved Resumes</label>
                    <Select
                      value={selectedResumeId}
                      onValueChange={(val) => void handleResumeSelect(val)}
                    >
                      <SelectTrigger className="w-full h-11 text-sm">
                        <SelectValue placeholder="Choose a resume" />
                      </SelectTrigger>
                      <SelectContent>
                        {resumes.map((r) => {
                          const tmpl = getTemplateMeta(r.template || 'Cv1');
                          return (
                            <SelectItem key={r.id} value={r.id} className="text-xs">
                              <span className="font-semibold text-ink">{r.name || 'Untitled Resume'}</span>
                              <span className="ml-2 text-ink-muted">({tmpl.name} · {tmpl.id})</span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>

                    {/* Active Selected Resume Preview Pill */}
                    {selectedMeta && templateMeta && (
                      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/50 p-3">
                        <img
                          src={templateMeta.thumbnail}
                          alt={templateMeta.name}
                          className="size-12 rounded-lg object-cover object-top border border-border shadow-xs"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-ink truncate">{selectedMeta.name}</p>
                          <p className="text-[11px] text-ink-muted">{templateMeta.name} · {templateMeta.archetype}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="text-xs text-brand-600 hover:text-brand-700"
                        >
                          <Link to={`/build-resume/${selectedMeta.id}`}>
                            Edit in Builder
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-border py-8 text-center">
                    <FileText className="mb-2 size-8 text-ink-subtle" />
                    <p className="text-sm font-medium text-ink">No saved resumes found</p>
                    <p className="text-xs text-ink-muted mt-1">Create a resume first to evaluate ATS compatibility.</p>
                    <Button asChild size="sm" className="mt-4">
                      <Link to="/build-resume">Create a Resume</Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Job Description (Optional) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="size-5 text-brand-600" />
                  Target Job Description
                  <span className="text-xs font-normal text-ink-muted">(Optional for Keyword Matching)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={6}
                  className="flex w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
                  placeholder="Paste the job description or role requirements here to test keyword alignment and skills coverage…"
                />
                <p className="mt-2 text-xs text-ink-muted">
                  Adding a job description unlocks tailored keyword gap analysis and relevancy scoring.
                </p>
              </CardContent>
            </Card>

            {/* Analyze Button */}
            <div className="flex justify-center pt-2">
              <Button
                size="lg"
                onClick={() => void handleAnalyze()}
                loading={analyzing}
                disabled={analyzing || (!selectedResumeId && resumes.length > 0)}
                className="gap-2 px-8 shadow-md"
              >
                <Sparkles className="size-5" />
                Run ATS Compatibility Scan
              </Button>
            </div>
          </div>
        )}

        {/* Results View */}
        {result && (
          <div className="space-y-6">
            {/* Overall Score Banner */}
            <Card className="overflow-hidden border-border bg-gradient-to-br from-surface to-brand-50/30">
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
                  <div className="flex items-center gap-6">
                    {/* Circular Score Gauge */}
                    <div className="relative flex size-28 items-center justify-center">
                      <svg viewBox="0 0 36 36" className="size-full -rotate-90">
                        <circle
                          cx="18"
                          cy="18"
                          r="15.5"
                          stroke="currentColor"
                          strokeWidth="3"
                          fill="none"
                          className="text-neutral-200"
                        />
                        <circle
                          cx="18"
                          cy="18"
                          r="15.5"
                          stroke="currentColor"
                          strokeWidth="3"
                          fill="none"
                          className={result.score >= 80 ? 'text-success-500' : result.score >= 60 ? 'text-warning-500' : 'text-error-500'}
                          strokeDasharray={`${result.score} 100`}
                          strokeLinecap="round"
                          style={{ transition: 'stroke-dasharray 0.8s ease' }}
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center">
                        <span className={`text-3xl font-extrabold ${getScoreColor(result.score)}`}>
                          {result.score}%
                        </span>
                        <span className="text-[10px] font-semibold text-ink-muted uppercase">ATS Match</span>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xl font-bold text-ink">
                        {result.score >= 80
                          ? 'Exceptional ATS Readiness'
                          : result.score >= 60
                            ? 'Good ATS Readiness (Minor Improvements Needed)'
                            : 'Critical Formatting / Content Gaps Detected'}
                      </h2>
                      <p className="mt-1 text-xs text-ink-muted">
                        Analyzed for structural clarity, quantifiable impact, and ATS crawler readability.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getScoreBadgeBg(result.score)}`}>
                          Readiness: {result.qualityScore}%
                        </span>
                        {result.relevanceScore !== null && (
                          <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                            JD Match: {result.relevanceScore}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:items-end">
                    {selectedMeta && (
                      <Button asChild size="sm">
                        <Link to={`/build-resume/${selectedMeta.id}`}>
                          Optimize in Builder <ArrowRight className="size-3.5 ml-1" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Section-by-Section ATS Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.categories &&
                  Object.entries(result.categories).map(([key, cat]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-xl border border-border bg-surface/50 p-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex size-7 items-center justify-center rounded-lg ${
                            cat.passed ? 'bg-success-100 text-success-600' : 'bg-rose-100 text-rose-600'
                          }`}
                        >
                          {cat.passed ? <Check className="size-4" /> : <X className="size-4" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink uppercase tracking-wider">{key}</p>
                          <p className="text-[11px] text-ink-muted">
                            {cat.feedback?.[0] || (cat.passed ? 'Satisfies ATS standards' : 'Action required')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-ink">
                          {cat.score} / {cat.max}
                        </span>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>

            {/* Keyword Analysis (if JD provided) */}
            {result.keywords && (result.keywords.matched.length > 0 || result.keywords.missing.length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Matched Keywords */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm text-success-700">
                      <CheckCircle2 className="size-4 text-success-600" />
                      Matched Keywords ({result.keywords.matched.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {result.keywords.matched.map((kw, idx) => (
                        <span
                          key={idx}
                          className="rounded-full bg-success-50 px-2.5 py-0.5 text-[11px] font-medium text-success-700 border border-success-200"
                        >
                          ✓ {kw}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Missing Keywords */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm text-amber-700">
                      <AlertTriangle className="size-4 text-amber-600" />
                      Missing Keywords ({result.keywords.missing.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {result.keywords.missing.map((kw, idx) => (
                        <span
                          key={idx}
                          className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200"
                        >
                          + {kw}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Action Items */}
            {result.actionItems && result.actionItems.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-brand-600">
                    <Lightbulb className="size-5" />
                    Recommended Improvements
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {result.actionItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 rounded-lg bg-canvas-soft p-2.5 text-xs text-ink"
                    >
                      <span className="font-bold text-brand-600 mt-0.5">{idx + 1}.</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
