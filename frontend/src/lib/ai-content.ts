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
import { normalizeError, post, get } from '@/lib/api-client';

export type AiOperation =
  | 'enhance-single-bullet'
  | 'generate-summary'
  | 'generate-skills'
  | 'generate-work-description'
  | 'generate-education-description'
  | 'generate-certifications'
  | 'autocomplete'
  | 'generate-projects';

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
  category?: string;
}

export interface SuggestedCertification {
  title: string;
  issuer: string;
  basis: string;
  category: string;
}

export interface ClarifyingQuestion {
  id?: string;
  question: string;
  answerField?: string;
  starterChips?: string[];
}

export type AiOutcome =
  | { kind: 'text'; text: string }
  | { kind: 'skills'; skills: SuggestedSkill[] }
  | { kind: 'certifications'; certifications: SuggestedCertification[] }
  | { kind: 'suggestions'; suggestions: string[] }
  | { kind: 'questions'; questions: string[] }
  | { kind: 'unavailable'; message: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'rate-limited'; message: string }
  | { kind: 'error'; message: string };

interface ContentResponse {
  aiUnavailable?: boolean;
  requiresAnswer?: boolean;
  questions?: Array<{ id?: string; question?: unknown; starterChips?: string[] } | string>;
  enhancedBullet?: unknown;
  summary?: unknown;
  skills?: Array<{ name?: unknown; basis?: unknown; category?: unknown } | string>;
  certifications?: Array<{ title?: unknown; issuer?: unknown; basis?: unknown; category?: unknown }>;
  suggestions?: string[];
  bullets?: string[];
  highlights?: string[];
}

export interface GrammarCorrection {
  original: string;
  suggestion: string;
  type: 'grammar' | 'spelling' | 'punctuation' | 'style';
  explanation: string;
  startIndex: number;
  endIndex: number;
}

export interface GrammarCheckResult {
  hasErrors: boolean;
  corrections: GrammarCorrection[];
  overallSuggestion: string;
  aiUnavailable?: boolean;
}

export interface ParsedResumeData {
  firstname?: string;
  lastname?: string;
  email?: string;
  phone?: string;
  occupation?: string;
  city?: string;
  country?: string;
  address?: string;
  postalcode?: string;
  website?: string;
  linkedin?: string;
  github?: string;
  summary?: string;
  employments?: Array<{
    jobTitle?: string;
    position?: string;
    employer?: string;
    company?: string;
    city?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    current?: boolean;
    description?: string;
  }>;
  experience?: Array<{
    jobTitle?: string;
    position?: string;
    employer?: string;
    company?: string;
    city?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    current?: boolean;
    description?: string;
  }>;
  educations?: Array<{
    school?: string;
    institution?: string;
    degree?: string;
    field?: string;
    city?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
    description?: string;
  }>;
  education?: Array<{
    school?: string;
    institution?: string;
    degree?: string;
    field?: string;
    city?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
    description?: string;
  }>;
  skills?: Array<string | { skillName?: string; name?: string; rating?: number | null }>;
  certifications?: Array<{
    name?: string;
    title?: string;
    issuer?: string;
    issueDate?: string;
  }>;
  languages?: Array<{ language?: string; level?: string; proficiency?: string }>;
  heading?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    location?: string;
    title?: string;
    website?: string;
    linkedin?: string;
    github?: string;
  };
}

export interface AiUsageData {
  plan: string;
  usedToday: number;
  effectiveLimit: number;
  remainingToday: number;
  isExhausted: boolean;
  lastResetAt: string | null;
  quotaScope: string;
  tenantId: string | null;
  orgDailyLimit: number | null;
  ambiguousTenant: boolean;
}

export const AI_UNAVAILABLE_MESSAGE = 'AI generation is unavailable right now. Nothing was generated, and your text has not changed.';

