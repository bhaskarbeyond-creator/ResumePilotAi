export interface AtsScoreResult {
  score: number;
  qualityScore: number;
  relevanceScore: number | null;
  targetRole: string | null;
  metrics: {
    completeness: number;
    clarity: number;
    actionVerbDensity: number;
    quantifiableImpact: number;
    formattingSafety: number;
  };
  categories: {
    contact: { score: number; max: number; passed: boolean; feedback: string[] };
    summary: { score: number; max: number; passed: boolean; feedback: string[] };
    experience: { score: number; max: number; passed: boolean; feedback: string[] };
    education: { score: number; max: number; passed: boolean; feedback: string[] };
    skills: { score: number; max: number; passed: boolean; feedback: string[] };
    evidence: { score: number; max: number; passed: boolean; feedback: string[] };
    integrity: { score: number; max: number; passed: boolean; feedback: string[] };
  };
  keywords: {
    matched: string[];
    missing: string[];
    coverage: number;
  };
  actionItems: string[];
}

export function calculateAtsScore(data?: any, options?: { jobDescription?: string; targetRole?: string }): AtsScoreResult;
export function extractJdKeywords(jdText: string): string[];
export const ACTION_VERBS: ReadonlySet<string>;
export const ATS_WEIGHTS: Record<string, number>;
