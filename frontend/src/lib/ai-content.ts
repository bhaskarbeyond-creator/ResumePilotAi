/**
 * Grounded AI content operations: POST /api/generate-content { operation, payload }.
 *
 * The backend validates each operation, grounds factual rewrites in the
 * candidate's own text and, when no provider can produce a valid result,
 * answers with the candidate's source text flagged `aiUnavailable: true` (or
 * HTTP 502/503). Those answers are reported as "unavailable" here and are never
 * presented as AI output. When the input is too thin to ground a summary, the
 * server asks clarifying questions (`requiresAnswer`) instead of generating.
 */
import { normalizeError, post } from '@/lib/api-client';

export type AiOperation = 'enhance-single-bullet' | 'generate-summary' | 'generate-skills';

export type AiTone = 'balanced' | 'concise' | 'technical' | 'executive' | 'metrics' | 'leadership';

/** Tones accepted by the backend (aiRuntime SAFE_TONES); anything else falls back to balanced. */
export const AI_TONES: ReadonlyArray<{ value: AiTone; label: string; hint: string }> = [
  { value: 'balanced', label: 'Balanced', hint: 'Clear and professional' },
  { value: 'concise', label: 'Concise', hint: 'Short and easy to scan' },
  { value: 'technical', label: 'Technical', hint: 'Precise about tools and methods' },
  { value: 'executive', label: 'Executive', hint: 'Strategic, for senior roles' },
  { value: 'metrics', label: 'Results-focused', hint: 'Leads with numbers you provided' },
  { value: 'leadership', label: 'Leadership', hint: 'Ownership and team impact' },
];

export interface SuggestedSkill {
  name: string;
  basis: string;
}

export type AiOutcome =
  | { kind: 'text'; text: string }
  | { kind: 'skills'; skills: SuggestedSkill[] }
  | { kind: 'questions'; questions: string[] }
  | { kind: 'unavailable'; message: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'rate-limited'; message: string }
  | { kind: 'error'; message: string };

interface ContentResponse {
  aiUnavailable?: boolean;
  requiresAnswer?: boolean;
  questions?: Array<{ question?: unknown } | string>;
  enhancedBullet?: unknown;
  summary?: unknown;
  skills?: Array<{ name?: unknown; basis?: unknown } | string>;
}

export const AI_UNAVAILABLE_MESSAGE = 'AI generation is unavailable right now. Nothing was generated, and your text has not changed.';

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Split a comma- or newline-separated list typed by the candidate. */
export function splitList(value: string, max = 40): string[] {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, max);
}

export async function runContentOperation(operation: AiOperation, payload: Record<string, unknown>): Promise<AiOutcome> {
  let data: ContentResponse;
  try {
    data = await post<ContentResponse>('/generate-content', { operation, payload });
  } catch (error) {
    const failure = normalizeError(error);
    if (failure.status === 429) return { kind: 'rate-limited', message: failure.message || 'Too many AI requests. Wait a minute, then try again.' };
    // Tenant context errors surface as 400 with TENANT_CONTEXT_REQUIRED code.
    // The api-client interceptor auto-retries once, but if it still fails,
    // surface a clear message instead of a generic rejection.
    if (failure.status === 400 && failure.code === 'TENANT_CONTEXT_REQUIRED') {
      return { kind: 'unavailable', message: 'Your account belongs to multiple organizations. Please select a workspace from the sidebar, then try again.' };
    }
    if (failure.status >= 500) return { kind: 'unavailable', message: AI_UNAVAILABLE_MESSAGE };
    if (failure.status >= 400) return { kind: 'rejected', message: failure.message };
    return { kind: 'error', message: `The request did not reach the server (${failure.message}). Nothing was generated.` };
  }

  // Fallbacks echo the candidate's own text; they are not AI results.
  if (data.aiUnavailable) return { kind: 'unavailable', message: AI_UNAVAILABLE_MESSAGE };

  if (data.requiresAnswer && Array.isArray(data.questions)) {
    const questions = data.questions.map((item) => (typeof item === 'string' ? item.trim() : text(item?.question))).filter(Boolean);
    if (questions.length) return { kind: 'questions', questions };
  }
  if (operation === 'enhance-single-bullet' && text(data.enhancedBullet)) return { kind: 'text', text: text(data.enhancedBullet) };
  if (operation === 'generate-summary' && text(data.summary)) return { kind: 'text', text: text(data.summary) };
  if (operation === 'generate-skills' && Array.isArray(data.skills)) {
    const skills = data.skills
      .map((item) => (typeof item === 'string' ? { name: item.trim(), basis: '' } : { name: text(item?.name), basis: text(item?.basis) }))
      .filter((item) => item.name);
    if (skills.length) return { kind: 'skills', skills };
  }
  return { kind: 'unavailable', message: 'The AI service returned no usable result. Nothing was generated.' };
}
