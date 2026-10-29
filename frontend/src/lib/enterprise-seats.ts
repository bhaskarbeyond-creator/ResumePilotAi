import { apiClient, normalizeError, type ApiError } from '@/lib/api-client';
import type { EnterpriseMembership } from '@/lib/enterprise-api';

export type AssignableInviteRole = 'ADMIN' | 'MEMBER' | 'VIEWER' | 'OWNER';

export interface SeatQuota {
  seatLimit: number;
  seatsUsed: number;
  seatsRemaining: number;
  pendingInvites: number;
}

export type SeatCapacityTone = 'emerald' | 'amber' | 'crimson';

export interface SeatUtilizationMetrics {
  percent: number;
  barWidthPercent: number;
  tone: SeatCapacityTone;
  statusLabel: string;
  atCapacity: boolean;
}

export interface InviteMemberInput {
  email: string;
  role: AssignableInviteRole;
}

export interface InviteMemberResult {
  email: string;
  role: AssignableInviteRole;
  status: string;
  deliveryQueued: boolean;
}

export const SEAT_LIMIT_CONFLICT_MESSAGE =
  'Workspace seat limit reached. Please upgrade your enterprise tier or revoke unused invitations.';

export const INVITE_ROLE_METADATA: Record<
  AssignableInviteRole,
  { label: string; summary: string; permissionsHint: string }
> = {
  ADMIN: {
    label: 'Admin',
    summary: 'Manage workspace members, invitations, and organization settings.',
    permissionsHint: 'Permissions: manage workspaces, invite/revoke members, view audit logs.',
  },
  MEMBER: {
    label: 'Member',
    summary: 'Create and update resumes, candidate pipelines, and AI workflows.',
    permissionsHint: 'Permissions: read/write shared workspace resources and run AI tools.',
  },
  VIEWER: {
    label: 'Viewer',
    summary: 'Read-only access to workspace records and analytics.',
    permissionsHint: 'Permissions: inspect shared resources without modification or invite rights.',
  },
  OWNER: {
    label: 'Owner',
    summary: 'Full tenant ownership, billing governance, and lifecycle authority.',
    permissionsHint: 'Permissions: unrestricted tenant, security policy, and billing control.',
  },
};

const EMAIL_SYNTAX_REGEX = /^[^\s@,;<>]{1,64}@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

/**
 * Parses `GET /api/enterprise/members/seats` without modifying the backend's
 * authoritative `seatsUsed` count.
 */
export function parseSeatQuota(payload: unknown): SeatQuota {
  if (!isRecord(payload)) {
    throw new Error('Unexpected workspace seat quota response.');
  }

  const source = isRecord(payload.seats)
    ? payload.seats
    : isRecord(payload.quota)
      ? payload.quota
      : payload;

  const seatLimit = asNonNegativeInt(source.seatLimit ?? source.seat_limit ?? source.limit);
  const seatsUsed = asNonNegativeInt(source.seatsUsed ?? source.seats_used ?? source.used);

  if (seatLimit === null || seatsUsed === null) {
    throw new Error('Seat quota response is missing required seatLimit or seatsUsed fields.');
  }

  const rawRemaining = asNonNegativeInt(
    source.seatsRemaining ?? source.seats_remaining ?? source.remaining,
  );
  const seatsRemaining = rawRemaining !== null ? rawRemaining : Math.max(0, seatLimit - seatsUsed);
  const pendingInvites =
    asNonNegativeInt(source.pendingInvites ?? source.pending_invites ?? source.invitedCount) ?? 0;

  return {
    seatLimit,
    seatsUsed,
    seatsRemaining,
    pendingInvites,
  };
}

/**
 * Computes utilization metrics safely against zero limits, NaN, or over-quota states.
 * Thresholds:
 * - `< 80%`: emerald
 * - `80%` to `99%`: amber
 * - `100%` (or `seatsUsed >= seatLimit`): crimson
 */
