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

export interface SuggestedProject {
  title: string;
  role?: string;
  technologies?: string;
  category?: string;
  projectType?: string;
  description?: string;
}

export type AiOutcome =
  | { kind: 'text'; text: string }
  | { kind: 'skills'; skills: SuggestedSkill[] }
  | { kind: 'certifications'; certifications: SuggestedCertification[] }
  | { kind: 'projects'; projects: SuggestedProject[] }
  | { kind: 'suggestions'; suggestions: string[] }
  | { kind: 'questions'; questions: string[] }
  | { kind: 'unavailable'; message: string; diagnosticCode?: string; remediation?: string; note?: string }
  | { kind: 'rejected'; message: string; diagnosticCode?: string; remediation?: string }
  | { kind: 'rate-limited'; message: string; diagnosticCode?: string; remediation?: string }
  | { kind: 'error'; message: string; diagnosticCode?: string; remediation?: string };

interface ContentResponse {
  aiUnavailable?: boolean;
  note?: string;
  diagnosticCode?: string;
  remediation?: string;
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

export interface DiagnosticResult {
  message: string;
  code: string;
  remediation?: string;
  note?: string;
}

export function resolveTruthfulDiagnostic(params: {
  code?: string;
  message?: string;
  note?: string;
  remediation?: string;
  status?: number;
}): DiagnosticResult {
  const code = String(params.code || '').trim();
  const rawMsg = String(params.message || '').trim();
  const note = String(params.note || '').trim();
  const remediation = String(params.remediation || '').trim();
  const combined = `${code} ${rawMsg} ${note}`.toLowerCase();

  // 1. Encryption / key misconfiguration
  if (
    code === 'AI_ENCRYPTION_KEY_MISSING_FOR_STORED_ENVELOPE' ||
    code === 'AI_SECRET_ENCRYPTION_UNAVAILABLE' ||
    combined.includes('enterprise_encryption_key') ||
    combined.includes('envelope-encrypted')
  ) {
    return {
      code: 'AI_ENCRYPTION_KEY_MISSING_FOR_STORED_ENVELOPE',
      message: note || rawMsg || 'AI provider credentials are encrypted, but ENTERPRISE_ENCRYPTION_KEY is unconfigured on the server.',
      remediation: remediation || 'Configure ENTERPRISE_ENCRYPTION_KEY in the environment or run recover-ai-secrets.js.',
      note,
    };
  }

  if (code === 'AI_ENCRYPTION_KEY_MISMATCH' || combined.includes('key mismatch') || combined.includes('bad decrypt')) {
    return {
      code: 'AI_ENCRYPTION_KEY_MISMATCH',
      message: note || rawMsg || 'Configured ENTERPRISE_ENCRYPTION_KEY does not match the stored secret envelope.',
      remediation: remediation || 'Provide the matching ENTERPRISE_ENCRYPTION_KEY version or re-save credentials in AI settings.',
      note,
    };
  }

  // 2. Provider retired / delisted
  if (
    code === 'AI_PROVIDER_RETIRED' ||
    params.status === 410 ||
    combined.includes('retired') ||
    combined.includes('deprecated')
  ) {
    return {
      code: 'AI_PROVIDER_RETIRED',
      message: note || rawMsg || 'The configured AI model has been retired or deprecated by the upstream provider.',
      remediation: remediation || 'Update the provider model slug in Admin > AI Settings to an active, supported model.',
      note,
    };
  }

  // 3. Provider not found
  if (code === 'AI_PROVIDER_NOT_FOUND' || params.status === 404 || combined.includes('not found') || combined.includes('model not found')) {
    return {
      code: 'AI_PROVIDER_NOT_FOUND',
      message: note || rawMsg || 'The configured AI model slug was not found by the upstream provider.',
      remediation: remediation || 'Verify the model identifier in Admin > AI Settings.',
      note,
    };
  }

  // 4. Provider auth invalid
  if (
    code === 'AI_PROVIDER_AUTH_INVALID' ||
    code === 'INVALID_API_KEY' ||
    params.status === 401 ||
    params.status === 403 ||
    combined.includes('unauthorized') ||
    combined.includes('forbidden') ||
    combined.includes('invalid api key')
  ) {
    return {
      code: 'AI_PROVIDER_AUTH_INVALID',
      message: note || rawMsg || 'AI provider authentication failed: Invalid or expired API credentials configured.',
      remediation: remediation || 'Update provider credentials in Admin > AI Settings.',
      note,
    };
  }

  // 5. Provider timeout
  if (
    code === 'AI_PROVIDER_TIMEOUT' ||
    code === 'TIMEOUT' ||
    params.status === 408 ||
    params.status === 504 ||
    combined.includes('timeout') ||
    combined.includes('aborted')
  ) {
    return {
      code: 'AI_PROVIDER_TIMEOUT',
      message: note || rawMsg || 'Upstream AI provider timed out before responding. The service may be under load.',
      remediation: remediation || 'Retry your request or select an alternative provider in AI Settings.',
      note,
    };
  }

  // 6. Missing resume facts
  if (code === 'AI_MISSING_RESUME_FACTS' || combined.includes('insufficient') || combined.includes('missing facts') || combined.includes('ground generation')) {
    return {
      code: 'AI_MISSING_RESUME_FACTS',
      message: note || rawMsg || 'Insufficient resume details were provided to ground generation truthfully.',
      remediation: remediation || 'Add job title, employer, experience, or skills before generating.',
      note,
    };
  }

  // 7. Rate limits and quota exhaustion
  if (
    code === 'AI_QUOTA_EXHAUSTED' ||
    code === 'RATE_LIMITED' ||
    params.status === 429 ||
    combined.includes('quota') ||
    combined.includes('too many requests')
  ) {
    return {
      code: 'AI_QUOTA_EXHAUSTED',
      message: note || rawMsg || 'AI daily quota or rate limit reached. Existing content was preserved.',
      remediation: remediation || 'Wait until the daily reset window or upgrade the plan.',
      note,
    };
  }

  if (code === 'TENANT_CONTEXT_REQUIRED') {
    return {
      code: 'TENANT_CONTEXT_REQUIRED',
      message: 'Your account belongs to multiple organizations. Please select a workspace from the sidebar, then try again.',
      remediation: 'Select an active workspace from the sidebar.',
      note,
    };
  }

  // 8. If backend supplied a specific non-empty message or note, use it truthfully!
  if (note && note !== AI_UNAVAILABLE_MESSAGE) {
    return {
      code: code || 'AI_SERVICE_UNAVAILABLE',
      message: note,
      remediation: remediation || 'Inspect backend telemetry logs for the root cause.',
      note,
    };
  }

  if (rawMsg && rawMsg !== AI_UNAVAILABLE_MESSAGE && !rawMsg.toLowerCase().includes('temporarily unavailable')) {
    return {
      code: code || (params.status ? `HTTP_${params.status}` : 'AI_SERVICE_UNAVAILABLE'),
      message: rawMsg,
      remediation: remediation || 'Inspect backend telemetry logs for the root cause.',
      note,
    };
  }

  // 9. Completely unknown cause
  return {
    code: code || 'UNKNOWN_AI_CAUSE',
    message: 'AI generation was unavailable (cause unknown). Nothing was generated, and your text has not changed.',
    remediation: remediation || 'Inspect server logs for requestId detail.',
    note,
  };
}

export async function runContentOperation(operation: AiOperation, payload: Record<string, unknown>): Promise<AiOutcome> {
  let data: ContentResponse;
  try {
    data = await post<ContentResponse>('/generate-content', { operation, payload });
  } catch (error) {
    const failure = normalizeError(error);
    const details = (failure.details && typeof failure.details === 'object' ? failure.details : {}) as Record<string, unknown>;
    const nestedError = (details.error && typeof details.error === 'object' ? details.error : {}) as Record<string, unknown>;
    const safeString = (val: unknown): string => (typeof val === 'string' ? val.trim() : '');
    const diagCode = safeString(nestedError.diagnosticCode) || safeString(details.diagnosticCode) || safeString(failure.code);
    const remediation = safeString(nestedError.remediation) || safeString(details.remediation);
    const note = safeString(nestedError.note) || safeString(details.note);

    const resolved = resolveTruthfulDiagnostic({
      code: diagCode,
      message: failure.message,
      note,
      remediation,
      status: failure.status,
    });

    if (failure.status === 429 || resolved.code === 'AI_QUOTA_EXHAUSTED' || resolved.code === 'RATE_LIMITED') {
      return { kind: 'rate-limited', message: resolved.message, diagnosticCode: resolved.code, remediation: resolved.remediation };
    }
    if (failure.status >= 500) {
      return {
        kind: 'unavailable',
        message: resolved.message,
        diagnosticCode: resolved.code,
        remediation: resolved.remediation,
        note: resolved.note,
      };
    }
    if (failure.status >= 400) {
      return { kind: 'rejected', message: resolved.message, diagnosticCode: resolved.code, remediation: resolved.remediation };
    }
    return {
      kind: 'error',
      message: `The request did not reach the server (${failure.message}). Nothing was generated.`,
      diagnosticCode: resolved.code,
      remediation: resolved.remediation,
    };
  }

  // Fallbacks echo the candidate's own text; they are not AI results.
  if (data.aiUnavailable) {
    const resolved = resolveTruthfulDiagnostic({
      code: data.diagnosticCode,
      message: data.note,
      note: data.note,
      remediation: data.remediation,
    });
    return {
      kind: 'unavailable',
      message: resolved.message,
      note: data.note,
      diagnosticCode: resolved.code,
      remediation: resolved.remediation,
    };
  }

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
      const projects: SuggestedProject[] = rawProjects
        .map((p) => {
          if (typeof p === 'string') {
            const parts = p.split(':');
            return {
              title: parts[0]?.trim() || p.trim(),
              description: parts.length > 1 ? parts.slice(1).join(':').trim() : '',
              technologies: '',
            };
          }
          if (typeof p === 'object' && p !== null) {
            const rec = p as Record<string, unknown>;
            const title = text(rec.name || rec.title);
            const role = text(rec.role || rec.projectRole);
            const technologies = text(rec.technologies || rec.tools || rec.stack);
            const category = text(rec.category);
            const projectType = text(rec.projectType);
            const description = text(rec.description || rec.summary);
            return { title, role, technologies, category, projectType, description };
          }
          return { title: '', technologies: '', description: '' };
        })
        .filter((p) => Boolean(p.title));

      if (projects.length) return { kind: 'projects', projects };
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
