/**
 * Typed client for the signed-in user's own account (candidate Settings), through
 * the shared apiClient (base URL /api, Bearer token, refresh).
 *
 *   GET  /users-data/profile      { user: { revision, profile } }: the Master Profile projection
 *   POST /users-data/profile      { expectedRevision, profile }: the sent fields are merged onto
 *                                 the stored profile; 409 PROFILE_CONFLICT carries remoteRevision
 *                                 and remoteProfile
 *   POST /account/export          { export }: owner-scoped JSON archive, with exportWarnings
 *   POST /account/delete          deletion saga; 503 ACCOUNT_IDENTITY_DELETE_FAILED means the
 *                                 personal data is gone and only identity removal is pending
 *   POST /users-data/mfa/disable  removes every second factor and revokes sessions
 *
 * Deletion and MFA removal need a sign-in within the last 10 minutes
 * (backend/security/policy.js); older sessions get 403 RECENT_AUTH_REQUIRED.
 * Profile keys are the backend's own (backend/services/profileSanitizer.js):
 * any other key is rejected with 400 UNSUPPORTED_PROFILE_FIELD, and the same
 * keys are read by the resume builder (lib/master-profile.ts) and cover letters.
 */
import axios from 'axios';
import { apiClient, normalizeError } from '@/lib/api-client';

export type ProfileFieldKey =
  | 'firstname' | 'lastname' | 'occupation' | 'phone' | 'address' | 'city'
  | 'postalCode' | 'country' | 'websiteUrl' | 'linkedinUrl' | 'githubUrl' | 'summary';

export interface ProfileFieldSpec {
  key: ProfileFieldKey;
  label: string;
  /** The backend's limit for this field (profileSanitizer SIMPLE_LIMITS). */
  maxLength: number;
  kind: 'text' | 'tel' | 'url' | 'multiline';
  autoComplete?: string;
  required?: boolean;
  hint?: string;
}

/** The Master Profile contact fields the legacy settings edited, in display order. */
export const PROFILE_FIELDS: readonly ProfileFieldSpec[] = [
  { key: 'firstname', label: 'First name', maxLength: 120, kind: 'text', autoComplete: 'given-name', required: true },
  { key: 'lastname', label: 'Last name', maxLength: 120, kind: 'text', autoComplete: 'family-name' },
  { key: 'occupation', label: 'Professional headline', maxLength: 255, kind: 'text', autoComplete: 'organization-title', hint: 'Shown under your name, for example "Senior Data Analyst".' },
  { key: 'phone', label: 'Phone', maxLength: 50, kind: 'tel', autoComplete: 'tel' },
  { key: 'address', label: 'Street address', maxLength: 500, kind: 'text', autoComplete: 'street-address' },
  { key: 'city', label: 'City', maxLength: 100, kind: 'text', autoComplete: 'address-level2' },
  { key: 'postalCode', label: 'Postal code', maxLength: 32, kind: 'text', autoComplete: 'postal-code' },
  { key: 'country', label: 'Country', maxLength: 100, kind: 'text', autoComplete: 'country-name' },
  { key: 'websiteUrl', label: 'Website', maxLength: 1024, kind: 'url', autoComplete: 'url' },
  { key: 'linkedinUrl', label: 'LinkedIn profile', maxLength: 1024, kind: 'url' },
  { key: 'githubUrl', label: 'GitHub profile', maxLength: 1024, kind: 'url' },
  { key: 'summary', label: 'Professional summary', maxLength: 5000, kind: 'multiline', hint: 'Used as the summary when a resume is started from your Master Profile.' },
];

export type ProfileFields = Record<ProfileFieldKey, string>;

export interface ProfileSnapshot {
  fields: ProfileFields;
  /** The identity email; read-only here (it belongs to the sign-in provider). */
  email: string;
  revision: number;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function emptyProfileFields(): ProfileFields {
  return Object.fromEntries(PROFILE_FIELDS.map((field) => [field.key, ''])) as ProfileFields;
}

/** Map the backend projection (`user.profile`) onto the editable fields. */
export function toProfileFields(profile: unknown): ProfileFields {
  const source = profile && typeof profile === 'object' ? (profile as Record<string, unknown>) : {};
  return Object.fromEntries(PROFILE_FIELDS.map((field) => [field.key, text(source[field.key])])) as ProfileFields;
}

/**
 * The fields the user actually changed (trimmed) relative to the version the
 * form was loaded from. Saving only these lets the server merge them onto a
 * newer version without reverting fields another tab or device changed.
 */
export function changedProfileFields(draft: ProfileFields, baseline: ProfileFields): Partial<ProfileFields> {
  return Object.fromEntries(PROFILE_FIELDS
    .filter((field) => draft[field.key].trim() !== baseline[field.key].trim())
    .map((field) => [field.key, draft[field.key].trim()]));
}

function isWebUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return Boolean(url.hostname) && url.hostname.includes('.');
  } catch {
    return false;
  }
}

/** Client checks that mirror the server limits; returns a message per invalid field. */
export function validateProfile(fields: ProfileFields): Partial<Record<ProfileFieldKey, string>> {
  const errors: Partial<Record<ProfileFieldKey, string>> = {};
  for (const field of PROFILE_FIELDS) {
    const value = fields[field.key].trim();
    if (field.required && !value) errors[field.key] = `Enter your ${field.label.toLowerCase()}.`;
    else if (value.length > field.maxLength) errors[field.key] = `${field.label} can be at most ${field.maxLength} characters.`;
    else if (field.kind === 'url' && value && !isWebUrl(value)) errors[field.key] = 'Enter a full web address that starts with https://';
  }
  return errors;
}

