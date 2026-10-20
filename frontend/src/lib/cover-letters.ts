/**
 * Cover letters: data contract shared by the list page and the builder.
 *
 * Persistence: MariaDB `covers` table through the authenticated API
 *   GET    /api/covers         list (owner-scoped, newest first)
 *   GET    /api/covers/:id     read (404 for missing or another owner's letter)
 *   POST   /api/covers/:id     upsert (ownership-guarded)
 *   DELETE /api/covers/:id     delete (owner-scoped)
 *
 * The record shape matches what the legacy builder stored in `covers.data`
 * (`cl_<timestamp>` ids, candidate / job / company fields, `letterBody`,
 * `templateId`), so letters created in either application open in both.
 */
import axios from 'axios';
import { del, get, normalizeError, post } from '@/lib/api-client';

export type CoverLetterTone = 'modern' | 'formal' | 'impact' | 'creative';

export interface CoverLetterRecord {
  id: string;
  candidateFirstname: string;
  candidateLastname: string;
  candidateEmail: string;
  candidatePhone: string;
  candidateAddress: string;
  candidateCity: string;
  candidatePostalCode: string;
  jobTitle: string;
  companyName: string;
  recipientName: string;
  companyAddress: string;
  companyCity: string;
  companyPostalCode: string;
  letterBody: string;
  jobDescription: string;
  userSkills: string;
  aiTone: CoverLetterTone;
  templateId: string;
  updatedAt?: string;
}

export interface CoverLetterSummary {
  id: string;
  title: string;
  companyName: string;
  recipientName: string;
  updatedAt: string | null;
  excerpt: string;
}

export const TONE_OPTIONS: ReadonlyArray<{ value: CoverLetterTone; label: string; hint: string }> = [
  { value: 'modern', label: 'Plain & confident', hint: 'Clear and professional' },
  { value: 'formal', label: 'Formal', hint: 'Traditional or executive audience' },
  { value: 'impact', label: 'Results-focused', hint: 'Leads with outcomes you stated' },
  { value: 'creative', label: 'Warm & personal', hint: 'A short story from your facts' },
];

const TEXT_FIELDS = [
  'candidateFirstname', 'candidateLastname', 'candidateEmail', 'candidatePhone', 'candidateAddress',
  'candidateCity', 'candidatePostalCode', 'jobTitle', 'companyName', 'recipientName', 'companyAddress',
  'companyCity', 'companyPostalCode', 'letterBody', 'jobDescription', 'userSkills',
] as const satisfies ReadonlyArray<keyof CoverLetterRecord>;

/** Collision-resistant id that keeps the legacy `cl_<timestamp>` prefix. */
export function newCoverLetterId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `cl_${Date.now()}_${random}`;
}

export function emptyCoverLetter(id: string = newCoverLetterId()): CoverLetterRecord {
  return {
    id,
    candidateFirstname: '', candidateLastname: '', candidateEmail: '', candidatePhone: '',
    candidateAddress: '', candidateCity: '', candidatePostalCode: '',
    jobTitle: '', companyName: '', recipientName: '', companyAddress: '', companyCity: '', companyPostalCode: '',
    letterBody: '', jobDescription: '', userSkills: '',
    aiTone: 'modern', templateId: 'Cover1',
  };
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));

/** Normalise a stored cover (any historical shape) into the editable record. */
export function toRecord(raw: Record<string, unknown>, fallbackId: string): CoverLetterRecord {
  const record = emptyCoverLetter(asText(raw.id) || fallbackId);
  for (const field of TEXT_FIELDS) record[field] = asText(raw[field]);
  // Older modern-builder drafts used different names; read them, never write them.
  if (!record.jobTitle) record.jobTitle = asText(raw.positionTitle) || asText(raw.position);
  if (!record.companyName) record.companyName = asText(raw.company);
  const tone = asText(raw.aiTone);
  record.aiTone = TONE_OPTIONS.some((option) => option.value === tone) ? (tone as CoverLetterTone) : 'modern';
  record.templateId = asText(raw.templateId) || asText(raw.template) || 'Cover1';
  record.updatedAt = asText(raw.updatedAt) || asText(raw.updated_at) || undefined;
  return record;
}

export function letterTitle(record: Pick<CoverLetterRecord, 'jobTitle' | 'companyName'> & { title?: string }): string {
  const job = record.jobTitle.trim();
  const company = record.companyName.trim();
  if (job && company) return `${job} at ${company}`;
  return job || record.title?.trim() || (company ? `Cover letter for ${company}` : 'Untitled cover letter');
}

function toSummary(raw: Record<string, unknown>): CoverLetterSummary {
  const record = toRecord(raw, asText(raw.id));
  const title = letterTitle({ jobTitle: record.jobTitle, companyName: record.companyName, title: asText(raw.title) });
  const updatedAt = asText(raw.updated_at) || asText(raw.updatedAt) || null;
  return {
    id: record.id,
    title,
    companyName: record.companyName,
    recipientName: record.recipientName,
    updatedAt,
    excerpt: record.letterBody.replace(/\s+/g, ' ').trim().slice(0, 160),
  };
}

export async function listCoverLetters(): Promise<CoverLetterSummary[]> {
  const data = await get<{ covers?: Array<Record<string, unknown>> }>('/covers');
  return (data.covers ?? []).filter((cover) => asText(cover.id)).map(toSummary);
}

