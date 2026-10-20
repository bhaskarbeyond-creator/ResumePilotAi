/**
 * Interview Coach data layer. Every call goes through the shared API client
 * (Bearer token, `/api` base, token refresh) to the real backend contracts:
 *
 *   POST   /api/generate-interview                        calibrated multiple-choice assessment
 *   POST   /api/live-interview/guide                      answer guidance for one question
 *   POST   /api/live-interview/sessions                   start a server-authoritative live interview
 *   GET    /api/live-interview/sessions/:id               reload a session (owner only)
 *   POST   /api/live-interview/sessions/:id/turns         answer the current question
 *   POST   /api/live-interview/sessions/:id/complete      finish and build the report
 *   DELETE /api/live-interview/sessions/:id               abandon a session
 *
 * Nothing here invents questions, feedback or scores. Failures surface as
 * InterviewApiError carrying the backend's status, code and message.
 */
import axios from 'axios';
import { apiClient, normalizeError } from '@/lib/api-client';

export type InterviewTopicId = 'behavioral' | 'technical' | 'situational' | 'case-study' | 'competency' | 'general';
export type BackendInterviewType = 'technical' | 'behavioral' | 'mixed' | 'hr' | 'managerial' | 'case';
export type ExperienceLevel = 'fresher' | 'junior' | 'mid' | 'senior' | 'lead' | 'executive';
export type InterviewDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

/** Coach topics mapped onto the interview types both AI endpoints accept. */
export const TOPIC_INTERVIEW_TYPE: Record<InterviewTopicId, BackendInterviewType> = {
  behavioral: 'behavioral',
  technical: 'technical',
  situational: 'mixed',
  'case-study': 'case',
  competency: 'mixed',
  general: 'hr',
};

export const EXPERIENCE_LEVEL_OPTIONS: ReadonlyArray<{ value: ExperienceLevel; label: string }> = [
  { value: 'fresher', label: 'Fresher / graduate' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead / manager' },
  { value: 'executive', label: 'Executive' },
];

export const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: InterviewDifficulty; label: string }> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'expert', label: 'Expert' },
];

/** The backend accepts 5-20 questions per generated assessment. */
export const AI_ASSESSMENT_COUNTS = [5, 10, 15, 20] as const;
/** Live answers are bounded server-side (normalizeAnswer). */
export const LIVE_ANSWER_MIN_CHARS = 2;
export const LIVE_ANSWER_MAX_CHARS = 6000;

/** Mirrors the server's target-turn rule: clamp(ceil(minutes / 4), 4, 10). */
export function liveTargetTurns(durationMinutes: number): number {
  return Math.min(10, Math.max(4, Math.ceil(durationMinutes / 4)));
}

// The client default is 30 s, but the backend gives its provider up to 90 s plus
// bounded correction passes for an assessment. These budgets keep the client from
// abandoning work the server is still allowed to finish; the UI offers Cancel.
const ASSESSMENT_TIMEOUT_MS = 180_000;
const LIVE_TIMEOUT_MS = 120_000;
const GUIDE_TIMEOUT_MS = 45_000;

export class InterviewApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Latest server session when the backend attaches one (e.g. revision conflicts). */
  readonly session?: LiveInterviewSession;

  constructor(status: number, code: string, message: string, session?: LiveInterviewSession) {
    super(message);
    this.name = 'InterviewApiError';
    this.status = status;
    this.code = code;
    this.session = session;
  }

  get cancelled(): boolean {
    return this.code === 'CANCELLED';
  }
}

function toInterviewError(error: unknown): InterviewApiError {
  if (error instanceof InterviewApiError) return error;
  if (axios.isCancel(error)) return new InterviewApiError(0, 'CANCELLED', 'The request was cancelled.');
  if (axios.isAxiosError(error) && !error.response && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
    return new InterviewApiError(0, 'TIMEOUT', 'The request took too long to finish. Please try again.');
  }
  const normalized = normalizeError(error);
  const details = normalized.details as { session?: LiveInterviewSession } | undefined;
  const message = normalized.status === 0 && normalized.code === 'NETWORK_ERROR'
    ? 'The server could not be reached. Check your connection and try again.'
    : normalized.message;
  return new InterviewApiError(normalized.status, normalized.code, message, isLiveSession(details?.session) ? details.session : undefined);
}

/* ─── Calibrated multiple-choice assessment ─── */

