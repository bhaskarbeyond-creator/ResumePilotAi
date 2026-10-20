/**
 * Types for the deterministic ATS scorer in atsScore.js.
 *
 * These declarations describe what `calculateAtsScore` actually returns. An
 * earlier version declared `score`, `categories`, `keywords` and `actionItems`,
 * which the scorer never produced; consumers that trusted it rendered
 * "undefined" or substituted invented numbers (P002 C5).
 *
 * Input: a resume row as stored by the API (flat fields such as `firstname`,
 * `summary`, `skills[]`, `employments[]`, `educations[]`). See
 * `lib/resume-score.ts` for the adapter used by the dashboard.
 */
export interface AtsFinding {
  ok: boolean;
  text: string;
}

export interface AtsSection {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  findings: AtsFinding[];
  /** The single most useful next step for this section. */
  action: string;
  /** Builder step that edits this section (e.g. "work-history"). */
  navigateTo: string;
  tip?: string;
  reason?: string;
}

export interface AtsJdMatch {
  /** Null when no job description was supplied. */
  score: number | null;
  matched: string[];
  partial?: string[];
  missing: string[];
  groups: Record<string, string[]>;
  partialGroups?: Record<string, string[]>;
  total: number;
}

export interface AtsImprovement {
  text: string;
  navigateTo: string;
}

export interface AtsScoreResult {
  /** Displayed score, 0–100 (the quality score, rounded and clamped). */
  totalScore: number;
  /** Sum of section scores, 0–100. */
  qualityScore: number;
  sections: AtsSection[];
  status: { id: 'excellent' | 'strong' | 'needs-improvement' | 'getting-started'; label: string };
  strengths: string[];
  improvements: AtsImprovement[];
  jdMatch: AtsJdMatch;
  stuffing: {
    stuffed: boolean;
    uniqueRatio: number;
    repeatedToken: string | null;
    consecutive: boolean;
    tokenCount: number;
    empty?: boolean;
  };
  language: { nonEnglish: boolean; reason: string };
  informational: Record<string, number>;
  weights: Record<string, number>;
  hasJobDescription: boolean;
}

export function calculateAtsScore(data?: any, options?: { jobDescription?: string; targetRole?: string }): AtsScoreResult;
export function extractJdKeywords(jdText: string): string[];
export const ACTION_VERBS: ReadonlySet<string>;
export const ATS_WEIGHTS: Record<string, number>;