export function computeSeatUtilization(quota: SeatQuota): SeatUtilizationMetrics {
  const safeLimit = Number.isFinite(quota.seatLimit) && quota.seatLimit > 0 ? quota.seatLimit : 0;
  const safeUsed = Number.isFinite(quota.seatsUsed) && quota.seatsUsed > 0 ? quota.seatsUsed : 0;

  if (safeLimit === 0) {
    const atZeroCap = safeUsed > 0;
    return {
      percent: atZeroCap ? 100 : 0,
      barWidthPercent: atZeroCap ? 100 : 0,
      tone: atZeroCap ? 'crimson' : 'emerald',
      statusLabel: atZeroCap ? 'At seat capacity' : 'No seats allocated',
      atCapacity: atZeroCap,
    };
  }

  const rawRatio = (safeUsed / safeLimit) * 100;
  const atCapacity = safeUsed >= safeLimit;
  // Ensure 99.6% when safeUsed < safeLimit does not round to 100% prematurely,
  // and clamp strictly to [0, 100] for CSS progress bar widths.
  const percent = atCapacity
    ? Math.max(100, Math.round(rawRatio))
    : Math.min(99, Math.max(0, Math.round(rawRatio)));
  const barWidthPercent = Math.min(100, Math.max(0, percent));

  let tone: SeatCapacityTone = 'emerald';
  let statusLabel = 'Healthy capacity';

  if (atCapacity || percent >= 100) {
    tone = 'crimson';
    statusLabel = 'Seat capacity reached';
  } else if (percent >= 80) {
    tone = 'amber';
    statusLabel = 'Approaching seat limit';
  }

  return {
    percent,
    barWidthPercent,
    tone,
    statusLabel,
    atCapacity,
  };
}

export function normalizeInviteEmail(rawEmail: string): string {
  return rawEmail.trim().toLowerCase();
}

export function validateInviteEmail(rawEmail: string): string | null {
  const normalized = normalizeInviteEmail(rawEmail);
  if (!normalized) {
    return 'Enter your teammate’s work email address.';
  }
  if (normalized.length > 254 || !EMAIL_SYNTAX_REGEX.test(normalized)) {
    return 'Enter a valid email address (for example, teammate@company.com).';
  }
  return null;
}

export function canCallerAssignOwnerRole(callerRoles: ReadonlyArray<string>): boolean {
  return callerRoles.some((role) => {
    const normalized = String(role || '').trim().toUpperCase();
    return normalized === 'TENANT_OWNER' || normalized === 'ENTERPRISE_OWNER' || normalized === 'OWNER';
  });
}

export function isSeatLimitConflictError(error: ApiError): boolean {
  if (error.status !== 409) return false;
  const code = (error.code || '').toUpperCase();
  if (code === 'SEAT_LIMIT_REACHED' || code === 'WORKSPACE_SEAT_LIMIT_REACHED') {
    return true;
  }
  return /seat\s*limit/i.test(error.message);
}

export async function fetchSeatQuota(
  tenantId?: string | null,
  signal?: AbortSignal,
): Promise<SeatQuota> {
  const response = await apiClient.get<unknown>('/enterprise/members/seats', {
    signal,
    headers: tenantId ? { 'X-Tenant-Id': tenantId } : undefined,
  });
  return parseSeatQuota(response.data);
}

export async function inviteEnterpriseMember(
  input: InviteMemberInput,
  tenantId?: string | null,
): Promise<InviteMemberResult> {
  const email = normalizeInviteEmail(input.email);
  const validationError = validateInviteEmail(email);
  if (validationError) {
    throw new Error(validationError);
  }

  const response = await apiClient.post<unknown>(
    '/enterprise/members/invite',
    {
      email,
      role: input.role,
    },
    {
      headers: tenantId ? { 'X-Tenant-Id': tenantId } : undefined,
    },
  );

  const data = isRecord(response.data) ? response.data : {};
  const memberRecord = isRecord(data.membership)
    ? data.membership
    : isRecord(data.invitation)
      ? data.invitation
      : data;

  const returnedStatus =
    typeof memberRecord.status === 'string' && memberRecord.status.trim()
      ? memberRecord.status.trim().toUpperCase()
      : 'INVITED';

  const deliveryState = String(
    data.invitationDelivery ?? memberRecord.invitationDelivery ?? 'QUEUED',
  ).toUpperCase();

  return {
    email,
    role: input.role,
    status: returnedStatus,
    deliveryQueued: deliveryState !== 'DELIVERED' && deliveryState !== 'SENT',
  };
}

export async function fetchEnterpriseRoster(
  tenantId?: string | null,
  signal?: AbortSignal,
): Promise<EnterpriseMembership[]> {
  const response = await apiClient.get<unknown>('/enterprise/memberships', {
    signal,
    headers: tenantId ? { 'X-Tenant-Id': tenantId } : undefined,
  });
  if (!isRecord(response.data) || !Array.isArray(response.data.memberships)) {
    if (Array.isArray(response.data)) {
      return response.data as EnterpriseMembership[];
    }
    throw new Error('Unexpected enterprise memberships response.');
  }
  return response.data.memberships as EnterpriseMembership[];
}

export { normalizeError };