export interface AssessmentQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface GeneratedAssessment {
  title: string;
  questions: AssessmentQuestion[];
}

interface RawAssessment {
  title?: unknown;
  questions?: Array<{ id?: unknown; question?: unknown; options?: unknown; correctAnswer?: unknown; explanation?: unknown }>;
}

/** Keeps only questions the client can score exactly as the server defined them. */
export function normalizeAssessment(data: RawAssessment | null | undefined): GeneratedAssessment {
  const questions = (Array.isArray(data?.questions) ? data.questions : []).flatMap((item, index) => {
    const question = typeof item?.question === 'string' ? item.question.trim() : '';
    const options = Array.isArray(item?.options) ? item.options.map((option) => String(option ?? '').trim()) : [];
    const correct = Number(item?.correctAnswer);
    // Never drop or reorder single options: that would shift the server's correct index.
    if (!question || options.length < 2 || options.some((option) => !option)) return [];
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return [];
    return [{
      id: `ai-${index + 1}`,
      question,
      options,
      correctIndex: correct,
      explanation: typeof item?.explanation === 'string' ? item.explanation.trim() : '',
    }];
  });
  return { title: typeof data?.title === 'string' ? data.title.trim() : '', questions };
}

export async function generateAssessment(
  input: { occupation: string; topic: InterviewTopicId; questionCount: number; experienceLevel: ExperienceLevel; difficulty: InterviewDifficulty },
  signal?: AbortSignal,
): Promise<GeneratedAssessment> {
  try {
    const { data } = await apiClient.post<RawAssessment>('/generate-interview', {
      occupation: input.occupation,
      interviewType: TOPIC_INTERVIEW_TYPE[input.topic],
      questionCount: input.questionCount,
      experienceLevel: input.experienceLevel,
      difficulty: input.difficulty,
    }, { timeout: ASSESSMENT_TIMEOUT_MS, signal });
    const assessment = normalizeAssessment(data);
    if (!assessment.questions.length) {
      throw new InterviewApiError(502, 'INVALID_AI_OUTPUT', 'The AI service returned no usable questions. Please try again.');
    }
    return assessment;
  } catch (error) {
    throw toInterviewError(error);
  }
}

/* ─── Answer guidance ─── */

export interface AnswerGuide {
  goal: string;
  modelAnswer: string;
  tip: string;
}

export async function requestAnswerGuide(
  input: { question: string; role?: string; topic?: string; regenerate?: boolean },
  signal?: AbortSignal,
): Promise<AnswerGuide> {
  try {
    const { data } = await apiClient.post<Partial<AnswerGuide>>('/live-interview/guide', input, { timeout: GUIDE_TIMEOUT_MS, signal });
    const guide = {
      goal: typeof data?.goal === 'string' ? data.goal : '',
      modelAnswer: typeof data?.modelAnswer === 'string' ? data.modelAnswer : '',
      tip: typeof data?.tip === 'string' ? data.tip : '',
    };
    if (!guide.modelAnswer.trim()) {
      throw new InterviewApiError(502, 'INVALID_AI_OUTPUT', 'AI answer guidance is unavailable right now. Please try again.');
    }
    return guide;
  } catch (error) {
    throw toInterviewError(error);
  }
}

/* ─── Live interview sessions ─── */

export interface LiveEvaluation {
  score: number | null;
  observations: string[];
  coachingTip: string;
  evidence: string[];
}

export interface LiveReport {
  overallScore: number | null;
  readiness: string;
  summary: string;
  strengths: string[];
  focusAreas: Array<{ area: string; detail: string }>;
  practicePlan: string[];
  evidence: string[];
  competencies: Array<{ name: string; score: number; evidence: string }>;
}

export interface LiveInterviewSession {
  sessionId: string;
  revision: number;
  status: string;
  expiresAt: string;
  configuration: { role: string; interviewType: string; experienceLevel: string; difficulty: string; durationMinutes: number };
  interviewer: {
    turnId: string | null;
    message: string;
    question: string;
    responseType: string;
    intent: string;
    modelAnswer: string;
    tip: string;
    talkingPoints: string[];
    starters: string[];
  };
  progress: { stage: string; topic: string; difficulty: string; completedTurns: number; targetTurns: number; percent: number; interviewComplete: boolean };
  latestEvaluation: LiveEvaluation | null;
  transcript: Array<{ turnId: string; question: string; answer: string; topic: string; stage: string; evaluation: LiveEvaluation | null; answeredAt: string }>;
  report: LiveReport | null;
}

