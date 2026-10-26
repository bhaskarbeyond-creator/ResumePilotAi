/**
 * The user directory's wire model, and the adapter between it and the console.
 *
 * `GET /api/admin/users` returns `adminUserProjection(...)` rows (backend/routes/adminUsers.js
 * line 102): `suspended`, `identityStatus`, `membership`, `primaryTenant`, `aiQuotaOverride`,
 * `lastLoginAt`. This component used to assign that payload straight into a differently shaped
 * `AdminUserRecord[]` through a generic, so the table rendered `undefined` for status, plan and
 * last login while looking like real data. Fields the directory endpoint genuinely does not
 * return (`resumeCount`, `usedToday`) are `null` here — the User 360 drawer loads them from
 * `GET /api/admin/users/:uid/details`, which does return them.
 */

/** Roles the platform recognises. `SUPER_ADMIN` is claim-only: no API can grant it. */
export type PlatformRole =
  | 'USER'
  | 'EMPLOYER'
  | 'RECRUITER'
  | 'SUPPORT'
  | 'AUDITOR'
  | 'ENTERPRISE_ADMIN'
  | 'ENTERPRISE_MEMBER'
  | 'ADMIN'
  | 'SUPER_ADMIN';

const ROLES: readonly PlatformRole[] = [
  'USER',
  'EMPLOYER',
  'RECRUITER',
  'SUPPORT',
  'AUDITOR',
  'ENTERPRISE_ADMIN',
  'ENTERPRISE_MEMBER',
  'ADMIN',
  'SUPER_ADMIN',
];

/**
 * Roles an operator may assign through `PATCH /api/admin/users/:uid`.
 * `SUPER_ADMIN` is absent by design: the endpoint answers 400 `SUPER_ADMIN_ROLE_FORBIDDEN`,
 * and the previous picker offered it anyway, so every attempt failed after the click.
 */
export const ASSIGNABLE_ROLES: readonly PlatformRole[] = ROLES.filter((role) => role !== 'SUPER_ADMIN');

export function isAssignableRole(value: string): value is PlatformRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

export type AccountStatus = 'active' | 'suspended' | 'pending';

/** One row as the API returns it (`adminUserProjection`). */
export interface AdminDirectoryRow {
  id: string;
  userId?: string;
  email?: string | null;
  displayName?: string | null;
  role?: string;
  suspended?: boolean;
  identityStatus?: string;
  membership?: string;
  membershipEnds?: string | null;
  paymentStatus?: string;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
  primaryTenant?: {
    id?: string;
    displayName?: string;
    slug?: string;
    role?: string;
  } | null;
  tenantMemberships?: Array<{ tenantId?: string; displayName?: string; slug?: string; roles?: string[] }>;
  tenantCount?: number;
  aiQuotaOverride?: { dailyLimit?: number; maxTokens?: number; expiresAt?: string | null } | null;
  createdAt?: string | null;
  lastLoginAt?: string | null;
  revision?: number;
}

/** One row as the console renders it. */
export interface AdminUserRecord {
  id: string;
  email: string;
  displayName: string;
  role: PlatformRole;
  status: AccountStatus;
  /** Already humanised and timezone-localised; `never` when the identity never signed in. */
  lastLogin: string;
  createdAt: string;
  /** `null` when the directory endpoint does not return it (see the file header). */
  resumeCount: number | null;
  membership: string;
  membershipEnds: string | null;
  tenantMembership: string;
  tenantCount: number;
  /** Configured override, or `null` when the account inherits the plan quota. */
  aiDailyLimit: number | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  revision: number;
}

const DAY_MS = 86_400_000;

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Relative for the first day, then a calendar date. An operator scanning the directory cares
 * about "is this account in use", not about second-precision; the exact timestamp is in the
 * `title` attribute at the call site.
 */
export function formatLastSeen(iso: string | null | undefined, now: Date = new Date()): string {
  const seen = parseIso(iso);
  if (!seen) return 'never';
  const elapsed = now.getTime() - seen.getTime();
  if (elapsed < 0) return seen.toISOString().slice(0, 10);
  if (elapsed < 60_000) return 'just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / 3_600_000)} h ago`;
  if (elapsed < 7 * DAY_MS) return `${Math.floor(elapsed / DAY_MS)} d ago`;
  return seen.toISOString().slice(0, 10);
}

export function formatCreated(iso: string | null | undefined): string {
  const created = parseIso(iso);
  return created ? created.toISOString().slice(0, 10) : 'unknown';
}

/**
 * Identity status is three-valued in MariaDB/Firebase terms (`ACTIVE`, `MISSING`) and
 * two-valued on the identity provider (`disabled`). The console needs one word:
 * suspended wins, a missing identity is `pending` (profile without credentials), else active.
 */
export function deriveStatus(row: AdminDirectoryRow): AccountStatus {
  if (row.suspended === true) return 'suspended';
  if (String(row.identityStatus || '').toUpperCase() === 'MISSING') return 'pending';
  return 'active';
}

export function toAdminUserRecord(row: AdminDirectoryRow, now: Date = new Date()): AdminUserRecord {
  const rawRole = String(row.role || 'USER').toUpperCase();
  const role = (ROLES as readonly string[]).includes(rawRole) ? (rawRole as PlatformRole) : 'USER';
  const primary = row.primaryTenant ?? null;
  const tenantLabel = primary
    ? `${primary.displayName || primary.slug || primary.id || 'Organization'}${
        primary.role ? ` (${primary.role})` : ''
      }`
    : 'No organization';
  return {
    id: String(row.id),
    email: row.email ?? '(identity has no email)',
    displayName: row.displayName ?? '(no display name)',
    role,
    status: deriveStatus(row),
    lastLogin: formatLastSeen(row.lastLoginAt, now),
    createdAt: formatCreated(row.createdAt),
    resumeCount: null,
    membership: row.membership || 'Basic',
    membershipEnds: row.membershipEnds ?? null,
    tenantMembership: tenantLabel,
    tenantCount: Number(row.tenantCount || (row.tenantMemberships?.length ?? 0)),
    aiDailyLimit: row.aiQuotaOverride?.dailyLimit ?? null,
    emailVerified: row.emailVerified === true,
    mfaEnabled: row.mfaEnabled === true,
    revision: Number(row.revision || 0),
  };
}

