/**
 * ATS Score Analysis
 *
 * Resume ATS compatibility checker. Upload or select a resume,
 * optionally paste a job description, and get AI-driven scoring.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { post, normalizeError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  FileText,
  Target,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  Upload,
  BarChart3,
  Lightbulb,
  TrendingUp,
} from 'lucide-react';

interface ATSResult {
  overallScore: number;
  sections: {
    name: string;
    score: number;
    status: 'good' | 'warning' | 'critical';
    feedback: string;
  }[];
  suggestions: string[];
  keywords: {
    found: string[];
    missing: string[];
  };
}

export function ATSScorePage() {
  const [jobDescription, setJobDescription] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ATSResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const data = await post<{ result: ATSResult }>('/ats/analyze', {
        jobDescription: jobDescription || undefined,
      });
      setResult(data.result);
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

  const getScoreRing = (score: number) => {
    if (score >= 80) return 'stroke-success-500';
    if (score >= 60) return 'stroke-warning-500';
    return 'stroke-error-500';
  };

  const statusIcon = {
    good: <CheckCircle2 className="size-4 text-success-600" />,
    warning: <AlertTriangle className="size-4 text-warning-600" />,
    critical: <XCircle className="size-4 text-error-600" />,
  };

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink">ATS Score Analysis</h1>
          <p className="mt-1 text-sm text-ink-muted">Check how well your resume passes Applicant Tracking Systems.</p>
        </div>

        {/* Input section */}
        {!result && (
          <div className="space-y-6">
            {/* Resume selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="size-5 text-brand-600" />
                  Select Resume
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-border py-8 text-center">
                  <Upload className="mb-3 size-10 text-ink-subtle" />
                  <p className="text-sm font-medium text-ink">Upload a resume or select from your saved resumes</p>
                  <p className="mt-1 text-xs text-ink-muted">PDF, DOCX up to 5MB</p>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm">
                      <Upload className="size-3.5" /> Upload File
                    </Button>
                    <Button variant="outline" size="sm">
                      <FileText className="size-3.5" /> Choose Saved
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Job description (optional) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="size-5 text-brand-600" />
                  Job Description
                  <span className="text-xs font-normal text-ink-muted">(optional)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={6}
                  className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
                  placeholder="Paste the job description here to get targeted keyword matching and scoring…"
                />
                <p className="mt-2 text-xs text-ink-muted">Adding a job description improves scoring accuracy by matching relevant keywords.</p>
              </CardContent>
            </Card>

            {/* Analyze button */}
            <div className="flex justify-center">
              <Button size="lg" onClick={() => void handleAnalyze()} loading={analyzing} disabled={analyzing}>
                <Sparkles className="size-5" />
                Analyze Resume
              </Button>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700">
                <XCircle className="size-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Score overview */}
            <Card>
              <CardContent className="flex flex-col items-center py-8">
                <div className="relative">
                  <svg className="size-32" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" className="text-neutral-200" strokeWidth="8" />
                    <circle
                      cx="60" cy="60" r="50" fill="none"
                      className={getScoreRing(result.overallScore)}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${(result.overallScore / 100) * 314} 314`}
                      transform="rotate(-90 60 60)"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={cn('text-3xl font-bold', getScoreColor(result.overallScore))}>
                      {result.overallScore}
                    </span>
                    <span className="text-xs text-ink-muted">out of 100</span>
                  </div>
                </div>
                <h2 className="mt-4 text-lg font-semibold text-ink">
                  {result.overallScore >= 80 ? 'Excellent ATS Score!' : result.overallScore >= 60 ? 'Good, but can improve' : 'Needs improvement'}
                </h2>
                <Button variant="outline" className="mt-4" onClick={() => setResult(null)}>
                  Analyze Another Resume
                </Button>
              </CardContent>
            </Card>

            {/* Section breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="size-5 text-brand-600" />
                  Section Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.sections.map((section) => (
                  <div key={section.name} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {statusIcon[section.status]}
                        <span className="text-sm font-medium text-ink">{section.name}</span>
                      </div>
                      <span className={cn('text-sm font-bold', getScoreColor(section.score))}>
                        {section.score}/100
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          section.score >= 80 ? 'bg-success-500' : section.score >= 60 ? 'bg-warning-500' : 'bg-error-500',
                        )}
                        style={{ width: `${section.score}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-ink-muted">{section.feedback}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Keywords */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-success-700">
                    <CheckCircle2 className="inline size-4 mr-1" />
                    Keywords Found ({result.keywords.found.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5 pt-0">
                  {result.keywords.found.map((kw) => (
                    <span key={kw} className="rounded-full bg-success-100 px-2.5 py-0.5 text-xs text-success-700">{kw}</span>
                  ))}
                  {result.keywords.found.length === 0 && <span className="text-xs text-ink-muted">No keywords matched</span>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-error-700">
                    <XCircle className="inline size-4 mr-1" />
                    Missing Keywords ({result.keywords.missing.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5 pt-0">
                  {result.keywords.missing.map((kw) => (
                    <span key={kw} className="rounded-full bg-error-100 px-2.5 py-0.5 text-xs text-error-700">{kw}</span>
                  ))}
                  {result.keywords.missing.length === 0 && <span className="text-xs text-ink-muted">No missing keywords</span>}
                </CardContent>
              </Card>
            </div>

            {/* Suggestions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lightbulb className="size-5 text-warning-500" />
                  Improvement Suggestions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {result.suggestions.map((suggestion, i) => (
                  <div key={i} className="flex gap-3 rounded-lg bg-neutral-50 p-3">
                    <TrendingUp className="size-4 text-brand-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-ink-secondary">{suggestion}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