export class AccountApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  /** 409 PROFILE_CONFLICT only: the stored revision and profile that won. */
  readonly remote: ProfileSnapshot | null;

  constructor(status: number, code: string, message: string, extra: { requestId?: string | null; remote?: ProfileSnapshot | null } = {}) {
    super(message);
    this.name = 'AccountApiError';
    this.status = status;
    this.code = code;
    this.requestId = extra.requestId ?? null;
    this.remote = extra.remote ?? null;
  }

  /** The server wants a sign-in from the last few minutes before this operation. */
  get needsRecentSignIn(): boolean {
    return this.code === 'RECENT_AUTH_REQUIRED';
  }
}

export function toAccountError(error: unknown, email = ''): AccountApiError {
  if (error instanceof AccountApiError) return error;
  if (axios.isCancel(error)) return new AccountApiError(0, 'CANCELLED', 'The request was cancelled.');
  const normalized = normalizeError(error);
  if (normalized.status === 0) {
    const message = normalized.code === 'NETWORK_ERROR'
      ? 'The server could not be reached. Check your connection and try again.'
      : normalized.message;
    return new AccountApiError(0, normalized.code, message);
  }
  const details = (normalized.details && typeof normalized.details === 'object' ? normalized.details : {}) as {
    requestId?: unknown; remoteRevision?: unknown; remoteProfile?: unknown; error?: { requestId?: unknown };
  };
  const requestId = text(details.requestId) || text(details.error?.requestId) || null;
  const remote = normalized.status === 409 && details.remoteRevision !== undefined
    ? { fields: toProfileFields(details.remoteProfile), email, revision: Number(details.remoteRevision) || 0 }
    : null;
  // normalizeError reports NETWORK_ERROR when a response carries no code; name those by status.
  const code = normalized.code === 'NETWORK_ERROR' ? `HTTP_${normalized.status}` : normalized.code;
  return new AccountApiError(normalized.status, code, normalized.message, { requestId, remote });
}

interface ProfileResponse { user?: { revision?: unknown; email?: unknown; profile?: Record<string, unknown> } }

function toSnapshot(body: ProfileResponse): ProfileSnapshot {
  const user = body?.user;
  if (!user || typeof user !== 'object') throw new AccountApiError(502, 'PROFILE_RESPONSE_INVALID', 'The server returned an unexpected profile response.');
  return {
    fields: toProfileFields(user.profile),
    email: text(user.profile?.email) || text(user.email),
    revision: Number(user.revision ?? user.profile?.revision ?? 0) || 0,
  };
}

export async function fetchProfile(signal?: AbortSignal): Promise<ProfileSnapshot> {
  try {
    const response = await apiClient.get<ProfileResponse>('/users-data/profile', { signal });
    return toSnapshot(response.data);
  } catch (error) {
    throw toAccountError(error);
  }
}

/** Save the changed fields on top of `expectedRevision`; resolves with the merged, stored profile. */
export async function saveProfile(changes: Partial<ProfileFields>, expectedRevision: number, email: string): Promise<ProfileSnapshot> {
  const profile = Object.fromEntries(PROFILE_FIELDS
    .filter((field) => typeof changes[field.key] === 'string')
    .map((field) => [field.key, (changes[field.key] as string).trim()]));
  try {
    const response = await apiClient.post<ProfileResponse>('/users-data/profile', { expectedRevision, profile });
    return toSnapshot(response.data);
  } catch (error) {
    throw toAccountError(error, email);
  }
}

export interface ExportWarning { section: string; status: string; message: string }

export interface DataExport {
  fileName: string;
  /** Pretty-printed JSON exactly as the server assembled it. */
  json: string;
  warnings: ExportWarning[];
}

export async function requestDataExport(today = new Date()): Promise<DataExport> {
  try {
    const response = await apiClient.post<{ export?: Record<string, unknown> }>('/account/export', {});
    const archive = response.data?.export;
    if (!archive || typeof archive !== 'object') throw new AccountApiError(502, 'EXPORT_RESPONSE_INVALID', 'The server returned an unexpected export response.');
    const warnings = Array.isArray(archive.exportWarnings)
      ? (archive.exportWarnings as unknown[]).map((entry) => {
        const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
        return { section: text(item.section), status: text(item.status), message: text(item.message) };
      })
      : [];
    return {
      fileName: `personal-data-export-${today.toISOString().slice(0, 10)}.json`,
      json: JSON.stringify(archive, null, 2),
      warnings,
    };
  } catch (error) {
    throw toAccountError(error);
  }
}

/** Resolves when the account is fully deleted; rejects with the server's outcome otherwise. */
export async function requestAccountDeletion(): Promise<void> {
  try {
    await apiClient.post('/account/delete', {});
  } catch (error) {
    throw toAccountError(error);
  }
}

export async function disableTwoFactor(): Promise<number> {
  try {
    const response = await apiClient.post<{ removedFactorCount?: unknown }>('/users-data/mfa/disable', {});
    return Number(response.data?.removedFactorCount ?? 0) || 0;
  } catch (error) {
    throw toAccountError(error);
  }
}