export class CoverLetterNotFoundError extends Error {
  constructor() {
    super('This cover letter does not exist or is not available to your account.');
    this.name = 'CoverLetterNotFoundError';
  }
}

export async function getCoverLetter(id: string): Promise<CoverLetterRecord> {
  try {
    const data = await get<{ cover?: Record<string, unknown> }>(`/covers/${encodeURIComponent(id)}`);
    if (!data.cover) throw new CoverLetterNotFoundError();
    return toRecord(data.cover, id);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) throw new CoverLetterNotFoundError();
    throw error;
  }
}

/** Upsert through the ownership-guarded endpoint; returns the stored record. */
export async function saveCoverLetter(record: CoverLetterRecord): Promise<CoverLetterRecord> {
  const payload = { ...record, title: letterTitle(record), updatedAt: new Date().toISOString() };
  const data = await post<{ success?: boolean; cover?: Record<string, unknown> }>(`/covers/${encodeURIComponent(record.id)}`, payload);
  if (!data.success || !data.cover) throw new Error('The server did not confirm the save.');
  return toRecord(data.cover, record.id);
}

export async function deleteCoverLetter(id: string): Promise<void> {
  const data = await del<{ success?: boolean }>(`/covers/${encodeURIComponent(id)}`);
  if (!data.success) throw new Error('The server did not confirm the deletion.');
}

/** Duplicate a letter as a new, independent record titled "(Copy)". */
export async function duplicateCoverLetter(id: string): Promise<CoverLetterRecord> {
  const source = await getCoverLetter(id);
  const copy: CoverLetterRecord = {
    ...source,
    id: newCoverLetterId(),
    jobTitle: `${source.jobTitle || letterTitle(source)} (Copy)`,
  };
  return saveCoverLetter(copy);
}

export interface ProfilePrefill {
  candidateFirstname: string;
  candidateLastname: string;
  candidateEmail: string;
  candidatePhone: string;
  candidateAddress: string;
  candidateCity: string;
  candidatePostalCode: string;
  userSkills: string;
}

/** Contact details and skills from the master profile (GET /api/users-data/profile). */
export async function loadProfilePrefill(): Promise<ProfilePrefill | null> {
  try {
    const data = await get<{ user?: Record<string, unknown> }>('/users-data/profile');
    const user = data.user;
    if (!user) return null;
    const skills = Array.isArray(user.skills)
      ? user.skills.map((skill) => (skill && typeof skill === 'object' ? asText((skill as { name?: unknown }).name) : asText(skill))).filter(Boolean).join(', ')
      : asText(user.skills);
    return {
      candidateFirstname: asText(user.firstname),
      candidateLastname: asText(user.lastname),
      candidateEmail: asText(user.email),
      candidatePhone: asText(user.phone),
      candidateAddress: asText(user.address),
      candidateCity: asText(user.city),
      candidatePostalCode: asText(user.postalCode) || asText(user.postalcode),
      userSkills: skills,
    };
  } catch {
    return null;
  }
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/**
 * Ask the backend for an AI draft. The server only uses facts supplied here and
 * answers 503 `aiUnavailable` when no provider can produce a valid draft; it
 * never substitutes a template letter, and neither does this client.
 */
export async function generateCoverLetterDraft(record: CoverLetterRecord): Promise<string> {
  const candidateName = `${record.candidateFirstname} ${record.candidateLastname}`.trim();
  try {
    const data = await post<{ success?: boolean; coverLetter?: string }>('/generate-ai-cover-letter', {
      jobTitle: record.jobTitle,
      companyName: record.companyName,
      recipientName: record.recipientName,
      candidateName,
      userSkills: record.userSkills,
      jobDescription: record.jobDescription,
      tone: record.aiTone,
    });
    const text = typeof data.coverLetter === 'string' ? data.coverLetter.trim() : '';
    if (!data.success || !text) throw new AiUnavailableError('The AI service returned no draft. Please try again.');
    return text;
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    const normalized = normalizeError(error);
    if (normalized.status === 503 || normalized.code === 'AI_UNAVAILABLE' || normalized.code === 'AI_OUTPUT_REJECTED') {
      throw new AiUnavailableError(normalized.message || 'AI cover letter generation is unavailable right now. Please try again.');
    }
    throw new Error(normalized.message);
  }
}

const STOP_WORDS = new Set(('a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each etc few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our ours out over own per same she should so some such than that the their theirs them then there these they this those through to too under until up us very via was we were what when where which while who whom why will with within without would you your yours ' +
  'ability able apply candidate candidates company experience including job looking must new our plus preferred required requirements responsibilities role skills strong team teams work working years year using use').split(' '));

/**
 * Deterministic keyword coverage: which significant job-description terms the
 * letter mentions. A writing aid only, not an ATS score.
 */
export function keywordCoverage(jobDescription: string, letterBody: string, limit = 15): { matched: string[]; missing: string[]; percent: number } | null {
  const tokens = jobDescription.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? [];
  const counts = new Map<string, number>();
  for (const raw of tokens) {
    const token = raw.replace(/[.-]+$/, '');
    if (token.length < 3 || STOP_WORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const keywords = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([word]) => word);
  if (!keywords.length) return null;
  const body = ` ${letterBody.toLowerCase()} `;
  const matched = keywords.filter((word) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(body));
  const missing = keywords.filter((word) => !matched.includes(word));
  return { matched, missing, percent: Math.round((matched.length / keywords.length) * 100) };
}

export function formatUpdated(value: string | null | undefined): string {
  if (!value) return 'Not saved yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