const text = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text.trim();
    if (typeof obj.name === 'string') return obj.name.trim();
    if (typeof obj.title === 'string') return obj.title.trim();
    if (typeof obj.skill === 'string') return obj.skill.trim();
    if (typeof obj.certification === 'string') return obj.certification.trim();
    if (typeof obj.suggestion === 'string') return obj.suggestion.trim();
    if (typeof obj.item === 'string') return obj.item.trim();
    if (typeof obj.description === 'string') return obj.description.trim();
  }
  return '';
};

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
  
  if (operation === 'generate-skills') {
    const rawSkills = data.skills || data.suggestions || (data as Record<string, unknown>).keywords;
    if (Array.isArray(rawSkills) && rawSkills.length > 0) {
      const skills = rawSkills
        .map((item) => (typeof item === 'string' ? { name: item.trim(), basis: '' } : { name: text(item?.name || item?.skill || item?.title), basis: text(item?.basis), category: text(item?.category) }))
        .filter((item) => item.name);
      if (skills.length) return { kind: 'skills', skills };
    }
  }

  if (operation === 'generate-certifications') {
    const rawCerts = data.certifications || data.suggestions || (data as Record<string, unknown>).certs;
    if (Array.isArray(rawCerts) && rawCerts.length > 0) {
      const certifications = rawCerts
        .map((item) => (typeof item === 'string' ? { title: item.trim(), issuer: '', basis: '', category: 'recommended' } : {
          title: text(item?.title || item?.name || item?.certification),
          issuer: text(item?.issuer || item?.authority || item?.organization),
          basis: text(item?.basis),
          category: text(item?.category) || 'recommended',
        }))
        .filter((item) => item.title);
      if (certifications.length) return { kind: 'certifications', certifications };
    }
  }

  if (operation === 'generate-projects') {
    const rawProjects = (data as Record<string, unknown>).projects || data.suggestions;
    if (Array.isArray(rawProjects) && rawProjects.length > 0) {
      const cleanList = rawProjects.map((p) => {
        if (typeof p === 'string') return p.trim();
        if (typeof p === 'object' && p !== null) {
          const rec = p as Record<string, unknown>;
          const name = text(rec.name || rec.title);
          const role = text(rec.role);
          const tech = text(rec.technologies || rec.tools);
          return [name, role ? `(${role})` : '', tech ? `- ${tech}` : ''].filter(Boolean).join(' ');
        }
        return '';
      }).filter(Boolean);
      if (cleanList.length) return { kind: 'suggestions', suggestions: cleanList };
    }
  }

  if (['generate-work-description', 'generate-education-description', 'autocomplete', 'generate-projects'].includes(operation)) {
    const rawSuggestions = data.suggestions || data.bullets || data.highlights || (data as Record<string, unknown>).items;
    if (Array.isArray(rawSuggestions) && rawSuggestions.length > 0) {
      const cleanList = rawSuggestions.map((s) => text(s)).filter(Boolean);
      if (cleanList.length) return { kind: 'suggestions', suggestions: cleanList };
    }
  }

  return { kind: 'unavailable', message: 'The AI service returned no usable result. Nothing was generated.' };
}

/**
 * Fetch autocomplete suggestions for an input field with debounced caching.
 */
export async function fetchAiAutocomplete(type: string, query: string, context?: Record<string, unknown>): Promise<string[]> {
  const cleanQ = String(query || '').trim();
  if (cleanQ.length < 2) return [];
  try {
    const outcome = await runContentOperation('autocomplete', {
      type,
      query: cleanQ,
      ...(context ? { context } : {}),
    });
    if (outcome.kind === 'suggestions') {
      return outcome.suggestions;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Check grammar and copy quality across multiple languages via POST /api/check-grammar.
 */
export async function checkGrammar(content: string, language = 'en'): Promise<GrammarCheckResult> {
  const safeText = String(content || '').trim();
  if (!safeText) return { hasErrors: false, corrections: [], overallSuggestion: 'No content to check.' };
  return post<GrammarCheckResult>('/check-grammar', { text: safeText, language });
}

/**
 * Parse an uploaded resume text via POST /api/parse-resume into structured sections.
 */
export async function parseResumeDocument(rawText: string): Promise<{ data: ParsedResumeData }> {
  const safeText = String(rawText || '').trim().slice(0, 40000);
  if (!safeText) throw new Error('Resume text is empty.');
  return post<{ data: ParsedResumeData }>('/parse-resume', { rawText: safeText });
}

/**
 * Fetch authenticated daily AI quota usage via GET /api/ai-usage for menubar readout.
 */
export async function fetchAiUsage(): Promise<AiUsageData> {
  const response = await get<{ success: boolean; usage: AiUsageData }>('/ai-usage');
  return response.usage;
}

/**
 * Extract clean plaintext from a user-supplied file (.docx, .txt, .rtf, .pdf).
 */
export async function extractFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  // DOCX files using mammoth
  if (name.endsWith('.docx')) {
    try {
      const mammoth = await import('mammoth');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      if (result && result.value && result.value.trim().length > 20) {
        return result.value.trim();
      }
    } catch (err) {
      console.warn('[DOCX Extraction fallback]', err);
    }
  }

  // Standard text formats (.txt, .rtf, .md, .csv)
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').trim());
    reader.onerror = () => reject(new Error('Failed to read file contents.'));
    reader.readAsText(file);
  });
}
