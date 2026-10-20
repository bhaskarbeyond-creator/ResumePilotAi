/**
 * Score saved resumes with the deterministic ATS checker (lib/atsScore.js).
 *
 * GET /api/resumes and GET /api/resumes/:id return flat rows (`firstname`,
 * `summary`, `skills[]`, `employments[]`, `educations[]`, …), which is exactly
 * the shape `calculateAtsScore` reads. There is no `data` column; drafts that
 * nest their content in a JSON `data` field are still accepted.
 *
 * A resume that cannot be read is reported as unscored (null). No caller may
 * substitute a number of its own.
 */
import { calculateAtsScore, type AtsScoreResult } from '@/lib/atsScore';

const JSON_LIST_FIELDS = [
  'employments', 'educations', 'skills', 'languages', 'hobbies', 'projects',
  'certifications', 'achievements', 'references', 'customSections',
] as const;

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** The scorer input for a stored resume row, or null when there is no row. */
export function resumeScoreInput(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== 'object') return null;
  const base = { ...(row as Record<string, unknown>) };
  const nested = parseMaybeJson(base.data);
  const source: Record<string, unknown> = nested && typeof nested === 'object' && !Array.isArray(nested)
    ? { ...base, ...(nested as Record<string, unknown>) }
    : base;
  for (const field of JSON_LIST_FIELDS) {
    const value = parseMaybeJson(source[field]);
    source[field] = Array.isArray(value) ? value : [];
  }
  return source;
}

export function scoreResume(row: unknown, options?: { jobDescription?: string }): AtsScoreResult | null {
  const input = resumeScoreInput(row);
  if (!input) return null;
  try {
    return calculateAtsScore(input, options);
  } catch {
    return null;
  }
}

/** Rounded 0–100 quality score, or null when the resume cannot be scored. */
export function resumeQualityScore(row: unknown): number | null {
  const value = scoreResume(row)?.qualityScore;
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}