function isLiveSession(value: unknown): value is LiveInterviewSession {
  const candidate = value as Partial<LiveInterviewSession> | null | undefined;
  return Boolean(candidate && typeof candidate.sessionId === 'string' && candidate.interviewer && candidate.progress);
}

function sessionFrom(data: { session?: unknown } | null | undefined): LiveInterviewSession {
  if (!isLiveSession(data?.session)) {
    throw new InterviewApiError(502, 'INVALID_RESPONSE', 'The interview service returned an unexpected response. Please try again.');
  }
  return data.session;
}

/** True once the server has closed the question loop (report may still be pending). */
export function liveInterviewClosed(session: LiveInterviewSession): boolean {
  return session.progress.interviewComplete || session.interviewer.responseType === 'closing' || !session.interviewer.turnId;
}

export async function startLiveInterview(
  input: { role: string; topic: InterviewTopicId; experienceLevel: ExperienceLevel; difficulty: InterviewDifficulty; durationMinutes: number },
  signal?: AbortSignal,
): Promise<LiveInterviewSession> {
  try {
    const { data } = await apiClient.post<{ session?: unknown }>('/live-interview/sessions', {
      role: input.role,
      interviewType: TOPIC_INTERVIEW_TYPE[input.topic],
      experienceLevel: input.experienceLevel,
      difficulty: input.difficulty,
      durationMinutes: input.durationMinutes,
    }, { timeout: LIVE_TIMEOUT_MS, signal });
    return sessionFrom(data);
  } catch (error) {
    throw toInterviewError(error);
  }
}

export async function getLiveInterview(sessionId: string, signal?: AbortSignal): Promise<LiveInterviewSession> {
  try {
    const { data } = await apiClient.get<{ session?: unknown }>(`/live-interview/sessions/${encodeURIComponent(sessionId)}`, { signal });
    return sessionFrom(data);
  } catch (error) {
    throw toInterviewError(error);
  }
}

/**
 * Submits an answer to the current question. Reuse the same idempotencyKey when
 * retrying the same answer so a slow first attempt can never be recorded twice.
 */
export async function answerLiveInterview(
  session: LiveInterviewSession,
  answer: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<LiveInterviewSession> {
  try {
    const { data } = await apiClient.post<{ session?: unknown }>(`/live-interview/sessions/${encodeURIComponent(session.sessionId)}/turns`, {
      idempotencyKey,
      expectedRevision: session.revision,
      turnId: session.interviewer.turnId,
      answer,
    }, { timeout: LIVE_TIMEOUT_MS, signal });
    return sessionFrom(data);
  } catch (error) {
    throw toInterviewError(error);
  }
}

export async function completeLiveInterview(
  session: LiveInterviewSession,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<LiveInterviewSession> {
  try {
    const { data } = await apiClient.post<{ session?: unknown }>(`/live-interview/sessions/${encodeURIComponent(session.sessionId)}/complete`, {
      idempotencyKey,
      expectedRevision: session.revision,
    }, { timeout: LIVE_TIMEOUT_MS, signal });
    return sessionFrom(data);
  } catch (error) {
    throw toInterviewError(error);
  }
}

export async function abandonLiveInterview(sessionId: string): Promise<void> {
  try {
    await apiClient.delete(`/live-interview/sessions/${encodeURIComponent(sessionId)}`);
  } catch (error) {
    throw toInterviewError(error);
  }
}

/* ─── Reload pointer ─── */
// Only the opaque session id is kept, per tab and per signed-in user. The server
// remains the source of truth and only ever returns a session to its owner.

const LIVE_POINTER_PREFIX = 'ime365.interviewCoach.liveSession.';

export function rememberLiveSession(uid: string, sessionId: string): void {
  try { window.sessionStorage.setItem(LIVE_POINTER_PREFIX + uid, sessionId); } catch { /* storage unavailable */ }
}

export function recallLiveSession(uid: string): string | null {
  try { return window.sessionStorage.getItem(LIVE_POINTER_PREFIX + uid); } catch { return null; }
}

export function forgetLiveSession(uid: string): void {
  try { window.sessionStorage.removeItem(LIVE_POINTER_PREFIX + uid); } catch { /* storage unavailable */ }
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
