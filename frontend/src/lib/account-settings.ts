/**
 * Typed client for the signed-in user's own account (candidate Settings), through
 * the shared apiClient (base URL /api, Bearer token, refresh).
 *
 *   GET  /users-data/profile      { success, user: { revision, profile } }: the Master Profile
 *                                 projection; 404 PROFILE_NOT_FOUND before the first save
 *   POST /users-data/profile      { expectedRevision, profile }: the sent fields are merged onto
 *                                 the stored profile; a missing profile row has revision 0.
 *                                 409 PROFILE_CONFLICT carries remoteRevision and remoteProfile
 *                                 (remoteProfile may be null when the reload failed)
 *   POST /account/export          { success, export }: owner-scoped JSON archive, with
 *                                 export.exportWarnings [{ section, status, message }]
 *   POST /account/delete          { success: true } only when the saga completed.
 *                                 503 ACCOUNT_IDENTITY_DELETE_FAILED means the personal data is
 *                                 gone and only identity removal is pending. Re-sending the same
 *                                 request is the documented retry: the saga's durable ledger
 *                                 (backend/services/accountDeletion.js) skips the data step when
 *                                 the state is IDENTITY_PENDING and answers success when COMPLETED
 *   POST /users-data/mfa/disable  { success, removedFactorCount }: removes every second factor
 *                                 and revokes every session
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
  { key: 'phone', label: 'Phone', maxLength: 50, kind: 'tel', autoComplete: 'tel', hint: 'Include the country code for international numbers, for example +91 98765 43210.' },
  { key: 'address', label: 'Street address', maxLength: 500, kind: 'text', autoComplete: 'street-address' },
  { key: 'city', label: 'City', maxLength: 100, kind: 'text', autoComplete: 'address-level2' },
  { key: 'postalCode', label: 'Postal code', maxLength: 32, kind: 'text', autoComplete: 'postal-code' },
  { key: 'country', label: 'Country', maxLength: 100, kind: 'text', autoComplete: 'country-name' },
  { key: 'websiteUrl', label: 'Website', maxLength: 1024, kind: 'url', autoComplete: 'url' },
  { key: 'linkedinUrl', label: 'LinkedIn profile', maxLength: 1024, kind: 'url' },
  { key: 'githubUrl', label: 'GitHub profile', maxLength: 1024, kind: 'url' },
  { key: 'summary', label: 'Professional summary', maxLength: 5000, kind: 'multiline', hint: 'Used as the summary when a resume is started from your Master Profile.' },
];

const SPEC_BY_KEY = Object.fromEntries(PROFILE_FIELDS.map((field) => [field.key, field])) as Record<ProfileFieldKey, ProfileFieldSpec>;

export type ProfileFields = Record<ProfileFieldKey, string>;

export interface ProfileSnapshot {
  fields: ProfileFields;
  /** The identity email; read-only here (it belongs to the sign-in provider). */
  email: string;
  revision: number;
}