/** `GET /api/admin/users` envelope. */
export interface AdminDirectoryPayload {
  success?: boolean;
  users?: AdminDirectoryRow[];
  nextPageToken?: string | null;
  pageSize?: number;
  filteredCount?: number;
  source?: string;
  generatedAt?: string;
}

export function readDirectory(payload: AdminDirectoryPayload | null): AdminUserRecord[] {
  const rows = Array.isArray(payload?.users) ? payload.users : [];
  const now = new Date();
  return rows.filter((row) => row && row.id).map((row) => toAdminUserRecord(row, now));
}

/** The subset of User 360 the drawer renders. Optional throughout: an absent service
 * (MariaDB down, tenant registry unavailable) narrows the drawer, it does not break it. */
export interface User360Payload {
  user360?: {
    identity?: AdminDirectoryRow;
    security?: { mfaEnabled?: boolean; emailVerified?: boolean; suspended?: boolean };
    tenancy?: {
      memberships?: Array<{
        tenantId?: string;
        id?: string;
        displayName?: string;
        slug?: string;
        roles?: string[];
      }>;
    };
    aiEntitlement?: {
      plan?: string;
      baseQuota?: number;
      effectiveLimit?: number;
      usedToday?: number;
      remainingToday?: number;
      customOverride?: { dailyLimit?: number } | null;
    };
    content?: {
      resumeCount?: number;
      portfolioCount?: number;
      coverCount?: number;
      resumes?: Array<{ id: string; title?: string; template?: string; updatedAt?: string | null }>;
    };
    auditTimeline?: Array<{ id: string; action?: string; createdAt?: string | null; severity?: string }>;
  };
}

export interface User360View {
  profile: AdminUserRecord | null;
  mfaEnabled: boolean;
  emailVerified: boolean;
  suspended: boolean;
  memberships: Array<{ id: string; displayName: string; slug: string; roles: string[] }>;
  ai: {
    plan: string;
    effectiveLimit: number | null;
    usedToday: number | null;
    customLimit: number | null;
  };
  content: {
    resumeCount: number;
    portfolioCount: number;
    coverCount: number;
    resumes: Array<{ id: string; title: string; template: string; updatedAt: string }>;
  };
  timeline: Array<{ id: string; action: string; createdAt: string; severity: string }>;
}

export function readUser360(payload: User360Payload | null): User360View {
  const view = payload?.user360;
  const identity = view?.identity;
  const numberOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    profile: identity ? toAdminUserRecord(identity) : null,
    mfaEnabled: view?.security?.mfaEnabled === true || identity?.mfaEnabled === true,
    emailVerified: view?.security?.emailVerified === true || identity?.emailVerified === true,
    suspended: view?.security?.suspended === true || identity?.suspended === true,
    memberships: (view?.tenancy?.memberships ?? []).map((membership) => ({
      id: String(membership.tenantId || membership.id || ''),
      displayName: membership.displayName || membership.slug || String(membership.tenantId || 'Organization'),
      slug: membership.slug || String(membership.tenantId || ''),
      roles: Array.isArray(membership.roles) ? membership.roles.map(String) : [],
    })).filter((membership) => membership.id !== ''),
    ai: {
      plan: view?.aiEntitlement?.plan || 'Basic',
      effectiveLimit: numberOrNull(view?.aiEntitlement?.effectiveLimit),
      usedToday: numberOrNull(view?.aiEntitlement?.usedToday),
      customLimit: numberOrNull(view?.aiEntitlement?.customOverride?.dailyLimit),
    },
    content: {
      resumeCount: Number(view?.content?.resumeCount || 0),
      portfolioCount: Number(view?.content?.portfolioCount || 0),
      coverCount: Number(view?.content?.coverCount || 0),
      resumes: (view?.content?.resumes ?? []).map((resume) => ({
        id: String(resume.id),
        title: resume.title || 'Untitled resume',
        template: resume.template || 'unknown',
        updatedAt: resume.updatedAt || '',
      })),
    },
    timeline: (view?.auditTimeline ?? []).map((entry) => ({
      id: String(entry.id),
      action: entry.action || 'ADMIN_ACTION',
      createdAt: entry.createdAt || '',
      severity: entry.severity || 'INFO',
    })),
  };
}

/** `GET /api/enterprise/tenants` — the organizations this operator can assign into. */
export interface TenantOption {
  id: string;
  displayName: string;
  slug: string;
  lifecycleState: string;
}

export function readTenantOptions(payload: unknown): TenantOption[] {
  const rows = (payload as { tenants?: unknown })?.tenants;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      id: String(row.id ?? ''),
      displayName: String(row.displayName ?? row.slug ?? row.id ?? 'Organization'),
      slug: String(row.slug ?? row.id ?? ''),
      lifecycleState: String(row.lifecycleState ?? 'ACTIVE'),
    }))
    .filter((option) => option.id !== '');
}

/**
 * Save a file the server produced. Used by the GDPR export: the browser must download the
 * bundle the server assembled, not a JSON blob the console built out of whatever it had in
 * memory (the previous implementation exported the table row, including fabricated fields).
 */
export function downloadJson(filename: string, body: unknown): void {
  const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
