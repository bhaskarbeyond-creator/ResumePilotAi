/**
 * DIR-008 — dashboard metrics derived from real ATS scores.
 *
 * The thresholds are a product contract, not a styling detail:
 *
 *   READY      score >= 80   (green)
 *   DEVELOPING 60 … 79       (amber)
 *   STARTING   score < 60    (slate)
 *   UNSCORED   no usable score (no fabricated number)
 *
 * Every bucket is computed from `calculateAtsScore` output; a resume whose
 * content cannot be scored is reported as unscored instead of silently
 * counting as zero.
 */

export const ATS_READY_THRESHOLD = 80;
export const ATS_DEVELOPING_THRESHOLD = 60;

export type AtsBucket = 'ready' | 'developing' | 'starting' | 'unscored';

export interface ResumeMetricInput {
  id?: string;
  template?: string;
  title?: string;
  name?: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface ResumeMetrics {
  total: number;
  ready: number;
  developing: number;
  starting: number;
  unscored: number;
  uniqueTemplates: number;
  averageScore: number | null;
  scored: number;
}

export function bucketForScore(score: number | null): AtsBucket {
  if (score === null || !Number.isFinite(score)) return 'unscored';
  if (score >= ATS_READY_THRESHOLD) return 'ready';
  if (score >= ATS_DEVELOPING_THRESHOLD) return 'developing';
  return 'starting';
}

export function bucketLabel(bucket: AtsBucket): string {
  switch (bucket) {
    case 'ready': return 'Ready to Apply';
    case 'developing': return 'Developing';
    case 'starting': return 'Starting';
    default: return 'Unscored';
  }
}

/** Text/tone classes for a bucket, used by badges and stat cards. */
export function bucketTone(bucket: AtsBucket): { text: string; bg: string; border: string; label: string } {
  switch (bucket) {
    case 'ready':
      return { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Ready to Apply' };
    case 'developing':
      return { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Developing' };
    case 'starting':
      return { text: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', label: 'Starting' };
    default:
      return { text: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200', label: 'Unscored' };
  }
}

export function computeResumeMetrics(
  resumes: ResumeMetricInput[],
  scoreOf: (resume: ResumeMetricInput) => number | null
): ResumeMetrics {
  const counts = { ready: 0, developing: 0, starting: 0, unscored: 0 };
  let scoreSum = 0;
  let scored = 0;
  const templates = new Set<string>();

  for (const resume of Array.isArray(resumes) ? resumes : []) {
    const score = scoreOf(resume);
    const bucket = bucketForScore(score);
    counts[bucket] += 1;
    if (bucket !== 'unscored' && score !== null) {
      scoreSum += score;
      scored += 1;
    }
    templates.add(String(resume?.template || 'Cv1'));
  }

  return {
    total: Array.isArray(resumes) ? resumes.length : 0,
    ready: counts.ready,
    developing: counts.developing,
    starting: counts.starting,
    unscored: counts.unscored,
    uniqueTemplates: templates.size,
    averageScore: scored > 0 ? Math.round(scoreSum / scored) : null,
    scored,
  };
}