/** What a 409 PROFILE_CONFLICT says about the version that won. */
export interface ProfileConflict {
  /** The stored revision the next save must name, or null when the server did not report it. */
  revision: number | null;
  /** The stored profile, or null when the server could not read it back. */
  fields: ProfileFields | null;
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
 * Whitespace normalisation used for comparison and for the values sent:
 * single-line fields are trimmed and inner runs of whitespace collapse to one
 * space; the multi-line summary keeps its line breaks (CRLF becomes LF) and
 * is only trimmed at the ends. Nothing else about a value is changed.
 */
export function normalizeProfileValue(key: ProfileFieldKey, value: unknown): string {
  const raw = text(value);
  if (SPEC_BY_KEY[key]?.kind === 'multiline') return raw.replace(/\r\n?/g, '\n').trim();
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * The fields the user actually changed (normalised) relative to the version
 * the form was loaded from. Neither argument is modified. Saving only these
 * lets the server merge them onto the stored version without reverting
 * fields that were not edited here.
 */
export function changedProfileFields(draft: ProfileFields, baseline: ProfileFields): Partial<ProfileFields> {
  return Object.fromEntries(PROFILE_FIELDS
    .filter((field) => normalizeProfileValue(field.key, draft[field.key]) !== normalizeProfileValue(field.key, baseline[field.key]))
    .map((field) => [field.key, normalizeProfileValue(field.key, draft[field.key])]));
}

function isWebUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return Boolean(url.hostname) && url.hostname.includes('.') && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * International-friendly phone check: digits with optional leading "+",
 * spaces, dots, dashes and parentheses, 7–15 digits in total (the E.164
 * maximum), and an optional extension ("ext 12", "x12", "#12"). No single
 * country's format is assumed.
 */
export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const withoutExtension = trimmed.replace(/\s*(?:ext\.?|extension|x|#)\s*\d{1,6}$/i, '');
  if (!/^\+?[\d\s().-]+$/.test(withoutExtension)) return false;
  if ((withoutExtension.match(/\(/g)?.length ?? 0) !== (withoutExtension.match(/\)/g)?.length ?? 0)) return false;
  const digits = withoutExtension.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

/** Client checks that mirror the server limits; returns a message per invalid field. */
export function validateProfile(fields: ProfileFields): Partial<Record<ProfileFieldKey, string>> {
  const errors: Partial<Record<ProfileFieldKey, string>> = {};
  for (const field of PROFILE_FIELDS) {
    const value = normalizeProfileValue(field.key, fields[field.key]);
    if (field.required && !value) errors[field.key] = `Enter your ${field.label.toLowerCase()}.`;
    else if (value.length > field.maxLength) errors[field.key] = `${field.label} can be at most ${field.maxLength} characters.`;
    else if (field.kind === 'url' && value && !isWebUrl(value)) errors[field.key] = 'Enter a full web address that starts with https://';
    else if (field.kind === 'tel' && value && !isValidPhone(value)) errors[field.key] = 'Enter a phone number with 7 to 15 digits, for example +91 98765 43210.';
  }
  return errors;
}

export class AccountApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  /** 409 PROFILE_CONFLICT only: the stored revision and profile that won. */
  readonly remote: ProfileConflict | null;

  constructor(status: number, code: string, message: string, extra: { requestId?: string | null; remote?: ProfileConflict | null } = {}) {
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

  get isProfileConflict(): boolean {
    return this.status === 409 && this.code === 'PROFILE_CONFLICT';
  }
}

/** Extract the winning version from a 409 body; malformed parts become null, never guesses. */
export function parseProfileConflict(details: unknown): ProfileConflict {
  const body = (details && typeof details === 'object' ? details : {}) as { remoteRevision?: unknown; remoteProfile?: unknown };
  const revision = typeof body.remoteRevision === 'number' && Number.isSafeInteger(body.remoteRevision) && body.remoteRevision >= 0
    ? body.remoteRevision
    : typeof body.remoteRevision === 'string' && /^\d+$/.test(body.remoteRevision) ? Number(body.remoteRevision) : null;
  const fields = body.remoteProfile && typeof body.remoteProfile === 'object' && !Array.isArray(body.remoteProfile)
    ? toProfileFields(body.remoteProfile)
    : null;
  return { revision, fields };
}

export function toAccountError(error: unknown): AccountApiError {
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
    requestId?: unknown; error?: { requestId?: unknown };
  };
  const requestId = text(details.requestId) || text(details.error?.requestId) || null;
  // normalizeError reports NETWORK_ERROR when a response carries no code; name those by status.
  const code = normalized.code === 'NETWORK_ERROR' ? `HTTP_${normalized.status}` : normalized.code;
  const remote = normalized.status === 409 && code === 'PROFILE_CONFLICT' ? parseProfileConflict(normalized.details) : null;
  return new AccountApiError(normalized.status, code, normalized.message, { requestId, remote });
}

interface ProfileResponse { success?: unknown; user?: { revision?: unknown; email?: unknown; profile?: Record<string, unknown> } }

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

/** The exact request body for a profile save: only known keys, normalised, plus the revision it builds on. */
export function profileSaveEnvelope(changes: Partial<ProfileFields>, expectedRevision: number): { expectedRevision: number; profile: Partial<ProfileFields> } {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new AccountApiError(0, 'PROFILE_REVISION_INVALID', 'The profile version is unknown. Reload your Master Profile and try again.');
  }
  const profile = Object.fromEntries(PROFILE_FIELDS
    .filter((field) => typeof changes[field.key] === 'string')
    .map((field) => [field.key, normalizeProfileValue(field.key, changes[field.key])])) as Partial<ProfileFields>;
  return { expectedRevision, profile };
}

/** Save the changed fields on top of `expectedRevision`; resolves with the merged, stored profile. */
export async function saveProfile(changes: Partial<ProfileFields>, expectedRevision: number): Promise<ProfileSnapshot> {
  const envelope = profileSaveEnvelope(changes, expectedRevision);
  try {
    const response = await apiClient.post<ProfileResponse>('/users-data/profile', envelope);
    return toSnapshot(response.data);
  } catch (error) {
    throw toAccountError(error);
  }
}

/**
 * Store the names typed at registration in the Master Profile, after the
 * identity exists. The revision comes from the server (404 PROFILE_NOT_FOUND
 * means no row yet, i.e. revision 0); nothing is guessed. Rejects with
 * AccountApiError when the server refuses, so the caller can say so.
 */
export async function syncRegistrationProfile(firstname: string, lastname: string): Promise<'saved' | 'skipped'> {
  const changes: Partial<ProfileFields> = {};
  const first = normalizeProfileValue('firstname', firstname);
  const last = normalizeProfileValue('lastname', lastname);
  if (first) changes.firstname = first;
  if (last) changes.lastname = last;
  if (!first && !last) return 'skipped';
  let revision = 0;
  try {
    revision = (await fetchProfile()).revision;
  } catch (error) {
    const failure = toAccountError(error);
    if (!(failure.status === 404 && failure.code === 'PROFILE_NOT_FOUND')) throw failure;
  }
  await saveProfile(changes, revision);
  return 'saved';
}

/**
 * A one-time marker (sessionStorage, this tab only) that registration created
 * the account but could not store the typed names. It holds no names, email
 * or credential, only the fact, so Settings → Master Profile can say so.
 */
export const REGISTRATION_PROFILE_SYNC_KEY = 'ime365_registration_profile_sync';

function sessionStore(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function markRegistrationProfileSyncFailed(storage: Storage | null = sessionStore()): void {
  try { storage?.setItem(REGISTRATION_PROFILE_SYNC_KEY, 'failed'); } catch { /* storage unavailable */ }
}

export function readRegistrationProfileSyncFailed(storage: Storage | null = sessionStore()): boolean {
  try { return storage?.getItem(REGISTRATION_PROFILE_SYNC_KEY) === 'failed'; } catch { return false; }
}

export function clearRegistrationProfileSyncFlag(storage: Storage | null = sessionStore()): void {
  try { storage?.removeItem(REGISTRATION_PROFILE_SYNC_KEY); } catch { /* storage unavailable */ }
}

/* ───────────────────────────── Data export ───────────────────────────── */

export interface ExportWarning { section: string; status: string; message: string }

export interface DataExport {
  fileName: string;
  /** Pretty-printed JSON exactly as the server assembled it. */
  json: string;
  mimeType: 'application/json';
  warnings: ExportWarning[];
}

export const EXPORT_MIME_TYPE = 'application/json' as const;

/** ime365-data-export-YYYY-MM-DD.json, using the local calendar date at the time of export. */
export function exportFileName(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `ime365-data-export-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/**
 * Warnings the server attached to the archive. Entries without a section name
 * are dropped (nothing is invented); a non-array value means "no warnings".
 */
export function parseExportWarnings(value: unknown): ExportWarning[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const section = text(item.section).trim();
    if (!section) return [];
    return [{
      section,
      status: text(item.status).trim() || 'UNAVAILABLE',
      message: text(item.message).trim() || 'This section could not be exported.',
    }];
  });
}

/** Validate the export response and serialise it for download. */
export function buildDataExport(body: unknown, today: Date = new Date()): DataExport {
  const envelope = (body && typeof body === 'object' ? body : {}) as { success?: unknown; export?: unknown };
  const archive = envelope.export;
  if (envelope.success === false || !archive || typeof archive !== 'object' || Array.isArray(archive)) {
    throw new AccountApiError(502, 'EXPORT_RESPONSE_INVALID', 'The server returned an unexpected export response.');
  }
  return {
    fileName: exportFileName(today),
    json: JSON.stringify(archive, null, 2),
    mimeType: EXPORT_MIME_TYPE,
    warnings: parseExportWarnings((archive as Record<string, unknown>).exportWarnings),
  };
}

export async function requestDataExport(today: Date = new Date()): Promise<DataExport> {
  try {
    const response = await apiClient.post('/account/export', {});
    return buildDataExport(response.data, today);
  } catch (error) {
    throw toAccountError(error);
  }
}

/* ───────────────────────────── Account deletion ───────────────────────────── */

export const DELETION_CONFIRMATION_WORD = 'DELETE';

/** Exact, case-sensitive match; nothing is trimmed or folded. */
export function isDeletionConfirmed(typed: unknown): boolean {
  return typed === DELETION_CONFIRMATION_WORD;
}

export type DeletionOutcome = 'identity-pending' | 'recent-auth' | 'unconfirmed' | 'failed';

/** What a failed deletion request means for the account. */
export function classifyDeletionFailure(error: unknown): DeletionOutcome {
  const failure = toAccountError(error);
  if (failure.status === 503 && failure.code === 'ACCOUNT_IDENTITY_DELETE_FAILED') return 'identity-pending';
  if (failure.needsRecentSignIn) return 'recent-auth';
  if (failure.code === 'ACCOUNT_DELETE_UNCONFIRMED') return 'unconfirmed';
  return 'failed';
}

/**
 * Resolves only when the server confirms the deletion finished
 * (`success: true`); any other answer rejects, so the UI never reports a
 * deletion the server did not confirm.
 */
export async function requestAccountDeletion(): Promise<void> {
  let body: unknown;
  try {
    body = (await apiClient.post('/account/delete', {})).data;
  } catch (error) {
    throw toAccountError(error);
  }
  if (!body || typeof body !== 'object' || (body as { success?: unknown }).success !== true) {
    throw new AccountApiError(200, 'ACCOUNT_DELETE_UNCONFIRMED', 'The server did not confirm that your account was deleted.');
  }
}

/**
 * Browser storage keys this app writes for a signed-in candidate (beyond the
 * session keys that sign-out already clears). Device preferences such as the
 * colour theme are kept; keys owned by other sites or apps are never touched.
 */
const ACCOUNT_LOCAL_KEYS = ['currentResumeId', 'activeTenantId', 'selectedTenantId'];
const ACCOUNT_LOCAL_PREFIXES = ['rp_recent_'];
const ACCOUNT_SESSION_KEYS = ['rpai.ats.targetJd', 'activeTenantId', 'superadmin_role_view'];
const ACCOUNT_SESSION_PREFIXES = ['workspace_'];

function clearKeys(storage: Storage | null | undefined, keys: string[], prefixes: string[]): string[] {
  if (!storage) return [];
  const removed: string[] = [];
  try {
    const all = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key));
    for (const key of all) {
      if (keys.includes(key) || prefixes.some((prefix) => key.startsWith(prefix))) {
        storage.removeItem(key);
        removed.push(key);
      }
    }
  } catch {
    // Storage unavailable (private mode); nothing to clear.
  }
  return removed;
}

/** Remove this account's app-owned browser state after a confirmed deletion. Returns the removed keys. */
export function clearAccountLocalState(local: Storage | null | undefined, session: Storage | null | undefined): string[] {
  return [
    ...clearKeys(local, ACCOUNT_LOCAL_KEYS, ACCOUNT_LOCAL_PREFIXES),
    ...clearKeys(session, ACCOUNT_SESSION_KEYS, ACCOUNT_SESSION_PREFIXES),
  ];
}

/* ───────────────────────────── Two-factor removal ───────────────────────────── */

/** Resolves with the number of removed factors once the server confirms the removal. */
export async function disableTwoFactor(): Promise<number> {
  let body: { success?: unknown; removedFactorCount?: unknown } | undefined;
  try {
    body = (await apiClient.post<{ success?: unknown; removedFactorCount?: unknown }>('/users-data/mfa/disable', {})).data;
  } catch (error) {
    throw toAccountError(error);
  }
  if (!body || body.success !== true) {
    throw new AccountApiError(200, 'MFA_DISABLE_UNCONFIRMED', 'The server did not confirm that two-factor authentication was turned off.');
  }
  return Number(body.removedFactorCount ?? 0) || 0;
}
